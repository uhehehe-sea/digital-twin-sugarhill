import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const outBinPath = (process.env.TWIN_ROOT || '.') + '/viewer/splat_cloud.bin';

const buf = fs.readFileSync(plyPath);
const headerEndStr = 'end_header\n';
let headerEndIdx = buf.indexOf(headerEndStr);
let offset = headerEndIdx + headerEndStr.length;
if (headerEndIdx === -1) {
  const crlf = 'end_header\r\n';
  headerEndIdx = buf.indexOf(crlf);
  offset = headerEndIdx + crlf.length;
}

const numVertices = 62892;
const stride = 62 * 4;
const SH_C0 = 0.28209479177387814;

const indoorSplats = [];
const xs = [], ys = [], zs = [];

for (let i = 0; i < numVertices; i++) {
  const base = offset + i * stride;
  if (base + stride > buf.length) break;

  const x = buf.readFloatLE(base + 0);
  const y = buf.readFloatLE(base + 4);
  const z = buf.readFloatLE(base + 8);

  const f_dc_0 = buf.readFloatLE(base + 24);
  const f_dc_1 = buf.readFloatLE(base + 28);
  const f_dc_2 = buf.readFloatLE(base + 32);

  const rawOpacity = buf.readFloatLE(base + 216);
  const opacity = 1 / (1 + Math.exp(-rawOpacity));

  const s0 = Math.exp(buf.readFloatLE(base + 220));
  const s1 = Math.exp(buf.readFloatLE(base + 224));
  const s2 = Math.exp(buf.readFloatLE(base + 228));
  const avgScale = (s0 + s1 + s2) / 3;

  const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_0));
  const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_1));
  const b = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_2));

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
  if (opacity < 0.08) continue;

  // Filter out far-field sky floaters (indoor COLMAP scene is within radius ~25 around origin)
  if (Math.abs(x) < 25 && Math.abs(y) < 20 && Math.abs(z) < 25) {
    xs.push(x);
    ys.push(y);
    zs.push(z);
    indoorSplats.push({ x, y, z, r, g, b, opacity, scale: avgScale });
  }
}

xs.sort((a, b) => a - b);
ys.sort((a, b) => a - b);
zs.sort((a, b) => a - b);
const pct = (arr, p) => arr[Math.floor(arr.length * p)];

console.log(`Indoor core splats: ${indoorSplats.length}`);
console.log(`X (2%..98%): ${pct(xs, 0.02).toFixed(2)} to ${pct(xs, 0.98).toFixed(2)} (median ${pct(xs, 0.5).toFixed(2)})`);
console.log(`Y (2%..98%): ${pct(ys, 0.02).toFixed(2)} to ${pct(ys, 0.98).toFixed(2)} (median ${pct(ys, 0.5).toFixed(2)})`);
console.log(`Z (2%..98%): ${pct(zs, 0.02).toFixed(2)} to ${pct(zs, 0.98).toFixed(2)} (median ${pct(zs, 0.5).toFixed(2)})`);

const xMin = pct(xs, 0.02), xMax = pct(xs, 0.98);
const yMin = pct(ys, 0.02), yMax = pct(ys, 0.98);
const zMin = pct(zs, 0.02), zMax = pct(zs, 0.98);

const filtered = indoorSplats.filter(s =>
  s.x >= xMin && s.x <= xMax &&
  s.y >= yMin && s.y <= yMax &&
  s.z >= zMin && s.z <= zMax
);

const outFloat = new Float32Array(filtered.length * 8);
for (let i = 0; i < filtered.length; i++) {
  const s = filtered[i];
  const normX = (s.x - xMin) / (xMax - xMin);
  const normZ = (s.z - zMin) / (zMax - zMin);
  const normUp = 1.0 - (s.y - yMin) / (yMax - yMin);

  outFloat[i * 8 + 0] = normX * 24000;
  outFloat[i * 8 + 1] = normZ * 15000;
  outFloat[i * 8 + 2] = normUp * 8200;
  outFloat[i * 8 + 3] = s.r;
  outFloat[i * 8 + 4] = s.g;
  outFloat[i * 8 + 5] = s.b;
  outFloat[i * 8 + 6] = s.opacity;
  outFloat[i * 8 + 7] = Math.min(Math.max(s.scale * 2200, 120), 650);
}

fs.writeFileSync(outBinPath, Buffer.from(outFloat.buffer));
console.log(`Saved ${filtered.length} indoor factory splats (${(outFloat.byteLength / 1024).toFixed(1)} KB) to ${outBinPath}`);
