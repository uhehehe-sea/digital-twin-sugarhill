// Polymer CAM nesting / DXF tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../viewer/lib/cam_core.js');

// Defaults from polymer_auto_cam_nesting_studio.html (geomParams / nestingParams)
const PART = { width: 80, depth: 80, bore: 40, pcd: 60, boltDia: 6.6 };
const NEST = { stockX: 400, stockY: 300, margin: 10, partSpacing: 12, partCount: 6 };

// Verbatim copy of the pre-Phase-1 downloadNestingDXF() body (string building only),
// kept as the reference so the extraction is proven not to change the file.
function legacyDXF(geomParams, nestingParams) {
  let dxf = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;
  const pw = geomParams.width;
  const pd = geomParams.depth;
  const m = nestingParams.margin;
  const spacing = nestingParams.partSpacing;
  const usableW = nestingParams.stockX - m * 2;
  const cols = Math.floor((usableW + spacing) / (pw + spacing));
  const count = nestingParams.partCount;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = m + col * (pw + spacing) + spacing / 2;
    const py = m + row * (pd + spacing) + spacing / 2;
    dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px}\n20\n${py}\n30\n0.0\n11\n${px + pw}\n21\n${py}\n31\n0.0\n`;
    dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px + pw}\n20\n${py}\n30\n0.0\n11\n${px + pw}\n21\n${py + pd}\n31\n0.0\n`;
    dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px + pw}\n20\n${py + pd}\n30\n0.0\n11\n${px}\n21\n${py + pd}\n31\n0.0\n`;
    dxf += `0\nLINE\n8\nPART_OUTER\n10\n${px}\n20\n${py + pd}\n30\n0.0\n11\n${px}\n21\n${py}\n31\n0.0\n`;
    const cx = px + pw / 2;
    const cy = py + pd / 2;
    dxf += `0\nCIRCLE\n8\nBORE_HOLE\n10\n${cx}\n20\n${cy}\n30\n0.0\n40\n${geomParams.bore / 2}\n`;
    const pcdR = geomParams.pcd / 2;
    const boltR = geomParams.boltDia / 2;
    for (let b = 0; b < 4; b++) {
      const ang = (Math.PI / 2) * b + (Math.PI / 4);
      const bx = cx + pcdR * Math.cos(ang);
      const by = cy + pcdR * Math.sin(ang);
      dxf += `0\nCIRCLE\n8\nBOLT_HOLE\n10\n${bx}\n20\n${by}\n30\n0.0\n40\n${boltR}\n`;
    }
  }
  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}

test('DXF: extracted generator is byte-identical to the previous implementation', () => {
  for (const partCount of [1, 6, 12]) {
    const n = { ...NEST, partCount };
    assert.equal(CC.buildNestingDXF(PART, n), legacyDXF(PART, n), `partCount=${partCount}`);
  }
});

test('layout: default 400x300 sheet holds 12 parts of 80x80 (4 x 3)', () => {
  const L = CC.gridNestLayout(PART, NEST);
  assert.equal(L.cols, 4);
  assert.equal(L.rows, 3);
  assert.equal(L.capacity, 12);
  assert.equal(L.placed.length, 6);
  assert.deepEqual([L.placed[0].px, L.placed[0].py], [16, 16]);   // margin 10 + spacing/2
  assert.deepEqual([L.placed[1].px, L.placed[1].py], [108, 16]);  // + (80 + 12)
});

test('DXF: entity coordinates match the layout (outline, bore, bolt holes)', () => {
  const L = CC.gridNestLayout(PART, NEST);
  const ents = CC.parseDXFEntities(CC.buildNestingDXF(PART, NEST));
  assert.equal(ents.length, NEST.partCount * 9);                   // 4 LINE + 5 CIRCLE per part

  L.placed.forEach((p, i) => {
    const e = ents.slice(i * 9, i * 9 + 9);
    const lines = e.filter(x => x.type === 'LINE');
    const xs = lines.flatMap(l => [l.x1, l.x2]);
    const ys = lines.flatMap(l => [l.y1, l.y2]);
    assert.equal(Math.min(...xs), p.px);
    assert.equal(Math.max(...xs), p.px + PART.width);
    assert.equal(Math.min(...ys), p.py);
    assert.equal(Math.max(...ys), p.py + PART.depth);

    const bore = e.find(x => x.layer === 'BORE_HOLE');
    assert.deepEqual([bore.x, bore.y, bore.r], [p.cx, p.cy, PART.bore / 2]);

    const bolts = e.filter(x => x.layer === 'BOLT_HOLE');
    const expected = CC.boltHoleCentres(p.cx, p.cy, PART.pcd);
    assert.equal(bolts.length, 4);
    bolts.forEach((b, k) => {
      assert.ok(Math.abs(b.x - expected[k].x) < 1e-9);
      assert.ok(Math.abs(b.y - expected[k].y) < 1e-9);
      assert.equal(b.r, PART.boltDia / 2);
      // each bolt hole sits on the 60 mm pitch circle
      assert.ok(Math.abs(Math.hypot(b.x - p.cx, b.y - p.cy) - PART.pcd / 2) < 1e-9);
    });
  });
});

test('layout: parts beyond sheet capacity are flagged offSheet (known defect, fixed in Phase 3)', () => {
  const L = CC.gridNestLayout(PART, { ...NEST, partCount: 20 });
  const off = L.placed.filter(p => p.offSheet).map(p => p.index + 1);
  assert.deepEqual(off, [13, 14, 15, 16, 17, 18, 19, 20]);
});
