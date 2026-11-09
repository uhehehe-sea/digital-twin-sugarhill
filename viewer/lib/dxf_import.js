/*
 * dxf_import.js — ASCII DXF → flat panel parts (outline + circular through-holes).
 *
 * Geometry read (model space only; paper-space entities, code 67 = 1, are skipped):
 *   LWPOLYLINE / POLYLINE (bulges → arcs), LINE + ARC chains (joined into closed loops, 0.05 mm),
 *   CIRCLE, ELLIPSE, SPLINE (NURBS evaluated, or fit points), INSERT (block references with
 *   translation / rotation / scale / column-row arrays, nested up to 16 levels).
 * Mirrored entities (extrusion 0,0,-1 — common from CAD "mirror") are mapped to world coordinates.
 * Units from $INSUNITS (inch, feet, mm, cm, m, …). Missing units → mm, with a warning when the drawing
 * is so small that it is probably in inches. No size-based conversion is ever applied silently.
 * Curves are discretised so the chord error is ≤ 0.02 mm (old fixed 5° steps gave ~0.48 mm on R500).
 *
 * Every closed region that is not inside another region becomes a part (a lone circle is a disc part);
 * circles inside it become holes. Non-circular inner loops are reported (the panel model only supports
 * round holes). Open chains and unsupported entity types are reported, never silently dropped.
 *
 * Browser: window.DxfImport · Node: require('../viewer/lib/dxf_import.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DxfImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // $INSUNITS → mm. 0 = unitless (treated as mm).
  const UNIT_MM = { 0: 1, 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100, 15: 10000 };
  const UNIT_NAME = { 1: 'inch', 2: 'feet', 4: 'mm', 5: 'cm', 6: 'm', 9: 'mil', 10: 'yard', 13: 'µm', 14: 'dm' };
  const JOIN_TOL = 0.05;     // mm, endpoint matching when chaining LINE/ARC/open polylines
  const CHORD_TOL = 0.02;    // mm, max distance between a curve and its polygon
  const MAX_DEPTH = 16;      // nested INSERT limit (also stops reference cycles)
  const IGNORED = new Set(['TEXT', 'MTEXT', 'DIMENSION', 'LEADER', 'MLEADER', 'MULTILEADER', 'ATTRIB', 'ATTDEF', 'POINT',
    'VIEWPORT', 'HATCH', 'SOLID', 'TOLERANCE', 'IMAGE', 'WIPEOUT', 'SEQEND', 'VERTEX', 'OLE2FRAME', 'ACAD_TABLE']);

  // ---------------------------------------------------------------- reading
  function pairs(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/), out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const c = parseInt(lines[i].trim(), 10);
      if (Number.isNaN(c)) { i -= 1; continue; }                 // resync on a stray blank line
      out.push([c, lines[i + 1].trim()]);
    }
    return out;
  }

  /** Split into sections and entity records: { header, blocks: Map(name → {base, ents}), ents }. */
  function readDocument(text) {
    const P = pairs(text);
    const header = {}, blocks = new Map(), ents = [];
    let section = null, rec = null, block = null;
    const flush = () => {
      if (!rec) return;
      if (section === 'ENTITIES') ents.push(rec);
      else if (section === 'BLOCKS' && block && rec.type !== 'BLOCK' && rec.type !== 'ENDBLK') block.ents.push(rec);
      rec = null;
    };
    for (let i = 0; i < P.length; i++) {
      const [c, v] = P[i];
      if (c === 0 && v === 'SECTION') { flush(); section = P[i + 1] && P[i + 1][1]; i++; continue; }
      if (c === 0 && v === 'ENDSEC') { flush(); section = null; continue; }
      if (section === 'HEADER') {
        if (c === 9 && P[i + 1]) header[v] = P[i + 1][1];
        continue;
      }
      if (section !== 'ENTITIES' && section !== 'BLOCKS') continue;
      if (c === 0) {
        flush();
        rec = { type: v, codes: [] };
        if (v === 'BLOCK') block = { name: null, base: { x: 0, y: 0 }, ents: [] };
        if (v === 'ENDBLK') { if (block && block.name) blocks.set(block.name, block); block = null; }
        continue;
      }
      if (!rec) continue;
      rec.codes.push([c, v]);
      if (rec.type === 'BLOCK' && block) {
        if (c === 2) block.name = v;
        else if (c === 10) block.base.x = parseFloat(v);
        else if (c === 20) block.base.y = parseFloat(v);
      }
    }
    flush();
    return { header, blocks, ents };
  }

  const num = (rec, code, dflt) => { const p = rec.codes.find(q => q[0] === code); return p ? parseFloat(p[1]) : dflt; };
  const str = (rec, code, dflt) => { const p = rec.codes.find(q => q[0] === code); return p ? p[1] : dflt; };

  // ---------------------------------------------------------------- 2D affine transforms [a b c d e f]
  // x' = a x + c y + e ; y' = b x + d y + f
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const T = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  const det = m => m[0] * m[3] - m[1] * m[2];
  const scaleOf = m => Math.sqrt(Math.abs(det(m)));
  const isSimilarity = m => Math.abs(m[0] * m[0] + m[1] * m[1] - (m[2] * m[2] + m[3] * m[3])) < 1e-9 * (1 + Math.abs(det(m))) &&
    Math.abs(m[0] * m[2] + m[1] * m[3]) < 1e-9 * (1 + Math.abs(det(m)));
  const translate = (x, y) => [1, 0, 0, 1, x, y];
  const rotate = a => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
  const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];
  /** Object coordinate system for 2D entities: extrusion (0,0,-1) mirrors X (arbitrary-axis algorithm). */
  const ocs = rec => (num(rec, 230, 1) < 0 ? [-1, 0, 0, 1, 0, 0] : I);

  // ---------------------------------------------------------------- curve sampling
  function stepsFor(sweep, rWorld) {
    const r = Math.max(rWorld, 1e-9);
    const maxStep = CHORD_TOL >= r ? Math.PI / 4 : Math.min(Math.PI / 18, 2 * Math.acos(1 - CHORD_TOL / r));
    return Math.min(4000, Math.max(2, Math.ceil(Math.abs(sweep) / maxStep)));
  }
  /** Arc points (local coords), excluding the start point, including the end point. */
  function arcPoints(cx, cy, r, a0, a1, ccw, rWorld) {
    let sweep = a1 - a0;
    if (ccw) { while (sweep <= 1e-12) sweep += 2 * Math.PI; } else { while (sweep >= -1e-12) sweep -= 2 * Math.PI; }
    const n = stepsFor(sweep, rWorld === undefined ? r : rWorld), pts = [];
    for (let k = 1; k <= n; k++) { const a = a0 + sweep * k / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    return pts;
  }

  /** Expand a polyline with bulges into points (last point not repeated when closed). */
  function bulgePath(v, closed, sWorld) {
    const out = [];
    const nSeg = closed ? v.length : v.length - 1;
    for (let i = 0; i < v.length; i++) {
      const a = v[i];
      out.push({ x: a.x, y: a.y });
      if (i >= nSeg) break;
      const b = v[(i + 1) % v.length];
      if (Math.abs(a.b || 0) > 1e-9) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < 1e-12) continue;
        const th = 4 * Math.atan(a.b), r = d / (2 * Math.sin(th / 2));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, h = Math.sqrt(Math.max(0, r * r - d * d / 4));
        const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, s = (a.b > 0 ? 1 : -1) * (Math.abs(th) > Math.PI ? -1 : 1);
        const cx = mx + nx * h * s, cy = my + ny * h * s;
        const pts = arcPoints(cx, cy, Math.abs(r), Math.atan2(a.y - cy, a.x - cx), Math.atan2(b.y - cy, b.x - cx), a.b > 0, Math.abs(r) * (sWorld || 1));
        pts.pop();                                         // end point is the next vertex
        out.push(...pts);
      }
    }
    return out;
  }
  /** Back-compat helper (closed loop). */
  const bulgeLoop = v => bulgePath(v, true, 1);

  /** NURBS point by de Boor (2D, optional weights). */
  function deBoor(k, x, t, c, w) {
    const n = c.length - 1;
    let s = k;
    for (let i = k; i <= n; i++) if (x >= t[i] && x < t[i + 1]) { s = i; break; } else if (i === n) s = n;
    if (x >= t[n + 1]) s = n;
    const d = [];
    for (let j = 0; j <= k; j++) { const p = c[j + s - k], ww = w ? w[j + s - k] : 1; d.push({ x: p.x * ww, y: p.y * ww, w: ww }); }
    for (let r = 1; r <= k; r++) {
      for (let j = k; j >= r; j--) {
        const den = t[j + 1 + s - r] - t[j + s - k];
        const al = den === 0 ? 0 : (x - t[j + s - k]) / den;
        d[j] = { x: (1 - al) * d[j - 1].x + al * d[j].x, y: (1 - al) * d[j - 1].y + al * d[j].y, w: (1 - al) * d[j - 1].w + al * d[j].w };
      }
    }
    return { x: d[k].x / d[k].w, y: d[k].y / d[k].w };
  }

  function splinePoints(rec, sWorld) {
    const deg = num(rec, 71, 3), flags = num(rec, 70, 0);
    const knots = [], ctrl = [], fit = [], weights = [];
    let pend = null, pendFit = null;
    for (const [c, v] of rec.codes) {
      const n = parseFloat(v);
      if (c === 40) knots.push(n);
      else if (c === 41) weights.push(n);
      else if (c === 10) { pend = { x: n, y: 0 }; ctrl.push(pend); }
      else if (c === 20 && pend) pend.y = n;
      else if (c === 11) { pendFit = { x: n, y: 0 }; fit.push(pendFit); }
      else if (c === 21 && pendFit) pendFit.y = n;
    }
    const closed = !!(flags & 1) || !!(flags & 2);
    if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) {
      const w = weights.length === ctrl.length ? weights : null;
      const t0 = knots[deg], t1 = knots[ctrl.length];
      // sample densely, then thin: chord control by curvature-blind uniform sampling with enough points
      let len = 0; for (let i = 1; i < ctrl.length; i++) len += Math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].y - ctrl[i - 1].y);
      const n = Math.min(4000, Math.max(16 * (ctrl.length - deg), Math.ceil(len * (sWorld || 1) / 2)));
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(deBoor(deg, t0 + (t1 - t0) * i / n, knots, ctrl, w));
      return { pts, closed };
    }
    if (fit.length >= 2) return { pts: fit, closed, approx: true };
    return null;
  }

  function ellipsePoints(rec, sWorld) {
    const cx = num(rec, 10, 0), cy = num(rec, 20, 0), mx = num(rec, 11, 0), my = num(rec, 21, 0);
    const ratio = num(rec, 40, 1);
    let p0 = num(rec, 41, 0), p1 = num(rec, 42, 2 * Math.PI);
    const a = Math.hypot(mx, my), b = a * ratio, rot = Math.atan2(my, mx);
    let sweep = p1 - p0; while (sweep <= 1e-12) sweep += 2 * Math.PI;
    const full = Math.abs(sweep - 2 * Math.PI) < 1e-9;
    const n = stepsFor(sweep, Math.min(a, b) * (sWorld || 1) * Math.max(1, (a / Math.max(b, 1e-9))));
    const pts = [];
    for (let k = 0; k <= (full ? n - 1 : n); k++) {
      const t = p0 + sweep * k / n, x = a * Math.cos(t), y = b * Math.sin(t);
      pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
    }
    return { pts, closed: full };
  }

  // ---------------------------------------------------------------- entities → primitives (world mm)
  function lwVertices(rec) {
    const v = [];
    for (const [c, s] of rec.codes) {
      const n = parseFloat(s);
      if (c === 10) v.push({ x: n, y: 0, b: 0 });
      else if (c === 20 && v.length) v[v.length - 1].y = n;
      else if (c === 42 && v.length) v[v.length - 1].b = n;
    }
    return v;
  }

  /** Walk entity records (handles POLYLINE…VERTEX…SEQEND runs and INSERT recursion). */
  function collect(ents, M, ctx, depth) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (num(e, 67, 0) === 1) {                        // paper space (title block, viewports)
        if (e.type === 'POLYLINE') while (i + 1 < ents.length && ents[i + 1].type !== 'SEQEND') i++;
        continue;
      }
      const Mo = mul(M, ocs(e)), s = scaleOf(Mo);
      switch (e.type) {
        case 'LINE': {
          ctx.pieces.push({ pts: [T(M, { x: num(e, 10, 0), y: num(e, 20, 0) }), T(M, { x: num(e, 11, 0), y: num(e, 21, 0) })] });
          break;
        }
        case 'CIRCLE': {
          const c = { x: num(e, 10, 0), y: num(e, 20, 0) }, r = num(e, 40, 0);
          if (!(r > 0)) break;
          if (isSimilarity(Mo)) { const w = T(Mo, c); ctx.circles.push({ x: w.x, y: w.y, dia: 2 * r * s }); }
          else ctx.loops.push(arcPoints(c.x, c.y, r, 0, 2 * Math.PI, true, r * s).map(p => T(Mo, p)));
          break;
        }
        case 'ARC': {
          const c = { x: num(e, 10, 0), y: num(e, 20, 0) }, r = num(e, 40, 0);
          if (!(r > 0)) break;
          const a0 = num(e, 50, 0) * Math.PI / 180, a1 = num(e, 51, 360) * Math.PI / 180;
          const start = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) };
          ctx.pieces.push({ pts: [start].concat(arcPoints(c.x, c.y, r, a0, a1, true, r * s)).map(p => T(Mo, p)) });
          break;
        }
        case 'LWPOLYLINE': {
          const v = lwVertices(e), closed = !!(num(e, 70, 0) & 1);
          if (v.length < 2) break;
          const pts = bulgePath(v, closed, s).map(p => T(Mo, p));
          if (closed) ctx.loops.push(pts); else ctx.pieces.push({ pts });
          break;
        }
        case 'POLYLINE': {
          const flags = num(e, 70, 0), v = [];
          let j = i + 1;
          for (; j < ents.length && ents[j].type === 'VERTEX'; j++) {
            if (num(ents[j], 70, 0) & (16 | 64 | 128)) continue;   // spline frame / mesh / polyface vertices
            v.push({ x: num(ents[j], 10, 0), y: num(ents[j], 20, 0), b: num(ents[j], 42, 0) });
          }
          i = (j < ents.length && ents[j].type === 'SEQEND') ? j : j - 1;
          if (flags & (16 | 64)) { ctx.unsupported.POLYFACE = (ctx.unsupported.POLYFACE || 0) + 1; break; }
          if (v.length < 2) break;
          const closed = !!(flags & 1), pts = bulgePath(v, closed, s).map(p => T(Mo, p));
          if (closed) ctx.loops.push(pts); else ctx.pieces.push({ pts });
          break;
        }
        case 'SPLINE': {
          const sp = splinePoints(e, scaleOf(M));
          if (!sp) { ctx.unsupported.SPLINE = (ctx.unsupported.SPLINE || 0) + 1; break; }
          if (sp.approx) ctx.approxSplines++;
          const pts = sp.pts.map(p => T(M, p));
          if (sp.closed || (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= JOIN_TOL)) {
            if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= JOIN_TOL) pts.pop();
            ctx.loops.push(pts);
          } else ctx.pieces.push({ pts });
          break;
        }
        case 'ELLIPSE': {
          const el = ellipsePoints(e, scaleOf(M)), pts = el.pts.map(p => T(M, p));
          if (el.closed) ctx.loops.push(pts); else ctx.pieces.push({ pts });
          break;
        }
        case 'INSERT': {
          const name = str(e, 2, ''), blk = ctx.blocks.get(name);
          if (!blk) { ctx.missingBlocks.add(name); break; }
          if (depth >= MAX_DEPTH) { ctx.tooDeep = true; break; }
          const ip = { x: num(e, 10, 0), y: num(e, 20, 0) }, sx = num(e, 41, 1), sy = num(e, 42, sx), rot = num(e, 50, 0) * Math.PI / 180;
          const cols = Math.max(1, Math.min(1000, num(e, 70, 1))), rows = Math.max(1, Math.min(1000, num(e, 71, 1)));
          const dc = num(e, 44, 0), dr = num(e, 45, 0);
          for (let rI = 0; rI < rows; rI++) for (let cI = 0; cI < cols; cI++) {
            const off = T(rotate(rot), { x: cI * dc, y: rI * dr });
            const Mi = mul(Mo, mul(translate(ip.x + off.x, ip.y + off.y), mul(rotate(rot), mul(scale(sx, sy), translate(-blk.base.x, -blk.base.y)))));
            collect(blk.ents, Mi, ctx, depth + 1);
          }
          break;
        }
        default:
          if (!IGNORED.has(e.type)) ctx.unsupported[e.type] = (ctx.unsupported[e.type] || 0) + 1;
      }
    }
  }

  // ---------------------------------------------------------------- loops
  /** Join open pieces into closed loops. Returns { loops, open: [{gap}] }. */
  function chainPieces(pieces) {
    const loops = [], openPaths = [], open = pieces.slice();
    const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= JOIN_TOL;
    while (open.length) {
      let path = open.shift().pts.slice();
      let grown = true;
      while (grown && !(path.length > 2 && near(path[0], path[path.length - 1]))) {
        grown = false;
        for (let i = 0; i < open.length; i++) {
          const pts = open[i].pts, end = path[path.length - 1], start = path[0];
          if (near(end, pts[0])) path = path.concat(pts.slice(1));
          else if (near(end, pts[pts.length - 1])) path = path.concat(pts.slice().reverse().slice(1));
          else if (near(start, pts[pts.length - 1])) path = pts.slice(0, -1).concat(path);
          else if (near(start, pts[0])) path = pts.slice(1).reverse().concat(path);
          else continue;
          open.splice(i, 1); grown = true; break;
        }
      }
      if (path.length > 3 && near(path[0], path[path.length - 1])) { path.pop(); loops.push(path); }
      else openPaths.push({ gap: Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y) });
    }
    return { loops, open: openPaths };
  }
  /** Back-compat: loops only. */
  const chain = pieces => chainPieces(pieces).loops;

  function signedArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y); return -a / 2; }
  const area = poly => Math.abs(signedArea(poly));
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x)) c = !c;
    }
    return c;
  }
  /** Remove collinear and duplicate points (LINE chains of a rectangle → 4 vertices). */
  function simplify(poly) {
    const dedup = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9; });
    const out = [];
    for (let i = 0; i < dedup.length; i++) {
      const a = dedup[(i - 1 + dedup.length) % dedup.length], b = dedup[i], c = dedup[(i + 1) % dedup.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y))) out.push(b);
    }
    return out.length >= 3 ? out : dedup;
  }
  const r6 = v => Math.round(v * 1e3) / 1e3;
  function loopKey(l) {
    const xs = l.map(p => p.x), ys = l.map(p => p.y);
    return [l.length, r6(Math.min(...xs)), r6(Math.max(...xs)), r6(Math.min(...ys)), r6(Math.max(...ys)), r6(area(l))].join(',');
  }
  function circlePolygon(c) { return arcPoints(c.x, c.y, c.dia / 2, 0, 2 * Math.PI, true, c.dia / 2).slice(0, -1).concat([{ x: c.x + c.dia / 2, y: c.y }]); }

  /**
   * Parse DXF text → { parts:[{ name, vertices, holes:[{x,y,dia,isSubtract}] }], warnings, units, scale, unitsDeclared }.
   * Coordinates are mm; each part keeps its own drawing position (nesting re-centres it).
   */
  function parse(text, baseName) {
    const doc = readDocument(text);
    const insunits = doc.header.$INSUNITS !== undefined ? parseInt(doc.header.$INSUNITS, 10) : null;
    const unitsDeclared = insunits !== null && insunits !== 0 && UNIT_MM[insunits] !== undefined;
    const unitScale = unitsDeclared ? UNIT_MM[insunits] : 1;
    const ctx = { loops: [], pieces: [], circles: [], blocks: doc.blocks, unsupported: {}, missingBlocks: new Set(), approxSplines: 0, tooDeep: false };
    collect(doc.ents, scale(unitScale, unitScale), ctx, 0);

    const warnings = [];
    const { loops: chained, open } = chainPieces(ctx.pieces);
    const seenLoop = new Set();
    const clean = ctx.loops.concat(chained).map(simplify).filter(l => l.length >= 3 && area(l) > 1)
      .filter(l => { const k = loopKey(l); if (seenLoop.has(k)) return false; seenLoop.add(k); return true; });
    const seenC = new Set();
    const circles = ctx.circles.filter(c => { const k = [r6(c.x), r6(c.y), r6(c.dia)].join(','); if (seenC.has(k)) return false; seenC.add(k); return true; });

    // Regions: polygon loops and circles. A region is an outer unless it lies inside a larger region.
    const regions = clean.map(l => ({ kind: 'loop', poly: l, area: area(l), probe: l[0] }))
      .concat(circles.map(c => ({ kind: 'circle', c, poly: null, area: Math.PI * c.dia * c.dia / 4, probe: { x: c.x, y: c.y } })));
    const contains = (o, r) => {
      if (o === r || o.area <= r.area) return false;
      if (o.kind === 'circle') return Math.hypot(r.probe.x - o.c.x, r.probe.y - o.c.y) < o.c.dia / 2;
      return inside(r.probe, o.poly);
    };
    const outers = regions.filter(r => !regions.some(o => contains(o, r)));
    const parts = outers.map((o, i) => {
      const direct = regions.filter(r => r !== o && contains(o, r) && !regions.some(m => m !== o && m !== r && contains(o, m) && contains(m, r)));
      const holes = direct.filter(r => r.kind === 'circle').map(r => ({ x: r.c.x, y: r.c.y, dia: r.c.dia, isSubtract: true }));
      const innerLoops = direct.filter(r => r.kind === 'loop');
      if (innerLoops.length) warnings.push(`${baseName || 'DXF'} 부품 ${i + 1}: 원이 아닌 안쪽 윤곽 ${innerLoops.length}개는 지원하지 않아 제외했습니다`);
      const vertices = o.kind === 'circle' ? circlePolygon(o.c) : o.poly;
      return { name: `${baseName || 'DXF'}${outers.length > 1 ? '_' + (i + 1) : ''}`, vertices, holes };
    });

    if (open.length) {
      const g = Math.max(...open.map(o => o.gap));
      warnings.push(`열린 윤곽 ${open.length}개는 부품으로 만들지 않았습니다 (끝점 간격 최대 ${g.toFixed(2)} mm, 연결 허용 ${JOIN_TOL} mm)`);
    }
    const uns = Object.keys(ctx.unsupported);
    if (uns.length) warnings.push(`지원하지 않는 요소: ${uns.map(k => `${k} ${ctx.unsupported[k]}개`).join(', ')}`);
    if (ctx.missingBlocks.size) warnings.push(`정의가 없는 블록 참조: ${[...ctx.missingBlocks].join(', ')}`);
    if (ctx.tooDeep) warnings.push(`블록 중첩이 ${MAX_DEPTH}단계를 넘어 일부를 읽지 않았습니다`);
    if (ctx.approxSplines) warnings.push(`SPLINE ${ctx.approxSplines}개는 맞춤점(fit point)을 직선으로 이어 근사했습니다`);
    if (!parts.length) warnings.push('닫힌 외곽선을 찾지 못했습니다 (LWPOLYLINE 닫힘, 원, 또는 LINE/ARC가 끝점에서 이어져야 함)');
    if (!unitsDeclared && parts.length) {
      const all = parts.flatMap(p => p.vertices);
      const ext = Math.max(Math.max(...all.map(p => p.x)) - Math.min(...all.map(p => p.x)), Math.max(...all.map(p => p.y)) - Math.min(...all.map(p => p.y)));
      if (ext < 60) warnings.push(`도면에 단위($INSUNITS)가 없어 mm로 읽었습니다 — 전체 크기 ${ext.toFixed(1)} mm. 인치 도면이면 CAD에서 단위를 inch로 지정해 다시 저장하세요`);
    }
    const units = unitsDeclared ? (UNIT_NAME[insunits] || `INSUNITS ${insunits}`) : 'mm';
    return { parts, warnings, units, scale: unitScale, unitsDeclared };
  }

  // readEntities kept for callers of the old API: { ents, scale, insunits }
  function readEntities(text) {
    const doc = readDocument(text);
    const ins = doc.header.$INSUNITS !== undefined ? parseInt(doc.header.$INSUNITS, 10) : 4;
    return { ents: doc.ents, scale: UNIT_MM[ins] || 1, insunits: ins };
  }

  return { parse, readEntities, readDocument, bulgeLoop, chain, CHORD_TOL, JOIN_TOL };
});
