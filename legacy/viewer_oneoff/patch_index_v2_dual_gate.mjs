import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

const startIdx = html.indexOf('<div id="win-gate-anim"');
const endIdx = html.indexOf('<!-- 6. 호버링 플로팅 창 4');

if (startIdx !== -1 && endIdx !== -1) {
  const dualGateHTML = `<div id="win-gate-anim" class="floating-win">
    <div class="win-titlebar" id="win-gate-anim-bar">
      <div class="win-title">
        <span>🚪 화물 적재 게이트 듀얼 시스템 (Sectional + Roll-Up Shutter)</span>
        <span class="win-badge-pill" id="gate-state-pill" style="color:#10b981; border-color:#10b981;">CLOSED</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-gate-anim')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-gate-anim')" title="크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-gate-anim')" title="닫기">✕</button>
      </div>
    </div>
    <div class="win-gate-body">
      
      <!-- 1. 제어 대상 게이트 선택 탭 (동시 제어 vs 개별 제어) -->
      <div style="background:#0c121d; border:1px solid #202d42; border-radius:6px; padding:6px 8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <b style="color:#38bdf8; font-size:11px;">🎮 제어 대상 선택 (Target Gate)</b>
          <span id="label-active-gate" style="font-size:10px; color:#facc15; font-weight:700;">듀얼 동시 가동 (Gate 1 + 2)</span>
        </div>
        <div style="display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:4px;">
          <button class="btn-tb active-green" id="btn-gate-target-both" onclick="setActiveGateTarget('BOTH')" title="게이트 1과 2를 동시에 개폐 (단축키: Space)">
            ⚡ 듀얼 동시 가동
          </button>
          <button class="btn-tb" id="btn-gate-target-g1" onclick="setActiveGateTarget('GATE1')" title="게이트 1 (오버헤드 섹셔널 도어) 단독 제어">
            1️⃣ 게이트 1 (섹셔널)
          </button>
          <button class="btn-tb" id="btn-gate-target-g2" onclick="setActiveGateTarget('GATE2')" title="게이트 2 (고속 롤업 셔터 도어) 단독 제어">
            2️⃣ 게이트 2 (롤업)
          </button>
        </div>
      </div>

      <!-- 2. 게이트 1 (섹셔널 도어 X:12.6m~16.4m) 상태 & 프로그레스 -->
      <div class="gate-status-row" style="padding:6px 10px;">
        <div>
          <div style="font-weight:700; color:#f1f5f9; font-size:11px;">1️⃣ 게이트 1 (오버헤드 섹셔널 도어)</div>
          <div style="font-size:10px; color:#94a3b8;" id="gate1-detail-text">닫힘 상태 (높이: 0.0m / 4.1m)</div>
        </div>
        <span id="gate1-percent-text" style="font-weight:800; font-family:ui-monospace,monospace; color:#38bdf8;">0%</span>
      </div>
      <div class="gate-progress-track" style="height:8px;">
        <div class="gate-progress-bar" id="gate1-progress-bar" style="width:0%;"></div>
      </div>

      <!-- 3. 게이트 2 (고속 롤업 도어 X:18.4m~22.4m) 상태 & 프로그레스 -->
      <div class="gate-status-row" style="padding:6px 10px;">
        <div>
          <div style="font-weight:700; color:#f1f5f9; font-size:11px;">2️⃣ 게이트 2 (고속 롤업 셔터 도어)</div>
          <div style="font-size:10px; color:#94a3b8;" id="gate2-detail-text">닫힘 상태 (높이: 0.0m / 4.1m)</div>
        </div>
        <span id="gate2-percent-text" style="font-weight:800; font-family:ui-monospace,monospace; color:#a78bfa;">0%</span>
      </div>
      <div class="gate-progress-track" style="height:8px;">
        <div class="gate-progress-bar" id="gate2-progress-bar" style="width:0%; background:linear-gradient(90deg, #8b5cf6, #ec4899);"></div>
      </div>

      <!-- 4. 작동 제어 버튼군 (Space 키 및 3D 스위치 박스와 연동) -->
      <div class="gate-btn-group" style="margin-top:2px;">
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

      <!-- 5. 화물문 설치 벽면 선택기 (남측/북측/서측/동측 원클릭 이동) -->
      <div style="background:#0c121d; border:1px solid #202d42; border-radius:6px; padding:6px 8px; margin-top:2px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <b style="color:#38bdf8; font-size:11px;">📍 듀얼 게이트 설치 벽면 (Wall Position)</b>
          <span id="label-gate-wall" style="font-size:10px; color:#10b981; font-weight:700;">남측 벽면 [반대편]</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:4px;">
          <button class="btn-tb active-green" id="btn-wall-south" onclick="relocateCargoGate('SOUTH')" title="남측 벽면으로 이동 (반대편)">
            남측 (Y=0)
          </button>
          <button class="btn-tb" id="btn-wall-north" onclick="relocateCargoGate('NORTH')" title="북측 벽면으로 이동 (기존)">
            북측 (Y=16m)
          </button>
          <button class="btn-tb" id="btn-wall-west" onclick="relocateCargoGate('WEST')" title="서측 벽면으로 이동">
            서측 (X=0)
          </button>
          <button class="btn-tb" id="btn-wall-east" onclick="relocateCargoGate('EAST')" title="동측 벽면으로 이동">
            동측 (X=24m)
          </button>
        </div>
      </div>

    </div>
    <div class="win-resize-r" title="가로 크기 조절 (드래그)"></div>
    <div class="win-resize-b" title="세로 크기 조절 (드래그)"></div>
    <div class="win-corner-grip" title="가로/세로 동시 조절 (드래그)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15L15 21M21 9L9 21M21 3L3 21"/></svg>
    </div>
  </div>\n\n  `;

  html = html.substring(0, startIdx) + dualGateHTML + html.substring(endIdx);
  fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
  console.log('Successfully patched index_v2.html with clean Dual Gate UI!');
} else {
  console.error('Indices not found:', startIdx, endIdx);
}
