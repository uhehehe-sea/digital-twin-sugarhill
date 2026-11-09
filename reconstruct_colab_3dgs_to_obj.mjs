import fs from 'fs';

const plyPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_iteration_30000.ply';
const outColabObjPath = (process.env.TWIN_ROOT || '.') + '/sugarhill_colab_3dgs_mesh.obj';
const outTrueBinPath = (process.env.TWIN_ROOT || '.') + '/viewer/true_3dgs.bin';

const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const numVertices = 62892;
const stride = 62 * 4;
const SH_C0 = 0.28209479177387814;

const SCALE = 1550.0;
const OFFSET_X = 11500.0;
const OFFSET_Y = 7800.0;
const OFFSET_Z = 3100.0;

const surfels = [];

for (let i = 0; i < numVertices; i++) {
  const b = offset + i * stride;
  if (b + stride > buf.length) break;

  const cx = buf.readFloatLE(b + 0);
  const cy = buf.readFloatLE(b + 4);
  const cz = buf.readFloatLE(b + 8);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) continue;

  const dist = Math.hypot(cx, cy, cz);
  if (dist > 14.5) continue;

  const rawOp = buf.readFloatLE(b + 216);
  const opacity = 1.0 / (1.0 + Math.exp(-rawOp));
  if (opacity < 0.08) continue;

  const s0 = Math.exp(buf.readFloatLE(b + 220));
  const s1 = Math.exp(buf.readFloatLE(b + 224));
  const s2 = Math.exp(buf.readFloatLE(b + 228));
  const maxS = Math.max(s0, s1, s2);
  if (maxS > 1.35) continue;

  const f_dc_0 = buf.readFloatLE(b + 24);
  const f_dc_1 = buf.readFloatLE(b + 28);
  const f_dc_2 = buf.readFloatLE(b + 32);
  const r = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_0));
  const g = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_1));
  const bl = Math.max(0, Math.min(1, 0.5 + SH_C0 * f_dc_2));

  let qw = buf.readFloatLE(b + 232);
  let qx = buf.readFloatLE(b + 236);
  let qy = buf.readFloatLE(b + 240);
  let qz = buf.readFloatLE(b + 244);
  const qNorm = Math.hypot(qw, qx, qy, qz) || 1.0;
  qw /= qNorm; qx /= qNorm; qy /= qNorm; qz /= qNorm;

  const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qw * qz), r02 = 2 * (qx * qz + qw * qy);
  const r10 = 2 * (qx * qy + qw * qz), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qw * qx);
  const r20 = 2 * (qx * qz - qw * qy), r21 = 2 * (qy * qz + qw * qx), r22 = 1 - 2 * (qx * qx + qy * qy);

  const axes = [
    { s: s0 * SCALE, vec: [r00, r20, -r10] },
    { s: s1 * SCALE, vec: [r01, r21, -r11] },
    { s: s2 * SCALE, vec: [r02, r22, -r12] }
  ];
  axes.sort((a, b) => b.s - a.s);

  const wx = Math.max(100, Math.min(23900, cx * SCALE + OFFSET_X));
  const wy = Math.max(100, Math.min(14900, cz * SCALE + OFFSET_Y));
  const wz = Math.max(10, Math.min(8200, -cy * SCALE + OFFSET_Z));

  surfels.push({
    wx, wy, wz,
    r, g, bl, opacity,
    u: axes[0].vec, su: Math.min(Math.max(axes[0].s * 1.8, 60), 950),
    v: axes[1].vec, sv: Math.min(Math.max(axes[1].s * 1.8, 60), 950),
    n: axes[2].vec,
    area: axes[0].s * axes[1].s
  });
}

// 큰 배경 벽/바닥 서펠이 먼저 그려지고, 작고 선명한 디테일 서펠이 위에 겹쳐 그려지도록 정렬
surfels.sort((a, b) => b.area - a.area);
console.log(`Total full-coverage indoor 3DGS surfels: ${surfels.length}`);

// Decimated OBJ export (12,000 patches)
const VOXEL_SIZE = 110;
const voxelMap = new Map();
for (const sf of surfels) {
  const key = `${Math.floor(sf.wx / VOXEL_SIZE)},${Math.floor(sf.wy / VOXEL_SIZE)},${Math.floor(sf.wz / VOXEL_SIZE)}`;
  const ex = voxelMap.get(key);
  if (!ex || sf.opacity > ex.opacity) voxelMap.set(key, sf);
}
const decimatedSurfels = Array.from(voxelMap.values());
console.log(`Decimated OBJ patches: ${decimatedSurfels.length}`);

const objLines = [];
objLines.push('# Sugarhill Factory - Colab 3D Gaussian Splatting Surface Reconstructed & Decimated OBJ');
objLines.push(`# Source: sugarhill_iteration_30000.ply (${decimatedSurfels.length} oriented surface patches)`);
objLines.push('o Sugarhill_Colab_3DGS_Scanned_Mesh');

for (const sf of decimatedSurfels) {
  const [ux, uy, uz] = sf.u;
  const [vx, vy, vz] = sf.v;
  const su = sf.su, sv = sf.sv;
  const cr = sf.r.toFixed(4), cg = sf.g.toFixed(4), cb = sf.bl.toFixed(4);

  const p1 = [sf.wx - ux * su - vx * sv, sf.wy - uy * su - vy * sv, sf.wz - uz * su - vz * sv];
  const p2 = [sf.wx + ux * su - vx * sv, sf.wy + uy * su - vy * sv, sf.wz + uz * su - vz * sv];
  const p3 = [sf.wx + ux * su + vx * sv, sf.wy + uy * su + vy * sv, sf.wz + uz * su + vz * sv];
  const p4 = [sf.wx - ux * su + vx * sv, sf.wy - uy * su + vy * sv, sf.wz - uz * su + vz * sv];

  objLines.push(`v ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${p1[2].toFixed(1)} ${cr} ${cg} ${cb}`);
  objLines.push(`v ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} ${p2[2].toFixed(1)} ${cr} ${cg} ${cb}`);
  objLines.push(`v ${p3[0].toFixed(1)} ${p3[1].toFixed(1)} ${p3[2].toFixed(1)} ${cr} ${cg} ${cb}`);
  objLines.push(`v ${p4[0].toFixed(1)} ${p4[1].toFixed(1)} ${p4[2].toFixed(1)} ${cr} ${cg} ${cb}`);
  objLines.push(`vn ${sf.n[0].toFixed(3)} ${sf.n[1].toFixed(3)} ${sf.n[2].toFixed(3)}`);
}

for (let i = 0; i < decimatedSurfels.length; i++) {
  const vBase = i * 4 + 1;
  const nIdx = i + 1;
  objLines.push(`f ${vBase}//${nIdx} ${vBase+1}//${nIdx} ${vBase+2}//${nIdx} ${vBase+3}//${nIdx}`);
}

fs.writeFileSync(outColabObjPath, objLines.join('\n'), 'utf-8');
console.log(`Exported Colab 3DGS Mesh OBJ (${(fs.statSync(outColabObjPath).size / 1024).toFixed(1)} KB)`);

const binFloat = new Float32Array(surfels.length * 13);
for (let i = 0; i < surfels.length; i++) {
  const sf = surfels[i];
  const o = i * 13;
  binFloat[o + 0] = sf.wx;
  binFloat[o + 1] = sf.wy;
  binFloat[o + 2] = sf.wz;
  binFloat[o + 3] = sf.r;
  binFloat[o + 4] = sf.g;
  binFloat[o + 5] = sf.bl;
  binFloat[o + 6] = sf.opacity;
  binFloat[o + 7] = sf.u[0] * sf.su;
  binFloat[o + 8] = sf.u[1] * sf.su;
  binFloat[o + 9] = sf.u[2] * sf.su;
  binFloat[o + 10] = sf.v[0] * sf.sv;
  binFloat[o + 11] = sf.v[1] * sf.sv;
  binFloat[o + 12] = sf.v[2] * sf.sv;
}
fs.writeFileSync(outTrueBinPath, Buffer.from(binFloat.buffer));
console.log(`Saved ${surfels.length} full-coverage 3DGS surfels (${(binFloat.byteLength / 1024).toFixed(1)} KB) to ${outTrueBinPath}`);
