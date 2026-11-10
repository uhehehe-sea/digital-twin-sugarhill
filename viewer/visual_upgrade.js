/*
 * visual_upgrade.js — the look of the /v2 scene (2026-11-09 plan, section 3 A-2 … A-5).
 *
 *   1. Lighting   a real HDRI (assets/hdri/…) as image-based light, AgX tone mapping.
 *                 The old fill lights were tuned for a painted dark dome and are turned down.
 *   2. Surfaces   the building OBJ has no UV coordinates, so textures could never be applied.
 *                 UVs are generated here by box projection in real-world metres, then each part
 *                 gets a tiling PBR texture set chosen by its name (assets/surfaces/manifest.json).
 *   3. Depth      ambient occlusion (GTAO) so contact areas darken like a baked scene, + SMAA.
 *
 *   Everything is data-driven: to swap in Megascans (or any other) surfaces, drop a folder with
 *   diff.jpg / nor.jpg / arm.jpg into assets/surfaces/ and point a slot at it in manifest.json.
 *   Missing files leave the previous material untouched — the viewer never fails on assets.
 *
 *   window.twinVisual = { render(), setQuality('high'|'basic'), quality, status }
 */
// editor_v2.js builds the scene in window.onload (init3D); this handler is registered later, so it runs after it.
window.addEventListener('load', function () {
  'use strict';
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene || !renderer) return;
  const KEY = 'twin.visual.v1';
  const status = { hdri: 'pending', surfaces: {}, uvMeshes: 0, ao: false, revision: window.THREE_REVISION };
  let quality = 'high';
  try { quality = localStorage.getItem(KEY) === 'basic' ? 'basic' : 'high'; } catch (e) { /* storage blocked */ }

  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ------------------------------------------------------------------ 1. lighting
  function applyLook() {
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    // a textured, opaque floor replaces the old see-through floor + mirror plane underneath
    if (status.floorOpaque && typeof floorReflector !== 'undefined' && floorReflector) floorReflector.visible = false;
  }
  const EXPOSURE = 1.3;
  const FILL = { HemisphereLight: 0.18, DirectionalLight: 0.55, PointLight: 0.4 };   // share of the old intensity kept once the HDRI lights the scene
  function dimLegacyLights() {
    scene.traverse(o => {
      if (!o.isLight || o.userData.visualDimmed) return;
      const k = FILL[o.type];
      if (k === undefined || o.userData.keepIntensity) return;
      o.userData.visualDimmed = true; o.userData.legacyIntensity = o.intensity;
      o.intensity *= k;
    });
  }
  function loadHdri(file) {
    new THREE.HDRLoader().load('/assets/' + file, hdr => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); pmrem.dispose();
      scene.environment = env;
      scene.environmentIntensity = 1.0;
      dimLegacyLights();
      applyLook();
      status.hdri = file;
      if (typeof log === 'function') log(`🌤️ [비주얼] HDRI 조명 적용: ${file}`);
    }, undefined, () => { status.hdri = 'missing'; applyLook(); });
  }

  // ------------------------------------------------------------------ 2. surfaces
  /** Box-projection UVs in metres/tile from world position; needs per-vertex normals (OBJ has them). */
  function generateBoxUVs(mesh, tileM) {
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    if (!pos || !nor) return false;
    mesh.updateWorldMatrix(true, false);
    const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
    const uv = new Float32Array(pos.count * 2), p = new THREE.Vector3(), n = new THREE.Vector3(), s = 1 / (tileM * 1000);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (az >= ax && az >= ay) { uv[i * 2] = p.x * s; uv[i * 2 + 1] = p.y * s; }          // floors, roofs
      else if (ax >= ay) { uv[i * 2] = p.y * s; uv[i * 2 + 1] = p.z * s; }                 // walls facing ±X
      else { uv[i * 2] = p.x * s; uv[i * 2 + 1] = p.z * s; }                               // walls facing ±Y
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return true;
  }

  function loadSet(name) {
    const tex = (file, srgb) => new Promise(resolve => {
      texLoader.load(`/assets/surfaces/${name}/${file}`, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(t);
      }, undefined, () => resolve(null));
    });
    return Promise.all([tex('diff.jpg', true), tex('nor.jpg', false), tex('arm.jpg', false)]).then(([diff, nor, arm]) => (diff ? { diff, nor, arm } : null));
  }

  function applySlot(mesh, slot, set) {
    if (!generateBoxUVs(mesh, slot.tileM || 2)) return false;
    const old = mesh.material;
    const mat = new THREE.MeshStandardMaterial({
      color: slot.tint ? new THREE.Color(slot.tint) : (old && old.color ? old.color.clone().lerp(new THREE.Color(0xffffff), slot.lighten === undefined ? 0.5 : slot.lighten) : 0xffffff),
      map: set.diff, normalMap: set.nor || null, aoMap: set.arm || null, roughnessMap: set.arm || null,
      metalnessMap: slot.metal && set.arm ? set.arm : null,
      roughness: slot.roughness === undefined ? 1 : slot.roughness, metalness: slot.metal ? 1 : 0,
      envMapIntensity: slot.envMapIntensity === undefined ? 1 : slot.envMapIntensity,
      transparent: !slot.opaque && !!(old && old.transparent), opacity: slot.opaque ? 1 : (old && old.opacity !== undefined ? old.opacity : 1),
      side: old ? old.side : THREE.FrontSide, depthWrite: old ? old.depthWrite : true
    });
    if (set.nor) mat.normalScale.set(slot.normalScale || 1, slot.normalScale || 1);
    mat.name = 'surface:' + slot.set;
    mesh.material = mat;
    mesh.userData.surfaceSlot = slot.set;
    if (slot.opaque && /^Floor_Slab/.test(mesh.name)) { status.floorOpaque = true; mesh.receiveShadow = true; }
    return true;
  }

  async function applySurfaces(manifest) {
    const slots = Object.entries(manifest.slots || {}).map(([id, s]) => Object.assign({ id, re: new RegExp(s.match) }, s));
    const sets = {};
    await Promise.all([...new Set(slots.map(s => s.set))].map(async n => { sets[n] = await loadSet(n); status.surfaces[n] = sets[n] ? 'loaded' : 'missing'; }));
    let n = 0;
    factoryMeshGroup.traverse(o => {
      if (!o.isMesh || !o.name || o.userData.surfaceSlot) return;
      const slot = slots.find(s => s.re.test(o.name));
      if (slot && sets[slot.set] && applySlot(o, slot, sets[slot.set])) n++;
    });
    status.uvMeshes = n;
    applyLook();
    if (typeof log === 'function') log(`🧱 [비주얼] 건물 부재 ${n}개에 UV 생성 + 표면 텍스처 적용 (${Object.keys(sets).filter(k => sets[k]).join(', ')})`);
  }

  // ------------------------------------------------------------------ 3. ambient occlusion + AA
  let composerHQ = null, gtao = null;
  function buildComposer() {
    const size = renderer.getSize(new THREE.Vector2());
    const c = new THREE.EffectComposer(renderer);
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(size.x, size.y);
    c.addPass(new THREE.RenderPass(scene, camera));
    gtao = new THREE.GTAOPass(scene, camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 450, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: 12, screenSpaceRadius: false });   // scene units are mm
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 12 });
    // See-through cladding / glass, helpers and gizmos must not cast occlusion onto what is behind them.
    const hidden = [];
    gtao.overrideVisibility = function () {
      scene.traverse(o => {
        if (!o.visible) return;
        const m = o.material;
        const skip = o.isPoints || o.isLine || o.isSprite || o.isTransformControlsGizmo || o.isTransformControlsPlane ||
          (o.isMesh && m && !Array.isArray(m) && ((m.transparent && m.opacity < 0.95) || m.isShaderMaterial || m.isMeshBasicMaterial));
        if (skip) { o.visible = false; hidden.push(o); }
      });
    };
    gtao.restoreVisibility = function () { for (const o of hidden) o.visible = true; hidden.length = 0; };
    c.addPass(gtao);
    c.addPass(new THREE.OutputPass());
    c.addPass(new THREE.SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
    return c;
  }

  const _size = new THREE.Vector2();
  function render() {
    if (quality !== 'high') return renderer.render(scene, camera);
    if (!composerHQ) { try { composerHQ = buildComposer(); status.ao = true; } catch (e) { console.warn('[visual] AO unavailable, basic rendering:', e); quality = 'basic'; return renderer.render(scene, camera); } }
    renderer.getSize(_size);
    if (composerHQ._w !== _size.x || composerHQ._h !== _size.y) { composerHQ.setSize(_size.x, _size.y); composerHQ._w = _size.x; composerHQ._h = _size.y; }
    composerHQ.render();
  }

  function setQuality(q) {
    quality = q === 'basic' ? 'basic' : 'high';
    try { localStorage.setItem(KEY, quality); } catch (e) { /* session only */ }
    const cb = document.getElementById('chk-visual-hq'); if (cb) cb.checked = quality === 'high';
  }

  // the shading presets set their own exposure; keep the new look after a preset change
  if (typeof window.switchViewportPreset === 'function') {
    const orig = window.switchViewportPreset;
    window.switchViewportPreset = function (p) { const r = orig.apply(this, arguments); if (scene.environment && status.hdri !== 'missing' && status.hdri !== 'pending') applyLook(); return r; };
  }

  window.twinVisual = { render, setQuality, get quality() { return quality; }, status };
  document.addEventListener('change', e => { if (e.target && e.target.id === 'chk-visual-hq') setQuality(e.target.checked ? 'high' : 'basic'); });
  setQuality(quality);

  fetch('/assets/surfaces/manifest.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(manifest => {
    if (!manifest) { status.hdri = 'no manifest'; return; }
    if (manifest.hdri) loadHdri(manifest.hdri);
    // the building arrives asynchronously (OBJ); wait until its parts are registered
    const wait = setInterval(() => {
      if (typeof buildingOriginals === 'undefined' || !buildingOriginals.size || !factoryMeshGroup) return;
      clearInterval(wait);
      applySurfaces(manifest).catch(e => console.warn('[visual] surfaces failed:', e));
    }, 300);
  }).catch(() => { status.hdri = 'no manifest'; });
});
