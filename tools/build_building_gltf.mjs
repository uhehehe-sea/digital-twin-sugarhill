#!/usr/bin/env node
/*
 * build_building_gltf.mjs — factory_precision.obj → assets/models/factory_building.glb
 *
 *   The OBJ is millimetres, Z-up, and has no UV coordinates. This writes a standard glTF 2.0
 *   binary that Blender, Unreal (and three.js) open directly:
 *     • metres, Y-up (glTF convention):  (x, y, z)mm → (x, z, −y) / 1000
 *     • one node + mesh per building part, original part names kept
 *     • TEXCOORD_0 by box projection, 1 UV unit = 1 metre (scale the texture, not the UVs)
 *     • one material per surface slot from assets/surfaces/manifest.json (name + base colour only;
 *       textures are assigned in the target tool), everything else "structure"
 *
 *   Use it for: baking lightmaps/AO in Blender, importing the building into Unreal with
 *   Megascans materials, or as the future single source for the web viewer.
 *
 *   node tools/build_building_gltf.mjs [input.obj] [output.glb]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] || path.join(root, 'factory_precision.obj');
const output = process.argv[3] || path.join(root, 'assets', 'models', 'factory_building.glb');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'surfaces', 'manifest.json'), 'utf8'));
const slots = Object.entries(manifest.slots).map(([id, s]) => ({ id, re: new RegExp(s.match), tint: s.tint || '#cccccc', metal: !!s.metal }));

const obj = new OBJLoader().parse(fs.readFileSync(input, 'utf8'));
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(c => Math.pow(c, 2.2)); };

const chunks = []; let byteLength = 0;
const bufferViews = [], accessors = [], meshes = [], nodes = [];
const materials = [{ name: 'structure', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.62, 0.65, 1], metallicFactor: 0.2, roughnessFactor: 0.6 } }]
  .concat(slots.map(s => ({ name: s.id, pbrMetallicRoughness: { baseColorFactor: [...hex(s.tint), 1], metallicFactor: s.metal ? 1 : 0, roughnessFactor: 0.8 } })));

function addAccessor(arr, type, withBounds) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, target: 34962 });
  chunks.push(buf); byteLength += buf.length;
  const n = type === 'VEC3' ? 3 : 2, acc = { bufferView: bufferViews.length - 1, componentType: 5126, count: arr.length / n, type };
  if (withBounds) {
    acc.min = [Infinity, Infinity, Infinity]; acc.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { acc.min[k] = Math.min(acc.min[k], arr[i + k]); acc.max[k] = Math.max(acc.max[k], arr[i + k]); }
  }
  accessors.push(acc);
  return accessors.length - 1;
}

let parts = 0, tris = 0;
obj.traverse(o => {
  if (!o.isMesh || !o.geometry.attributes.position) return;
  const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
  if (!N) g.computeVertexNormals();
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);                              // mm, Z-up
    const nx = g.attributes.normal.getX(i), ny = g.attributes.normal.getY(i), nz = g.attributes.normal.getZ(i);
    pos.set([x / 1000, z / 1000, -y / 1000], i * 3);
    nor.set([nx, nz, -ny], i * 3);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);                 // same projection as viewer/visual_upgrade.js, in metres
    if (az >= ax && az >= ay) uv.set([x / 1000, y / 1000], i * 2);
    else if (ax >= ay) uv.set([y / 1000, z / 1000], i * 2);
    else uv.set([x / 1000, z / 1000], i * 2);
  }
  const slot = slots.findIndex(s => s.re.test(o.name));
  meshes.push({ name: o.name, primitives: [{ attributes: { POSITION: addAccessor(pos, 'VEC3', true), NORMAL: addAccessor(nor, 'VEC3'), TEXCOORD_0: addAccessor(uv, 'VEC2') }, material: slot + 1, mode: 4 }] });
  nodes.push({ name: o.name, mesh: meshes.length - 1 });
  parts++; tris += n / 3;
});

const gltf = {
  asset: { version: '2.0', generator: 'factory-digital-twin tools/build_building_gltf.mjs' },
  extras: { source: path.basename(input), units: 'metres, Y-up (source: millimetres, Z-up)', uv: 'box projection, 1 unit = 1 m' },
  scene: 0, scenes: [{ name: 'factory_building', nodes: nodes.map((_, i) => i) }],
  nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength }]
};
const pad = (buf, fill) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - buf.length % 4, fill)]) : buf);
const bin = pad(Buffer.concat(chunks), 0);
gltf.buffers[0].byteLength = bin.length;
const json = pad(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([header, jh, json, bh, bin]));
console.log(`wrote ${path.relative(root, output)}: ${parts} parts, ${tris} triangles, ${(fs.statSync(output).size / 1e6).toFixed(2)} MB`);
