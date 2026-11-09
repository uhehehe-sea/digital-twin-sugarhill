// Parts library API (/api/parts). Run: npm test
// TWIN_DATA_DIR points the server at a temp folder so the real parts_library.json is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 8098;

function startServer(dataDir) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'viewer', 'server.mjs'), `--port=${PORT}`],
      { env: Object.assign({}, process.env, { TWIN_DATA_DIR: dataDir }) });
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    p.stdout.on('data', d => { if (String(d).includes(`:${PORT}`)) { clearTimeout(timer); resolve(p); } });
    p.stderr.on('data', d => process.stderr.write(d));
  });
}

test('parts library: save, dedupe, list, validate, delete', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-parts-'));
  const server = await startServer(tmp);
  const api = `http://127.0.0.1:${PORT}/api/parts`;
  const post = body => fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const part = { name: '판재 300×200', thickness: 12, vertices: [{ x: -150, y: -100 }, { x: 150, y: -100 }, { x: 150, y: 100 }, { x: -150, y: 100 }], holes: [{ x: 0, y: 0, dia: 30 }] };
    const r1 = await post(part);
    assert.equal(r1.status, 201);
    const saved = (await r1.json()).part;
    assert.match(saved.id, /^p_/);
    assert.equal(saved.source, 'sketch');

    const r2 = await post(Object.assign({}, part, { name: 'same geometry other name' }));
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).existing, true);

    for (const bad of [{}, Object.assign({}, part, { thickness: 0 }), Object.assign({}, part, { vertices: [{ x: 0, y: 0 }] }), Object.assign({}, part, { holes: [{ x: 0, y: 0, dia: -1 }] })]) {
      assert.equal((await post(bad)).status, 400, JSON.stringify(bad).slice(0, 60));
    }

    const list = await (await fetch(api)).json();
    assert.equal(list.parts.length, 1);
    assert.ok(fs.existsSync(path.join(tmp, 'parts_library.json')));

    assert.equal((await fetch(`${api}?id=${saved.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await (await fetch(api)).json()).parts.length, 0);
    assert.equal((await fetch(`${api}?id=nope`, { method: 'DELETE' })).status, 404);
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
