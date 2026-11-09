import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// Read index_v1_backup.html as base
const origHtml = fs.readFileSync(path.join(basePath, 'index_v1_backup.html'), 'utf8');

// Build the clean, professional index_v2.html
let html = origHtml;

// 1. Update Title
html = html.replace(
  '<title>SolidCraft 공간 편집 스튜디오 (B-Rep CAD Kernel × WebGL Editor)</title>',
  '<title>SolidCraft 공간 편집 스튜디오 v2 (Unreal/Blender Floating Panels × PBR AgX × 28+ Assets)</title>'
);

// 2. Replace the layout CSS in <style>
const cleanLayoutCSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      margin: 0;
      padding: 0;
      background-color: #070a10;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
      position: relative;
    }

    /* 상단 Unreal Engine / Blender 스타일 트랜스폼 & 뷰포트 툴바 */
    #top-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      width: 100vw;
      height: 46px;
      background: #121722;
      border-bottom: 1px solid #232d3f;
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 8px;
      z-index: 200;
      overflow-x: auto;
    }
    .tb-group {
      display: flex;
      align-items: center;
      gap: 4px;
      background: #0d1117;
      padding: 3px 5px;
      border-radius: 6px;
      border: 1px solid #232c3d;
    }
    .tb-label {
      font-size: 10px;
      font-weight: 700;
      color: #8b949e;
      padding: 0 5px;
      text-transform: uppercase;
    }
    .btn-tb {
      background: #171e2b;
      color: #c9d1d9;
      border: 1px solid #293447;
      padding: 5px 9px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .btn-tb:hover {
      background: #253147;
      color: #fff;
      border-color: #3b82f6;
    }
    .btn-tb.active-green {
      background: #0f533a;
      border-color: #2ea043;
      color: #3fb950;
    }
    .btn-tb.active-blue {
      background: #1f3a5f;
      border-color: #388bfd;
      color: #58a6ff;
    }

    /* 풀스크린 3D 뷰포트 (상단 툴바 아래 100% 영역 점유) */
    #viewport-container {
      position: absolute !important;
      top: 46px !important;
      left: 0 !important;
      width: 100vw !important;
      height: calc(100vh - 46px) !important;
      background: radial-gradient(circle at 50% 40%, #161e2e 0%, #080c12 100%);
      overflow: hidden;
      outline: none;
      z-index: 1;
    }
    #canvas3d {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }

    /* 카메라 뷰 프리셋 바 */
    #camera-bar {
      position: absolute;
      top: 12px;
      left: 14px;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(13, 17, 23, 0.88);
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid #30363d;
      backdrop-filter: blur(8px);
      max-width: calc(100vw - 480px);
      overflow-x: auto;
    }
    .cam-pills {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .btn-cam {
      background: #21262d;
      border: 1px solid #363b42;
      color: #c9d1d9;
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .btn-cam:hover {
      background: #30363d;
      color: #fff;
    }
    .btn-cam.active {
      background: #1f6feb;
      border-color: #388bfd;
      color: #fff;
      font-weight: 600;
    }

    #drop-banner {
      position: absolute;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(31, 111, 235, 0.9);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 16px;
      border-radius: 20px;
      pointer-events: none;
      display: none;
      z-index: 25;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    }
    #hud-info {
      position: absolute;
      bottom: 12px;
      right: 14px;
      background: rgba(13, 17, 23, 0.82);
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 11px;
      color: #8b949e;
      pointer-events: none;
      z-index: 10;
      backdrop-filter: blur(6px);
      line-height: 1.45;
    }
    #tooltip {
      position: absolute;
      display: none;
      background: rgba(13, 17, 23, 0.95);
      border: 1px solid #58a6ff;
      border-radius: 5px;
      padding: 6px 10px;
      color: #f0f6fc;
      font-size: 11px;
      pointer-events: none;
      z-index: 30;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }

    /* === Unreal Engine / Blender 호버링 플로팅 윈도우 공통 스타일 === */
    .floating-win {
      position: fixed !important;
      background: rgba(13, 18, 28, 0.92) !important;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid #2d3e58 !important;
      border-radius: 8px;
      box-shadow: 0 16px 44px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05);
      z-index: 100;
      display: flex !important;
      flex-direction: column;
      box-sizing: border-box;
      resize: both !important;
      overflow: hidden !important;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .floating-win:hover, .floating-win.active-focus {
      border-color: #58a6ff !important;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.85), 0 0 14px rgba(88, 166, 255, 0.3);
    }
    .floating-win.collapsed {
      height: 38px !important;
      min-height: 38px !important;
      resize: none !important;
    }
    .floating-win.collapsed .win-body,
    .floating-win.collapsed .drawer-header,
    .floating-win.collapsed .asset-grid,
    .floating-win.collapsed .panel-body,
    .floating-win.collapsed .win-gate-body {
      display: none !important;
    }

    .win-titlebar {
      height: 38px;
      min-height: 38px;
      background: linear-gradient(180deg, #182232 0%, #121926 100%);
      border-bottom: 1px solid #233146;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 8px 0 12px;
      cursor: grab;
      user-select: none;
    }
    .win-titlebar:active {
      cursor: grabbing;
    }
    .win-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 6px;
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
      width: 22px;
      height: 22px;
      border-radius: 4px;
      border: 1px solid #2d3c52;
      background: #161e2c;
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
      color: #fff;
      border-color: #58a6ff;
    }
    .win-btn.close:hover {
      background: #da3633;
      color: #fff;
      border-color: #f85149;
    }

    /* 우측 하단 명시적 리사이즈 핸들 */
    .win-corner-grip {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      z-index: 105;
      background: linear-gradient(135deg, transparent 50%, rgba(88, 166, 255, 0.5) 50%, rgba(88, 166, 255, 0.8) 100%);
      border-bottom-right-radius: 7px;
    }

    /* 창 1: 우측 인스펙터 & 아웃라이너 */
    #win-inspector {
      right: 18px;
      top: 58px;
      width: 440px;
      height: calc(100vh - 78px);
      min-width: 320px;
      min-height: 260px;
    }
    #win-inspector .panel-body {
      flex: 1;
      padding: 10px 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* 창 2: 하단 에셋 탐색창 */
    #win-assets {
      left: 18px;
      bottom: 18px;
      width: 820px;
      height: 330px;
      min-width: 400px;
      min-height: 180px;
      max-width: calc(100vw - 500px);
    }
    #win-assets .drawer-header {
      padding: 6px 12px;
      background: #111722;
      border-bottom: 1px solid #202b3d;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    #win-assets .asset-grid {
      flex: 1;
      padding: 10px 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
      overflow-y: auto;
    }

    /* 창 3: 좌측 상단 화물 게이트 시퀀스 제어기 */
    #win-gate-anim {
      left: 18px;
      top: 58px;
      width: 370px;
      height: 250px;
      min-width: 290px;
      min-height: 180px;
    }
    .win-gate-body {
      flex: 1;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 11.5px;
      overflow-y: auto;
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

    /* NVIDIA SimReady 모달 */
    .simready-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 13, 0.85);
      backdrop-filter: blur(10px);
      z-index: 300;
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

// Replace <style> block in html
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>');
const originalStyle = html.substring(styleStart + 7, styleEnd);

// Keep cards, inputs, outliner, buttons styling from original, but prepend our clean layout
html = html.substring(0, styleStart + 7) + cleanLayoutCSS + '\n' + originalStyle + html.substring(styleEnd);

// 3. Write clean <body> DOM
const bodyStart = html.indexOf('<body>');
const bodyEnd = html.indexOf('</body>');

const cleanBodyDOM = `
<body>
  <!-- 1. 상단 툴바 -->
  <div id="top-toolbar">
    <div class="tb-group">
      <span class="tb-label">트랜스폼</span>
      <button class="btn-tb active-blue" id="btn-mode-trans" onclick="setTransformMode('translate')" title="이동 기즈모 (G)">
        ✥ 이동 (G)
      </button>
      <button class="btn-tb" id="btn-mode-rot" onclick="setTransformMode('rotate')" title="회전 기즈모 (R)">
        ↻ 회전 (R)
      </button>
      <button class="btn-tb" id="btn-mode-scale" onclick="setTransformMode('scale')" title="크기조절 기즈모 (T)">
        ⤢ 스케일 (T)
      </button>
      <button class="btn-tb" id="btn-space" onclick="toggleTransformSpace()" title="월드/로컬 좌표계 토글">
        🌐 로컬
      </button>
    </div>

    <div class="tb-group">
      <span class="tb-label">스냅</span>
      <button class="btn-tb" id="btn-snap" onclick="toggleGridSnap()" title="그리드 스냅 토글 (S)">
        🧲 스냅 OFF
      </button>
      <select id="sel-snap-dist" onchange="updateSnapSettings()" style="background:#171e2b; color:#c9d1d9; border:1px solid #293447; border-radius:4px; font-size:11px; padding:3px 5px;">
        <option value="50">50 mm</option>
        <option value="100" selected>100 mm</option>
        <option value="250">250 mm</option>
        <option value="500">500 mm</option>
        <option value="1000">1,000 mm</option>
      </select>
    </div>

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
      <button class="btn-tb" onclick="toggleWinVisibility('win-inspector')" title="디테일 & 아웃라이너 창 토글">
        📐 디테일창
      </button>
      <button class="btn-tb" onclick="toggleWinVisibility('win-assets')" title="에셋 탐색창 토글">
        📦 에셋창
      </button>
      <button class="btn-tb" onclick="openNvidiaCatalogModal()" style="border-color:#76b900; color:#95d624;">
        🌐 NVIDIA SimReady
      </button>
    </div>

    <div class="tb-group">
      <span class="tb-label">렌더러 / 뷰포트</span>
      <button class="btn-tb" id="btn-tonemap" onclick="cycleToneMapping()" title="톤매핑 모드 전환 (AgX / ACESFilmic / Neutral)">
        🎨 AgX (Blender 4.x)
      </button>
      <button class="btn-tb" id="btn-refl-qual" onclick="cycleReflectorQuality()" title="에폭시 바닥 반사 해상도 조절">
        🪞 반사 품질: 균형 (0.5x)
      </button>
      <button class="btn-tb" onclick="openBlenderRenderModal()" style="border-color:#7c3aed; color:#c084fc;" title="Blender 4.x Headless Cycles 실사 패스트레이싱 렌더 트리거">
        ⚡ Cycles 실사 렌더
      </button>
    </div>

    <div class="tb-group" style="margin-left: auto;">
      <button class="btn-tb" onclick="undoLastAction()" title="실행 취소 (Ctrl+Z)">
        ↩ 실행 취소
      </button>
      <button class="btn-tb active-green" onclick="saveSceneLayoutToServer()" title="현재 배치 레이아웃을 서버 scene_layout.json에 동기화 저장">
        💾 레이아웃 저장
      </button>
      <button class="btn-tb" onclick="exportSceneJSON()" title="배치 데이터를 JSON으로 다운로드">
        📥 JSON 내보내기
      </button>
    </div>
  </div>

  <!-- 2. 풀스크린 중앙 3D 뷰포트 -->
  <div id="viewport-container" tabindex="0">
    <div id="camera-bar">
      <div class="cam-pills">
        <button class="btn-cam active" id="btn-pbr-mode" onclick="togglePhotorealMode()" style="background:#7c3aed; border-color:#a78bfa; color:#fff;">⚡ UE5 실사 PBR (IBL+Bloom+SSR ON)</button>
        <button class="btn-cam active" id="btn-floor-refl" onclick="toggleFloorReflection()">🪞 에폭시 바닥 반사 ON</button>
        <button class="btn-cam" id="btn-cad-edges" onclick="toggleCadEdges()">📐 CAD 외곽선 OFF</button>
        <button class="btn-cam" id="btn-xray" onclick="toggleXRay()">외벽 불투명 (실사 실내)</button>
        <button class="btn-cam" onclick="setView('cargo_gate')" style="border-color:#38bdf8; color:#38bdf8;">🚪 화물도어 & 3D 제어버튼</button>
        <button class="btn-cam" onclick="setView('restroom_stairs')" style="border-color:#ec4899; color:#f472b6;">🚻 화장실 2문 & 전면계단</button>
        <button class="btn-cam" onclick="setView('cnc_cell')">🏭 CNC & 금속 3D 프린터 셀</button>
        <button class="btn-cam" onclick="setView('office')">💼 1층 사무실 & 오피스용품</button>
        <button class="btn-cam" onclick="setView('mezzanine')">메자닌 & L자 계단</button>
        <button class="btn-cam" onclick="setView('lounge')">철망 케이지 & 소파 부스</button>
        <button class="btn-cam" onclick="setView('doors')">화물 도어 2종 (북측)</button>
        <button class="btn-cam" onclick="setView('iso')">전체 조감도</button>
        <button class="btn-cam" id="btn-splat" onclick="toggleGaussianSplats()">☁️ 3DGS 스플랫</button>
      </div>
    </div>

    <div id="drop-banner">✨ 3D 공간의 원하는 바닥/작업대 위치에 마우스를 놓아 에셋을 배치하세요 (ESC: 취소)</div>

    <div id="hud-info">
      <b>[카메라 이동]</b> <b style="color:#facc15;">W·A·S·D</b> 이동 | <b style="color:#facc15;">Q·E</b> 하강/상승 | <b>Shift</b> 가속(3x) | 마우스 우클릭 드래그: 룩어라운드<br>
      <b>[에셋 조작]</b> 에셋 카드 드래그 또는 원클릭 스폰 | 선택 후 <b>G(이동) · R(회전) · T(스케일)</b> 기즈모<br>
      카메라 좌표: <span id="hud-coords">X: 28,000, Y: -22,000, Z: 18,500 mm</span>
    </div>

    <div id="tooltip"></div>
    <canvas id="canvas3d"></canvas>
  </div>

  <!-- 3. 호버링 플로팅 창 1: 디테일 & 아웃라이너 (Inspector / Outliner) -->
  <div id="win-inspector" class="floating-win">
    <div class="win-titlebar" id="win-inspector-bar">
      <div class="win-title">
        <span>📐 디테일 & 아웃라이너 (Details / Outliner)</span>
        <span class="win-badge-pill" id="solver-badge">READY</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-inspector')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-inspector')" title="크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-inspector')" title="닫기">✕</button>
      </div>
    </div>

    <div class="panel-body">
      <!-- 트랜스폼 & 크기 조절 카드 -->
      <div class="card">
        <div class="card-title">
          <span>📐 선택 오브젝트 트랜스폼 (TRANSFORM & SCALE)</span>
          <span id="sel-obj-badge" style="color:#3fb950; font-size:10.5px;">선택 없음</span>
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
          <span class="vec3-label">스케일 (배)</span>
          <div class="vec3-field"><span class="vec3-axis axis-x">X</span><input class="vec3-input" type="number" step="0.1" min="0.05" id="inp-scl-x" onchange="applyNumericTransform()"></div>
          <div class="vec3-field"><span class="vec3-axis axis-y">Y</span><input class="vec3-input" type="number" step="0.1" min="0.05" id="inp-scl-y" onchange="applyNumericTransform()"></div>
          <div class="vec3-field"><span class="vec3-axis axis-z">Z</span><input class="vec3-input" type="number" step="0.1" min="0.05" id="inp-scl-z" onchange="applyNumericTransform()"></div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid #1e2636; font-size:10.5px;">
          <span style="color:#8b949e;">외형 실측 치수:</span>
          <span id="sel-bbox-dim" style="color:#79c0ff; font-family:ui-monospace,monospace; font-weight:700;">- × - × - mm</span>
        </div>
        <div style="display:flex; gap:5px; margin-top:6px;">
          <button class="btn-tb" style="flex:1; justify-content:center;" onclick="scaleSelectedUniform(1.25)">➕ 크기 +25%</button>
          <button class="btn-tb" style="flex:1; justify-content:center;" onclick="scaleSelectedUniform(0.8)">➖ 크기 -20%</button>
          <button class="btn-tb" style="flex:1; justify-content:center;" onclick="resetSelectedTransform()">↺ 스케일 리셋</button>
        </div>
        <div style="display:flex; gap:5px; margin-top:5px;">
          <button class="btn-tb" style="flex:1; justify-content:center;" onclick="snapSelectedToFloor()">⬇ 바닥 착지</button>
          <button class="btn-tb" style="flex:1; justify-content:center;" onclick="duplicateSelected()">📋 복제</button>
          <button class="btn-tb" style="flex:1; justify-content:center; color:#f85149; border-color:#da3633;" onclick="deleteSelected()">🗑️ 삭제 (Del)</button>
        </div>
      </div>

      <!-- 아웃라이너 카드 -->
      <div class="card" style="flex:1; display:flex; flex-direction:column; min-height:180px;">
        <div class="card-title">
          <span>🌳 씬 아웃라이너 (SCENE HIERARCHY)</span>
          <span id="outliner-count" style="color:#8b949e; font-size:10.5px;">0개 항목</span>
        </div>
        <div class="outliner-filter-bar">
          <button class="outliner-filter-btn active" onclick="setOutlinerFilter('ALL', this)">전체</button>
          <button class="outliner-filter-btn" onclick="setOutlinerFilter('FURNITURE', this)">가구/부스</button>
          <button class="outliner-filter-btn" onclick="setOutlinerFilter('STRUCTURE', this)">건물/계단</button>
          <button class="outliner-filter-btn" onclick="setOutlinerFilter('DOOR', this)">도어/창</button>
          <button class="outliner-filter-btn" onclick="setOutlinerFilter('ASSETS', this)">배치에셋</button>
        </div>
        <div class="outliner-list" id="outliner-list"></div>
      </div>

      <!-- 재질 스튜디오 카드 -->
      <div class="card">
        <div class="card-title">
          <span>🧪 산업용 PBR 재질 스튜디오</span>
          <span style="color:#58a6ff; font-size:10.5px;">One-Click Apply</span>
        </div>
        <div class="mat-grid" id="mat-grid"></div>
      </div>

      <!-- 로그 카드 -->
      <div class="card">
        <div class="card-title">
          <span>🖥️ SolidCraft 에디터 실시간 로그</span>
        </div>
        <div id="console-log"></div>
      </div>
    </div>
    <div class="win-corner-grip" title="모서리를 드래그하여 창 크기 조절"></div>
  </div>

  <!-- 4. 호버링 플로팅 창 2: 에셋 탐색창 (Asset Content Browser) -->
  <div id="win-assets" class="floating-win">
    <div class="win-titlebar" id="win-assets-bar">
      <div class="win-title">
        <span>📦 에셋 탐색창 (Asset Content Browser)</span>
        <span class="win-badge-pill">28+ ASSETS</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-assets')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-assets')" title="크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-assets')" title="닫기">✕</button>
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
    <div class="asset-grid" id="asset-grid-container"></div>
    <div class="win-corner-grip" title="모서리를 드래그하여 창 크기 조절"></div>
  </div>

  <!-- 5. 호버링 플로팅 창 3: 화물 게이트 시퀀스 제어기 -->
  <div id="win-gate-anim" class="floating-win">
    <div class="win-titlebar" id="win-gate-anim-bar">
      <div class="win-title">
        <span>🚪 화물 게이트 시퀀스 (Sectional Overhead Door)</span>
        <span class="win-badge-pill" id="gate-state-pill" style="color:#10b981; border-color:#10b981;">CLOSED</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-gate-anim')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-gate-anim')" title="크기/위치 리셋">□</button>
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
        <b style="color:#facc15;">💡 3D 인터랙션:</b> 화물도어 우측 벽면의 <b style="color:#38bdf8;">3D 푸시버튼 스위치</b>를 마우스로 직접 클릭하거나 키보드 <b style="color:#4ade80;">[Space]</b> 키를 누르면 게이트 시퀀스가 즉시 재생됩니다.
      </div>
    </div>
    <div class="win-corner-grip" title="모서리를 드래그하여 창 크기 조절"></div>
  </div>

  <!-- NVIDIA SimReady 카탈로그 모달 -->
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

      <div class="simready-grid" id="simready-grid-list"></div>

      <div style="padding:10px 16px; background:#0d131f; border-top:1px solid #1f2d40; display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn-tb" onclick="closeNvidiaCatalogModal()">닫기</button>
      </div>
    </div>
  </div>

  <!-- Blender Cycles Headless 렌더 모달 -->
  <div id="render-modal-overlay">
    <div class="render-modal">
      <div class="render-modal-header">
        <div class="render-modal-title">
          <span>⚡ Blender 4.x Headless Cycles 렌더 파이프라인</span>
          <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:#7c3aed; color:#fff;">AgX Color Space</span>
        </div>
        <button class="icon-btn" onclick="closeBlenderRenderModal()" style="font-size:16px;">✕</button>
      </div>
      <div class="render-modal-body">
        <div class="render-status-card" id="render-status-box">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <b style="color:#58a6ff;">🚀 실시간 원클릭 렌더 트리거 상태</b>
            <span id="render-spinner" style="display:none; color:#facc15;">⏳ 렌더링 연산 진행 중...</span>
          </div>
          <div id="render-status-text">
            웹 에디터에서 수정한 공간 에셋 레이아웃(<code style="color:#3fb950;">scene_layout.json</code>)을 저장하고, 백그라운드에서 Blender CLI를 호출하여 <b>Cycles GPU 패스트레이싱 (256 Samples, OptiX Denoise, AgX)</b> 고화질 렌더링을 생성합니다.
          </div>
          <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
            <label style="font-weight:600; font-size:11px; color:#8b949e; white-space:nowrap;">Blender 실행 파일 경로:</label>
            <input type="text" id="input-blender-path" class="drawer-search" style="flex:1;" placeholder="예: C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe (비워둘 시 자동 탐색)">
            <button class="btn-tb active-green" id="btn-start-render" onclick="executeBlenderHeadlessRender()">⚡ 지금 렌더링 시작</button>
          </div>
        </div>

        <div class="render-preview-box">
          <img id="render-result-img" class="render-preview-img" src="/renders_cycles/cycles_digital_twin_render.png" alt="Blender Cycles AgX 렌더 미리보기">
          <div id="render-loading-overlay" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.75); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; gap:12px;">
            <div style="font-size:24px;">⚙️</div>
            <div style="font-size:13px; font-weight:700;">Blender Cycles GPU 렌더링 진행 중...</div>
            <div style="font-size:11px; color:#94a3b8;">레이아웃 동기화 및 256 SPP 패스트레이싱 연산 중입니다. 잠시만 기다려주세요.</div>
          </div>
        </div>
      </div>
      <div class="render-modal-footer">
        <a id="btn-download-render" class="btn-tb" href="/renders_cycles/cycles_digital_twin_render.png" download="sugarhill_cycles_agx_render.png" target="_blank">📥 렌더 이미지 다운로드</a>
        <button class="btn-tb" onclick="closeBlenderRenderModal()">닫기</button>
      </div>
    </div>
  </div>

  <script src="/editor_v2.js"></script>
</body>
`;

html = html.substring(0, bodyStart) + cleanBodyDOM + html.substring(bodyEnd + 7);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully generated clean index_v2.html!');
