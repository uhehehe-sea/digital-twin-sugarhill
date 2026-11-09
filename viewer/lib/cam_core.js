/*
 * cam_core.js — pure functions behind the polymer CAM / nesting page.
 *
 * Loaded two ways:
 *   - browser: <script src="/lib/cam_core.js"> → window.CamCore
 *   - Node tests: require('../viewer/lib/cam_core.js')
 *
 * Phase 1 extracts these WITHOUT changing behaviour, so the G-code and DXF stay
 * byte-identical to the previous version. Known defects (no clamp to the sheet
 * capacity, no kerf, no rotation) are documented in docs/AUDIT.md §7 and are
 * scheduled for Phase 3. `offSheet` is reported so the UI can warn about it.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CamCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Simple rectangular grid placement (bounding boxes, no rotation, no kerf).
   * part:    { width, depth }
   * nesting: { stockX, stockY, margin, partSpacing, partCount }
   * Returns  { cols, rows, capacity, placed: [{ index, col, row, px, py, cx, cy, offSheet }] }
   * px/py = lower-left corner of the part, cx/cy = its centre, all in sheet mm.
   */
  function gridNestLayout(part, nesting) {
    const pw = part.width;
    const pd = part.depth;
    const m = nesting.margin;
    const spacing = nesting.partSpacing;
    const usableW = nesting.stockX - m * 2;
    const usableH = nesting.stockY - m * 2;
    const cols = Math.floor((usableW + spacing) / (pw + spacing));
    const rows = Math.floor((usableH + spacing) / (pd + spacing));
    const capacity = Math.max(0, cols) * Math.max(0, rows);

    const placed = [];
    for (let i = 0; i < nesting.partCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const px = m + col * (pw + spacing) + spacing / 2;
      const py = m + row * (pd + spacing) + spacing / 2;
      placed.push({
        index: i,
        col,
        row,
        px,
        py,
        cx: px + pw / 2,
        cy: py + pd / 2,
        offSheet: px + pw > nesting.stockX || py + pd > nesting.stockY
      });
    }
    return { cols, rows, capacity, placed };
  }

  /** Bolt-hole centres on the pitch circle, same angles as the G-code (45°, 135°, ...). */
  function boltHoleCentres(cx, cy, pcd) {
    const pcdR = pcd / 2;
    const out = [];
    for (let b = 0; b < 4; b++) {
      const ang = (Math.PI / 2) * b + (Math.PI / 4);
      out.push({ x: cx + pcdR * Math.cos(ang), y: cy + pcdR * Math.sin(ang) });
    }
    return out;
  }

  /**
   * ASCII DXF of the nested parts (LINE × 4 outline, CIRCLE bore, CIRCLE × 4 bolts per part).
   * part: { width, depth, bore, pcd, boltDia }
   * Output is byte-identical to the pre-Phase-1 downloadNestingDXF().
   * Note: no $INSUNITS header — the file does not declare its units (mm assumed).
   */
  function buildNestingDXF(part, nesting) {
    const pw = part.width;
    const pd = part.depth;
    let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
    const layout = gridNestLayout(part, nesting);
    layout.placed.forEach(({ px, py }) => {
      dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px}\n20\n${py}\n30\n0.0\n11\n${px + pw}\n21\n${py}\n31\n0.0\n`;
      dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px + pw}\n20\n${py}\n30\n0.0\n11\n${px + pw}\n21\n${py + pd}\n31\n0.0\n`;
      dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px + pw}\n20\n${py + pd}\n30\n0.0\n11\n${px}\n21\n${py + pd}\n31\n0.0\n`;
      dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px}\n20\n${py + pd}\n30\n0.0\n11\n${px}\n21\n${py}\n31\n0.0\n`;

      const cx = px + pw / 2;
      const cy = py + pd / 2;
      dxf += `0\nCIRCLE\n8\nBORE_HOLE\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n${part.bore / 2}\n`;

      const boltR = part.boltDia / 2;
      boltHoleCentres(cx, cy, part.pcd).forEach(({ x, y }) => {
        dxf += `0\nCIRCLE\n8\nBOLT_HOLE\n10\n${x}\n20\n${y}\n30\n0.0\n40\n${boltR}\n`;
      });
    });
    dxf += `0\nENDSEC\n0\nEOF\n`;
    return dxf;
  }

  /**
   * Minimal DXF entity reader for tests and checks: returns
   * [{ type:'LINE', layer, x1, y1, x2, y2 } | { type:'CIRCLE', layer, x, y, r }].
   */
  function parseDXFEntities(text) {
    const lines = text.split('\n');
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1].trim()]);
    const out = [];
    let cur = null;
    for (const [code, val] of pairs) {
      if (code === '0') {
        if (cur) out.push(cur);
        cur = (val === 'LINE' || val === 'CIRCLE') ? { type: val } : null;
        continue;
      }
      if (!cur) continue;
      const n = parseFloat(val);
      if (code === '8') cur.layer = val;
      else if (cur.type === 'LINE') {
        if (code === '10') cur.x1 = n; else if (code === '20') cur.y1 = n;
        else if (code === '11') cur.x2 = n; else if (code === '21') cur.y2 = n;
      } else if (cur.type === 'CIRCLE') {
        if (code === '10') cur.x = n; else if (code === '20') cur.y = n; else if (code === '40') cur.r = n;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  return { gridNestLayout, boltHoleCentres, buildNestingDXF, parseDXFEntities };
});
