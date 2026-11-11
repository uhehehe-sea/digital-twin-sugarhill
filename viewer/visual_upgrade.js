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
 *   window.twinVisual = { render(), setQuality('auto'|'high'|'balanced'|'basic'), quality, tier, status }
 */
// editor_v2.js builds the scene in window.onload (init3D); this handler is registered later, so it runs after it.
window.addEventListener('load', function () {
  'use strict';
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene || !renderer) return;
  const KEY = 'twin.visual.v2';   // v2: auto | high | balanced | basic
  const status = { hdri: 'pending', surfaces: {}, uvMeshes: 0, ao: false, revision: window.THREE_REVISION };
  // Quality: what the user chose ('auto' unless they picked one) and the tier actually running.
  //   high      ambient occlusion (full res) + bloom + SMAA            — discrete GPUs
  //   balanced  ambient occlusion at half resolution, fewer samples    — integrated graphics (Intel UHD / Iris)
  //   basic     direct render (lights, shadows and textures only)
  // 'auto' starts from the GPU name and steps down if frames take longer than SLOW_MS.
  const TIERS = ['high', 'balanced', 'basic'], SLOW_MS = 50;
  let quality = 'auto', tier = 'high';
  try { const q = localStorage.getItem(KEY); if (q === 'auto' || TIERS.includes(q)) quality = q; } catch (e) { /* storage blocked */ }
  function gpuName() {
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { return ''; }
  }
  const GPU = gpuName(), INTEGRATED = /Intel|UHD|Iris|HD Graphics|SwiftShader|llvmpipe|Basic Render/i.test(GPU) && !/Arc/i.test(GPU);
  status.gpu = GPU;

  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ------------------------------------------------------------------ 1. lighting
  function applyLook() {
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    // a textured, opaque floor replaces the old see-through floor + mirror plane underneath
    if (status.floorOpaque && typeof floorReflector !== 'undefined' && floorReflector) floorReflector.visible = false;
  }
  const EXPOSURE = 1.2;
  const FILL = { HemisphereLight: 0, DirectionalLight: 0.55, PointLight: 0.06 };   // the old artistic fill lights are replaced by fixture lights + captured interior light
  function dimLegacyLights() {
    scene.traverse(o => {
      if (!o.isLight || o.userData.visualDimmed) return;
      const k = FILL[o.type];
      if (k === undefined || o.userData.keepIntensity) return;
      o.userData.visualDimmed = true; o.userData.legacyIntensity = o.intensity;
      o.intensity *= k;
    });
  }
  // ------------------------------------------------------------------ 1b. shadows
  /**
   * Indoor shadows. The original sun sat outside and above the building while the roof and walls
   * cast shadows, so the whole interior was inside the roof's shadow and nothing showed.
   * Now: one shadow light just under the roof structure, aimed down at a slight angle (like the
   * high-bay lamps), its shadow box fitted to the building footprint. Roof, cladding and ceiling
   * fixtures do not cast. Units are mm, so biases are in mm too.
   */
  const SHADOW = { height: 5600, lean: [3600, -2500], mapSize: INTEGRATED ? 2048 : 4096, strength: 2.6, radius: 4, everyMs: 200 };
  function setupShadows() {
    if (typeof factoryMeshGroup === 'undefined' || !factoryMeshGroup) return false;
    const box = new THREE.Box3().setFromObject(factoryMeshGroup);
    if (box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    let sun = null;
    scene.traverse(o => {
      if (o.isDirectionalLight && o.castShadow && !sun) sun = o;
      else if (o.isPointLight && o.castShadow) o.castShadow = false;       // one clear shadow source; point-light cube shadows cost 6 passes
    });
    if (!sun) return false;
    sun.position.set(c.x + SHADOW.lean[0], c.y + SHADOW.lean[1], SHADOW.height);
    sun.target.position.set(c.x, c.y, 0);
    if (!sun.target.parent) scene.add(sun.target);
    const cam = sun.shadow.camera, pad = 1500;
    cam.left = -size.x / 2 - pad; cam.right = size.x / 2 + pad; cam.top = size.y / 2 + pad; cam.bottom = -size.y / 2 - pad;
    // depth range along the (leaning) light direction must cover the whole footprint, floor to light height
    const dir = new THREE.Vector3(-SHADOW.lean[0], -SHADOW.lean[1], -SHADOW.height).normalize(), q = new THREE.Vector3();
    let dMin = Infinity, dMax = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [0, SHADOW.height]) {
      const d = q.set(x, y, z).sub(sun.position).dot(dir); if (d < dMin) dMin = d; if (d > dMax) dMax = d;
    }
    cam.near = dMin - 500; cam.far = dMax + 500;
    cam.updateProjectionMatrix();
    sun.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 18; sun.shadow.radius = SHADOW.radius;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }      // rebuild at the new size
    sun.intensity = SHADOW.strength; sun.userData.visualDimmed = true;            // direct light strong enough for shadows to read against the HDRI fill
    // what must not cast: outer skin, roof structure, ceiling fixtures, floor markings
    const NO_CAST = /^(Wall_|Roof_|LinerPanel_|Girt_|HighBay_|Ceiling_|Shutter_Fan|WallVent_|SafetyLine_|Joint_|Floor_Slab|Entry_Floor_Mat|Window_|Main_Glass)/;
    let casters = 0;
    factoryMeshGroup.traverse(o => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      if (o.userData.baked) { o.castShadow = false; o.receiveShadow = false; return; }   // its shadows are in the lightmap
      if (NO_CAST.test(o.name) || (o.material && o.material.transparent && o.material.opacity < 0.9)) o.castShadow = false;
      else if (o.name) { o.castShadow = true; casters++; }
    });
    // The shadow pass is a second full render of the scene: refresh it a few times a second instead of every frame
    // (machines move slowly; render() requests the refresh).
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    status.shadows = { casters, mapSize: SHADOW.mapSize, lightZ: SHADOW.height };
    return true;
  }

  // ------------------------------------------------------------------ 1c. fixtures + interior light capture
  /**
   * What Unreal / Twinmotion / Blender interiors have in common (docs/LIGHTING_NOTES.md):
   *   • light comes from the real fixtures — an area light at every ceiling lamp, and the lamp itself glows
   *   • bounced light fills the room, and reflections show the ROOM, not an outdoor sky
   *   • exposure is fixed by hand, with a filmic tone curve
   * Here: one RectAreaLight per HighBay_LED fixture (sized from the fixture mesh), then the lit
   * interior is rendered into a cube map from the middle of the hall and used as the environment
   * (ambient light + reflections). Two passes, so the second capture already contains light
   * bounced once off floor and walls — a cheap stand-in for global illumination, like Unreal's
   * sky-light / reflection captures. Static: call twinVisual.recapture() after big layout changes.
   */
  const FIXTURE = { color: 0xfff1df, irradiance: 0.6, emissive: 5 };   // irradiance = light arriving on the floor right under one lamp; colour is overridden by manifest.lighting.fixtureColor
  let hdrTex = null;
  const MAX_AREA_LIGHTS = INTEGRATED ? 6 : 12;
  function setupFixtures() {
    const box = new THREE.Box3(), size = new THREE.Vector3(), c = new THREE.Vector3();
    let n = 0, lights = 0;
    // Every fixture glows, but area lights are costly per pixel: at most MAX_AREA_LIGHTS of them, spread evenly,
    // each one brighter by the same factor so the total light in the hall stays the same.
    const all = [];
    factoryMeshGroup.traverse(o => { if (o.isMesh && /^HighBay_LED_/.test(o.name) && !o.userData.fixtureLit) all.push(o); });
    const every = Math.max(1, Math.ceil(all.length / MAX_AREA_LIGHTS));
    all.forEach((o, idx) => {
      o.userData.fixtureLit = true;
      o.material = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, emissive: FIXTURE.color, emissiveIntensity: FIXTURE.emissive, roughness: 0.5 });
      o.castShadow = false;
      box.setFromObject(o); box.getSize(size); box.getCenter(c);
      const w = Math.max(size.x, 150), h = Math.max(size.y, 150), d = box.min.z;
      n++;
      if (status.baked || (idx + Math.floor(idx / 7)) % every !== 0) return;   // baked lighting already contains every fixture       // staggered pick so lit fixtures do not line up in one row
      lights++;
      // RectAreaLight intensity is luminance; irradiance straight below = L · area / distance² (unit-free ratio, so mm are fine)
      const light = new THREE.RectAreaLight(FIXTURE.color, FIXTURE.irradiance * every * d * d / (w * h), w, h);
      light.position.set(c.x, c.y, box.min.z - 15);
      light.lookAt(c.x, c.y, 0);
      light.userData.keepIntensity = true; light.name = 'FixtureLight_' + o.name;
      scene.add(light);
    });
    status.fixtures = n; status.areaLights = lights;
    return n;
  }

  function captureInterior(passes) {
    if (typeof factoryMeshGroup === 'undefined' || !factoryMeshGroup) return false;
    const box = new THREE.Box3().setFromObject(factoryMeshGroup);
    if (box.isEmpty()) return false;
    const c = box.getCenter(new THREE.Vector3());
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(150, 90000, rt);
    cubeCam.position.set(c.x, c.y, Math.min(2400, box.max.z * 0.35));          // standing height in the middle of the hall
    scene.add(cubeCam);
    const prev = { bg: scene.background, rot: scene.backgroundRotation.clone(), fog: scene.fog };
    const hidden = [];
    scene.traverse(o => {                                                     // editor helpers must not end up in the lighting
      if (o.visible && (o.isTransformControlsRoot || o.isLine || o.isPoints || o.isSprite || o.userData.isCadEdge || o.isBoxHelper || o.isGridHelper)) { o.visible = false; hidden.push(o); }
    });
    if (hdrTex) { scene.background = hdrTex; scene.backgroundRotation.set(Math.PI / 2, 0, 0); }   // the outside, seen through door openings
    const shellWas = shellApplied; setShellOpacity(1);                                             // light bounces off the real roof liner and walls
    scene.fog = null;
    const pm = new THREE.PMREMGenerator(renderer);
    try {
      for (let i = 0; i < (passes || 1); i++) {
        cubeCam.update(renderer, scene);
        const env = pm.fromCubemap(rt.texture).texture;
        env.userData.interior = true;
        const old = scene.environment;
        scene.environment = env;
        scene.environmentRotation.set(0, 0, 0);
        scene.environmentIntensity = status.baked ? BAKED.objectEnv : 0.5;      // captured light is fill; direct light must dominate or shadows wash out
        if (old && old.userData.interior) old.dispose();
      }
      status.interiorCapture = { passes: passes || 1, at: [Math.round(cubeCam.position.x), Math.round(cubeCam.position.y), Math.round(cubeCam.position.z)] };
    } finally {
      for (const o of hidden) o.visible = true;
      shellApplied = -1;                                                                           // updateShell() restores the right value next frame
      scene.background = prev.bg; scene.backgroundRotation.copy(prev.rot); scene.fog = prev.fog;
      scene.remove(cubeCam); rt.dispose(); pm.dispose();
    }
    if (typeof log === 'function') log('💡 [비주얼] 등기구 조명 ' + (status.fixtures || 0) + '개 + 실내 반사·간접광 캡처 완료');
    return true;
  }

  function loadHdri(file) {
    new THREE.HDRLoader().load('../assets/' + file, hdr => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      hdrTex = hdr;
      if (!scene.environment || !scene.environment.userData.interior) {
        scene.environment = env;
        scene.environmentRotation.set(Math.PI / 2, 0, 0);   // HDRIs are Y-up, this scene is Z-up
        scene.environmentIntensity = 0.8;
      }
      if (status.uvMeshes) setTimeout(() => captureInterior(2), 200);
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
      texLoader.load(`../assets/surfaces/${name}/${file}`, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(t);
      }, undefined, () => resolve(null));
    });
    return Promise.all([tex('diff.jpg', true), tex('nor.jpg', false), tex('arm.jpg', false)]).then(([diff, nor, arm]) => (diff ? { diff, nor, arm } : null));
  }

  /** A slot with "paint" instead of "set": plain painted surface (matte steel, drywall, insulation facing). */
  function applyPaint(mesh, slot) {
    const old = mesh.material;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(slot.paint), roughness: slot.roughness === undefined ? 0.7 : slot.roughness, metalness: slot.metalness || 0,
      envMapIntensity: slot.envMapIntensity === undefined ? 1 : slot.envMapIntensity,
      transparent: !!(old && old.transparent), opacity: old && old.opacity !== undefined ? old.opacity : 1,
      side: old ? old.side : THREE.FrontSide, depthWrite: old ? old.depthWrite : true
    });
    mat.name = 'surface:paint:' + slot.id;
    mesh.material = mat;
    mesh.userData.surfaceSlot = 'paint:' + slot.id;
    return true;
  }

  function applySlot(mesh, slot, set) {
    if (!generateBoxUVs(mesh, slot.tileM || 2)) return false;
    if (slot.rotate && !set.rotated) { set.rotated = true; for (const t of [set.diff, set.nor, set.arm]) if (t) { t.rotation = Math.PI / 2; t.needsUpdate = true; } }   // e.g. wall ribs that must run vertically
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
    if (slot.brightness) mat.color.multiplyScalar(slot.brightness);   // texture darker/lighter than the real surface
    mat.name = 'surface:' + slot.set;
    mesh.material = mat;
    mesh.userData.surfaceSlot = slot.set;
    if (slot.opaque && /^Floor_Slab/.test(mesh.name)) { status.floorOpaque = true; mesh.receiveShadow = true; }
    return true;
  }

  // ------------------------------------------------------------------ 2a. decals: wear marks lying on the floor
  /**
   * manifest.decals: [{ set, at: [xM, yM], sizeM: [length, width], rotDeg, strength }]. Each is a thin see-through
   * plane just above the floor that only darkens what is under it (unlit, so it follows the baked light).
   * 'set' is a folder with mask.jpg (white = mark). Missing files: the decal is skipped.
   */
  function applyDecals(manifest) {
    const list = manifest.decals || [], masks = {};
    let n = 0;
    list.forEach((d, i) => {
      if (!masks[d.set]) masks[d.set] = new Promise(res => texLoader.load('../assets/surfaces/' + d.set + '/mask.jpg', t => { t.anisotropy = maxAniso; res(t); }, undefined, () => res(null)));
      masks[d.set].then(mask => {
        if (!mask) return;
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color || '#1b1a18'), alphaMap: mask, transparent: true, opacity: d.strength === undefined ? 0.55 : d.strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.sizeM[0] * 1000, d.sizeM[1] * 1000), mat);
        mesh.position.set(d.at[0] * 1000, d.at[1] * 1000, 2.5); mesh.rotation.z = (d.rotDeg || 0) * Math.PI / 180;
        mesh.name = 'Decal_' + d.set + '_' + (i + 1); mesh.renderOrder = 1; mesh.raycast = function () {};
        scene.add(mesh); status.decals = ++n;
      });
    });
  }

  async function applySurfaces(manifest) {
    const slots = Object.entries(manifest.slots || {}).map(([id, s]) => Object.assign({ id, re: new RegExp(s.match) }, s));
    const sets = {};
    await Promise.all([...new Set(slots.flatMap(s => [s.set, s.fallback]).filter(Boolean))].map(async n => { sets[n] = await loadSet(n); status.surfaces[n] = sets[n] ? 'loaded' : 'missing'; }));
    let n = 0;
    factoryMeshGroup.traverse(o => {
      if (!o.isMesh || !o.name || o.userData.surfaceSlot) return;
      const slot = slots.find(s => s.re.test(o.name));
      if (!slot) return;
      const set = sets[slot.set] || sets[slot.fallback];          // preferred set (e.g. Megascans, not in git) → fallback set → plain paint
      if (set ? applySlot(o, slot, set) : (slot.paint && applyPaint(o, slot))) n++;
    });
    status.uvMeshes = n;
    applyDecals(manifest);
    applyLook();
    if (await applyLightmap()) { SHADOW.strength = BAKED.sun; SHADOW.lean = BAKED.lean; FILL.DirectionalLight = 0; FILL.PointLight = 0; scene.traverse(o => { if (o.isLight && o.userData.visualDimmed && !o.castShadow && o.userData.legacyIntensity !== undefined && FILL[o.type] !== undefined) o.intensity = 0; }); }
    setupShadows();
    setupFixtures();
    setTimeout(() => captureInterior(2), 400);      // after the first frames, so shadow maps and textures are on the GPU
    if (typeof log === 'function') log(`🧱 [비주얼] 건물 부재 ${n}개에 UV 생성 + 표면 텍스처 적용 (${Object.keys(sets).filter(k => sets[k]).join(', ')})`);
  }

  // ------------------------------------------------------------------ 2b. baked lighting (tools/bake_lightmap.mjs)
  /**
   * The building's light (every fixture, soft shadows, two bounces, door daylight) is precomputed into one
   * texture. With it the real-time area lights are not needed at all: the building is lit by the bake, and
   * machines / placed objects by the captured interior plus one straight-down shadow light.
   * A part whose vertex count differs from the bake (model regenerated without re-baking) keeps real-time light.
   */
  const BAKED = { gain: 0.9,sun: 2.0, lean: [2600, -1900], objectEnv: 1.0, shadowOpacity: 0.5 };
  /** Baked surfaces take their diffuse light from the lightmap only (it already holds lamps, bounces and daylight); reflections still come from the room capture. */
  function bakedOnly(m) {
    if (m.userData.bakedPatched) return;
    m.userData.bakedPatched = true;
    const NL = String.fromCharCode(10);
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_fragment_maps>', ['#include <lights_fragment_maps>', '#if defined( RE_IndirectDiffuse )', 'iblIrradiance = vec3( 0.0 );', '#endif'].join(NL))
        .replace('#include <lights_fragment_end>', ['#include <lights_fragment_end>', 'reflectedLight.directDiffuse = vec3( 0.0 );', 'reflectedLight.directSpecular *= 0.25;'].join(NL));
    };
    m.customProgramCacheKey = () => 'baked-only';
  }
  /** Machines and placed objects still need shadows on the baked floor: an invisible plane that only shows shadow. */
  function addShadowCatcher() {
    const box = new THREE.Box3().setFromObject(factoryMeshGroup), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sz.x, sz.y), new THREE.ShadowMaterial({ opacity: BAKED.shadowOpacity, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mesh.position.set(c.x, c.y, 3); mesh.receiveShadow = true; mesh.name = 'Baked_Shadow_Catcher'; mesh.renderOrder = 2;
    mesh.raycast = function () {};                       // never selectable
    scene.add(mesh);
  }
  async function applyLightmap() {
    try {
      const meta = await fetch('../assets/lightmap/lightmap.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
      if (!meta || !meta.parts) return false;
      const v = '?v=' + encodeURIComponent(meta.generatedAt || '');
      const uv = new Float32Array(await fetch('../assets/lightmap/lightmap_uv.bin' + v).then(r => r.arrayBuffer()));
      const tex = await new Promise((res, rej) => texLoader.load('../assets/lightmap/lightmap.png' + v, res, undefined, rej));
      tex.colorSpace = THREE.SRGBColorSpace; tex.channel = 1;
      tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;   // mipmaps would bleed between charts
      let n = 0, skipped = 0;
      factoryMeshGroup.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
        const e = meta.parts[o.name], pos = o.geometry.attributes.position;
        if (!e) return;
        if (!pos || pos.count !== e[1] || o.geometry.index) { skipped++; return; }
        o.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv.subarray(e[0], e[0] + e[1] * 2), 2));
        const m = o.material;
        m.lightMap = tex; m.lightMapIntensity = meta.maxE * BAKED.gain;
        if (m.isMeshStandardMaterial) bakedOnly(m);
        m.needsUpdate = true; o.userData.baked = true; n++;
      });
      if (n) addShadowCatcher();
      status.baked = { parts: n, skipped, size: meta.size, texelMm: meta.texelMm, bounces: meta.bounces, at: meta.generatedAt };
      if (typeof log === 'function') log('🔥 [비주얼] 구운 조명(라이트맵) 적용: 부재 ' + n + '개, ' + meta.size[0] + '×' + meta.size[1] + ' px, 반사 ' + meta.bounces + '회');
      return n > 0;
    } catch (e) { console.warn('[visual] no baked lighting:', e); return false; }
  }

  // ------------------------------------------------------------------ 3. ambient occlusion + AA
  let composerHQ = null, gtao = null;
  function buildComposer(t) {
    const lite = t !== 'high';
    const size = renderer.getSize(new THREE.Vector2());
    const c = new THREE.EffectComposer(renderer);
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(size.x, size.y);
    c.addPass(new THREE.RenderPass(scene, camera));
    gtao = new THREE.GTAOPass(scene, camera, size.x, size.y);
    if (lite) {                                    // occlusion is soft: half resolution is hard to tell apart and costs a quarter
      const full = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => full(Math.max(2, Math.ceil(w / 2)), Math.max(2, Math.ceil(h / 2)));
      gtao.setSize(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
    }
    gtao.updateGtaoMaterial({ radius: 450, distanceExponent: 1.2, thickness: 1.2, scale: 1.15, samples: lite ? 8 : 12, screenSpaceRadius: false });   // scene units are mm
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: lite ? 8 : 12 });
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
    // only light sources (the glowing fixtures) exceed the threshold in this HDR buffer
    if (!lite) c.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.55, 1.4));
    c.addPass(new THREE.OutputPass());
    if (!lite) c.addPass(new THREE.SMAAPass(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio()));
    return c;
  }

  // ------------------------------------------------------------------ 4. shell: solid from inside, see-through from outside
  /**
   * The outer skin (walls, roof) is see-through so the overview from outside shows the interior.
   * From inside that made the white roof liner and cream walls look dark (the background shows
   * through). Rule: camera inside the building → skin opaque; outside → the 외벽 투명도 slider value.
   */
  let shellBox = null, shellApplied = -1;
  function setShellOpacity(v) {
    if (typeof exteriorCladdingMeshes === 'undefined') return;
    exteriorCladdingMeshes.forEach(m => {
      if (!m || !m.material) return;
      m.material.transparent = v < 0.98; m.material.opacity = v; m.material.depthWrite = v > 0.55; m.material.needsUpdate = true;
    });
    shellApplied = v;
  }
  function updateShell() {
    if (typeof factoryMeshGroup === 'undefined' || !factoryMeshGroup || typeof exteriorWallOpacity === 'undefined') return;
    if (!shellBox) { const b = new THREE.Box3().setFromObject(factoryMeshGroup); if (b.isEmpty()) return; shellBox = b; }
    const p = camera.position, inside = p.x > shellBox.min.x && p.x < shellBox.max.x && p.y > shellBox.min.y && p.y < shellBox.max.y && p.z < shellBox.max.z;
    const want = inside ? 1 : exteriorWallOpacity;
    if (Math.abs(want - shellApplied) > 1e-3) { setShellOpacity(want); status.shell = inside ? 'inside: opaque' : 'outside: ' + Math.round(want * 100) + '%'; }
  }

  const _size = new THREE.Vector2();
  const TIER_KO = { high: '높음', balanced: '균형', basic: '기본' };
  let composerTier = null, lastShadow = 0, lastFrame = 0, emaMs = 0, framesInTier = 0;
  function useTier(t, why) {
    tier = t; framesInTier = 0; emaMs = 0; status.tier = t; status.tierReason = why;
    if (composerHQ) { if (composerHQ.dispose) composerHQ.dispose(); composerHQ = null; composerTier = null; }
    const sel = document.getElementById('sel-visual-quality');
    if (sel) { sel.value = quality; const o = sel.querySelector('option[value="auto"]'); if (o) o.textContent = '자동 (' + TIER_KO[t] + ')'; }
  }
  function render() {
    updateShell();
    const now = performance.now();
    if (now - lastShadow > SHADOW.everyMs) { renderer.shadowMap.needsUpdate = true; lastShadow = now; }
    // auto: step down one tier when frames stay slow (never back up on its own: avoids flip-flopping)
    if (lastFrame) {
      const dt = Math.min(250, now - lastFrame); emaMs = emaMs ? emaMs * 0.95 + dt * 0.05 : dt; framesInTier++;
      if (quality === 'auto' && framesInTier > 90 && emaMs > SLOW_MS && tier !== 'basic' && !document.hidden) {
        const next = TIERS[TIERS.indexOf(tier) + 1];
        if (typeof log === 'function') log('🎚️ [비주얼] 화면이 느려(' + Math.round(emaMs) + ' ms/프레임) 화질을 ' + TIER_KO[next] + ' 단계로 낮췄습니다. 보기 ▾ → 화질에서 바꿀 수 있습니다.');
        useTier(next, 'auto: ' + Math.round(emaMs) + ' ms/frame');
      }
    }
    lastFrame = now; status.frameMs = Math.round(emaMs);
    if (tier === 'basic') return renderer.render(scene, camera);
    if (!composerHQ || composerTier !== tier) {
      try { composerHQ = buildComposer(tier); composerTier = tier; status.ao = true; }
      catch (e) { console.warn('[visual] AO unavailable, basic rendering:', e); useTier('basic', 'post-processing failed'); return renderer.render(scene, camera); }
    }
    renderer.getSize(_size);
    if (composerHQ._w !== _size.x || composerHQ._h !== _size.y) { composerHQ.setSize(_size.x, _size.y); composerHQ._w = _size.x; composerHQ._h = _size.y; }
    composerHQ.render();
  }

  function setQuality(q) {
    quality = q === 'auto' || TIERS.includes(q) ? q : 'auto';
    try { localStorage.setItem(KEY, quality); } catch (e) { /* session only */ }
    useTier(quality === 'auto' ? (INTEGRATED ? 'balanced' : 'high') : quality, quality === 'auto' ? 'auto: ' + (INTEGRATED ? 'integrated graphics' : 'discrete GPU') : 'chosen');
  }

  // the shading presets set their own exposure; keep the new look after a preset change
  if (typeof window.switchViewportPreset === 'function') {
    const orig = window.switchViewportPreset;
    window.switchViewportPreset = function (p) { const r = orig.apply(this, arguments); if (scene.environment && status.hdri !== 'missing' && status.hdri !== 'pending') applyLook(); return r; };
  }

  window.twinVisual = { render, setQuality, recapture: () => captureInterior(2), get quality() { return quality; }, get tier() { return tier; }, status };
  document.addEventListener('change', e => { if (e.target && e.target.id === 'sel-visual-quality') setQuality(e.target.value); });
  setQuality(quality);

  fetch('../assets/surfaces/manifest.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(manifest => {
    if (!manifest) { status.hdri = 'no manifest'; return; }
    if (manifest.lighting) {
      if (manifest.lighting.fixtureColor) FIXTURE.color = new THREE.Color(manifest.lighting.fixtureColor).getHex();
      if (manifest.lighting.fixtureIrradiance) FIXTURE.irradiance = manifest.lighting.fixtureIrradiance;
    }
    if (manifest.hdri) loadHdri(manifest.hdri);
    // the building arrives asynchronously (OBJ); wait until its parts are registered
    const wait = setInterval(() => {
      if (typeof buildingOriginals === 'undefined' || !buildingOriginals.size || !factoryMeshGroup) return;
      clearInterval(wait);
      applySurfaces(manifest).catch(e => console.warn('[visual] surfaces failed:', e));
    }, 300);
  }).catch(() => { status.hdri = 'no manifest'; });
});
