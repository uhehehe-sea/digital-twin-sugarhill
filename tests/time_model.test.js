// Acceleration-aware time model (stage 1), machine profiles + calibration.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const NC = require('../viewer/lib/nc_program.js');
const MP = require('../viewer/lib/machine_profile.js');

const seg = (x0, y0, x1, y1, feed, rapid) => ({ x0, y0, z0: 0, x1, y1, z1: 0, feed: feed || 3000, rapid: !!rapid, line: 1, spindle: 18000 });
const KIN = { accelMmS2: 500, rapidMmMin: 15000, junctionDevMm: 0.05 };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

test('time model: one long move = cruise time + one accel ramp (L/v + v/a)', () => {
  const t = NC.timing([seg(0, 0, 1000, 0)], KIN).totalS;      // v = 50 mm/s, a = 500
  near(t, 1000 / 50 + 50 / 500, 1e-9);
  near(NC.timing([seg(0, 0, 1000, 0)]).totalS, 20, 1e-9, 'ideal');
});

test('time model: a short move never reaches feed (triangle profile 2*sqrt(L/a))', () => {
  near(NC.timing([seg(0, 0, 2, 0)], KIN).totalS, 2 * Math.sqrt(2 / 500), 1e-9);
});

test('time model: corners cost time — straight < 90 degree corner < reversal', () => {
  const straight = NC.timing([seg(0, 0, 100, 0), seg(100, 0, 200, 0)], KIN).totalS;
  const corner = NC.timing([seg(0, 0, 100, 0), seg(100, 0, 100, 100)], KIN).totalS;
  const reverse = NC.timing([seg(0, 0, 100, 0), seg(100, 0, 0, 0)], KIN).totalS;
  near(straight, NC.timing([seg(0, 0, 200, 0)], KIN).totalS, 1e-9, 'collinear split is free');
  assert.ok(corner > straight + 0.05, `corner ${corner} vs straight ${straight}`);
  near(reverse, 2 * NC.timing([seg(0, 0, 100, 0)], KIN).totalS, 1e-9, 'reversal = two stop-to-stop moves');
  assert.ok(reverse > corner);
});

test('time model: fine-segment arcs — big radius stays near ideal, tiny radius is much slower', () => {
  const circle = (r, n) => Array.from({ length: n }, (_, i) => {
    const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI;
    return seg(r * Math.cos(a0), r * Math.sin(a0), r * Math.cos(a1), r * Math.sin(a1));
  });
  const big = circle(500, 720), small = circle(1, 72);   // r = 1 mm needs v <= sqrt(a*r) = 22 mm/s, feed is 50
  const rb = NC.timing(big, KIN).totalS / NC.timing(big).totalS, rs = NC.timing(small, KIN).totalS / NC.timing(small).totalS;
  assert.ok(rb >= 1 && rb < 1.05, `big circle ratio ${rb}`);
  assert.ok(rs > 1.5, `small circle ratio ${rs}`);
});

test('time model: never faster than ideal, cumulative times increase, factors scale', () => {
  const path = [seg(0, 0, 300, 0, 0, true), seg(300, 0, 300, 40), seg(300, 40, 250, 80), seg(250, 80, 250, 80), seg(250, 80, 0, 0, 1200)];
  const ideal = NC.timing(path), real = NC.timing(path, KIN);
  assert.ok(real.totalS > ideal.totalS);
  for (let i = 0; i < path.length; i++) assert.ok(real.cum[i + 1] >= real.cum[i]);
  near(NC.timing(path, Object.assign({ timeFactor: 1.2 }, KIN)).totalS, real.totalS * 1.2, 1e-9, 'timeFactor');
  assert.ok(NC.timing(path, Object.assign({ feedScale: 2 }, KIN)).totalS < real.totalS, 'faster feed is faster');
  assert.ok(NC.timing(path, Object.assign({}, KIN, { accelMmS2: 5000 })).totalS < real.totalS, 'more acceleration is faster');
});

test('load(): kin gives totalS > idealS and replay still ends at the last point', () => {
  const text = ['G21 G90', 'G00 X10 Y10 Z5', 'G01 Z-2 F600', 'G01 X110 Y10 F3000', 'G01 X110 Y60', 'G01 X10 Y60', 'G01 X10 Y10', 'G00 Z25', 'M30'].join('\n');
  const a = NC.load(text), b = NC.load(text, KIN);
  assert.equal(a.totalS, a.idealS);
  assert.ok(b.totalS > b.idealS && b.idealS === a.idealS);
  const end = NC.axesAt(b, b.totalS);
  assert.equal(end.axis_z_mm, 25);
});

test('machine profile: defaults, merge keeps known keys, validation, kinOf', () => {
  const d = MP.defaults('router');
  assert.equal(d.source, 'assumed');
  assert.ok(d.accelMmS2 > 0 && d.loadS > 0);
  const m = MP.merge('router', { accelMmS2: 900, bogus: 1, connection: { type: 'mtconnect', url: 'http://10.0.0.5:5000' } });
  assert.equal(m.accelMmS2, 900);
  assert.equal(m.bogus, undefined);
  assert.equal(m.connection.type, 'mtconnect');
  assert.equal(MP.validate(m), null);
  assert.ok(MP.validate({ accelMmS2: -1 }));
  assert.ok(MP.validate({ timeFactor: 9 }));
  assert.ok(MP.validate({ connection: { type: 'telnet' } }));
  assert.ok(MP.validate({ connection: { type: 'mtconnect', url: 'file:///etc/passwd' } }));
  assert.deepEqual(Object.keys(MP.kinOf(m)).sort(), ['accelMmS2', 'feedScale', 'junctionDevMm', 'rapidMmMin', 'timeFactor']);
  assert.equal(MP.kinOf(MP.defaults('am')), null);
});

test('calibration: factor = measured / predicted, error drops', () => {
  const c = MP.calibrate([{ predictedS: 100, actualS: 118 }, { predictedS: 200, actualS: 242 }, { predictedS: 50, actualS: 0 }]);
  assert.equal(c.n, 2);
  near(c.factor, 360 / 300, 1e-12);
  assert.ok(c.errorBeforePct > 15 && c.errorAfterPct < 2, `${c.errorBeforePct} -> ${c.errorAfterPct}`);
  assert.equal(MP.calibrate([]), null);
});
