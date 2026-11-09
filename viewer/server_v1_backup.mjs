import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const PORT = 8088;
const baseDir = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin';
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
const solidcraftCli = 'C:\\Users\\jaeso\\.gemini\\antigravity\\bin\\solidcraft-cli.exe';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  if (url === '/' || url === '/index.html') {
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

server.listen(PORT, () => {
  console.log(`SolidCraft 3D Visualizer & Editor Server listening at http://localhost:${PORT}`);
});
