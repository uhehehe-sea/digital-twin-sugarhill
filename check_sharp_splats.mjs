import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;
const SH_C0 = 0.28209479177387814;

// Check where high-opacity compact splats are located
const sharp = [];
for (let i = 0; i < 62892; i++) {
  const b = offset + i * stride;
  const x = buf.readFloatLE(b), y = buf.readFloatLE(b+4), z = buf.readFloatLE(b+8);
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b+220)), s1 = Math.exp(buf.readFloatLE(b+224)), s2 = Math.exp(buf.readFloatLE(b+228));
  const maxS = Math.max(s0, s1, s2);
  const minS = Math.min(s0, s1, s2);
  const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * buf.readFloatLE(b+24)));
  const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * buf.readFloatLE(b+28)));
  const bl = Math.max(0, Math.min(1, 0.5 + SH_C0 * buf.readFloatLE(b+32)));
  if (Math.hypot(x, y, z) < 12 && op > 0.25 && maxS < 0.25) {
    sharp.push({ x, y, z, op, s0, s1, s2, maxS, minS, r, g, bl });
  }
}

console.log('Sharp compact splats (<12m, op>0.25, maxS<0.25):', sharp.length);
const xs = sharp.map(p => p.x).sort((a,b) => a-b);
const ys = sharp.map(p => p.y).sort((a,b) => a-b);
const zs = sharp.map(p => p.z).sort((a,b) => a-b);
const q = (arr, p) => arr[Math.floor(arr.length * p)].toFixed(3);
console.log('Sharp X [5%, 25%, 50%, 75%, 95%]:', q(xs, 0.05), q(xs, 0.25), q(xs, 0.5), q(xs, 0.75), q(xs, 0.95));
console.log('Sharp Y [5%, 25%, 50%, 75%, 95%]:', q(ys, 0.05), q(ys, 0.25), q(ys, 0.5), q(ys, 0.75), q(ys, 0.95));
console.log('Sharp Z [5%, 25%, 50%, 75%, 95%]:', q(zs, 0.05), q(zs, 0.25), q(zs, 0.5), q(zs, 0.75), q(zs, 0.95));
