import fs from 'fs';

const plyPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/sugarhill_iteration_30000.ply';
const outSplatPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/sugarhill.splat';

const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const numVertices = 62892;
const stride = 62 * 4;
const SH_C0 = 0.28209479177387814;

const splatBuf = Buffer.alloc(numVertices * 32);
let outCount = 0;

for (let i = 0; i < numVertices; i++) {
  const b = offset + i * stride;
  if (b + stride > buf.length) break;

  const x = buf.readFloatLE(b + 0);
  const y = buf.readFloatLE(b + 4);
  const z = buf.readFloatLE(b + 8);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

  const rawOp = buf.readFloatLE(b + 216);
  const opacity = 1.0 / (1.0 + Math.exp(-rawOp));
  if (opacity < 0.02) continue;

  const sx = Math.exp(buf.readFloatLE(b + 220));
  const sy = Math.exp(buf.readFloatLE(b + 224));
  const sz = Math.exp(buf.readFloatLE(b + 228));

  const f_dc_0 = buf.readFloatLE(b + 24);
  const f_dc_1 = buf.readFloatLE(b + 28);
  const f_dc_2 = buf.readFloatLE(b + 32);
  const r = Math.round(Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_0)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_1)) * 255);
  const bl = Math.round(Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_2)) * 255);
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);

  let qw = buf.readFloatLE(b + 232);
  let qx = buf.readFloatLE(b + 236);
  let qy = buf.readFloatLE(b + 240);
  let qz = buf.readFloatLE(b + 244);
  const qNorm = Math.hypot(qw, qx, qy, qz) || 1.0;
  qw /= qNorm; qx /= qNorm; qy /= qNorm; qz /= qNorm;

  const dst = outCount * 32;
  splatBuf.writeFloatLE(x, dst + 0);
  splatBuf.writeFloatLE(y, dst + 4);
  splatBuf.writeFloatLE(z, dst + 8);
  splatBuf.writeFloatLE(sx, dst + 12);
  splatBuf.writeFloatLE(sy, dst + 16);
  splatBuf.writeFloatLE(sz, dst + 20);
  splatBuf[dst + 24] = r;
  splatBuf[dst + 25] = g;
  splatBuf[dst + 26] = bl;
  splatBuf[dst + 27] = a;
  splatBuf[dst + 28] = Math.max(0, Math.min(255, Math.round(qw * 128 + 128)));
  splatBuf[dst + 29] = Math.max(0, Math.min(255, Math.round(qx * 128 + 128)));
  splatBuf[dst + 30] = Math.max(0, Math.min(255, Math.round(qy * 128 + 128)));
  splatBuf[dst + 31] = Math.max(0, Math.min(255, Math.round(qz * 128 + 128)));
  outCount++;
}

fs.writeFileSync(outSplatPath, splatBuf.subarray(0, outCount * 32));
console.log(`Converted ${outCount} Gaussians to standard .splat format (${(outCount * 32 / 1024).toFixed(1)} KB): ${outSplatPath}`);
