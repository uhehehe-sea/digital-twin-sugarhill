#!/usr/bin/env node
/*
 * mock_machine.mjs — a stand-in for a real CNC router, for testing the twin's real-data path.
 *
 *   It "runs" a G-code file with its OWN kinematics (which the twin does not know) and reports
 *   state, program, line, axis positions, spindle and feed to the twin server's /api/ingest,
 *   exactly as an edge gateway next to a real controller would.
 *
 *   node tools/mock_machine.mjs --program sheet.nc --machine CNC_Router_3Axis_01
 *        [--url http://127.0.0.1:8089] [--speed 20] [--hz 5]
 *        [--accel 380] [--rapid 12000] [--slow 1.08]      the machine's true behaviour
 *        [--hold-at 0.5 --hold-s 30]                      pause once, at 50 % for 30 s
 *        [--token <TWIN_INGEST_TOKEN>]
 *
 *   --speed fast-forwards wall-clock time; sample timestamps follow machine time, so the
 *   recorded cycle length is the machine's real cycle length either way.
 *   Without --program a small built-in rectangle program is used.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const NC = require(path.join(here, '..', 'viewer', 'lib', 'nc_program.js'));

const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt; };
const num = (name, dflt) => { const v = parseFloat(arg(name, dflt)); return isFinite(v) ? v : dflt; };

const url = String(arg('url', 'http://127.0.0.1:8089')).replace(/\/+$/, '');
const machine = String(arg('machine', 'CNC_Router_3Axis_01'));
const speed = Math.max(0.1, num('speed', 1)), hz = Math.max(1, Math.min(50, num('hz', 5)));
const kin = { accelMmS2: num('accel', 380), rapidMmMin: num('rapid', 12000), junctionDevMm: 0.03, timeFactor: num('slow', 1.08) };
const holdAt = num('hold-at', -1), holdS = num('hold-s', 0);
const token = arg('token', process.env.TWIN_INGEST_TOKEN || '');

const DEMO = ['G21 G90', 'M03 S18000', 'G00 X20 Y20 Z10', 'G01 Z-4 F600', 'G01 X420 Y20 F3000', 'G01 X420 Y220', 'G01 X20 Y220', 'G01 X20 Y20', 'G00 Z25', 'M05', 'M30'].join('\n');
const file = arg('program', '');
const text = file ? fs.readFileSync(file, 'utf8') : DEMO;
const program = file ? path.basename(file) : 'MOCK_DEMO.NC';
const prog = NC.load(text, kin);

async function post(sample) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Twin-Token'] = token;
  const r = await fetch(url + '/api/ingest', { method: 'POST', headers, body: JSON.stringify(sample), signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`ingest ${r.status}: ${await r.text()}`);
}

const t0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sample = (machineS, runS, state) => Object.assign(NC.axesAt(prog, runS), { machine, state, program, t: t0 + machineS * 1000 });

console.log(`[mock] ${machine} runs ${program}: ${prog.lines} lines, machine cycle ${prog.totalS.toFixed(1)} s (feed-only ${prog.idealS.toFixed(1)} s), x${speed}`);
await post({ machine, state: 'IDLE', program, t: t0 });
const dt = 1 / hz;                         // machine seconds between samples
let runS = 0, machineS = dt, held = false;
while (runS < prog.totalS) {
  if (!held && holdAt >= 0 && runS >= holdAt * prog.totalS) {      // one operator pause
    held = true;
    for (let h = 0; h < holdS; h += dt) { await post(sample(machineS, runS, 'HOLD')); machineS += dt; await sleep(dt * 1000 / speed); }
  }
  await post(sample(machineS, runS, 'RUNNING'));
  runS += dt; machineS += dt;
  await sleep(dt * 1000 / speed);
}
await post(Object.assign(sample(machineS, prog.totalS, 'IDLE'), { spindle_rpm: 0 }));
console.log(`[mock] done: ran ${prog.totalS.toFixed(1)} s${held ? `, held ${holdS} s` : ''}`);
