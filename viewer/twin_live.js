/*
 * twin_live.js — makes the /v2 Sugar Hill factory twin run.
 *
 *   Machines move their real axes from the same signals they report (lib/machine_kinematics.js):
 *     CNC router  : gantry X / carriage Y / spindle Z follow the part's actual contour + holes, multi-pass
 *     metal SLM   : recoater sweep, laser spot hatching the footprint, platform lowering, part growing
 *     CNC lathe   : turned parts only (flat sketch panels are rejected) — chuck spins when running
 *   "내부 보기" makes machine shells see-through so the moving internals are visible.
 *   Modeled part → job → the part is clamped on the router table / disappears into the printer →
 *   comes out in front of the machine.  PLC interlocks hold machines; PLC outputs follow production.
 *   Router 배정 builds a real single-part nest + NC program (TwinNest.nestSinglePart) and
 *   machines a sheet with real carving (TwinNest.drive); the old synthetic outline trace is
 *   kept only as a fallback when the NC pipeline is unavailable. AM printers still use the
 *   synthetic path. Live telemetry (axes included) goes out over WebSocket /ws at 5 Hz.
 *
 * Depends on editor_v2.js globals (THREE, scene, camera, controls, placedObjects, ASSET_CATALOG,
 * virtualPLC, gateState, log) and /lib/twin_runtime.js + /lib/machine_kinematics.js.
 * Process times and feeds are assumed placeholders.
 */
(function () {
  'use strict';
  if (typeof TwinRuntime === 'undefined' || typeof MachineKinematics === 'undefined' || typeof THREE === 'undefined') return;
  const K = MachineKinematics;

  const rt = TwinRuntime.createRuntime();
  const animators = new Map();          // machine name -> animator
  const axesNow = new Map();            // machine name -> latest axis signals
  let speed = 10, xray = false;
  window.twinRuntime = rt;

  const PHASE_COLOR = { IDLE: 0xfacc15, LOADING: 0x38bdf8, RUNNING: 0x22c55e, UNLOADING: 0x38bdf8, HOLD: 0xef4444 };
  const PHASE_KO = { IDLE: '대기', LOADING: '투입', RUNNING: '가공 중', UNLOADING: '배출', HOLD: '인터락 정지' };
  const hex = c => '#' + c.toString(16).padStart(6, '0');

  function assetDims(obj) {
    const def = ASSET_CATALOG.find(a => a.assetId === obj.userData.assetId);
    return def ? def.dims : [1500, 1000, 1800];
  }
  function findTagged(obj, tag) {
    const out = [];
    obj.traverse(o => { if (o.isMesh && o.userData.partTag === tag) out.push(o); });
    return out;
  }
  function glow(geo, color, opacity) {
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  }

  // ------------------------------------------------------------------ animators
  function buildRouter(obj) {
    const rig = obj.userData.rig;
    if (!rig) return null;
    // cutter glow + chip spray at the tool tip (visible only while cutting)
    const tip = glow(new THREE.SphereGeometry(14, 12, 8), 0xfbbf24, 0.9);
    tip.position.set(rig.toolOffsetX, 0, rig.toolTipZ);
    tip.visible = false;
    rig.spindle.add(tip);
    return { kind: 'router', obj, rig, tip, beacons: findTagged(obj, 'beacon'), screens: findTagged(obj, 'screen') };
  }

  function buildSlm(obj) {
    const [W, , H] = assetDims(obj);
    const cx = -W / 2;
    const plateX = cx + W * 0.28, plateZ = H * 0.42 + 45;          // build plate from the printer builder
    const beam = glow(new THREE.CylinderGeometry(4, 4, 1, 8), 0x4ade80, 0.9);
    beam.rotation.x = Math.PI / 2;
    beam.visible = false;
    obj.add(beam);
    const spot = glow(new THREE.SphereGeometry(10, 10, 8), 0xbbf7d0, 1);
    spot.visible = false;
    obj.add(spot);
    const recoater = new THREE.Mesh(new THREE.BoxGeometry(16, 300, 14), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 }));
    recoater.position.set(plateX - 125, 0, plateZ + 10);
    obj.add(recoater);
    const build = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.35 }));
    build.visible = false;
    obj.add(build);
    return { kind: 'am', obj, beam, spot, recoater, build, plateX, plateZ, laserTopZ: H * 0.86, beacons: findTagged(obj, 'beacon'), screens: findTagged(obj, 'screen') };
  }

  function buildLathe(obj) {
    const [W, D, H] = assetDims(obj);
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2 + W * 0.37 + 2, 0, H * 0.66);
    const r = D * 0.15;
    const jawMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 });
    for (let k = 0; k < 3; k++) {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(18, r * 0.55, r * 0.22), jawMat);
      const a = k * Math.PI * 2 / 3;
      jaw.position.set(0, Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      jaw.rotation.x = a;
      pivot.add(jaw);
    }
    obj.add(pivot);
    return { kind: 'lathe', obj, pivot, beacons: findTagged(obj, 'beacon'), screens: findTagged(obj, 'screen') };
  }

  // Router axes are relative to the part centre; the part sits at the table centre (local 0,0).
  function driveRouter(a, m, job, now) {
    // nested-sheet jobs replay their G-code (twin_nest.js)
    if (job && job.prog && window.TwinNest) return window.TwinNest.drive(a, m, job);
    const rig = a.rig;
    const ax = job ? K.routerAxes(m.phase, job.progress, job.part, job.path) : K.routerAxes('IDLE', 0, null, null);
    const t = job ? job.part.thicknessMm : 0;
    rig.gantry.position.x = ax.axis_x_mm - rig.toolOffsetX;
    rig.carriage.position.y = ax.axis_y_mm;
    rig.spindle.position.z = (rig.tableZ + t + ax.axis_z_mm) - rig.toolTipZ;
    a.tip.visible = ax.spindle_rpm > 0 && ax.axis_z_mm < 0;
    if (a.tip.visible) a.tip.scale.setScalar(0.8 + 0.4 * Math.random());
    return ax;
  }

  function driveSlm(a, m, job) {
    const ax = job ? K.slmAxes(m.phase, job.progress, job.part, job.est.layers) : K.slmAxes('IDLE', 0, null, 0);
    a.recoater.position.x = a.plateX + ax.recoater_x_mm;
    const sx = a.plateX + ax.laser_x_mm, sy = ax.laser_y_mm;
    a.spot.visible = a.beam.visible = !!ax.laser_on;
    if (ax.laser_on) {
      const len = a.laserTopZ - a.plateZ;
      a.beam.scale.set(1, len, 1);
      a.beam.position.set(sx, sy, a.plateZ + len / 2);
      a.spot.position.set(sx, sy, a.plateZ + 2);
    }
    if (job) {
      const [bx, by, bz] = job.part.bboxMm;
      const s = Math.min(1, (K.SLM.plateRmm * 1.6) / Math.max(bx, by));
      const h = Math.max(0.5, bz * job.progress);
      a.build.visible = true;
      a.build.scale.set(bx * s, by * s, h);
      a.build.position.set(a.plateX, 0, a.plateZ + h / 2);
    } else a.build.visible = false;
    return ax;
  }

  function animate(a, m, now) {
    const running = m.phase === 'RUNNING';
    const col = PHASE_COLOR[m.phase] || 0x64748b;
    a.beacons.forEach(b => { b.material.color.setHex(col); if (b.material.emissive) b.material.emissive.setHex(col); });
    a.screens.forEach(s => { if ('emissiveIntensity' in s.material) s.material.emissiveIntensity = running ? 0.65 + 0.35 * Math.sin(now * 0.006) : 0.35; });
    const job = rt.machines.get(m.name).job;
    let ax = {};
    if (a.kind === 'router') ax = driveRouter(a, m, job, now);
    else if (a.kind === 'am') ax = driveSlm(a, m, job);
    else if (a.kind === 'lathe') { if (running) a.pivot.rotation.x += 0.35; ax = { spindle_rpm: running ? 2500 : 0 }; }
    axesNow.set(m.name, ax);
  }

  // ------------------------------------------------------------------ interior view (x-ray shells)
  const RIG_TAGS = new Set(['tool', 'beacon', 'screen']);
  function setXray(on) {
    xray = on;
    animators.forEach(a => {
      const moving = new Set();
      if (a.rig) [a.rig.gantry, a.rig.carriage, a.rig.spindle].forEach(g => g.traverse(o => moving.add(o)));
      [a.beam, a.spot, a.recoater, a.build, a.tip, a.pivot].forEach(o => o && o.traverse(c => moving.add(c)));
      a.obj.traverse(o => {
        if (!o.isMesh || moving.has(o) || RIG_TAGS.has(o.userData.partTag) || o.userData.isContactShadow) return;
        const mat = o.material;
        if (!mat || mat.userData.xrayBase === undefined && !on) return;
        if (mat.userData.xrayBase === undefined) mat.userData.xrayBase = { t: mat.transparent, o: mat.opacity, d: mat.depthWrite };
        const b = mat.userData.xrayBase;
        mat.transparent = on ? true : b.t;
        mat.opacity = on ? Math.min(b.o, 0.16) : b.o;
        mat.depthWrite = on ? false : b.d;
        mat.needsUpdate = true;
      });
    });
  }

  // ------------------------------------------------------------------ registry sync
  function syncMachines() {
    const names = new Set();
    placedObjects.forEach(o => {
      const id = o.userData && o.userData.assetId;
      const kind = TwinRuntime.MACHINE_KINDS[id];
      if (!kind) return;
      names.add(o.name);
      if (!rt.machines.has(o.name)) rt.registerMachine(o.name, id);
      const a = animators.get(o.name);
      if (!a || a.obj !== o) {
        const built = kind === 'router' ? buildRouter(o) : kind === 'am' ? buildSlm(o) : buildLathe(o);
        if (built) { animators.set(o.name, built); if (xray) setXray(true); }
      }
    });
    [...rt.machines.keys()].forEach(n => { if (!names.has(n)) { rt.unregisterMachine(n); animators.delete(n); } });
  }

  function linkPlc() {
    if (typeof virtualPLC === 'undefined') return;
    const i = virtualPLC.inputs;
    const cncOk = i.DI_CNC_DOOR && i.DI_CNC_AIR && i.DI_CNC_ESTOP;
    const amOk = i.DI_3DP_O2_INTERLOCK && i.DI_3DP_SEAL && i.DI_CNC_ESTOP;
    let cncRun = false, amRun = false;
    rt.machines.forEach(m => {
      rt.setInterlock(m.name, m.kind === 'am' ? amOk : cncOk);
      if (m.phase === 'RUNNING') { if (m.kind === 'am') amRun = true; else cncRun = true; }
    });
    virtualPLC.commands.cncRunCmd = cncRun;
    virtualPLC.commands.dmlsRunCmd = amRun;
  }

  // ------------------------------------------------------------------ part → job
  const partObjects = new Map();
  function partCandidates() { return placedObjects.filter(o => o.userData && o.userData.isExtrudedSketch && o.visible && !o.userData.inMachine); }

  function assignPart(partObj, machineName) {
    const ud = partObj.userData;
    const m = rt.machines.get(machineName);
    // Router: build a real single-part nest + NC program and machine a sheet (TwinNest.nestSinglePart).
    // The job carries job.prog + job.nest, so driveRouter delegates to TwinNest.drive and the
    // sheet is really carved. Blocked only when the G-code verification fails (out of bounds).
    if (m && m.kind === 'router' && typeof NcProgram !== 'undefined' && window.TwinNest && window.TwinNest.nestSinglePart) {
      try {
        const settings = window.TwinNest.toolSettings();
        const partData = { id: ud.libraryId || ('sketch-' + partObj.name), name: partObj.name, vertices: ud.vertices, holes: (ud.holes || []).filter(h => h.isSubtract), thickness: ud.thickness };
        const { nest, gen, prog } = window.TwinNest.nestSinglePart(partData, settings);
        const verify = NcProgram.verifyProgram(prog, { L: nest.opts.sheetL, W: nest.opts.sheetW, toolDia: settings.tool.dia, tabTopZ: gen.tabTopZ, tabs: gen.tabs, warnings: gen.warnings, clampZones: window.TwinNest.clampZones(nest.opts.sheetL, nest.opts.sheetW) });
        if (!verify.ok) {
          const bad = verify.checks.filter(c => c.level === 'error').map(c => c.detail).join(' / ');
          log(`⚠️ [생산] '${partObj.name}' G-code 검증 실패 — ${bad}`);
          toast('G-code 검증 실패: ' + bad, true);
          return null;
        }
        const sheetPart = { name: `${partObj.name} · 원판`, shape: 'sheet', thicknessMm: ud.thickness, bboxMm: [nest.opts.sheetL, nest.opts.sheetW, ud.thickness], count: 1 };
        const job = rt.assignProgram(machineName, sheetPart, prog.totalS);
        job.prog = prog; job.nest = nest; job.sheetJob = true;
        partObjects.set(job.id, partObj);
        ud.inMachine = machineName; ud.sheetJob = true;
        const warnTxt = verify.checks.filter(c => c.level === 'warn').map(c => `${c.label}: ${c.detail}`).join(' / ');
        log(`🏭 [생산] '${partObj.name}' → ${machineName} 작업 #${job.id} (원판 ${nest.opts.sheetL}×${nest.opts.sheetW}×${ud.thickness} mm, ${settings.material.name}, NC ${prog.lines}줄, 예상 ${fmtS(prog.totalS)})${warnTxt ? ' · ⚠ ' + warnTxt : ''}`);
        toast(`작업 #${job.id} 배정 → ${machineName} (원판 절삭)`);
        return job;
      } catch (e) {
        log(`⚠️ [생산] 원판 절삭 배정 실패, 윤곽 추적 방식으로 대체: ${e.message}`);
        // fall through to the synthetic trace path below
      }
    }
    // fallback: synthetic outline trace (AM printers, or NcProgram unavailable / NC build failed)
    const part = TwinRuntime.partFromSketch(partObj.name, ud.vertices, ud.holes, ud.thickness);
    let job;
    try { job = rt.assign(machineName, part); }
    catch (e) { log(`⚠️ [생산] ${e.message}`); toast(e.message, true); return null; }
    job.path = K.sketchPath(ud.vertices, ud.holes, ud.sketchCenter);
    partObjects.set(job.id, partObj);
    ud.inMachine = machineName;
    log(`🏭 [생산] '${partObj.name}' → ${machineName} 작업 #${job.id} (예상 ${fmtS(job.est.runS)}, ${job.est.detail}, 가정값)`);
    toast(`작업 #${job.id} 배정 → ${machineName}`);
    return job;
  }
  window.twinAssignPart = assignPart;

  function placeOnRouter(partObj, machineObj) {
    const rig = machineObj.userData.rig;
    const t = partObj.userData.thickness;
    const p = machineObj.localToWorld(new THREE.Vector3(0, 0, rig.tableZ + t / 2));
    partObj.parent.worldToLocal(p);
    partObj.position.copy(p);
    partObj.rotation.set(0, 0, machineObj.rotation.z);
    partObj.visible = true;
  }

  let lastEventSeq = 0;
  function handleEvents() {
    for (const e of rt.eventsSince(lastEventSeq)) {
      lastEventSeq = e.seq;
      if (window.TwinNest) window.TwinNest.onEvent(e);
      closeup.onEvent(e);
      const partObj = partObjects.get(e.job);
      const machineObj = placedObjects.find(o => o.name === e.machine);
      if (e.type === 'JOB_START' && partObj && machineObj) {
        const m = rt.machines.get(e.machine);
        if (partObj.userData.sheetJob) {
          // sheet job: the design mesh stays put — the stock is the nest sheet, not the part mesh
        } else if (m.kind === 'router') placeOnRouter(partObj, machineObj);   // clamped on the vacuum table, visible
        else partObj.visible = false;                                  // inside the printer chamber
      }
      if (e.type === 'JOB_DONE') {
        if (partObj && machineObj) {
          if (partObj.userData.sheetJob) {
            // sheet job: the finished part is already spawned by TwinNest.onEvent; just clear the flags
            partObj.userData.inMachine = null;
            partObj.userData.sheetJob = null;
            partObj.userData.processedBy = e.machine;
            partObj.userData.processedAt = new Date().toISOString();
          } else {
            const [, D] = assetDims(machineObj);
            const out = machineObj.localToWorld(new THREE.Vector3(0, -(D / 2 + 700), 0));
            partObj.parent.worldToLocal(out);
            partObj.position.x = out.x; partObj.position.y = out.y;
            partObj.position.z = (partObj.userData.thickness || 40) / 2;
            partObj.visible = true;
            partObj.userData.inMachine = null;
            partObj.userData.processedBy = e.machine;
            partObj.userData.processedAt = new Date().toISOString();
          }
        }
        log(`✅ [생산] 작업 #${e.job} 완료: '${e.part}' (${e.machine})`);
        toast(`작업 #${e.job} 완료 — ${e.part}`);
      }
      if (e.type === 'HOLD') log(`⛔ [생산] ${e.machine} 인터락으로 정지 (가상 PLC 입력 확인)`);
      if (e.type === 'RESUME') log(`▶ [생산] ${e.machine} 재개`);
    }
  }

  function focusMachine(name) {
    const o = placedObjects.find(p => p.name === name);
    if (!o || typeof controls === 'undefined') return;
    const c = new THREE.Vector3(); o.getWorldPosition(c);
    const [W, D, H] = assetDims(o);
    // oblique view from the machine's +X side and above (the open side of the router gantry;
    // the -Y front faces the machine row, so a camera there is blocked by neighbours)
    const kind = TwinRuntime.MACHINE_KINDS[o.userData.assetId];
    const eye = kind === 'router'
      ? o.localToWorld(new THREE.Vector3(W / 2 + 1700, -D * 0.35, H + 1500))     // router: open +X side
      : o.localToWorld(new THREE.Vector3(-W * 0.1, -(D / 2 + 1100), H + 900));  // printer/lathe: front (aisle) side, looking in
    camera.position.copy(eye);
    const look = kind === 'am' ? o.localToWorld(new THREE.Vector3(-W * 0.22, 0, H * 0.45)) : new THREE.Vector3(c.x, c.y, H * 0.45);
    controls.target.copy(look);
    controls.update();
  }

  // ------------------------------------------------------------------ auto close-up (review 2026-11-09 §7)
  // When a job starts, the camera glides (0.8 s) to the working zone and keeps it in frame:
  //   router  → tool tip (spindle)      · printer → laser spot / build plate · lathe → chuck
  // Several machines busy: the most recently started one, unless the user pinned one with its card's
  // ‘보기’ (pin lasts until that job ends). Any camera input by the user pauses following; a new job
  // resumes it if the camera has been left alone for 20 s. Job done → next busy machine, or back to
  // the view from before the first close-up. At ≥ 600× the tool moves too fast to follow comfortably,
  // so the camera frames the whole work area instead.
  const closeup = (function () {
    const LS = 'twin.closeup.v1';
    const opts = { auto: true, xray: true, ret: true };
    try { Object.assign(opts, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* storage blocked */ }
    const save = () => { try { localStorage.setItem(LS, JSON.stringify(opts)); } catch (e) { /* ignore */ } };
    let target = null, pinned = null, paused = false, pausedAt = 0, saved = null, tween = null, offset = null, focusPt = null;
    let lastFrame = performance.now(), returnTimer = 0, mode = '', offsetBand = 'normal';
    const startedAt = new Map();
    const q = new THREE.Quaternion();
    const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
    const busy = name => { const m = rt.machines.get(name); return !!(m && m.job); };

    function workPoint(name) {
      const a = animators.get(name);
      if (!a) return null;
      const v = new THREE.Vector3();
      if (a.kind === 'router') {
        if (speed >= 600 || !a.tip) { mode = '작업 영역 전체'; return a.obj.localToWorld(new THREE.Vector3(0, 0, a.rig ? a.rig.tableZ : 800)); }
        mode = '공구 추적'; return a.tip.getWorldPosition(v);
      }
      if (a.kind === 'am') {
        if (a.spot.visible && speed < 600) { mode = '레이저 스폿 추적'; return a.spot.getWorldPosition(v); }
        mode = '조형판'; return a.obj.localToWorld(new THREE.Vector3(a.plateX, 0, a.plateZ + 20));
      }
      mode = '척'; return a.pivot.getWorldPosition(v);
    }
    function offsetFor(name) {
      const a = animators.get(name), [W, D] = assetDims(a.obj);
      let local;
      if (a.kind === 'router') local = speed >= 600 ? new THREE.Vector3(W * 0.55 + 600, -D * 0.45, Math.max(W, D) * 0.55 + 600) : new THREE.Vector3(1350, -750, 1050);
      else if (a.kind === 'am') local = new THREE.Vector3(150, -(D * 0.5 + 650), 550);
      else local = new THREE.Vector3(250, -(D * 0.5 + 800), 350);
      return local.applyQuaternion(a.obj.getWorldQuaternion(q));
    }
    function engage(name, why) {
      if (!animators.get(name) || typeof controls === 'undefined') return;
      clearTimeout(returnTimer);
      if (!saved) saved = { pos: camera.position.clone(), tgt: controls.target.clone(), xray };
      const p = workPoint(name); if (!p) return;
      target = name; paused = false;
      offset = offsetFor(name); offsetBand = speed >= 600 ? 'fast' : 'normal'; focusPt = p.clone();
      tween = { p0: camera.position.clone(), t0: controls.target.clone(), start: performance.now(), dur: 800 };
      // shells are see-through only for enclosed machines (printer chamber, lathe guard); the router is an
      // open gantry, and an x-rayed table would hide the sheet being cut
      const wantX = opts.xray && animators.get(name).kind !== 'router' ? true : saved.xray;
      if (xray !== wantX) { setXray(wantX); syncXrayButton(); }
      log(`🎥 [클로즈업] ${name} ${why || '작업 시작'} — ${mode}`);
    }
    function release(back) {
      clearTimeout(returnTimer);
      target = null; pinned = null; tween = null;
      if (back && saved && typeof controls !== 'undefined') {
        const goal = saved;
        tween = { p0: camera.position.clone(), t0: controls.target.clone(), start: performance.now(), dur: 900, goal };
        if (xray !== goal.xray) { setXray(goal.xray); syncXrayButton(); }
      }
      saved = null;
    }
    function nextBusy(except) {
      let best = null, bt = -Infinity;
      rt.machines.forEach(m => { if (m.name !== except && m.job && (startedAt.get(m.name) ?? -1) > bt) { best = m.name; bt = startedAt.get(m.name) ?? -1; } });
      return best;
    }
    function onEvent(e) {
      if (e.type === 'JOB_START') {
        startedAt.set(e.machine, e.t);
        if (!opts.auto) return;
        if (paused && performance.now() - pausedAt > 20000) paused = false;
        if (paused) return;
        if (pinned && pinned !== e.machine && busy(pinned)) return;
        engage(e.machine);
      } else if (e.type === 'JOB_DONE' && e.machine === target) {
        if (pinned === e.machine) pinned = null;
        clearTimeout(returnTimer);
        returnTimer = setTimeout(() => {               // linger 1.5 s so the finished part is seen
          if (target !== e.machine) return;
          const nb = opts.auto && !paused ? nextBusy(e.machine) : null;
          if (nb) engage(nb, '이어서 가공 중');
          else release(opts.ret);
        }, 1500);
      }
    }
    function pauseByUser() {
      if (!target && !tween) return;
      if (tween && tween.goal) { tween = null; return; }  // user grabbed the camera during the return glide
      paused = true; pausedAt = performance.now(); tween = null;
    }
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
      if (typeof controls === 'undefined') return;
      if (tween && tween.goal) {                         // gliding back to the saved view
        const u = ease(Math.min(1, (now - tween.start) / tween.dur));
        camera.position.lerpVectors(tween.p0, tween.goal.pos, u);
        controls.target.lerpVectors(tween.t0, tween.goal.tgt, u);
        controls.update();
        if (u >= 1) tween = null;
        return;
      }
      if (!target || paused) return;
      const p = workPoint(target); if (!p) { target = null; return; }
      const band = speed >= 600 ? 'fast' : 'normal';
      if (band !== offsetBand) {                        // speed changed while following: re-frame smoothly
        offsetBand = band; offset = offsetFor(target);
        if (!tween) tween = { p0: camera.position.clone(), t0: controls.target.clone(), start: now, dur: 700 };
      }
      const tau = speed <= 60 ? 0.12 : speed < 600 ? 0.5 : 1.0;
      focusPt.lerp(p, 1 - Math.exp(-dt / tau));
      const wantPos = focusPt.clone().add(offset);
      if (tween) {
        const u = ease(Math.min(1, (now - tween.start) / tween.dur));
        camera.position.lerpVectors(tween.p0, wantPos, u);
        controls.target.lerpVectors(tween.t0, focusPt, u);
        if (u >= 1) tween = null;
      } else {
        camera.position.copy(wantPos);
        controls.target.copy(focusPt);
      }
      controls.update();
    }
    function attachUserInput() {
      if (typeof controls === 'undefined' || !controls.addEventListener) return setTimeout(attachUserInput, 500);
      controls.addEventListener('start', pauseByUser);   // OrbitControls: drag / wheel / touch
      addEventListener('keydown', e => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
        if (/^(Arrow|Page)|^[wasdqe]$/i.test(e.key)) pauseByUser();
      });
      requestAnimationFrame(frame);
    }
    function pin(name) {
      if (!busy(name)) { release(false); focusMachine(name); return; }
      pinned = name; engage(name, '선택');
    }
    function resume() { paused = false; const n = (target && busy(target)) ? target : nextBusy(null); if (n) engage(n, '다시 따라가기'); }
    function status() {
      if (!opts.auto) return { text: '꺼짐 — 작업이 시작돼도 카메라가 움직이지 않습니다', cls: '' };
      if (target && paused) return { text: `일시정지 — 카메라를 직접 움직였습니다 (${target})`, cls: 'warn', resume: true };
      if (target) { const m = rt.machines.get(target); return { text: `따라가는 중: ${target} · ${PHASE_KO[m ? m.phase : ''] || ''}${m && m.job ? ' ' + Math.round(m.job.progress * 100) + '%' : ''} · ${mode}${pinned ? ' · 고정' : ''}`, cls: 'ok' }; }
      return { text: '대기 — 작업이 시작되면 그 설비로 다가갑니다', cls: '' };
    }
    return {
      onEvent, pin, resume, status, attachUserInput, release,
      get target() { return target; }, get paused() { return paused; }, get opts() { return opts; },
      set(k, v) { opts[k] = !!v; save(); if (k === 'auto' && !v) release(opts.ret); }
    };
  })();
  function syncXrayButton() { const b = document.getElementById('tl-xray'); if (b) b.classList.toggle('on', xray); }

  // ------------------------------------------------------------------ live telemetry
  let ws = null, wsState = '연결 안 됨', sent = 0, viewers = 0, seq = 0;
  function connectWs() {
    try {
      ws = new WebSocket(`ws://${location.host}/ws?role=publisher`);
      ws.onopen = () => { wsState = '연결됨'; };
      ws.onclose = () => { wsState = '재연결 중'; ws = null; setTimeout(connectWs, 3000); };
      ws.onerror = () => { wsState = '오류'; };
      ws.onmessage = ev => { try { const m = JSON.parse(ev.data); if (m.type === 'stats') viewers = m.viewers; } catch (e) { /* ignore */ } };
    } catch (e) { wsState = '지원 안 됨'; }
  }
  function telemetry() {
    const snap = rt.snapshot();
    snap.machines.forEach(m => { m.axes = axesNow.get(m.name) || {}; });
    return {
      type: 'telemetry', schema: 'sugarhill-twin/2', source: 'simulator', assumedRates: true,
      seq: ++seq, ts: new Date().toISOString(), simT: snap.t, speed,
      production: { completed: snap.completed, machines: snap.machines },
      plc: typeof virtualPLC !== 'undefined' ? { inputs: virtualPLC.inputs, outputs: virtualPLC.outputs, analogs: virtualPLC.analogs } : null,
      gate: typeof gateState !== 'undefined' ? { progress: Math.round(gateState.progress * 100) / 100, status: gateState.status } : null,
      events: rt.events.slice(-5)
    };
  }
  function publish() { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(telemetry())); sent++; } }

  // ------------------------------------------------------------------ panel UI
  function fmtS(s) {
    s = Math.max(0, Math.round(s));
    if (s >= 86400) return `${(s / 86400).toFixed(1)}일`;
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  }

  const CSS = `
  #tl{position:fixed;left:12px;bottom:40px;width:400px;max-height:calc(100vh - 140px);display:flex;flex-direction:column;z-index:50;
      background:rgba(10,14,21,.95);backdrop-filter:blur(8px);border:1px solid #233047;border-radius:12px;color:#e2e8f0;
      font:12px/1.45 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.5)}
  #tl *{box-sizing:border-box}
  #tl .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1e293b}
  #tl .hd b{font-size:13px;letter-spacing:.01em}
  #tl .chip{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid}
  #tl .warn{color:#f59e0b;border-color:rgba(245,158,11,.4)}
  #tl .sp{flex:1}
  #tl select,#tl button{font:inherit;color:#e2e8f0;background:#141c2b;border:1px solid #273449;border-radius:6px;padding:3px 7px;cursor:pointer}
  #tl button:hover,#tl select:hover{border-color:#38bdf8}
  #tl button.pri{background:#0369a1;border-color:#0284c7;color:#fff;font-weight:600}
  #tl button.on{background:rgba(56,189,248,.18);border-color:#38bdf8;color:#7dd3fc}
  #tl .bd{overflow:auto;padding:8px 12px 10px}
  #tl .tools{display:flex;gap:6px;align-items:center;margin-bottom:8px}
  #tl .card{border:1px solid #1e293b;border-radius:9px;padding:8px 9px;margin-bottom:6px;background:#0e141f}
  #tl .row{display:flex;align-items:center;gap:6px}
  #tl .dot{width:8px;height:8px;border-radius:50%;flex:none}
  #tl .nm{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #tl .kind{font-size:10px;color:#94a3b8;border:1px solid #273449;border-radius:4px;padding:0 5px}
  #tl .bar{height:4px;background:#1e293b;border-radius:2px;margin:6px 0 4px;overflow:hidden}
  #tl .bar>i{display:block;height:100%;border-radius:2px;transition:width .25s}
  #tl .ax{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:4px}
  #tl .ax span{background:#141c2b;border-radius:5px;padding:2px 5px;font:11px ui-monospace,Consolas,monospace;color:#cbd5e1;white-space:nowrap;overflow:hidden}
  #tl .ax em{font-style:normal;color:#64748b;margin-right:3px}
  #tl .muted{color:#64748b;font-size:11px}
  #tl .sec{color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 5px}
  #tl .assign{display:grid;grid-template-columns:1fr 1fr auto;gap:5px}
  #tl .assign select{min-width:0}
  #tl .ws{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:11px;color:#94a3b8}
  #tl a{color:#38bdf8;text-decoration:none}
  #tl-toast{position:fixed;left:424px;bottom:48px;z-index:51;padding:7px 12px;border-radius:8px;font:12px system-ui,"Malgun Gothic",sans-serif;
      background:#0f172a;border:1px solid #38bdf8;color:#e2e8f0;opacity:0;transform:translateY(6px);transition:.2s;pointer-events:none}
  #tl-toast.show{opacity:1;transform:none}
  #tl-toast.err{border-color:#ef4444}
  #tl label.muted{display:flex;align-items:center;gap:3px;cursor:pointer}
  #tl button.sm{padding:1px 6px;font-size:11px}
  #tl .cu{font-size:11px;color:#94a3b8;margin:-2px 0 8px;min-height:16px}#tl .cu .ok{color:#4ade80}#tl .cu .warn{color:#f59e0b}
  #tl-chip{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:52;display:none;gap:6px;flex-wrap:wrap;justify-content:center;
      font:12px system-ui,"Malgun Gothic",sans-serif;pointer-events:none}
  #tl-chip button{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;cursor:pointer;
      background:rgba(15,23,42,.92);border:1px solid #38bdf8;color:#e2e8f0;box-shadow:0 6px 18px rgba(0,0,0,.45);font:inherit}
  #tl-chip button:hover{background:#0c4a6e}#tl-chip b{color:#7dd3fc;font-weight:600}#tl-chip .dot{width:8px;height:8px;border-radius:50%}
  #tl-chip span{color:#94a3b8;align-self:center}
  @media (max-width:760px){#tl{left:8px;right:8px;width:auto}#tl-toast{left:8px}}
  #tl.docked{position:static;width:auto;max-height:none;z-index:auto;box-shadow:none;backdrop-filter:none;border-radius:8px;background:rgba(10,14,21,.6)}
  #tl.docked .bd{overflow:visible}
  #tl.docked .tools{flex-wrap:wrap}#tl.docked .tools button,#tl.docked .tools label{white-space:nowrap}
  #tl.docked .ax{grid-template-columns:repeat(2,1fr)}`;

  let toastTimer = 0;
  function toast(msg, err) {
    const t = document.getElementById('tl-toast'); if (!t) return;
    t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2600);
  }

  function buildPanel() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const p = document.createElement('div');
    p.id = 'tl';
    p.innerHTML = `
      <div class="hd">
        <b>🏭 생산 · 실시간 트윈</b><span class="chip warn" title="공정 시간·이송 속도는 가정값입니다">가정값</span>
        <span class="sp"></span>
        <select id="tl-speed" title="시뮬레이션 속도"><option value="1">1×</option><option value="10" selected>10×</option><option value="60">60×</option><option value="600">600×</option><option value="3600">3600×</option></select>
        <button id="tl-min" title="접기">▾</button>
      </div>
      <div class="bd" id="tl-body">
        <div class="tools">
          <button id="tl-auto" title="작업이 시작되면 카메라가 가공 부위로 다가가 따라갑니다">🎥 자동 클로즈업</button>
          <button id="tl-xray" title="설비 외장을 반투명으로 — 내부 축 동작 보기">◎ 내부 보기</button>
          <span class="sp"></span>
          <label class="muted" title="클로즈업할 때 외장을 반투명으로"><input type="checkbox" id="tl-cu-xray"> 내부</label>
          <label class="muted" title="작업이 끝나면 원래 보던 화면으로"><input type="checkbox" id="tl-cu-ret"> 복귀</label>
        </div>
        <div id="tl-cu" class="cu"></div>
        <div id="tl-machines"></div>
        <div class="sec">모델링 부품 → 설비 배정</div>
        <div class="assign">
          <select id="tl-part" title="공장에 배치된 스케치 부품"></select>
          <select id="tl-machine" title="설비"></select>
          <button id="tl-assign" class="pri">배정</button>
        </div>
        <div id="tl-hint" class="muted" style="margin-top:4px"></div>
        <div class="sec">실시간 데이터</div>
        <div class="ws" id="tl-ws"></div>
      </div>`;
    // 오른쪽 사이드바(속성 탭)에 자리가 있으면 거기에 붙이고, 없으면(독립 데모 등) 왼쪽 아래 떠 있는 창으로.
    const dock = document.getElementById('tl-dock');
    if (dock) { p.classList.add('docked'); dock.appendChild(p); } else document.body.appendChild(p);
    const t = document.createElement('div'); t.id = 'tl-toast'; document.body.appendChild(t);

    p.querySelector('#tl-speed').onchange = e => { speed = parseFloat(e.target.value); };
    p.querySelector('#tl-min').onclick = e => {
      const b = p.querySelector('#tl-body'); const hide = b.style.display !== 'none';
      b.style.display = hide ? 'none' : ''; e.target.textContent = hide ? '▸' : '▾';
    };
    p.querySelector('#tl-xray').onclick = () => { setXray(!xray); syncXrayButton(); };
    const autoB = p.querySelector('#tl-auto'), cx = p.querySelector('#tl-cu-xray'), cr = p.querySelector('#tl-cu-ret');
    autoB.classList.toggle('on', closeup.opts.auto); cx.checked = closeup.opts.xray; cr.checked = closeup.opts.ret;
    autoB.onclick = () => { closeup.set('auto', !closeup.opts.auto); autoB.classList.toggle('on', closeup.opts.auto); };
    cx.onchange = () => closeup.set('xray', cx.checked);
    cr.onchange = () => closeup.set('ret', cr.checked);
    p.querySelector('#tl-cu').addEventListener('click', e => { if (e.target.closest('[data-resume]')) closeup.resume(); });
    const chip = document.createElement('div'); chip.id = 'tl-chip'; document.body.appendChild(chip);
    chip.addEventListener('click', e => { const b = e.target.closest('[data-follow]'); if (b) closeup.pin(b.dataset.follow); });
    p.querySelector('#tl-assign').onclick = () => {
      const part = placedObjects.find(o => o.name === p.querySelector('#tl-part').value);
      const m = p.querySelector('#tl-machine').value;
      if (part && m) assignPart(part, m);
    };
    p.querySelector('#tl-machines').addEventListener('click', e => {
      const b = e.target.closest('[data-focus]'); if (!b) return;
      if (closeup.opts.auto) closeup.pin(b.dataset.focus);   // busy machine → follow it; idle → plain view
      else focusMachine(b.dataset.focus);
    });
  }

  // status line under the toolbar + corner chip for busy machines the camera is not showing
  function renderCloseup(snap) {
    const s = closeup.status(), el = document.getElementById('tl-cu');
    if (el) el.innerHTML = `<span class="${s.cls}">${s.text}</span>${s.resume ? ' <button data-resume class="sm">다시 따라가기</button>' : ''}`;
    const chip = document.getElementById('tl-chip'); if (!chip) return;
    const others = snap.machines.filter(m => m.jobId && m.phase !== 'IDLE' && !(m.name === closeup.target && !closeup.paused));
    chip.style.display = others.length ? 'flex' : 'none';
    chip.innerHTML = others.slice(0, 3).map(m => {
      const col = hex(PHASE_COLOR[m.phase] || 0x64748b);
      return `<button data-follow="${m.name}" title="이 설비로 카메라 이동"><span class="dot" style="background:${col};box-shadow:0 0 6px ${col}"></span>${m.name} · ${PHASE_KO[m.phase] || m.phase} ${m.progress}% <b>보기 ›</b></button>`;
    }).join('') + (others.length > 3 ? `<span>+${others.length - 3}</span>` : '');
  }

  function fillSelect(sel, values, labels) {
    const key = values.join('|') + labels.join('|');
    if (sel.dataset.key === key) return;
    const cur = sel.value;
    sel.innerHTML = values.map((v, i) => `<option value="${v}">${labels[i]}</option>`).join('');
    if (values.includes(cur)) sel.value = cur;
    sel.dataset.key = key;
  }

  function axisChips(m) {
    const a = axesNow.get(m.name) || {};
    if (m.kind === 'router') return [['X', a.axis_x_mm], ['Y', a.axis_y_mm], ['Z', a.axis_z_mm], ['S', a.spindle_rpm]];
    if (m.kind === 'am') return [['층', a.layer ? `${a.layer}/${a.layers}` : 0], ['베드Z', a.platform_z_mm], ['레이저', a.laser_on ? 'ON' : 'off'], ['리코터', a.recoater_x_mm]];
    return [['S', a.spindle_rpm || 0], ['', '회전체 전용']];
  }

  function renderPanel() {
    const snap = rt.snapshot();
    document.getElementById('tl-machines').innerHTML = snap.machines.length ? snap.machines.map(m => {
      const col = hex(PHASE_COLOR[m.phase] || 0x64748b);
      const chips = axisChips(m).map(([k, v]) => `<span>${k ? `<em>${k}</em>` : ''}${v ?? '–'}</span>`).join('');
      let massLine = '';
      if (m.kind === 'router' && m.jobId && window.TwinNest && window.TwinNest.removedMass) {
        const rm = window.TwinNest.removedMass(m.jobId);
        if (rm && rm.massG > 0) massLine = `<div class="muted">원판 제거 ${rm.massG.toFixed(1)} g · ${rm.volCm3.toFixed(1)} cm³ (${rm.material}, 약)</div>`;
      }
      return `<div class="card">
        <div class="row"><span class="dot" style="background:${col};box-shadow:0 0 8px ${col}"></span>
          <span class="nm" title="${m.name}">${m.name}</span><span class="kind">${TwinRuntime.KIND_LABEL[m.kind]}</span>
          <button data-focus="${m.name}" title="이 설비로 카메라 이동">보기</button></div>
        <div class="bar"><i style="width:${m.progress}%;background:${col}"></i></div>
        <div class="row muted"><span style="color:${col}">${PHASE_KO[m.phase] || m.phase}</span>
          <span class="sp"></span>${m.jobId ? `#${m.jobId} · ${m.progress}% · 남은 ${fmtS(m.remainS)}` : `완료 ${m.completed} · 대기 ${m.queue} · 가동률 ${m.utilization}%`}</div>
        <div class="ax">${chips}</div>${massLine}
      </div>`;
    }).join('') : '<div class="muted">배치된 생산 설비 없음</div>';
    renderCloseup(snap);

    const parts = partCandidates();
    fillSelect(document.getElementById('tl-part'), parts.map(o => o.name), parts.map(o => o.name + (o.userData.processedBy ? ' ✓가공됨' : '')));
    const ms = snap.machines.filter(m => m.kind !== 'lathe');
    fillSelect(document.getElementById('tl-machine'), ms.map(m => m.name), ms.map(m => `${m.name} · ${TwinRuntime.KIND_LABEL[m.kind]}`));
    const inMachine = placedObjects.filter(o => o.userData && o.userData.inMachine).length;
    document.getElementById('tl-hint').textContent = parts.length ? '판재 부품은 CNC 라우터 또는 금속 3D 프린터에 배정됩니다 (선반은 회전체 전용).' :
      inMachine ? `배정 가능한 부품 없음 — ${inMachine}개 가공 중` : '부품 없음: CAD 모델링 → 빠른 스케치에서 판넬을 만들고 “공장에 배치”.';
    const ok = wsState === '연결됨';
    document.getElementById('tl-ws').innerHTML =
      `<span><span class="dot" style="display:inline-block;background:${ok ? '#22c55e' : '#f59e0b'}"></span> WebSocket ${wsState}</span>` +
      `<span>5 Hz · 송신 ${sent}</span><span>수신 화면 ${viewers}</span>` +
      `<a href="/monitor" target="_blank">모니터 ↗</a><a href="/api/telemetry" target="_blank">JSON ↗</a>`;
  }

  // ------------------------------------------------------------------ loops
  let last = performance.now();
  function tick() {
    const now = performance.now();
    const dt = Math.min(1, (now - last) / 1000); last = now;
    syncMachines();
    linkPlc();
    rt.step(dt * speed);
    handleEvents();
    rt.snapshot().machines.forEach(m => { const a = animators.get(m.name); if (a) animate(a, m, now); });
  }
  function start() {
    if (typeof placedObjects === 'undefined') return setTimeout(start, 500);
    buildPanel();
    closeup.attachUserInput();
    connectWs();
    setInterval(tick, 40);
    setInterval(renderPanel, 250);
    setInterval(publish, 200);
  }
  window.twinFocusMachine = focusMachine;
  window.twinSetXray = setXray;
  window.twinCloseup = closeup;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
