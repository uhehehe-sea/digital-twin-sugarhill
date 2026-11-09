import fs from 'fs';

const plyPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const stride = 62 * 4;

// Print first 5 vertices to verify exact binary layout and values!
for (let i = 0; i < 5; i++) {
  const b = offset + i * stride;
  const x = buf.readFloatLE(b + 0);
  const y = buf.readFloatLE(b + 4);
  const z = buf.readFloatLE(b + 8);
  const op = 1 / (1 + Math.exp(-buf.readFloatLE(b + 216)));
  const s0 = Math.exp(buf.readFloatLE(b + 220));
  const s1 = Math.exp(buf.readFloatLE(b + 224));
  const s2 = Math.exp(buf.readFloatLE(b + 228));
  console.log(`Vertex ${i}: pos=(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}), op=${op.toFixed(3)}, scale=(${s0.toFixed(4)}, ${s1.toFixed(4)}, ${s2.toFixed(4)})`);
}
