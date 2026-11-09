// DXF dimensional accuracy — the four review drawings (2026-11-09 §5-3) plus real-CAD cases.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const DX = require('../viewer/lib/dxf_import.js');

const header = units => `0\nSECTION\n2\nHEADER\n${units !== undefined ? `9\n$INSUNITS\n70\n${units}\n` : ''}0\nENDSEC\n`;
const dxf = (body, units, blocks = '') =>
  header(units) + (blocks ? `0\nSECTION\n2\nBLOCKS\n${blocks}0\nENDSEC\n` : '') + `0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
const lw = (pts, closed = 1, bulges = [], extra = '') =>
  `0\nLWPOLYLINE\n8\n0\n${extra}90\n${pts.length}\n70\n${closed}\n` + pts.map((p, i) => `10\n${p[0]}\n20\n${p[1]}\n` + (bulges[i] ? `42\n${bulges[i]}\n` : '')).join('');
const circle = (x, y, r, extra = '') => `0\nCIRCLE\n8\n0\n${extra}10\n${x}\n20\n${y}\n40\n${r}\n`;
const line = (a, b) => `0\nLINE\n8\n0\n10\n${a[0]}\n20\n${a[1]}\n11\n${b[0]}\n21\n${b[1]}\n`;
const arc = (c, r, a0, a1, extra = '') => `0\nARC\n8\n0\n${extra}10\n${c[0]}\n20\n${c[1]}\n40\n${r}\n50\n${a0}\n51\n${a1}\n`;

const bbox = vs => ({ minX: Math.min(...vs.map(p => p.x)), maxX: Math.max(...vs.map(p => p.x)), minY: Math.min(...vs.map(p => p.y)), maxY: Math.max(...vs.map(p => p.y)) });
const polyArea = poly => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y); return Math.abs(a / 2); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

// ------------------------------------------------------------ review drawings 1-4
test('drawing 1: rectangle 400 × 250 (LWPOLYLINE, 4 points) is exact', () => {
  const r = DX.parse(dxf(lw([[0, 0], [400, 0], [400, 250], [0, 250]]), 4), 'rect');
  assert.equal(r.parts.length, 1);
  const b = bbox(r.parts[0].vertices);
  assert.deepEqual([b.minX, b.maxX, b.minY, b.maxY], [0, 400, 0, 250]);
  assert.equal(r.parts[0].vertices.length, 4);
  assert.equal(r.warnings.length, 0);
});

test('drawing 2: rectangle + Ø22 hole keeps hole position and diameter exactly', () => {
  const r = DX.parse(dxf(lw([[0, 0], [400, 0], [400, 250], [0, 250]]) + circle(100, 125, 11), 4));
  assert.deepEqual(r.parts[0].holes, [{ x: 100, y: 125, dia: 22, isSubtract: true }]);
});

test('drawing 3: bulge sign — +1 bulges outward, -1 bulges inward (CCW outline)', () => {
  // bottom edge (0,0)->(100,0) of a CCW square carries the bulge
  const out = DX.parse(dxf(lw([[0, 0], [100, 0], [100, 100], [0, 100]], 1, [1]))).parts[0].vertices;
  near(bbox(out).minY, -50, 0.02, 'outward semicircle');
  // inscribed polygon loses ≈ (2/3)·chord_tol·arc_length = 2.1 mm² on this semicircle
  near(polyArea(out), 100 * 100 + Math.PI * 50 * 50 / 2, 3, 'area +');
  const inw = DX.parse(dxf(lw([[0, 0], [100, 0], [100, 100], [0, 100]], 1, [-1]))).parts[0].vertices;
  near(bbox(inw).minY, 0, 1e-9, 'inward semicircle keeps the bottom line');
  near(polyArea(inw), 100 * 100 - Math.PI * 50 * 50 / 2, 3, 'area -');
  inw.filter(p => p.y > 1e-6 && p.y < 99 && p.x > 1e-6 && p.x < 99.999)
    .forEach(p => near(Math.hypot(p.x - 50, p.y), 50, 1e-6, 'radius'));
  // quarter bulge: tan(90°/4)
  const q = DX.parse(dxf(lw([[0, 0], [100, 0], [100, 100], [0, 100]], 1, [0, 0, Math.tan(Math.PI / 8)]))).parts[0].vertices;
  const topArc = q.filter(p => p.y > 100 + 1e-6);
  const sag = Math.max(...topArc.map(p => p.y)) - 100;
  near(sag, 100 / 2 * Math.tan(Math.PI / 8), 0.02, 'quarter-bulge sagitta');
});

test('drawing 4: inch drawing uses $INSUNITS (not size guessing); missing units warn', () => {
  const r = DX.parse(dxf(lw([[0, 0], [12, 0], [12, 6], [0, 6]]) + circle(3, 3, 0.25), 1));
  assert.equal(r.units, 'inch');
  const b = bbox(r.parts[0].vertices);
  near(b.maxX, 304.8, 1e-9); near(b.maxY, 152.4, 1e-9);
  near(r.parts[0].holes[0].dia, 12.7, 1e-9);
  const feet = DX.parse(dxf(lw([[0, 0], [1, 0], [1, 1], [0, 1]]), 2));
  near(bbox(feet.parts[0].vertices).maxX, 304.8, 1e-9, 'feet');
  const none = DX.parse(dxf(lw([[0, 0], [10, 0], [10, 5], [0, 5]])));
  near(bbox(none.parts[0].vertices).maxX, 10, 1e-9, 'unitless stays mm');
  assert.match(none.warnings.join(' '), /단위/);
});

// ------------------------------------------------------------ chord accuracy
test('arc discretisation: chord error stays under 0.02 mm even for R500', () => {
  const R = 500;
  const r = DX.parse(dxf(lw([[0, 0], [2 * R, 0], [2 * R, 100], [0, 100]], 1, [1]), 4)).parts[0].vertices;
  const pts = r.filter(p => p.y < -1e-6);
  for (let i = 1; i < pts.length; i++) {
    const mx = (pts[i].x + pts[i - 1].x) / 2, my = (pts[i].y + pts[i - 1].y) / 2;
    const sag = R - Math.hypot(mx - R, my);
    assert.ok(sag <= 0.02 + 1e-9, `chord error ${sag.toFixed(4)} mm`);
  }
});

// ------------------------------------------------------------ real-CAD cases
test('LINE + ARC chain with a 0.01 mm gap closes; a 2 mm gap is reported as open', () => {
  const body = line([0, 0], [200, 0]) + arc([200, 50], 50, 270, 90) + line([200, 100], [0, 100]) + line([0, 100], [0, 0.01]);
  const r = DX.parse(dxf(body, 4));
  assert.equal(r.parts.length, 1);
  near(bbox(r.parts[0].vertices).maxX, 250, 0.02);
  const gap = DX.parse(dxf(line([0, 0], [200, 0]) + line([200, 0], [200, 100]) + line([200, 100], [0, 100]) + line([0, 100], [0, 2]), 4));
  assert.equal(gap.parts.length, 0);
  assert.match(gap.warnings.join(' '), /열린 윤곽 1개/);
  assert.match(gap.warnings.join(' '), /2(\.0+)? ?mm/);
});

test('round parts: a lone circle is a disc part; a circle inside it is its hole (washer)', () => {
  const r = DX.parse(dxf(circle(0, 0, 50) + circle(0, 0, 10) + lw([[200, 0], [300, 0], [300, 100], [200, 100]]), 4), 'w');
  assert.equal(r.parts.length, 2);
  const disc = r.parts.find(p => bbox(p.vertices).maxX < 100);
  near(bbox(disc.vertices).maxX, 50, 1e-9);
  near(polyArea(disc.vertices), Math.PI * 2500, Math.PI * 2500 * 0.001);
  assert.deepEqual(disc.holes, [{ x: 0, y: 0, dia: 20, isSubtract: true }]);
  assert.ok(!r.warnings.some(w => /외곽 밖의 원/.test(w)));
});

test('duplicate entities (common in CAD exports) do not double holes or parts', () => {
  const sq = lw([[0, 0], [100, 0], [100, 100], [0, 100]]);
  const r = DX.parse(dxf(sq + sq + circle(50, 50, 5) + circle(50, 50, 5), 4));
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].holes.length, 1);
});

test('mirrored entities (extrusion 0,0,-1) are placed in world coordinates', () => {
  const ocs = '210\n0\n220\n0\n230\n-1\n';
  // OCS x = -100 → world x = +100
  const r = DX.parse(dxf(lw([[0, 0], [300, 0], [300, 200], [0, 200]]) + circle(-100, 50, 5, ocs), 4));
  assert.deepEqual(r.parts[0].holes.map(h => [h.x, h.y]), [[100, 50]]);
  // mirrored ARC: OCS centre (-200,50), 270→90 CCW in OCS = right half in OCS = left half in world? world centre (200,50)
  const body = line([0, 0], [200, 0]) + arc([-200, 50], 50, 90, 270, ocs) + line([200, 100], [0, 100]) + line([0, 100], [0, 0]);
  const m = DX.parse(dxf(body, 4));
  assert.equal(m.parts.length, 1);
  near(bbox(m.parts[0].vertices).maxX, 250, 0.02, 'mirrored arc bulges to +x in world');
});

test('BLOCKS: definitions are not parts by themselves; INSERT places them (translate, rotate, scale)', () => {
  const blk = `0\nBLOCK\n8\n0\n2\nPLATE\n70\n0\n10\n0\n20\n0\n` + lw([[0, 0], [100, 0], [100, 50], [0, 50]]) + circle(25, 25, 5) + `0\nENDBLK\n`;
  const ins = (x, y, rot = 0, sx = 1) => `0\nINSERT\n8\n0\n2\nPLATE\n10\n${x}\n20\n${y}\n41\n${sx}\n42\n${sx}\n50\n${rot}\n`;
  const none = DX.parse(dxf('', 4, blk));
  assert.equal(none.parts.length, 0, 'an unused block definition is not geometry');
  const r = DX.parse(dxf(ins(1000, 0) + ins(0, 1000, 90) + ins(2000, 0, 0, 2), 4, blk));
  assert.equal(r.parts.length, 3);
  const byX = r.parts.slice().sort((a, b) => bbox(a.vertices).minX - bbox(b.vertices).minX);
  const rot = byX[0]; // rotated 90° about (0,1000): x in [-50,0], y in [1000,1100]
  const br = bbox(rot.vertices);
  near(br.minX, -50, 1e-9); near(br.maxX, 0, 1e-9); near(br.minY, 1000, 1e-9); near(br.maxY, 1100, 1e-9);
  near(rot.holes[0].x, -25, 1e-9); near(rot.holes[0].y, 1025, 1e-9);
  const big = byX[2];
  near(bbox(big.vertices).maxX - bbox(big.vertices).minX, 200, 1e-9, 'scale 2');
  near(big.holes[0].dia, 20, 1e-9, 'hole scales too');
});

test('paper-space entities (title block, code 67 = 1) are ignored', () => {
  const ps = `0\nLWPOLYLINE\n8\n0\n67\n1\n90\n4\n70\n1\n10\n0\n20\n0\n10\n420\n20\n0\n10\n420\n20\n297\n10\n0\n20\n297\n`;
  const r = DX.parse(dxf(ps + lw([[0, 0], [50, 0], [50, 50], [0, 50]]), 4));
  assert.equal(r.parts.length, 1);
  near(bbox(r.parts[0].vertices).maxX, 50, 1e-9);
});

test('SPLINE (closed, degree 3) is approximated within 0.05 mm of the true curve; ELLIPSE too', () => {
  // A periodic cubic B-spline through a circle-like control polygon is not a circle, so instead test
  // a clamped spline whose exact curve we can evaluate: a straight-ish open spline + lines closing it.
  // Clamped cubic with control points on a line → the curve is that line.
  const spl = `0\nSPLINE\n8\n0\n70\n8\n71\n3\n72\n8\n73\n4\n` +
    [0, 0, 0, 0, 1, 1, 1, 1].map(k => `40\n${k}\n`).join('') +
    [[0, 0], [100, 0], [200, 0], [300, 0]].map(p => `10\n${p[0]}\n20\n${p[1]}\n30\n0\n`).join('');
  const r = DX.parse(dxf(spl + line([300, 0], [300, 100]) + line([300, 100], [0, 100]) + line([0, 100], [0, 0]), 4));
  assert.equal(r.parts.length, 1);
  const b = bbox(r.parts[0].vertices);
  assert.deepEqual([b.minX, b.maxX, b.minY, b.maxY].map(v => Math.round(v * 1000) / 1000), [0, 300, 0, 100]);
  // full ellipse 200 × 100 as an outline
  const ell = `0\nELLIPSE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n100\n21\n0\n31\n0\n40\n0.5\n41\n0\n42\n${2 * Math.PI}\n`;
  const e = DX.parse(dxf(ell, 4));
  assert.equal(e.parts.length, 1);
  const eb = bbox(e.parts[0].vertices);
  near(eb.maxX, 100, 0.05); near(eb.maxY, 50, 0.05);
  near(polyArea(e.parts[0].vertices), Math.PI * 100 * 50, Math.PI * 100 * 50 * 0.001);
});

test('unsupported entities are named in warnings instead of vanishing', () => {
  const r = DX.parse(dxf(lw([[0, 0], [100, 0], [100, 100], [0, 100]]) + `0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n5\n1\nhello\n` + `0\nREGION\n8\n0\n`, 4));
  assert.equal(r.parts.length, 1);
  assert.match(r.warnings.join(' '), /REGION/);
  assert.ok(!/TEXT/.test(r.warnings.join(' ')), 'annotation is ignored silently');
});
