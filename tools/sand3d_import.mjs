#!/usr/bin/env node
/*
 * sand3d_import.mjs — bring Sand3D (Hugging Face, Sandflow) 3D assets into the twin.
 *
 * Sand3D is ~106k open 3D objects (CC-BY-4.0, attribution required), split across
 *   sand3d-objaverse  66.9k  furniture / household / vehicles / ... (from Objaverse/Sketchfab)
 *   sand3d-cad        24.5k  CAD parts — brackets, plates, flanges, sockets, clips ...
 *   sand3d-articraft   9.2k  handcrafted props
 *   sand3d-simready    2.3k  simulation-ready assets
 *   sand3d-automate    3.2k  automation / machinery
 * Each row carries a sand3d program (Python) AND a ready .usda file (USD ASCII, Z-up,
 * metres) plus a 512px render preview. This tool uses the .usda — no sand3d install needed.
 *
 * Pipeline per asset: search the HF datasets-server API -> download .usda
 *   (verify size + sha256) -> Blender headless converts USDA -> standard Y-up GLB
 *   (tools/sand3d_to_glb.py, prints dims) -> register in assets/sand3d/catalog.json
 *   + thumbnail (render preview) + CC-BY attribution in assets/sand3d/ATTRIBUTION.md.
 * The viewer loads the GLB with GLTFLoader and rotates it -90 deg about X on placement
 * (twin scene is Z-up; the GLB stays standard Y-up so it works in any viewer).
 *
 *   node tools/sand3d_import.mjs search <query> [--dataset objaverse|cad|all] [--limit N]
 *   node tools/sand3d_import.mjs import <asset-id> [--dataset objaverse]
 *   node tools/sand3d_import.mjs import --query <query> [--dataset ...] [--limit N]
 *
 * Blender: BLENDER_EXE (bake_lightmap.mjs) or BLENDER_PATH (server.mjs findBlender),
 *   else `blender` on PATH. On the Windows notebook: C:\Tools\blender\blender.exe.
 * No HF token needed — the datasets are public.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const SELF = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(SELF), '..');
const SAND3D_DIR = path.join(root, 'assets', 'sand3d');
const USDA_DIR = path.join(SAND3D_DIR, 'usda');
const CATALOG_FILE = path.join(SAND3D_DIR, 'catalog.json');
const ATTRIBUTION_FILE = path.join(SAND3D_DIR, 'ATTRIBUTION.md');

const DATASETS = {
  objaverse: 'Sandflow/sand3d-objaverse',
  cad: 'Sandflow/sand3d-cad',
  articraft: 'Sandflow/sand3d-articraft',
  simready: 'Sandflow/sand3d-simready',
  automate: 'Sandflow/sand3d-automate',
};
const DEFAULT_DATASETS = ['objaverse', 'cad'];

const HF_API = 'https://datasets-server.huggingface.co';

// ------------------------------------------------------------------ helpers
function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function flag(name) { return process.argv.includes(name); }

// Read all of stdin. NOTE: fs.readFileSync(0) does NOT work here — a synchronous
// read on a piped stdin blocks/fails in Node (verified: execFile `input` + sync
// read = hang). The stream API is the reliable way. We also destroy() stdin on
// 'end': a piped stdin Socket keeps the event loop alive even after EOF, so
// without this the process never exits when spawned by the server (verified:
// import completed and wrote the GLB+catalog, but the CLI stayed alive and the
// API call timed out).
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => { process.stdin.destroy(); resolve(data); });
    process.stdin.on('error', reject);
  });
}

async function fetchJson(url) {
  // Node's fetch does not go through this VM's egress proxy (undici ignores it
  // here), while curl works. Use curl for every HTTP call so the tool behaves
  // the same on the VM and on the Windows notebook (curl ships with Win 10+).
  // Retry transient HF 500s (the datasets-server /search endpoint 500s at times).
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execFileSync('curl', ['-sL', '--fail', '--max-time', '120', url],
        { encoding: 'utf8', maxBuffer: 1 << 28 });
      return JSON.parse(out);
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  throw new Error(`HF request failed after 3 attempts: ${url} (${lastErr.message.split('\n')[0]})`);
}
async function fetchBuffer(url) {
  const out = execFileSync('curl', ['-sL', '--fail', '--max-time', '300', url],
    { encoding: 'buffer', maxBuffer: 1 << 30 });
  return out;
}

// Fallback when /search is down: page through /rows and filter client-side.
// Matches family exactly, or entry/id containing the query (case-insensitive).
async function scanRows(dataset, query, limit, maxPages = 30) {
  const repo = DATASETS[dataset];
  const q = query.toLowerCase();
  const hits = [];
  for (let page = 0; page < maxPages && hits.length < limit; page++) {
    const url = `${HF_API}/rows?dataset=${encodeURIComponent(repo)}&config=default&split=train`
      + `&offset=${page * 100}&length=100`;
    const data = await fetchJson(url);
    for (const r of (data.rows || [])) {
      const row = r.row;
      const fam = (row.family || '').toLowerCase();
      const entry = (row.entry || '').toLowerCase();
      if (fam === q || entry.includes(q) || row.id.toLowerCase().includes(q)) {
        hits.push({ ...row, dataset });
        if (hits.length >= limit) break;
      }
    }
    if (!data.rows || data.rows.length < 100) break; // end of split
  }
  return hits;
}

function findBlender() {
  for (const p of [process.env.BLENDER_EXE, process.env.BLENDER_PATH]) {
    if (p && fs.existsSync(p)) return p;
  }
  try { return execSync('which blender || where blender', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0] || null; }
  catch { return null; }
}

function readCatalog() {
  try { return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')); } catch { return { items: [] }; }
}
function writeCatalog(cat) {
  fs.mkdirSync(SAND3D_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(cat, null, 2), 'utf8');
}

// ------------------------------------------------------------------ search
async function searchDataset(dataset, query, limit) {
  const repo = DATASETS[dataset];
  const url = `${HF_API}/search?dataset=${encodeURIComponent(repo)}&config=default&split=train`
    + `&query=${encodeURIComponent(query)}&offset=0&length=${limit}`;
  try {
    const data = await fetchJson(url);
    return (data.rows || []).map(r => ({ ...r.row, dataset }));
  } catch (e) {
    // /search 500s at times on HF's side — fall back to paging /rows.
    console.warn(`  /search failed for ${dataset} (${e.message.split('\n')[0]}), falling back to /rows scan`);
    return scanRows(dataset, query, limit);
  }
}

async function searchAll(query, datasets, limit) {
  const per = Math.max(1, Math.ceil(limit / datasets.length));
  let rows = [];
  for (const ds of datasets) rows = rows.concat(await searchDataset(ds, query, per));
  rows.sort((a, b) => (b.f_score || 0) - (a.f_score || 0));
  return rows.slice(0, limit);
}

// ------------------------------------------------------------------ import
async function importOne(row) {
  const { id, dataset, usda_path } = row;
  const repo = DATASETS[dataset];
  fs.mkdirSync(USDA_DIR, { recursive: true });

  // 1. Download USDA.
  const usdaUrl = `https://huggingface.co/datasets/${repo}/resolve/main/${usda_path}`;
  const usdaFile = path.join(USDA_DIR, `${id}.usda`);
  const buf = await fetchBuffer(usdaUrl);
  if (row.usda_bytes && buf.length !== row.usda_bytes) {
    throw new Error(`${id}: size mismatch (got ${buf.length}, expected ${row.usda_bytes})`);
  }
  if (row.usda_sha256) {
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash !== row.usda_sha256) throw new Error(`${id}: sha256 mismatch`);
  }
  fs.writeFileSync(usdaFile, buf);

  // 2. Thumbnail (render preview, signed URL — download now, store locally).
  let thumb = null;
  try {
    const src = row.render && row.render.src;
    if (src) {
      const img = await fetchBuffer(src);
      thumb = `${id}.jpg`;
      fs.writeFileSync(path.join(SAND3D_DIR, thumb), img);
    }
  } catch (e) { console.warn(`  thumbnail failed for ${id}: ${e.message}`); }

  // 3. Blender: USDA -> GLB, prints SAND3D_JSON with dims.
  const blender = findBlender();
  if (!blender) throw new Error('Blender not found — set BLENDER_EXE (or BLENDER_PATH) to blender(.exe)');
  const glbFile = path.join(SAND3D_DIR, `${id}.glb`);
  const out = execFileSync(blender, [
    '-b', '--factory-startup', '--python', path.join(path.dirname(SELF), 'sand3d_to_glb.py'),
    '--', usdaFile, glbFile,
  ], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const line = out.split(/\r?\n/).find(l => l.startsWith('SAND3D_JSON '));
  if (!line) throw new Error(`${id}: Blender did not print SAND3D_JSON\n${out.slice(-2000)}`);
  const dims = JSON.parse(line.slice('SAND3D_JSON '.length));

  // 4. Register in catalog.
  const cat = readCatalog();
  const entry = {
    id,
    dataset,
    name: row.entry || id,
    family: row.family || null,
    glb: `assets/sand3d/${id}.glb`,
    thumb: thumb ? `assets/sand3d/${thumb}` : null,
    dims_mm: dims.dims_mm,
    meshes: dims.meshes,
    license: row.license || 'CC-BY-4.0',
    attribution: row.attribution || null,
    source_url: `https://huggingface.co/datasets/${repo}`,
    imported_at: new Date().toISOString(),
  };
  const ix = cat.items.findIndex(i => i.id === id);
  if (ix >= 0) cat.items[ix] = entry; else cat.items.push(entry);
  writeCatalog(cat);

  // 5. CC-BY attribution file.
  if (entry.attribution) {
    const lineOut = `- ${id} (${entry.name}, ${entry.family || 'uncategorised'}) — ${entry.attribution}`;
    let md = '';
    try { md = fs.readFileSync(ATTRIBUTION_FILE, 'utf8'); } catch { md = '# Sand3D attribution (CC-BY-4.0)\n\nSand3D assets are CC-BY-4.0. Each imported asset keeps its original author attribution below.\n\n'; }
    if (!md.includes(id)) fs.writeFileSync(ATTRIBUTION_FILE, md.replace(/\n$/, '') + '\n' + lineOut + '\n', 'utf8');
  }

  return entry;
}

// ------------------------------------------------------------------ CLI
async function main() {
  const cmd = process.argv[2];
  if (cmd === 'search') {
    const query = process.argv[3];
    if (!query) { console.error('usage: search <query> [--dataset objaverse|cad|all] [--limit N]'); process.exit(2); }
    const dsArg = arg('--dataset', 'all');
    const datasets = dsArg === 'all' ? DEFAULT_DATASETS : dsArg.split(',').filter(d => DATASETS[d]);
    const limit = parseInt(arg('--limit', '10'), 10) || 10;
    const rows = await searchAll(query, datasets, limit);
    if (flag('--json')) {
      console.log(JSON.stringify({ query, count: rows.length, rows }, null, 2));
      return;
    }
    console.log(`found ${rows.length} (query "${query}", datasets ${datasets.join(',')})`);
    for (const r of rows) {
      console.log(`- ${r.id} | ${r.dataset} | ${r.family} | ${r.entry} | ${(r.usda_bytes / 1024).toFixed(0)} KB | f=${(r.f_score ?? 0).toFixed(2)} | ${r.license}`);
      console.log(`    ${r.attribution || ''}`);
    }
    return;
  }

  if (cmd === 'import') {
    const limit = parseInt(arg('--limit', '5'), 10) || 5;
    const dsArg = arg('--dataset', 'objaverse');
    let rows;
    if (flag('--row-file')) {
      // Full row JSON in a file (the server writes it and passes the path).
      // Preferred over --row-stdin: passing a row through a pipe/stdin is
      // fragile in Node (sync read blocks, async read can miss EOF / keep the
      // process alive), while a plain file read always works.
      const rowFile = arg('--row-file');
      const row = JSON.parse(fs.readFileSync(rowFile, 'utf8'));
      if (!row.id || !row.usda_path) { console.error('row-file needs { id, usda_path, ... }'); process.exit(2); }
      row.dataset = row.dataset || dsArg;
      rows = [row];
    } else if (flag('--row-stdin')) {
      // Full row JSON on stdin (from the server / viewer, which already has the
      // row from a search). Skips the lookup entirely — the only path that works
      // when the datasets-server /search endpoint is down.
      const text = await readStdin();
      const row = JSON.parse(text);
      if (!row.id || !row.usda_path) { console.error('row-stdin needs { id, usda_path, ... }'); process.exit(2); }
      row.dataset = row.dataset || dsArg;
      rows = [row];
    } else if (process.argv[3] && !process.argv[3].startsWith('--')) {
      // Single id: fetch the row from the dataset (search by id is not supported,
      // so list rows and match — the datasets-server /rows endpoint paginates;
      // for a single id the caller should pass --query with the entry name instead).
      const id = process.argv[3];
      const datasets = dsArg === 'all' ? Object.keys(DATASETS) : [dsArg];
      rows = [];
      for (const ds of datasets) {
        const found = await searchAll(id, [ds], 5);
        const hit = found.find(r => r.id === id);
        if (hit) { rows = [hit]; break; }
      }
      if (!rows.length) { console.error(`asset not found: ${id} (try: import --query "<entry name>")`); process.exit(1); }
    } else {
      const query = arg('--query');
      if (!query) { console.error('usage: import <asset-id> | import --query <query> [--dataset ...] [--limit N]'); process.exit(2); }
      const datasets = dsArg === 'all' ? DEFAULT_DATASETS : dsArg.split(',').filter(d => DATASETS[d]);
      rows = await searchAll(query, datasets, limit);
    }
    for (const row of rows) {
      console.log(`importing ${row.id} (${row.dataset}, ${row.family}, ${row.entry}) ...`);
      const entry = await importOne(row);
      console.log(`  -> ${entry.glb}  dims ${entry.dims_mm ? entry.dims_mm.join(' x ') + ' mm' : 'unknown'}  meshes ${entry.meshes}`);
    }
    console.log(`catalog: ${CATALOG_FILE} (${readCatalog().items.length} items)`);
    return;
  }

  console.error('usage:\n  search <query> [--dataset objaverse|cad|all] [--limit N]\n  import <asset-id> [--dataset objaverse]\n  import --query <query> [--dataset ...] [--limit N]\n  import --row-file <path>  (full row JSON in a file, skips the lookup)\n  import --row-stdin  (full row JSON on stdin, skips the lookup)');
  process.exit(2);
}

main().catch(e => { console.error('sand3d_import:', e.message); process.exit(1); });
