import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;

const pts = [];
for (let i = 0; i < 62892; i++) {
  const b = offset + i * stride;
  const x = buf.readFloatLE(b), y = buf.readFloatLE(b+4), z = buf.readFloatLE(b+8);
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b+220)), s1 = Math.exp(buf.readFloatLE(b+224)), s2 = Math.exp(buf.readFloatLE(b+228));
  if (Number.isFinite(x) && op > 0.02) {
    pts.push({ x, y, z, op, s0, s1, s2 });
  }
}

console.log('Total valid splats (op>0.02):', pts.length);
for (const r of [1, 2, 3, 5, 8, 12, 20, 50, 100, 500]) {
  const n = pts.filter(p => Math.hypot(p.x, p.y, p.z) < r).length;
  console.log(`Radius < ${r}: ${n} splats`);
}

// Find median center of dense core (radius < 15)
const core = pts.filter(p => Math.hypot(p.x, p.y, p.z) < 15);
const xs = core.map(p => p.x).sort((a,b) => a-b);
const ys = core.map(p => p.y).sort((a,b) => a-b);
const zs = core.map(p => p.z).sort((a,b) => a-b);
const q = (arr, p) => arr[Math.floor(arr.length * p)].toFixed(3);
console.log('Core (<15) X [10%, 50%, 90%]:', q(xs, 0.1), q(xs, 0.5), q(xs, 0.9));
console.log('Core (<15) Y [10%, 50%, 90%]:', q(ys, 0.1), q(ys, 0.5), q(ys, 0.9));
console.log('Core (<15) Z [10%, 50%, 90%]:', q(zs, 0.1), q(zs, 0.5), q(zs, 0.9));
