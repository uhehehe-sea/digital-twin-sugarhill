import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

// Paths are resolved relative to this file so the server works from any checkout.
// (Previously hard-coded to the original Antigravity scratch folder.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.argv.find(a => a.startsWith('--port='));
const PORT = parseInt(portArg ? portArg.split('=')[1] : process.env.PORT, 10) || 8088;
// Bind to loopback only: this server exposes endpoints that run local executables.
const HOST = process.env.HOST || '127.0.0.1';
const baseDir = path.resolve(__dirname, '..');
const viewerDir = path.join(baseDir, 'viewer');
const precisionObj = path.join(baseDir, 'factory_precision.obj');
const unifiedObj = path.join(baseDir, 'factory_digital_twin_unified.obj');
const stepFile = path.join(baseDir, 'factory_precision.step');
const evalReport = path.join(baseDir, 'eval_report.json');
const matSpecFile = path.join(baseDir, 'materials_pp_fkm_stainless_spec.json');
const manifestFile = path.join(baseDir, 'nvidia_isaac_assets', 'nvidia_simready_manifest.json');
const layoutFile = path.join(baseDir, 'scene_layout.json');
const cncObjFile = path.join(baseDir, 'industrial_cnc_and_3dprinter.obj');
const blenderScriptFile = path.join(baseDir, 'setup_blender_isaac_digital_twin.py');
const solidcraftCli = process.env.SOLIDCRAFT_CLI || 'C:\\Users\\jaeso\\.gemini\\antigravity\\bin\\solidcraft-cli.exe';

const server = http.createServer((req, res) => {
  // No Access-Control-Allow-Origin header: pages are served from this same origin,
  // and a wildcard would let any website call the exec endpoints below.
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // V2 업그레이드 전용 라우트 (기존 / 및 /index.html 은 원본 그대로 유지)
  if (url === '/v2' || url === '/v2/' || url === '/index_v2.html') {
    const v2Path = path.join(viewerDir, 'index_v2.html');
    if (fs.existsSync(v2Path)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(v2Path));
      return;
    }
  } else if (url === '/studio' || url === '/studio/' || url === '/closed_loop' || url === '/digital_twin_closed_loop_studio.html') {
    const studioPath = path.join(viewerDir, 'digital_twin_closed_loop_studio.html');
    if (fs.existsSync(studioPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(studioPath));
      return;
    }
  } else if (url === '/polymer' || url === '/polymer/' || url === '/cam_nesting' || url === '/polymer_auto_cam_nesting_studio.html') {
    const polyPath = path.join(viewerDir, 'polymer_auto_cam_nesting_studio.html');
    if (fs.existsSync(polyPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(polyPath));
      return;
    }
  } else if (url === '/editor_v2.js') {
    const v2JsPath = path.join(viewerDir, 'editor_v2.js');
    if (fs.existsSync(v2JsPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(v2JsPath));
      return;
    }
  } else if (url.startsWith('/basis/')) {
    const basisRel = decodeURIComponent(url.slice('/basis/'.length)).replace(/\.\./g, '');
    const basisFile = path.join(viewerDir, 'basis', basisRel);
    if (fs.existsSync(basisFile)) {
      const ext = path.extname(basisFile).toLowerCase();
      const mime = ext === '.wasm' ? 'application/wasm' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(basisFile));
      return;
    }
  } else if (url.startsWith('/lib/')) {
    // Shared pure-function modules (also imported by Node tests in /tests)
    const rel = decodeURIComponent(url.slice('/lib/'.length)).replace(/\.\./g, '');
    const libFile = path.join(viewerDir, 'lib', rel);
    if (rel.endsWith('.js') && fs.existsSync(libFile)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(libFile));
      return;
    }
  } else if (url.startsWith('/libs/')) {
    const libRel = decodeURIComponent(url.slice('/libs/'.length)).replace(/\.\./g, '');
    const libFile = path.join(viewerDir, 'libs', libRel);
    if (fs.existsSync(libFile)) {
      const ext = path.extname(libFile).toLowerCase();
      const mime = ext === '.wasm' ? 'application/wasm' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(libFile));
      return;
    }
  } else if (url.startsWith('/renders_cycles/')) {
    const renderRel = decodeURIComponent(url.slice('/renders_cycles/'.length)).replace(/\.\./g, '');
    const renderFile = path.join(baseDir, 'renders_cycles_photoreal', renderRel);
    if (fs.existsSync(renderFile)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(renderFile));
      return;
    }
  }

  if (url === '/' || url === '/hub') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, 'hub.html')));
  } else if (url === '/twin_live.js' || url === '/twin_nest.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, url.slice(1))));
  } else if (url === '/demo') {
    // single-file build (node tools/build_standalone.mjs) — the same file that is shared as HTML
    const demo = path.join(baseDir, 'dist', 'sugarhill_twin_demo.html');
    if (fs.existsSync(demo)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(demo));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Run: node tools/build_standalone.mjs');
    }
  } else if (url === '/monitor' || url === '/monitor/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, 'monitor.html')));
  } else if (url === '/api/parts') {
    handleParts(req, res);
  } else if (url === '/api/telemetry') {
    // Latest snapshot published by the twin (poll-friendly for external tools)
    res.writeHead(latestTelemetry ? 200 : 204, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(latestTelemetry || '');
  } else if (url === '/v1' || url === '/index.html') {
    // original v1 viewer, kept for comparison
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, 'index.html')));
  } else if (url === '/editor.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, 'editor.js')));
  } else if (url === '/splat.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(viewerDir, 'splat.html')));
  } else if (url === '/model.obj') {
    const targetFile = fs.existsSync(precisionObj) ? precisionObj : unifiedObj;
    if (fs.existsSync(targetFile)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(targetFile));
    } else {
      res.writeHead(404);
      res.end('Model not found');
    }
  } else if (url === '/cnc_3dprinter.obj') {
    if (fs.existsSync(cncObjFile)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(cncObjFile));
    } else {
      res.writeHead(404);
      res.end('CNC/3DP OBJ not found');
    }
  } else if (url === '/model_unified.obj') {
    if (fs.existsSync(unifiedObj)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(unifiedObj));
    } else {
      res.writeHead(404);
      res.end('Model not found');
    }
  } else if (url === '/eval_report.json') {
    if (fs.existsSync(evalReport)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(evalReport));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'eval report not found' }));
    }
  } else if (url === '/api/materials') {
    if (fs.existsSync(matSpecFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(matSpecFile));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'materials spec not found' }));
    }
  } else if (url === '/api/manifest') {
    if (fs.existsSync(manifestFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(manifestFile));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'manifest not found' }));
    }
  } else if (url === '/api/layout' && req.method === 'GET') {
    if (fs.existsSync(layoutFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(fs.readFileSync(layoutFile));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ items: null }));
    }
  } else if (url === '/api/layout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(layoutFile, JSON.stringify(parsed, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          savedPath: layoutFile,
          count: Array.isArray(parsed.items) ? parsed.items.length : 0,
          timestamp: new Date().toISOString()
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
  } else if (url === '/api/render-blender' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed = {};
        if (body && body.trim()) {
          parsed = JSON.parse(body);
          if (parsed.items && Array.isArray(parsed.items)) {
            fs.writeFileSync(layoutFile, JSON.stringify(parsed, null, 2), 'utf8');
          }
        }

        // parsed.blenderPath is intentionally ignored: an executable path must not come
        // from a request body. Set BLENDER_PATH in the environment instead.
        const candidatePaths = [
          process.env.BLENDER_PATH,
          'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
          'C:\\Program Files\\Blender Foundation\\Blender 4.1\\blender.exe',
          'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
          'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
          'C:\\Program Files\\Steam\\steamapps\\common\\Blender\\blender.exe'
        ].filter(Boolean);

        let blenderBin = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            blenderBin = p;
            break;
          }
        }

        const renderOutputDir = path.join(baseDir, 'renders_cycles_photoreal');
        const defaultRenderImg = path.join(renderOutputDir, 'cycles_digital_twin_render.png');

        if (!blenderBin) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            reason: 'blender_executable_not_found',
            layoutSaved: true,
            layoutPath: layoutFile,
            scriptPath: blenderScriptFile,
            previewImage: fs.existsSync(defaultRenderImg) ? '/renders_cycles/cycles_digital_twin_render.png' : null,
            message: 'Blender 실행 파일(blender.exe)을 기본 경로에서 찾을 수 없습니다. 설정 창에서 경로를 지정하거나 터미널에서 headless 명령을 실행할 수 있습니다.',
            cliCommand: `blender -b -P "${blenderScriptFile}" -- --render`
          }));
          return;
        }

        const renderCmd = `"${blenderBin}" -b -P "${blenderScriptFile}" -- --render`;
        exec(renderCmd, { timeout: 180000 }, (err, stdout, stderr) => {
          if (err) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: false,
              reason: 'blender_exec_error',
              error: stderr || err.message,
              layoutSaved: true,
              previewImage: fs.existsSync(defaultRenderImg) ? '/renders_cycles/cycles_digital_twin_render.png' : null
            }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              layoutSaved: true,
              renderImage: '/renders_cycles/cycles_digital_twin_render.png',
              stdout: stdout ? stdout.slice(-800) : '',
              timestamp: new Date().toISOString()
            }));
          }
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
  } else if (url === '/splat_cloud.bin' || url === '/true_3dgs.bin' || url === '/sugarhill.splat') {
    const splatBin = path.join(viewerDir, url.slice(1));
    if (fs.existsSync(splatBin)) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(fs.readFileSync(splatBin));
    } else {
      res.writeHead(404);
      res.end('Splat bin not found');
    }
  } else if (url === '/sugarhill.ply') {
    const plyFile = path.join(baseDir, 'sugarhill_iteration_30000.ply');
    if (fs.existsSync(plyFile)) {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(fs.readFileSync(plyFile));
    } else {
      res.writeHead(404);
      res.end('PLY not found');
    }
  } else if (url === '/download/colab_obj') {
    const colabObj = path.join(baseDir, 'sugarhill_colab_3dgs_mesh.obj');
    if (fs.existsSync(colabObj)) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sugarhill_colab_3dgs_mesh.obj"'
      });
      res.end(fs.readFileSync(colabObj));
    } else {
      res.writeHead(404);
      res.end('Colab OBJ not found');
    }
  } else if (url === '/download/blender_script') {
    if (fs.existsSync(blenderScriptFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/x-python; charset=utf-8',
        'Content-Disposition': 'attachment; filename="setup_blender_isaac_digital_twin.py"'
      });
      res.end(fs.readFileSync(blenderScriptFile));
    } else {
      res.writeHead(404);
      res.end('Blender script not found');
    }
  } else if (url === '/solidcraft_native_xray.png' || url === '/solidcraft_native_cutaway.png') {
    const imgPath = path.join(viewerDir, url.slice(1));
    if (fs.existsSync(imgPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(imgPath));
    } else {
      res.writeHead(404);
      res.end('Image not found');
    }
  } else if (url.startsWith('/assets/')) {
    const relPath = decodeURIComponent(url.slice('/assets/'.length)).replace(/\.\./g, '');
    const assetPath = path.join(baseDir, 'nvidia_isaac_assets', relPath);
    if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      const ext = path.extname(assetPath).toLowerCase();
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.ktx2': 'image/ktx2',
        '.mdl': 'text/plain; charset=utf-8',
        '.usd': 'application/octet-stream',
        '.json': 'application/json; charset=utf-8'
      };
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(assetPath));
    } else {
      res.writeHead(404);
      res.end('Asset not found');
    }
  } else if (url === '/download/step') {
    if (fs.existsSync(stepFile)) {
      res.writeHead(200, {
        'Content-Type': 'application/step',
        'Content-Disposition': 'attachment; filename="factory_precision.step"'
      });
      res.end(fs.readFileSync(stepFile));
    } else {
      res.writeHead(404);
      res.end('STEP not found');
    }
  } else if (url === '/api/rebuild' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST' });
    res.end(JSON.stringify({ success: false, error: 'POST required' }));
  } else if (url === '/api/rebuild') {
    const cmd = `"${solidcraftCli}" run "${path.join(baseDir, 'factory_precision.json')}" --out "${precisionObj}" --out "${stepFile}" --save "${path.join(baseDir, 'factory_precision.sc')}" --param-check strict --timings`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: stderr || err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, stdout: stdout.trim() }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ---------------------------------------------------------------------------
// Parts library (modeled / imported flat parts) — parts_library.json
//   GET    /api/parts            → { parts: [...] }
//   POST   /api/parts  {part}    → { part }  (validated, id assigned; same geometry → existing entry)
//   DELETE /api/parts?id=...     → { ok }
// ---------------------------------------------------------------------------
// TWIN_DATA_DIR lets tests (or a deployment) keep the library outside the repo
const partsFile = path.join(process.env.TWIN_DATA_DIR || baseDir, 'parts_library.json');
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
function handleParts(req, res) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET') return send(200, { parts: readParts() });
  if (req.method === 'DELETE') {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const parts = readParts(), next = parts.filter(p => p.id !== id);
    if (next.length === parts.length) return send(404, { error: 'not found' });
    writeParts(next); return send(200, { ok: true });
  }
  if (req.method !== 'POST') return send(405, { error: 'GET, POST, DELETE' });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let p;
    try { p = JSON.parse(body); } catch { return send(400, { error: 'invalid JSON' }); }
    const err = validatePart(p);
    if (err) return send(400, { error: err });
    const clean = {
      name: p.name.trim(), thickness: p.thickness,
      vertices: p.vertices.map(v => ({ x: v.x, y: v.y })),
      holes: (p.holes || []).map(h => ({ x: h.x, y: h.y, dia: h.dia, isSubtract: true })),
      source: p.source === 'dxf' ? 'dxf' : 'sketch'
    };
    const parts = readParts();
    const same = parts.find(q => geomKey(q) === geomKey(clean));
    if (same) return send(200, { part: same, existing: true });
    clean.id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    clean.createdAt = new Date().toISOString();
    parts.push(clean); writeParts(parts);
    send(201, { part: clean });
  });
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
setInterval(() => {
  const msg = JSON.stringify({ type: 'stats', viewers: viewers.size, publishers: publishers.size });
  publishers.forEach(p => { if (p.readyState === 1) p.send(msg); });
}, 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Factory digital twin viewer: http://localhost:${PORT}  (bound to ${HOST}, files from ${baseDir})`);
});
