// User OBJ import (drag and drop into /v2) — unit/axis guess and placement. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../viewer/lib/user_obj_core.js');

// A 2 x 0.9 x 1.8 m cabinet as Blender would export it: metres, Y-up (height on Y, depth on Z).
const blenderBox = [
  '# Blender 4.2.0',
  'mtllib cabinet.mtl',
  'o Cabinet',
  'v -1 0 -0.45', 'v 1 0 -0.45', 'v 1 1.8 -0.45', 'v -1 1.8 -0.45',
  'v -1 0 0.45', 'v 1 0 0.45', 'v 1 1.8 0.45', 'v -1 1.8 0.45',
  'usemtl Paint',
  'f 1 2 3 4', 'f 5 6 7 8', 'f 1 2 6 5', 'f 4 3 7 8', 'f 1 4 8 5', 'f 2 3 7 6'
].join('\n');

test('stats: counts, bounding box, mtllib and materials', () => {
  const s = U.parseObjStats(blenderBox);
  assert.equal(s.ok, true);
  assert.equal(s.vertices, 8);
  assert.equal(s.faces, 6);
  assert.deepEqual(s.bbox.min, [-1, 0, -0.45]);
  assert.deepEqual(s.bbox.max, [1, 1.8, 0.45]);
  assert.deepEqual(s.mtllibs, ['cabinet.mtl']);
  assert.deepEqual(s.materials, ['Paint']);
});

test('Blender metres Y-up → guessed m + Y, lands 2000 × 900 × 1800 mm with base on the floor', () => {
  const s = U.parseObjStats(blenderBox);
  assert.equal(U.guessUnit(s).unit, 'm');
  assert.equal(U.guessUp(s).up, 'Y');
  const pl = U.computePlacement(s.bbox, 'm', 'Y');
  assert.deepEqual(pl.dims, [2000, 900, 1800]);
  assert.equal(pl.rotateXDeg, 90);
  // every corner ends inside the footprint centred on 0, base at Z = 0, top at 1800
  const pts = blenderBox.split('\n').filter(l => l.startsWith('v ')).map(l => l.split(/\s+/).slice(1).map(Number));
  const out = pts.map(p => U.transformPoint(p, pl));
  const zs = out.map(p => p[2]);
  assert.equal(Math.min(...zs), 0);
  assert.equal(Math.max(...zs), 1800);
  out.forEach(p => { assert.ok(Math.abs(p[0]) <= 1000 + 1e-9); assert.ok(Math.abs(p[1]) <= 450 + 1e-9); });
});

test('this repo\'s own OBJ (mm, Z-up header) is read as mm + Z, size unchanged', () => {
  const file = path.join(__dirname, '..', 'industrial_cnc_and_3dprinter.obj');
  const text = fs.readFileSync(file, 'utf8');
  const s = U.parseObjStats(text);
  assert.equal(s.ok, true);
  assert.equal(U.guessUnit(s).unit, 'mm');
  assert.equal(U.guessUp(s).up, 'Z');
  const pl = U.computePlacement(s.bbox, 'mm', 'Z');
  assert.deepEqual(pl.dims, s.extent.map(v => Math.round(v * 10) / 10));
});

test('the building shell header ("Millimetres, Z-up") wins over the size guess', () => {
  const s = U.parseObjStats('# Millimetres, Z-up.\nv 0 0 0\nv 10 0 0\nv 0 10 5\nf 1 2 3\n');
  assert.equal(U.guessUnit(s).unit, 'mm');   // extent 10 alone would have guessed metres
  assert.equal(U.guessUp(s).up, 'Z');
});

test('unit scale: cm and inch', () => {
  const bbox = { min: [0, 0, 0], max: [100, 50, 10] };
  assert.deepEqual(U.computePlacement(bbox, 'cm', 'Z').dims, [1000, 500, 100]);
  assert.deepEqual(U.computePlacement(bbox, 'in', 'Z').dims, [2540, 1270, 254]);
  assert.throws(() => U.computePlacement(bbox, 'ft', 'Z'));
});

test('files with no faces or too few vertices are refused with a reason', () => {
  const pts = U.parseObjStats('v 0 0 0\nv 1 0 0\nv 0 1 0\n');
  assert.equal(pts.ok, false);
  assert.match(pts.error, /면\(f\)/);
  const empty = U.parseObjStats('# nothing\n');
  assert.equal(empty.ok, false);
  assert.match(empty.error, /정점/);
});

test('MTL: Kd colour and opacity per material, Tr is inverse opacity', () => {
  const m = U.parseMtl('newmtl Paint\nKd 0.8 0.1 0.1\nd 1\nnewmtl Glass\nKd 0.6 0.8 1.0\nTr 0.7\n');
  assert.deepEqual(m.Paint, { kd: [0.8, 0.1, 0.1], opacity: 1 });
  assert.deepEqual(m.Glass.kd, [0.6, 0.8, 1.0]);
  assert.ok(Math.abs(m.Glass.opacity - 0.3) < 1e-9);
});

test('file pairing and asset ids', () => {
  assert.deepEqual(U.pairFiles(['a.obj', 'a.mtl', 'b.OBJ', 'c.txt']),
    [{ obj: 'a.obj', mtl: 'a.mtl' }, { obj: 'b.OBJ', mtl: null }]);
  assert.deepEqual(U.pairFiles(['part.obj', 'materials.mtl']), [{ obj: 'part.obj', mtl: 'materials.mtl' }]);
  const id = U.makeAssetId('Pump Housing v2.obj', 1764000000000);
  assert.match(id, /^user_obj_pump_housing_v2_[0-9a-z]+$/);
  assert.equal(U.isUserAssetId(id), true);
  assert.equal(U.isUserAssetId('multicam_3000'), false);
});
