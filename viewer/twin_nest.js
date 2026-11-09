/*
 * twin_nest.js — parts library → automatic nesting → G-code → router, inside the /v2 twin.
 *
 *   Parts library (/api/parts, localStorage fallback 'sugarhillTwinParts' on Pages):
 *     modeled sketch panels (saved from the modeling window, or automatically when a
 *     part is placed in the factory) and DXF imports. Survives reloads.
 *   Nesting window: pick thickness → tick parts / set quantities → nesting + G-code are
 *     recomputed automatically → verify panel → preview / download .nc (file only) / send
 *     to the router.
 *   Router: sheet lowered → clamps + vacuum → the tool replays the parsed G-code and
 *     carves a real heightmap sheet (removed mass = carved volume x material density)
 *     → clamps open → cut parts come out in front of the machine, the offcut skeleton
 *     stays as the visible carved sheet.
 *
 * Depends on: Nesting, NcProgram, DxfImport, SketchCore, TwinRuntime (lib), SheetCarve (lib),
 * editor_v2 globals (THREE, scene, placedObjects, ASSET_CATALOG, INDUSTRIAL_MATERIALS,
 * log, cadSketch* state) and twin_live.js hooks.
 * Feeds, speeds and tab sizes are assumed placeholders. G-code is a draft — never sent to a machine.
 */
(function () {
  'use strict';
  if (typeof Nesting === 'undefined' || typeof NcProgram === 'undefined' || typeof THREE === 'undefined' || typeof SheetCarve === 'undefined') return;

  let seq = 1, last = null, library = [];
  const sel = new Map();               // part id -> quantity (ticked parts)
  const jobVis = new Map();            // job id -> visuals on the router
  const geoCache = new Map();          // part id -> centred BufferGeometry
  const partMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.55, metalness: 0.05 });

  const routers = () => placedObjects.filter(o => TwinRuntime.MACHINE_KINDS[o.userData.assetId] === 'router' && o.userData.rig);
  const $ = id => document.getElementById(id);
  const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; };
  const fmtS = s => { s = Math.round(s); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------------ library: localStorage fallback (Pages has no server)
  const LS_KEY = 'sugarhillTwinParts';
  let memParts = [];                       // in-memory fallback when even localStorage is unavailable
  let libSource = 'server';                // 'server' | 'local' — where the library currently comes from
  function lsRead() {
    try { const a = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return memParts; }
  }
  function lsWrite(parts) {
    memParts = parts;
    try { localStorage.setItem(LS_KEY, JSON.stringify(parts)); } catch (e) { /* private mode — memory only */ }
  }
  /** Geometry key, mirroring the server's geomKey exactly (round to 3 decimals). */
  function geomKeyLocal(vertices, holes, thickness) {
    const r = n => Math.round(n * 1000) / 1000;
    return JSON.stringify([thickness, vertices.map(p => [r(p.x), r(p.y)]), (holes || []).map(h => [r(h.x), r(h.y), r(h.dia)])]);
  }
  function lsSavePart(p) {
    const parts = lsRead();
    const name = (p.name || '').trim();
    if (!name || name.length > 80) throw new Error('부품 이름은 1~80자');
    if (!Array.isArray(p.vertices) || p.vertices.length < 3 || p.vertices.length > 5000) throw new Error('vertices 3~5000개');
    if (!(p.thickness > 0) || p.thickness > 200) throw new Error('두께는 0 초과 200 이하');
    const part = {
      id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name, thickness: p.thickness,
      vertices: p.vertices.map(v => ({ x: +v.x, y: +v.y })),
      holes: (p.holes || []).map(h => ({ x: +h.x, y: +h.y, dia: +h.dia, isSubtract: true })),
      source: p.source === 'dxf' ? 'dxf' : 'sketch', createdAt: new Date().toISOString()
    };
    const key = geomKeyLocal(part.vertices, part.holes, part.thickness);
    const existing = parts.find(q => geomKeyLocal(q.vertices, q.holes, q.thickness) === key);
    if (existing) return { part: existing, existing: true };
    parts.push(part); lsWrite(parts);
    return { part, existing: false };
  }
  function lsDeletePart(id) { lsWrite(lsRead().filter(p => p.id !== id)); }
  function renderLibSrc() { const el = $('tn-lib-src'); if (el) el.textContent = libSource === 'server' ? '서버' : '로컬 저장 (Pages)'; }

  // ------------------------------------------------------------------ sheet material + router cutting table
  // Real properties come from INDUSTRIAL_MATERIALS (editor_v2.js); only PP and PP-GF30
  // are sheet stock for the router (FKM is rubber/lathe-turned, SUS is metal/SLM).
  const SHEET_MATERIAL_IDS = ['PP_Natural_SealGrade', 'PP_GF30_Structural_Grey'];
  const SHEET_MATERIAL_FALLBACK = {
    PP_Natural_SealGrade: { name: 'PP 내추럴 (씰 등급)', densityKgM3: 905, hardness: '72 Shore D (E=1.45 GPa)' },
    PP_GF30_Structural_Grey: { name: 'PP-GF30 (유리섬유 강화)', densityKgM3: 1140, hardness: '78 Shore D (E=6.20 GPa)' }
  };
  function sheetMaterial(id) {
    const src = (typeof INDUSTRIAL_MATERIALS !== 'undefined') ? INDUSTRIAL_MATERIALS : {};
    const m = src[id], fb = SHEET_MATERIAL_FALLBACK[id] || {};
    return { id, name: (m && m.name) || fb.name || id, densityKgM3: (m && m.densityKgM3) || fb.densityKgM3 || 0, hardness: (m && m.hardness) || fb.hardness || '' };
  }
  // Router cutting parameters per material. The repo has NO router/milling data — the
  // spec file (materials_pp_fkm_stainless_spec.json) only has SEAL-JET LATHE (turning)
  // parameters (PP vc 320 m/min, feed 0.15 mm/rev), which do NOT apply to routing.
  // These are assumed placeholders (// assumed), not measured values.
  const ROUTER_CUTTING = {
    PP_Natural_SealGrade: { dia: 6, rpm: 18000, feed: 3000, plunge: 600, stepDown: 4 },   // assumed
    PP_GF30_Structural_Grey: { dia: 6, rpm: 16000, feed: 2000, plunge: 400, stepDown: 3 } // assumed — glass fibre is abrasive
  };
  /** Read the nest window's material + tool settings (defaults when the window is not built yet). */
  function currentToolSettings() {
    const matId = ($('tn-mat') && $('tn-mat').value) || 'PP_Natural_SealGrade';
    const mat = sheetMaterial(matId);
    const cut = ROUTER_CUTTING[matId] || ROUTER_CUTTING.PP_Natural_SealGrade;
    const tool = {
      dia: $('tn-d') ? num('tn-d', cut.dia) : cut.dia,
      stepDown: $('tn-sd') ? num('tn-sd', cut.stepDown) : cut.stepDown,
      feed: $('tn-f') ? num('tn-f', cut.feed) : cut.feed,
      plunge: cut.plunge, rpm: $('tn-rpm') ? num('tn-rpm', cut.rpm) : cut.rpm
    };
    const tabs = {
      count: $('tn-tc') ? num('tn-tc', 4) : 4,
      width: $('tn-tw') ? num('tn-tw', 8) : 8,
      height: $('tn-th') ? num('tn-th', 2) : 2
    };
    return { material: { id: mat.id, name: mat.name, densityKgM3: mat.densityKgM3, hardness: mat.hardness, assumedCutting: true }, tool, tabs };
  }
  /** Show the selected material's REAL properties (density, hardness) + the assumed-cutting note. */
  function updateMatInfo() {
    const el = $('tn-mat-info'); if (!el) return;
    const mat = sheetMaterial($('tn-mat').value);
    el.textContent = `${mat.name} · 밀도 ${mat.densityKgM3} kg/m³ · 경도 ${mat.hardness} · 절삭조건은 가정값 (선반 데이터 아님)`;
  }
  /** Apply the selected material's router cutting table to the tool inputs (marked 가정값 in the UI). */
  function applyMaterialToInputs() {
    const matId = $('tn-mat').value;
    const cut = ROUTER_CUTTING[matId] || ROUTER_CUTTING.PP_Natural_SealGrade;
    $('tn-d').value = cut.dia; $('tn-sd').value = cut.stepDown; $('tn-f').value = cut.feed; $('tn-rpm').value = cut.rpm;
    updateMatInfo();
  }

  // ------------------------------------------------------------------ clamp zones (must match buildVis: 120x90 clamps at x=±0.35L, closed y=±(W/2+10))
  function clampZones(L, W) {
    const zones = [];
    [0.15, 0.85].forEach(fx => {
      [-1, 1].forEach(side => {
        const cx = fx * L, cy = side < 0 ? 35 : W - 35;
        zones.push({ x0: cx - 60, x1: cx + 60, y0: cy - 45, y1: cy + 45 });
      });
    });
    return zones;
  }

  /** Build a single-part nest + real NC program for one modeled part (used by twin_live 배정). */
  function nestSinglePart(partObj, settings) {
    const s = settings || currentToolSettings();
    const rec = { id: partObj.id || partObj.libraryId || ('sketch-' + (partObj.name || 'part')), name: partObj.name, vertices: partObj.vertices, holes: partObj.holes, thickness: partObj.thickness };
    const c = Nesting.centrePart(rec.vertices, rec.holes);
    const margin = 15, toolR = s.tool.dia / 2;
    const sheetL = Math.max(300, Math.ceil(c.w + 2 * margin + 2 * toolR));
    const sheetW = Math.max(300, Math.ceil(c.h + 2 * margin + 2 * toolR));
    const pl = { id: rec.name || 'part', cx: sheetL / 2, cy: sheetW / 2, rot: 0 };
    const g = Nesting.placeGeometry(c, pl);
    const gen = NcProgram.generate([{ id: pl.id, outline: g.outline, holes: g.holes }], {
      name: `SUGARHILL SINGLE ${rec.name || 'PART'}`, sheetL, sheetW, thickness: rec.thickness, tool: s.tool, tabs: s.tabs
    });
    const prog = NcProgram.load(gen.text);
    const nest = {
      name: gen.name, thickness: rec.thickness, material: s.material,
      opts: { sheetL, sheetW, tool: s.tool }, items: [{ id: pl.id, rec, centred: c }],
      res: { placements: [pl], unplaced: [], utilization: (c.w * c.h) / (sheetL * sheetW) },
      gen, prog, sheetJob: true
    };
    return { nest, gen, prog };
  }

  /** Removed material for a router job: carved volume from the heightmap x material density. */
  function removedMass(jobId) {
    const v = jobVis.get(jobId);
    if (!v || !v.hm) return null;
    const volMm3 = SheetCarve.removedVolume(v.hm);
    const density = (v.job.nest && v.job.nest.material && v.job.nest.material.densityKgM3) || 905;
    const mat = (v.job.nest && v.job.nest.material && v.job.nest.material.name) || 'PP';
    return { massG: volMm3 * 1e-9 * density * 1000, volCm3: volMm3 / 1000, material: mat };
  }

  /** Render the G-code verification panel (null = clear). */
  function renderVerify(v) {
    const el = $('tn-verify'); if (!el) return;
    if (!v) { el.innerHTML = ''; return; }
    el.innerHTML = v.checks.map(c =>
      `<div class="v-${c.level}"><b>${esc(c.label)}</b> ${esc(c.detail)}</div>`).join('') +
      (v.ok ? '' : `<div class="v-err"><b>전송 차단</b> 공구 경로가 원판을 벗어납니다. 원판을 키우거나 부품을 줄이세요.</div>`);
  }

  // ------------------------------------------------------------------ library
  async function loadLibrary() {
    try {
      const r = await fetch('/api/parts');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      library = (await r.json()).parts || [];
      libSource = 'server';
    } catch (e) { library = lsRead(); libSource = 'local'; }
    renderLibSrc();
    return library;
  }
  async function savePart(p) {
    try {
      const r = await fetch('/api/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      const j = await r.json().catch(() => null);
      if (r.ok) { libSource = 'server'; renderLibSrc(); return j; }
      if (r.status >= 400 && r.status < 500 && j && j.error) { const err = new Error(j.error); err.final = true; throw err; }  // validation rejection is final
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      if (e.final) throw e;
      return lsSavePart(p);                          // server unreachable / 5xx / bad JSON → local
    }
  }
  async function deletePart(id) {
    try {
      const r = await fetch('/api/parts?id=' + encodeURIComponent(id), { method: 'DELETE' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } catch (e) { lsDeletePart(id); }
    sel.delete(id);
    await loadLibrary(); renderLibrary(); schedule();
  }
  function sizeOf(p) { const c = Nesting.centrePart(p.vertices, p.holes); return `${Math.round(c.w)}×${Math.round(c.h)}`; }

  /** Save the current sketch of the modeling window. */
  async function saveCurrentSketch(name, quiet) {
    const t = SketchCore.validateThickness(cadSketchExtrudeThickness);
    if (!t.ok) throw new Error(t.error);
    const holes = cadSketchHoles.filter(h => h.isSubtract);
    for (let i = 0; i < holes.length; i++) {
      const v = SketchCore.validateHole(cadSketchVertices, holes[i], holes.slice(0, i));
      if (!v.ok) throw new Error(`구멍 #${i + 1}: ${v.error}`);
    }
    const xs = cadSketchVertices.map(p => p.x), ys = cadSketchVertices.map(p => p.y);
    const auto = `판재 ${Math.round(Math.max(...xs) - Math.min(...xs))}×${Math.round(Math.max(...ys) - Math.min(...ys))}×${t.value}`;
    const r = await savePart({ name: (name || '').trim() || auto, thickness: t.value, vertices: cadSketchVertices.map(p => ({ x: +p.x, y: +p.y })), holes: holes.map(h => ({ x: +h.x, y: +h.y, dia: +h.dia })), source: 'sketch' });
    if (!quiet) log(`📚 [라이브러리] '${r.part.name}' ${r.existing ? '(이미 저장된 형상)' : '저장됨'}`);
    await loadLibrary();
    return r;
  }

  // ------------------------------------------------------------------ generate (automatic)
  let timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(generate, 250); }

  function generate() {
    const thk = parseFloat($('tn-thk').value);
    const picked = [];
    library.filter(p => p.thickness === thk).forEach(p => { const q = sel.get(p.id) || 0; for (let k = 0; k < q; k++) picked.push(p); });
    if (!picked.length) { last = null; drawPreview(); $('tn-code').value = ''; renderVerify(null); $('tn-send').disabled = $('tn-dl').disabled = true; return msg('부품을 체크하면 자동으로 네스팅됩니다.'); }
    const ts = currentToolSettings();
    const opts = {
      sheetL: num('tn-L', 2440), sheetW: num('tn-W', 1220), marginMm: num('tn-m', 15),
      spacingMm: Math.max(num('tn-s', 12), ts.tool.dia + 2), allowRotate: $('tn-rot').checked,
      tool: ts.tool, tabs: ts.tabs
    };
    const items = picked.map((p, i) => { const c = Nesting.centrePart(p.vertices, p.holes); return { id: `${p.name}#${i + 1}`, w: c.w, h: c.h, rec: p, centred: c }; });
    const res = Nesting.nest(items.map(it => ({ id: it.id, w: it.w, h: it.h })), opts);
    const placedParts = res.placements.map(pl => { const it = items.find(x => x.id === pl.id); const g = Nesting.placeGeometry(it.centred, pl); return { id: pl.id, outline: g.outline, holes: g.holes }; });
    const name = `SUGARHILL NEST ${String(seq).padStart(3, '0')}`;
    const gen = NcProgram.generate(placedParts, { name, sheetL: opts.sheetL, sheetW: opts.sheetW, thickness: thk, tool: opts.tool, tabs: opts.tabs });
    const prog = NcProgram.load(gen.text);
    const verify = NcProgram.verifyProgram(prog, { L: opts.sheetL, W: opts.sheetW, toolDia: opts.tool.dia, tabTopZ: gen.tabTopZ, tabs: gen.tabs, warnings: gen.warnings, clampZones: clampZones(opts.sheetL, opts.sheetW) });
    last = { items, res, gen, prog, opts, thickness: thk, name, verify, material: ts.material };
    drawPreview();
    renderVerify(verify);
    $('tn-code').value = gen.text.split('\n').slice(0, 400).join('\n') + (prog.lines > 400 ? `\n... (${prog.lines} lines total)` : '');
    const warn = res.unplaced.length ? ` · ⚠ 원판에 못 들어간 부품 ${res.unplaced.length}개` : '';
    msg(`자동 계산 · ${res.placements.length}개 배치 · 사용률 ${(res.utilization * 100).toFixed(1)}% · 절삭 ${(prog.cutLenMm / 1000).toFixed(1)} m · 예상 ${fmtS(prog.totalS)} · ${prog.lines}줄${warn}` +
      (gen.warnings.length ? ` · 경고: ${gen.warnings.join(' / ')}` : ''), !!res.unplaced.length || !!gen.warnings.length || !verify.ok);
    $('tn-send').disabled = !res.placements.length || !routers().length || !verify.ok;
    $('tn-dl').disabled = false;
  }

  // ------------------------------------------------------------------ preview canvas
  function drawPreview() {
    const cv = $('tn-cv'), ctx = cv.getContext('2d');
    const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, W, H);
    if (!last) return;
    const { opts, res, items, gen, prog } = last;
    const s = Math.min((W - 20) / opts.sheetL, (H - 20) / opts.sheetW), ox = (W - opts.sheetL * s) / 2, oy = (H + opts.sheetW * s) / 2;
    const P = (x, y) => [ox + x * s, oy - y * s];
    ctx.fillStyle = '#e7e2d6'; ctx.fillRect(ox, oy - opts.sheetW * s, opts.sheetL * s, opts.sheetW * s);
    ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([4, 4]);
    ctx.strokeRect(ox + opts.marginMm * s, oy - (opts.sheetW - opts.marginMm) * s, (opts.sheetL - 2 * opts.marginMm) * s, (opts.sheetW - 2 * opts.marginMm) * s);
    ctx.setLineDash([]);
    res.placements.forEach(pl => {
      const it = items.find(x => x.id === pl.id), g = Nesting.placeGeometry(it.centred, pl);
      ctx.beginPath(); g.outline.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...P(p.x, p.y))); ctx.closePath();
      ctx.fillStyle = 'rgba(56,189,248,.28)'; ctx.fill(); ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 1.2; ctx.stroke();
      g.holes.forEach(h => { ctx.beginPath(); ctx.arc(...P(h.x, h.y), h.dia / 2 * s, 0, Math.PI * 2); ctx.fillStyle = '#e7e2d6'; ctx.fill(); ctx.stroke(); });
    });
    ctx.strokeStyle = 'rgba(15,23,42,.7)'; ctx.lineWidth = 0.8; ctx.beginPath();
    prog.segs.forEach(sg => { if (!sg.rapid && Math.min(sg.z0, sg.z1) < 0) { ctx.moveTo(...P(sg.x0, sg.y0)); ctx.lineTo(...P(sg.x1, sg.y1)); } });
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    gen.tabs.forEach(t => {
      const pts = t.loop.concat([t.loop[0]]);
      t.windows.forEach(w => {
        let acc = 0; const c = (w[0] + w[1]) / 2;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          if (acc + L >= c) { const u = (c - acc) / L; const [x, y] = P(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u); ctx.fillRect(x - 2.5, y - 2.5, 5, 5); break; }
          acc += L;
        }
      });
    });
  }

  // ------------------------------------------------------------------ send / download / DXF
  function download() {
    if (!last) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([last.gen.text], { type: 'text/plain' }));
    a.download = `${last.name.replace(/\s+/g, '_')}.nc`;
    a.click();
    log(`💾 [G-code] ${a.download} 저장 (초안 — 기계 투입 전 시뮬레이션·사람 검토 필수)`);
  }

  function send() {
    if (!last) return;
    if (last.verify && !last.verify.ok) return msg('검증 실패 — 공구 경로가 원판을 벗어납니다. 전송이 차단되었습니다.', true);
    const rName = $('tn-router').value;
    const part = { name: last.name, shape: 'sheet', thicknessMm: last.thickness, bboxMm: [last.opts.sheetL, last.opts.sheetW, last.thickness], count: last.res.placements.length };
    let job;
    try { job = window.twinRuntime.assignProgram(rName, part, last.prog.totalS); }
    catch (e) { return msg(e.message, true); }
    job.prog = last.prog; job.nest = last;
    seq++;
    log(`🏭 [네스팅] ${last.name} → ${rName} 작업 #${job.id} (${part.count}개 부품, NC ${last.prog.lines}줄, 예상 ${fmtS(last.prog.totalS)})`);
    close();
    if (window.twinFocusMachine) setTimeout(() => window.twinFocusMachine(rName), 50);
    schedule();                                            // next program number in the window
  }

  async function importDxf(file) {
    const text = await file.text();
    const base = file.name.replace(/\.dxf$/i, '');
    const r = DxfImport.parse(text, base);
    const thk = num('tn-dxf-t', 12);
    let added = 0;
    for (const p of r.parts) {
      try { const s = await savePart({ name: p.name, thickness: thk, vertices: p.vertices, holes: p.holes, source: 'dxf' }); sel.set(s.part.id, 1); added++; }
      catch (e) { r.warnings.push(`${p.name}: ${e.message}`); }
    }
    await loadLibrary();
    $('tn-thk').value = String(thk); fillThickness(thk);
    renderLibrary(); schedule();
    log(`📥 [DXF] ${file.name}: 부품 ${added}개 추가 (${r.units}${r.units === 'inch' ? ' → mm 변환' : ''})${r.warnings.length ? ' · ' + r.warnings.join(' / ') : ''}`);
    if (r.warnings.length) setTimeout(() => msg(r.warnings.join(' / '), true), 300);
  }

  // ------------------------------------------------------------------ router visuals
  function partGeometry(rec) {
    if (geoCache.has(rec.id)) return geoCache.get(rec.id);
    const c = Nesting.centrePart(rec.vertices, rec.holes);
    const g = SketchCore.buildPanelGeometry(THREE, c.outline, c.holes.map(h => Object.assign({ isSubtract: true }, h)), rec.thickness).geometry;
    g.translate(0, 0, -rec.thickness / 2);
    geoCache.set(rec.id, g);
    return g;
  }

  function buildVis(machineObj, job) {
    const rig = machineObj.userData.rig, n = job.nest, L = n.opts.sheetL, Wd = n.opts.sheetW, t = n.thickness;
    const g = new THREE.Group(); machineObj.add(g);
    // --- carvable sheet: heightmap top grid + rim skirts + bottom plane ---
    // Vertex order matches the heightmap (ix, iy) so carving updates vertices directly.
    const grid = SheetCarve.computeGrid(L, Wd, 4);
    const hm = SheetCarve.createHeightmap(L, Wd, t, grid.cell);
    const nx = grid.nx, ny = grid.ny;
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3);
    const idx = [];
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const k = iy * (nx + 1) + ix;
      pos[k * 3] = ix * grid.cellX - L / 2;
      pos[k * 3 + 1] = iy * grid.cellY - Wd / 2;
      pos[k * 3 + 2] = t / 2;                    // z = h - t/2; h = t before cutting
    }
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const a = iy * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);                 // CCW from +Z
    }
    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    topGeo.setIndex(idx);
    topGeo.computeVertexNormals();
    const sheetMat = new THREE.MeshStandardMaterial({ color: 0xe7e2d6, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
    const sheet = new THREE.Group();
    const top = new THREE.Mesh(topGeo, sheetMat);
    top.castShadow = top.receiveShadow = true;
    sheet.add(top);
    // rim skirts + bottom so the plate keeps its solid look from the sides
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.65, metalness: 0.05 });
    const skirtT = 4;
    [[0, -Wd / 2, L, skirtT], [0, Wd / 2, L, skirtT]].forEach(([x, y, w, d]) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, d, t), skirtMat);
      s.position.set(x, y, 0); sheet.add(s);
    });
    [[-L / 2, 0, skirtT, Wd], [L / 2, 0, skirtT, Wd]].forEach(([x, y, w, d]) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, d, t), skirtMat);
      s.position.set(x, y, 0); sheet.add(s);
    });
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(L, Wd), new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.8, metalness: 0.05 }));
    bottom.position.z = -t / 2; bottom.rotation.x = Math.PI;   // faces -Z (down)
    sheet.add(bottom);
    g.add(sheet);
    const clampMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.6 });
    const clamps = [];
    [-0.35, 0.35].forEach(fx => [-1, 1].forEach(side => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(120, 90, 40), clampMat);
      c.userData = { home: side * (Wd / 2 + 160), closed: side * (Wd / 2 + 10) };
      c.position.set(fx * L, c.userData.home, rig.tableZ + t + 20);
      g.add(c); clamps.push(c);
    }));
    const cutSegs = [], upto = new Int32Array(job.prog.segs.length + 1);
    job.prog.segs.forEach((sg, i) => {
      if (!sg.rapid && Math.min(sg.z0, sg.z1) < 0 && (sg.x0 !== sg.x1 || sg.y0 !== sg.y1)) cutSegs.push(sg);
      upto[i + 1] = cutSegs.length;
    });
    const tpos = new Float32Array(cutSegs.length * 6);
    cutSegs.forEach((sg, k) => tpos.set([-L / 2 + sg.x0, -Wd / 2 + sg.y0, 0, -L / 2 + sg.x1, -Wd / 2 + sg.y1, 0], k * 6));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(tpos, 3)); geo.setDrawRange(0, 0);
    const trail = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1f2937 }));
    trail.position.z = rig.tableZ + t + 0.8;
    g.add(trail);
    const v = { g, sheet, clamps, trail, upto, parts: [], L, Wd, t, rig, machineObj, job, hm, grid, topGeo, carveSeg: 0, carveU: 0, carved: false, dirtyMin: Infinity, dirtyMax: -Infinity, lastFlush: 0, lastNormal: 0, lastMass: 0, removed: null };
    jobVis.set(job.id, v);
    return v;
  }

  /** Write the dirty heightmap vertices to the GPU (throttled; dirty range only). */
  function flushCarve(v) {
    if (v.dirtyMin === Infinity) return;
    const now = performance.now();
    if (now - v.lastFlush < 100) return;
    const attr = v.topGeo.attributes.position, h = v.hm.h;
    for (let k = v.dirtyMin; k <= v.dirtyMax; k++) attr.array[k * 3 + 2] = h[k] - v.t / 2;
    attr.updateRange.offset = v.dirtyMin * 3;
    attr.updateRange.count = (v.dirtyMax - v.dirtyMin + 1) * 3;
    attr.needsUpdate = true;
    v.dirtyMin = Infinity; v.dirtyMax = -Infinity;
    v.lastFlush = now;
    if (now - v.lastNormal > 1000) { v.topGeo.computeVertexNormals(); v.lastNormal = now; }
  }

  /** Carve the heightmap up to the tool's current program position (budgeted per frame). */
  function carveTo(v, job, p) {
    if (p.seg < 0) return;
    const segs = job.prog.segs, toolR = job.nest.opts.tool.dia / 2;
    const isCut = sg => sg && !sg.rapid && !sg.tab && Math.min(sg.z0, sg.z1) < 0 && (sg.x0 !== sg.x1 || sg.y0 !== sg.y1);
    let budget = 400;
    while (v.carveSeg < p.seg && budget-- > 0) {
      const sg = segs[v.carveSeg];
      if (isCut(sg)) {
        const r = SheetCarve.carveSegment(v.hm, sg.x0 + v.L / 2, sg.y0 + v.Wd / 2, sg.x1 + v.L / 2, sg.y1 + v.Wd / 2, Math.min(sg.z0, sg.z1), toolR);
        if (r.changed.length) { v.dirtyMin = Math.min(v.dirtyMin, r.minIdx); v.dirtyMax = Math.max(v.dirtyMax, r.maxIdx); }
      }
      v.carveSeg++; v.carveU = 0;
    }
    // current segment: carve only up to the tool's present fraction u, at the current pass depth
    if (v.carveSeg < segs.length) {
      const sg = segs[v.carveSeg];
      if (isCut(sg)) {
        const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
        const u = Math.max(0, Math.min(1, ((p.axis_x_mm - sg.x0) * dx + (p.axis_y_mm - sg.y0) * dy) / (dx * dx + dy * dy)));
        if (u > v.carveU) {
          const z = sg.z0 + (sg.z1 - sg.z0) * u;
          const r = SheetCarve.carveSegment(v.hm, sg.x0 + v.L / 2, sg.y0 + v.Wd / 2, sg.x0 + dx * u + v.L / 2, sg.y0 + dy * u + v.Wd / 2, Math.min(sg.z0, z), toolR);
          if (r.changed.length) { v.dirtyMin = Math.min(v.dirtyMin, r.minIdx); v.dirtyMax = Math.max(v.dirtyMax, r.maxIdx); }
          v.carveU = u;
        }
      }
    }
    flushCarve(v);
  }

  /** Carve every remaining segment (no frame budget) — called at UNLOAD so the sheet is complete before parts spawn. */
  function finishCarve(v, job) {
    if (v.carved) return;
    const segs = job.prog.segs, toolR = job.nest.opts.tool.dia / 2;
    while (v.carveSeg < segs.length) {
      const sg = segs[v.carveSeg];
      if (sg && !sg.rapid && !sg.tab && Math.min(sg.z0, sg.z1) < 0 && (sg.x0 !== sg.x1 || sg.y0 !== sg.y1)) {
        const r = SheetCarve.carveSegment(v.hm, sg.x0 + v.L / 2, sg.y0 + v.Wd / 2, sg.x1 + v.L / 2, sg.y1 + v.Wd / 2, Math.min(sg.z0, sg.z1), toolR);
        if (r.changed.length) { v.dirtyMin = Math.min(v.dirtyMin, r.minIdx); v.dirtyMax = Math.max(v.dirtyMax, r.maxIdx); }
      }
      v.carveSeg++;
    }
    v.carveU = 0; v.carved = true;
    v.lastFlush = 0; v.lastNormal = 0;
    flushCarve(v);
    v.topGeo.computeVertexNormals();
    v.removed = removedMass(job.id);
  }

  function spawnCutParts(v, job) {
    job.nest.res.placements.forEach(pl => {
      const it = job.nest.items.find(x => x.id === pl.id);
      const m = new THREE.Mesh(partGeometry(it.rec), partMat);
      m.castShadow = true;
      m.rotation.z = pl.rot * Math.PI / 180;
      m.position.set(-v.L / 2 + pl.cx, -v.Wd / 2 + pl.cy, v.rig.tableZ + v.t / 2);
      m.userData = { isFinishedPart: true, part: it.rec.name, partId: it.rec.id, nestId: pl.id };
      v.g.add(m); v.parts.push(m);
    });
  }

  /** Called by twin_live for router jobs that carry an NC program. Returns axis signals. */
  function drive(a, m, job) {
    const mm = window.twinRuntime.machines.get(m.name);
    const v = jobVis.get(job.id) || buildVis(a.obj, job);
    const rig = v.rig, top = rig.tableZ + v.t;
    let ax;
    if (m.phase === 'LOADING') {
      const u = Math.min(1, mm.phaseT / job.est.loadS);
      v.sheet.position.set(0, 0, top - v.t / 2 + 700 * Math.max(0, 1 - u / 0.6));
      const cu = Math.max(0, (u - 0.6) / 0.4);
      v.clamps.forEach(c => { c.position.y = c.userData.home + (c.userData.closed - c.userData.home) * cu; });
      rig.gantry.position.x = -v.L / 2 - rig.toolOffsetX; rig.carriage.position.y = -v.Wd / 2; rig.spindle.position.z = top + 25 - rig.toolTipZ;
      ax = { axis_x_mm: 0, axis_y_mm: 0, axis_z_mm: 25, spindle_rpm: 0, vacuum_on: u > 0.6, clamps_closed: cu >= 1, line: 0, program: job.nest.name };
    } else if (m.phase === 'RUNNING' || m.phase === 'HOLD') {
      v.sheet.position.set(0, 0, top - v.t / 2);
      v.clamps.forEach(c => { c.position.y = c.userData.closed; });
      const p = NcProgram.axesAt(job.prog, job.progress * job.prog.totalS);
      rig.gantry.position.x = -v.L / 2 + p.axis_x_mm - rig.toolOffsetX;
      rig.carriage.position.y = -v.Wd / 2 + p.axis_y_mm;
      rig.spindle.position.z = top + p.axis_z_mm - rig.toolTipZ;
      v.trail.geometry.setDrawRange(0, v.upto[p.seg + 1] * 2);
      if (m.phase === 'RUNNING') {
        carveTo(v, job, p);                                  // real material removal at the current pass depth
        const now = performance.now();
        if (now - v.lastMass > 500) { v.removed = removedMass(job.id); v.lastMass = now; }
      }
      a.tip.visible = m.phase === 'RUNNING' && p.axis_z_mm < 0;
      ax = Object.assign(p, { spindle_rpm: m.phase === 'HOLD' ? 0 : p.spindle_rpm, vacuum_on: true, clamps_closed: true, program: job.nest.name });
    } else {
      const u = Math.min(1, mm.phaseT / job.est.unloadS);
      v.trail.geometry.setDrawRange(0, v.upto[v.upto.length - 1] * 2);
      a.tip.visible = false;
      const cu = Math.min(1, u / 0.3);
      v.clamps.forEach(c => { c.position.y = c.userData.closed + (c.userData.home - c.userData.closed) * cu; });
      if (u > 0.3 && !v.parts.length) { finishCarve(v, job); spawnCutParts(v, job); }   // carved offcut skeleton stays solid
      v.parts.forEach(pm => { pm.position.z = top - v.t / 2 + 160 * Math.max(0, (u - 0.3) / 0.7); });
      rig.gantry.position.x = -rig.toolOffsetX; rig.carriage.position.y = 0; rig.spindle.position.z = top + 25 - rig.toolTipZ;
      ax = { axis_x_mm: 0, axis_y_mm: 0, axis_z_mm: 25, spindle_rpm: 0, vacuum_on: false, clamps_closed: cu < 1, line: 0, program: job.nest.name };
    }
    return ax;
  }

  function onEvent(e) {
    if (e.type !== 'JOB_DONE') return;
    const v = jobVis.get(e.job); if (!v) return;
    if (!v.parts.length) spawnCutParts(v, v.job);          // at very high sim speed the unloading frames can be skipped
    const D = (ASSET_CATALOG.find(x => x.assetId === v.machineObj.userData.assetId) || { dims: [0, 2100] }).dims[1];
    v.parts.forEach((pm, i) => {
      const wp = v.machineObj.localToWorld(new THREE.Vector3(-900 + (i % 4) * 600, -(D / 2 + 700 + Math.floor(i / 4) * 450), v.t / 2));
      const q = new THREE.Quaternion(); pm.getWorldQuaternion(q);
      v.g.remove(pm); scene.add(pm);
      pm.position.copy(wp); pm.quaternion.copy(q);
      pm.userData.processedBy = v.machineObj.name; pm.userData.processedAt = new Date().toISOString();
    });
    v.machineObj.remove(v.g);
    jobVis.delete(e.job);
    log(`✅ [네스팅] 작업 #${e.job} 완료 — 부품 ${v.parts.length}개 배출 (${v.machineObj.name} 앞)`);
  }

  // ------------------------------------------------------------------ window UI
  const CSS = `
  #tn{position:fixed;inset:5vh 4vw;z-index:2000;display:none;flex-direction:column;background:rgba(10,14,21,.97);border:1px solid #233047;border-radius:14px;
      color:#e2e8f0;font:12px/1.45 system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  #tn *{box-sizing:border-box}
  #tn .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #1e293b}#tn .hd b{font-size:14px}
  #tn .chip{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid rgba(245,158,11,.45);color:#f59e0b}
  #tn .body{flex:1;display:grid;grid-template-columns:320px minmax(0,1fr);min-height:0}
  #tn .side{border-right:1px solid #1e293b;padding:12px 14px;overflow:auto}
  #tn .main{display:grid;grid-template-rows:minmax(0,1.3fr) auto auto minmax(0,1fr);gap:8px;padding:12px 14px;min-height:0}
  #tn .sec{display:flex;align-items:center;gap:6px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px}
  #tn .sec .sp{flex:1}
  #tn .g2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#tn .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  #tn label.l{display:block;color:#64748b;font-size:10px;margin-bottom:2px}
  #tn input,#tn select,#tn button,#tn textarea{font:inherit;color:#e2e8f0;background:#141c2b;border:1px solid #273449;border-radius:6px;padding:4px 7px}
  #tn input,#tn select{width:100%}#tn input[type=checkbox]{width:auto}
  #tn button{cursor:pointer;white-space:nowrap}#tn button:hover:not(:disabled){border-color:#38bdf8}#tn button:disabled{opacity:.45;cursor:default}
  #tn button.pri{background:#0369a1;border-color:#0284c7;color:#fff;font-weight:600}#tn button.sm{padding:1px 6px;font-size:11px}
  #tn .lib{display:flex;flex-direction:column;gap:2px;max-height:34vh;overflow:auto;border:1px solid #1e293b;border-radius:8px;padding:4px}
  #tn .item{display:grid;grid-template-columns:auto 1fr 52px auto;gap:6px;align-items:center;padding:5px 6px;border-radius:6px}
  #tn .item:hover{background:#111a28}#tn .item.on{background:rgba(56,189,248,.08)}
  #tn .item small{display:block;color:#64748b}#tn .src{font-size:9px;border:1px solid #273449;border-radius:4px;padding:0 4px;color:#94a3b8;margin-left:4px}
  #tn .empty{color:#64748b;padding:8px}
  #tn canvas{width:100%;height:100%;background:#0e141f;border:1px solid #1e293b;border-radius:10px;min-height:180px}
  #tn textarea{width:100%;height:100%;resize:none;font:11px/1.35 ui-monospace,Consolas,monospace;color:#cbd5e1;background:#0e141f}
  #tn .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  #tn .msg{flex:1;min-width:200px;color:#94a3b8}#tn .msg.err{color:#fca5a5}
  #tn .legend{display:flex;gap:12px;color:#64748b;font-size:11px}#tn .legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  #tn .verify{display:flex;flex-direction:column;gap:2px;font-size:11px}
  #tn .verify div{padding:2px 8px;border-radius:5px;background:#0e141f;border:1px solid #1e293b;color:#94a3b8}
  #tn .verify .v-ok b{color:#4ade80}#tn .verify .v-warn{border-color:rgba(245,158,11,.5)}#tn .verify .v-warn b{color:#f59e0b}
  #tn .verify .v-err{border-color:rgba(239,68,68,.6)}#tn .verify .v-err b{color:#f87171}
  @media (max-width:860px){#tn{inset:8px}#tn .body{grid-template-columns:1fr}#tn .side{border-right:0;border-bottom:1px solid #1e293b;max-height:45vh}}
  .tn-save{display:flex;gap:6px;margin-top:8px}.tn-save input{flex:1;min-width:0;background:#0c1017;border:1px solid #233047;color:#e2e8f0;border-radius:4px;padding:4px 6px;font-size:12px}`;

  function buildWindow() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const w = document.createElement('div'); w.id = 'tn';
    w.innerHTML = `
      <div class="hd"><b>📐 네스팅 · G-code</b><span class="chip">자동 계산 · G-code 초안 · 가정 이송 · 파일까지만</span><span style="flex:1"></span><button id="tn-x">닫기</button></div>
      <div class="body">
        <div class="side">
          <div class="sec">부품 라이브러리<span id="tn-lib-src" class="src" style="margin-left:2px">서버</span><span class="sp"></span><label class="l" style="margin:0">두께</label><select id="tn-thk" style="width:84px"></select></div>
          <div class="lib" id="tn-lib"></div>
          <div class="g2" style="margin-top:6px"><button class="sm" id="tn-all">이 두께 모두 선택</button><button class="sm" id="tn-none">선택 해제</button></div>
          <div class="sec">DXF 불러오기</div>
          <div class="g2"><div><label class="l">판 두께 (mm)</label><input id="tn-dxf-t" type="number" value="12"></div>
            <div><label class="l">&nbsp;</label><button id="tn-dxf-b" style="width:100%">📥 .dxf 선택</button></div></div>
          <input id="tn-dxf" type="file" accept=".dxf" multiple style="display:none">
          <div class="sec">원판 (mm)</div>
          <div class="g2"><div><label class="l">길이 X</label><input id="tn-L" type="number" value="2440"></div><div><label class="l">폭 Y</label><input id="tn-W" type="number" value="1220"></div>
            <div><label class="l">여백</label><input id="tn-m" type="number" value="15"></div><div><label class="l">부품 간격</label><input id="tn-s" type="number" value="12"></div></div>
          <label style="display:block;margin-top:6px"><input id="tn-rot" type="checkbox" checked style="vertical-align:-2px"> 90° 회전 허용 (결 없음)</label>
          <div class="sec">원판 재질</div>
          <select id="tn-mat"></select>
          <div id="tn-mat-info" style="color:#64748b;font-size:11px;margin-top:4px"></div>
          <div class="sec">공구 · 절삭 (가정값)</div>
          <div class="g2"><div><label class="l">공구 Ø</label><input id="tn-d" type="number" value="6"></div><div><label class="l">절입/패스</label><input id="tn-sd" type="number" value="4"></div><div><label class="l">이송 mm/min</label><input id="tn-f" type="number" value="3000"></div><div><label class="l">스핀들 rpm</label><input id="tn-rpm" type="number" value="18000"></div></div>
          <div class="sec">고정 탭</div>
          <div class="g3"><div><label class="l">개수</label><input id="tn-tc" type="number" value="4"></div><div><label class="l">폭</label><input id="tn-tw" type="number" value="8"></div><div><label class="l">높이</label><input id="tn-th" type="number" value="2"></div></div>
          <div class="sec">설비</div><select id="tn-router"></select>
        </div>
        <div class="main">
          <canvas id="tn-cv"></canvas>
          <div class="bar">
            <button id="tn-dl" disabled>💾 .nc 저장</button><button class="pri" id="tn-send" disabled>라우터로 보내기 ▶</button>
            <span class="msg" id="tn-msg">부품을 체크하면 자동으로 네스팅됩니다.</span>
            <span class="legend"><span><i style="background:rgba(56,189,248,.5)"></i>부품</span><span><i style="background:#1f2937"></i>공구 경로</span><span><i style="background:#ef4444"></i>탭</span></span>
          </div>
          <div id="tn-verify" class="verify"></div>
          <textarea id="tn-code" readonly placeholder="G-code 미리보기"></textarea>
        </div>
      </div>`;
    document.body.appendChild(w);
    $('tn-mat').innerHTML = SHEET_MATERIAL_IDS.map(id => { const m = sheetMaterial(id); return `<option value="${id}">${esc(m.name)}</option>`; }).join('');
    updateMatInfo();
    $('tn-mat').onchange = () => { applyMaterialToInputs(); schedule(); };
    $('tn-x').onclick = close;
    $('tn-dl').onclick = download;
    $('tn-send').onclick = send;
    $('tn-dxf-b').onclick = () => $('tn-dxf').click();
    $('tn-dxf').onchange = async e => { for (const f of e.target.files) await importDxf(f); e.target.value = ''; };
    $('tn-thk').onchange = () => { renderLibrary(); schedule(); };
    $('tn-all').onclick = () => { library.filter(p => p.thickness === parseFloat($('tn-thk').value)).forEach(p => { if (!sel.get(p.id)) sel.set(p.id, 1); }); renderLibrary(); schedule(); };
    $('tn-none').onclick = () => { sel.clear(); renderLibrary(); schedule(); };
    w.querySelectorAll('.side input:not([type=file]), .side select:not(#tn-thk)').forEach(el => el.addEventListener('input', schedule));
    $('tn-lib').addEventListener('change', e => {
      const id = e.target.dataset.id; if (!id) return;
      if (e.target.type === 'checkbox') sel.set(id, e.target.checked ? Math.max(1, sel.get(id) || 1) : 0);
      else sel.set(id, Math.max(0, Math.round(parseFloat(e.target.value) || 0)));
      renderLibrary(); schedule();
    });
    $('tn-lib').addEventListener('click', e => { const id = e.target.dataset.del; if (id && confirm('라이브러리에서 이 부품을 삭제할까요?')) deletePart(id); });
    addEventListener('resize', () => { if (w.style.display === 'flex') drawPreview(); });
  }

  function fillThickness(prefer) {
    const ts = [...new Set(library.map(p => p.thickness))].sort((a, b) => a - b);
    const cur = prefer ?? parseFloat($('tn-thk').value);
    $('tn-thk').innerHTML = ts.map(t => `<option value="${t}">${t} mm</option>`).join('') || '<option value="">–</option>';
    if (ts.includes(cur)) $('tn-thk').value = String(cur);
  }

  function renderLibrary() {
    const thk = parseFloat($('tn-thk').value);
    const list = library.filter(p => p.thickness === thk);
    $('tn-lib').innerHTML = list.length ? list.map(p => {
      const q = sel.get(p.id) || 0;
      return `<div class="item ${q ? 'on' : ''}"><input type="checkbox" data-id="${p.id}" ${q ? 'checked' : ''}>
        <div>${esc(p.name)}<span class="src">${p.source === 'dxf' ? 'DXF' : '스케치'}</span><small>${sizeOf(p)}×${p.thickness} mm · 구멍 ${(p.holes || []).length}</small></div>
        <input type="number" min="0" value="${q}" data-id="${p.id}" title="수량">
        <button class="sm" data-del="${p.id}" title="삭제">✕</button></div>`;
    }).join('') : `<div class="empty">${library.length ? '이 두께의 부품이 없습니다.' : '라이브러리가 비어 있습니다. 모델링 창의 “📚 라이브러리에 저장”, 또는 DXF 불러오기.'}</div>`;
  }

  async function open() {
    await syncPlacedDesigns();
    await loadLibrary();
    fillThickness();
    renderLibrary();
    updateMatInfo();
    const rs = routers();
    $('tn-router').innerHTML = rs.map(o => `<option>${o.name}</option>`).join('') || '<option value="">CNC 라우터 없음</option>';
    $('tn').style.display = 'flex';
    generate();
  }
  function close() { $('tn').style.display = 'none'; }
  function msg(t, err) { const m = $('tn-msg'); m.textContent = t; m.className = 'msg' + (err ? ' err' : ''); }

  /** Parts placed in the factory are saved to the library too (server dedupes by geometry). */
  async function syncPlacedDesigns() {
    const ds = placedObjects.filter(o => o.userData && o.userData.isExtrudedSketch && o.userData.vertices && !o.userData.libraryId);
    for (const o of ds) {
      try {
        const ud = o.userData;
        const r = await savePart({ name: o.name, thickness: ud.thickness, vertices: ud.vertices.map(p => ({ x: +p.x, y: +p.y })), holes: (ud.holes || []).filter(h => h.isSubtract).map(h => ({ x: +h.x, y: +h.y, dia: +h.dia })), source: 'sketch' });
        ud.libraryId = r.part.id;
      } catch (e) { /* invalid legacy sketch — skip */ }
    }
  }

  // ------------------------------------------------------------------ modeling window: save button
  function addSaveToModeling() {
    const ext = document.querySelector('#cad-sketch-panel button[onclick="cadSketchExecuteExtrude()"]');
    if (!ext || document.getElementById('tn-save-name')) return;
    const box = document.createElement('div'); box.className = 'tn-save';
    box.innerHTML = `<input id="tn-save-name" placeholder="부품 이름 (비우면 자동)"><button class="btn-tb" id="tn-save-btn" style="white-space:nowrap;color:#a5f3fc;border-color:#0891b2">📚 라이브러리에 저장</button>`;
    ext.parentElement.appendChild(box);
    $('tn-save-btn').onclick = async () => {
      try { const r = await saveCurrentSketch($('tn-save-name').value); $('tn-save-btn').textContent = r.existing ? '✓ 이미 저장됨' : '✓ 저장됨'; }
      catch (e) { log(`⚠️ [라이브러리] 저장 실패: ${e.message}`); $('tn-save-btn').textContent = '⚠ ' + e.message.slice(0, 18); }
      setTimeout(() => { $('tn-save-btn').textContent = '📚 라이브러리에 저장'; }, 2200);
    };
  }

  function start() {
    const tools = document.querySelector('#tl .tools');
    if (!tools || typeof placedObjects === 'undefined') return setTimeout(start, 400);
    buildWindow();
    addSaveToModeling();
    const b = document.createElement('button');
    b.textContent = '📐 네스팅 · G-code'; b.title = '부품 라이브러리 → 자동 네스팅 → G-code → 라우터';
    b.onclick = open;
    tools.insertBefore(b, tools.children[1]);
    // placing a part in the factory also stores it in the library
    const orig = window.cadStudioApplyToFactoryScene;
    if (typeof orig === 'function') {
      window.cadStudioApplyToFactoryScene = function () {
        const r = orig.apply(this, arguments);
        saveCurrentSketch('', true).then(x => { const o = placedObjects[placedObjects.length - 1]; if (o && o.userData) o.userData.libraryId = x.part.id; }).catch(() => {});
        return r;
      };
    }
  }

  window.TwinNest = { drive, onEvent, open, generate, saveCurrentSketch, importDxf, toolSettings: currentToolSettings, nestSinglePart, clampZones, removedMass, get last() { return last; }, get library() { return library; }, select: (id, q) => { sel.set(id, q); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
