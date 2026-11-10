/*
 * twin_real.js — the "real machine" side of the twin (pure, testable; used by the server and the page).
 *
 *   Stage 3 (digital shadow): accept what a real machine reports, in ONE schema regardless of
 *   how it arrived (HTTP push from an edge box, MTConnect agent poll, later OPC UA / MQTT):
 *
 *     { machine, t, state: OFF|IDLE|RUNNING|HOLD|ALARM, program, line,
 *       axis_x_mm, axis_y_mm, axis_z_mm, spindle_rpm, feed_mm_min, spindle_load_pct, part_count }
 *
 *   normalize()            validate + clean one incoming sample
 *   parseMtconnectCurrent  MTConnect agent /current XML → that schema
 *   createCycleTracker     samples → finished cycle records (start, end, run, hold)
 *
 *   Stage 4 (prediction → decisions):
 *   planVsActual           is the running job on time? when will it finish?
 *   summarize              cycle log → measured/predicted ratio per machine (auto-calibration input)
 *   toolWear               cut metres since the last tool change vs tool life
 *
 *   The twin only READS equipment. Nothing here (or anywhere in the server) writes to a machine.
 *
 * Browser: window.TwinReal · Node: require('../viewer/lib/twin_real.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TwinReal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATES = ['OFF', 'IDLE', 'RUNNING', 'HOLD', 'ALARM'];
  const NUM = ['axis_x_mm', 'axis_y_mm', 'axis_z_mm', 'spindle_rpm', 'feed_mm_min', 'spindle_load_pct', 'part_count', 'line'];

  /** Clean one sample. Returns { sample } or { error }. Unknown fields are dropped. */
  function normalize(raw, nowMs) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'sample must be an object' };
    const machine = typeof raw.machine === 'string' ? raw.machine.trim() : '';
    if (!machine || machine.length > 80 || /[\u0000-\u001f]/.test(machine)) return { error: 'machine name required (max 80 chars)' };
    const state = String(raw.state || '').toUpperCase();
    if (!STATES.includes(state)) return { error: `state must be one of ${STATES.join(', ')}` };
    const s = { machine, state, t: typeof raw.t === 'number' && isFinite(raw.t) ? raw.t : (nowMs || Date.now()) };
    if (raw.program !== undefined && raw.program !== null) s.program = String(raw.program).slice(0, 120);
    for (const k of NUM) {
      if (raw[k] === undefined || raw[k] === null) continue;
      const v = Number(raw[k]);
      if (!isFinite(v) || Math.abs(v) > 1e7) return { error: `${k} must be a finite number` };
      s[k] = v;
    }
    return { sample: s };
  }

  // ------------------------------------------------------------------ MTConnect
  const EXEC_MAP = { ACTIVE: 'RUNNING', READY: 'IDLE', STOPPED: 'IDLE', PROGRAM_COMPLETED: 'IDLE', PROGRAM_STOPPED: 'HOLD', FEED_HOLD: 'HOLD', INTERRUPTED: 'HOLD', OPTIONAL_STOP: 'HOLD', WAIT: 'HOLD', UNAVAILABLE: 'OFF' };

  /**
   * Parse an MTConnect agent `/current` response (MTConnectStreams XML) into the twin schema.
   * Reads the first value of each observation type; axis positions are matched by the
   * conventional names (Xact/Yact/Zact, or name/dataItemId starting with x/y/z + ACTUAL).
   * Returns { sample } or { error }. Regex-based on purpose: no XML dependency, and it only
   * needs a handful of well-known elements.
   */
  function parseMtconnectCurrent(xml, machine) {
    if (typeof xml !== 'string' || !/MTConnectStreams/.test(xml)) return { error: 'not an MTConnectStreams document' };
    const first = tag => { const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)</(?:\\w+:)?${tag}>`).exec(xml); return m ? m[1].trim() : undefined; };
    const num = v => (v === undefined || v === 'UNAVAILABLE' || v === '' || !isFinite(Number(v)) ? undefined : Number(v));
    const raw = { machine, state: 'OFF' };
    const avail = first('Availability'), exec = first('Execution'), estop = first('EmergencyStop');
    if (avail === 'AVAILABLE' || exec) raw.state = EXEC_MAP[exec] || 'IDLE';
    if (estop === 'TRIGGERED') raw.state = 'ALARM';
    raw.program = first('Program');
    raw.line = num(first('Line') !== undefined ? first('Line') : first('LineNumber'));
    raw.feed_mm_min = num(first('PathFeedrate'));
    raw.spindle_rpm = num(first('RotaryVelocity') !== undefined ? first('RotaryVelocity') : first('SpindleSpeed'));
    raw.spindle_load_pct = num(first('Load'));
    raw.part_count = num(first('PartCount'));
    const posRe = /<(?:\w+:)?Position\b([^>]*)>([^<]*)<\/(?:\w+:)?Position>/g;
    let m;
    while ((m = posRe.exec(xml))) {
      const attrs = m[1], v = num(m[2].trim());
      if (v === undefined || /subType="(COMMANDED|PROGRAMMED|TARGET)"/.test(attrs)) continue;
      const id = (/name="([^"]+)"/.exec(attrs) || /dataItemId="([^"]+)"/.exec(attrs) || [])[1] || '';
      const ax = /^x/i.test(id) ? 'x' : /^y/i.test(id) ? 'y' : /^z/i.test(id) ? 'z' : null;
      if (ax && raw[`axis_${ax}_mm`] === undefined) raw[`axis_${ax}_mm`] = v;
    }
    for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
    return normalize(raw);
  }

  // ------------------------------------------------------------------ cycles
  /**
   * Turns a stream of samples for ONE machine into cycle records.
   * A cycle starts when the state becomes RUNNING and ends when it leaves RUNNING/HOLD
   * (IDLE, OFF, ALARM) — HOLD time inside a cycle is counted separately.
   * Cycles shorter than minRunS are ignored (jogging, single-block tests).
   * feed(sample) returns a finished record or null.
   */
  function createCycleTracker(opts) {
    const minRunS = (opts && opts.minRunS) || 5;
    let cur = null, last = null;
    function feed(s) {
      let done = null;
      if (cur && last) {
        const dt = Math.max(0, (s.t - last.t) / 1000);
        if (last.state === 'RUNNING') cur.runS += dt; else if (last.state === 'HOLD') cur.holdS += dt;
      }
      const inCycle = s.state === 'RUNNING' || s.state === 'HOLD';
      if (!cur && s.state === 'RUNNING') {
        cur = { machine: s.machine, program: s.program || '', startedAt: s.t, runS: 0, holdS: 0, partCountStart: s.part_count };
      } else if (cur && !inCycle) {
        if (cur.runS >= minRunS) {
          done = { machine: cur.machine, program: cur.program, startedAt: cur.startedAt, endedAt: s.t, runS: round1(cur.runS), holdS: round1(cur.holdS), endState: s.state, source: 'real' };
          if (typeof s.part_count === 'number' && typeof cur.partCountStart === 'number') done.parts = Math.max(0, s.part_count - cur.partCountStart);
        }
        cur = null;
      } else if (cur && s.program && !cur.program) cur.program = s.program;
      last = s;
      return done;
    }
    return { feed, get current() { return cur ? Object.assign({}, cur) : null; } };
  }
  const round1 = v => Math.round(v * 10) / 10;

  // ------------------------------------------------------------------ stage 4
  /**
   * Is a running job on time?  plannedRunS: predicted run time of the whole program,
   * elapsedRunS: run time so far (HOLD excluded), progress: 0..1 actually completed
   * (from the program line / segment the machine reports).
   * tolerancePct: how far off counts as late/ahead (default 10).
   */
  function planVsActual(a) {
    const planned = Math.max(0, a.plannedRunS || 0), elapsed = Math.max(0, a.elapsedRunS || 0);
    const progress = Math.max(0, Math.min(1, a.progress || 0)), tol = (a.tolerancePct === undefined ? 10 : a.tolerancePct) / 100;
    const expectedProgress = planned > 0 ? Math.min(1, elapsed / planned) : 0;
    // pace = real seconds per planned second so far; no progress yet → assume the plan
    const pace = progress > 0.02 && planned > 0 ? elapsed / (progress * planned) : 1;
    const remainingS = Math.max(0, (1 - progress) * planned * pace);
    const forecastTotalS = elapsed + remainingS, delayS = forecastTotalS - planned;
    const status = planned <= 0 ? 'unknown' : delayS > planned * tol ? 'late' : delayS < -planned * tol ? 'ahead' : 'on_time';
    return { expectedProgress, progress, pace, remainingS, forecastTotalS, delayS, delayPct: planned > 0 ? delayS / planned * 100 : 0, status };
  }

  /**
   * Cycle log → per-machine summary. Records with both runS and predictedS give the
   * measured/predicted ratio; its median is the suggested timeFactor (robust to one odd run).
   */
  function summarize(cycles) {
    const by = {};
    for (const c of cycles || []) {
      if (!c || !c.machine) continue;
      const m = by[c.machine] || (by[c.machine] = { machine: c.machine, cycles: 0, real: 0, sim: 0, runS: 0, holdS: 0, cutM: 0, ratios: [] });
      m.cycles++; m[c.source === 'real' ? 'real' : 'sim']++;
      m.runS += c.runS || 0; m.holdS += c.holdS || 0; m.cutM += (c.cutLenMm || 0) / 1000;
      if (c.source === 'real' && c.runS > 0 && c.predictedS > 0) m.ratios.push(c.runS / c.predictedS);
    }
    return Object.values(by).map(m => {
      const r = m.ratios.slice().sort((x, y) => x - y);
      const med = r.length ? (r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2) : null;
      return { machine: m.machine, cycles: m.cycles, real: m.real, sim: m.sim, runHours: m.runS / 3600, holdHours: m.holdS / 3600, cutM: m.cutM, comparable: r.length, suggestedTimeFactor: med };
    });
  }

  /**
   * Tool wear from the cycle log: metres cut since the most recent record with toolChanged = true.
   * lifeM <= 0 → pct null (no life configured).
   */
  function toolWear(cycles, machine, lifeM) {
    let cutM = 0;
    const list = (cycles || []).filter(c => c && c.machine === machine);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].toolChanged) break;
      cutM += (list[i].cutLenMm || 0) / 1000;
    }
    const pct = lifeM > 0 ? cutM / lifeM * 100 : null;
    return { cutM, lifeM: lifeM || 0, pct, level: pct === null ? 'unknown' : pct >= 100 ? 'replace' : pct >= 80 ? 'soon' : 'ok' };
  }

  return { STATES, normalize, parseMtconnectCurrent, createCycleTracker, planVsActual, summarize, toolWear };
});
