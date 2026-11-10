import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const { safeResolve, isLoopback, readBody, BodyTooLarge, validateLayout, validateGcode, GCODE_MAX, tokenOk } = require('./server_lib.cjs');
const MachineProfile = require('./lib/machine_profile.js');
const TwinReal = require('./lib/twin_real.js');

// Paths are resolved relative to this file so the server works from any checkout.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.argv.find(a => a.startsWith('--port='));
const PORT = parseInt(portArg ? portArg.split('=')[1] : process.env.PORT, 10) || 8088;
// Bind to loopback only by default: this server has endpoints that launch local programs.
const HOST = process.env.HOST || '127.0.0.1';
const baseDir = path.resolve(__dirname, '..');
const viewerDir = path.join(baseDir, 'viewer');
// TWIN_DATA_DIR lets tests (or a deployment) keep writable data outside the repo.
const dataDir = process.env.TWIN_DATA_DIR || baseDir;

const precisionObj = path.join(baseDir, 'factory_precision.obj');
const unifiedObj = path.join(baseDir, 'factory_digital_twin_unified.obj');
const stepFile = path.join(baseDir, 'factory_precision.step');
const layoutFile = path.join(dataDir, 'scene_layout.json');
const partsFile = path.join(dataDir, 'parts_library.json');
const profilesFile = path.join(dataDir, 'machine_profiles.json');
const cyclesFile = path.join(dataDir, 'cycles.jsonl');
const blenderScriptFile = path.join(baseDir, 'setup_blender_isaac_digital_twin.py');
const renderDir = path.join(baseDir, 'renders_cycles_photoreal');
const renderImg = path.join(renderDir, 'cycles_digital_twin_render.png');

// ---------------------------------------------------------------------------
// Local-program endpoints (/api/rebuild, /api/render-blender, /api/camotics)
//   * registered only while HOST is a loopback address (0.0.0.0 or a LAN IP → 404)
//   * executable paths come only from the environment (never from a request, never hard-coded)
//   * execFile/spawn with argument arrays (no shell string)
//   * optional shared secret: set TWIN_EXEC_TOKEN and send it as the X-Twin-Token header
// ---------------------------------------------------------------------------
const EXEC_ENABLED = isLoopback(HOST) || process.env.TWIN_ALLOW_REMOTE_EXEC === '1';
const EXEC_TOKEN = process.env.TWIN_EXEC_TOKEN || '';

const BODY_LIMIT = 2e6;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ktx2': 'image/ktx2', '.mdl': 'text/plain; charset=utf-8', '.usd': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8', '.py': 'text/x-python; charset=utf-8', '.step': 'application/step'
};
const mimeOf = (file, fallback = 'application/octet-stream') => MIME[path.extname(file).toLowerCase()] || fallback;

function sendJson(res, code, obj) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function sendText(res, code, text) {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** Stream a file (no readFileSync: large OBJ/PLY/splat files must not block the WebSocket relay). */
async function sendFile(req, res, file, { type, attachment, cache, notFound = 'Not found', notFoundJson } = {}) {
  let st;
  try { st = await fs.promises.stat(file); } catch { st = null; }
  if (!st || !st.isFile()) {
    if (notFoundJson) return sendJson(res, 404, notFoundJson);
    return sendText(res, 404, notFound);
  }
  const headers = { 'Content-Type': type || mimeOf(file), 'Content-Length': st.size };
  if (attachment) headers['Content-Disposition'] = `attachment; filename="${attachment}"`;
  if (cache) headers['Cache-Control'] = cache;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

// ---------------------------------------------------------------------------
// Static routes: exact paths
// ---------------------------------------------------------------------------
const V = f => path.join(viewerDir, f);
const B = f => path.join(baseDir, f);
const EXACT = new Map();
const route = (urls, spec) => urls.forEach(u => EXACT.set(u, spec));
route(['/', '/hub'], { file: V('hub.html') });
route(['/v2', '/v2/', '/index_v2.html'], { file: V('index_v2.html') });
route(['/studio', '/studio/', '/closed_loop', '/digital_twin_closed_loop_studio.html'], { file: V('digital_twin_closed_loop_studio.html') });
route(['/polymer', '/polymer/', '/cam_nesting', '/polymer_auto_cam_nesting_studio.html'], { file: V('polymer_auto_cam_nesting_studio.html') });
route(['/monitor', '/monitor/'], { file: V('monitor.html') });
route(['/v1', '/index.html'], { file: V('index.html') }); // original v1 viewer, kept for comparison
route(['/splat.html'], { file: V('splat.html') });
for (const js of ['editor_v2.js', 'editor.js', 'twin_live.js', 'twin_nest.js']) route(['/' + js], { file: V(js) });
route(['/demo'], { file: B('dist/sugarhill_twin_demo.html'), notFound: 'Run: node tools/build_standalone.mjs' });
route(['/model.obj'], { file: () => (fs.existsSync(precisionObj) ? precisionObj : unifiedObj), notFound: 'Model not found' });
route(['/model_unified.obj'], { file: unifiedObj, notFound: 'Model not found' });
route(['/cnc_3dprinter.obj'], { file: B('industrial_cnc_and_3dprinter.obj'), notFound: 'CNC/3DP OBJ not found' });
route(['/eval_report.json'], { file: B('eval_report.json'), notFoundJson: { error: 'eval report not found' } });
route(['/api/materials'], { file: B('materials_pp_fkm_stainless_spec.json'), notFoundJson: { error: 'materials spec not found' } });
route(['/api/manifest'], { file: B('nvidia_isaac_assets/nvidia_simready_manifest.json'), notFoundJson: { error: 'manifest not found' } });
for (const bin of ['splat_cloud.bin', 'true_3dgs.bin', 'sugarhill.splat']) route(['/' + bin], { file: V(bin), notFound: 'Splat bin not found' });
route(['/sugarhill.ply'], { file: B('sugarhill_iteration_30000.ply'), notFound: 'PLY not found' });
route(['/download/colab_obj'], { file: B('sugarhill_colab_3dgs_mesh.obj'), attachment: 'sugarhill_colab_3dgs_mesh.obj', notFound: 'Colab OBJ not found' });
route(['/download/blender_script'], { file: blenderScriptFile, attachment: 'setup_blender_isaac_digital_twin.py', notFound: 'Blender script not found' });
route(['/download/step'], { file: stepFile, attachment: 'factory_precision.step', notFound: 'STEP not found' });
for (const png of ['solidcraft_native_xray.png', 'solidcraft_native_cutaway.png']) route(['/' + png], { file: V(png), notFound: 'Image not found' });

// Static routes: prefix → directory (containment enforced by safeResolve)
const PREFIX = [
  { prefix: '/basis/', dir: V('basis'), type: f => (f.endsWith('.wasm') ? 'application/wasm' : 'application/javascript') },
  { prefix: '/lib/', dir: V('lib'), only: /\.js$/ }, // pure modules, also required by the Node tests
  { prefix: '/libs/', dir: V('libs'), type: f => (f.endsWith('.wasm') ? 'application/wasm' : 'application/javascript') },
  { prefix: '/renders_cycles/', dir: renderDir, type: () => 'image/png' },
  { prefix: '/assets/', dir: B('nvidia_isaac_assets'), cache: 'public, max-age=3600', notFound: 'Asset not found' }
];

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
const API = new Map();
API.set('/api/parts', handleParts);
API.set('/api/telemetry', (req, res) => {
  // Latest snapshot published by the twin (poll-friendly for external tools)
  res.writeHead(latestTelemetry ? 200 : 204, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(latestTelemetry || '');
});
API.set('/api/layout', async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (fs.existsSync(layoutFile)) return sendFile(req, res, layoutFile, { type: 'application/json; charset=utf-8' });
    return sendJson(res, 200, { items: null });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'GET, POST' });
  const parsed = await readJson(req, res, BODY_LIMIT);
  if (parsed === undefined) return;
  const err = validateLayout(parsed);
  if (err) return sendJson(res, 400, { success: false, error: err });
  await fs.promises.writeFile(layoutFile, JSON.stringify(parsed, null, 2), 'utf8');
  sendJson(res, 200, { success: true, savedPath: path.basename(layoutFile), count: parsed.items.length, timestamp: new Date().toISOString() });
});
// ---------------------------------------------------------------------------
// Machine registry + real-machine data (digital twin stages 1, 3, 4)
//   /api/machines  GET profiles · POST { name, kind, profile }   (machine_profiles.json)
//   /api/ingest    POST one sample or { samples: [...] } in the twin schema (lib/twin_real.js)
//                  → latest state, cycle tracking, relayed to every WebSocket client as {type:'real'}
//   /api/real      GET latest real sample per machine
//   /api/cycles    GET ?machine=&limit=  → records + summary · POST a sim/manual record or a plan
//   An MTConnect agent can be polled instead of pushing (profile.connection = mtconnect + url).
//   Read-only towards equipment: nothing here sends commands to a machine.
//   Who may push or change connections: loopback callers, or anyone presenting TWIN_INGEST_TOKEN
//   (X-Twin-Token header). Without a token, non-loopback callers get 401.
// ---------------------------------------------------------------------------
const INGEST_TOKEN = process.env.TWIN_INGEST_TOKEN || '';
const KINDS = ['router', 'lathe', 'am'];
const CYCLES_MAX_BYTES = 20e6;
const realState = new Map();          // machine → latest sample
const trackers = new Map();           // machine → cycle tracker
const plans = new Map();              // `${machine}|${program}` → { predictedS, cutLenMm, t }
const trustedCaller = req => isLoopback(req.socket.remoteAddress || '') || (INGEST_TOKEN && tokenOk(INGEST_TOKEN, req.headers['x-twin-token']));

function readProfiles() {
  try { const j = JSON.parse(fs.readFileSync(profilesFile, 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
function appendCycle(rec) {
  try {
    if (fs.existsSync(cyclesFile) && fs.statSync(cyclesFile).size > CYCLES_MAX_BYTES) fs.renameSync(cyclesFile, cyclesFile + '.1');
    fs.appendFileSync(cyclesFile, JSON.stringify(rec) + '\n', 'utf8');
  } catch (e) { console.error('[cycles] write failed:', e.message); }
  broadcast({ type: 'cycle', record: rec });
}
function readCycles(limit, machine) {
  let lines = [];
  try { lines = fs.readFileSync(cyclesFile, 'utf8').split('\n'); } catch { return []; }
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    if (!lines[i]) continue;
    try { const r = JSON.parse(lines[i]); if (!machine || r.machine === machine) out.push(r); } catch { /* skip a damaged line */ }
  }
  return out.reverse();
}
function onRealSample(sample, via) {
  sample.via = via;
  realState.set(sample.machine, sample);
  let tr = trackers.get(sample.machine);
  if (!tr) trackers.set(sample.machine, tr = TwinReal.createCycleTracker());
  const done = tr.feed(sample);
  if (done) {
    const plan = plans.get(`${done.machine}|${done.program}`);
    if (plan) { done.predictedS = plan.predictedS; if (plan.cutLenMm) done.cutLenMm = plan.cutLenMm; }
    appendCycle(done);
  }
  broadcast({ type: 'real', sample });
}

API.set('/api/machines', async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') return sendJson(res, 200, { profiles: readProfiles(), defaults: MachineProfile.DEFAULTS });
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'GET, POST' });
  const b = await readJson(req, res, 64e3);
  if (b === undefined) return;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name)) return sendJson(res, 400, { success: false, error: 'name required (max 80 chars)' });
  if (!KINDS.includes(b.kind)) return sendJson(res, 400, { success: false, error: `kind must be one of ${KINDS.join(', ')}` });
  const err = MachineProfile.validate(b.profile);
  if (err) return sendJson(res, 400, { success: false, error: err });
  const all = readProfiles();
  const next = MachineProfile.merge(b.kind, b.profile);
  // pointing the server at a network address is a privileged change
  const before = all[name] && all[name].connection ? JSON.stringify(all[name].connection) : JSON.stringify({ type: 'none', url: '' });
  if (JSON.stringify(next.connection) !== before && !trustedCaller(req)) return sendJson(res, 401, { success: false, error: 'changing a machine connection requires a local caller or TWIN_INGEST_TOKEN' });
  all[name] = next;
  await fs.promises.writeFile(profilesFile, JSON.stringify(all, null, 2), 'utf8');
  restartPollers();
  sendJson(res, 200, { success: true, name, profile: next });
});

API.set('/api/ingest', async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'POST required' });
  if (!trustedCaller(req)) return sendJson(res, 401, { success: false, error: 'token_required' });
  const b = await readJson(req, res, 256e3);
  if (b === undefined) return;
  const list = Array.isArray(b.samples) ? b.samples : [b];
  if (list.length > 200) return sendJson(res, 400, { success: false, error: 'at most 200 samples per request' });
  let accepted = 0; const errors = [];
  for (const raw of list) {
    const n = TwinReal.normalize(raw);
    if (n.error) { errors.push(n.error); continue; }
    onRealSample(n.sample, 'http-push'); accepted++;
  }
  sendJson(res, accepted ? 200 : 400, { success: accepted > 0, accepted, rejected: errors.length, errors: errors.slice(0, 5) });
});

API.set('/api/real', (req, res) => sendJson(res, 200, { machines: Object.fromEntries(realState) }));

API.set('/api/cycles', async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const q = new URL(req.url, 'http://x').searchParams;
    const limit = Math.max(1, Math.min(2000, parseInt(q.get('limit'), 10) || 200));
    const machine = (q.get('machine') || '').slice(0, 80);
    const records = readCycles(limit, machine);
    return sendJson(res, 200, { records, summary: TwinReal.summarize(readCycles(2000, machine)) });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, error: 'GET, POST' });
  const b = await readJson(req, res, 16e3);
  if (b === undefined) return;
  const machine = typeof b.machine === 'string' ? b.machine.trim().slice(0, 80) : '';
  const num = (v, max) => (typeof v === 'number' && isFinite(v) && v >= 0 && v <= max ? v : undefined);
  if (!machine) return sendJson(res, 400, { success: false, error: 'machine required' });
  const program = typeof b.program === 'string' ? b.program.slice(0, 120) : '';
  if (b.source === 'plan') {                         // what the twin predicts for a program about to run on the real machine
    const predictedS = num(b.predictedS, 1e7);
    if (!predictedS) return sendJson(res, 400, { success: false, error: 'predictedS required for a plan' });
    plans.set(`${machine}|${program}`, { predictedS, cutLenMm: num(b.cutLenMm, 1e9), t: Date.now() });
    if (plans.size > 500) plans.delete(plans.keys().next().value);
    return sendJson(res, 200, { success: true, plan: true });
  }
  if (b.source !== 'sim' && b.source !== 'manual') return sendJson(res, 400, { success: false, error: 'source must be sim, manual or plan (real cycles come from /api/ingest)' });
  const runS = num(b.runS, 1e7);
  if (runS === undefined && !b.toolChanged) return sendJson(res, 400, { success: false, error: 'runS required' });
  const rec = { machine, program, source: b.source, runS: runS || 0, holdS: num(b.holdS, 1e7) || 0, startedAt: num(b.startedAt, 1e14), endedAt: num(b.endedAt, 1e14) || Date.now() };
  for (const k of ['predictedS', 'cutLenMm', 'loadS', 'unloadS', 'parts']) { const v = num(b[k], 1e9); if (v !== undefined) rec[k] = v; }
  if (b.toolChanged === true) rec.toolChanged = true;
  // a manual record is a stopwatch measurement of a real run: it counts as real for calibration
  if (b.source === 'manual') rec.source = 'real', rec.manual = true;
  appendCycle(rec);
  sendJson(res, 201, { success: true, record: rec });
});

// MTConnect polling: one timer per machine whose profile has connection = { type: 'mtconnect', url }
const pollers = new Map();
function restartPollers() {
  pollers.forEach(t => clearInterval(t)); pollers.clear();
  const all = readProfiles();
  for (const [name, p] of Object.entries(all)) {
    const c = p && p.connection;
    if (!c || c.type !== 'mtconnect' || !/^https?:\/\//i.test(c.url || '')) continue;
    const base = c.url.replace(/\/+$/, '');
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return; busy = true;
      try {
        const r = await fetch(base + '/current', { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/xml' } });
        if (r.ok) { const n = TwinReal.parseMtconnectCurrent((await r.text()).slice(0, 2e6), name); if (n.sample) onRealSample(n.sample, 'mtconnect'); }
      } catch { /* agent unreachable: the UI shows the machine as not connected (stale sample) */ }
      busy = false;
    }, 1000);
    timer.unref();
    pollers.set(name, timer);
  }
}

API.set('/api/exec-status', (req, res) => sendJson(res, 200, {
  execEnabled: EXEC_ENABLED, tokenRequired: !!EXEC_TOKEN,
  camotics: EXEC_ENABLED ? toolStatus('CAMOTICS_PATH') : 'disabled',
  blender: EXEC_ENABLED ? (findBlender() ? 'ready' : 'not_found') : 'disabled',
  solidcraft: EXEC_ENABLED ? toolStatus('SOLIDCRAFT_CLI') : 'disabled'
}));

const EXEC_API = new Map();
EXEC_API.set('/api/rebuild', handleRebuild);
EXEC_API.set('/api/render-blender', handleRenderBlender);
EXEC_API.set('/api/camotics', handleCamotics);

/** Parse a JSON body. Sends 413/400 itself and returns undefined on failure. Empty body → {}. */
async function readJson(req, res, limit) {
  let text;
  try { text = await readBody(req, limit); } catch (e) {
    // 413: the rest of the body is drained and discarded (not buffered); destroying the socket here
    // would make clients see a connection reset instead of the 413 response.
    if (e instanceof BodyTooLarge) sendJson(res, 413, { success: false, error: `body larger than ${limit} bytes` });
    else sendJson(res, 400, { success: false, error: 'could not read body' });
    return undefined;
  }
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { sendJson(res, 400, { success: false, error: 'invalid JSON' }); return undefined; }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error('[server] request failed:', e && e.stack || e);
    if (!res.headersSent) sendJson(res, 500, { success: false, error: 'internal error' });
    else res.destroy();
  });
});

async function handle(req, res) {
  // No Access-Control-Allow-Origin header: pages are served from this same origin,
  // and a wildcard would let any website call the local-program endpoints.
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = (req.url || '/').split('?')[0];

  if (API.has(url)) return API.get(url)(req, res);
  if (EXEC_API.has(url)) {
    if (!EXEC_ENABLED) return sendText(res, 404, 'Not found');
    if (req.method !== 'POST' && !(url === '/api/camotics' && req.method === 'GET')) {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { success: false, error: 'POST required' });
    }
    if (!tokenOk(EXEC_TOKEN, req.headers['x-twin-token'])) return sendJson(res, 401, { success: false, reason: 'token_required' });
    return EXEC_API.get(url)(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');

  const spec = EXACT.get(url);
  if (spec) {
    const file = typeof spec.file === 'function' ? spec.file() : spec.file;
    return sendFile(req, res, file, spec);
  }
  for (const p of PREFIX) {
    if (!url.startsWith(p.prefix)) continue;
    const file = safeResolve(p.dir, url.slice(p.prefix.length));
    if (!file) return sendText(res, 404, p.notFound || 'Not found');
    if (p.only && !p.only.test(file)) return sendText(res, 404, 'Not found');
    return sendFile(req, res, file, { type: p.type ? p.type(file) : mimeOf(file), cache: p.cache, notFound: p.notFound });
  }
  sendText(res, 404, 'Not found');
}

// ---------------------------------------------------------------------------
// Local-program handlers
// ---------------------------------------------------------------------------
function toolStatus(envName) {
  const p = process.env[envName];
  if (!p) return 'not_configured';
  return fs.existsSync(p) ? 'ready' : 'not_found';
}

function handleRebuild(req, res) {
  const cli = process.env.SOLIDCRAFT_CLI;
  if (!cli) return sendJson(res, 503, { success: false, reason: 'solidcraft_not_configured', message: 'Set SOLIDCRAFT_CLI to the solidcraft-cli executable.' });
  if (!fs.existsSync(cli)) return sendJson(res, 503, { success: false, reason: 'solidcraft_not_found', message: 'SOLIDCRAFT_CLI points to a file that does not exist.' });
  const args = ['run', B('factory_precision.json'), '--out', precisionObj, '--out', stepFile, '--save', B('factory_precision.sc'), '--param-check', 'strict', '--timings'];
  execFile(cli, args, { timeout: 300000, windowsHide: true }, (err, stdout, stderr) => {
    if (err) return sendJson(res, 500, { success: false, error: String(stderr || err.message).slice(-2000) });
    sendJson(res, 200, { success: true, stdout: String(stdout).trim().slice(-4000) });
  });
}

function findBlender() {
  const candidates = [
    process.env.BLENDER_PATH,
    ...['5.0', '4.5', '4.4', '4.3', '4.2', '4.1', '4.0', '3.6'].map(v => `C:\\Program Files\\Blender Foundation\\Blender ${v}\\blender.exe`),
    'C:\\Program Files\\Steam\\steamapps\\common\\Blender\\blender.exe',
    '/Applications/Blender.app/Contents/MacOS/Blender',
    '/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender'
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}

let renderBusy = false;
async function handleRenderBlender(req, res) {
  const parsed = await readJson(req, res, BODY_LIMIT);
  if (parsed === undefined) return;
  const preview = fs.existsSync(renderImg) ? '/renders_cycles/cycles_digital_twin_render.png' : null;

  let layoutSaved = false;
  if (Array.isArray(parsed.items)) {
    const err = validateLayout(parsed);
    if (err) return sendJson(res, 400, { success: false, error: err });
    await fs.promises.writeFile(layoutFile, JSON.stringify({ items: parsed.items }, null, 2), 'utf8');
    layoutSaved = true;
  }
  // parsed.blenderPath is intentionally ignored: an executable path must not come from a request body.
  if (!fs.existsSync(blenderScriptFile)) {
    return sendJson(res, 200, { success: false, reason: 'blender_script_missing', layoutSaved, previewImage: preview,
      message: 'setup_blender_isaac_digital_twin.py is missing from the project root.' });
  }
  const blenderBin = findBlender();
  if (!blenderBin) {
    return sendJson(res, 200, { success: false, reason: 'blender_executable_not_found', layoutSaved, previewImage: preview,
      message: 'Blender를 찾지 못했습니다. BLENDER_PATH 환경변수에 실행 파일 경로를 지정하세요 (Windows: ...\\blender.exe, macOS: /Applications/Blender.app/Contents/MacOS/Blender, Linux: /usr/bin/blender).',
      cliCommand: 'blender -b -P setup_blender_isaac_digital_twin.py -- --render --samples 32 --device CPU' });
  }
  if (renderBusy) return sendJson(res, 409, { success: false, reason: 'render_in_progress' });

  // Defaults suit a laptop with integrated graphics (CPU, 32 samples). GPU/OptiX needs an NVIDIA card.
  const samples = Math.max(1, Math.min(4096, Math.round(Number(parsed.samples) || 32)));
  const device = ['CPU', 'GPU', 'AUTO'].includes(String(parsed.device).toUpperCase()) ? String(parsed.device).toUpperCase() : 'CPU';
  const timeout = Math.max(30000, Math.min(3600000, Number(process.env.BLENDER_TIMEOUT_MS) || 600000));
  renderBusy = true;
  execFile(blenderBin, ['-b', '-P', blenderScriptFile, '--', '--render', '--samples', String(samples), '--device', device],
    { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      renderBusy = false;
      if (err) {
        return sendJson(res, 200, { success: false, reason: err.killed ? 'blender_timeout' : 'blender_exec_error', samples, device,
          error: String(stderr || err.message).slice(-2000), layoutSaved, previewImage: preview });
      }
      sendJson(res, 200, { success: true, layoutSaved, samples, device, renderImage: '/renders_cycles/cycles_digital_twin_render.png',
        stdout: String(stdout || '').slice(-800), timestamp: new Date().toISOString() });
    });
}

const camoticsDir = path.join(os.tmpdir(), 'sugarhill-twin-camotics');
async function handleCamotics(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { status: toolStatus('CAMOTICS_PATH') });
  const parsed = await readJson(req, res, GCODE_MAX + 4096);
  if (parsed === undefined) return;
  const err = validateGcode(parsed.gcode);
  if (err) return sendJson(res, 400, { success: false, error: err });
  const status = toolStatus('CAMOTICS_PATH');
  if (status !== 'ready') {
    return sendJson(res, 503, { success: false, reason: status === 'not_configured' ? 'camotics_not_configured' : 'camotics_not_found',
      message: 'CAMOTICS_PATH 환경변수에 CAMotics 실행 파일 경로를 지정하세요. 지정하지 않아도 .nc 파일을 저장해 CAMotics에서 직접 열 수 있습니다.' });
  }
  // The file name is generated here; nothing from the request reaches the path or the argument list.
  await fs.promises.mkdir(camoticsDir, { recursive: true });
  const file = path.join(camoticsDir, `twin_${new Date().toISOString().replace(/[:.]/g, '-')}.nc`);
  await fs.promises.writeFile(file, parsed.gcode, 'utf8');
  try {
    const child = spawn(process.env.CAMOTICS_PATH, [file], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', e => console.error('[camotics] launch failed:', e.message));
    child.unref();
  } catch (e) {
    return sendJson(res, 500, { success: false, reason: 'camotics_launch_failed', error: e.message });
  }
  sendJson(res, 202, { success: true, file: path.basename(file), message: 'CAMotics 창이 이 컴퓨터에서 열립니다. 공구·재료(stock)는 CAMotics에서 확인하세요.' });
}

// ---------------------------------------------------------------------------
// Parts library (modeled / imported flat parts) — parts_library.json
//   GET    /api/parts            → { parts: [...] }
//   POST   /api/parts  {part}    → { part }  (validated, id assigned; same geometry → existing entry)
//   DELETE /api/parts?id=...     → { ok }
// ---------------------------------------------------------------------------
function readParts() {
  try { return JSON.parse(fs.readFileSync(partsFile, 'utf8')).parts || []; } catch { return []; }
}
function writeParts(parts) { fs.writeFileSync(partsFile, JSON.stringify({ parts }, null, 2), 'utf8'); }
const finite = v => typeof v === 'number' && Number.isFinite(v);
function validatePart(p) {
  if (!p || typeof p !== 'object') return 'part object required';
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) return 'name: 1-80 chars';
  if (!Array.isArray(p.vertices) || p.vertices.length < 3 || p.vertices.length > 5000) return 'vertices: 3-5000 points';
  if (!p.vertices.every(v => v && finite(v.x) && finite(v.y))) return 'vertices: numeric x, y';
  if (!Array.isArray(p.holes || []) || (p.holes || []).length > 500) return 'holes: array (max 500)';
  if (!(p.holes || []).every(h => h && finite(h.x) && finite(h.y) && finite(h.dia) && h.dia > 0)) return 'holes: numeric x, y, dia > 0';
  if (!finite(p.thickness) || p.thickness <= 0 || p.thickness > 200) return 'thickness: 0 < t <= 200 mm';
  return null;
}
function geomKey(p) {
  const r = v => Math.round(v * 1000) / 1000;
  return JSON.stringify([p.thickness, p.vertices.map(v => [r(v.x), r(v.y)]), (p.holes || []).map(h => [r(h.x), r(h.y), r(h.dia)])]);
}
async function handleParts(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { parts: readParts() });
  if (req.method === 'DELETE') {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const parts = readParts(), next = parts.filter(p => p.id !== id);
    if (next.length === parts.length) return sendJson(res, 404, { error: 'not found' });
    writeParts(next); return sendJson(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'GET, POST, DELETE' });
  const p = await readJson(req, res, BODY_LIMIT);
  if (p === undefined) return;
  const err = validatePart(p);
  if (err) return sendJson(res, 400, { error: err });
  const clean = {
    name: p.name.trim(), thickness: p.thickness,
    vertices: p.vertices.map(v => ({ x: v.x, y: v.y })),
    holes: (p.holes || []).map(h => ({ x: h.x, y: h.y, dia: h.dia, isSubtract: true })),
    source: p.source === 'dxf' ? 'dxf' : 'sketch'
  };
  const parts = readParts();
  const same = parts.find(q => geomKey(q) === geomKey(clean));
  if (same) return sendJson(res, 200, { part: same, existing: true });
  clean.id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  clean.createdAt = new Date().toISOString();
  parts.push(clean); writeParts(parts);
  sendJson(res, 201, { part: clean });
}

// ---------------------------------------------------------------------------
// Live telemetry relay (WebSocket /ws)
//   role=publisher : the twin page; its JSON messages are stored and relayed
//   role=viewer    : monitors / external programs; receive the latest snapshot on connect, then live
// Messages from viewers are ignored (read-only for consumers). The server never writes to equipment.
// ---------------------------------------------------------------------------
let latestTelemetry = null;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 << 20 });
const viewers = new Set();
const publishers = new Set();
wss.on('connection', (socket, req) => {
  const role = new URL(req.url, 'http://x').searchParams.get('role') === 'publisher' ? 'publisher' : 'viewer';
  (role === 'publisher' ? publishers : viewers).add(socket);
  if (role === 'viewer' && latestTelemetry) socket.send(latestTelemetry);
  socket.on('message', data => {
    if (role !== 'publisher') return;
    const text = data.toString();
    try { if (JSON.parse(text).type !== 'telemetry') return; } catch { return; }
    latestTelemetry = text;
    viewers.forEach(v => { if (v.readyState === 1) v.send(text); });
  });
  socket.on('close', () => { viewers.delete(socket); publishers.delete(socket); });
});
/** Send a server-originated message (real machine sample, finished cycle) to every connected page and monitor. */
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  publishers.forEach(p => { if (p.readyState === 1) p.send(msg); });
  viewers.forEach(v => { if (v.readyState === 1) v.send(msg); });
}
setInterval(() => {
  const msg = JSON.stringify({ type: 'stats', viewers: viewers.size, publishers: publishers.size });
  publishers.forEach(p => { if (p.readyState === 1) p.send(msg); });
}, 1000).unref();

restartPollers();

server.listen(PORT, HOST, () => {
  console.log(`Factory digital twin viewer: http://localhost:${PORT}  (bound to ${HOST}, files from ${baseDir}, local-program endpoints ${EXEC_ENABLED ? 'on' : 'off'})`);
});
