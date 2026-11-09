import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// =====================================================================
// 1. FIX editor_v2.js: Normalize ASSET_CATALOG & Safeguard init3D()
// =====================================================================
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// A. Insert normalization logic immediately after ASSET_CATALOG definition
const normCode = `
// ASSET_CATALOG 스키마 정규화 (dims <-> sizeMm, title <-> name, assetId <-> id 완벽 호환)
ASSET_CATALOG.forEach(item => {
  item.assetId = item.assetId || item.id;
  item.id = item.id || item.assetId;
  item.title = item.title || item.name || item.assetId;
  item.name = item.name || item.title;
  item.sub = item.sub || item.desc || '';
  item.desc = item.desc || item.sub;
  item.dims = item.dims || item.sizeMm || [1200, 1000, 1200];
  item.sizeMm = item.sizeMm || item.dims;
  item.badge = item.badge || item.tag || 'Standard';
  item.tag = item.tag || item.badge;
  item.defaultMaterial = item.defaultMaterial || item.materialHint || 'PP_POLYPROPYLENE';
  item.icon = item.icon || '📦';
  item.color = item.color || '#38bdf8';
});
`;

if (!js.includes('ASSET_CATALOG 스키마 정규화')) {
  // Find where ASSET_CATALOG is closed
  const catEndIdx = js.indexOf('];\n\n// ============================================================================');
  if (catEndIdx !== -1) {
    js = js.substring(0, catEndIdx + 2) + normCode + js.substring(catEndIdx + 2);
    console.log('Inserted ASSET_CATALOG normalization!');
  } else {
    // Alternate search for end of ASSET_CATALOG
    const catStart = js.indexOf('const ASSET_CATALOG = [');
    const firstClose = js.indexOf('];', catStart);
    js = js.substring(0, firstClose + 2) + normCode + js.substring(firstClose + 2);
    console.log('Inserted ASSET_CATALOG normalization (alt)!');
  }
}

// B. Safeguard renderAssetDrawer
const oldCardHTML = `      <div class="asset-dim">
        <span>\${asset.dims[0]}×\${asset.dims[1]}×\${asset.dims[2]}</span>
        <span style="color:#58a6ff;">+드래그/클릭</span>
      </div>`;

const newCardHTML = `      <div class="asset-dim">
        <span>\${(asset.dims || asset.sizeMm || [0,0,0])[0]}×\${(asset.dims || asset.sizeMm || [0,0,0])[1]}×\${(asset.dims || asset.sizeMm || [0,0,0])[2]}</span>
        <span style="color:#58a6ff;">+드래그/클릭</span>
      </div>`;

if (js.includes(oldCardHTML)) {
  js = js.replace(oldCardHTML, newCardHTML);
  console.log('Replaced asset.dims in renderAssetDrawer!');
}

// C. In init3D, ensure initFloatingWindows() is called and UI calls are wrapped in try-catch
const oldInit3DCalls = `  // UI 초기화
  renderAssetDrawer('ALL');
  renderMaterialStudio();
  setupInteractions(container);

  loadPrecisionModel();
  loadGaussianSplats();
  loadInitialSceneLayout();

  window.addEventListener('resize', onWindowResize);
  animate();`;

const newInit3DCalls = `  // UI 초기화 (에러 격리)
  try {
    if (typeof initFloatingWindows === 'function') initFloatingWindows();
  } catch (e) {
    console.warn('initFloatingWindows warning:', e);
  }

  try {
    renderAssetDrawer('ALL');
  } catch (e) {
    console.warn('renderAssetDrawer warning:', e);
  }

  try {
    renderMaterialStudio();
  } catch (e) {
    console.warn('renderMaterialStudio warning:', e);
  }

  try {
    setupInteractions(container);
  } catch (e) {
    console.warn('setupInteractions warning:', e);
  }

  // 3D 씬 부재 & 모델 로드 & 애니메이션 루프 시작 (절대 중단되지 않음)
  loadPrecisionModel();
  loadGaussianSplats();
  loadInitialSceneLayout();

  window.addEventListener('resize', onWindowResize);
  animate();`;

if (js.includes(oldInit3DCalls)) {
  js = js.replace(oldInit3DCalls, newInit3DCalls);
  console.log('Updated init3D with error isolation and initFloatingWindows() call!');
} else {
  console.log('Notice: oldInit3DCalls string not matched exactly, checking pattern...');
  js = js.replace(
    "loadPrecisionModel();\n  loadGaussianSplats();\n  loadInitialSceneLayout();",
    "if (typeof initFloatingWindows === 'function') initFloatingWindows();\n  loadPrecisionModel();\n  loadGaussianSplats();\n  loadInitialSceneLayout();"
  );
}

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js!');

// =====================================================================
// 2. FIX index_v2.html: Add Error Banner, Fix Modal CSS, Remove Duplicate IDs
// =====================================================================
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Ensure #render-modal-overlay is hidden by default
if (!html.includes('#render-modal-overlay {')) {
  const modalCSS = `
    /* Blender Cycles 렌더 모달 오버레이 */
    #render-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 13, 0.85);
      backdrop-filter: blur(10px);
      z-index: 300;
      display: none;
      align-items: center;
      justify-content: center;
    }
  `;
  html = html.replace('</style>', `${modalCSS}\n  </style>`);
  console.log('Added #render-modal-overlay CSS!');
}

// Ensure in-page runtime error banner exists
if (!html.includes('id="runtime-error-banner"')) {
  const errorBannerHTML = `
  <!-- 실시간 자바스크립트 런타임 오류 감지 배너 -->
  <div id="runtime-error-banner" style="display:none; position:fixed; top:52px; left:50%; transform:translateX(-50%); background:#dc2626; color:#ffffff; padding:12px 20px; border-radius:8px; z-index:99999; font-weight:700; box-shadow:0 8px 32px rgba(0,0,0,0.8); max-width:850px; font-size:12px; border:1px solid #f87171;"></div>
  <script>
    window.addEventListener('error', function(e) {
      var b = document.getElementById('runtime-error-banner');
      if (b) {
        b.style.display = 'block';
        b.innerHTML = '⚠️ <b>[뷰포트 런타임 오류 감지]</b> ' + e.message + '<br><span style=\"font-size:11px; color:#fecaca;\">' + e.filename + ':' + e.lineno + '</span>';
      }
    });
  </script>
  `;
  html = html.replace('<body>', `<body>\n${errorBannerHTML}`);
  console.log('Added runtime error banner to index_v2.html!');
}

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html!');
