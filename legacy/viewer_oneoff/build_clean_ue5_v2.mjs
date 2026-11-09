import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// ============================================================================
// 1. GENERATE CLEAN index_v2.html (UE5 Slate × Linear Dark Design System)
// ============================================================================
const cleanHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SolidCraft Twin Studio v2 — 공간 편집 스튜디오 (UE5 Slate × Linear Dark)</title>
  
  <style>
    /* ==========================================================================
       Linear & Unreal Engine 5 Dark Design System Foundations
       ========================================================================== */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    :root {
      --bg-floor: #08090a;
      --bg-surface: #0f1115;
      --bg-surface-elevated: #161a22;
      --bg-surface-hover: #1f2430;
      --border-hairline: rgba(255, 255, 255, 0.08);
      --border-focus: #38bdf8;
      --accent-primary: #38bdf8;
      --accent-indigo: #5e6ad2;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --text-primary: #f7f8f8;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "Berkeley Mono", Menlo, Consolas, monospace;
      --header-h: 42px;
      --footer-h: 30px;
      --sidebar-w: 390px;
      --drawer-h: 340px;
    }

    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: var(--bg-floor);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 12px;
      position: relative;
    }

    /* --------------------------------------------------------------------------
       Top Header Toolbar (42px)
       -------------------------------------------------------------------------- */
    #top-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: var(--header-h);
      background: rgba(15, 17, 21, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      z-index: 200;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    }

    .tb-left, .tb-center, .tb-right {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      font-weight: 700;
      font-size: 11.5px;
      color: var(--text-primary);
      letter-spacing: -0.2px;
    }
    .brand-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-primary);
      box-shadow: 0 0 8px var(--accent-primary);
    }

    .btn-tb {
      background: var(--bg-surface-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--border-hairline);
      padding: 4px 9px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn-tb:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
      border-color: rgba(255, 255, 255, 0.16);
    }
    .btn-tb.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--accent-primary);
      color: var(--accent-primary);
    }
    .btn-tb.active-green {
      background: rgba(16, 185, 129, 0.15);
      border-color: var(--accent-green);
      color: var(--accent-green);
    }
    .btn-tb.active-amber {
      background: rgba(245, 158, 11, 0.15);
      border-color: var(--accent-amber);
      color: var(--accent-amber);
    }

    .tb-select {
      background: var(--bg-surface-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border-hairline);
      padding: 4px 8px;
      border-radius: 5px;
      font-size: 11px;
      outline: none;
      cursor: pointer;
    }

    .tb-divider {
      width: 1px;
      height: 20px;
      background: var(--border-hairline);
      margin: 0 4px;
    }

    /* --------------------------------------------------------------------------
       Fullscreen 3D Viewport
       -------------------------------------------------------------------------- */
    #viewport-container {
      position: absolute;
      top: var(--header-h);
      left: 0;
      width: 100vw;
      height: calc(100vh - var(--header-h) - var(--footer-h));
      background: radial-gradient(circle at 50% 40%, #151c28 0%, #080a10 100%);
      overflow: hidden;
      outline: none;
      z-index: 1;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    body.sidebar-open #viewport-container {
      width: calc(100vw - var(--sidebar-w));
    }
    body.zen-mode #viewport-container {
      top: 0;
      width: 100vw !important;
      height: 100vh !important;
    }

    #canvas3d {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Subtle Viewport HUD Overlay */
    #viewport-overlay-hud {
      position: absolute;
      top: 12px;
      left: 14px;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 10;
    }
    .hud-pill {
      background: rgba(15, 17, 21, 0.82);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 10.5px;
      color: var(--text-secondary);
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
    }

    #drop-banner {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(56, 189, 248, 0.92);
      color: #030712;
      padding: 6px 16px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 11.5px;
      z-index: 100;
      display: none;
      box-shadow: 0 4px 20px rgba(56, 189, 248, 0.4);
      pointer-events: none;
    }

    /* --------------------------------------------------------------------------
       Right Docking Sidebar (Unified Tabbed Inspector, 390px)
       -------------------------------------------------------------------------- */
    #right-sidebar {
      position: absolute;
      top: var(--header-h);
      right: 0;
      width: var(--sidebar-w);
      height: calc(100vh - var(--header-h) - var(--footer-h));
      background: var(--bg-surface);
      border-left: 1px solid var(--border-hairline);
      display: flex;
      flex-direction: column;
      z-index: 120;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    body.sidebar-open #right-sidebar {
      transform: translateX(0);
    }
    body.zen-mode #right-sidebar {
      transform: translateX(100%) !important;
    }

    .sidebar-tabs {
      display: flex;
      align-items: center;
      background: var(--bg-surface-elevated);
      border-bottom: 1px solid var(--border-hairline);
      padding: 0 4px;
      overflow-x: auto;
    }
    .sidebar-tab-btn {
      flex: 1;
      padding: 9px 8px;
      background: transparent;
      color: var(--text-muted);
      border: none;
      border-bottom: 2px solid transparent;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .sidebar-tab-btn:hover {
      color: var(--text-secondary);
      background: rgba(255, 255, 255, 0.02);
    }
    .sidebar-tab-btn.active {
      color: var(--accent-primary);
      border-bottom-color: var(--accent-primary);
      background: rgba(56, 189, 248, 0.04);
    }

    .sidebar-content-area {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tab-pane {
      display: none;
      flex-direction: column;
      gap: 12px;
    }
    .tab-pane.active {
      display: flex;
    }

    /* Common Card Styling in Sidebar */
    .sb-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-hairline);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sb-card-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .vec3-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .vec3-label {
      width: 48px;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .vec3-field {
      flex: 1;
      display: flex;
      align-items: center;
      background: var(--bg-floor);
      border: 1px solid var(--border-hairline);
      border-radius: 5px;
      overflow: hidden;
    }
    .vec3-axis {
      width: 18px;
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      color: #fff;
      padding: 3px 0;
    }
    .axis-x { background: #dc2626; }
    .axis-y { background: #16a34a; }
    .axis-z { background: #2563eb; }
    .vec3-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 3px 6px;
      outline: none;
      min-width: 0;
    }

    /* --------------------------------------------------------------------------
       Bottom Content Drawer (Unreal Engine 5 Style, Slide-Up, 340px)
       -------------------------------------------------------------------------- */
    #content-drawer {
      position: absolute;
      bottom: var(--footer-h);
      left: 0;
      width: 100vw;
      height: var(--drawer-h);
      background: rgba(15, 17, 21, 0.96);
      backdrop-filter: blur(16px);
      border-top: 1px solid var(--border-hairline);
      z-index: 150;
      display: flex;
      flex-direction: column;
      transform: translateY(100%);
      transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #content-drawer.open {
      transform: translateY(0);
    }
    body.zen-mode #content-drawer {
      transform: translateY(100%) !important;
    }

    .drawer-header {
      height: 38px;
      background: var(--bg-surface-elevated);
      border-bottom: 1px solid var(--border-hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
    }
    .drawer-cats {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .drawer-search {
      background: var(--bg-floor);
      border: 1px solid var(--border-hairline);
      color: var(--text-primary);
      padding: 3px 9px;
      border-radius: 5px;
      font-size: 11px;
      outline: none;
      width: 180px;
    }
    .drawer-grid {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 10px;
    }

    .asset-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 6px;
      padding: 10px;
      cursor: grab;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .asset-card:hover {
      background: var(--bg-surface-hover);
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    }
    .asset-icon-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .asset-icon { font-size: 18px; }
    .asset-badge {
      font-size: 9.5px;
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      font-weight: 600;
    }
    .asset-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.3;
    }
    .asset-sub {
      font-size: 10px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .asset-dim {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      color: var(--text-muted);
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      padding-top: 4px;
      font-family: var(--font-mono);
    }

    /* --------------------------------------------------------------------------
       Bottom Status Strip Footer (30px)
       -------------------------------------------------------------------------- */
    #bottom-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100vw;
      height: var(--footer-h);
      background: var(--bg-surface);
      border-top: 1px solid var(--border-hairline);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      z-index: 180;
      font-size: 11px;
      color: var(--text-muted);
      transition: transform 0.25s ease;
    }
    body.zen-mode #bottom-bar {
      transform: translateY(100%) !important;
    }

    .footer-drawer-btn {
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--accent-primary);
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 10.5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .footer-drawer-btn:hover {
      background: rgba(56, 189, 248, 0.22);
    }

    .footer-pills {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .footer-pill-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-family: var(--font-mono);
      font-size: 10.5px;
    }

    /* --------------------------------------------------------------------------
       Modal Overlays (SimReady & Cycles Headless Render)
       -------------------------------------------------------------------------- */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(5, 7, 10, 0.82);
      backdrop-filter: blur(12px);
      z-index: 500;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-card {
      background: var(--bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* --------------------------------------------------------------------------
       Runtime Error Banner
       -------------------------------------------------------------------------- */
    #runtime-error-banner {
      display: none;
      position: fixed;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      background: #b91c1c;
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 11.5px;
      z-index: 99999;
      box-shadow: 0 12px 36px rgba(0,0,0,0.8);
      border: 1px solid #f87171;
    }
  </style>

  <!-- Three.js + OrbitControls + TransformControls + OBJLoader + PostProcessing -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js"></script>
</head>

<body class="sidebar-open">
  <!-- 실시간 자바스크립트 런타임 오류 감지 배너 -->
  <div id="runtime-error-banner"></div>
  <script>
    window.addEventListener('error', function(e) {
      var b = document.getElementById('runtime-error-banner');
      if (b) {
        b.style.display = 'block';
        b.innerHTML = '⚠️ <b>[뷰포트 런타임 오류]</b> ' + e.message + '<br><span style="font-size:10px; color:#fecaca;">' + e.filename + ':' + e.lineno + '</span>';
      }
    });
  </script>

  <!-- =========================================================================
       1. Top Header Toolbar (42px)
       ========================================================================= -->
  <header id="top-toolbar">
    <div class="tb-left">
      <div class="brand-pill">
        <span class="brand-dot"></span>
        <span>SolidCraft Twin Studio</span>
        <span style="font-size:10px; color:var(--text-muted); font-weight:400;">v2.5</span>
      </div>

      <div class="tb-divider"></div>

      <!-- Transform Gizmo Modes -->
      <button class="btn-tb" id="btn-mode-select" onclick="setTransformMode('select')" title="선택 모드 (Q)">
        <span>↖ 선택 (Q)</span>
      </button>
      <button class="btn-tb active" id="btn-mode-translate" onclick="setTransformMode('translate')" title="이동 기즈모 (G)">
        <span>✥ 이동 (G)</span>
      </button>
      <button class="btn-tb" id="btn-mode-rotate" onclick="setTransformMode('rotate')" title="회전 기즈모 (R)">
        <span>↻ 회전 (R)</span>
      </button>
      <button class="btn-tb" id="btn-mode-scale" onclick="setTransformMode('scale')" title="스케일 기즈모 (T)">
        <span>⤢ 크기 (T)</span>
      </button>

      <div class="tb-divider"></div>

      <!-- Grid Snap -->
      <select class="tb-select" id="select-grid-snap" onchange="setGridSnap(this.value)" title="이동 그리드 스냅 (mm)">
        <option value="10">스냅: 10mm</option>
        <option value="50" selected>스냅: 50mm</option>
        <option value="100">스냅: 100mm</option>
        <option value="500">스냅: 500mm</option>
        <option value="0">스냅: OFF</option>
      </select>

      <!-- Camera Speed -->
      <div class="btn-tb" style="padding:2px 8px; cursor:default;" title="카메라 이동 속도 (단축키: [ 감속, ] 가속)">
        <span style="color:var(--text-muted); font-size:10px;">속도</span>
        <input type="range" id="slider-cam-speed" min="0.2" max="5.0" step="0.1" value="1.0" oninput="setCameraSpeedMultiplier(this.value)" style="width:65px; accent-color:#38bdf8; cursor:pointer;">
        <span id="label-cam-speed" style="font-family:var(--font-mono); font-size:10.5px; color:#38bdf8; font-weight:700;">1.0x</span>
      </div>
    </div>

    <!-- Center Quick Trigger Group -->
    <div class="tb-center">
      <!-- Viewport Shading Dropdown -->
      <select class="tb-select" id="select-viewport-mode" onchange="switchViewportPreset(this.value)" title="렌더링 셰이딩 및 시각화 모드">
        <option value="pbr" selected>⚡ UE5 실사 PBR (AgX IBL + SSR)</option>
        <option value="cad_edges">📐 정밀 CAD 와이어 외곽선</option>
        <option value="xray">🩻 실내 투시 (X-Ray Cutaway)</option>
        <option value="wireframe">🕸️ 메쉬 와이어프레임</option>
        <option value="splat">☁️ 3DGS 가우시안 스플랫</option>
      </select>

      <!-- Camera Views Dropdown -->
      <select class="tb-select" id="select-camera-view" onchange="setView(this.value)" title="공장 주요 설비 시점 바로가기">
        <option value="iso" selected>📷 전체 조감도 (Isometric)</option>
        <option value="cargo_gate">🚪 화물 게이트 듀얼 존</option>
        <option value="cnc_cell">🏭 CNC & 3D 프린터 제조셀</option>
        <option value="restroom_stairs">🚻 듀얼 도어 화장실 & 계단</option>
        <option value="office">💼 1층 엔지니어링 오피스</option>
        <option value="mezzanine">🪜 메자닌 복층 & 계단</option>
        <option value="lounge">☕ 라운지 & 케이지 존</option>
      </select>

      <!-- Master Gate Toggle Action Button -->
      <button class="btn-tb active-amber" id="btn-tb-gate-toggle" onclick="triggerGateAction('TOGGLE')" title="화물 게이트 동시 개폐 토글 (단축키: Space)">
        <span>🚪 게이트 개폐 (Space)</span>
      </button>
    </div>

    <!-- Right Controls Group -->
    <div class="tb-right">
      <button class="btn-tb" onclick="undoLastAction()" title="실행 취소 (Ctrl+Z)">
        <span>↩ 취소</span>
      </button>
      <button class="btn-tb active-green" onclick="saveSceneLayoutToServer()" title="레이아웃 저장 (scene_layout.json 동기화)">
        <span>💾 저장</span>
      </button>
      <button class="btn-tb" onclick="openBlenderRenderModal()" style="border-color:#7c3aed; color:#c084fc;" title="Blender Cycles GPU 렌더링">
        <span>⚡ Cycles</span>
      </button>

      <div class="tb-divider"></div>

      <!-- Zen Mode & Right Sidebar Toggle -->
      <button class="btn-tb" id="btn-toggle-zen" onclick="toggleZenMode()" title="순수 3D 뷰포트 몰입 모드 (단축키: Tab)">
        <span>🖥️ Zen (Tab)</span>
      </button>
      <button class="btn-tb active" id="btn-toggle-sidebar" onclick="toggleRightSidebar()" title="우측 통합 인스펙터 패널 토글 (단축키: F4)">
        <span>📐 패널 (F4)</span>
      </button>
    </div>
  </header>

  <!-- =========================================================================
       2. Fullscreen Central 3D Viewport
       ========================================================================= -->
  <main id="viewport-container" tabindex="0">
    <div id="viewport-overlay-hud">
      <div class="hud-pill">
        <span>🎮 조작: <b>WASD</b> 이동 | <b>QE</b> 승강 | <b>Shift</b> 부스트 | 마우스 우클릭: 회전</span>
      </div>
      <div class="hud-pill" id="hud-selected-pill" style="display:none; color:#38bdf8;">
        <span>선택: <b id="hud-selected-name">None</b></span>
      </div>
    </div>

    <div id="drop-banner">✨ 3D 공간의 원하는 바닥/작업대 위치에 마우스를 놓아 에셋을 배치하세요 (ESC: 취소)</div>
    <div id="tooltip"></div>
    <canvas id="canvas3d"></canvas>
  </main>

  <!-- =========================================================================
       3. Right Docking Sidebar (Unified Tabbed Inspector, 390px)
       ========================================================================= -->
  <aside id="right-sidebar">
    <!-- Tab Navigation Header -->
    <div class="sidebar-tabs">
      <button class="sidebar-tab-btn active" id="tab-btn-inspector" onclick="switchRightSidebarTab('inspector')">
        <span>📐 속성/변환</span>
      </button>
      <button class="sidebar-tab-btn" id="tab-btn-gates" onclick="switchRightSidebarTab('gates')">
        <span>🚪 화물 게이트</span>
      </button>
      <button class="sidebar-tab-btn" id="tab-btn-plc" onclick="switchRightSidebarTab('plc')">
        <span>⚡ 가상 PLC</span>
      </button>
      <button class="sidebar-tab-btn" id="tab-btn-layout" onclick="switchRightSidebarTab('layout')">
        <span>🏭 레이아웃</span>
      </button>
    </div>

    <div class="sidebar-content-area">
      <!-- -------------------------------------------------------------------
           Tab 1: Transform & Material Studio (Inspector)
           ------------------------------------------------------------------- -->
      <div class="tab-pane active" id="pane-inspector">
        <div class="sb-card">
          <div class="sb-card-title">
            <span>선택 오브젝트 트랜스폼</span>
            <span id="sel-obj-badge" style="color:var(--accent-green); font-size:10px;">선택 없음</span>
          </div>

          <div class="vec3-row">
            <span class="vec3-label">위치 (mm)</span>
            <div class="vec3-field"><span class="vec3-axis axis-x">X</span><input class="vec3-input" type="number" step="50" id="inp-pos-x" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-y">Y</span><input class="vec3-input" type="number" step="50" id="inp-pos-y" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-z">Z</span><input class="vec3-input" type="number" step="50" id="inp-pos-z" onchange="applyNumericTransform()"></div>
          </div>

          <div class="vec3-row">
            <span class="vec3-label">회전 (°)</span>
            <div class="vec3-field"><span class="vec3-axis axis-x">X</span><input class="vec3-input" type="number" step="15" id="inp-rot-x" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-y">Y</span><input class="vec3-input" type="number" step="15" id="inp-rot-y" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-z">Z</span><input class="vec3-input" type="number" step="15" id="inp-rot-z" onchange="applyNumericTransform()"></div>
          </div>

          <div class="vec3-row">
            <span class="vec3-label">스케일</span>
            <div class="vec3-field"><span class="vec3-axis axis-x">X</span><input class="vec3-input" type="number" step="0.1" id="inp-scl-x" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-y">Y</span><input class="vec3-input" type="number" step="0.1" id="inp-scl-y" onchange="applyNumericTransform()"></div>
            <div class="vec3-field"><span class="vec3-axis axis-z">Z</span><input class="vec3-input" type="number" step="0.1" id="inp-scl-z" onchange="applyNumericTransform()"></div>
          </div>

          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <button class="btn-tb" onclick="duplicateSelectedAsset()" style="flex:1; margin-right:4px;">📋 복제 (Ctrl+D)</button>
            <button class="btn-tb" onclick="deleteSelectedAsset()" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">🗑️ 삭제 (Del)</button>
          </div>
        </div>

        <!-- Material Studio -->
        <div class="sb-card">
          <div class="sb-card-title">
            <span>엔지니어링 재질 스튜디오 (PBR Spec)</span>
          </div>
          <div id="material-swatch-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:6px;"></div>
        </div>
      </div>

      <!-- -------------------------------------------------------------------
           Tab 2: Dual Cargo Gates Control
           ------------------------------------------------------------------- -->
      <div class="tab-pane" id="pane-gates">
        <!-- Target Selector -->
        <div class="sb-card">
          <div class="sb-card-title">
            <span>제어 대상 (Target Gate)</span>
            <span id="label-active-gate" style="color:var(--accent-amber); font-size:10px;">듀얼 동시 가동</span>
          </div>
          <div style="display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:4px;">
            <button class="btn-tb active-green" id="btn-gate-target-both" onclick="setActiveGateTarget('BOTH')">⚡ 듀얼 동시</button>
            <button class="btn-tb" id="btn-gate-target-g1" onclick="setActiveGateTarget('GATE1')">1️⃣ 섹셔널</button>
            <button class="btn-tb" id="btn-gate-target-g2" onclick="setActiveGateTarget('GATE2')">2️⃣ 롤업</button>
          </div>
        </div>

        <!-- Gate 1 Progress -->
        <div class="sb-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:var(--text-primary); font-size:11px;">1️⃣ 게이트 1 (오버헤드 섹셔널 도어)</div>
              <div style="font-size:10px; color:var(--text-muted);" id="gate1-detail-text">닫힘 상태 (0.0m / 4.1m)</div>
            </div>
            <span id="gate1-percent-text" style="font-weight:800; font-family:var(--font-mono); color:var(--accent-primary);">0%</span>
          </div>
          <div style="height:8px; background:var(--bg-floor); border-radius:4px; overflow:hidden; border:1px solid var(--border-hairline);">
            <div id="gate1-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #38bdf8, #10b981); transition:width 0.08s linear;"></div>
          </div>
        </div>

        <!-- Gate 2 Progress -->
        <div class="sb-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:700; color:var(--text-primary); font-size:11px;">2️⃣ 게이트 2 (고속 롤업 셔터 도어)</div>
              <div style="font-size:10px; color:var(--text-muted);" id="gate2-detail-text">닫힘 상태 (0.0m / 4.1m)</div>
            </div>
            <span id="gate2-percent-text" style="font-weight:800; font-family:var(--font-mono); color:#c084fc;">0%</span>
          </div>
          <div style="height:8px; background:var(--bg-floor); border-radius:4px; overflow:hidden; border:1px solid var(--border-hairline);">
            <div id="gate2-progress-bar" style="height:100%; width:0%; background:linear-gradient(90deg, #8b5cf6, #ec4899); transition:width 0.08s linear;"></div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
          <button class="btn-tb active-green" style="justify-content:center; padding:7px;" onclick="triggerGateAction('OPEN')">▲ 열기 (OPEN)</button>
          <button class="btn-tb" style="justify-content:center; padding:7px; color:#ef4444;" onclick="triggerGateAction('STOP')">■ 정지 (STOP)</button>
          <button class="btn-tb active-amber" style="justify-content:center; padding:7px;" onclick="triggerGateAction('CLOSE')">▼ 닫기 (CLOSE)</button>
        </div>

        <!-- Wall Relocation -->
        <div class="sb-card">
          <div class="sb-card-title">
            <span>설치 벽면 (Wall Position)</span>
            <span id="label-gate-wall" style="color:var(--accent-green); font-size:10px;">남측 벽면 [반대편]</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:4px;">
            <button class="btn-tb active-green" id="btn-wall-south" onclick="relocateCargoGate('SOUTH')">남측 (Y=0)</button>
            <button class="btn-tb" id="btn-wall-north" onclick="relocateCargoGate('NORTH')">북측 (Y=16)</button>
            <button class="btn-tb" id="btn-wall-west" onclick="relocateCargoGate('WEST')">서측 (X=0)</button>
            <button class="btn-tb" id="btn-wall-east" onclick="relocateCargoGate('EAST')">동측 (X=24)</button>
          </div>
        </div>
      </div>

      <!-- -------------------------------------------------------------------
           Tab 3: Virtual PLC S7-1500 Ladder Logic & I/O
           ------------------------------------------------------------------- -->
      <div class="tab-pane" id="pane-plc">
        <div class="sb-card">
          <div class="sb-card-title">
            <span>가상 PLC 신호 버스 (S7-1500)</span>
            <span style="color:var(--accent-green); font-family:var(--font-mono); font-size:10px;">50Hz RUN</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-family:var(--font-mono); font-size:10.5px;">
            <div style="background:var(--bg-floor); padding:6px; border-radius:4px; border:1px solid var(--border-hairline);">
              <div style="color:var(--text-muted); font-size:9.5px;">스핀들 회전수</div>
              <div id="plc-val-rpm" style="font-size:13px; font-weight:700; color:var(--accent-primary);">12,000 RPM</div>
            </div>
            <div style="background:var(--bg-floor); padding:6px; border-radius:4px; border:1px solid var(--border-hairline);">
              <div style="color:var(--text-muted); font-size:9.5px;">챔버 산소 분압</div>
              <div id="plc-val-o2" style="font-size:13px; font-weight:700; color:var(--accent-green);">16 PPM</div>
            </div>
          </div>
        </div>

        <div class="sb-card">
          <div class="sb-card-title"><span>디지털 입력 (DI: 인터록 & 센서)</span></div>
          <div id="plc-di-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:4px;"></div>
        </div>

        <div class="sb-card">
          <div class="sb-card-title"><span>디지털 출력 (DO: 모터 & 밸브)</span></div>
          <div id="plc-do-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:4px;"></div>
        </div>

        <div class="sb-card">
          <div class="sb-card-title"><span>실시간 래더 로직 (Ladder Rungs)</span></div>
          <div id="plc-ladder-rungs" style="font-family:var(--font-mono); font-size:9.5px; line-height:1.6;"></div>
        </div>
      </div>

      <!-- -------------------------------------------------------------------
           Tab 4: Scene Layout & Architecture
           ------------------------------------------------------------------- -->
      <div class="tab-pane" id="pane-layout">
        <div class="sb-card">
          <div class="sb-card-title"><span>배치 에셋 목록 & 통계</span></div>
          <div id="scene-instances-list" style="display:flex; flex-direction:column; gap:4px; max-height:220px; overflow-y:auto;"></div>
        </div>

        <div class="sb-card">
          <div class="sb-card-title"><span>데이터 동기화 & 내보내기</span></div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            <button class="btn-tb active-green" onclick="saveSceneLayoutToServer()">💾 서버에 씬 레이아웃 동기화</button>
            <button class="btn-tb" onclick="exportSceneJSON()">📥 JSON 파일 내보내기</button>
            <button class="btn-tb" onclick="clearAllPlacedAssets()" style="color:#ef4444; border-color:rgba(239,68,68,0.3);">⚠️ 전체 배치 에셋 초기화</button>
          </div>
        </div>
      </div>
    </div>
  </aside>

  <!-- =========================================================================
       4. Bottom Content Drawer (Unreal Engine 5 Style, Slide-Up, 340px)
       ========================================================================= -->
  <section id="content-drawer">
    <div class="drawer-header">
      <div class="drawer-cats">
        <span style="font-weight:700; color:var(--text-primary); font-size:11.5px; margin-right:6px;">🗂️ 콘텐츠 드로어</span>
        <button class="btn-tb active" onclick="renderAssetDrawer('ALL', this)">전체 (28)</button>
        <button class="btn-tb" onclick="renderAssetDrawer('CNC_3DP', this)">CNC & 3D프린터</button>
        <button class="btn-tb" onclick="renderAssetDrawer('ROBOT_LOGISTICS', this)">물류 로봇</button>
        <button class="btn-tb" onclick="renderAssetDrawer('STORAGE_RACK', this)">보관 설비</button>
        <button class="btn-tb" onclick="renderAssetDrawer('OFFICE_STATION', this)">오피스</button>
        <button class="btn-tb" onclick="renderAssetDrawer('SAFETY_FACILITY', this)">안전 환경</button>
      </div>

      <div style="display:flex; align-items:center; gap:6px;">
        <input type="text" class="drawer-search" id="input-asset-search" placeholder="에셋 검색 (예: 5축 CNC, Carter...)" oninput="filterAssetsBySearch(this.value)">
        <button class="btn-tb" onclick="openSimReadyCatalogModal()" style="border-color:#76b900; color:#a3e635;" title="NVIDIA SimReady 정밀 CAD 카탈로그">
          <span>📦 NVIDIA SimReady</span>
        </button>
        <button class="btn-tb" onclick="toggleContentDrawer()" title="드로어 닫기 (Ctrl+Space)">✕</button>
      </div>
    </div>

    <div class="drawer-grid" id="asset-drawer-cards"></div>
  </section>

  <!-- =========================================================================
       5. Bottom Status Strip Footer (30px)
       ========================================================================= -->
  <footer id="bottom-bar">
    <div style="display:flex; align-items:center; gap:8px;">
      <button class="footer-drawer-btn" onclick="toggleContentDrawer()" title="콘텐츠 드로어 슬라이드 토글 (단축키: Ctrl + Space)">
        <span>🗂️ 콘텐츠 드로어 (Ctrl+Space)</span>
      </button>
      <div class="tb-divider" style="height:14px;"></div>
      <div class="footer-pills">
        <div class="footer-pill-item">
          <span>🚪 G1:</span>
          <b id="footer-pill-g1" style="color:var(--accent-green);">CLOSED</b>
        </div>
        <div class="footer-pill-item">
          <span>🚪 G2:</span>
          <b id="footer-pill-g2" style="color:var(--accent-green);">CLOSED</b>
        </div>
        <div class="footer-pill-item">
          <span>⚡ PLC:</span>
          <b style="color:var(--accent-primary);">50Hz NORMAL</b>
        </div>
      </div>
    </div>

    <div style="display:flex; align-items:center; gap:12px;">
      <span class="footer-pill-item" id="footer-speed-pill" style="color:var(--accent-primary);">🏃 1.0x (7.5 m/s)</span>
      <span class="footer-pill-item" id="hud-coords" style="color:var(--text-secondary);">X: 22,000, Y: -16,000, Z: 14,500 mm</span>
    </div>
  </footer>

  <!-- =========================================================================
       6. Modals (SimReady Catalog & Blender Cycles Render)
       ========================================================================= -->
  <div id="modal-nvidia-catalog" class="modal-overlay">
    <div class="modal-card" style="width:880px; max-width:92vw; height:640px;">
      <div style="padding:12px 16px; background:var(--bg-surface-elevated); border-bottom:1px solid var(--border-hairline); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; color:#a3e635; font-size:13px;">📦 NVIDIA Isaac SimReady™ 디지털 트윈 에셋 뱅크</span>
        <button class="btn-tb" onclick="closeSimReadyCatalogModal()">✕ 닫기</button>
      </div>
      <div id="simready-catalog-body" style="flex:1; overflow-y:auto; padding:16px;"></div>
    </div>
  </div>

  <div id="render-modal-overlay" class="modal-overlay">
    <div class="modal-card" style="width:880px; max-width:92vw; height:680px;">
      <div style="padding:12px 16px; background:var(--bg-surface-elevated); border-bottom:1px solid var(--border-hairline); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; color:#c084fc; font-size:13px;">⚡ Blender 4.x Headless Cycles 패스트레이싱 (AgX Color Space)</span>
        <button class="btn-tb" onclick="closeBlenderRenderModal()">✕ 닫기</button>
      </div>
      <div style="flex:1; padding:16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
        <div style="display:flex; gap:8px;">
          <input type="text" id="input-blender-path" class="drawer-search" style="flex:1;" placeholder="Blender 경로 (비워둘 시 자동 탐색)">
          <button class="btn-tb active-green" id="btn-start-render" onclick="executeBlenderHeadlessRender()">⚡ 지금 렌더링 시작</button>
        </div>
        <div style="flex:1; background:#000; border-radius:6px; display:flex; align-items:center; justify-content:center; overflow:hidden; border:1px solid var(--border-hairline);">
          <img id="render-result-img" src="/renders_cycles/cycles_digital_twin_render.png" style="max-width:100%; max-height:100%; object-fit:contain;">
        </div>
      </div>
    </div>
  </div>

  <script src="/editor_v2.js"></script>
</body>
</html>
`;

fs.writeFileSync(path.join(basePath, 'index_v2.html'), cleanHtml, 'utf8');
console.log('Successfully wrote streamlined index_v2.html!');

// ============================================================================
// 2. UPDATE editor_v2.js WITH UNREAL/LINEAR WORKSPACE CONTROLLERS
// ============================================================================
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

const modernWorkspaceControllers = `
// ============================================================================
// 🖥️ Unreal Engine 5 & Linear Modern Workspace Controls
// ============================================================================
let isDrawerOpen = false;
let isZenMode = false;
let activeSidebarTab = 'inspector';

function toggleContentDrawer(forceOpen = null) {
  isDrawerOpen = forceOpen !== null ? forceOpen : !isDrawerOpen;
  const drawer = document.getElementById('content-drawer');
  if (drawer) {
    drawer.classList.toggle('open', isDrawerOpen);
  }
}
window.toggleContentDrawer = toggleContentDrawer;

function toggleRightSidebar() {
  document.body.classList.toggle('sidebar-open');
  const btn = document.getElementById('btn-toggle-sidebar');
  const isOpen = document.body.classList.contains('sidebar-open');
  if (btn) btn.classList.toggle('active', isOpen);
  setTimeout(onWindowResize, 280);
}
window.toggleRightSidebar = toggleRightSidebar;

function toggleZenMode() {
  isZenMode = !isZenMode;
  document.body.classList.toggle('zen-mode', isZenMode);
  const btn = document.getElementById('btn-toggle-zen');
  if (btn) btn.classList.toggle('active', isZenMode);
  if (isZenMode) {
    toggleContentDrawer(false);
    log('🖥️ [Zen Mode] 3D 디지털 트윈 몰입 뷰포트 활성화 (Tab 키로 복귀)');
  } else {
    log('🖥️ [Studio Mode] 편집 스튜디오 복귀');
  }
  setTimeout(onWindowResize, 280);
}
window.toggleZenMode = toggleZenMode;

function switchRightSidebarTab(tabName) {
  activeSidebarTab = tabName;
  ['inspector', 'gates', 'plc', 'layout'].forEach(t => {
    const btn = document.getElementById('tab-btn-' + t);
    const pane = document.getElementById('pane-' + t);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });
}
window.switchRightSidebarTab = switchRightSidebarTab;

function switchViewportPreset(preset) {
  if (preset === 'pbr') {
    isPhotorealPBR = true;
    isCadEdgesVisible = false;
    isWireframeVisible = false;
    isXRay = false;
  } else if (preset === 'cad_edges') {
    isCadEdgesVisible = true;
  } else if (preset === 'xray') {
    toggleXRay();
  } else if (preset === 'wireframe') {
    toggleWireframe();
  } else if (preset === 'splat') {
    toggleGaussianSplats();
  }

  // Update Three.js materials
  scene.traverse(c => {
    if (c.isMesh && c.material) {
      if ('envMapIntensity' in c.material) c.material.envMapIntensity = isPhotorealPBR ? 1.4 : 0.3;
      if (c.userData.isCadEdge) c.visible = isCadEdgesVisible;
    }
  });
  log('🎨 뷰포트 모드 전환: ' + preset);
}
window.switchViewportPreset = switchViewportPreset;
`;

// Inject modernWorkspaceControllers right before keydown handler
if (!js.includes('function toggleContentDrawer(')) {
  js = js.replace(
    'window.addEventListener(\'keydown\', (e) => {',
    `${modernWorkspaceControllers}\n\nwindow.addEventListener('keydown', (e) => {`
  );
}

// Add hotkeys Ctrl+Space (Drawer), Tab (Zen), F4 (Sidebar) to keydown
const hotkeyInject = `
    // [Ctrl + Space]: UE5 Content Drawer Slide Toggle
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      toggleContentDrawer();
      return;
    }

    // [Tab]: Zen Mode Toggle
    if (e.code === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleZenMode();
      return;
    }

    // [F4]: Right Inspector Sidebar Toggle
    if (e.code === 'F4') {
      e.preventDefault();
      toggleRightSidebar();
      return;
    }
`;

if (!js.includes('UE5 Content Drawer Slide Toggle')) {
  js = js.replace(
    "if (e.code in moveKeys) {",
    `${hotkeyInject}\n    if (e.code in moveKeys) {`
  );
}

// Update updateGateUI to sync footer pills as well
const oldUpdateUIFooter = "const p1 = Math.round(gate1State.progress * 100);";
const newUpdateUIFooter = `const p1 = Math.round(gate1State.progress * 100);
  const fp1 = document.getElementById('footer-pill-g1');
  if (fp1) {
    fp1.innerText = gate1State.status === 'OPEN' ? 'OPEN (4.1m)' : (gate1State.status === 'CLOSED' ? 'CLOSED' : p1 + '%');
    fp1.style.color = gate1State.status === 'OPEN' ? '#34d399' : (gate1State.status === 'CLOSED' ? '#10b981' : '#38bdf8');
  }
  const fp2 = document.getElementById('footer-pill-g2');
  if (fp2) {
    fp2.innerText = gate2State.status === 'OPEN' ? 'OPEN (4.1m)' : (gate2State.status === 'CLOSED' ? 'CLOSED' : Math.round(gate2State.progress * 100) + '%');
    fp2.style.color = gate2State.status === 'OPEN' ? '#34d399' : (gate2State.status === 'CLOSED' ? '#10b981' : '#c084fc');
  }
`;

js = js.replace(oldUpdateUIFooter, newUpdateUIFooter);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js with workspace controllers!');
