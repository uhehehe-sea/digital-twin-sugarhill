/*
 * nesting.js — place sketch parts on a sheet (Skyline bottom-left bin packing on bounding boxes).
 *
 * Part geometry convention (shared with nc_program.js and the twin):
 *   outline / holes are given relative to the part's bbox centre ("centred" sketch coords).
 *   A placement gives the sheet position of that centre (cx, cy) and a rotation (0 or 90°).
 *   Sheet coordinates: origin = sheet lower-left corner, X along the long side, Y along the short side.
 *
 * Spacing between parts must be ≥ tool Ø so the cutter fits between neighbours.
 * Browser: window.Nesting · Node: require('../viewer/lib/nesting.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Nesting = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = { sheetL: 2440, sheetW: 1220, marginMm: 15, spacingMm: 12, allowRotate: true };

  /** Centre a sketch (vertices + holes) on its outline bbox. Returns { outline, holes, w, h }. */
  function centrePart(vertices, holes) {
    const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return {
      outline: vertices.map(p => ({ x: p.x - cx, y: p.y - cy })),
      holes: (holes || []).filter(h => h.isSubtract !== false).map(h => ({ x: h.x - cx, y: h.y - cy, dia: h.dia })),
      w: maxX - minX, h: maxY - minY
    };
  }

  /** Rotate a centred point by 0 / 90° (counter-clockwise). */
  function rot(p, deg) { return deg === 90 ? { x: -p.y, y: p.x } : { x: p.x, y: p.y }; }

  /** Transform a centred part into sheet coordinates for a placement. */
  function placeGeometry(part, pl) {
    const tr = p => { const r = rot(p, pl.rot); return { x: r.x + pl.cx, y: r.y + pl.cy }; };
    return {
      outline: part.outline.map(tr),
      holes: part.holes.map(h => Object.assign(tr(h), { dia: h.dia }))
    };
  }

  /**
   * Skyline bottom-left packing.
   * items: [{ id, w, h }]  (bbox of the centred part)
   * Returns { placements:[{ id, cx, cy, rot, w, h }], unplaced:[id], utilization }.
   */
  function nest(items, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const s = o.spacingMm;
    const binW = o.sheetL - 2 * o.marginMm + s;          // each rect is inflated by s; trailing s fits in the margin
    const binH = o.sheetW - 2 * o.marginMm + s;
    let sky = [{ x: 0, y: 0, w: binW }];
    const order = items.map((it, i) => Object.assign({ i }, it))
      .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
    const placements = [], unplaced = [];

    function fitAt(idx, w, h) {                         // y at which a w×h rect fits starting at skyline idx
      let x = sky[idx].x, y = 0, left = w, j = idx;
      if (x + w > binW + 1e-9) return null;
      while (left > 1e-9) {
        if (j >= sky.length) return null;
        y = Math.max(y, sky[j].y);
        if (y + h > binH + 1e-9) return null;
        left -= sky[j].w; j++;
      }
      return y;
    }
    function addSkyline(idx, x, y, w, h) {
      const seg = { x, y: y + h, w };
      sky.splice(idx, 0, seg);
      for (let k = idx + 1; k < sky.length; k++) {      // trim segments now under the new one
        const prev = sky[k - 1], cur = sky[k];
        const overlap = prev.x + prev.w - cur.x;
        if (overlap <= 0) break;
        cur.x += overlap; cur.w -= overlap;
        if (cur.w <= 1e-9) { sky.splice(k, 1); k--; } else break;
      }
      for (let k = 0; k < sky.length - 1; k++) {        // merge equal heights
        if (Math.abs(sky[k].y - sky[k + 1].y) < 1e-9) { sky[k].w += sky[k + 1].w; sky.splice(k + 1, 1); k--; }
      }
    }

    for (const it of order) {
      let best = null;
      const rots = o.allowRotate && Math.abs(it.w - it.h) > 1e-9 ? [0, 90] : [0];
      for (const r of rots) {
        const w = (r ? it.h : it.w) + s, h = (r ? it.w : it.h) + s;
        for (let idx = 0; idx < sky.length; idx++) {
          const y = fitAt(idx, w, h);
          if (y === null) continue;
          const top = y + h, x = sky[idx].x;
          if (!best || top < best.top - 1e-9 || (Math.abs(top - best.top) < 1e-9 && x < best.x)) best = { idx, x, y, w, h, r, top };
        }
      }
      if (!best) { unplaced.push(it.id); continue; }
      addSkyline(best.idx, best.x, best.y, best.w, best.h);
      const pw = best.w - s, ph = best.h - s;
      placements.push({
        id: it.id, rot: best.r, w: pw, h: ph,
        cx: o.marginMm + best.x + pw / 2,
        cy: o.marginMm + best.y + ph / 2
      });
    }
    const used = placements.reduce((a, p) => a + p.w * p.h, 0);
    return { placements, unplaced, utilization: used / (o.sheetL * o.sheetW), options: o };
  }

  return { DEFAULTS, centrePart, rot, placeGeometry, nest };
});
