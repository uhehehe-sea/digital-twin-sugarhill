// Server hardening (review 2026-11-09, items A/B/C/D/H). Run: npm test
// Raw http.request is used on purpose: fetch() normalises "../" before sending, which would hide traversal.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const lib = require(path.join(ROOT, 'viewer', 'server_lib.cjs'));

function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const clean = Object.assign({}, process.env);
    for (const k of ['SOLIDCRAFT_CLI', 'BLENDER_PATH', 'CAMOTICS_PATH', 'TWIN_EXEC_TOKEN', 'HOST']) delete clean[k];
    const p = spawn(process.execPath, [path.join(ROOT, 'viewer', 'server.mjs'), `--port=${port}`],
      { env: Object.assign(clean, env) });
    const timer = setTimeout(() => { p.kill(); reject(new Error('server did not start')); }, 8000);
    p.stdout.on('data', d => { if (String(d).includes(`:${port}`)) { clearTimeout(timer); resolve(p); } });
    p.stderr.on('data', d => process.stderr.write(d));
  });
}

function raw(port, method, rawPath, body, headers) {
  return new Promise((resolve, reject) => {
    let got = null;
    const req = http.request({ host: '127.0.0.1', port, method, path: rawPath, headers: headers || {} }, res => {
      const chunks = [];
      got = { status: res.statusCode, headers: res.headers };
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Object.assign(got, { body: Buffer.concat(chunks).toString('utf8') })));
    });
    req.on('error', e => (got ? resolve(Object.assign(got, { body: got.body || '' })) : reject(e)));
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------- pure helpers
test('safeResolve: keeps paths inside root, rejects traversal / absolute / malformed', () => {
  const root = path.join(ROOT, 'viewer', 'lib');
  assert.equal(lib.safeResolve(root, 'nc_program.js'), path.join(root, 'nc_program.js'));
  assert.equal(lib.safeResolve(root, 'sub%2Fa.js'), path.join(root, 'sub', 'a.js'));
  for (const bad of ['../server.mjs', '..%2Fserver.mjs', '..%5Cserver.mjs', '....//....//package.json',
    '%2e%2e/%2e%2e/package.json', '/etc/passwd', 'C:%5CWindows%5Cwin.ini', '%E0%A4%A', 'a%00b', '', '..']) {
    assert.equal(lib.safeResolve(root, bad), null, bad);
  }
});

test('isLoopback: only 127.x, ::1 and localhost count as local', () => {
  for (const h of ['127.0.0.1', '127.1.2.3', '::1', 'localhost', '::ffff:127.0.0.1']) assert.ok(lib.isLoopback(h), h);
  for (const h of ['0.0.0.0', '::', '192.168.0.10', 'example.com', '']) assert.ok(!lib.isLoopback(h), h);
});

test('validateLayout: items array required, bounded size', () => {
  assert.equal(lib.validateLayout({ items: [] }), null);
  assert.equal(lib.validateLayout({ items: [{ id: 'a' }], camera: {} }), null);
  assert.ok(lib.validateLayout(null));
  assert.ok(lib.validateLayout([]));
  assert.ok(lib.validateLayout({ items: 'x' }));
  assert.ok(lib.validateLayout({ items: [1] }));
  assert.ok(lib.validateLayout({ items: new Array(lib.LAYOUT_MAX_ITEMS + 1).fill({}) }));
});

// ---------------------------------------------------------------- live server
test('static routes: traversal never leaks files, malformed URLs do not crash the server', async () => {
  const port = 8121;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-sec-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
    const probes = [];
    for (const prefix of ['/basis/', '/lib/', '/libs/', '/renders_cycles/', '/assets/']) {
      for (const p of ['..%2F..%2Fpackage.json', '....//....//package.json', '%2e%2e%2f%2e%2e%2fpackage.json',
        '..%5C..%5Cpackage.json', '..%2F..%2Fviewer%2Fserver.mjs', '%2e%2e%5c%2e%2e%5cpackage.json']) probes.push(prefix + p);
      probes.push(prefix + '%E0%A4%A'); // malformed escape: used to throw inside the request handler
    }
    for (const p of probes) {
      const r = await raw(port, 'GET', p);
      assert.ok(r.status === 400 || r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
      assert.ok(!r.body.includes('"factory-digital-twin"') && !r.body.includes('createServer'), `${p} leaked a file`);
    }
    // still alive and still serving legitimate files
    const ok = await raw(port, 'GET', '/lib/nc_program.js');
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /javascript/);
    assert.ok(ok.body.length > 1000);
    assert.notEqual(pkg.length, 0);
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('POST bodies: oversize -> 413, invalid layout -> 400, valid layout saved under TWIN_DATA_DIR', async () => {
  const port = 8122;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-sec-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    const big = JSON.stringify({ items: [], pad: 'x'.repeat(3e6) });
    for (const url of ['/api/layout', '/api/render-blender', '/api/parts']) {
      const r = await raw(port, 'POST', url, big, { 'Content-Type': 'application/json' });
      assert.equal(r.status, 413, url);
    }
    assert.equal((await raw(port, 'POST', '/api/layout', '{"items":"nope"}')).status, 400);
    assert.equal((await raw(port, 'POST', '/api/layout', 'not json')).status, 400);
    const good = await raw(port, 'POST', '/api/layout', JSON.stringify({ items: [{ id: 'cnc', x: 1 }] }));
    assert.equal(good.status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'scene_layout.json'), 'utf8'));
    assert.equal(saved.items[0].id, 'cnc');
    assert.ok(!good.body.includes(tmp), 'response must not reveal absolute paths');
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('exec endpoints: no hard-coded executable, token enforced when configured, never exec on GET', async () => {
  const port = 8123;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-sec-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp });
  try {
    const rb = await raw(port, 'POST', '/api/rebuild', '');
    assert.equal(rb.status, 503);
    assert.equal(JSON.parse(rb.body).reason, 'solidcraft_not_configured');
    assert.equal((await raw(port, 'GET', '/api/rebuild')).status, 405);

    const cm = await raw(port, 'POST', '/api/camotics', JSON.stringify({ gcode: 'G0 X0 Y0\nM30\n' }));
    assert.equal(cm.status, 503);
    assert.equal(JSON.parse(cm.body).reason, 'camotics_not_configured');
  } finally {
    server.kill();
  }
  const port2 = 8124;
  const server2 = await startServer(port2, { TWIN_DATA_DIR: tmp, TWIN_EXEC_TOKEN: 's3cret', SOLIDCRAFT_CLI: path.join(tmp, 'missing.exe') });
  try {
    assert.equal((await raw(port2, 'POST', '/api/rebuild', '')).status, 401);
    assert.equal((await raw(port2, 'POST', '/api/rebuild', '', { 'X-Twin-Token': 'wrong' })).status, 401);
    const ok = await raw(port2, 'POST', '/api/rebuild', '', { 'X-Twin-Token': 's3cret' });
    assert.equal(ok.status, 503); // token accepted, then the configured file does not exist
    assert.equal(JSON.parse(ok.body).reason, 'solidcraft_not_found');
  } finally {
    server2.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('camotics: G-code payload is validated before anything is written or launched', async () => {
  const port = 8125;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-sec-'));
  const server = await startServer(port, { TWIN_DATA_DIR: tmp, CAMOTICS_PATH: path.join(tmp, 'no-camotics.exe') });
  try {
    for (const bad of ['{}', '{"gcode":""}', '{"gcode":123}', JSON.stringify({ gcode: 'G0 X0\u0000' })]) {
      assert.equal((await raw(port, 'POST', '/api/camotics', bad)).status, 400, bad);
    }
    const r = await raw(port, 'POST', '/api/camotics', JSON.stringify({ gcode: 'G0 X0 Y0\nM30\n', name: '../../evil' }));
    assert.equal(r.status, 503);
    assert.equal(JSON.parse(r.body).reason, 'camotics_not_found');
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('repository: no personal absolute paths left in runtime files', () => {
  const runtime = ['viewer/server.mjs', 'setup_blender_isaac_digital_twin.py', 'viewer/index_v2.html',
    'viewer/editor_v2.js', 'viewer/twin_live.js', 'viewer/twin_nest.js', 'package.json'];
  for (const f of runtime) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/[A-Z]:[\\/]{1,2}Users[\\/]{1,2}[^<\\/]|\/(home|Users)\/[a-z0-9_.-]+\/\.gemini/i.test(text), `${f} still contains a personal path`);
  }
});
