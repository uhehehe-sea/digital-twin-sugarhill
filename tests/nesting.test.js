// Sheet nesting tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../viewer/lib/nesting.js');

function overlapOrTooClose(a, b, gap) {
  return Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + gap - 1e-6 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + gap - 1e-6;
}

test('centrePart moves the outline bbox centre to the origin and keeps holes with it', () => {
  const p = N.centrePart([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }], [{ x: 100, y: 50, dia: 10, isSubtract: true }]);
  assert.equal(p.w, 300); assert.equal(p.h, 200);
  assert.deepEqual(p.outline[0], { x: -150, y: -100 });
  assert.deepEqual(p.holes[0], { x: -50, y: -50, dia: 10 });
});

test('nest: every part inside the margins, spacing respected, no overlap', () => {
  const items = [];
  for (let i = 0; i < 14; i++) items.push({ id: 'a' + i, w: 300, h: 200 });
  for (let i = 0; i < 6; i++) items.push({ id: 'b' + i, w: 500, h: 120 });
  const r = N.nest(items, { sheetL: 2440, sheetW: 1220, marginMm: 15, spacingMm: 12 });
  assert.equal(r.unplaced.length, 0);
  for (const p of r.placements) {
    assert.ok(p.cx - p.w / 2 >= 15 - 1e-6 && p.cx + p.w / 2 <= 2440 - 15 + 1e-6, `x out of sheet: ${JSON.stringify(p)}`);
    assert.ok(p.cy - p.h / 2 >= 15 - 1e-6 && p.cy + p.h / 2 <= 1220 - 15 + 1e-6, `y out of sheet: ${JSON.stringify(p)}`);
  }
  for (let i = 0; i < r.placements.length; i++)
    for (let j = i + 1; j < r.placements.length; j++)
      assert.ok(!overlapOrTooClose(r.placements[i], r.placements[j], 12), `${r.placements[i].id} vs ${r.placements[j].id}`);
  assert.ok(r.utilization > 0.4 && r.utilization < 1);
});

test('nest: rotates a part that only fits sideways; reports parts that do not fit', () => {
  const r = N.nest([{ id: 'tall', w: 150, h: 1500 }], { sheetL: 2440, sheetW: 1220 });
  assert.equal(r.placements[0].rot, 90);
  assert.equal(r.placements[0].w, 1500);
  const none = N.nest([{ id: 'huge', w: 3000, h: 3000 }]);
  assert.deepEqual(none.unplaced, ['huge']);
  const noRot = N.nest([{ id: 'tall', w: 150, h: 1500 }], { allowRotate: false });
  assert.deepEqual(noRot.unplaced, ['tall']);
});

test('placeGeometry: rotation 90 maps the centred outline correctly onto the sheet', () => {
  const part = N.centrePart([{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }], [{ x: 50, y: 0, dia: 20, isSubtract: true }]);
  const g = N.placeGeometry(part, { cx: 500, cy: 400, rot: 90 });
  const xs = g.outline.map(p => p.x), ys = g.outline.map(p => p.y);
  assert.equal(Math.max(...xs) - Math.min(...xs), 200);
  assert.equal(Math.max(...ys) - Math.min(...ys), 300);
  assert.deepEqual([g.holes[0].x, g.holes[0].y], [500, 450]);
});
