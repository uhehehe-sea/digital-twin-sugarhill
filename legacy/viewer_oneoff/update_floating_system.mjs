import fs from 'fs';
import path from 'path';

const p = (process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js';
let js = fs.readFileSync(p, 'utf8');

const targetIdx = js.indexOf('let activeZIndex = 50;');
if (targetIdx === -1) {
  console.error('Target index not found!');
  process.exit(1);
}

const beforeBlock = js.substring(0, targetIdx);

const updatedTrailingBlock = `let activeZIndex = 100;

function initFloatingWindows() {
  const winIds = ['win-inspector', 'win-assets', 'win-gate-anim'];

  winIds.forEach(id => {
    const win = document.getElementById(id);
    if (!win) return;
    const titlebar = win.querySelector('.win-titlebar');
    const cornerGrip = win.querySelector('.win-corner-grip');

    // 1. 포커스 시 최상위 레이어로 전환
    win.addEventListener('pointerdown', () => {
      activeZIndex += 2;
      win.style.zIndex = activeZIndex;
      winIds.forEach(otherId => {
        const other = document.getElementById(otherId);
        if (other && other !== win) other.classList.remove('active-focus');
      });
      win.classList.add('active-focus');
    }, { passive: true });

    // 2. 타이틀바 드래그 이동 (window 레벨 이벤트 추적 - 초고속 마우스 이동 방어)
    if (titlebar) {
      let isDragging = false;
      let startMouseX = 0, startMouseY = 0;
      let startWinLeft = 0, startWinTop = 0;

      const onTitlePointerDown = (e) => {
        if (e.target.closest('.win-controls') || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        activeZIndex += 2;
        win.style.zIndex = activeZIndex;

        const rect = win.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startWinLeft = rect.left;
        startWinTop = rect.top;

        // 고정 위치 해제 및 픽셀 좌표 바인딩
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.left = startWinLeft + 'px';
        win.style.top = startWinTop + 'px';

        document.body.style.userSelect = 'none';

        const onPointerMove = (ev) => {
          if (!isDragging) return;
          const dx = ev.clientX - startMouseX;
          const dy = ev.clientY - startMouseY;
          let newLeft = Math.max(0, Math.min(window.innerWidth - 80, startWinLeft + dx));
          let newTop = Math.max(46, Math.min(window.innerHeight - 40, startWinTop + dy));
          win.style.left = newLeft + 'px';
          win.style.top = newTop + 'px';
        };

        const onPointerUp = () => {
          if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
          }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      };

      titlebar.addEventListener('pointerdown', onTitlePointerDown);
    }

    // 3. 코너 그립 명시적 리사이즈 핸들러
    if (cornerGrip) {
      let isResizing = false;
      let startMouseX = 0, startMouseY = 0;
      let startWidth = 0, startHeight = 0;

      cornerGrip.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        activeZIndex += 2;
        win.style.zIndex = activeZIndex;

        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startWidth = win.offsetWidth;
        startHeight = win.offsetHeight;

        document.body.style.userSelect = 'none';

        const onResizeMove = (ev) => {
          if (!isResizing) return;
          const dw = ev.clientX - startMouseX;
          const dh = ev.clientY - startMouseY;
          const minW = id === 'win-inspector' ? 320 : (id === 'win-assets' ? 380 : 280);
          const minH = id === 'win-inspector' ? 240 : (id === 'win-assets' ? 160 : 160);
          const newW = Math.max(minW, Math.min(window.innerWidth - 40, startWidth + dw));
          const newH = Math.max(minH, Math.min(window.innerHeight - 60, startHeight + dh));
          win.style.width = newW + 'px';
          win.style.height = newH + 'px';
        };

        const onResizeUp = () => {
          if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onResizeMove);
            window.removeEventListener('pointerup', onResizeUp);
            window.removeEventListener('pointercancel', onResizeUp);
          }
        };

        window.addEventListener('pointermove', onResizeMove);
        window.addEventListener('pointerup', onResizeUp);
        window.addEventListener('pointercancel', onResizeUp);
      });
    }
  });
}

function toggleWinCollapse(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.classList.toggle('collapsed');
}

function toggleWinVisibility(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  if (win.style.display === 'none') {
    win.style.display = 'flex';
    activeZIndex += 2;
    win.style.zIndex = activeZIndex;
  } else {
    win.style.display = 'none';
  }
}

function resetWinPosition(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.classList.remove('collapsed');
  win.style.display = 'flex';
  
  if (winId === 'win-inspector') {
    win.style.left = 'auto';
    win.style.right = '18px';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '440px';
    win.style.height = 'calc(100vh - 78px)';
  } else if (winId === 'win-assets') {
    win.style.left = '18px';
    win.style.right = 'auto';
    win.style.top = 'auto';
    win.style.bottom = '18px';
    win.style.width = '820px';
    win.style.height = '330px';
  } else if (winId === 'win-gate-anim') {
    win.style.left = '18px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '370px';
    win.style.height = '250px';
  }
}

function resetFloatingWindows() {
  ['win-inspector', 'win-assets', 'win-gate-anim'].forEach(resetWinPosition);
  log('🪟 모든 호버링 윈도우의 위치와 크기가 최적 기본값으로 초기화되었습니다.');
}

// =====================================================================
// NVIDIA SIMREADY 카탈로그 모달 연동
// =====================================================================
const NVIDIA_SIMREADY_ASSETS = [
  { id: 'AMR_CARTER_V2', name: 'NVIDIA Isaac AMR Carter v2', tag: 'Mobile Robot', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '물리 기반 충돌 바운딩 및 Jetson Orin 센서 마운트 포함' },
  { id: 'FORKLIFT_REACH_TRUCK', name: 'Yale Reach Truck Forklift', tag: 'Warehouse Vehicle', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '고단 팔레트 적재 시뮬레이션을 위한 조향 및 틸트 키네마틱스 지원' },
  { id: 'PALLET_RACK_HEAVY_4TIER', name: 'Heavy Industrial Pallet Rack 4-Tier', tag: 'Logistics Storage', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: 'OpenUSD 물리 속성 및 2.5t 적재 하중 시뮬레이션 적용' },
  { id: 'SPILL_PALLET_CHEMICAL', name: 'Eagle 4-Drum Hazmat Spill Pallet', tag: 'Hazmat Containment', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '고밀도 황색 폴리에틸렌 내화학 드럼 보관 팔레트' },
  { id: 'TOOL_CHEST_HEAVY_CABINET', name: 'Kennedy Heavy Duty Tool Chest', tag: 'Shop Equipment', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '12단 정비 공구 캐비닛 및 자재 적재 벤치' },
  { id: 'SAFETY_SHOWER_EYEWASH', name: 'Haws Emergency Eyewash & Drench Shower', tag: 'Safety Facility', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: 'OSHA / ANSI Z358.1 규격 인증 긴급 세안 및 샤워 부스' }
];

function openNvidiaCatalogModal() {
  const modal = document.getElementById('modal-nvidia-catalog');
  const grid = document.getElementById('simready-grid-list');
  if (!modal || !grid) return;

  grid.innerHTML = NVIDIA_SIMREADY_ASSETS.map(asset => \`
    <div class="simready-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; font-size:12px; color:#f1f5f9;">\${asset.name}</span>
        <span class="win-badge-pill" style="border-color:#76b900; color:#76b900;">\${asset.tag}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; line-height:1.4;">\${asset.desc}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span style="font-size:10px; color:#64748b; font-family:ui-monospace,monospace;">USD / SimReady</span>
        <button class="btn-tb active-green" onclick="spawnAssetInstance('\${asset.id}', 14000, 8000, 0); closeNvidiaCatalogModal();" style="padding:4px 8px; font-size:11px;">
          ➕ 씬에 즉시 스폰
        </button>
      </div>
    </div>
  \`).join('');

  modal.style.display = 'flex';
}

function closeNvidiaCatalogModal() {
  const modal = document.getElementById('modal-nvidia-catalog');
  if (modal) modal.style.display = 'none';
}

// =====================================================================
// 화물 적재 섹셔널 게이트 애니메이션 시퀀스 & 3D 인터랙티브 버튼
// =====================================================================
let gateState = {
  status: 'CLOSED',
  progress: 0.0,
  targetProgress: 0.0,
  speed: 0.35
};

let gatePanelsGroup = null;
let gateShaftGroup = null;
let gateWarningLight = null;
let gateButtonStationMesh = null;

function triggerGateAction(action) {
  if (action === 'OPEN') {
    gateState.targetProgress = 1.0;
    gateState.status = 'OPENING';
    log('🚪 화물 적재 게이트 [열기] 시퀀스가 시작되었습니다. (천장 4.1m 틸트 상승)');
  } else if (action === 'CLOSE') {
    gateState.targetProgress = 0.0;
    gateState.status = 'CLOSING';
    log('🚪 화물 적재 게이트 [닫기] 시퀀스가 시작되었습니다.');
  } else if (action === 'STOP') {
    gateState.targetProgress = gateState.progress;
    gateState.status = 'STOPPED';
    log('🛑 화물 적재 게이트 작동이 정지되었습니다.');
  } else if (action === 'TOGGLE') {
    if (gateState.targetProgress > 0.5) {
      triggerGateAction('CLOSE');
    } else {
      triggerGateAction('OPEN');
    }
    return;
  }
  updateGateUI();
}

function updateGateUI() {
  const pill = document.getElementById('gate-state-pill');
  const bar = document.getElementById('gate-progress-bar');
  const percentText = document.getElementById('gate-percent-text');
  const detailText = document.getElementById('gate-detail-text');
  const tbBtn = document.getElementById('btn-tb-gate-toggle');

  const p = Math.round(gateState.progress * 100);
  if (percentText) percentText.textContent = p + '%';
  if (bar) bar.style.width = p + '%';

  const curH = (gateState.progress * 4.1).toFixed(2);

  if (gateState.status === 'OPENING') {
    if (pill) { pill.textContent = 'OPENING...'; pill.style.color = '#38bdf8'; pill.style.borderColor = '#38bdf8'; }
    if (detailText) detailText.textContent = \`상승 중... (높이: \${curH}m / 4.1m)\`;
    if (tbBtn) tbBtn.textContent = '🚪 게이트 닫기 (Space)';
  } else if (gateState.status === 'CLOSING') {
    if (pill) { pill.textContent = 'CLOSING...'; pill.style.color = '#f59e0b'; pill.style.borderColor = '#f59e0b'; }
    if (detailText) detailText.textContent = \`하강 중... (높이: \${curH}m / 4.1m)\`;
    if (tbBtn) tbBtn.textContent = '🚪 게이트 열기 (Space)';
  } else if (gateState.progress >= 0.99) {
    if (pill) { pill.textContent = 'OPEN (4.1m)'; pill.style.color = '#34d399'; pill.style.borderColor = '#34d399'; }
    if (detailText) detailText.textContent = '완전 개방 상태 (적재 차량 진입 가능)';
    if (tbBtn) tbBtn.textContent = '🚪 게이트 닫기 (Space)';
  } else if (gateState.progress <= 0.01) {
    if (pill) { pill.textContent = 'CLOSED'; pill.style.color = '#10b981'; pill.style.borderColor = '#10b981'; }
    if (detailText) detailText.textContent = '닫힘 상태 (높이: 0.0m / 4.1m)';
    if (tbBtn) tbBtn.textContent = '🚪 게이트 열기 (Space)';
  } else {
    if (pill) { pill.textContent = 'STOPPED'; pill.style.color = '#ef4444'; pill.style.borderColor = '#ef4444'; }
    if (detailText) detailText.textContent = \`정지됨 (높이: \${curH}m / 4.1m)\`;
  }
}

// 3D 뷰포트 내 화물 게이트 푸시버튼 클릭 감지
window.addEventListener('pointerdown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.floating-win')) return;
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (gateButtonStationMesh) {
    const hits = raycaster.intersectObjects(gateButtonStationMesh.children, true);
    if (hits.length > 0 && hits[0].object.userData.isGateBtn) {
      const action = hits[0].object.userData.action;
      triggerGateAction(action);
      e.stopPropagation();
    }
  }
}, true);

// 단축키 Space: 게이트 작동 토글
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    triggerGateAction('TOGGLE');
  }
});

// 브라우저 윈도우 글로벌 바인딩 (HTML 인라인 이벤트 핸들러 보증)
window.initFloatingWindows = initFloatingWindows;
window.toggleWinCollapse = toggleWinCollapse;
window.toggleWinVisibility = toggleWinVisibility;
window.resetWinPosition = resetWinPosition;
window.resetFloatingWindows = resetFloatingWindows;
window.openNvidiaCatalogModal = openNvidiaCatalogModal;
window.closeNvidiaCatalogModal = closeNvidiaCatalogModal;
window.triggerGateAction = triggerGateAction;

// DOM 로드 완료 시 즉시 플로팅 윈도우 시스템 활성화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFloatingWindows);
} else {
  initFloatingWindows();
}
`;

js = beforeBlock + updatedTrailingBlock;
fs.writeFileSync(p, js, 'utf8');
console.log('Successfully updated floating window management in editor_v2.js!');
