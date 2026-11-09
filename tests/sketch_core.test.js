// Mode 2 sketch → extrude tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const SC = require('../viewer/lib/sketch_core.js');

// Same values as the editor's trapezoid preset (editor_v2.js cadSketchLoadPreset)
const TRAPEZOID = [
  { x: -150, y: -125 },
  { x: 150, y: -125 },
  { x: 90, y: 125 },
  { x: -90, y: 125 }
];
const HOLE = { x: 40, y: 20, dia: 16, isSubtract: true };

function bboxSize(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}

test('extrude: trapezoid preset is 300 x 250 x 40 mm', () => {
  const { geometry, subtractCount } = SC.buildPanelGeometry(THREE, TRAPEZOID, [HOLE], 40);
  const [x, y, z] = bboxSize(geometry);
  assert.ok(Math.abs(x - 300) < 1e-6, `x=${x}`);
  assert.ok(Math.abs(y - 250) < 1e-6, `y=${y}`);
  assert.ok(Math.abs(z - 40) < 1e-6, `z=${z}`);
  assert.equal(subtractCount, 1);
});

test('extrude: thickness input is honoured (not fixed at 40)', () => {
  for (const t of [3, 12.5, 100]) {
    const { geometry } = SC.buildPanelGeometry(THREE, TRAPEZOID, [], t);
    const z = bboxSize(geometry)[2];
    assert.ok(Math.abs(z - t) < 1e-5, `t=${t} z=${z}`);
  }
});

test('thickness: 0, negative, text and too-large values are rejected (no silent 40 mm)', () => {
  for (const bad of [0, '0', -5, 'abc', '', NaN, 5000]) {
    assert.equal(SC.validateThickness(bad).ok, false, `accepted ${bad}`);
  }
  assert.deepEqual(SC.validateThickness('25.4'), { ok: true, value: 25.4 });
  assert.throws(() => SC.buildPanelGeometry(THREE, TRAPEZOID, [], 0));
});

test('hole: boundary vertices are centred on the requested position with the requested radius', () => {
  const { geometry } = SC.buildPanelGeometry(THREE, TRAPEZOID, [HOLE], 40);
  const pos = geometry.attributes.position;
  const ring = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.abs(z) > 1e-6) continue;            // sketch plane only
    const d = Math.hypot(x - HOLE.x, y - HOLE.y);
    if (d > 7 && d < 9) ring.set(`${x.toFixed(4)},${y.toFixed(4)}`, { x, y });
  }
  const pts = [...ring.values()];
  assert.equal(pts.length, SC.holePolygonSides(THREE, SC.DEFAULT_CURVE_SEGMENTS));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  assert.ok(Math.abs(cx - HOLE.x) < 1e-4, `cx=${cx}`);
  assert.ok(Math.abs(cy - HOLE.y) < 1e-4, `cy=${cy}`);
  for (const p of pts) {
    const r = Math.hypot(p.x - HOLE.x, p.y - HOLE.y);
    assert.ok(Math.abs(r - HOLE.dia / 2) < 1e-4, `r=${r}`);   // Float32 storage
  }
});

test('precision: a 16 mm hole is a 24-gon with ~0.068 mm chordal error (documented, not hidden)', () => {
  assert.equal(SC.holePolygonSides(THREE, 12), 24);
  const err = SC.chordalError(8, 24);
  assert.ok(Math.abs(err - 0.06844) < 1e-4, `err=${err}`);
  const layers = SC.precisionLayers(THREE, [HOLE]);
  assert.match(layers.display, /24각형/);
  assert.match(layers.machining, /미검증/);
});

test('hole validation: inside OK, outside / edge-crossing / overlapping rejected', () => {
  assert.equal(SC.validateHole(TRAPEZOID, HOLE, []).ok, true);
  // centre outside the trapezoid (top edge is only 180 wide)
  assert.match(SC.validateHole(TRAPEZOID, { x: 140, y: 110, dia: 10 }, []).error, /외곽 밖/);
  // centre inside but circle crosses the bottom edge (y = -125)
  assert.match(SC.validateHole(TRAPEZOID, { x: 0, y: -120, dia: 16 }, []).error, /테두리/);
  // overlapping an existing hole
  assert.match(SC.validateHole(TRAPEZOID, { x: 50, y: 20, dia: 16 }, [HOLE]).error, /겹칩니다/);
  assert.equal(SC.validateHole(TRAPEZOID, { x: 0, y: 0, dia: 0 }, []).ok, false);
});

test('snap: 0.1 / 1 / 10 mm steps round without float noise', () => {
  assert.deepEqual(SC.SNAP_STEPS, [0.1, 1, 10]);
  assert.equal(SC.snapValue(0.26, 0.1), 0.3);
  assert.equal(SC.snapValue(12.49, 1), 12);
  assert.equal(SC.snapValue(-14, 10), -10);
  assert.equal(SC.snapValue(15, 10), 20);
});
