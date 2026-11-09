// Heightmap sheet carving: grid, carve depth, monotonicity, removed volume/mass.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const SC = require('../viewer/lib/sheet_carve.js');

test('grid: vertex cap for a full sheet, cell never below 4 mm', () => {
  const g = SC.computeGrid(2440, 1220, 4);
  assert.ok((g.nx + 1) * (g.ny + 1) <= 120000, `vertices ${(g.nx + 1) * (g.ny + 1)}`);
  assert.ok(g.cellX >= 4 && g.cellY >= 4, `cell ${g.cellX}x${g.cellY}`);
  const small = SC.computeGrid(300, 300, 4);
  assert.equal(small.cellX, 4);
  assert.equal(small.cellY, 4);
});

test('heightmap: init heights equal the sheet thickness', () => {
  const hm = SC.createHeightmap(200, 100, 12, 4);
  assert.equal(hm.nx, 50);
  assert.equal(hm.ny, 25);
  assert.ok(hm.h.every(v => v === 12));
  assert.equal(SC.removedVolume(hm), 0);
});

test('carve: straight cut lowers only the tool disc to the tip depth', () => {
  const hm = SC.createHeightmap(200, 100, 12, 4);
  const r = SC.carveSegment(hm, 20, 50, 180, 50, -4, 3);
  assert.ok(r.changed.length > 0, 'some vertices carved');
  const w = hm.nx + 1;
  const onLine = hm.h[12 * w + 25];          // (x=100, y=48) — on the cut line
  assert.equal(onLine, 8);
  const far = hm.h[0];                        // (0,0) — far from the cut
  assert.equal(far, 12);
  const edge = hm.h[12 * w + 25];             // same vertex: still 8, not deeper
  assert.equal(edge, 8);
  // a vertex 2 mm off the line (inside the 3 mm radius) is carved; 6 mm off is not
  const near = hm.h[13 * w + 25];             // (100, 52) — 2 mm off the line
  assert.equal(near, 8);
  const off = hm.h[10 * w + 25];              // (100, 40) — 10 mm off the line
  assert.equal(off, 12);
});

test('carve: heights only decrease, breakthrough clamps at zero', () => {
  const hm = SC.createHeightmap(200, 100, 12, 4);
  SC.carveSegment(hm, 20, 50, 180, 50, -4, 3);
  SC.carveSegment(hm, 20, 50, 180, 50, -2, 3);   // shallower second pass must not raise
  const w = hm.nx + 1;
  assert.equal(hm.h[12 * w + 25], 8);
  SC.carveSegment(hm, 20, 50, 180, 50, -12.3, 3); // breakthrough
  assert.equal(hm.h[12 * w + 25], 0);
  assert.ok(hm.h.every(v => v >= 0));
});

test('removed volume/mass: a through slot across a small sheet', () => {
  const hm = SC.createHeightmap(100, 100, 10, 4);
  SC.carveSegment(hm, 0, 50, 100, 50, -10, 3);   // full-width slot, 10 mm deep
  const vol = SC.removedVolume(hm);
  // Discrete grid spreads the 6 mm kerf over 3 cell rows (trapezoid profile),
  // so the heightmap volume (8000) is above the ideal swept volume (6000).
  assert.ok(vol > 7000 && vol < 9000, `volume ${vol} mm^3`);
  const mass = SC.removedMassKg(hm, 905);        // PP density
  assert.ok(Math.abs(mass - vol * 1e-9 * 905) < 1e-12);
  assert.ok(mass > 0.006 && mass < 0.009, `mass ${mass} kg`);
  // carving the same slot again changes nothing (idempotent)
  const vol2 = SC.removedVolume(hm);
  SC.carveSegment(hm, 0, 50, 100, 50, -10, 3);
  assert.equal(SC.removedVolume(hm), vol2);
});
