/*
 * nc_program.js — nested sheet → G-code (draft) → parsed motion the twin replays.
 *
 *   generate(): cutter-radius-compensated paths (holes inside-first, then outlines), multi-pass,
 *               holding tabs on every pass that reaches below the tab top, Fanuc-style post.
 *   parse():    G00/G01/G02/G03 (I/J, absolute mm) → line segments with line numbers.
 *   timing():   cumulative time per segment (feed from F, rapids assumed).
 *   axesAt():   tool position at a program time — what the twin's router follows.
 *
 * The program is a DRAFT for simulation and review. It is written to a file only;
 * nothing here sends code to a machine. Feeds/speeds/tab sizes are ASSUMED placeholders.
 * Browser: window.NcProgram · Node: require('../viewer/lib/nc_program.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NcProgram = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TOOL = { dia: 6, rpm: 18000, feed: 3000, plunge: 600, stepDown: 4 };   // assumed
  const DEFAULT_TABS = { count: 4, width: 8, height: 2 };                              // assumed
  const SAFE_Z = 10, CLEAR_Z = 25, BREAKTHROUGH = 0.3, RAPID_MM_MIN = 15000;          // assumed

  const f3 = v => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);

  // ------------------------------------------------------------------ geometry helpers
  function signedArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
    return a / 2;
  }
  /** Offset a simple polygon outward by d (miter joins, clamped). Returns CW-ordered points. */
  function offsetOutward(poly, d) {
    const ccw = signedArea(poly) > 0 ? poly : poly.slice().reverse();
    const n = ccw.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = ccw[(i - 1 + n) % n], p1 = ccw[i], p2 = ccw[(i + 1) % n];
      const e1 = norm({ x: p1.x - p0.x, y: p1.y - p0.y }), e2 = norm({ x: p2.x - p1.x, y: p2.y - p1.y });
      const n1 = { x: e1.y, y: -e1.x }, n2 = { x: e2.y, y: -e2.x };          // outward normals of a CCW polygon
      const bis = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
      const cos = bis.x * n1.x + bis.y * n1.y;
      const len = d / Math.max(cos, 0.25);                                      // miter, clamped for sharp corners
      out.push({ x: p1.x + bis.x * len, y: p1.y + bis.y * len });
    }
    return out.reverse();                                                       // CW → climb cut (CW spindle)
  }
  function norm(v) { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }

  /** Split a closed loop into sub-segments, marking spans that fall inside tab windows. */
  function loopWithTabs(loop, tabs) {
    const pts = loop.concat([loop[0]]);
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(l); total += l; }
    const windows = [];
    if (tabs && tabs.count > 0 && total > tabs.count * tabs.width * 3) {
      for (let k = 0; k < tabs.count; k++) {
        const c = (k + 0.5) * total / tabs.count;
        windows.push([c - tabs.width / 2, c + tabs.width / 2]);
      }
    }
    const cuts = [];                                                            // breakpoints along the loop
    windows.forEach(w => cuts.push(w[0], w[1]));
    const out = [];                                                             // [{x,y,tab}]
    let s0 = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = lens[i - 1], s1 = s0 + L;
      const inner = cuts.filter(c => c > s0 + 1e-9 && c < s1 - 1e-9).sort((p, q) => p - q);
      for (const c of inner.concat([s1])) {
        const u = (c - s0) / L;
        const mid = (c + (out.length ? out[out.length - 1].s : s0)) / 2;
        out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, s: c, tab: windows.some(w => mid > w[0] && mid < w[1]) });
      }
      s0 = s1;
    }
    return { start: pts[0], segs: out, windows, total };
  }

  // ------------------------------------------------------------------ posts
  const POSTS = {
    fanuc: {
      header: (o) => [
        '%', `O1001 (${o.name})`,
        '(DRAFT - UNVERIFIED - SIMULATE AND REVIEW BEFORE ANY MACHINE USE)',
        `(SHEET ${o.sheetL} X ${o.sheetW} X ${o.thickness} MM  ORIGIN = SHEET LOWER LEFT, Z0 = SHEET TOP)`,
        `(TOOL T1 D${o.tool.dia} FLAT ENDMILL  FEEDS ASSUMED - NOT MACHINE DATA)`,
        'G21 G90 G17 G40 G49 G80', 'G54', 'T1 M06', `S${o.tool.rpm} M03`, `G00 Z${f3(CLEAR_Z)}`
      ],
      footer: () => [`G00 Z${f3(CLEAR_Z)}`, 'M05', 'G00 X0.000 Y0.000', 'M30', '%']
    }
  };

  /**
   * parts: [{ id, outline:[{x,y}], holes:[{x,y,dia}] }] in SHEET coordinates (from Nesting.placeGeometry)
   * opts: { name, sheetL, sheetW, thickness, tool, tabs, post }
   */
  function generate(parts, opts) {
    const o = Object.assign({ name: 'SUGARHILL NEST', sheetL: 2440, sheetW: 1220, thickness: 12, post: 'fanuc' }, opts || {});
    o.tool = Object.assign({}, DEFAULT_TOOL, o.tool || {});
    o.tabs = Object.assign({}, DEFAULT_TABS, o.tabs || {});
    const post = POSTS[o.post];
    if (!post) throw new Error('unknown post ' + o.post);
    const r = o.tool.dia / 2, T = o.thickness, D = T + BREAKTHROUGH;
    const tabTopZ = -(T - o.tabs.height);
    const depths = [];
    for (let z = o.tool.stepDown; z < D - 1e-9; z += o.tool.stepDown) depths.push(z);
    depths.push(D);
    const L = post.header(o), warnings = [], tabInfo = [];
    const feed = `F${o.tool.feed}`, plunge = `F${o.tool.plunge}`;

    // 1) holes, all parts (inside first — parts stay held while their inner features are cut)
    L.push('(--- HOLES: INSIDE FIRST ---)');
    parts.forEach(p => p.holes.forEach(h => {
      const rr = h.dia / 2 - r;
      if (rr < 0.05) { warnings.push(`${p.id}: Ø${h.dia} hole is not larger than the tool (Ø${o.tool.dia}) — skipped`); return; }
      L.push(`(${p.id} HOLE D${h.dia} AT X${f3(h.x)} Y${f3(h.y)})`);
      L.push(`G00 X${f3(h.x + rr)} Y${f3(h.y)}`, `G00 Z${f3(SAFE_Z)}`);
      depths.forEach(z => {
        L.push(`G01 Z${f3(-z)} ${plunge}`);
        L.push(`G03 X${f3(h.x + rr)} Y${f3(h.y)} I${f3(-rr)} J0.000 ${feed}`);
      });
      L.push(`G00 Z${f3(SAFE_Z)}`);
    }));

    // 2) outlines with tool-radius offset and holding tabs
    L.push('(--- OUTLINES: OFFSET + HOLDING TABS ---)');
    parts.forEach(p => {
      const loop = offsetOutward(p.outline, r);
      const tl = loopWithTabs(loop, o.tabs);
      tabInfo.push({ id: p.id, windows: tl.windows, loop, total: tl.total });
      L.push(`(${p.id} OUTLINE  TABS ${tl.windows.length} X ${o.tabs.width} MM, ${o.tabs.height} MM HIGH)`);
      L.push(`G00 X${f3(tl.start.x)} Y${f3(tl.start.y)}`, `G00 Z${f3(SAFE_Z)}`);
      depths.forEach(z => {
        const passZ = -z;
        const needTabs = passZ < tabTopZ - 1e-9 && tl.windows.length > 0;   // every pass below the tab top keeps the tabs
        L.push(`G01 Z${f3(passZ)} ${plunge}`);
        let curZ = passZ, first = true;
        tl.segs.forEach(sg => {
          const wantZ = needTabs && sg.tab ? tabTopZ : passZ;
          if (Math.abs(wantZ - curZ) > 1e-9) { L.push(`G01 Z${f3(wantZ)} ${plunge}`); curZ = wantZ; }
          L.push(`G01 X${f3(sg.x)} Y${f3(sg.y)}${first ? ' ' + feed : ''}`); first = false;
        });
        if (Math.abs(curZ - passZ) > 1e-9) L.push(`G01 Z${f3(passZ)} ${plunge}`);
      });
      L.push(`G00 Z${f3(SAFE_Z)}`);
    });

    post.footer(o).forEach(l => L.push(l));
    const text = L.join('\n') + '\n';
    return { text, warnings, tabs: tabInfo, tabTopZ, depth: D, options: o };
  }

  // ------------------------------------------------------------------ interpreter
  function parse(text) {
    const segs = [];
    let x = 0, y = 0, z = CLEAR_Z, mode = 0, F = 1000, spindle = 0;
    let liftZ = null;   // Z the tool was lifted to for a holding tab (G01 Z-up below the surface)
    text.split(/\r?\n/).forEach((raw, idx) => {
      const line = raw.replace(/\([^)]*\)/g, '').trim().toUpperCase();
      if (!line || line === '%' || line[0] === 'O') return;
      const w = {}; let gList = [];
      line.replace(/([A-Z])(-?\d*\.?\d+)/g, (_, k, v) => { if (k === 'G') gList.push(parseFloat(v)); else w[k] = parseFloat(v); return ''; });
      gList.forEach(g => { if (g === 0 || g === 1 || g === 2 || g === 3) mode = g; });
      if (w.F !== undefined) F = w.F;
      if (line.includes('M03')) spindle = w.S !== undefined ? w.S : spindle || 1;
      if (/M0?5\b/.test(line)) spindle = 0;
      if (w.X === undefined && w.Y === undefined && w.Z === undefined) return;
      const nx = w.X ?? x, ny = w.Y ?? y, nz = w.Z ?? z;
      // Holding-tab tracking: a G01 Z-only lift below the surface marks the tab height;
      // XY moves at that height are tab spans (the tool must not cut deeper there).
      // A plunge (Z down) or any rapid clears it.
      const zOnly = nx === x && ny === y && nz !== z;
      if (zOnly) {
        if (mode === 0) liftZ = null;
        else if (nz > z) liftZ = nz < 0 ? nz : null;
        else liftZ = null;
      }
      const isTab = !zOnly && mode !== 0 && liftZ !== null && z < 0 && nz < 0 &&
        Math.abs(z - liftZ) < 1e-6 && Math.abs(nz - liftZ) < 1e-6 && (nx !== x || ny !== y);
      if (mode === 2 || mode === 3) {
        const cx = x + (w.I || 0), cy = y + (w.J || 0), R = Math.hypot(x - cx, y - cy);
        let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
        if (mode === 3) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; }
        const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 36)));
        let px = x, py = y, pz = z;
        for (let k = 1; k <= n; k++) {
          const a = a0 + (a1 - a0) * k / n, qz = z + (nz - z) * k / n;
          const qx = cx + R * Math.cos(a), qy = cy + R * Math.sin(a);
          segs.push({ x0: px, y0: py, z0: pz, x1: qx, y1: qy, z1: qz, rapid: false, feed: F, line: idx + 1, spindle, tab: isTab });
          px = qx; py = qy; pz = qz;
        }
      } else {
        segs.push({ x0: x, y0: y, z0: z, x1: nx, y1: ny, z1: nz, rapid: mode === 0, feed: F, line: idx + 1, spindle, tab: isTab });
      }
      x = nx; y = ny; z = nz;
    });
    return segs;
  }

  /** Cumulative time (s) of parsed segments. */
  function timing(segs) {
    const cum = new Float64Array(segs.length + 1);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0);
      const v = (s.rapid ? RAPID_MM_MIN : Math.max(1, s.feed)) / 60;
      cum[i + 1] = cum[i] + len / v;
    }
    return { cum, totalS: cum[segs.length] };
  }

  /** Load a program text for replay. */
  function load(text) {
    const segs = parse(text);
    const { cum, totalS } = timing(segs);
    const cutLen = segs.reduce((a, s) => a + (!s.rapid && Math.min(s.z0, s.z1) < 0 ? Math.hypot(s.x1 - s.x0, s.y1 - s.y0) : 0), 0);
    return { text, segs, cum, totalS, cutLenMm: cutLen, lines: text.split('\n').length };
  }

  /** Tool position at program time t (s). Returns axis signals + current line / segment index. */
  function axesAt(prog, t) {
    const { segs, cum } = prog;
    if (!segs.length) return { axis_x_mm: 0, axis_y_mm: 0, axis_z_mm: CLEAR_Z, spindle_rpm: 0, line: 0, seg: -1 };
    const tt = Math.max(0, Math.min(prog.totalS, t));
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid + 1] < tt) lo = mid + 1; else hi = mid; }
    const s = segs[lo], span = cum[lo + 1] - cum[lo], u = span > 0 ? (tt - cum[lo]) / span : 1;
    const r2 = v => Math.round(v * 100) / 100;
    return {
      axis_x_mm: r2(s.x0 + (s.x1 - s.x0) * u), axis_y_mm: r2(s.y0 + (s.y1 - s.y0) * u), axis_z_mm: r2(s.z0 + (s.z1 - s.z0) * u),
      spindle_rpm: s.spindle, feed_mm_min: s.rapid ? RAPID_MM_MIN : s.feed, rapid: s.rapid, line: s.line, seg: lo
    };
  }

  // ------------------------------------------------------------------ verification
  /** Distance from a point to a segment. */
  function distPtSeg(px, py, s) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const len2 = dx * dx + dy * dy;
    let u = 0;
    if (len2 > 0) u = Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / len2));
    return Math.hypot(px - (s.x0 + dx * u), py - (s.y0 + dy * u));
  }
  function orient(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  function onSeg(a, b, c) { return Math.min(a.x, c.x) - 1e-9 <= b.x && b.x <= Math.max(a.x, c.x) + 1e-9 && Math.min(a.y, c.y) - 1e-9 <= b.y && b.y <= Math.max(a.y, c.y) + 1e-9; }
  function segsIntersect(p1, p2, p3, p4) {
    const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if (Math.abs(d1) < 1e-9 && onSeg(p3, p1, p4)) return true;
    if (Math.abs(d2) < 1e-9 && onSeg(p3, p2, p4)) return true;
    if (Math.abs(d3) < 1e-9 && onSeg(p1, p3, p2)) return true;
    if (Math.abs(d4) < 1e-9 && onSeg(p1, p4, p2)) return true;
    return false;
  }
  /** Min distance between two segments (0 when they touch). */
  function segSegDist(a, b) {
    if (segsIntersect({ x: a.x0, y: a.y0 }, { x: a.x1, y: a.y1 }, { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 })) return 0;
    return Math.min(distPtSeg(a.x0, a.y0, b), distPtSeg(a.x1, a.y1, b), distPtSeg(b.x0, b.y0, a), distPtSeg(b.x1, b.y1, a));
  }
  /** Min distance from a segment to an axis-aligned rect {x0,y0,x1,y1} (0 on overlap). */
  function segRectDist(s, r) {
    const inRect = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    if (inRect(s.x0, s.y0) || inRect(s.x1, s.y1)) return 0;
    const edges = [
      { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 }, { x0: r.x1, y0: r.y0, x1: r.x1, y1: r.y1 },
      { x0: r.x1, y0: r.y1, x1: r.x0, y1: r.y1 }, { x0: r.x0, y0: r.y1, x1: r.x0, y1: r.y0 }
    ];
    let d = Infinity;
    for (const e of edges) d = Math.min(d, segSegDist(s, e));
    return d;
  }
  function fmtDur(s) {
    s = Math.round(s);
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  }

  /**
   * Verify a loaded program against a sheet before sending it to the router.
   * prog: NcProgram.load() result.
   * sheet: { L, W, toolDia, tabTopZ, tabs, warnings, clampZones }.
   *   tabs: generate() tabInfo [{windows}] — tab count is summed.
   *   warnings: generate() warnings (shown, never blocking).
   *   clampZones: [{x0,y0,x1,y1}] in sheet coords (omitted → clamp check skipped).
   * Returns { ok, checks: [{id, label, level: 'ok'|'warn'|'error', detail}], warnings }.
   * ok is false only on a hard error (the tool edge would leave the sheet).
   * Clamp proximity and generator warnings only warn — they never block.
   */
  function verifyProgram(prog, sheet) {
    const s = Object.assign({ L: 2440, W: 1220, toolDia: 6, tabTopZ: null, tabs: [], warnings: [], clampZones: [] }, sheet || {});
    const r = s.toolDia / 2;
    const checks = [];
    const warnings = (s.warnings || []).slice();
    const cut = prog.segs.filter(sg => !sg.rapid && Math.min(sg.z0, sg.z1) < 0 && (sg.x0 !== sg.x1 || sg.y0 !== sg.y1));
    checks.push({ id: 'lines', label: '프로그램', level: 'ok', detail: `${prog.lines}줄 · 절삭 ${(prog.cutLenMm / 1000).toFixed(1)} m · 예상 ${fmtDur(prog.totalS)}` });
    const tabCount = (s.tabs || []).reduce((a, t) => a + (t.windows ? t.windows.length : 0), 0);
    checks.push({ id: 'tabs', label: '고정 탭', level: 'ok', detail: `${tabCount}개 · 탭 상단 Z ${s.tabTopZ !== null && s.tabTopZ !== undefined ? s.tabTopZ.toFixed(1) : '–'} mm` });
    // bounds: the tool edge must stay on the sheet
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sg of cut) { minX = Math.min(minX, sg.x0, sg.x1); maxX = Math.max(maxX, sg.x0, sg.x1); minY = Math.min(minY, sg.y0, sg.y1); maxY = Math.max(maxY, sg.y0, sg.y1); }
    if (!cut.length) {
      checks.push({ id: 'bounds', label: '공구 경로 범위', level: 'error', detail: '절삭 구간이 없습니다' });
    } else if (minX - r < 0 || maxX + r > s.L || minY - r < 0 || maxY + r > s.W) {
      checks.push({ id: 'bounds', label: '공구 경로 범위', level: 'error', detail: `공구 가장자리가 원판을 벗어남 (X ${(minX - r).toFixed(1)}–${(maxX + r).toFixed(1)} / Y ${(minY - r).toFixed(1)}–${(maxY + r).toFixed(1)}, 원판 ${s.L}×${s.W})` });
    } else {
      checks.push({ id: 'bounds', label: '공구 경로 범위', level: 'ok', detail: `공구 경로 X ${minX.toFixed(1)}–${maxX.toFixed(1)}, Y ${minY.toFixed(1)}–${maxY.toFixed(1)} — 원판 안에 있음` });
    }
    // clamps: warn if the tool centre path comes within one tool radius of a clamp
    if (s.clampZones && s.clampZones.length) {
      let worst = Infinity, worstZone = -1;
      for (const sg of cut) {
        for (let zi = 0; zi < s.clampZones.length; zi++) {
          const z = s.clampZones[zi];
          if (Math.max(sg.x0, sg.x1) + r < z.x0 || Math.min(sg.x0, sg.x1) - r > z.x1 ||
              Math.max(sg.y0, sg.y1) + r < z.y0 || Math.min(sg.y0, sg.y1) - r > z.y1) continue;  // AABB reject
          const d = segRectDist(sg, z);
          if (d < worst) { worst = d; worstZone = zi; }
        }
      }
      if (worst < r) checks.push({ id: 'clamps', label: '클램프 간섭', level: 'warn', detail: `공구 경로가 클램프 ${worstZone + 1}번 영역에 ${worst.toFixed(1)} mm까지 접근 (공구 반경 ${r} mm 이내)` });
      else checks.push({ id: 'clamps', label: '클램프 간섭', level: 'ok', detail: worst === Infinity ? '공구 경로와 클램프가 멀리 떨어져 있음' : `가장 가까운 클램프까지 ${worst.toFixed(1)} mm` });
    } else {
      checks.push({ id: 'clamps', label: '클램프 간섭', level: 'ok', detail: '클램프 영역 정보 없음 — 검사 생략' });
    }
    for (const w of warnings) checks.push({ id: 'gen', label: '생성 경고', level: 'warn', detail: w });
    const ok = !checks.some(c => c.level === 'error');
    return { ok, checks, warnings };
  }

  return { DEFAULT_TOOL, DEFAULT_TABS, POSTS, offsetOutward, generate, parse, timing, load, axesAt, verifyProgram };
});
