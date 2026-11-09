/*
 * dxf_import.js — ASCII DXF → flat panel parts (outline + circular through-holes).
 *
 * Reads: LWPOLYLINE (closed, bulges → arcs), POLYLINE/VERTEX, LINE + ARC chains (joined into
 * closed loops), CIRCLE. Units from $INSUNITS (1 inch, 4 mm, 5 cm, 6 m; missing → mm).
 * Every closed loop that is not inside another loop becomes a part; circles inside it become
 * holes. Non-circular inner loops are reported (the panel model only supports round holes).
 *
 * Browser: window.DxfImport · Node: require('../viewer/lib/dxf_import.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DxfImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNIT_MM = { 0: 1, 1: 25.4, 4: 1, 5: 10, 6: 1000 };
  const JOIN_TOL = 0.05;                     // mm, endpoint matching when chaining LINE/ARC

  function pairs(text) {
    const lines = text.split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
    return out;
  }

  /** Raw entities + header units. */
  function readEntities(text) {
    const P = pairs(text);
    let insunits = 4, section = null, cur = null;
    const ents = [];
    for (let i = 0; i < P.length; i++) {
      const [c, v] = P[i];
      if (c === 0 && v === 'SECTION') { section = P[i + 1] && P[i + 1][1]; continue; }
      if (c === 9 && v === '$INSUNITS' && P[i + 1]) { insunits = parseInt(P[i + 1][1], 10); continue; }
      if (section !== 'ENTITIES' && section !== 'BLOCKS') continue;
      if (c === 0) {
        if (cur) ents.push(cur);
        cur = ['LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'SEQEND'].includes(v) ? { type: v, v: [], flags: 0 } : null;
        if (v === 'ENDSEC') section = null;
        continue;
      }
      if (!cur) continue;
      const n = parseFloat(v);
      switch (c) {
        case 10: if (cur.type === 'LWPOLYLINE') cur.v.push({ x: n, y: 0, b: 0 }); else cur.x = n; break;
        case 20: if (cur.type === 'LWPOLYLINE') cur.v[cur.v.length - 1].y = n; else cur.y = n; break;
        case 11: cur.x2 = n; break;
        case 21: cur.y2 = n; break;
        case 40: cur.r = n; break;
        case 42: if (cur.type === 'LWPOLYLINE' && cur.v.length) cur.v[cur.v.length - 1].b = n; else cur.b = n; break;
        case 50: cur.a0 = n; break;
        case 51: cur.a1 = n; break;
        case 70: cur.flags = parseInt(v, 10); break;
        default: break;
      }
    }
    if (cur) ents.push(cur);
    return { ents, scale: UNIT_MM[insunits] || 1, insunits };
  }

  function arcPoints(cx, cy, r, a0, a1, ccw) {           // radians, includes end point, excludes start
    let sweep = a1 - a0;
    if (ccw) { while (sweep <= 0) sweep += 2 * Math.PI; } else { while (sweep >= 0) sweep -= 2 * Math.PI; }
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
    const pts = [];
    for (let k = 1; k <= n; k++) { const a = a0 + sweep * k / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    return pts;
  }

  /** Expand a polyline with bulges into points (closed loop, last point not repeated). */
  function bulgeLoop(v) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      out.push({ x: a.x, y: a.y });
      if (Math.abs(a.b || 0) > 1e-9) {
        const th = 4 * Math.atan(a.b), d = Math.hypot(b.x - a.x, b.y - a.y), r = d / (2 * Math.sin(th / 2));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = Math.sqrt(Math.max(0, r * r - d * d / 4));
        const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, s = (a.b > 0 ? 1 : -1) * (Math.abs(th) > Math.PI ? -1 : 1);
        const cx = mx + nx * h * s, cy = my + ny * h * s;
        const pts = arcPoints(cx, cy, Math.abs(r), Math.atan2(a.y - cy, a.x - cx), Math.atan2(b.y - cy, b.x - cx), a.b > 0);
        pts.pop();                                         // end point is the next vertex
        out.push(...pts);
      }
    }
    return out;
  }

  /** Join LINE/ARC pieces into closed loops. */
  function chain(pieces) {
    const loops = [], open = pieces.slice();
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= JOIN_TOL;
    while (open.length) {
      let path = open.shift().pts.slice();
      let grown = true;
      while (grown && !near(path[0], path[path.length - 1])) {
        grown = false;
        for (let i = 0; i < open.length; i++) {
          const pts = open[i].pts, end = path[path.length - 1];
          if (near(end, pts[0])) { path = path.concat(pts.slice(1)); }
          else if (near(end, pts[pts.length - 1])) { path = path.concat(pts.slice().reverse().slice(1)); }
          else continue;
          open.splice(i, 1); grown = true; break;
        }
      }
      if (path.length > 3 && near(path[0], path[path.length - 1])) { path.pop(); loops.push(path); }
    }
    return loops;
  }

  function area(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y); return Math.abs(a / 2); }
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x)) c = !c;
    }
    return c;
  }
  /** Remove collinear points (LINE chains of a rectangle → 4 vertices). */
  function simplify(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i - 1 + poly.length) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y))) out.push(b);
    }
    return out.length >= 3 ? out : poly;
  }

  /**
   * Parse DXF text → { parts:[{ name, vertices, holes:[{x,y,dia,isSubtract}] }], warnings, units }.
   * Coordinates are mm; each part keeps its own drawing position (nesting re-centres it).
   */
  function parse(text, baseName) {
    const { ents, scale, insunits } = readEntities(text);
    const S = p => ({ x: p.x * scale, y: p.y * scale });
    const loops = [], circles = [], pieces = [], warnings = [];
    let poly = null;
    ents.forEach(e => {
      if (e.type === 'LWPOLYLINE') {
        if ((e.flags & 1) && e.v.length >= 2) loops.push(bulgeLoop(e.v).map(S));
        else if (e.v.length >= 2) pieces.push({ pts: e.v.map(S) });
      } else if (e.type === 'POLYLINE') { poly = { v: [], closed: !!(e.flags & 1) }; }
      else if (e.type === 'VERTEX' && poly) { poly.v.push({ x: e.x, y: e.y, b: e.b || 0 }); }
      else if (e.type === 'SEQEND' && poly) { if (poly.closed && poly.v.length >= 2) loops.push(bulgeLoop(poly.v).map(S)); else if (poly.v.length >= 2) pieces.push({ pts: poly.v.map(S) }); poly = null; }
      else if (e.type === 'LINE') { pieces.push({ pts: [S({ x: e.x, y: e.y }), S({ x: e.x2, y: e.y2 })] }); }
      else if (e.type === 'ARC') {
        const a0 = e.a0 * Math.PI / 180, a1 = e.a1 * Math.PI / 180;
        const start = { x: e.x + e.r * Math.cos(a0), y: e.y + e.r * Math.sin(a0) };
        pieces.push({ pts: [start].concat(arcPoints(e.x, e.y, e.r, a0, a1, true)).map(S) });
      } else if (e.type === 'CIRCLE') { circles.push({ x: e.x * scale, y: e.y * scale, dia: 2 * e.r * scale }); }
    });
    chain(pieces).forEach(l => loops.push(l));
    const clean = loops.map(simplify).filter(l => l.length >= 3 && area(l) > 1);
    // outer loops = not inside any other loop
    const outers = clean.filter(l => !clean.some(o => o !== l && area(o) > area(l) && inside(l[0], o)));
    const parts = outers.map((o, i) => {
      const holes = circles.filter(c => inside(c, o)).map(c => ({ x: c.x, y: c.y, dia: c.dia, isSubtract: true }));
      const innerLoops = clean.filter(l => l !== o && inside(l[0], o) && !outers.includes(l));
      if (innerLoops.length) warnings.push(`${baseName || 'DXF'} 부품 ${i + 1}: 원이 아닌 안쪽 윤곽 ${innerLoops.length}개는 지원하지 않아 제외했습니다`);
      return { name: `${baseName || 'DXF'}${outers.length > 1 ? '_' + (i + 1) : ''}`, vertices: o, holes };
    });
    const strayCircles = circles.filter(c => !outers.some(o => inside(c, o)));
    if (strayCircles.length) warnings.push(`외곽 밖의 원 ${strayCircles.length}개는 무시했습니다`);
    if (!parts.length) warnings.push('닫힌 외곽선을 찾지 못했습니다 (LWPOLYLINE 닫힘, 또는 LINE/ARC가 끝점에서 이어져야 함)');
    return { parts, warnings, units: insunits === 1 ? 'inch' : 'mm', scale };
  }

  return { parse, readEntities, bulgeLoop, chain };
});
