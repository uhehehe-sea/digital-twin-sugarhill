// Lightmap baker (tools/bake_lightmap.mjs): a coarse bake of the generated building.  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('bake: writes an atlas and per-part UVs in OBJ vertex order; fixtures and the moving gate are left out', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-bake-'));
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'bake_lightmap.mjs'), '--texel', '500', '--size', '512', '--samples', '1', '--gather', '6', '--bounces', '1', '--threads', '2', '--no-grunge', '--out', tmp], { stdio: 'pipe' });
    const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'lightmap.json'), 'utf8'));
    const png = fs.readFileSync(path.join(tmp, 'lightmap.png'));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), meta.size[0]); assert.equal(png.readUInt32BE(20), meta.size[1]);
    assert.ok(meta.fixtures >= 16 && meta.maxE > 0);
    // a box is 6 quads = 12 triangles = 36 vertices in OBJLoader order
    assert.equal(meta.parts.Floor_Slab[1], 36);
    assert.ok(!meta.parts.HighBay_LED_Row1_X3810, 'fixtures glow, they are not baked');
    assert.ok(!Object.keys(meta.parts).some(n => /^Door_Sectional_/.test(n)), 'the moving gate is not baked');
    const uv = new Float32Array(new Uint8Array(fs.readFileSync(path.join(tmp, 'lightmap_uv.bin'))).buffer);
    const total = Object.values(meta.parts).reduce((s, e) => s + e[1], 0);
    assert.equal(uv.length, total * 2);
    for (const v of uv) assert.ok(v >= 0 && v <= 1);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
