// Real-machine side (stages 3-4): sample validation, MTConnect parsing, cycle tracking, forecast.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../viewer/lib/twin_real.js');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

test('normalize: keeps the schema, rejects bad input', () => {
  const ok = R.normalize({ machine: ' CNC_Router_3Axis_01 ', state: 'running', axis_x_mm: '120.5', spindle_rpm: 18000, junk: 1, program: 'O1001' }, 1000);
  assert.deepEqual(ok.sample, { machine: 'CNC_Router_3Axis_01', state: 'RUNNING', t: 1000, program: 'O1001', axis_x_mm: 120.5, spindle_rpm: 18000 });
  const bads = [null, [], { state: 'RUNNING' }, { machine: 'a', state: 'FLYING' }, { machine: 'a', state: 'IDLE', axis_x_mm: 'abc' },
    { machine: 'x'.repeat(81), state: 'IDLE' }, { machine: 'a\u0000b', state: 'IDLE' }];
  for (const bad of bads) assert.ok(R.normalize(bad).error, JSON.stringify(bad));
});

test('MTConnect /current XML to twin schema', () => {
  const xml = [
    '<?xml version="1.0"?><MTConnectStreams xmlns="urn:mtconnect.org:MTConnectStreams:1.3"><Streams><DeviceStream name="Router" uuid="r1">',
    '<ComponentStream component="Controller"><Events><Availability dataItemId="avail" timestamp="t">AVAILABLE</Availability>',
    '<Execution dataItemId="exec" timestamp="t">ACTIVE</Execution><Program dataItemId="pgm" timestamp="t">SHEET_42.NC</Program>',
    '<Line dataItemId="ln" timestamp="t">188</Line><EmergencyStop dataItemId="es" timestamp="t">ARMED</EmergencyStop></Events>',
    '<Samples><PathFeedrate dataItemId="pf" timestamp="t">2950</PathFeedrate></Samples></ComponentStream>',
    '<ComponentStream component="Linear" name="X"><Samples><Position dataItemId="xc" name="Xcom" subType="COMMANDED" timestamp="t">999</Position>',
    '<Position dataItemId="xa" name="Xact" subType="ACTUAL" timestamp="t">412.25</Position></Samples></ComponentStream>',
    '<ComponentStream component="Linear" name="Y"><Samples><Position dataItemId="ya" name="Yact" subType="ACTUAL" timestamp="t">88.5</Position></Samples></ComponentStream>',
    '<ComponentStream component="Linear" name="Z"><Samples><Position dataItemId="za" name="Zact" subType="ACTUAL" timestamp="t">-4</Position></Samples></ComponentStream>',
    '<ComponentStream component="Rotary" name="C"><Samples><RotaryVelocity dataItemId="sp" timestamp="t">18000</RotaryVelocity><Load dataItemId="ld" timestamp="t">37</Load></Samples></ComponentStream>',
    '</DeviceStream></Streams></MTConnectStreams>'
  ].join('\n');
  const s = R.parseMtconnectCurrent(xml, 'CNC_Router_3Axis_01').sample;
  assert.equal(s.state, 'RUNNING'); assert.equal(s.program, 'SHEET_42.NC'); assert.equal(s.line, 188);
  assert.equal(s.axis_x_mm, 412.25); assert.equal(s.axis_y_mm, 88.5); assert.equal(s.axis_z_mm, -4);
  assert.equal(s.spindle_rpm, 18000); assert.equal(s.feed_mm_min, 2950); assert.equal(s.spindle_load_pct, 37);
  assert.equal(R.parseMtconnectCurrent(xml.replace('ACTIVE', 'FEED_HOLD'), 'm').sample.state, 'HOLD');
  assert.equal(R.parseMtconnectCurrent(xml.replace('ARMED', 'TRIGGERED'), 'm').sample.state, 'ALARM');
  assert.equal(R.parseMtconnectCurrent(xml.replace('AVAILABLE', 'UNAVAILABLE').replace('>ACTIVE<', '>UNAVAILABLE<'), 'm').sample.state, 'OFF');
  assert.ok(R.parseMtconnectCurrent('<html>nope</html>', 'm').error);
});

test('cycle tracker: run + hold are separated, short blips ignored', () => {
  const tr = R.createCycleTracker({ minRunS: 5 });
  const at = (sec, state, extra) => tr.feed(Object.assign({ machine: 'r', state, t: sec * 1000 }, extra));
  assert.equal(at(0, 'IDLE'), null);
  assert.equal(at(10, 'RUNNING', { program: 'A.NC', part_count: 7 }), null);
  assert.equal(at(70, 'HOLD'), null);                          // 60 s run
  assert.equal(at(100, 'RUNNING'), null);                      // 30 s hold
  const done = at(160, 'IDLE', { part_count: 9 });             // + 60 s run
  assert.deepEqual(done, { machine: 'r', program: 'A.NC', startedAt: 10000, endedAt: 160000, runS: 120, holdS: 30, endState: 'IDLE', source: 'real', parts: 2 });
  assert.equal(tr.current, null);
  at(200, 'RUNNING'); assert.equal(at(202, 'IDLE'), null, '2 s blip is not a cycle');
  at(300, 'RUNNING'); assert.equal(at(400, 'ALARM').endState, 'ALARM');
});

test('plan vs actual: on time, late with forecast, before any progress', () => {
  const on = R.planVsActual({ plannedRunS: 1000, elapsedRunS: 500, progress: 0.5 });
  assert.equal(on.status, 'on_time'); near(on.remainingS, 500, 1e-9); near(on.delayS, 0, 1e-9);
  const late = R.planVsActual({ plannedRunS: 1000, elapsedRunS: 600, progress: 0.4 });   // pace 1.5
  assert.equal(late.status, 'late'); near(late.pace, 1.5, 1e-9); near(late.forecastTotalS, 1500, 1e-9); near(late.delayPct, 50, 1e-9);
  assert.equal(R.planVsActual({ plannedRunS: 1000, elapsedRunS: 300, progress: 0.4 }).status, 'ahead');
  const start = R.planVsActual({ plannedRunS: 1000, elapsedRunS: 5, progress: 0 });
  near(start.remainingS, 1000, 1e-9); assert.equal(start.status, 'on_time');
  assert.equal(R.planVsActual({ plannedRunS: 0, elapsedRunS: 5, progress: 0 }).status, 'unknown');
});

test('summarize: median measured/predicted ratio per machine; tool wear since last change', () => {
  const log = [
    { machine: 'r', source: 'sim', runS: 100, predictedS: 100, cutLenMm: 20000 },
    { machine: 'r', source: 'real', runS: 118, predictedS: 100, cutLenMm: 20000, toolChanged: true },
    { machine: 'r', source: 'real', runS: 240, predictedS: 200, cutLenMm: 40000 },
    { machine: 'r', source: 'real', runS: 900, predictedS: 300, cutLenMm: 60000 },     // an outlier run
    { machine: 'l', source: 'real', runS: 50 }
  ];
  const s = R.summarize(log), r = s.find(x => x.machine === 'r');
  assert.equal(r.cycles, 4); assert.equal(r.real, 3); assert.equal(r.comparable, 3);
  near(r.suggestedTimeFactor, 1.2, 1e-9, 'median, not mean');
  assert.equal(s.find(x => x.machine === 'l').suggestedTimeFactor, null);
  const w = R.toolWear(log, 'r', 120);
  near(w.cutM, 100, 1e-9); near(w.pct, 100 / 120 * 100, 1e-9); assert.equal(w.level, 'soon');
  assert.equal(R.toolWear(log, 'r', 90).level, 'replace');
  assert.equal(R.toolWear(log, 'r', 0).level, 'unknown');
});
