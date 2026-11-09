// Machine axis kinematics tests. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../viewer/lib/machine_kinematics.js');

const RECT = [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }];
const HOLE = { x: 40, y: 20, dia: 20, isSubtract: true };
const PART = { thicknessMm: 12, bboxMm: [300, 200, 12] };

test('router path: outline + each hole, closed loops with correct lengths', () => {
  const path = K.sketchPath(RECT, [HOLE]);
  assert.equal(path.length, 2);
  assert.ok(Math.abs(path[0].len - 1000) < 1e-9);
  assert.ok(Math.abs(path[1].len - Math.PI * 20) < 0.2);          // 24-gon ≈ circle
  const centred = K.sketchPath(RECT, [], { x: 10, y: 0 });
  assert.equal(centred[0].pts[0].x, -160);
});

test('router axes: home and spindle off outside RUNNING; tool stays on the path and inside depth', () => {
  const path = K.sketchPath(RECT, [HOLE]);
  assert.equal(K.routerAxes('IDLE', 0, PART, path).spindle_rpm, 0);
  assert.equal(K.routerAxes('LOADING', 0, PART, path).vacuum_on, true);
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const a = K.routerAxes('RUNNING', p, PART, path);
    assert.equal(a.spindle_rpm, K.ROUTER.rpm);
    assert.ok(a.axis_z_mm <= 0 && a.axis_z_mm >= -PART.thicknessMm, `z ${a.axis_z_mm}`);
    const onOutline = Math.abs(Math.abs(a.axis_x_mm) - 150) < 1e-6 || Math.abs(Math.abs(a.axis_y_mm) - 100) < 1e-6;
    const onHole = Math.abs(Math.hypot(a.axis_x_mm - 40, a.axis_y_mm - 20) - 10) < 0.3;
    assert.ok(onOutline || onHole, `tool off path at p=${p.toFixed(2)}: ${a.axis_x_mm}, ${a.axis_y_mm}`);
  }
  // depth increases pass by pass and the last pass reaches full thickness
  assert.equal(K.routerAxes('RUNNING', 0.01, PART, path).axis_z_mm, -3);
  assert.equal(K.routerAxes('RUNNING', 0.999, PART, path).axis_z_mm, -12);
  assert.equal(K.routerAxes('RUNNING', 0.999, PART, path).passes, 4);
  assert.equal(K.routerAxes('HOLD', 0.5, PART, path).spindle_rpm, 0);
});

test('slm axes: platform lowers one layer at a time, laser off while recoating, spot inside footprint', () => {
  const layers = 300;
  let lastZ = 0;
  for (let p = 0; p < 1; p += 0.0007) {
    const a = K.slmAxes('RUNNING', p, PART, layers);
    assert.ok(a.platform_z_mm <= lastZ + 1e-9, 'platform moved up');
    lastZ = a.platform_z_mm;
    if (a.laser_on) {
      assert.equal(a.recoater_x_mm, K.SLM.plateRmm, 'recoater must be parked while lasing');
      assert.ok(Math.abs(a.laser_x_mm) <= 150 + 1e-6 && Math.abs(a.laser_y_mm) <= 100 + 1e-6);
    } else {
      assert.ok(Math.abs(a.recoater_x_mm) <= K.SLM.plateRmm + 1e-6);
    }
  }
  assert.equal(K.slmAxes('RUNNING', 0.9999, PART, layers).layer, 300);
  assert.equal(K.slmAxes('RUNNING', 0.9999, PART, layers).platform_z_mm, -12);
  assert.equal(K.slmAxes('IDLE', 0, PART, layers).laser_on, false);
});

test('slm: a part larger than the plate is scaled to fit (spot never leaves the plate)', () => {
  const big = { thicknessMm: 5, bboxMm: [1000, 600, 5] };
  for (let p = 0; p < 1; p += 0.003) {
    const a = K.slmAxes('RUNNING', p, big, 10);
    assert.ok(Math.hypot(a.laser_x_mm, a.laser_y_mm) <= K.SLM.plateRmm * 1.6 / 2 * Math.SQRT2 + 1e-6);
    assert.ok(Math.abs(a.laser_x_mm) <= K.SLM.plateRmm * 0.8 + 1e-6);
  }
});
