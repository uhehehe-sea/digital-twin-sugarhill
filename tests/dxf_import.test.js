// DXF import tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const DX = require('../viewer/lib/dxf_import.js');
const CC = require('../viewer/lib/cam_core.js');

const dxf = (body, units) =>
  `0\nSECTION\n2\nHEADER\n${units !== undefined ? `9\n$INSUNITS\n70\n${units}\n` : ''}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const lw = (pts, closed = 1, bulges = []) =>
  `0\nLWPOLYLINE\n8\n0\n90\n${pts.length}\n70\n${closed}\n` + pts.map((p, i) => `10\n${p[0]}\n20\n${p[1]}\n` + (bulges[i] ? `42\n${bulges[i]}\n` : '')).join('');
const circle = (x, y, r) => `0\nCIRCLE\n8\n0\n10\n${x}\n20\n${y}\n40\n${r}\n`;

test('closed LWPOLYLINE + circle inside → one part with one hole', () => {
  const r = DX.parse(dxf(lw([[0, 0], [300, 0], [300, 200], [0, 200]]) + circle(100, 100, 15)), 'plate');
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].vertices.length, 4);
  assert.deepEqual(r.parts[0].holes, [{ x: 100, y: 100, dia: 30, isSubtract: true }]);
  assert.equal(r.parts[0].name, 'plate');
});

test('inch units are converted to mm', () => {
  const r = DX.parse(dxf(lw([[0, 0], [10, 0], [10, 5], [0, 5]]), 1));
  const xs = r.parts[0].vertices.map(p => p.x);
  assert.equal(Math.max(...xs), 254);
  assert.equal(r.units, 'inch');
});

test('bulge (rounded end) becomes arc points on the right radius', () => {
  // 200×100 slot with a semicircular right end: bulge 1 = 180° arc
  const r = DX.parse(dxf(lw([[0, 0], [200, 0], [200, 100], [0, 100]], 1, [0, 1, 0, 0])));
  const v = r.parts[0].vertices;
  const arcPts = v.filter(p => p.x > 200 + 1e-6);
  assert.ok(arcPts.length > 5);
  arcPts.forEach(p => assert.ok(Math.abs(Math.hypot(p.x - 200, p.y - 50) - 50) < 1e-6));
  assert.ok(Math.abs(Math.max(...v.map(p => p.x)) - 250) < 0.2);
});

test('round trip: the nesting DXF exported by cam_core comes back as 6 parts with 5 holes each', () => {
  const text = CC.buildNestingDXF({ width: 80, depth: 80, bore: 40, pcd: 60, boltDia: 6.6 }, { stockX: 400, stockY: 300, margin: 10, partSpacing: 12, partCount: 6 });
  const r = DX.parse(text, 'mount');
  assert.equal(r.parts.length, 6);
  r.parts.forEach(p => {
    assert.equal(p.vertices.length, 4, 'LINE chain should simplify to a rectangle');
    assert.equal(p.holes.length, 5);
    assert.equal(p.holes.filter(h => Math.abs(h.dia - 40) < 1e-9).length, 1);
  });
  assert.equal(r.warnings.length, 0);
});

test('non-circular inner cut-outs and open geometry are reported, not silently mis-cut', () => {
  const r = DX.parse(dxf(lw([[0, 0], [300, 0], [300, 300], [0, 300]]) + lw([[100, 100], [200, 100], [200, 200], [100, 200]])));
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].holes.length, 0);
  assert.match(r.warnings.join(' '), /원이 아닌 안쪽 윤곽/);
  const open = DX.parse(dxf(lw([[0, 0], [100, 0], [100, 100]], 0)));
  assert.equal(open.parts.length, 0);
  assert.match(open.warnings.join(' '), /닫힌 외곽선/);
});
