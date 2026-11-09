/*
 * sketch_core.js — pure functions behind Mode 2 ("빠른 스케치·견적 모드").
 *
 * Loaded two ways:
 *   - browser: <script src="/lib/sketch_core.js"> → window.SketchCore
 *   - Node tests: require('../viewer/lib/sketch_core.js')
 *
 * Precision note (see docs/AUDIT.md): everything here produces a triangle MESH
 * through THREE.ExtrudeGeometry. Circles are approximated by polygons and positions
 * are stored as Float32. This is a sketch/quote tool, not a source of truth for
 * machining geometry.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SketchCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Snap steps offered in the UI (mm). */
  const SNAP_STEPS = [0.1, 1, 10];
  /** three.js ExtrudeGeometry default; kept so output matches the previous version. */
  const DEFAULT_CURVE_SEGMENTS = 12;
  const MAX_THICKNESS_MM = 1000;

  /** Round v to the nearest multiple of step, without float noise (0.1 steps → 0.3, not 0.30000000000000004). */
  function snapValue(v, step) {
    if (!(step > 0)) return v;
    const snapped = Math.round(v / step) * step;
    return Number(snapped.toFixed(6));
  }

  /**
   * Validate a thickness input. Returns { ok, value } or { ok:false, error }.
   * The old code silently replaced 0 / invalid input with 40 mm; this refuses instead.
   */
  function validateThickness(raw) {
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw).trim());
    if (!Number.isFinite(v)) return { ok: false, error: '두께가 숫자가 아닙니다' };
    if (v <= 0) return { ok: false, error: '두께는 0보다 커야 합니다' };
    if (v > MAX_THICKNESS_MM) return { ok: false, error: `두께는 ${MAX_THICKNESS_MM}mm 이하여야 합니다` };
    return { ok: true, value: v };
  }

  /** Maximum distance between a circle of `radius` and its inscribed regular polygon with `sides` sides. */
  function chordalError(radius, sides) {
    if (sides < 3) return radius;
    return radius * (1 - Math.cos(Math.PI / sides));
  }

  /** Number of polygon sides three.js will use for a full circle hole at the given curveSegments. */
  function holePolygonSides(THREE, curveSegments) {
    const p = new THREE.Path();
    p.absarc(0, 0, 1, 0, Math.PI * 2, true);
    // getPoints returns a closed list (last point == first point)
    return p.getPoints(curveSegments).length - 1;
  }

  /** Build the outline + subtracted holes as a THREE.Shape. Returns { shape, subtractCount }. */
  function buildPanelShape(THREE, vertices, holes) {
    if (!Array.isArray(vertices) || vertices.length < 3) {
      throw new Error('외곽은 최소 3개 점이 필요합니다');
    }
    const shape = new THREE.Shape();
    shape.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) shape.lineTo(vertices[i].x, vertices[i].y);
    shape.closePath();

    let subtractCount = 0;
    (holes || []).forEach(h => {
      if (!h.isSubtract) return;
      const r = (parseFloat(h.dia) || 16) * 0.5;
      const holePath = new THREE.Path();
      holePath.absarc(parseFloat(h.x) || 0, parseFloat(h.y) || 0, r, 0, Math.PI * 2, true);
      shape.holes.push(holePath);
      subtractCount++;
    });
    return { shape, subtractCount };
  }

  /**
   * Extrude the sketch. Geometry is NOT centred here (the editor calls geo.center()
   * for display); in raw output the sketch plane is z = 0 and the top face is z = thickness.
   */
  function buildPanelGeometry(THREE, vertices, holes, thickness, curveSegments) {
    const t = validateThickness(thickness);
    if (!t.ok) throw new Error(t.error);
    const { shape, subtractCount } = buildPanelShape(THREE, vertices, holes);
    const segs = curveSegments || DEFAULT_CURVE_SEGMENTS;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: t.value, bevelEnabled: false, curveSegments: segs });
    return { geometry, subtractCount, thickness: t.value, curveSegments: segs };
  }

  /**
   * Text for the three-layer precision label shown under the 3D view.
   * holes: the sketch holes (to report the worst chordal error).
   */
  function precisionLayers(THREE, holes, curveSegments) {
    const segs = curveSegments || DEFAULT_CURVE_SEGMENTS;
    const sides = holePolygonSides(THREE, segs);
    let worst = 0;
    (holes || []).forEach(h => {
      if (!h.isSubtract) return;
      const r = (parseFloat(h.dia) || 16) * 0.5;
      worst = Math.max(worst, chordalError(r, sides));
    });
    return {
      sides,
      worstChordalErrorMm: worst,
      display: `화면 표시: 메쉬 · 원 ${sides}각형 근사 · 최대 현 오차 ${worst.toFixed(3)} mm`,
      model: '모델 수치: 입력 좌표 → 브라우저 Float32 메쉬 (정밀 형상 기준 아님)',
      machining: '가공 공차: 미검증'
    };
  }

  /** Ray-casting point-in-polygon test. */
  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a.y > pt.y) !== (b.y > pt.y)) &&
          (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
    }
    return inside;
  }

  /** Shortest distance from point p to segment ab. */
  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  /**
   * Check a through-hole against the outline (and optionally other holes).
   * Returns { ok:true } or { ok:false, error }. Rejects holes whose centre is outside
   * the outline or whose circle touches/crosses an edge or another hole.
   */
  function validateHole(vertices, hole, otherHoles) {
    const d = parseFloat(hole.dia);
    if (!(d > 0)) return { ok: false, error: '구멍 지름은 0보다 커야 합니다' };
    const r = d / 2;
    const c = { x: parseFloat(hole.x), y: parseFloat(hole.y) };
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return { ok: false, error: '구멍 좌표가 숫자가 아닙니다' };
    if (!vertices || vertices.length < 3) return { ok: false, error: '외곽이 없습니다' };
    if (!pointInPolygon(c, vertices)) return { ok: false, error: '구멍 중심이 판넬 외곽 밖에 있습니다' };
    let minEdge = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      minEdge = Math.min(minEdge, distToSegment(c, vertices[i], vertices[(i + 1) % vertices.length]));
    }
    if (minEdge <= r) {
      return { ok: false, error: `구멍이 판넬 테두리와 겹칩니다 (테두리까지 ${minEdge.toFixed(2)}mm, 반지름 ${r}mm)` };
    }
    for (const o of (otherHoles || [])) {
      if (!o.isSubtract) continue;
      const gap = Math.hypot(c.x - o.x, c.y - o.y) - (r + parseFloat(o.dia) / 2);
      if (gap <= 0) return { ok: false, error: `다른 구멍(${o.x}, ${o.y})과 겹칩니다` };
    }
    return { ok: true, edgeClearance: minEdge - r };
  }

  return {
    pointInPolygon,
    validateHole,
    SNAP_STEPS,
    DEFAULT_CURVE_SEGMENTS,
    snapValue,
    validateThickness,
    chordalError,
    holePolygonSides,
    buildPanelShape,
    buildPanelGeometry,
    precisionLayers
  };
});
