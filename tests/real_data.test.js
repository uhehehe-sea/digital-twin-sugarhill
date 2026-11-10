// Stage 3 on the server: machine registry, real-sample ingest, cycle log, mock machine end to end.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NC = require(path.join(ROOT, 'viewer', 'lib', 'nc_program.js'));

function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const clean = Object.assign({}, process.env);
    for (const k of ['TWIN_INGEST_TOKEN', 'TWIN_EXEC_TOKEN', 'HOST']) delete clean[k];
    const p = spawn(process.execPath, [path.join(ROOT, 'viewer', 'server.mjs'), `--port=${port}`], { env: Object.assign(clean, env) });
    const timer = setTimeout(() => { p.kill(); reject(new Error('server did not start')); }, 8000);
    p.stdout.on('data', d => { if (String(d).includes(`:${port}`)) { clearTimeout(timer); resolve(p); } });
    p.stderr.on('data', d => process.stderr.write(d));
  });
}
const api = (port, url, body) => fetch(`http://127.0.0.1:${port}${url}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, json: await r.json() }));

test('machine registry: defaults, save, validation', async () => {
  const port = 8126, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-real-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    const empty = await api(port, '/api/machines');
    assert.deepEqual(empty.json.profiles, {});
    assert.ok(empty.json.defaults.router.accelMmS2 > 0);
    const ok = await api(port, '/api/machines', { name: 'CNC_Router_3Axis_01', kind: 'router', profile: { model: 'Test 2513', controller: 'Syntec', accelMmS2: 800, loadS: 55, source: 'measured' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.profile.accelMmS2, 800);
    assert.equal(ok.json.profile.unloadS, 45, 'missing fields come from defaults');
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'machine_profiles.json'), 'utf8')).CNC_Router_3Axis_01.model, 'Test 2513');
    for (const bad of [{ kind: 'router', profile: {} }, { name: 'a', kind: 'robot', profile: {} }, { name: 'a', kind: 'router', profile: { accelMmS2: -5 } },
      { name: 'a', kind: 'router', profile: { connection: { type: 'mtconnect', url: 'file:///x' } } }]) {
      assert.equal((await api(port, '/api/machines', bad)).status, 400, JSON.stringify(bad));
    }
  } finally { server.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('ingest: samples become the latest real state and a cycle record with the twin prediction attached', async () => {
  const port = 8127, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-real-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    assert.equal((await api(port, '/api/ingest', { machine: 'r1', state: 'WARP' })).status, 400);
    assert.equal((await api(port, '/api/ingest', { samples: [] })).status, 400);
    assert.equal((await api(port, '/api/cycles', { machine: 'r1', program: 'A.NC', source: 'plan', predictedS: 100, cutLenMm: 25000 })).status, 200);
    const t0 = 1_800_000_000_000;
    const batch = await api(port, '/api/ingest', { samples: [
      { machine: 'r1', state: 'IDLE', t: t0 }, { machine: 'r1', state: 'RUNNING', program: 'A.NC', t: t0 + 1000, axis_x_mm: 10 },
      { machine: 'r1', state: 'RUNNING', program: 'A.NC', t: t0 + 61000, axis_x_mm: 400, line: 88 }, { machine: 'r1', state: 'IDLE', program: 'A.NC', t: t0 + 119000 },
      { machine: 'r1', state: 'BROKEN' }] });
    assert.equal(batch.json.accepted, 4); assert.equal(batch.json.rejected, 1);
    const real = await api(port, '/api/real');
    assert.equal(real.json.machines.r1.state, 'IDLE');
    const cyc = await api(port, '/api/cycles?machine=r1');
    assert.equal(cyc.json.records.length, 1);
    const rec = cyc.json.records[0];
    assert.equal(rec.runS, 118); assert.equal(rec.predictedS, 100); assert.equal(rec.cutLenMm, 25000); assert.equal(rec.source, 'real');
    assert.ok(Math.abs(cyc.json.summary[0].suggestedTimeFactor - 1.18) < 1e-9);
    // a stopwatch measurement typed in by a person counts as a real run
    const manual = await api(port, '/api/cycles', { machine: 'r1', program: 'B.NC', source: 'manual', runS: 250, predictedS: 200 });
    assert.equal(manual.status, 201); assert.equal(manual.json.record.source, 'real'); assert.equal(manual.json.record.manual, true);
    assert.equal((await api(port, '/api/cycles', { machine: 'r1', source: 'real', runS: 5 })).status, 400, 'real cycles only via ingest');
    assert.equal((await api(port, '/api/cycles?machine=other')).json.records.length, 0);
  } finally { server.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('mock machine end to end: the logged cycle equals the machine\'s own time, not the twin\'s guess', async () => {
  const port = 8128, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-real-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    const text = ['G21 G90', 'M03 S18000', 'G00 X20 Y20 Z10', 'G01 Z-4 F600', 'G01 X420 Y20 F3000', 'G01 X420 Y220', 'G01 X20 Y220', 'G01 X20 Y20', 'G00 Z25', 'M05', 'M30'].join('\n');
    const file = path.join(tmp, 'RECT.NC');
    fs.writeFileSync(file, text);
    const twinGuess = NC.load(text, { accelMmS2: 600, rapidMmMin: 15000, junctionDevMm: 0.05 });        // the twin's assumed profile
    const machineTruth = NC.load(text, { accelMmS2: 380, rapidMmMin: 12000, junctionDevMm: 0.03, timeFactor: 1.08 });
    await api(port, '/api/cycles', { machine: 'CNC_Router_3Axis_01', program: 'RECT.NC', source: 'plan', predictedS: twinGuess.totalS, cutLenMm: twinGuess.cutLenMm });
    await new Promise((resolve, reject) => execFile(process.execPath, [path.join(ROOT, 'tools', 'mock_machine.mjs'), '--program', file, '--url', `http://127.0.0.1:${port}`, '--speed', '400', '--hz', '5'],
      { timeout: 30000 }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err))) : resolve(out))));
    const cyc = await api(port, '/api/cycles?machine=CNC_Router_3Axis_01');
    assert.equal(cyc.json.records.length, 1);
    const rec = cyc.json.records[0];
    assert.equal(rec.program, 'RECT.NC');
    assert.ok(Math.abs(rec.runS - machineTruth.totalS) <= 0.5, `logged ${rec.runS} vs machine ${machineTruth.totalS}`);
    const f = cyc.json.summary[0].suggestedTimeFactor;
    assert.ok(f > 1.05 && Math.abs(f - machineTruth.totalS / twinGuess.totalS) < 0.03, `suggested factor ${f}`);
  } finally { server.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
