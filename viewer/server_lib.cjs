// Pure helpers for viewer/server.mjs — kept separate so they can be unit-tested (tests/server_security.test.js).
'use strict';
const path = require('path');

/**
 * Resolve a URL-encoded relative path under `root`. Returns the absolute path, or null when the
 * input is malformed (bad %-escape, NUL), absolute, empty, or would leave `root` after resolution.
 * This replaces the old `.replace(/\.\./g, '')` filter: containment is checked on the resolved path.
 */
function safeResolve(root, encodedRel) {
  let rel;
  try { rel = decodeURIComponent(String(encodedRel)); } catch { return null; }
  if (!rel || rel.includes('\0')) return null;
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) return null;
  // Dot-only segments ("..", "....") and trailing dot/space segments: Windows path normalisation
  // strips trailing dots, so "...." can collapse unexpectedly. No legitimate asset needs them.
  if (rel.split(/[\\/]/).some(seg => /^\.+$/.test(seg) || /[. ]$/.test(seg))) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

function isLoopback(host) {
  const h = String(host || '').trim().toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
  const v4 = h.startsWith('::ffff:') ? h.slice(7) : h;
  return /^127(\.\d{1,3}){3}$/.test(v4);
}

class BodyTooLarge extends Error {}

/** Read a request body as UTF-8 with a hard size limit. Rejects with BodyTooLarge (→ 413). */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, done = false;
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) { done = true; req.resume(); return reject(new BodyTooLarge()); }
    req.on('data', c => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; req.resume(); return reject(new BodyTooLarge()); }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

const LAYOUT_MAX_ITEMS = 5000;
function validateLayout(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'layout must be a JSON object';
  if (!Array.isArray(obj.items)) return 'items: array required';
  if (obj.items.length > LAYOUT_MAX_ITEMS) return `items: at most ${LAYOUT_MAX_ITEMS}`;
  if (!obj.items.every(it => it && typeof it === 'object' && !Array.isArray(it))) return 'items: objects only';
  return null;
}

const GCODE_MAX = 4e6;
function validateGcode(g) {
  if (typeof g !== 'string' || !g.trim()) return 'gcode: non-empty string required';
  if (g.length > GCODE_MAX) return 'gcode: too large';
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(g)) return 'gcode: control characters not allowed';
  return null;
}

/** Constant-time-ish token compare (length leak only). */
function tokenOk(expected, given) {
  if (!expected) return true;
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

module.exports = { safeResolve, isLoopback, readBody, BodyTooLarge, validateLayout, LAYOUT_MAX_ITEMS, validateGcode, GCODE_MAX, tokenOk };
