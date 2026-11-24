/*
 * user_assets.js — the user's own OBJ files in the /v2 content drawer.
 *
 *   Drop .obj (and optionally its .mtl) onto the 3D view, or use "📥 OBJ 가져오기" in the drawer.
 *   A dialog shows the size the model will have in the scene and lets the user fix the unit
 *   (mm / cm / m / inch) and the up axis (Z-up / Y-up) before saving. The model is then:
 *     - saved in this browser (IndexedDB), so it is still in the drawer after a reload,
 *     - registered in ASSET_CATALOG under category USER_OBJ ("📥 내 OBJ" tab), id user_obj_…,
 *     - placed like any other asset (select, move, duplicate, save layout, undo).
 *
 *   Limits (by design for this first version):
 *     - Saved per browser. Another PC or browser, or GitHub Pages opened elsewhere, does not
 *       have the file; a saved layout that names a missing user_obj_… asset skips it with a log line.
 *     - MTL: diffuse colour (Kd) and opacity only; texture maps are not loaded.
 *     - Without an MTL the model takes the twin's material system (material studio works on it).
 *
 *   Pure maths (unit/axis guess, placement) is in lib/user_obj_core.js and tested in Node.
 *   Classic deferred script after editor_v2.js; uses its globals (THREE, ASSET_CATALOG,
 *   renderAssetDrawer, currentCategoryFilter, spawnAssetInstance, placedObjects,
 *   placedAssetsGroup, selectAssetObject, updateOutlinerUI, pushUndoState, log).
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || typeof UserObjCore === 'undefined') return;
  const C = UserObjCore;

  const DB_NAME = 'sugarhill-twin-user-assets';
  const STORE = 'objAssets';
  const CATEGORY = 'USER_OBJ';
  const DEFAULT_MATERIAL = 'PP_GF30_Structural_Grey';

  const records = new Map();     // assetId → stored record
  const templates = new Map();   // assetId → parsed THREE.Group (cloned per instance)
  const pendingSpawns = [];      // spawns asked for before IndexedDB finished loading
  let ready = false;
  let dbPromise = null;

  const say = (m) => { try { log(m); } catch (e) { console.log(m); } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => Math.round(v).toLocaleString();

  // ------------------------------------------------------------------ IndexedDB
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB 없음')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function tx(mode, fn) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
    }));
  }
  const dbGetAll = () => tx('readonly', s => s.getAll());
  const dbPut = (rec) => tx('readwrite', s => s.put(rec));
  const dbDelete = (id) => tx('readwrite', s => s.delete(id));

  // ------------------------------------------------------------------ catalog
  function catalogEntry(rec) {
    const d = rec.placement.dims;
    return {
      assetId: rec.id, id: rec.id, userObj: true, category: CATEGORY,
      title: rec.title, name: rec.title,
      sub: `${rec.fileName} · ${C.UNIT_LABEL[rec.unit] || rec.unit} · ${rec.up}-up · 정점 ${fmt(rec.vertices)}`,
      desc: `내가 가져온 OBJ (${rec.fileName})`,
      badge: '내 OBJ', tag: '내 OBJ', icon: '📥', color: '#a78bfa',
      dims: d.map(v => Math.round(v)), sizeMm: d.map(v => Math.round(v)),
      defaultMaterial: DEFAULT_MATERIAL, materialHint: DEFAULT_MATERIAL
    };
  }
  function register(rec) {
    records.set(rec.id, rec);
    templates.delete(rec.id);
    const entry = catalogEntry(rec);
    const i = ASSET_CATALOG.findIndex(a => a.assetId === rec.id);
    if (i >= 0) ASSET_CATALOG[i] = entry; else ASSET_CATALOG.push(entry);
  }
  function unregister(id) {
    records.delete(id);
    templates.delete(id);
    const i = ASSET_CATALOG.findIndex(a => a.assetId === id);
    if (i >= 0) ASSET_CATALOG.splice(i, 1);
  }
  function refreshDrawer(category) {
    try { renderAssetDrawer(category || currentCategoryFilter); } catch (e) { /* drawer not built yet */ }
    const tab = document.getElementById('btn-drawer-user-obj');
    if (tab) tab.textContent = `📥 내 OBJ (${records.size})`;
  }

  // ------------------------------------------------------------------ model building (sync: spawnAssetInstance needs a group now)
  function buildTemplate(rec) {
    const raw = new THREE.OBJLoader().parse(rec.objText);
    const mtl = rec.mtlText ? C.parseMtl(rec.mtlText) : null;
    raw.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const next = mats.map(m => {
        const spec = mtl && m && mtl[m.name];
        if (spec) {
          return new THREE.MeshPhysicalMaterial({
            name: m.name, color: new THREE.Color(spec.kd[0], spec.kd[1], spec.kd[2]),
            roughness: 0.55, metalness: 0.1, transparent: spec.opacity < 1, opacity: spec.opacity,
            side: THREE.DoubleSide
          });
        }
        return new THREE.MeshPhysicalMaterial({ name: (m && m.name) || 'user_obj', color: 0xb8bec6, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
      });
      child.material = Array.isArray(child.material) ? next : next[0];
      // No MTL colour → let the twin's material studio recolour it (it only touches partTag 'primary').
      if (!mtl) child.userData.partTag = 'primary';
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
    });
    const pl = rec.placement;
    raw.scale.setScalar(pl.scale);
    raw.rotation.set(THREE.MathUtils.degToRad(pl.rotateXDeg), 0, 0);
    raw.position.set(pl.offset[0], pl.offset[1], pl.offset[2]);
    raw.name = 'UserObj_Model';
    return raw;
  }

  /** Called from buildAssetMeshGroup for catalog entries with userObj. */
  function buildGroup(assetDef) {
    const g = new THREE.Group();
    const rec = records.get(assetDef.assetId);
    if (!rec) return g;
    let tpl = templates.get(rec.id);
    if (!tpl) {
      try { tpl = buildTemplate(rec); templates.set(rec.id, tpl); }
      catch (e) { say(`⚠️ [내 OBJ] '${rec.title}' 읽기 실패: ${e.message}`); return g; }
    }
    const inst = tpl.clone(true);
    inst.traverse(c => {   // own materials per instance, so recolouring one does not recolour the others
      if (c.isMesh) c.material = Array.isArray(c.material) ? c.material.map(m => m.clone()) : c.material.clone();
    });
    g.add(inst);
    return g;
  }

  /** Called from spawnAssetInstance when the asset id is unknown. True = queued until loading ends. */
  function deferSpawn(args) {
    if (!C.isUserAssetId(args[0])) return false;
    if (ready) { say(`⚠️ [내 OBJ] '${args[1] || args[0]}'의 원본이 이 브라우저에 없어 건너뜀 (다른 PC·브라우저에서 가져온 OBJ)`); return false; }
    pendingSpawns.push(args);
    return true;
  }

  // ------------------------------------------------------------------ import dialog
  function readText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  }

  function ensureStyles() {
    if (document.getElementById('user-obj-style')) return;
    const st = document.createElement('style');
    st.id = 'user-obj-style';
    st.textContent =
      '#user-obj-modal{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.62);display:flex;align-items:center;justify-content:center;font:13px system-ui,sans-serif;color:#e2e8f0}' +
      '#user-obj-modal .uo-box{width:min(460px,calc(100vw - 32px));background:#0f172a;border:1px solid #334155;border-radius:10px;padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,.5)}' +
      '#user-obj-modal h3{margin:0 0 4px;font-size:15px}#user-obj-modal .uo-file{color:#94a3b8;font-size:12px;margin-bottom:12px;word-break:break-all}' +
      '#user-obj-modal label{display:block;margin:8px 0 3px;color:#cbd5e1;font-size:12px}' +
      '#user-obj-modal input,#user-obj-modal select{width:100%;box-sizing:border-box;background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:6px 8px;font:inherit}' +
      '#user-obj-modal .uo-hint{color:#64748b;font-size:11px;margin-top:2px}' +
      '#user-obj-modal .uo-size{margin-top:12px;padding:9px 10px;border-radius:6px;background:#020617;border:1px solid #1e293b}' +
      '#user-obj-modal .uo-size b{color:#a78bfa;font-size:14px}#user-obj-modal .uo-warn{color:#fbbf24;font-size:12px;margin-top:4px}' +
      '#user-obj-modal .uo-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}' +
      '#user-obj-modal button{border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer}' +
      '#user-obj-modal button.uo-primary{background:#6d28d9;border-color:#7c3aed}' +
      '.asset-card .uo-del{position:absolute;top:4px;right:4px;border:1px solid #475569;background:#0f172a;color:#94a3b8;border-radius:4px;font-size:10px;padding:1px 5px;cursor:pointer;z-index:2}' +
      '.asset-card .uo-del.armed{color:#fecaca;border-color:#ef4444;background:#450a0a}';
    document.head.appendChild(st);
  }

  /** Resolves to { action: 'place' | 'save' | 'cancel', title, unit, up }. */
  function askImport(fileName, stats, mtlName) {
    ensureStyles();
    const gUnit = C.guessUnit(stats), gUp = C.guessUp(stats);
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.id = 'user-obj-modal';
      const unitOpts = Object.keys(C.UNIT_TO_MM).map(u => `<option value="${u}"${u === gUnit.unit ? ' selected' : ''}>${C.UNIT_LABEL[u]}</option>`).join('');
      wrap.innerHTML =
        '<div class="uo-box" role="dialog" aria-modal="true" aria-label="OBJ 가져오기">' +
        '<h3>📥 OBJ 가져오기</h3>' +
        `<div class="uo-file">${esc(fileName)}${mtlName ? ' + ' + esc(mtlName) : ' (MTL 없음 — 트윈 재질 사용)'} · 정점 ${fmt(stats.vertices)} · 면 ${fmt(stats.faces)}</div>` +
        `<label>이름</label><input id="uo-title" value="${esc(fileName.replace(/\.obj$/i, ''))}" maxlength="60">` +
        `<label>파일 단위</label><select id="uo-unit">${unitOpts}</select><div class="uo-hint">추정: ${esc(gUnit.reason)}</div>` +
        '<label>위쪽 축</label><select id="uo-up">' +
        `<option value="Z"${gUp.up === 'Z' ? ' selected' : ''}>Z-up (SolidCraft·이 트윈·대부분 CAD)</option>` +
        `<option value="Y"${gUp.up === 'Y' ? ' selected' : ''}>Y-up (Blender 기본 내보내기)</option>` +
        `</select><div class="uo-hint">추정: ${esc(gUp.reason)}</div>` +
        '<div class="uo-size">트윈 안 크기 (가로 × 세로 × 높이): <b id="uo-dims">-</b><div class="uo-warn" id="uo-warn"></div></div>' +
        '<div class="uo-btns"><button id="uo-cancel">취소</button><button id="uo-save">저장만</button><button class="uo-primary" id="uo-place">저장 후 배치</button></div>' +
        '</div>';
      document.body.appendChild(wrap);
      const $ = (id) => wrap.querySelector('#' + id);
      const update = () => {
        const pl = C.computePlacement(stats.bbox, $('uo-unit').value, $('uo-up').value);
        $('uo-dims').textContent = pl.dims.map(fmt).join(' × ') + ' mm';
        const big = Math.max(...pl.dims), small = Math.min(...pl.dims.filter(v => v > 0));
        $('uo-warn').textContent =
          big > 30000 ? '⚠️ 30 m가 넘습니다 — 단위가 맞는지 확인하세요 (건물 길이 약 61 m)' :
          big < 5 ? '⚠️ 5 mm보다 작습니다 — 단위가 맞는지 확인하세요' :
          (pl.dims[2] > 0 && pl.dims[2] < small * 0.02 && $('uo-up').value === 'Z') ? '⚠️ 높이가 매우 납작합니다 — 위쪽 축이 Y-up일 수 있습니다' : '';
      };
      const done = (action) => {
        const out = { action, title: ($('uo-title').value || '').trim() || fileName, unit: $('uo-unit').value, up: $('uo-up').value };
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        resolve(out);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done('cancel'); }
        else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.stopPropagation(); done('place'); }
        else e.stopPropagation();   // keep WASD / G / R / T from reaching the editor while typing
      };
      $('uo-unit').addEventListener('change', update);
      $('uo-up').addEventListener('change', update);
      $('uo-cancel').addEventListener('click', () => done('cancel'));
      $('uo-save').addEventListener('click', () => done('save'));
      $('uo-place').addEventListener('click', () => done('place'));
      wrap.addEventListener('click', (e) => { if (e.target === wrap) done('cancel'); });
      document.addEventListener('keydown', onKey, true);
      update();
      $('uo-title').focus();
      $('uo-title').select();
    });
  }

  /** files: FileList or File[]; dropPoint: [x, y, z] mm or null (→ view centre). */
  async function handleFiles(files, dropPoint) {
    const list = Array.from(files || []);
    const byName = new Map(list.map(f => [f.name, f]));
    const pairs = C.pairFiles(list.map(f => f.name));
    if (!pairs.length) { say('⚠️ [내 OBJ] .obj 파일이 없습니다 — OBJ(와 MTL)만 넣을 수 있습니다.'); return; }
    let offset = 0;
    for (const p of pairs) {
      const objFile = byName.get(p.obj);
      if (objFile.size > C.MAX_OBJ_BYTES) {
        say(`⚠️ [내 OBJ] '${p.obj}'는 ${(objFile.size / 1048576).toFixed(0)} MB — ${C.MAX_OBJ_BYTES / 1048576} MB 이하만 넣을 수 있습니다 (Blender에서 Decimate로 줄여 주세요).`);
        continue;
      }
      let objText, mtlText = null;
      try {
        objText = await readText(objFile);
        if (p.mtl) mtlText = await readText(byName.get(p.mtl));
      } catch (e) { say(`⚠️ [내 OBJ] '${p.obj}' 파일 읽기 실패: ${e.message}`); continue; }
      const stats = C.parseObjStats(objText);
      if (!stats.ok) { say(`⚠️ [내 OBJ] '${p.obj}' 가져오기 안 함: ${stats.error}`); continue; }

      const ans = await askImport(p.obj, stats, p.mtl);
      if (ans.action === 'cancel') { say(`[내 OBJ] '${p.obj}' 가져오기 취소`); continue; }
      const rec = {
        id: C.makeAssetId(p.obj, Date.now() + offset),
        title: ans.title, fileName: p.obj, mtlName: p.mtl,
        objText, mtlText, unit: ans.unit, up: ans.up,
        vertices: stats.vertices, faces: stats.faces,
        placement: C.computePlacement(stats.bbox, ans.unit, ans.up),
        createdAt: new Date().toISOString()
      };
      let saved = true;
      try { await dbPut(rec); }
      catch (e) { saved = false; say(`⚠️ [내 OBJ] 브라우저 저장 실패(${e.message}) — 이번 화면에서만 쓸 수 있습니다.`); }
      register(rec);
      refreshDrawer(CATEGORY);
      const tab = document.getElementById('btn-drawer-user-obj');
      if (tab) { document.querySelectorAll('.drawer-cats .btn-tb, .drawer-tab').forEach(b => b.classList.remove('active')); tab.classList.add('active'); }
      say(`📥 [내 OBJ] '${rec.title}' ${saved ? '저장' : '임시 등록'} — ${rec.placement.dims.map(fmt).join(' × ')} mm (${rec.unit}, ${rec.up}-up)`);
      if (ans.action === 'place') {
        const base = dropPoint || viewCentre();
        const pos = [base[0] + offset, base[1] + offset, base[2]];
        spawnAssetInstance(rec.id, null, pos, [0, 0, 0], [1, 1, 1], DEFAULT_MATERIAL, true);
      }
      offset += 600;   // several files at once: do not stack them in the same spot
    }
  }

  function viewCentre() {
    try {
      const step = gridSnapStep || 100;
      return [Math.round(controls.target.x / step) * step, Math.round(controls.target.y / step) * step, 0];
    } catch (e) { return [12000, 8000, 0]; }
  }

  // ------------------------------------------------------------------ drawer: delete + import button
  function decorateCard(card, asset) {
    ensureStyles();
    card.style.position = card.style.position || 'relative';
    const del = document.createElement('button');
    del.className = 'uo-del';
    del.type = 'button';
    del.title = '내 OBJ 삭제 (한 번 더 누르면 삭제)';
    del.textContent = '✕';
    let timer = null;
    del.addEventListener('mousedown', e => e.stopPropagation());
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!del.classList.contains('armed')) {
        del.classList.add('armed');
        del.textContent = '삭제?';
        timer = setTimeout(() => { del.classList.remove('armed'); del.textContent = '✕'; }, 4000);
        return;
      }
      clearTimeout(timer);
      removeAsset(asset.assetId).catch(err => say(`⚠️ [내 OBJ] 삭제 실패: ${err.message}`));
    });
    card.appendChild(del);
  }

  async function removeAsset(id) {
    const rec = records.get(id);
    const placed = placedObjects.filter(o => o.userData && o.userData.assetId === id);
    if (placed.length) {
      try { pushUndoState(); } catch (e) { /* undo is best-effort */ }
      placed.forEach(o => {
        placedAssetsGroup.remove(o);
        placedObjects.splice(placedObjects.indexOf(o), 1);
      });
      try { selectAssetObject(null); updateOutlinerUI(); } catch (e) { /* ignore */ }
    }
    try { await dbDelete(id); } catch (e) { say(`⚠️ [내 OBJ] 브라우저 저장소에서 지우지 못함: ${e.message}`); }
    unregister(id);
    refreshDrawer();
    say(`🗑 [내 OBJ] '${rec ? rec.title : id}' 삭제${placed.length ? ` (배치된 ${placed.length}개도 제거)` : ''}`);
  }

  function openFilePicker() {
    let input = document.getElementById('user-obj-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'user-obj-file-input';
      input.accept = '.obj,.mtl';
      input.multiple = true;
      input.style.display = 'none';
      input.addEventListener('change', () => { handleFiles(input.files, null); input.value = ''; });
      document.body.appendChild(input);
    }
    input.click();
  }

  // ------------------------------------------------------------------ start: load saved models, then run queued spawns
  function finishLoading() {
    ready = true;
    refreshDrawer();
    const queued = pendingSpawns.splice(0);
    queued.forEach(a => spawnAssetInstance.apply(null, a));
    if (queued.length) { try { updateOutlinerUI(); } catch (e) { /* ignore */ } }
  }
  dbGetAll()
    .then(list => {
      (list || []).forEach(rec => { if (rec && rec.id && rec.objText && rec.placement) register(rec); });
      if (list && list.length) say(`📥 [내 OBJ] 저장된 모델 ${list.length}개를 콘텐츠 드로어에 불러옴`);
    })
    .catch(e => say(`⚠️ [내 OBJ] 브라우저 저장소를 열지 못함(${e.message}) — 가져온 OBJ는 이번 화면에서만 유지됩니다.`))
    .then(finishLoading);

  window.UserAssets = {
    buildGroup, deferSpawn, handleFiles, decorateCard, openFilePicker, removeAsset,
    isReady: () => ready, count: () => records.size, CATEGORY
  };
})();
