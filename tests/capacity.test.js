// Throughput / delivery calculator (stage 2).  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../viewer/lib/capacity.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
const PERFECT = { availability: 1, performance: 1, quality: 1 };

test('plan: sheets, hours and rates with perfect OEE', () => {
  const p = C.plan({ qty: 1000, partsPerSheet: 24, cycle: { loadS: 40, runS: 1520, unloadS: 40 }, oee: PERFECT });
  assert.equal(p.sheets, 42);                                  // ceil(1000 / 24)
  assert.equal(p.cycleS, 1600);
  near(p.netHours, 42 * 1600 / 3600, 1e-9);
  near(p.elapsedHours, p.netHours, 1e-9);
  near(p.sheetsPerHour, 2.25, 1e-9);
  near(p.goodPartsPerHour, 54, 1e-9);
  near(p.workHoursPerDay, 7, 1e-9);                            // 8 h shift - 60 min break
  near(p.workDays, p.elapsedHours / 7, 1e-9);
});

test('plan: OEE - quality needs more parts, availability x performance stretches time', () => {
  const base = { qty: 1000, partsPerSheet: 24, cycle: { loadS: 40, runS: 1520, unloadS: 40 } };
  const p = C.plan(Object.assign({ oee: { availability: 0.8, performance: 0.9, quality: 0.95 } }, base));
  assert.equal(p.partsToCut, 1053);                            // ceil(1000 / 0.95)
  assert.equal(p.sheets, 44);
  near(p.grossHours, 44 * 1600 / 3600 / 0.72, 1e-9);
  near(p.oeePct, 68.4, 1e-9);
  const d = C.plan(base);                                      // defaults are applied and echoed
  assert.deepEqual(d.oee, C.DEFAULT_OEE);
  assert.deepEqual(d.shift, C.DEFAULT_SHIFT);
});

test('plan: parallel machines shorten elapsed time, not machine hours', () => {
  const base = { qty: 480, partsPerSheet: 24, cycle: { loadS: 0, runS: 3600, unloadS: 0 }, oee: PERFECT };
  const one = C.plan(base), two = C.plan(Object.assign({ machines: 2 }, base)), three = C.plan(Object.assign({ machines: 3 }, base));
  assert.equal(one.sheets, 20);
  near(one.elapsedHours, 20, 1e-9); near(two.elapsedHours, 10, 1e-9);
  near(three.elapsedHours, 7, 1e-9);                           // ceil(20 / 3) sheets on the busiest machine
  near(two.grossHours, 20, 1e-9);
  assert.equal(C.plan({ qty: 0, partsPerSheet: 4, cycle: { runS: 100 } }).sheets, 0);
});

test('finish date: only shift hours and working days count', () => {
  const shift = { hoursPerShift: 8, shiftsPerDay: 1, breakMinPerShift: 60, daysPerWeek: 5 };
  const mon8 = new Date(2026, 10, 9, 8, 0, 0);                 // Monday 2026-11-09 08:00 local
  const f1 = C.finishDate(mon8, 3.5 * 3600, shift);            // half of a 7 h working day = 4 clock hours
  assert.equal(f1.getDate(), 9); assert.equal(f1.getHours(), 12);
  const f2 = C.finishDate(mon8, 7 * 3600 * 5.5, shift);        // 5.5 working days = next Monday midday
  assert.equal(f2.getDay(), 1); assert.equal(f2.getDate(), 16); assert.equal(f2.getHours(), 12);
  const sat = new Date(2026, 10, 14, 8, 0, 0);                 // Saturday start rolls to Monday
  assert.equal(C.finishDate(sat, 3600, shift).getDay(), 1);
  const p = C.plan({ qty: 24, partsPerSheet: 24, cycle: { runS: 3600 }, oee: PERFECT, start: mon8 });
  assert.ok(p.finish instanceof Date);
});

test('what-if: variations are compared to the base plan', () => {
  const input = { qty: 480, partsPerSheet: 24, cycle: { loadS: 0, runS: 3600, unloadS: 0 }, oee: PERFECT };
  const rows = C.whatIf(input, [
    { label: '+1 machine', change: i => Object.assign(i, { machines: 2 }) },
    { label: '20% faster', change: i => { i.cycle.runS /= 1.2; return i; } }
  ]);
  assert.equal(rows.length, 3);
  near(rows[1].deltaPct, -50, 1e-9);
  near(rows[2].deltaPct, (1 / 1.2 - 1) * 100, 1e-9);
  assert.equal(input.machines, undefined, 'input not mutated');
});
