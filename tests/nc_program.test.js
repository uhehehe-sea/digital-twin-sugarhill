// Nest → G-code → replay tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const NC = require('../viewer/lib/nc_program.js');
const N = require('../viewer/lib/nesting.js');

const RECT = [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }];
const HOLE = { x: 50, y: 0, dia: 30, isSubtract: true };

function sheetParts() {
  const part = N.centrePart(RECT, [HOLE]);
  const g = N.placeGeometry(part, { cx: 600, cy: 400, rot: 0 });
  return [{ id: 'P1', outline: g.outline, holes: g.holes }];
}

test('program: draft header, metric/absolute, spindle on, ends with M30', () => {
  const r = NC.generate(sheetParts(), { thickness: 12 });
  assert.match(r.text, /DRAFT - UNVERIFIED/);
  assert.match(r.text, /G21 G90 G17/);
  assert.match(r.text, /S18000 M03/);
  assert.match(r.text, /M30\n%\n$/);
});

test('cutter compensation: outline offset outward by tool radius, hole cut at r - tool radius', () => {
  const r = NC.generate(sheetParts(), { thickness: 12, tool: { dia: 6 } });
  const segs = NC.parse(r.text).filter(s => !s.rapid && Math.min(s.z0, s.z1) < 0 && (s.x0 !== s.x1 || s.y0 !== s.y1));
  const holeC = { x: 650, y: 400 };
  let onOutline = 0, onHole = 0;
  for (const s of segs) {
    const dh = Math.hypot(s.x1 - holeC.x, s.y1 - holeC.y);
    if (Math.abs(dh - (15 - 3)) < 1e-3) { onHole++; continue; }
    const onX = Math.abs(Math.abs(s.x1 - 600) - 153) < 1e-3 && Math.abs(s.y1 - 400) <= 103 + 1e-3;
    const onY = Math.abs(Math.abs(s.y1 - 400) - 103) < 1e-3 && Math.abs(s.x1 - 600) <= 153 + 1e-3;
    assert.ok(onX || onY, `cut point off the compensated path: ${s.x1}, ${s.y1}`);
    onOutline++;
  }
  assert.ok(onOutline > 0 && onHole > 0);
});

test('depth: cuts through (thickness + 0.3) and never below it', () => {
  const r = NC.generate(sheetParts(), { thickness: 12 });
  const minZ = Math.min(...NC.parse(r.text).map(s => Math.min(s.z0, s.z1)));
  assert.equal(minZ, -12.3);
});

test('tabs: no cut below the tab top inside a tab window on ANY pass (old generator cut tabs away)', () => {
  const r = NC.generate(sheetParts(), { thickness: 12, tool: { stepDown: 4 }, tabs: { count: 4, width: 8, height: 2 } });
  assert.equal(r.tabTopZ, -10);
  const t = r.tabs[0];
  assert.equal(t.windows.length, 4);
  // arc-length position of a point on the compensated loop
  const pts = t.loop.concat([t.loop[0]]);
  function sOf(x, y) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
      const u = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (L * L);
      const d = Math.hypot(a.x + (b.x - a.x) * u - x, a.y + (b.y - a.y) * u - y);
      if (u >= -1e-6 && u <= 1 + 1e-6 && d < 1e-3) return s + u * L;
      s += L;
    }
    return null;
  }
  let checked = 0, tabSpans = 0;
  for (const sg of NC.parse(r.text)) {
    if (sg.rapid || (sg.x0 === sg.x1 && sg.y0 === sg.y1)) continue;
    const mx = (sg.x0 + sg.x1) / 2, my = (sg.y0 + sg.y1) / 2, s = sOf(mx, my);
    if (s === null) continue;                                  // hole moves
    const inTab = t.windows.some(w => s > w[0] && s < w[1]);
    if (inTab && Math.min(sg.z0, sg.z1) < r.tabTopZ - 1e-6) assert.fail(`cut through a tab at s=${s.toFixed(1)} z=${sg.z0}`);
    if (inTab) tabSpans++;
    checked++;
  }
  assert.ok(checked > 0 && tabSpans > 0);
});

test('a hole smaller than the tool is skipped with a warning, not cut wrong', () => {
  const part = N.centrePart(RECT, [{ x: 0, y: 0, dia: 5, isSubtract: true }]);
  const g = N.placeGeometry(part, { cx: 500, cy: 500, rot: 0 });
  const r = NC.generate([{ id: 'P', outline: g.outline, holes: g.holes }], { tool: { dia: 6 } });
  assert.equal(r.warnings.length, 1);
  assert.doesNotMatch(r.text, /HOLE D5/);
});

test('replay: timing positive, axesAt follows the program from first move to the end', () => {
  const prog = NC.load(NC.generate(sheetParts(), { thickness: 12 }).text);
  assert.ok(prog.totalS > 30 && prog.cutLenMm > 1000);
  const a0 = NC.axesAt(prog, 0), aEnd = NC.axesAt(prog, prog.totalS);
  assert.equal(a0.axis_z_mm, 25);
  assert.equal(aEnd.axis_x_mm, 0); assert.equal(aEnd.axis_y_mm, 0);
  const mid = NC.axesAt(prog, prog.totalS / 2);
  assert.ok(mid.line > 0 && mid.spindle_rpm === 18000);
});

test('parse: holding-tab spans are flagged tab, cutting spans are not', () => {
  const r = NC.generate(sheetParts(), { thickness: 12, tool: { stepDown: 4 }, tabs: { count: 4, width: 8, height: 2 } });
  const segs = NC.parse(r.text);
  const tabSegs = segs.filter(s => s.tab);
  assert.ok(tabSegs.length > 0, 'tab spans flagged');
  for (const s of tabSegs) {
    assert.equal(s.z0, r.tabTopZ);
    assert.equal(s.z1, r.tabTopZ);
    assert.ok(!s.rapid);
  }
  // passes are at depths 4, 8, 12, 12.3 mm; only the two deeper than the tab top
  // (-10 mm) lift over the tabs, so 4 tabs x 2 passes = 8 flagged spans
  assert.equal(tabSegs.length, 8);
});

test('verify: a program on its own sheet passes bounds and clamps', () => {
  const r = NC.generate(sheetParts(), { thickness: 12 });
  const prog = NC.load(r.text);
  const v = NC.verifyProgram(prog, {
    L: 1220, W: 800, toolDia: 6, tabTopZ: r.tabTopZ, tabs: r.tabs, warnings: r.warnings,
    clampZones: [{ x0: 0, y0: 0, x1: 100, y1: 100 }]
  });
  assert.ok(v.ok);
  assert.equal(v.checks.find(c => c.id === 'bounds').level, 'ok');
  assert.equal(v.checks.find(c => c.id === 'clamps').level, 'ok');
  assert.equal(v.checks.find(c => c.id === 'tabs').level, 'ok');
});

test('verify: a toolpath that leaves a deliberately small sheet is a hard error', () => {
  const r = NC.generate(sheetParts(), { thickness: 12 });
  const prog = NC.load(r.text);
  const v = NC.verifyProgram(prog, { L: 200, W: 200, toolDia: 6, tabTopZ: r.tabTopZ, tabs: r.tabs, warnings: [] });
  assert.equal(v.ok, false);
  assert.equal(v.checks.find(c => c.id === 'bounds').level, 'error');
});

test('verify: a clamp zone next to the toolpath warns (never blocks), generator warnings pass through', () => {
  const r = NC.generate(sheetParts(), { thickness: 12 });
  const prog = NC.load(r.text);
  const v = NC.verifyProgram(prog, {
    L: 1220, W: 800, toolDia: 6, tabTopZ: r.tabTopZ, tabs: r.tabs, warnings: ['테스트 경고'],
    clampZones: [{ x0: 440, y0: 290, x1: 560, y1: 310 }]   // sits right under the outline edge
  });
  assert.ok(v.ok, 'clamp proximity must not block');
  assert.equal(v.checks.find(c => c.id === 'clamps').level, 'warn');
  assert.ok(v.checks.some(c => c.id === 'gen' && c.level === 'warn' && c.detail === '테스트 경고'));
  assert.deepEqual(v.warnings, ['테스트 경고']);
});

