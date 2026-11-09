import fs from 'fs';

const plyPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;

let highOp = 0, sharpSurface = 0, giantFloaters = 0;
const scales = [];
for (let i = 0; i < 62892; i++) {
  const b = offset + i * stride;
  const cx = buf.readFloatLE(b), cy = buf.readFloatLE(b+4), cz = buf.readFloatLE(b+8);
  if (Math.hypot(cx, cy, cz) > 15) continue;
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b+220)), s1 = Math.exp(buf.readFloatLE(b+224)), s2 = Math.exp(buf.readFloatLE(b+228));
  const maxS = Math.max(s0, s1, s2);
  scales.push(maxS);
  if (op > 0.3) highOp++;
  if (op > 0.25 && maxS < 0.25) sharpSurface++;
  if (maxS >= 0.25) giantFloaters++;
}
scales.sort((a,b) => a-b);
const q = p => scales[Math.floor(scales.length * p)].toFixed(4);
console.log(`Indoor (<15): total=${scales.length}, highOp(>0.3)=${highOp}, sharpSurface(op>0.25 & maxS<0.25)=${sharpSurface}, giantFloaters(maxS>=0.25)=${giantFloaters}`);
console.log(`MaxScale percentiles [10%, 25%, 50%, 75%, 90%, 95%]:`, q(0.1), q(0.25), q(0.5), q(0.75), q(0.9), q(0.95));
