import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const outPath = (process.env.TWIN_ROOT || '.') + '/viewer/true_3dgs.bin';

const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const numVertices = 62892;
const stride = 62 * 4;
const SH_C0 = 0.28209479177387814;

// Precompute 3D covariance matrix (6 upper-triangular elements) for each Gaussian
// In COLMAP, camera Y is down, Z is forward, X is right.
// To convert COLMAP (X, Y, Z) to our Right-Handed Z-Up World (X_w = X, Y_w = Z, Z_w = -Y):
// Coordinate transform matrix T = [ [1, 0, 0], [0, 0, 1], [0, -1, 0] ]
// Scale factor: 1 COLMAP unit = 1500 mm (so [-8..+8] maps to 24,000 mm x 15,000 mm)
const SCALE = 1500.0;
const OFFSET_X = 11500.0;
const OFFSET_Y = 7800.0;
const OFFSET_Z = 3200.0;

const splats = [];

for (let i = 0; i < numVertices; i++) {
  const b = offset + i * stride;
  if (b + stride > buf.length) break;

  const cx = buf.readFloatLE(b + 0);
  const cy = buf.readFloatLE(b + 4);
  const cz = buf.readFloatLE(b + 8);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) continue;

  // Filter out extreme sky floaters beyond radius 18 in COLMAP space
  if (Math.hypot(cx, cy, cz) > 18.0) continue;

  const rawOp = buf.readFloatLE(b + 216);
  const opacity = 1.0 / (1.0 + Math.exp(-rawOp));
  if (opacity < 0.04) continue;

  const f_dc_0 = buf.readFloatLE(b + 24);
  const f_dc_1 = buf.readFloatLE(b + 28);
  const f_dc_2 = buf.readFloatLE(b + 32);
  const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_0));
  const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_1));
  const bl = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_2));

  // Scales in world mm (clamp giant anomalous floaters)
  const sx = Math.min(Math.exp(buf.readFloatLE(b + 220)), 0.8) * SCALE;
  const sy = Math.min(Math.exp(buf.readFloatLE(b + 224)), 0.8) * SCALE;
  const sz = Math.min(Math.exp(buf.readFloatLE(b + 228)), 0.8) * SCALE;

  // Quaternion (rot_0 = w, rot_1 = x, rot_2 = y, rot_3 = z)
  let qw = buf.readFloatLE(b + 232);
  let qx = buf.readFloatLE(b + 236);
  let qy = buf.readFloatLE(b + 240);
  let qz = buf.readFloatLE(b + 244);
  const qNorm = Math.hypot(qw, qx, qy, qz) || 1.0;
  qw /= qNorm; qx /= qNorm; qy /= qNorm; qz /= qNorm;

  // 3D rotation matrix R in COLMAP space
  const r00 = 1 - 2 * (qy * qy + qz * qz);
  const r01 = 2 * (qx * qy - qw * qz);
  const r02 = 2 * (qx * qz + qw * qy);
  const r10 = 2 * (qx * qy + qw * qz);
  const r11 = 1 - 2 * (qx * qx + qz * qz);
  const r12 = 2 * (qy * qz - qw * qx);
  const r20 = 2 * (qx * qz - qw * qy);
  const r21 = 2 * (qy * qz + qw * qx);
  const r22 = 1 - 2 * (qx * qx + qy * qy);

  // Transform to Z-Up world: row0 = row0_c, row1 = row2_c, row2 = -row1_c
  // M = T * R * S
  const m00 = r00 * sx, m01 = r01 * sy, m02 = r02 * sz;
  const m10 = r20 * sx, m11 = r21 * sy, m12 = r22 * sz;
  const m20 = -r10 * sx, m21 = -r11 * sy, m22 = -r12 * sz;

  // Sigma = M * M^T (symmetric 3x3: c00, c01, c02, c11, c12, c22)
  const c00 = m00 * m00 + m01 * m01 + m02 * m02;
  const c01 = m00 * m10 + m01 * m11 + m02 * m12;
  const c02 = m00 * m20 + m01 * m21 + m02 * m22;
  const c11 = m10 * m10 + m11 * m11 + m12 * m12;
  const c12 = m10 * m20 + m11 * m21 + m12 * m22;
  const c22 = m20 * m20 + m21 * m21 + m22 * m22;

  // World position in mm (Z-up)
  const wx = cx * SCALE + OFFSET_X;
  const wy = cz * SCALE + OFFSET_Y;
  const wz = -cy * SCALE + OFFSET_Z;

  splats.push({ wx, wy, wz, r, g, bl, opacity, c00, c01, c02, c11, c12, c22 });
}

// 13 floats per splat
const outFloat = new Float32Array(splats.length * 13);
for (let i = 0; i < splats.length; i++) {
  const s = splats[i];
  const o = i * 13;
  outFloat[o + 0] = s.wx;
  outFloat[o + 1] = s.wy;
  outFloat[o + 2] = s.wz;
  outFloat[o + 3] = s.r;
  outFloat[o + 4] = s.g;
  outFloat[o + 5] = s.bl;
  outFloat[o + 6] = s.opacity;
  outFloat[o + 7] = s.c00;
  outFloat[o + 8] = s.c01;
  outFloat[o + 9] = s.c02;
  outFloat[o + 10] = s.c11;
  outFloat[o + 11] = s.c12;
  outFloat[o + 12] = s.c22;
}

fs.writeFileSync(outPath, Buffer.from(outFloat.buffer));
console.log(`Exported ${splats.length} true anisotropic 3D Gaussians (${(outFloat.byteLength / 1024).toFixed(1)} KB) to ${outPath}`);
