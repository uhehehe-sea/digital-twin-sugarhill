#!/usr/bin/env node
/*
 * bake_lightmap.mjs — precomputed lighting for the generated building (no Blender needed).
 *
 *   What Unreal's Lightmass / Blender's bake do, in plain Node: for every patch of every static
 *   surface, compute the light arriving there and store it in one texture (a lightmap).
 *     1. direct light from every ceiling fixture (rectangular emitters, jittered samples → soft shadows)
 *     2. two bounces of indirect light (cosine-weighted gather; a hit returns albedo x light already there)
 *     3. daylight through openings the rays can escape by (the glass entrance) as a cool sky term
 *     4. optional "use" marks baked in for free: floor stains and wall streaks (procedural, --no-grunge to skip)
 *   At runtime the viewer just multiplies surfaces by this texture — cheaper than real-time area lights
 *   and shadows, which matters on integrated graphics.
 *
 *   Inputs : factory_precision.obj (from tools/build_factory_shell.mjs), assets/surfaces/manifest.json (surface colours)
 *   Outputs: assets/lightmap/lightmap.png      sRGB-encoded irradiance / maxE
 *            assets/lightmap/lightmap_uv.bin   Float32 lightmap UVs per part, in OBJLoader vertex order
 *            assets/lightmap/lightmap.json     size, maxE, part → [offset, vertexCount], stats
 *
 *   node tools/bake_lightmap.mjs [--texel 90] [--size 2048] [--samples 4] [--gather 32] [--bounces 2]
 *                                [--no-grunge] [--obj file] [--out dir] [--threads N]
 *
 *   Static only: the bake describes the building as generated. After moving or deleting building parts
 *   in the editor the baked shadows no longer match — regenerate and bake again.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

const SELF = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(SELF), '..');

// ------------------------------------------------------------------ small vector helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------------------ BVH over convex planar polygons
/** polys: [{ v: [[x,y,z]...], n: [x,y,z], d, ax, ay (2D projection axes), id }] */
function buildBVH(polys) {
  const items = polys.map((p, i) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const q of p.v) for (let k = 0; k < 3; k++) { if (q[k] < mn[k]) mn[k] = q[k]; if (q[k] > mx[k]) mx[k] = q[k]; }
    return { i, mn, mx, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
  });
  function make(list) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const it of list) for (let k = 0; k < 3; k++) { if (it.mn[k] < mn[k]) mn[k] = it.mn[k]; if (it.mx[k] > mx[k]) mx[k] = it.mx[k]; }
    if (list.length <= 4) return { mn, mx, leaf: list.map(it => it.i) };
    const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], ax = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : (ext[1] > ext[2] ? 1 : 2);
    list.sort((a, b) => a.c[ax] - b.c[ax]);
    const mid = list.length >> 1;
    return { mn, mx, l: make(list.slice(0, mid)), r: make(list.slice(mid)) };
  }
  return make(items);
}
function hitBox(n, o, inv, tmax) {
  let t0 = 0, t1 = tmax;
  for (let k = 0; k < 3; k++) {
    let a = (n.mn[k] - o[k]) * inv[k], b = (n.mx[k] - o[k]) * inv[k];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}
/** Ray / convex polygon. Returns t or -1. */
function hitPoly(p, o, dir, tmin, tmax) {
  const dn = dot(p.n, dir);
  if (dn > -1e-9 && dn < 1e-9) return -1;
  const t = (p.d - dot(p.n, o)) / dn;
  if (t <= tmin || t >= tmax) return -1;
  const a = p.ax, b = p.ay, x = o[a] + dir[a] * t, y = o[b] + dir[b] * t, v = p.v, m = v.length;
  let sign = 0;
  for (let i = 0; i < m; i++) {
    const q = v[i], r = v[(i + 1) % m];
    const c = (r[a] - q[a]) * (y - q[b]) - (r[b] - q[b]) * (x - q[a]);
    if (c > 1e-7) { if (sign < 0) return -1; sign = 1; } else if (c < -1e-7) { if (sign > 0) return -1; sign = -1; }
  }
  return t;
}
function occluded(bvh, polys, o, dir, tmax) {
  const inv = [1 / dir[0], 1 / dir[1], 1 / dir[2]], stack = [bvh];
  while (stack.length) {
    const n = stack.pop();
    if (!hitBox(n, o, inv, tmax)) continue;
    if (n.leaf) { for (const i of n.leaf) if (hitPoly(polys[i], o, dir, 1, tmax) > 0) return true; } else { stack.push(n.l, n.r); }
  }
  return false;
}
function closest(bvh, polys, o, dir) {
  const inv = [1 / dir[0], 1 / dir[1], 1 / dir[2]], stack = [bvh];
  let best = Infinity, id = -1;
  while (stack.length) {
    const n = stack.pop();
    if (!hitBox(n, o, inv, best)) continue;
    if (n.leaf) { for (const i of n.leaf) { const t = hitPoly(polys[i], o, dir, 1, best); if (t > 0) { best = t; id = i; } } } else { stack.push(n.l, n.r); }
  }
  return id < 0 ? null : { t: best, id };
}
// cheap deterministic random numbers per (texel, sample)
function rnd(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; }

// ================================================================== worker: lights one slice of texels
if (!isMainThread) {
  const W = workerData;
  const polys = W.polys, bvh = buildBVH(polys), em = W.emitters, charts = W.charts;
  const pos = new Float32Array(W.pos), nor = new Float32Array(W.nor), src = W.src ? new Float32Array(W.src) : null, out = new Float32Array(W.out);
  const size = W.size;
  /** Light already stored at a hit point (previous pass), times the surface colour there → radiance x pi. */
  function radiosityAt(pid, p) {
    const pl = polys[pid], c = pl.chart;
    if (c < 0) return pl.fallback;                                  // not a baked surface (gate, etc.): average light x its colour
    const ch = charts[c], rel = sub(p, ch.o);
    let tx = Math.floor((dot(rel, ch.u) - ch.minU) / ch.dens), ty = Math.floor((dot(rel, ch.v) - ch.minV) / ch.dens);
    if (tx < 0) tx = 0; else if (tx >= ch.w) tx = ch.w - 1;
    if (ty < 0) ty = 0; else if (ty >= ch.h) ty = ch.h - 1;
    const k = ((ch.y + ty) * size + ch.x + tx) * 3;
    return [src[k] * ch.alb[0], src[k + 1] * ch.alb[1], src[k + 2] * ch.alb[2]];
  }
  for (let i = W.from; i < W.to; i++) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]];
    const o = [p[0] + n[0] * 3, p[1] + n[1] * 3, p[2] + n[2] * 3];
    let r = 0, g = 0, b = 0;
    if (W.mode === 'direct') {
      for (let e = 0; e < em.length; e++) {
        const L = em[e];
        for (let s = 0; s < W.samples; s++) {
          const q = [L.c[0] + (rnd(i, e * 31 + s * 7 + 1) - 0.5) * L.sx, L.c[1] + (rnd(i, e * 31 + s * 7 + 2) - 0.5) * L.sy, L.c[2]];
          const d = sub(q, o), dist = Math.hypot(d[0], d[1], d[2]), wi = [d[0] / dist, d[1] / dist, d[2] / dist];
          const cs = dot(n, wi), cl = wi[2];                          // emitters face straight down
          if (cs <= 0 || cl <= 0) continue;
          if (occluded(bvh, polys, o, wi, dist - 2)) continue;
          const k = L.area * cs * cl / (dist * dist) / W.samples;     // x radiance, applied after normalisation
          r += k * L.col[0]; g += k * L.col[1]; b += k * L.col[2];
        }
      }
    } else {                                                          // gather: E = mean over cosine-weighted directions of (albedo x E_there), sky for escapes
      const t1 = norm(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0])), t2 = cross(n, t1), N = W.gather;
      for (let s = 0; s < N; s++) {
        const u1 = (s + rnd(i, s * 13 + 5 + W.pass * 101)) / N, u2 = rnd(i, s * 17 + 9 + W.pass * 211);
        const rr = Math.sqrt(u1), ph = 6.283185307 * u2, x = rr * Math.cos(ph), y = rr * Math.sin(ph), z = Math.sqrt(Math.max(0, 1 - u1));
        const dir = [t1[0] * x + t2[0] * y + n[0] * z, t1[1] * x + t2[1] * y + n[1] * z, t1[2] * x + t2[2] * y + n[2] * z];
        const h = closest(bvh, polys, o, dir);
        if (!h) { if (W.pass === 0) { r += W.sky[0]; g += W.sky[1]; b += W.sky[2]; } continue; }   // daylight counts once
        const c = radiosityAt(h.id, [o[0] + dir[0] * h.t, o[1] + dir[1] * h.t, o[2] + dir[2] * h.t]);
        r += c[0]; g += c[1]; b += c[2];
      }
      r /= N; g /= N; b /= N;
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
  }
  parentPort.postMessage('done');
}

// ================================================================== main
if (isMainThread) await main();

async function main() {
  const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt; };
  const flag = name => process.argv.includes('--' + name);
  const objPath = path.resolve(arg('obj', path.join(root, 'factory_precision.obj')));
  const outDir = path.resolve(arg('out', path.join(root, 'assets', 'lightmap')));
  const DENS = +arg('texel', 90), SIZE = +arg('size', 2048), SAMPLES = +arg('samples', 4), GATHER = +arg('gather', 32), BOUNCES = +arg('bounces', 2);
  const THREADS = Math.max(1, +arg('threads', Math.min(12, os.availableParallelism ? os.availableParallelism() : 4)));
  const GRUNGE = !flag('no-grunge'), TARGET_FLOOR_E = +arg('floor', 2.8), SKY = [+arg('sky', 6) * 0.86, +arg('sky', 6) * 0.94, +arg('sky', 6) * 1.0];
  const t0 = Date.now();

  // ---- surface colours (diffuse reflectance) from the same manifest the viewer uses
  const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const hex = h => { const n = parseInt(h.slice(1), 16); return [lin((n >> 16 & 255) / 255), lin((n >> 8 & 255) / 255), lin((n & 255) / 255)]; };
  let slots = [];
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'surfaces', 'manifest.json'), 'utf8'));
    slots = Object.values(mf.slots || {}).map(s => ({ re: new RegExp(s.match), alb: s.paint ? hex(s.paint) : hex(s.tint || '#ffffff').map(c => Math.min(0.85, c * 0.42 * (s.brightness || 1))) }));
  } catch (e) { /* no manifest: neutral grey */ }
  const albedoOf = name => { const s = slots.find(q => q.re.test(name)); return s ? s.alb : [0.45, 0.45, 0.45]; };

  // ---- OBJ → parts with planar polygons
  const V = [], parts = []; let cur = null;
  for (const line of fs.readFileSync(objPath, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) { const a = line.split(/\s+/); V.push([+a[1], +a[2], +a[3]]); }
    else if (line.startsWith('o ') || line.startsWith('g ')) { cur = { name: line.slice(2).trim(), faces: [] }; parts.push(cur); }
    else if (line.startsWith('f ') && cur) cur.faces.push(line.slice(2).trim().split(/\s+/).map(t => V[parseInt(t, 10) - 1]));
  }
  const NOT_BAKED = /^(Door_Sectional_|HighBay_LED|Main_Glass_Entry_Panel|Cage_Mesh|Mezz_Upper_Window|Exit_Sign)/;   // moving, glowing or see-through
  const NO_OCCLUDE = /^(HighBay_LED|Main_Glass_Entry_Panel|Cage_Mesh|SafetyLine_|Joint_|Floor_Stop|Exit_Sign|Mezz_Upper_Window)/;
  const EMITTER = /^HighBay_LED/;

  const polys = [], charts = [], emitters = [], uvIndex = {}, rects = [];
  for (const part of parts) {
    const baked = !NOT_BAKED.test(part.name), occl = !NO_OCCLUDE.test(part.name), alb = albedoOf(part.name);
    if (EMITTER.test(part.name)) {                                   // the bottom face of a fixture box is the emitter
      const f = part.faces.reduce((a, b) => (a.reduce((s, p) => s + p[2], 0) / a.length < b.reduce((s, p) => s + p[2], 0) / b.length ? a : b));
      const xs = f.map(p => p[0]), ys = f.map(p => p[1]);
      emitters.push({ c: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, f[0][2] - 1], sx: Math.max(...xs) - Math.min(...xs), sy: Math.max(...ys) - Math.min(...ys), area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)), col: /Mezz/.test(part.name) ? [1, 0.93, 0.82] : [0.96, 0.98, 1], gain: /Mezz/.test(part.name) ? 0.35 : 1 });
    }
    part.charts = [];
    for (const f of part.faces) {
      if (f.length < 3) continue;
      let n = null;
      for (let i = 1; i + 1 < f.length && !n; i++) { const c = cross(sub(f[i], f[0]), sub(f[i + 1], f[0])); if (Math.hypot(c[0], c[1], c[2]) > 1e-6) n = norm(c); }
      if (!n) { part.charts.push(-1); continue; }
      const an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], drop = an[0] > an[1] ? (an[0] > an[2] ? 0 : 2) : (an[1] > an[2] ? 1 : 2);
      const poly = { v: f, n, d: dot(n, f[0]), ax: (drop + 1) % 3, ay: (drop + 2) % 3, chart: -1, fallback: [alb[0] * 1.5, alb[1] * 1.5, alb[2] * 1.5] };
      let chart = -1;
      if (baked && f.length <= 8) {
        // chart frame: u along the longest edge, v perpendicular in the face plane
        let best = 0, u = null;
        for (let i = 0; i < f.length; i++) { const e = sub(f[(i + 1) % f.length], f[i]), l = Math.hypot(e[0], e[1], e[2]); if (l > best) { best = l; u = norm(e); } }
        const v = cross(n, u);
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        for (const p of f) { const a = dot(sub(p, f[0]), u), b = dot(sub(p, f[0]), v); if (a < minU) minU = a; if (a > maxU) maxU = a; if (b < minV) minV = b; if (b > maxV) maxV = b; }
        const w = Math.max(2, Math.ceil((maxU - minU) / DENS)), h = Math.max(2, Math.ceil((maxV - minV) / DENS));
        chart = charts.length;
        charts.push({ o: f[0], u, v, n, minU, minV, dens: DENS, w, h, x: 0, y: 0, alb, part: part.name, poly: polys.length, spanU: maxU - minU, spanV: maxV - minV });
        rects.push(chart);
        poly.chart = chart;
      }
      part.charts.push(chart);
      if (occl || chart >= 0) polys.push(Object.assign(poly, { occl }));
    }
  }
  if (!emitters.length) throw new Error('no HighBay_LED fixtures in ' + objPath);

  // ---- shelf-pack the chart rectangles (1 texel gutter all round)
  rects.sort((a, b) => charts[b].h - charts[a].h);
  let x = 0, y = 0, shelf = 0;
  for (const c of rects) {
    const ch = charts[c], w = ch.w + 2, h = ch.h + 2;
    if (w > SIZE) throw new Error(`chart of ${ch.part} is ${w} texels wide: raise --texel or --size`);
    if (x + w > SIZE) { x = 0; y += shelf; shelf = 0; }
    if (y + h > SIZE) throw new Error(`lightmap ${SIZE}x${SIZE} is full at ${DENS} mm/texel: raise --texel or --size`);
    ch.x = x + 1; ch.y = y + 1; x += w; if (h > shelf) shelf = h;
  }
  const usedRows = y + shelf;

  // ---- one sample point per texel (texels whose centre lies outside their polygon are filled in afterwards)
  let count = 0;
  for (const ch of charts) count += ch.w * ch.h;
  const posB = new SharedArrayBuffer(count * 12), norB = new SharedArrayBuffer(count * 12), pos = new Float32Array(posB), nor = new Float32Array(norB);
  const texel = new Int32Array(count), valid = new Uint8Array(count);
  let k = 0;
  for (const ch of charts) {
    const pl = polys[ch.poly];
    for (let ty = 0; ty < ch.h; ty++) for (let tx = 0; tx < ch.w; tx++) {
      const a = ch.minU + Math.min(ch.spanU - 1e-3, (tx + 0.5) * ch.dens * (ch.spanU / (ch.w * ch.dens))), b = ch.minV + Math.min(ch.spanV - 1e-3, (ty + 0.5) * ch.dens * (ch.spanV / (ch.h * ch.dens)));
      const p = [ch.o[0] + ch.u[0] * a + ch.v[0] * b, ch.o[1] + ch.u[1] * a + ch.v[1] * b, ch.o[2] + ch.u[2] * a + ch.v[2] * b];
      pos.set(p, k * 3); nor.set(ch.n, k * 3);
      texel[k] = (ch.y + ty) * SIZE + ch.x + tx;
      valid[k] = hitPoly(pl, [p[0] + ch.n[0] * 10, p[1] + ch.n[1] * 10, p[2] + ch.n[2] * 10], [-ch.n[0], -ch.n[1], -ch.n[2]], 0, 20) > 0 ? 1 : 0;
      k++;
    }
  }
  console.log(`[bake] ${parts.length} parts, ${polys.length} polygons, ${charts.length} charts, ${count.toLocaleString()} texels (${usedRows}/${SIZE} rows), ${emitters.length} fixtures, ${THREADS} threads`);

  const wPolys = polys.filter(p => p.occl || p.chart >= 0).map(p => ({ v: p.v, n: p.n, d: p.d, ax: p.ax, ay: p.ay, chart: p.chart, fallback: p.fallback }));
  // gather must see every baked surface; shadow rays must skip the non-occluders (floor lines, joints)
  const occlPolys = polys.filter(p => p.occl).map(p => ({ v: p.v, n: p.n, d: p.d, ax: p.ax, ay: p.ay, chart: p.chart, fallback: p.fallback }));
  const wCharts = charts.map(c => ({ o: c.o, u: c.u, v: c.v, minU: c.minU, minV: c.minV, dens: c.dens * (c.spanU / (c.w * c.dens) || 1), w: c.w, h: c.h, x: c.x, y: c.y, alb: c.alb }));
  // the chart lookup uses one density for both axes: store exact per-axis scale instead
  charts.forEach((c, i) => { wCharts[i].dens = 1; wCharts[i].u = c.u.map(q => q * c.w / Math.max(c.spanU, 1e-6)); wCharts[i].v = c.v.map(q => q * c.h / Math.max(c.spanV, 1e-6)); wCharts[i].minU = c.minU * c.w / Math.max(c.spanU, 1e-6); wCharts[i].minV = c.minV * c.h / Math.max(c.spanV, 1e-6); });

  function run(mode, extra) {
    const outB = new SharedArrayBuffer(count * 12), per = Math.ceil(count / THREADS);
    return Promise.all(Array.from({ length: THREADS }, (_, t) => new Promise((resolve, reject) => {
      const w = new Worker(SELF, { workerData: Object.assign({ mode, polys: mode === 'direct' ? occlPolys : wPolys, emitters, charts: wCharts, pos: posB, nor: norB, out: outB, size: SIZE, from: t * per, to: Math.min(count, (t + 1) * per), samples: SAMPLES, gather: GATHER, sky: SKY }, extra) });
      w.on('message', resolve); w.on('error', reject);
    }))).then(() => new Float32Array(outB));
  }
  /** Scatter per-texel values into an atlas-sized buffer (what gather passes read back). */
  function toAtlas(vals) {
    const b = new SharedArrayBuffer(SIZE * SIZE * 12), a = new Float32Array(b);
    for (let i = 0; i < count; i++) { const q = texel[i] * 3; a[q] = vals[i * 3]; a[q + 1] = vals[i * 3 + 1]; a[q + 2] = vals[i * 3 + 2]; }
    return b;
  }
  /** Box blur inside each chart, valid texels only: removes sampling noise without bleeding across surfaces. */
  function blur(vals, radius) {
    const outv = new Float32Array(vals.length); let base = 0;
    for (const ch of charts) {
      for (let ty = 0; ty < ch.h; ty++) for (let tx = 0; tx < ch.w; tx++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const xx = tx + dx, yy = ty + dy;
          if (xx < 0 || yy < 0 || xx >= ch.w || yy >= ch.h) continue;
          const j = base + yy * ch.w + xx; if (!valid[j]) continue;
          r += vals[j * 3]; g += vals[j * 3 + 1]; b += vals[j * 3 + 2]; n++;
        }
        const i = base + ty * ch.w + tx;
        if (n) { outv[i * 3] = r / n; outv[i * 3 + 1] = g / n; outv[i * 3 + 2] = b / n; }
      }
      base += ch.w * ch.h;
    }
    return outv;
  }

  // ---- 1. direct
  emitters.forEach(e => { e.col = e.col.map(c => c * e.gain); });
  let direct = blur(await run('direct', {}), 1);
  // normalise: mean direct light on the open main floor = TARGET_FLOOR_E (the fixtures' real output is unknown)
  let sum = 0, nf = 0, base = 0;
  for (const ch of charts) { if (ch.part === 'Floor_Slab' && ch.n[2] > 0.9) for (let i = 0; i < ch.w * ch.h; i++) { sum += direct[(base + i) * 3 + 1]; nf++; } base += ch.w * ch.h; }
  const scale = nf && sum > 0 ? TARGET_FLOOR_E / (sum / nf) : 1;
  for (let i = 0; i < direct.length; i++) direct[i] *= scale;
  console.log(`[bake] direct light done in ${((Date.now() - t0) / 1000).toFixed(1)} s (fixture radiance x${scale.toExponential(2)})`);

  // ---- 2. indirect bounces (each gathers the light of the previous pass)
  const total = Float32Array.from(direct);
  let prev = direct;
  for (let pass = 0; pass < BOUNCES; pass++) {
    const ind = blur(await run('gather', { src: toAtlas(prev), pass }), 2);
    for (let i = 0; i < total.length; i++) total[i] += ind[i];
    prev = ind;
    console.log(`[bake] bounce ${pass + 1} done at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }

  // ---- 3. use marks: floor stains, wall streaks (multiplies the stored light; purely cosmetic)
  if (GRUNGE) {
    const h2 = (ix, iy, s) => { let h = (ix * 73856093) ^ (iy * 19349663) ^ (s * 83492791); h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const vn = (px, py, s) => { const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = h2(ix, iy, s), b = h2(ix + 1, iy, s), c = h2(ix, iy + 1, s), d = h2(ix + 1, iy + 1, s); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
    const fbm = (px, py, s) => 0.5 * vn(px, py, s) + 0.3 * vn(px * 2.1, py * 2.1, s + 1) + 0.2 * vn(px * 4.7, py * 4.7, s + 2);
    base = 0;
    for (const ch of charts) {
      const floor = /^(Floor_Slab|Mezzanine_Slab)$/.test(ch.part) && ch.n[2] > 0.9, wall = /^(Wall_|Mezz_Upper_Wall|Stair_WhiteWall|Restroom_Box_Wall)/.test(ch.part) && Math.abs(ch.n[2]) < 0.1;
      if (floor || wall) for (let i = 0; i < ch.w * ch.h; i++) {
        const j = base + i, px = pos[j * 3], py = pos[j * 3 + 1], pz = pos[j * 3 + 2];
        let m = 1;
        if (floor) {                                                // large worn patches + traffic mottling + a few dark stains
          const big = fbm(px / 5200, py / 5200, 11), mid = fbm(px / 900, py / 900, 23), stain = Math.max(0, fbm(px / 2300 + 7.3, py / 2300 - 2.1, 37) - 0.62) * 2.4;
          m = 1 - 0.22 * big - 0.12 * mid - Math.min(0.3, stain);
        } else {                                                    // rain-streak look: narrow vertical bands, stronger toward the top
          const along = Math.abs(ch.n[0]) > 0.5 ? py : px, streak = Math.max(0, vn(along / 260, 0.5, 51) - 0.55) * 1.6, fade = Math.min(1, Math.max(0, pz / 6000));
          m = 1 - 0.1 * fbm(along / 3000, pz / 2500, 61) - 0.16 * streak * (0.35 + 0.65 * fade);
        }
        total[j * 3] *= m; total[j * 3 + 1] *= m; total[j * 3 + 2] *= m;
      }
      base += ch.w * ch.h;
    }
  }

  // ---- write the atlas: valid texels, then grow outward so bilinear filtering never picks up empty texels
  const img = new Float32Array(SIZE * SIZE * 3), have = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < count; i++) if (valid[i]) { const q = texel[i]; img[q * 3] = total[i * 3]; img[q * 3 + 1] = total[i * 3 + 1]; img[q * 3 + 2] = total[i * 3 + 2]; have[q] = 1; }
  for (let it = 0; it < 6; it++) {
    const add = [];
    for (let yy = 0; yy < Math.min(SIZE, usedRows + 8); yy++) for (let xx = 0; xx < SIZE; xx++) {
      const q = yy * SIZE + xx; if (have[q]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x2 = xx + dx, y2 = yy + dy; if (x2 < 0 || y2 < 0 || x2 >= SIZE || y2 >= SIZE) continue;
        const p2 = y2 * SIZE + x2; if (!have[p2]) continue;
        r += img[p2 * 3]; g += img[p2 * 3 + 1]; b += img[p2 * 3 + 2]; n++;
      }
      if (n) add.push([q, r / n, g / n, b / n]);
    }
    for (const [q, r, g, b] of add) { img[q * 3] = r; img[q * 3 + 1] = g; img[q * 3 + 2] = b; have[q] = 1; }
  }
  let maxE = 0;
  for (let i = 0; i < img.length; i++) if (img[i] > maxE) maxE = img[i];
  maxE = Math.min(maxE, TARGET_FLOOR_E * 6);                         // clip rare hot texels right at a fixture; keeps precision for the rest
  const H = Math.min(SIZE, Math.max(64, 2 ** Math.ceil(Math.log2(usedRows + 8))));   // crop unused rows (power of two for mipmaps)
  const oetf = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const raw = Buffer.alloc((SIZE * 3 + 1) * H);
  for (let yy = 0; yy < H; yy++) {
    const row = yy * (SIZE * 3 + 1); raw[row] = 0;
    for (let xx = 0; xx < SIZE * 3; xx++) raw[row + 1 + xx] = Math.round(255 * oetf(Math.min(1, img[yy * SIZE * 3 + xx] / maxE)));
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'lightmap.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));

  // ---- lightmap UVs per part, in the order OBJLoader emits vertices (polygons fan-triangulated)
  const uvs = [];
  for (const part of parts) {
    if (!part.charts.some(c => c >= 0)) continue;
    const start = uvs.length; let ok = true;
    part.faces.forEach((f, fi) => {
      const c = part.charts[fi];
      if (c < 0) { ok = false; return; }
      const ch = charts[c];
      const uv = f.map(p => { const rel = sub(p, ch.o), a = (dot(rel, ch.u) - ch.minU) / Math.max(ch.spanU, 1e-6), b = (dot(rel, ch.v) - ch.minV) / Math.max(ch.spanV, 1e-6); return [(ch.x + 0.5 + a * (ch.w - 1)) / SIZE, 1 - (ch.y + 0.5 + b * (ch.h - 1)) / H]; });
      for (let i = 1; i + 1 < f.length; i++) uvs.push(...uv[0], ...uv[i], ...uv[i + 1]);
    });
    if (ok) uvIndex[part.name] = [start, (uvs.length - start) / 2]; else uvs.length = start;
  }
  fs.writeFileSync(path.join(outDir, 'lightmap_uv.bin'), Buffer.from(new Float32Array(uvs).buffer));
  const meta = { generatedAt: new Date().toISOString(), source: path.basename(objPath), sourceBytes: fs.statSync(objPath).size, size: [SIZE, H], texelMm: DENS, maxE, encoding: 'sRGB(irradiance / maxE)', bounces: BOUNCES, grunge: GRUNGE, fixtures: emitters.length, floorDirectE: TARGET_FLOOR_E, texels: count, seconds: +((Date.now() - t0) / 1000).toFixed(1), parts: uvIndex };
  fs.writeFileSync(path.join(outDir, 'lightmap.json'), JSON.stringify(meta));
  console.log(`[bake] wrote ${path.relative(root, outDir)}: ${SIZE}x${H} px, ${Object.keys(uvIndex).length} parts, maxE ${maxE.toFixed(2)}, ${meta.seconds} s`);
}
