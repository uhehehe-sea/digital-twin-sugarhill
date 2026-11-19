/*
 * multicam_live.js — runs the MultiCam 3000 CNC router (asset 'multicam_3000') inside the /v2 twin.
 *
 *   The detailed viewer cnc/multicam3000_twin.html is embedded as a same-origin iframe and is the one
 *   source of machine state: its demo cycle (tool change, length calibration, pocket + contour cuts) or,
 *   once a signal arrives, the PLC values. Every frame the factory model copies frame.cnc.state().
 *
 *   Signal inputs on the twin page (same keys as the viewer: x, y, z mm / rpm / vac / pins / hood
 *   (true = down) / chuck / tool 0..12 / atcPos / atcAdv):
 *     window.cnc.set({...})                       same page
 *     postMessage({type:'cnc', signals:{...}})    from a parent page or another window
 *     /v2?cncws=ws://HOST:PORT                    PLC / Arduino bridge; each message is a JSON object
 *   window.cnc.config({sp, atc, zones, prog}) and window.cnc.state() pass through to the viewer.
 *   If the viewer cannot load (it takes three.js r128 from a CDN), signals still move the factory model.
 *
 * Depends on editor_v2.js globals (THREE, placedObjects).
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;

  // Fallback state in the viewer's internal form (hood 1 = up, pins 1 = up), used when the viewer is unavailable.
  const own = { x: 50, y: 120, z: 0, rpm: 0, vac: false, pins: 1, hood: 1, chuck: false, tool: 1, rot: 0, adv: 0 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function setOwn(o) {
    if (o.x != null) own.x = clamp(+o.x, -200, 2900);
    if (o.y != null) own.y = clamp(+o.y, 0, 1440);
    if (o.z != null) own.z = clamp(+o.z, -100, 0);
    if (o.rpm != null) own.rpm = Math.max(0, +o.rpm);
    if (o.vac != null) own.vac = !!o.vac;
    if (o.pins != null) own.pins = o.pins ? 1 : 0;
    if (o.hood != null) own.hood = o.hood ? 0 : 1;
    if (o.chuck != null) own.chuck = !!o.chuck;
    if (o.tool != null) own.tool = clamp(Math.round(+o.tool), 0, 12);
  }

  // ------------------------------------------------------------------ panel with the embedded viewer
  const panel = document.createElement('div');
  panel.id = 'multicam-panel';
  panel.innerHTML =
    '<div class="mc-head"><b>MultiCam 3000</b><span id="mc-src">시연</span>' +
    '<button id="mc-focus" title="공장에서 이 기계로 카메라 이동">위치</button><button id="mc-close" title="닫기">✕</button></div>' +
    '<iframe id="mc-frame" src="cnc/multicam3000_twin.html" title="MultiCam 3000 트윈 뷰어"></iframe>';
  const btn = document.createElement('button');
  btn.id = 'multicam-toggle';
  btn.textContent = '🪚 MultiCam 3000';
  const css = document.createElement('style');
  css.textContent =
    '#multicam-panel{position:fixed;left:16px;bottom:48px;width:min(760px,calc(100vw - 32px));height:min(620px,calc(100vh - 140px));' +
    'z-index:1000;display:flex;flex-direction:column;background:#0f172a;border:1px solid #334155;border-radius:10px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45)}' +
    '#multicam-panel .mc-head{display:flex;gap:8px;align-items:center;padding:6px 10px;color:#e2e8f0;font:13px system-ui,sans-serif}' +
    '#multicam-panel .mc-head b{flex:0 0 auto}#mc-src{flex:1;color:#94a3b8;font-size:12px}' +
    '#multicam-panel button,#multicam-toggle{font:12px system-ui,sans-serif;color:#e2e8f0;background:#1e293b;border:1px solid #334155;border-radius:6px;padding:4px 9px;cursor:pointer}' +
    '#multicam-panel iframe{flex:1;border:0;width:100%;background:#12161b}' +
    // Closed: the iframe stays rendered (a display:none frame stops requestAnimationFrame, which would freeze the demo cycle).
    '#multicam-panel.mc-closed{width:2px;height:2px;opacity:0;pointer-events:none;border:0}' +
    '#multicam-toggle{position:fixed;left:16px;bottom:48px;z-index:1000}';
  document.head.appendChild(css);
  document.body.appendChild(panel);
  document.body.appendChild(btn);
  const frame = panel.querySelector('#mc-frame');
  const srcEl = panel.querySelector('#mc-src');
  const setOpen = open => { panel.classList.toggle('mc-closed', !open); btn.hidden = open; };
  setOpen(false);
  btn.onclick = () => setOpen(true);
  panel.querySelector('#mc-close').onclick = () => setOpen(false);
  panel.querySelector('#mc-focus').onclick = () => {
    const m = machines()[0];
    if (m && typeof window.twinFocusMachine === 'function') window.twinFocusMachine(m.name);
    else if (m && typeof window.selectAssetObject === 'function') window.selectAssetObject(m);
  };

  const viewer = () => { try { const w = frame.contentWindow; return w && w.cnc ? w.cnc : null; } catch (_) { return null; } };

  // ------------------------------------------------------------------ signal inputs
  let lastSignal = 0, wsState = '';
  function set(o) {
    if (!o || typeof o !== 'object') return;
    setOwn(o);
    const v = viewer();
    if (v) v.set(o);
    lastSignal = performance.now();
  }
  window.cnc = {
    set,
    config: o => { const v = viewer(); if (v) v.config(o); },
    state: () => { const v = viewer(); return v ? v.state() : Object.assign({}, own); }
  };
  window.addEventListener('message', e => {
    if (e.source === frame.contentWindow) return;
    const d = e.data;
    if (d && d.type === 'cnc' && d.signals) set(d.signals);
  });
  const wsUrl = new URLSearchParams(location.search).get('cncws');
  if (wsUrl) {
    (function connect() {
      let s;
      try { s = new WebSocket(wsUrl); } catch (_) { wsState = '웹소켓 주소 오류'; return; }
      wsState = '웹소켓 연결 중';
      s.onopen = () => { wsState = '웹소켓 연결됨'; };
      s.onmessage = e => { try { set(JSON.parse(e.data)); } catch (_) { /* not JSON: ignore */ } };
      s.onclose = () => { wsState = '웹소켓 끊김, 재연결 대기'; setTimeout(connect, 3000); };
    })();
  }

  // ------------------------------------------------------------------ drive the factory model
  const machines = () => (typeof placedObjects !== 'undefined' ? placedObjects : []).filter(o => o.userData && o.userData.assetId === 'multicam_3000' && o.userData.rig);
  let spin = 0, last = performance.now(), lastSrc = '';
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const v = viewer();
    let s = own;
    if (v) { try { s = v.state(); } catch (_) { s = own; } }
    spin -= (s.rpm || 0) / 18000 * dt * 40;
    machines().forEach(m => {
      const r = m.userData.rig;
      r.gantry.position.x = 1800 - s.x + r.offsetX;
      r.carriage.position.y = 720 - s.y;
      r.zslide.position.z = s.z;
      r.hood.position.z = 130 * s.hood;
      r.pins.position.z = 55.5 * s.pins;
      r.tool.visible = s.tool > 0;
      r.tool.rotation.z = spin;
      r.rackTools.forEach((t, i) => { t.visible = s.tool !== i + 1; });
      r.zones.forEach(z => { z.material.color.set(s.vac ? 0x3ecf7c : 0x6688aa); z.material.opacity = s.vac ? 0.42 : 0.14; });
    });
    const src = now - lastSignal < 3000 ? '외부 신호 (PLC)' + (wsState ? ' · ' + wsState : '')
      : (v ? '시연: ' + (s.phase || '') : '뷰어 로드 안 됨 — 신호만 반영') + (wsState ? ' · ' + wsState : '');
    if (src !== lastSrc) { srcEl.textContent = src; lastSrc = src; }
  }
  requestAnimationFrame(tick);
})();
