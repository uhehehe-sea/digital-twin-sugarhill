/* sand3d.js — Sand3D (Hugging Face, Sandflow) browser + placer for the /v2 twin.
 *
 * Sand3D is ~106k open 3D objects (CC-BY-4.0, attribution in assets/sand3d/ATTRIBUTION.md).
 * The import pipeline (tools/sand3d_import.mjs) downloads a .usda, converts it with
 * Blender to a standard Y-up GLB, and registers it in assets/sand3d/catalog.json.
 *
 * This module:
 *   - loads the catalog (a static file, so it works on GitHub Pages too),
 *   - renders the Sand3D modal: imported items with thumbnails + "배치" (place),
 *   - on the local server only: searches Hugging Face (/api/sand3d/search) and
 *     imports (/api/sand3d/import, runs Blender) — on Pages those buttons explain
 *     that a local server is needed.
 *   - places a GLB: GLTFLoader loads the Y-up model, the wrapper rotates it
 *     +90 deg about X (Y-up -> Z-up; the twin scene is Z-up), centres the
 *     footprint on the group origin and puts the base at Z=0, then the group
 *     joins placedAssetsGroup like any other editable asset.
 *
 * Loaded as a classic deferred script after editor_v2.js, so it uses the
 * viewer's globals (THREE, scene, placedAssetsGroup, placedObjects, controls,
 * gridSnapStep, selectAssetObject, pushUndoState, updateOutlinerUI, log).
 */
(function () {
  'use strict';

  var CATALOG_URL = '../assets/sand3d/catalog.json';
  var GLB_BASE = '../assets/sand3d/';
  var catalog = { items: [] };
  var serverProbe = null; // null = unknown, true/false after one /api/sand3d/search probe

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dimsLabel(d) {
    if (!d || d.length !== 3) return '-';
    return d.map(function (v) { return Math.round(v); }).join('×') + ' mm';
  }
  function thumbFor(item) {
    return item.thumb ? '../' + item.thumb : '';
  }

  // ---------------------------------------------------------------- catalog
  function loadCatalog() {
    return fetch(CATALOG_URL, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) { catalog = j && Array.isArray(j.items) ? j : { items: [] }; return catalog; })
      .catch(function () { catalog = { items: [] }; return catalog; });
  }

  // ---------------------------------------------------------------- placement
  function spawnSand3DAsset(entry, pos) {
    if (!entry || !entry.glb) return null;
    var loader = new THREE.GLTFLoader();
    var url = '../' + entry.glb;
    loader.load(url, function (gltf) {
      var model = gltf.scene;
      // Y-up GLB -> Z-up twin: rotate +90 deg about X (maps +Y to +Z).
      var wrap = new THREE.Group();
      model.rotation.x = Math.PI / 2;
      wrap.add(model);
      // Centre the footprint on the group origin, base at Z = 0.
      wrap.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(wrap);
      var c = box.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.y -= c.y;
      model.position.z -= box.min.z;
      wrap.updateMatrixWorld(true);

      var p = pos || [
        Math.round(controls.target.x / gridSnapStep) * gridSnapStep,
        Math.round(controls.target.y / gridSnapStep) * gridSnapStep,
        0
      ];
      wrap.position.set(p[0], p[1], p[2]);
      wrap.name = 'sand3d_' + (entry.name || entry.id).replace(/[^a-zA-Z0-9_]/g, '_');
      wrap.userData = {
        isEditableAsset: true,
        instanceId: 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        assetId: 'sand3d:' + entry.id,
        title: entry.name || entry.id,
        baseDims: entry.dims_mm ? entry.dims_mm.slice() : [0, 0, 0],
        sand3d: entry
      };
      placedAssetsGroup.add(wrap);
      placedObjects.push(wrap);
      updateOutlinerUI();
      pushUndoState();
      selectAssetObject(wrap);
      if (typeof log === 'function') log("[Sand3D] '" + wrap.name + "' 배치 완료 @ (" + p[0] + ', ' + p[1] + ', ' + p[2] + ') mm — ' + (entry.attribution || entry.license || 'CC-BY-4.0'));
    }, undefined, function (err) {
      if (typeof log === 'function') log('[Sand3D] GLB 로드 실패: ' + entry.glb + ' — ' + (err && err.message ? err.message : err));
      else console.error('[Sand3D] GLB load failed', entry.glb, err);
    });
    return true;
  }

  // ---------------------------------------------------------------- server API
  function apiSearch(q, dataset, limit) {
    var url = '/api/sand3d/search?q=' + encodeURIComponent(q)
      + '&dataset=' + encodeURIComponent(dataset || 'all')
      + '&limit=' + (limit || 10);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('search HTTP ' + r.status);
      return r.json();
    });
  }
  function apiImport(row) {
    // Send the full row the search returned (usda_path/sha/render/attribution):
    // the server then needs no lookup, which also works while HF /search is down.
    return fetch('/api/sand3d/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row: row })
    }).then(function (r) {
      if (!r.ok) throw new Error('import HTTP ' + r.status);
      return r.json();
    });
  }
  var lastSearchRows = [];
  function probeServer() {
    if (serverProbe !== null) return Promise.resolve(serverProbe);
    return apiSearch('__probe__', 'objaverse', 1)
      .then(function () { serverProbe = true; return true; })
      .catch(function () { serverProbe = false; return false; });
  }

  // ---------------------------------------------------------------- modal UI
  function cardImported(item) {
    var thumb = thumbFor(item);
    return '<div class="asset-card" style="cursor:pointer;" data-sand3d-id="' + esc(item.id) + '">'
      + (thumb ? '<div style="height:96px; overflow:hidden; border-radius:6px; margin-bottom:6px; background:#0b1220;"><img src="' + esc(thumb) + '" style="width:100%; height:100%; object-fit:cover;"></div>' : '')
      + '<div class="asset-title">' + esc(item.name) + '</div>'
      + '<div class="asset-sub">' + esc(item.family || '') + ' · ' + esc(item.dataset || '') + ' · ' + esc(item.license || 'CC-BY-4.0') + '</div>'
      + '<div class="asset-dim"><span>' + esc(dimsLabel(item.dims_mm)) + '</span>'
      + '<span style="color:#58a6ff;">+ 클릭해서 배치</span></div>'
      + '<div style="font-size:10px; color:#64748b; margin-top:4px; line-height:1.3;">' + esc(item.attribution || '') + '</div>'
      + '</div>';
  }

  function renderImported() {
    var grid = $('sand3d-imported-grid');
    if (!grid) return;
    if (!catalog.items.length) {
      grid.innerHTML = '<div style="grid-column:1/-1; color:#94a3b8; font-size:12px; padding:8px 0;">아직 가져온 에셋이 없습니다. 아래에서 검색해 가져오세요 (로컬 서버 필요).</div>';
      return;
    }
    grid.innerHTML = catalog.items.map(cardImported).join('');
    grid.querySelectorAll('[data-sand3d-id]').forEach(function (el) {
      el.addEventListener('click', function () {
        var item = catalog.items.find(function (i) { return i.id === el.getAttribute('data-sand3d-id'); });
        if (item) { spawnSand3DAsset(item); closeSand3DCatalogModal(); }
      });
    });
  }

  function renderSearchResults(rows) {
    var box = $('sand3d-search-results');
    if (!box) return;
    lastSearchRows = rows || [];
    if (!rows || !rows.length) {
      box.innerHTML = '<div style="color:#94a3b8; font-size:12px; padding:8px 0;">검색 결과가 없습니다.</div>';
      return;
    }
    box.innerHTML = rows.map(function (r) {
      var thumb = r.render && r.render.src ? r.render.src : '';
      return '<div style="display:flex; gap:10px; align-items:center; padding:8px; border:1px solid var(--border-hairline); border-radius:8px; margin-bottom:8px;">'
        + (thumb ? '<img src="' + esc(thumb) + '" style="width:64px; height:64px; object-fit:cover; border-radius:6px; background:#0b1220;">' : '<div style="width:64px; height:64px; border-radius:6px; background:#0b1220;"></div>')
        + '<div style="flex:1; min-width:0;">'
        + '<div style="font-weight:700; font-size:12px; color:#f1f5f9;">' + esc(r.entry || r.id) + '</div>'
        + '<div style="font-size:11px; color:#94a3b8;">' + esc(r.family || '') + ' · ' + esc(r.dataset || '') + ' · ' + (r.usda_bytes ? Math.round(r.usda_bytes / 1024) + ' KB' : '') + ' · f=' + (r.f_score != null ? r.f_score.toFixed(2) : '-') + '</div>'
        + '<div style="font-size:10px; color:#64748b; line-height:1.3;">' + esc(r.attribution || '') + '</div>'
        + '</div>'
        + '<button class="btn-tb active-green" style="flex:none;" data-import-id="' + esc(r.id) + '" data-import-ds="' + esc(r.dataset || 'objaverse') + '">⬇ 가져오기</button>'
        + '</div>';
    }).join('');
    box.querySelectorAll('[data-import-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = lastSearchRows.find(function (r) { return r.id === btn.getAttribute('data-import-id'); });
        if (!row) return;
        btn.disabled = true; btn.textContent = '가져오는 중…';
        apiImport(row)
          .then(function (res) {
            return loadCatalog().then(function () {
              renderImported();
              var note = $('sand3d-note');
              if (note) note.textContent = '가져옴: ' + (res.entry ? res.entry.name : btn.getAttribute('data-import-id'))
                + ' — ' + dimsLabel(res.entry ? res.entry.dims_mm : null) + '. 아래 목록에서 클릭하면 배치됩니다.';
            });
          })
          .catch(function (e) {
            btn.disabled = false; btn.textContent = '⬇ 가져오기';
            var note = $('sand3d-note');
            if (note) note.textContent = '가져오기 실패: ' + e.message;
          });
      });
    });
  }

  function openSand3DCatalogModal() {
    var modal = $('modal-sand3d');
    if (!modal) return;
    modal.style.display = 'flex';
    loadCatalog().then(function () {
      renderImported();
      var count = $('sand3d-count');
      if (count) count.textContent = catalog.items.length + '개 가져옴';
    });
    probeServer().then(function (ok) {
      var hint = $('sand3d-server-hint');
      if (hint) hint.textContent = ok
        ? '로컬 서버 연결됨 — 검색·가져오기 가능 (Blender 변환 포함).'
        : '정적 페이지(Pages)에서는 가져온 에셋 배치만 가능합니다. 검색·가져오기는 로컬 서버(npm run dev)에서만 됩니다.';
      var searchBtn = $('sand3d-search-btn');
      if (searchBtn) searchBtn.disabled = !ok;
    });
  }

  function closeSand3DCatalogModal() {
    var modal = $('modal-sand3d');
    if (modal) modal.style.display = 'none';
  }

  function onSearch() {
    var q = ($('sand3d-search-input') || {}).value || '';
    q = q.trim();
    var box = $('sand3d-search-results');
    if (!q) { if (box) box.innerHTML = ''; return; }
    if (box) box.innerHTML = '<div style="color:#94a3b8; font-size:12px; padding:8px 0;">검색 중…</div>';
    var ds = ($('sand3d-search-dataset') || {}).value || 'all';
    apiSearch(q, ds, 10)
      .then(function (res) { renderSearchResults(res.rows || []); })
      .catch(function (e) {
        if (box) box.innerHTML = '<div style="color:#f87171; font-size:12px; padding:8px 0;">검색 실패: ' + esc(e.message) + '</div>';
      });
  }

  // Wire the search controls once the DOM is ready.
  function wire() {
    var btn = $('sand3d-search-btn');
    if (btn) btn.addEventListener('click', onSearch);
    var input = $('sand3d-search-input');
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSearch(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.openSand3DCatalogModal = openSand3DCatalogModal;
  window.closeSand3DCatalogModal = closeSand3DCatalogModal;
  window.spawnSand3DAsset = spawnSand3DAsset;
  window.sand3dLoadCatalog = loadCatalog;
})();
