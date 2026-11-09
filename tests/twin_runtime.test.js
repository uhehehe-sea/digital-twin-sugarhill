// Factory twin runtime tests: part data → job → machine states. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../viewer/lib/twin_runtime.js');

const RECT = [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }];
const HOLE = { x: 0, y: 0, dia: 20, isSubtract: true };

test('part data from sketch: area, volume, cut length, bbox', () => {
  const p = T.partFromSketch('panel', RECT, [HOLE], 40);
  const holeA = Math.PI * 100;
  assert.ok(Math.abs(p.areaMm2 - (60000 - holeA)) < 1e-6);
  assert.ok(Math.abs(p.volumeMm3 - (60000 - holeA) * 40) < 1e-3);
  assert.ok(Math.abs(p.cutLengthMm - (1000 + Math.PI * 20)) < 1e-6);
  assert.deepEqual(p.bboxMm, [300, 200, 40]);
  assert.equal(p.holeCount, 1);
});

test('cycle estimate grows with part size and is different per machine kind', () => {
  const small = T.partFromSketch('s', RECT, [], 10);
  const thick = T.partFromSketch('t', RECT, [], 40);
  const cncS = T.estimateCycle(small, 'router'), cncT = T.estimateCycle(thick, 'router');
  assert.ok(cncT.runS > cncS.runS, 'thicker part should need more passes');
  assert.equal(cncT.passes, 14);                       // ceil(40 / 3)
  const am = T.estimateCycle(thick, 'am');
  assert.equal(am.layers, 1000);                       // 40 / 0.04
  assert.ok(am.runS > cncT.runS);
  assert.throws(() => T.estimateCycle(small, 'laser'));
});

test('machine runs a job: IDLE → LOADING → RUNNING → UNLOADING → IDLE, part counted', () => {
  const rt = T.createRuntime();
  rt.registerMachine('CNC_01', 'cnc_router_3axis');
  assert.equal(rt.registerMachine('Desk_01', 'office_desk_a01'), null, 'non-machine must not register');
  const part = T.partFromSketch('panel', RECT, [HOLE], 20);
  const job = rt.assign('CNC_01', part);
  const seen = new Set();
  const total = job.est.loadS + job.est.runS + job.est.unloadS;
  for (let s = 0; s < total + 2; s += 0.5) { rt.step(0.5); seen.add(rt.snapshot().machines[0].phase); }
  assert.deepEqual([...seen].filter(p => p !== 'IDLE').sort(), ['LOADING', 'RUNNING', 'UNLOADING']);
  const snap = rt.snapshot();
  assert.equal(snap.completed, 1);
  assert.equal(snap.machines[0].phase, 'IDLE');
  assert.equal(job.state, 'DONE');
  assert.ok(rt.events.some(e => e.type === 'JOB_DONE' && e.part === 'panel'));
});

test('jobs queue per machine and run one after another', () => {
  const rt = T.createRuntime();
  rt.registerMachine('CNC_01', 'cnc_router_3axis');
  const p = T.partFromSketch('a', RECT, [], 10);
  rt.assign('CNC_01', p); rt.assign('CNC_01', p);
  rt.step(1);
  assert.equal(rt.snapshot().machines[0].queue, 1);
  rt.step(3600);
  assert.equal(rt.snapshot().completed, 2);
});

test('interlock open → HOLD (time does not advance), close → resumes', () => {
  const rt = T.createRuntime();
  rt.registerMachine('CNC_01', 'cnc_router_3axis');
  rt.assign('CNC_01', T.partFromSketch('a', RECT, [], 30));
  rt.step(40);                                         // past loading
  assert.equal(rt.snapshot().machines[0].phase, 'RUNNING');
  const before = rt.snapshot().machines[0].progress;
  rt.setInterlock('CNC_01', false);
  rt.step(60);
  assert.equal(rt.snapshot().machines[0].phase, 'HOLD');
  assert.equal(rt.snapshot().machines[0].progress, before);
  rt.setInterlock('CNC_01', true);
  rt.step(5);
  assert.equal(rt.snapshot().machines[0].phase, 'RUNNING');
  assert.ok(rt.snapshot().machines[0].progress > before);
});

test('lathe rejects flat sketch panels; router and printer accept them', () => {
  const rt = T.createRuntime();
  rt.registerMachine('LATHE_01', 'cnc_sealjet_630pro');
  rt.registerMachine('ROUTER_01', 'cnc_router_3axis');
  rt.registerMachine('SLM_01', 'slm_eos_m290');
  const p = T.partFromSketch('panel', RECT, [], 10);
  assert.equal(p.shape, 'panel');
  assert.throws(() => rt.assign('LATHE_01', p), /회전체 전용/);
  assert.equal(rt.assign('ROUTER_01', p).est.kind, 'router');
  assert.equal(rt.assign('SLM_01', p).est.kind, 'am');
});