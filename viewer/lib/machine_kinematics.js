/*
 * machine_kinematics.js — axis positions of each machine at a point of its job.
 *
 * Each function maps (phase, progress, part, estimate) → the same signals a real controller
 * would report, so the 3D rig and the telemetry use identical numbers:
 *   router : spindle_rpm, axis_x_mm, axis_y_mm, axis_z_mm, vacuum_on
 *   slm    : layer, platform_z_mm, recoater_x_mm, laser_x_mm, laser_y_mm, laser_on
 * Axis values are relative to the part centre (router) / build-plate centre (slm).
 * Feeds, speeds and layer times are ASSUMED placeholders.
 *
 * Browser: window.MachineKinematics · Node: require('../viewer/lib/machine_kinematics.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MachineKinematics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROUTER = { rpm: 18000, safeZmm: 25, stepDownMm: 3 };
  const SLM = { plateRmm: 125, recoatShare: 0.25, hatchLines: 12, layerMm: 0.04 };

  /** Tool path of a sketch panel: outline (closed) then each hole, as polylines centred on `center`. */
  function sketchPath(vertices, holes, center) {
    const c = center || { x: 0, y: 0 };
    const loops = [vertices.map(p => ({ x: p.x - c.x, y: p.y - c.y }))];
    (holes || []).filter(h => h.isSubtract).forEach(h => {
      const r = h.dia / 2, loop = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        loop.push({ x: h.x - c.x + r * Math.cos(a), y: h.y - c.y + r * Math.sin(a) });
      }
      loops.push(loop);
    });
    // close every loop, measure lengths
    return loops.map(l => {
      const pts = l.concat([l[0]]);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      return { pts, len };
    });
  }

  function pointAlong(loop, d) {
    let left = d;
    for (let i = 1; i < loop.pts.length; i++) {
      const a = loop.pts[i - 1], b = loop.pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (left <= seg || i === loop.pts.length - 1) {
        const u = seg ? Math.min(1, left / seg) : 0;
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
      left -= seg;
    }
    return loop.pts[0];
  }

  /**
   * 3-axis router: contour every loop at increasing depth (multi-pass), retracting between loops.
   * part: { thicknessMm }, path: from sketchPath().
   */
  function routerAxes(phase, progress, part, path) {
    const home = { spindle_rpm: 0, axis_x_mm: 0, axis_y_mm: 0, axis_z_mm: ROUTER.safeZmm, vacuum_on: false, pass: 0 };
    if (phase === 'LOADING' || phase === 'UNLOADING') return Object.assign(home, { vacuum_on: phase === 'LOADING' });
    if (phase !== 'RUNNING' && phase !== 'HOLD') return home;
    // no toolpath (job queued without one) → hold at safe Z with the spindle on instead of throwing every frame
    if (!part || !Array.isArray(path) || !path.length) return Object.assign(home, { spindle_rpm: ROUTER.rpm || 18000, vacuum_on: true });
    const passes = Math.max(1, Math.ceil(part.thicknessMm / ROUTER.stepDownMm));
    const loopLen = path.reduce((s, l) => s + l.len, 0);
    const total = passes * loopLen;
    let d = Math.max(0, Math.min(1, progress)) * total;
    const pass = Math.min(passes - 1, Math.floor(d / loopLen));
    d -= pass * loopLen;
    let li = 0;
    while (li < path.length - 1 && d > path[li].len) { d -= path[li].len; li++; }
    const p = pointAlong(path[li], d);
    const depth = Math.min(part.thicknessMm, (pass + 1) * ROUTER.stepDownMm);
    return {
      spindle_rpm: phase === 'HOLD' ? 0 : ROUTER.rpm,
      axis_x_mm: round(p.x), axis_y_mm: round(p.y), axis_z_mm: round(-depth),
      vacuum_on: true, pass: pass + 1, passes
    };
  }

  /**
   * Metal powder-bed printer: per layer, recoater sweep then laser hatch over the part footprint
   * (footprint scaled to fit the plate). Platform lowers one layer per layer.
   */
  function slmAxes(phase, progress, part, layers) {
    const idle = { layer: 0, platform_z_mm: 0, recoater_x_mm: -SLM.plateRmm, laser_x_mm: 0, laser_y_mm: 0, laser_on: false };
    if (phase !== 'RUNNING' && phase !== 'HOLD') return idle;
    const L = Math.max(1, layers);
    const pos = Math.max(0, Math.min(1, progress)) * L;
    const layer = Math.min(L - 1, Math.floor(pos));
    const u = pos - layer;
    const [bx, by] = part.bboxMm;
    const s = Math.min(1, (SLM.plateRmm * 1.6) / Math.max(bx, by));
    const hx = bx * s / 2, hy = by * s / 2;
    const out = { layer: layer + 1, layers: L, platform_z_mm: round(-(layer + 1) * SLM.layerMm, 3) };
    if (u < SLM.recoatShare) {
      const r = u / SLM.recoatShare;
      return Object.assign(out, { recoater_x_mm: round(-SLM.plateRmm + 2 * SLM.plateRmm * r), laser_x_mm: 0, laser_y_mm: 0, laser_on: false });
    }
    const v = (u - SLM.recoatShare) / (1 - SLM.recoatShare);
    const line = Math.min(SLM.hatchLines - 1, Math.floor(v * SLM.hatchLines));
    const w = v * SLM.hatchLines - line;
    const dir = (line + layer) % 2 === 0 ? 1 : -1;            // serpentine, alternating per layer
    return Object.assign(out, {
      recoater_x_mm: SLM.plateRmm,
      laser_x_mm: round(-hx + 2 * hx * (dir > 0 ? w : 1 - w)),
      laser_y_mm: round(-hy + (2 * hy) * (line + 0.5) / SLM.hatchLines),
      laser_on: phase !== 'HOLD'
    });
  }

  function round(v, n = 2) { const f = Math.pow(10, n); return Math.round(v * f) / f; }

  return { ROUTER, SLM, sketchPath, routerAxes, slmAxes };
});
