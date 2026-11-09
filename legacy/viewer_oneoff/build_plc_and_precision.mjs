import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// ---------------------------------------------------------------------
// 1. UPDATE index_v2.html: Add PLC Window, Toolbar Button, CAD Card
// ---------------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// A. Add Toolbar button for PLC Panel
const plcToolbarBtn = `
      <div class="tb-group">
        <span class="tb-label">가상 제어기 (PLC)</span>
        <button class="btn-tb active-green" id="btn-tb-plc" onclick="toggleWinVisibility('win-plc')" title="산업용 가상 PLC 시뮬레이터 & I/O 래더 랙 토글">
          ⚡ 가상 PLC 래더 [I/O 버스]
        </button>
      </div>
`;
html = html.replace('<div class="tb-group">\n      <span class="tb-label">화물 게이트</span>', `${plcToolbarBtn}\n    <div class="tb-group">\n      <span class="tb-label">화물 게이트</span>`);

// B. Add CAD Machining Card (Bevel / Chamfer & Hole) into Inspector Panel
const cadMachiningCardHTML = `
      <!-- CAD 정밀 가공 도구: 모서리 챔퍼/베벨 & 볼트 홀 타공 -->
      <div class="card" id="card-cad-tools">
        <div class="card-title">
          <span>🛠️ CAD 정밀 가공 (BEVEL & DRILL)</span>
          <span style="color:#38bdf8; font-size:10.5px;">WASM B-Rep Modeler</span>
        </div>
        <div style="font-size:10.5px; color:#8b949e; line-height:1.4; margin-bottom:8px;">
          선택한 기계 부재에 <b>0.5~15mm 모서리 챔퍼(Chamfer)</b>를 형성하거나 <b>M6/M8 볼트 관통홀</b>을 실시간 절삭 가공합니다.
        </div>
        <div class="vec3-row" style="margin-bottom:6px;">
          <span class="vec3-label" style="width:75px;">베벨 반경</span>
          <div class="vec3-field">
            <span class="vec3-axis" style="background:#0284c7; color:#fff;">R</span>
            <input class="vec3-input" type="number" id="inp-bevel-radius" value="1.5" min="0.2" max="25" step="0.5" style="width:60px;">
            <span style="font-size:10px; color:#8b949e; margin-left:4px;">mm</span>
          </div>
          <button class="btn-tb active-blue" onclick="applyChamferToBevelSelected()" style="flex:1; justify-content:center; padding:4px 6px;">
            ✨ 모서리 챔퍼 적용
          </button>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn-tb" onclick="applyDrillHoleToSelected('M6', 6.5)" style="flex:1; justify-content:center; border-color:#38bdf8; color:#38bdf8;">
            🕳️ M6 볼트홀 (Ø6.5)
          </button>
          <button class="btn-tb" onclick="applyDrillHoleToSelected('M8', 8.5)" style="flex:1; justify-content:center; border-color:#eab308; color:#facc15;">
            🕳️ M8 볼트홀 (Ø8.5)
          </button>
          <button class="btn-tb" onclick="resetMachiningGeometry()" style="padding:4px 8px;" title="원래 지오메트리로 복원">
            ↺ 원본
          </button>
        </div>
      </div>
`;
html = html.replace('<!-- 아웃라이너 카드 -->', `${cadMachiningCardHTML}\n      <!-- 아웃라이너 카드 -->`);

// C. Add Floating Virtual PLC Window `#win-plc`
const plcWindowHTML = `
  <!-- 6. 호버링 플로팅 창 4: 가상 산업용 PLC 시뮬레이터 & I/O 랙 -->
  <div id="win-plc" class="floating-win" style="top:58px; left:410px; width:480px; height:370px; min-width:380px; min-height:260px;">
    <div class="win-titlebar" id="win-plc-bar" style="background:linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
      <div class="win-title">
        <span style="color:#38bdf8;">⚡ 산업용 가상 PLC (Virtual PLC Engine)</span>
        <span class="win-badge-pill" id="plc-scan-pill" style="color:#10b981; border-color:#10b981;">RUN | 50Hz (20ms)</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-plc')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-plc')" title="크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-plc')" title="닫기">✕</button>
      </div>
    </div>
    
    <div class="win-body" style="padding:10px 12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; font-size:11px;">
      <!-- PLC 상태 요약 바 -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0b111c; padding:6px 10px; border-radius:6px; border:1px solid #1e2b3e;">
        <div>
          <b style="color:#f1f5f9;">CPU: S7-1500 Virtual SoftPLC</b>
          <span style="color:#8b949e; font-size:10px; margin-left:6px;">Cycle: <span id="plc-cycle-ms">20.0ms</span></span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-tb" id="btn-plc-estop" onclick="toggleVirtualEstop()" style="background:rgba(239,68,68,0.2); border-color:#ef4444; color:#f87171; padding:2px 8px; font-size:10px;">
            🚨 비상정지 E-STOP [정상]
          </button>
        </div>
      </div>

      <!-- I/O 모듈 랙: 디지털 입력 (DI) & 디지털 출력 (DO) -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <!-- 디지털 입력 (센서 신호) -->
        <div style="background:#0d1420; border:1px solid #1f2c3f; border-radius:6px; padding:8px;">
          <div style="font-weight:700; color:#38bdf8; font-size:10.5px; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>📥 DIGITAL INPUTS (DI)</span>
            <span style="color:#64748b; font-size:9.5px;">클릭하여 강제 토글</span>
          </div>
          <div id="plc-di-grid" style="display:flex; flex-direction:column; gap:4px;">
            <!-- JS 렌더링 -->
          </div>
        </div>

        <!-- 디지털 출력 (액추에이터/모터 기동) -->
        <div style="background:#0d1420; border:1px solid #1f2c3f; border-radius:6px; padding:8px;">
          <div style="font-weight:700; color:#34d399; font-size:10.5px; margin-bottom:6px; display:flex; justify-content:space-between;">
            <span>📤 DIGITAL OUTPUTS (DO)</span>
            <span style="color:#64748b; font-size:9.5px;">실시간 구동 상태</span>
          </div>
          <div id="plc-do-grid" style="display:flex; flex-direction:column; gap:4px;">
            <!-- JS 렌더링 -->
          </div>
        </div>
      </div>

      <!-- 실시간 래더 로직 (Ladder Logic Execution Rungs) -->
      <div style="background:#080d14; border:1px solid #1c2738; border-radius:6px; padding:8px;">
        <div style="font-weight:700; color:#fbbf24; font-size:10.5px; margin-bottom:6px;">
          🪜 실시간 래더 렁 (LADDER RUNGS & INTERLOCKS)
        </div>
        <div id="plc-ladder-rungs" style="display:flex; flex-direction:column; gap:4px; font-family:ui-monospace,monospace; font-size:10px;">
          <!-- JS 렌더링 -->
        </div>
      </div>

      <!-- 아날로그 레지스터 & 장비 가동 수치 -->
      <div style="display:flex; justify-content:space-between; background:#0e1522; padding:6px 10px; border-radius:6px; border:1px solid #1f2b3e; font-size:10.5px;">
        <div>CNC 스핀들: <b id="plc-val-rpm" style="color:#38bdf8;">0 RPM</b></div>
        <div>3DP 아르곤 O2: <b id="plc-val-o2" style="color:#4ade80;">18 PPM (정상)</b></div>
        <div>게이트 인버터: <b id="plc-val-gate" style="color:#facc15;">0.0 Hz</b></div>
      </div>
    </div>
    <div class="win-corner-grip" title="모서리를 드래그하여 창 크기 조절"></div>
  </div>
`;

html = html.replace('<!-- NVIDIA SimReady 카탈로그 모달 -->', `${plcWindowHTML}\n  <!-- NVIDIA SimReady 카탈로그 모달 -->`);

// D. Add Toolbar toggle for PLC window
html = html.replace(
  '<button class="btn-tb" onclick="toggleWinVisibility(\'win-inspector\')"',
  '<button class="btn-tb" onclick="toggleWinVisibility(\'win-plc\')" title="가상 PLC 창 토글" style="border-color:#38bdf8; color:#38bdf8;">⚡ PLC랙</button>\n      <button class="btn-tb" onclick="toggleWinVisibility(\'win-inspector\')"'
);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html with Virtual PLC and CAD Machining controls!');
