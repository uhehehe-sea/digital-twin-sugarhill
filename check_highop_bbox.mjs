import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;

const highOp = [];
for (let i = 0; i < 62892; i++) {
  const b = offset + i * stride;
  const x = buf.readFloatLE(b), y = buf.readFloatLE(b+4), z = buf.readFloatLE(b+8);
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b+220)), s1 = Math.exp(buf.readFloatLE(b+224)), s2 = Math.exp(buf.readFloatLE(b+228));
  if (op > 0.5) {
    highOp.push({ x, y, z, r: Math.hypot(x, y, z), op, maxS: Math.max(s0, s1, s2), minS: Math.min(s0, s1, s2) });
  }
}

console.log('High opacity (>0.5) count:', highOp.length);
const rs = highOp.map(p => p.r).sort((a,b) => a-b);
const xs = highOp.map(p => p.x).sort((a,b) => a-b);
const ys = highOp.map(p => p.y).sort((a,b) => a-b);
const zs = highOp.map(p => p.z).sort((a,b) => a-b);
const ss = highOp.map(p => p.maxS).sort((a,b) => a-b);
const q = (arr, p) => arr[Math.floor(arr.length * p)].toFixed(3);
console.log('HighOp Radius [5, 25, 50, 75, 95%]:', q(rs, 0.05), q(rs, 0.25), q(rs, 0.5), q(rs, 0.75), q(rs, 0.95));
console.log('HighOp X [5, 25, 50, 75, 95%]:', q(xs, 0.05), q(xs, 0.25), q(xs, 0.5), q(xs, 0.75), q(xs, 0.95));
console.log('HighOp Y [5, 25, 50, 75, 95%]:', q(ys, 0.05), q(ys, 0.25), q(ys, 0.5), q(ys, 0.75), q(ys, 0.95));
console.log('HighOp Z [5, 25, 50, 75, 95%]:', q(zs, 0.05), q(zs, 0.25), q(zs, 0.5), q(zs, 0.75), q(zs, 0.95));
console.log('HighOp MaxScale [5, 25, 50, 75, 95%]:', q(ss, 0.05), q(ss, 0.25), q(ss, 0.5), q(ss, 0.75), q(ss, 0.95));
