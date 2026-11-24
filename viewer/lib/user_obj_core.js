/*
 * user_obj_core.js — pure helpers for importing a user's own OBJ file into the /v2 twin.
 *
 *   The twin scene is millimetres, Z-up. An OBJ from elsewhere can be in mm / cm / m / inch and
 *   Y-up (Blender's default export) or Z-up (SolidCraft, this repo's generators). These helpers
 *   read the file once, suggest a unit and up axis, and compute the transform that puts the model
 *   in the scene at real size with its footprint centred on the origin and its base at Z = 0.
 *
 *   No three.js here: the browser module (viewer/user_assets.js) applies the transform, and the
 *   Node tests (tests/user_obj_core.test.js) check the numbers.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UserObjCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UNIT_TO_MM = { mm: 1, cm: 10, m: 1000, in: 25.4 };
  const UNIT_LABEL = { mm: '밀리미터 (mm)', cm: '센티미터 (cm)', m: '미터 (m)', in: '인치 (in)' };
  const MAX_OBJ_BYTES = 60 * 1024 * 1024;   // larger files make the browser tab unresponsive

  /** One pass over the OBJ text: vertex/face counts, raw bounding box, mtllib names, header hints. */
  function parseObjStats(text) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let vertices = 0, faces = 0;
    const mtllibs = [], materials = new Set();
    let header = '';
    let i = 0;
    const n = text.length;
    while (i < n) {
      let j = text.indexOf('\n', i);
      if (j < 0) j = n;
      const line = text.slice(i, j).trim();
      i = j + 1;
      if (!line) continue;
      const c0 = line.charCodeAt(0);
      if (c0 === 118 /* v */ && (line.charCodeAt(1) === 32 || line.charCodeAt(1) === 9)) {
        const p = line.split(/\s+/);
        const x = +p[1], y = +p[2], z = +p[3];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        vertices++;
        if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
        if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
        if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
      } else if (c0 === 102 /* f */ && (line.charCodeAt(1) === 32 || line.charCodeAt(1) === 9)) {
        faces++;
      } else if (c0 === 35 /* # */) {
        if (header.length < 400) header += line + '\n';
      } else if (line.startsWith('mtllib ')) {
        mtllibs.push(line.slice(7).trim());
      } else if (line.startsWith('usemtl ')) {
        materials.add(line.slice(7).trim());
      }
    }
    const ok = vertices >= 3 && faces >= 1;
    return {
      ok,
      error: ok ? null : (vertices < 3 ? '정점(v)이 3개 미만 — OBJ 형상이 아닙니다' : '면(f)이 없습니다 — 점 구름이나 선만 있는 OBJ는 넣을 수 없습니다'),
      vertices, faces,
      bbox: ok ? { min, max } : null,
      extent: ok ? [max[0] - min[0], max[1] - min[1], max[2] - min[2]] : [0, 0, 0],
      mtllibs, materials: [...materials],
      header
    };
  }

  /**
   * Suggest a unit from the largest extent. Equipment in this twin is roughly 0.05–20 m, so a
   * largest side of 30 or less is almost surely metres (a 30 mm part would be the exception,
   * which is why the import dialog always shows the resulting size and lets the user change it).
   * A header that names its unit wins over the guess.
   */
  function guessUnit(stats) {
    const h = (stats.header || '').toLowerCase();
    if (/\bmillimet(re|er)s?\b|\(mm\)|\bunits?:?\s*mm\b/.test(h)) return { unit: 'mm', reason: '파일 머리말에 mm 표기' };
    if (/\bcentimet(re|er)s?\b|\bunits?:?\s*cm\b/.test(h)) return { unit: 'cm', reason: '파일 머리말에 cm 표기' };
    if (/\binch(es)?\b|\bunits?:?\s*in\b/.test(h)) return { unit: 'in', reason: '파일 머리말에 inch 표기' };
    if (/\bmet(re|er)s\b|\bunits?:?\s*m\b/.test(h)) return { unit: 'm', reason: '파일 머리말에 m 표기' };
    const big = Math.max(...stats.extent);
    if (big <= 30) return { unit: 'm', reason: `가장 긴 변이 ${round(big, 3)} — 미터로 추정` };
    return { unit: 'mm', reason: `가장 긴 변이 ${round(big, 1)} — 밀리미터로 추정` };
  }

  /** Blender exports Y-up by default; this repo's own OBJ files say "Z-up" or come from SolidCraft. */
  function guessUp(stats) {
    const h = (stats.header || '').toLowerCase();
    if (/z-up|z up|solidcraft/.test(h)) return { up: 'Z', reason: '파일 머리말에 Z-up 표기' };
    if (/y-up|y up|blender/.test(h)) return { up: 'Y', reason: 'Blender 파일 (기본 Y-up)' };
    return { up: 'Z', reason: '표기 없음 — 이 트윈 기준(Z-up)으로 가정' };
  }

  /**
   * Transform from raw OBJ coordinates to the twin: p_scene = R · (p_raw · scale) + offset.
   *   up 'Z': R = identity.
   *   up 'Y': R = +90° about X, i.e. (x, y, z) → (x, −z, y).
   * offset centres the footprint on X/Y = 0 and puts the lowest point at Z = 0.
   * dims are the resulting size in mm [W (X), D (Y), H (Z)].
   */
  function computePlacement(bbox, unit, up) {
    const s = UNIT_TO_MM[unit];
    if (!s) throw new Error('unknown unit: ' + unit);
    const { min, max } = bbox;
    let lo, hi;
    if (up === 'Y') {
      lo = [min[0] * s, -max[2] * s, min[1] * s];
      hi = [max[0] * s, -min[2] * s, max[1] * s];
    } else {
      lo = [min[0] * s, min[1] * s, min[2] * s];
      hi = [max[0] * s, max[1] * s, max[2] * s];
    }
    const offset = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]];
    const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map(v => round(v, 1));
    return { scale: s, rotateXDeg: up === 'Y' ? 90 : 0, offset: offset.map(v => round(v, 3)), dims };
  }

  /** Apply the placement to one raw point (used by the tests and as the reference for the viewer). */
  function transformPoint(p, placement) {
    const s = placement.scale;
    let x = p[0] * s, y = p[1] * s, z = p[2] * s;
    if (placement.rotateXDeg === 90) { const t = y; y = -z; z = t; }
    return [x + placement.offset[0], y + placement.offset[1], z + placement.offset[2]];
  }

  /** Diffuse colour (Kd) and opacity (d / Tr) per material. Textures are not carried over. */
  function parseMtl(text) {
    const out = {};
    let cur = null;
    String(text || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line || line[0] === '#') return;
      const p = line.split(/\s+/);
      const k = p[0];
      if (k === 'newmtl') { cur = p.slice(1).join(' '); out[cur] = { kd: [0.7, 0.7, 0.7], opacity: 1 }; }
      else if (!cur) return;
      else if (k === 'Kd' && p.length >= 4) out[cur].kd = [+p[1], +p[2], +p[3]].map(v => clamp01(v));
      else if (k === 'd' && p.length >= 2) out[cur].opacity = clamp01(+p[1]);
      else if (k === 'Tr' && p.length >= 2) out[cur].opacity = clamp01(1 - +p[1]);
    });
    return out;
  }

  /** Stable, readable asset id: user_obj_<slug>_<time36>. */
  function makeAssetId(fileName, nowMs) {
    const base = String(fileName || 'model').replace(/\.obj$/i, '');
    const slug = base.normalize('NFKD').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 32) || 'model';
    return `user_obj_${slug}_${Math.floor(nowMs).toString(36)}`;
  }

  /** Pair dropped files: each .obj with the .mtl of the same base name; a single .obj also takes a lone .mtl. */
  function pairFiles(names) {
    const objs = names.filter(f => /\.obj$/i.test(f));
    const mtls = names.filter(f => /\.mtl$/i.test(f));
    const stem = f => f.replace(/\.[^.]+$/, '').toLowerCase();
    return objs.map(o => {
      const same = mtls.find(m => stem(m) === stem(o));
      return { obj: o, mtl: same || (objs.length === 1 && mtls.length === 1 ? mtls[0] : null) };
    });
  }

  function isUserAssetId(id) { return typeof id === 'string' && id.startsWith('user_obj_'); }

  function clamp01(v) { return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1; }
  function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

  return {
    UNIT_TO_MM, UNIT_LABEL, MAX_OBJ_BYTES,
    parseObjStats, guessUnit, guessUp, computePlacement, transformPoint, parseMtl,
    makeAssetId, pairFiles, isUserAssetId
  };
});
