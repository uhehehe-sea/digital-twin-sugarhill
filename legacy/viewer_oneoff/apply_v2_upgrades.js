import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// -------------------------------------------------------------
// 1. UPDATE index_v2.html
// -------------------------------------------------------------
console.log('--- Updating index_v2.html ---');
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// A. CSS for Floating Windows & Fullscreen Viewport
const floatingCSS = `
    /* === Unreal Engine / Blender 호버링 플로팅 윈도우 시스템 === */
    #main-workspace {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    #viewport-container {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 1 !important;
    }
    .floating-win {
      position: absolute;
      background: rgba(13, 17, 25, 0.88);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(56, 75, 110, 0.55);
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 30;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      resize: both;
      min-width: 300px;
      min-height: 140px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .floating-win:hover, .floating-win.active-focus {
      border-color: rgba(88, 166, 255, 0.7);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.8), 0 0 12px rgba(88, 166, 255, 0.25);
    }
    .floating-win.collapsed {
      height: 40px !important;
      min-height: 40px !important;
      resize: none !important;
    }
    .floating-win.collapsed .win-body,
    .floating-win.collapsed .drawer-header,
    .floating-win.collapsed .asset-grid,
    .floating-win.collapsed .panel-body,
    .floating-win.collapsed .win-gate-body {
      display: none !important;
    }
    .floating-win.minimized-hidden {
      display: none !important;
    }
    .win-titlebar {
      height: 40px;
      min-height: 40px;
      background: linear-gradient(180deg, #18202e 0%, #111722 100%);
      border-bottom: 1px solid #232d3f;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px 0 14px;
      cursor: grab;
      user-select: none;
    }
    .win-titlebar:active {
      cursor: grabbing;
    }
    .win-title {
      font-size: 12px;
      font-weight: 700;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 7px;
      letter-spacing: -0.2px;
      pointer-events: none;
    }
    .win-badge-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(88, 166, 255, 0.15);
      color: #58a6ff;
      border: 1px solid rgba(88, 166, 255, 0.3);
    }
    .win-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .win-btn {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid #2d394e;
      background: #18202d;
      color: #94a3b8;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      transition: all 0.15s;
    }
    .win-btn:hover {
      background: #2b3952;
      color: #ffffff;
      border-color: #58a6ff;
    }
    .win-btn.close:hover {
      background: #da3633;
      color: #ffffff;
      border-color: #f85149;
    }
    .win-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;
    }

    /* 플로팅 게이트 애니메이션 창 특화 스타일 */
    #win-gate-anim {
      left: 20px;
      top: 58px;
      width: 380px;
      height: 260px;
      z-index: 35;
    }
    .win-gate-body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 11.5px;
    }
    .gate-status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0d121c;
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid #222d3d;
    }
    .gate-progress-track {
      height: 10px;
      background: #101622;
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid #222e40;
      position: relative;
    }
    .gate-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #3b82f6, #10b981);
      transition: width 0.08s linear;
    }
    .gate-btn-group {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }
    .btn-gate {
      padding: 8px 4px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 700;
      border: 1px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: all 0.15s;
    }
    .btn-gate.open { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #34d399; }
    .btn-gate.open:hover { background: #10b981; color: #ffffff; }
    .btn-gate.stop { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #f87171; }
    .btn-gate.stop:hover { background: #ef4444; color: #ffffff; }
    .btn-gate.close-act { background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #fbbf24; }
    .btn-gate.close-act:hover { background: #f59e0b; color: #ffffff; }

    /* 플로팅 에셋 창 특화 스타일 */
    #win-assets {
      left: 20px;
      bottom: 20px;
      width: 820px;
      height: 360px;
      z-index: 32;
    }
    #win-assets .drawer-header {
      padding: 6px 12px;
      background: #111722;
      border-bottom: 1px solid #202b3d;
    }
    #win-assets .asset-grid {
      height: calc(100% - 44px);
      padding: 10px 12px;
    }

    /* 플로팅 인스펙터 창 특화 스타일 */
    #win-inspector {
      right: 20px;
      top: 58px;
      width: 440px;
      height: calc(100vh - 80px);
      z-index: 34;
    }
    #win-inspector .panel-body {
      padding: 10px 12px;
      height: calc(100% - 40px);
      overflow-y: auto;
    }

    /* NVIDIA SimReady 카탈로그 모달 */
    .simready-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 13, 0.8);
      backdrop-filter: blur(10px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .simready-modal {
      width: 860px;
      max-width: 94vw;
      height: 680px;
      max-height: 90vh;
      background: #0f1522;
      border: 1px solid #2d3e58;
      border-radius: 12px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .simready-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
      padding: 16px;
      overflow-y: auto;
    }
    .simready-card {
      background: #141c2b;
      border: 1px solid #243247;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: all 0.2s;
    }
    .simready-card:hover {
      border-color: #76b900;
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(118, 185, 0, 0.2);
    }
`;

// Insert floating CSS before </head>
html = html.replace('</head>', `<style>${floatingCSS}</style>\n</head>`);

// B. Add Toolbar buttons
const toolbarAdditions = `
      <div class="tb-group">
        <span class="tb-label">화물 게이트</span>
        <button class="btn-tb active-green" id="btn-tb-gate-toggle" onclick="triggerGateAction('TOGGLE')" title="화물 적재 게이트 열기/닫기 토글 (단축키: Space)">
          🚪 게이트 작동 [Space]
        </button>
        <button class="btn-tb" onclick="toggleWinVisibility('win-gate-anim')" title="게이트 제어창 표시/숨김">
          🎛️ 제어창
        </button>
      </div>

      <div class="tb-group">
        <span class="tb-label">윈도우 레이아웃</span>
        <button class="btn-tb" onclick="resetFloatingWindows()" title="모든 호버링 창의 위치와 크기를 최적 기본값으로 리셋">
          🪟 패널 리셋
        </button>
        <button class="btn-tb" onclick="openNvidiaCatalogModal()" style="border-color:#76b900; color:#95d624;">
          🌐 NVIDIA SimReady 카탈로그
        </button>
      </div>
`;
html = html.replace('<div class="tb-group">\n        <span class="tb-label">렌더러 / 뷰포트</span>', `${toolbarAdditions}\n      <div class="tb-group">\n        <span class="tb-label">렌더러 / 뷰포트</span>`);

// Add Camera View presets
const cameraPresets = `
          <button class="btn-cam" onclick="setView('cargo_gate')" style="border-color:#38bdf8; color:#38bdf8;">🚪 화물도어 & 3D 제어버튼</button>
          <button class="btn-cam" onclick="setView('restroom_stairs')" style="border-color:#ec4899; color:#f472b6;">🚻 화장실 2문 & 전면계단</button>
`;
html = html.replace('<button class="btn-cam" onclick="setView(\'doors\')">화물 도어 2종 (북측)</button>', `${cameraPresets}\n          <button class="btn-cam" onclick="setView('doors')">화물 도어 2종 (북측)</button>`);

// C. Wrap #asset-drawer and #sidebar into .floating-win
// Replace #asset-drawer
const assetDrawerReplacement = `
    <!-- 3. 플로팅 에셋 탐색창 (Unreal / Blender Content Browser 호버링 윈도우) -->
    <div id="win-assets" class="floating-win">
      <div class="win-titlebar" id="win-assets-bar">
        <div class="win-title">
          <span>📦 에셋 탐색창 (Asset Content Browser)</span>
          <span class="win-badge-pill">28+ ASSETS</span>
        </div>
        <div class="win-controls">
          <button class="win-btn" onclick="toggleWinCollapse('win-assets')" title="접기/펼치기">─</button>
          <button class="win-btn" onclick="resetWinPosition('win-assets')" title="초기 크기/위치 리셋">□</button>
          <button class="win-btn close" onclick="toggleWinVisibility('win-assets')" title="닫기 (툴바에서 다시 열기 가능)">✕</button>
        </div>
      </div>
      <div class="drawer-header">
        <div class="drawer-tabs">
          <button class="drawer-tab active" onclick="filterAssetDrawer('ALL', this)">전체 (28)</button>
          <button class="drawer-tab" onclick="filterAssetDrawer('CNC_3DP', this)">🏭 CNC & 3D프린터 (8)</button>
          <button class="drawer-tab" onclick="filterAssetDrawer('LOGISTICS', this)">🚚 물류 & AMR (6)</button>
          <button class="drawer-tab" onclick="filterAssetDrawer('STORAGE', this)">📦 중량 보관랙 (5)</button>
          <button class="drawer-tab" onclick="filterAssetDrawer('OFFICE', this)">💼 사무실 & 가구 (6)</button>
          <button class="drawer-tab" onclick="filterAssetDrawer('SAFETY', this)">🦺 안전 & QC (3)</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="text" class="drawer-search" id="asset-search-input" placeholder="🔍 에셋 검색 (예: CNC, Carter, FKM, 리치트럭, 3D프린터...)" oninput="onSearchAssets(this.value)">
          <button class="btn-tb" onclick="openNvidiaCatalogModal()" style="border-color:#76b900; color:#95d624; font-size:10.5px;">🌐 SimReady</button>
        </div>
      </div>
      <div class="asset-grid" id="asset-grid-container">
        <!-- JS에서 28개 에셋 카드 렌더링 -->
      </div>
    </div>
`;
html = html.replace(/<div id="asset-drawer">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, `${assetDrawerReplacement}\n  </div>`);

// Replace #sidebar with #win-inspector
html = html.replace('<div id="sidebar">', `<div id="win-inspector" class="floating-win">
    <div class="win-titlebar" id="win-inspector-bar">
      <div class="win-title">
        <span>📐 디테일 & 아웃라이너 (Inspector / Outliner)</span>
        <span class="win-badge-pill" id="solver-badge">READY</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-inspector')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-inspector')" title="초기 크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-inspector')" title="닫기">✕</button>
      </div>
    </div>`);

// Remove old panel-header inside sidebar
html = html.replace(/<div class="panel-header">[\s\S]*?<\/div>/, '');

// D. Add Floating Window for Gate Animation: #win-gate-anim
const gateAnimWindowHTML = `
    <!-- 플로팅 화물 적재 게이트 애니메이션 시퀀스 컨트롤러 -->
    <div id="win-gate-anim" class="floating-win">
      <div class="win-titlebar" id="win-gate-anim-bar">
        <div class="win-title">
          <span>🚪 화물 게이트 시퀀스 (Sectional Overhead Door)</span>
          <span class="win-badge-pill" id="gate-state-pill" style="color:#10b981; border-color:#10b981;">CLOSED</span>
        </div>
        <div class="win-controls">
          <button class="win-btn" onclick="toggleWinCollapse('win-gate-anim')" title="접기/펼치기">─</button>
          <button class="win-btn" onclick="resetWinPosition('win-gate-anim')" title="초기 크기/위치 리셋">□</button>
          <button class="win-btn close" onclick="toggleWinVisibility('win-gate-anim')" title="닫기">✕</button>
        </div>
      </div>
      <div class="win-gate-body">
        <div class="gate-status-row">
          <div>
            <div style="font-weight:700; color:#f1f5f9;">게이트 리프팅 상태</div>
            <div style="font-size:10px; color:#94a3b8;" id="gate-detail-text">닫힘 상태 (높이: 0.0m / 4.1m)</div>
          </div>
          <span id="gate-percent-text" style="font-weight:800; font-family:ui-monospace,monospace; color:#38bdf8;">0%</span>
        </div>

        <div class="gate-progress-track">
          <div class="gate-progress-bar" id="gate-progress-bar"></div>
        </div>

        <div class="gate-btn-group">
          <button class="btn-gate open" onclick="triggerGateAction('OPEN')">
            <span>🟢 열기 (OPEN)</span>
          </button>
          <button class="btn-gate stop" onclick="triggerGateAction('STOP')">
            <span>🔴 정지 (STOP)</span>
          </button>
          <button class="btn-gate close-act" onclick="triggerGateAction('CLOSE')">
            <span>🟡 닫기 (CLOSE)</span>
          </button>
        </div>

        <div style="background:#090d15; padding:8px 10px; border-radius:6px; border:1px solid #1a2332; font-size:10.5px; color:#94a3b8; line-height:1.4;">
          <b style="color:#facc15;">💡 3D 인터랙션:</b> 화물도어 우측 벽면의 <b style="color:#38bdf8;">3D 푸시버튼 스위치</b>를 마우스로 직접 클릭하거나, 키보드 <b style="color:#4ade80;">[Space]</b> 키를 누르면 게이트 시퀀스가 즉시 재생됩니다.
        </div>
      </div>
    </div>
`;
html = html.replace('<!-- 우측 인스펙터 사이드바 -->', `${gateAnimWindowHTML}\n  <!-- 우측 인스펙터 사이드바 -->`);

// E. Add NVIDIA SimReady Modal
const nvidiaModalHTML = `
  <!-- NVIDIA SimReady Cloud Asset Library 모달 -->
  <div id="modal-nvidia-catalog" class="simready-modal-overlay">
    <div class="simready-modal">
      <div class="win-titlebar" style="background:#0e1520; border-bottom:1px solid #233347; height:46px;">
        <div class="win-title" style="font-size:13px;">
          <span style="color:#76b900; font-weight:800;">NVIDIA Omniverse™ SimReady 3D 에셋 클라우드</span>
          <span class="win-badge-pill" style="border-color:#76b900; color:#76b900;">OpenUSD / SimReady 1.0</span>
        </div>
        <button class="win-btn close" onclick="closeNvidiaCatalogModal()" style="width:28px; height:28px; font-size:13px;">✕</button>
      </div>

      <div style="padding:12px 16px; background:#121b29; border-bottom:1px solid #1f2d40; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:11.5px; color:#94a3b8;">
          NVIDIA Isaac Sim 및 Omniverse 물리 엔진에 최적화된 산업용 디지털 트윈 검증 에셋을 원클릭으로 3D 작업 공간에 직접 스폰합니다.
        </div>
        <a href="https://huggingface.co/datasets/nvidia/SimReady" target="_blank" class="btn-tb" style="border-color:#76b900; color:#95d624; text-decoration:none;">
          🔗 NVIDIA SimReady 원본 저장소
        </a>
      </div>

      <div class="simready-grid" id="simready-grid-list">
        <!-- JS에서 렌더링 -->
      </div>

      <div style="padding:10px 16px; background:#0d131f; border-top:1px solid #1f2d40; display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn-tb" onclick="closeNvidiaCatalogModal()">닫기</button>
      </div>
    </div>
  </div>
`;
html = html.replace('<!-- Blender Cycles Headless 렌더 모달 -->', `${nvidiaModalHTML}\n  <!-- Blender Cycles Headless 렌더 모달 -->`);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html!');
