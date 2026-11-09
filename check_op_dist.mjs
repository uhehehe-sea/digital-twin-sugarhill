import fs from 'fs';

const plyPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;

const ops = [];
const scales = [];
for (let i = 0; i < 62892; i++) {
  const b = offset + i * stride;
  const x = buf.readFloatLE(b), y = buf.readFloatLE(b+4), z = buf.readFloatLE(b+8);
  if (!Number.isFinite(x)) continue;
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b+220)), s1 = Math.exp(buf.readFloatLE(b+224)), s2 = Math.exp(buf.readFloatLE(b+228));
  ops.push(op);
  scales.push(Math.max(s0, s1, s2));
}
ops.sort((a,b) => a-b);
scales.sort((a,b) => a-b);
const q = (arr, p) => arr[Math.floor(arr.length * p)].toFixed(4);
console.log('All 62,892 Opacity percentiles [10, 25, 50, 75, 85, 90, 95%]:',
  q(ops, 0.1), q(ops, 0.25), q(ops, 0.5), q(ops, 0.75), q(ops, 0.85), q(ops, 0.9), q(ops, 0.95));
console.log('All 62,892 MaxScale percentiles [10, 25, 50, 75, 85, 90, 95%]:',
  q(scales, 0.1), q(scales, 0.25), q(scales, 0.5), q(scales, 0.75), q(scales, 0.85), q(scales, 0.9), q(scales, 0.95));
