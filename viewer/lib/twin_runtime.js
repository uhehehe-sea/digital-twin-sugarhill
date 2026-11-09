/*
 * twin_runtime.js — production runtime of the Sugar Hill factory twin.
 *
 *   part data (from the modeling tool) → job → machine state machine → telemetry
 *
 * Loaded two ways:
 *   - browser: <script src="/lib/twin_runtime.js"> → window.TwinRuntime
 *   - Node tests: require('../viewer/lib/twin_runtime.js')
 *
 * All process times are ASSUMED placeholder rates (see RATES). They are there so the
 * twin moves plausibly; replace them with measured values when real machines are online.
 * Nothing here talks to real equipment.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwinRuntime = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Which placed assets are production machines, and what process they run. */
  //   router : 3-axis CNC router — cuts flat panels (the sketch parts)
  //   lathe  : CNC lathe — turned (round) parts only; flat panels are rejected
  //   am     : metal powder-bed printer
  const MACHINE_KINDS = {
    cnc_router_3axis: 'router', CNC_5AXIS_MILL: 'router',
    cnc_sealjet_630pro: 'lathe', cnc_sealjet_200pro: 'lathe',
    slm_eos_m290: 'am', slm_trumpf_truprint3000: 'am', '3DP_METAL_DMLS': 'am'
  };
  const KIND_LABEL = { router: 'CNC 라우터', lathe: 'CNC 선반', am: '금속 3D 프린터' };

  /** Which part shapes a machine kind accepts. Sketch parts are flat panels. */
  function accepts(kind, part) {
    if (kind === 'lathe') return part.shape === 'turned';
    return true;
  }

  /** Assumed rates (placeholders, not machine data). */
  const RATES = {
    router: { setupS: 60, feedMmMin: 1500, stepDownMm: 3, toolChangeS: 20, loadS: 15, unloadS: 15 },
    am: { layerMm: 0.04, recoatS: 8, buildRateMm3H: 15000, warmupS: 120, loadS: 20, unloadS: 30 }
  };

  // ------------------------------------------------------------ part geometry from sketch data
  function polygonArea(v) {
    let a = 0;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) a += (v[j].x + v[i].x) * (v[j].y - v[i].y);
    return Math.abs(a / 2);
  }
  function polygonPerimeter(v) {
    let p = 0;
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; p += Math.hypot(b.x - a.x, b.y - a.y); }
    return p;
  }

  /**
   * Part data from a sketch panel (outline + through-holes + thickness), in mm.
   * Returns { name, thicknessMm, areaMm2, volumeMm3, cutLengthMm, holeCount, bboxMm:[x,y,z] }.
   */
  function partFromSketch(name, vertices, holes, thicknessMm) {
    const subs = (holes || []).filter(h => h.isSubtract);
    const holeArea = subs.reduce((s, h) => s + Math.PI * Math.pow(h.dia / 2, 2), 0);
    const area = polygonArea(vertices) - holeArea;
    const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
    return {
      name,
      shape: 'panel',
      vertices, holes: subs,
      thicknessMm,
      areaMm2: area,
      volumeMm3: area * thicknessMm,
      cutLengthMm: polygonPerimeter(vertices) + subs.reduce((s, h) => s + Math.PI * h.dia, 0),
      holeCount: subs.length,
      bboxMm: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), thicknessMm]
    };
  }

  /** Estimated cycle (seconds) of a part on a machine kind. Returns a breakdown for display. */
  function estimateCycle(part, kind) {
    if (kind === 'router') {
      const r = RATES.router;
      const passes = Math.max(1, Math.ceil(part.thicknessMm / r.stepDownMm));
      const cutS = (part.cutLengthMm * passes) / (r.feedMmMin / 60);
      const tools = part.holeCount > 0 ? 2 : 1;
      const runS = r.setupS + cutS + (tools - 1) * r.toolChangeS;
      return { kind, runS, loadS: r.loadS, unloadS: r.unloadS, passes, detail: `윤곽+구멍 ${Math.round(part.cutLengthMm)} mm × ${passes}패스 @ ${r.feedMmMin} mm/min` };
    }
    if (kind === 'am') {
      const r = RATES.am;
      const layers = Math.max(1, Math.ceil(part.bboxMm[2] / r.layerMm));
      const runS = r.warmupS + layers * r.recoatS + (part.volumeMm3 / r.buildRateMm3H) * 3600;
      return { kind, runS, loadS: r.loadS, unloadS: r.unloadS, layers, detail: `${layers}층 × 리코팅 ${r.recoatS}s + 적층 ${Math.round(part.volumeMm3 / 1000)} cm³` };
    }
    throw new Error('unknown machine kind ' + kind);
  }

  // ------------------------------------------------------------ runtime
  const PHASES = ['IDLE', 'LOADING', 'RUNNING', 'UNLOADING', 'HOLD'];

  function createRuntime() {
    const machines = new Map();       // name -> machine
    const events = [];
    let t = 0, jobSeq = 1, completed = 0, eventSeq = 0;

    // events keeps the last 500 entries; every event carries a monotonically increasing seq so consumers
    // can resume with eventsSince(lastSeq). (Index-based reading broke once the array started to shift.)
    function log(type, data) { events.push(Object.assign({ seq: ++eventSeq, t, type }, data)); if (events.length > 500) events.shift(); }
    /** Events with seq > afterSeq, oldest first (at most the retained 500). */
    function eventsSince(afterSeq) {
      if (!events.length || events[events.length - 1].seq <= afterSeq) return [];
      let i = events.length - 1;
      while (i > 0 && events[i - 1].seq > afterSeq) i--;
      return events.slice(i);
    }

    /** Register a placed asset as a machine (no-op for non-machines). */
    function registerMachine(name, assetId) {
      const kind = MACHINE_KINDS[assetId];
      if (!kind || machines.has(name)) return null;
      const m = { name, assetId, kind, phase: 'IDLE', job: null, queue: [], phaseT: 0, interlockOk: true, completed: 0, busyS: 0, totalS: 0 };
      machines.set(name, m);
      return m;
    }
    function unregisterMachine(name) { machines.delete(name); }

    /** Queue a part on a machine. Returns the job. */
    function assign(machineName, part) {
      const m = machines.get(machineName);
      if (!m) throw new Error('no machine ' + machineName);
      if (!accepts(m.kind, part)) throw new Error(`${KIND_LABEL[m.kind]}은(는) ${part.shape === 'panel' ? '판재' : part.shape} 부품을 가공할 수 없습니다 (회전체 전용)`);
      const est = estimateCycle(part, m.kind);
      const job = { id: jobSeq++, part, est, machine: machineName, state: 'QUEUED', progress: 0, queuedAt: t };
      m.queue.push(job);
      log('JOB_QUEUED', { job: job.id, machine: machineName, part: part.name, runS: Math.round(est.runS) });
      return job;
    }

    /**
     * Queue a job whose cycle comes from an NC program (nested sheet on a router).
     * part: { name, shape:'sheet', ... }, runS: program time from NcProgram.load().totalS.
     */
    function assignProgram(machineName, part, runS, extra) {
      const m = machines.get(machineName);
      if (!m) throw new Error('no machine ' + machineName);
      if (m.kind !== 'router') throw new Error(`${KIND_LABEL[m.kind]}에는 시트(네스팅) 작업을 보낼 수 없습니다 — CNC 라우터 전용`);
      const est = Object.assign({ kind: 'router', runS, loadS: 40, unloadS: 45, detail: 'NC 프로그램 시간 (가정 이송 기준)' }, extra || {});
      const job = { id: jobSeq++, part, est, machine: machineName, state: 'QUEUED', progress: 0, queuedAt: t };
      m.queue.push(job);
      log('JOB_QUEUED', { job: job.id, machine: machineName, part: part.name, runS: Math.round(runS) });
      return job;
    }

    /** Interlock input per machine (door closed / e-stop OK / air OK). false → HOLD. */
    function setInterlock(machineName, ok) {
      const m = machines.get(machineName); if (m) m.interlockOk = !!ok;
    }

    function stepMachine(m, dt) {
      m.totalS += dt;
      if (!m.interlockOk) {
        if (m.phase !== 'IDLE' && m.phase !== 'HOLD') { m.heldPhase = m.phase; m.phase = 'HOLD'; log('HOLD', { machine: m.name }); }
        return;
      }
      if (m.phase === 'HOLD') { m.phase = m.heldPhase || 'IDLE'; log('RESUME', { machine: m.name }); }

      if (m.phase === 'IDLE') {
        if (!m.queue.length) return;
        m.job = m.queue.shift(); m.job.state = 'LOADING'; m.job.startedAt = t;
        m.phase = 'LOADING'; m.phaseT = 0;
        log('JOB_START', { job: m.job.id, machine: m.name });
        return;
      }
      m.busyS += dt;
      m.phaseT += dt;
      const est = m.job.est;
      if (m.phase === 'LOADING' && m.phaseT >= est.loadS) { m.phase = 'RUNNING'; m.phaseT = 0; m.job.state = 'RUNNING'; }
      else if (m.phase === 'RUNNING') {
        m.job.progress = Math.min(1, m.phaseT / est.runS);
        if (m.phaseT >= est.runS) { m.phase = 'UNLOADING'; m.phaseT = 0; m.job.state = 'UNLOADING'; m.job.progress = 1; }
      } else if (m.phase === 'UNLOADING' && m.phaseT >= est.unloadS) {
        m.job.state = 'DONE'; m.job.doneAt = t; m.completed++; completed++;
        log('JOB_DONE', { job: m.job.id, machine: m.name, part: m.job.part.name, leadS: Math.round(t - m.job.queuedAt) });
        m.lastJob = m.job; m.job = null; m.phase = 'IDLE'; m.phaseT = 0;
      }
    }

    /** Advance by dt seconds (0.1 s sub-steps). */
    function step(dt) {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(0.1, left);
        machines.forEach(m => stepMachine(m, h));
        t += h; left -= h;
      }
    }

    function machineSnapshot(m) {
      const j = m.job;
      return {
        name: m.name, assetId: m.assetId, kind: m.kind, phase: m.phase, interlockOk: m.interlockOk,
        jobId: j ? j.id : 0, part: j ? j.part.name : '', progress: j ? Math.round(j.progress * 1000) / 10 : 0,
        remainS: j ? Math.max(0, Math.round(remaining(m))) : 0,
        queue: m.queue.length, completed: m.completed,
        utilization: m.totalS > 0 ? Math.round(m.busyS / m.totalS * 1000) / 10 : 0
      };
    }
    function remaining(m) {
      const e = m.job.est;
      if (m.phase === 'HOLD') return (1 - m.job.progress) * e.runS + e.unloadS;
      if (m.phase === 'LOADING') return e.loadS - m.phaseT + e.runS + e.unloadS;
      if (m.phase === 'RUNNING') return e.runS - m.phaseT + e.unloadS;
      if (m.phase === 'UNLOADING') return e.unloadS - m.phaseT;
      return e.loadS + e.runS + e.unloadS;
    }

    /** Snapshot for UI / telemetry. */
    function snapshot() {
      return { t: Math.round(t * 10) / 10, completed, machines: [...machines.values()].map(machineSnapshot) };
    }

    return {
      registerMachine, unregisterMachine, assign, assignProgram, setInterlock, step, snapshot,
      machines, events, eventsSince, get t() { return t; }
    };
  }

  return { MACHINE_KINDS, KIND_LABEL, RATES, PHASES, accepts, partFromSketch, estimateCycle, createRuntime, polygonArea };
});
