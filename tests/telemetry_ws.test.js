// Live telemetry relay: publisher → server → viewer, and /api/telemetry. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');

const PORT = 8097;

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'viewer', 'server.mjs'), `--port=${PORT}`]);
    const timer = setTimeout(() => reject(new Error('server did not start')), 8000);
    p.stdout.on('data', d => { if (String(d).includes(`:${PORT}`)) { clearTimeout(timer); resolve(p); } });
    p.on('error', reject);
  });
}
const open = url => new Promise((res, rej) => { const ws = new WebSocket(url); ws.once('open', () => res(ws)); ws.once('error', rej); });
const nextMessage = ws => new Promise(res => ws.once('message', d => res(JSON.parse(String(d)))));

test('publisher telemetry is relayed to viewers and served at /api/telemetry; viewers cannot publish', async () => {
  const server = await startServer();
  try {
    const viewer = await open(`ws://127.0.0.1:${PORT}/ws?role=viewer`);
    const publisher = await open(`ws://127.0.0.1:${PORT}/ws?role=publisher`);

    const msg = { type: 'telemetry', schema: 'sugarhill-twin/1', seq: 1, production: { completed: 3, machines: [{ name: 'CNC_01', phase: 'RUNNING' }] } };
    const got = nextMessage(viewer);
    publisher.send(JSON.stringify(msg));
    assert.deepEqual(await got, msg);

    const r = await fetch(`http://127.0.0.1:${PORT}/api/telemetry`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).production.completed, 3);

    // a viewer trying to publish must not overwrite the latest snapshot
    viewer.send(JSON.stringify({ type: 'telemetry', seq: 99, production: { completed: -1, machines: [] } }));
    await new Promise(r => setTimeout(r, 200));
    assert.equal((await (await fetch(`http://127.0.0.1:${PORT}/api/telemetry`)).json()).seq, 1);

    // a late viewer gets the latest snapshot immediately
    const late = await open(`ws://127.0.0.1:${PORT}/ws?role=viewer`);
    assert.equal((await nextMessage(late)).seq, 1);

    // non-telemetry messages are ignored
    publisher.send('not json');
    await new Promise(r => setTimeout(r, 100));
    assert.equal((await (await fetch(`http://127.0.0.1:${PORT}/api/telemetry`)).json()).seq, 1);

    [viewer, publisher, late].forEach(w => w.close());
  } finally {
    server.kill();
  }
});
