import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';

// -------------------------------------------------------------
// 1. FIX editor_v2.js (materials ReferenceError & DOM crashes)
// -------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// Replace materials.* with archMats.* and define archMats
const archMatsDef = `
    const archMats = {
      STAINLESS_304: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.82 }),
      SAFETY_YELLOW: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.1 }),
      FKM_FLUOROELASTOMER: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.02 })
    };
`;

// Insert archMats definition right before the architectural additions
if (!js.includes('const archMats = {')) {
  js = js.replace(
    "// 1. 사용자 피드백 반영: 현대식 듀얼 도어 화장실 포드",
    `${archMatsDef}\n    // 1. 사용자 피드백 반영: 현대식 듀얼 도어 화장실 포드`
  );
}

// Replace all occurrences of materials. with archMats.
js = js.replace(/materials\.STAINLESS_304/g, 'archMats.STAINLESS_304');
js = js.replace(/materials\.SAFETY_YELLOW/g, 'archMats.SAFETY_YELLOW');
js = js.replace(/materials\.FKM_FLUOROELASTOMER/g, 'archMats.FKM_FLUOROELASTOMER');

// In renderMaterialStudio, make it completely safe if container is null
js = js.replace(
  "const container = document.getElementById('material-swatch-grid');\n  container.innerHTML = '';",
  "const container = document.getElementById('material-swatch-grid') || document.getElementById('mat-grid');\n  if (!container) return;\n  container.innerHTML = '';"
);

// Update initFloatingWindows implementation to bind both event listeners & anchor positions to left/top
const targetFloatingIdx = js.indexOf('function initFloatingWindows() {');
const endFloatingIdx = js.indexOf('// =====================================================================\n// NVIDIA SIMREADY 카탈로그');

if (targetFloatingIdx !== -1 && endFloatingIdx !== -1) {
  const robustFloatingManager = `function initFloatingWindows() {
  const winIds = ['win-inspector', 'win-assets', 'win-gate-anim'];

  winIds.forEach(id => {
    const win = document.getElementById(id);
    if (!win) return;

    // 초기 렌더링 시점에 윈도우의 fixed 좌표를 left/top 픽셀 좌표로 앵커링 변환 (자유로운 크기 조절 보장)
    const initRect = win.getBoundingClientRect();
    if (!win.style.left || win.style.left === 'auto') {
      win.style.left = initRect.left + 'px';
      win.style.top = initRect.top + 'px';
      win.style.width = initRect.width + 'px';
      win.style.height = initRect.height + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';
    }

    // 1. 클릭 시 포커스 및 최상위 레이어 전환
    win.addEventListener('pointerdown', () => {
      activeZIndex += 2;
      win.style.zIndex = activeZIndex;
      winIds.forEach(otherId => {
        const other = document.getElementById(otherId);
        if (other && other !== win) other.classList.remove('active-focus');
      });
      win.classList.add('active-focus');
    }, { passive: true });

    // 2. 창 제어 버튼 직접 바인딩 (닫기, 최소화, 복원)
    const closeBtn = win.querySelector('.win-btn.close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        win.style.display = 'none';
      };
    }
    const collapseBtn = win.querySelector('.win-btn:not(.close)');
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        win.classList.toggle('collapsed');
      };
    }

    // 3. 타이틀바 드래그 이동 (전역 포인터 추적)
    const titlebar = win.querySelector('.win-titlebar');
    if (titlebar) {
      let isDragging = false;
      let startMouseX = 0, startMouseY = 0;
      let startWinLeft = 0, startWinTop = 0;

      titlebar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.win-controls') || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        activeZIndex += 2;
        win.style.zIndex = activeZIndex;

        const rect = win.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startWinLeft = rect.left;
        startWinTop = rect.top;

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
      });
    }

    // 4. 우측 하단 명시적 리사이즈 그립 핸들러
    const cornerGrip = win.querySelector('.win-corner-grip');
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

        const rect = win.getBoundingClientRect();
        // 앵커 확인
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.left = rect.left + 'px';
        win.style.top = rect.top + 'px';

        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startWidth = rect.width;
        startHeight = rect.height;

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nwse-resize';

        const onResizeMove = (ev) => {
          if (!isResizing) return;
          const dw = ev.clientX - startMouseX;
          const dh = ev.clientY - startMouseY;
          const minW = id === 'win-inspector' ? 300 : (id === 'win-assets' ? 360 : 260);
          const minH = id === 'win-inspector' ? 200 : (id === 'win-assets' ? 140 : 140);
          win.style.width = Math.max(minW, Math.min(window.innerWidth - 40, startWidth + dw)) + 'px';
          win.style.height = Math.max(minH, Math.min(window.innerHeight - 60, startHeight + dh)) + 'px';
        };

        const onResizeUp = () => {
          if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
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
  const isHidden = win.style.display === 'none' || getComputedStyle(win).display === 'none';
  if (isHidden) {
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
    win.style.left = (window.innerWidth - 460) + 'px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '440px';
    win.style.height = (window.innerHeight - 78) + 'px';
  } else if (winId === 'win-assets') {
    win.style.left = '18px';
    win.style.right = 'auto';
    win.style.top = (window.innerHeight - 350) + 'px';
    win.style.bottom = 'auto';
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
`;

  js = js.substring(0, targetFloatingIdx) + robustFloatingManager + '\n\n' + js.substring(endFloatingIdx);
}

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully patched editor_v2.js with all fixes!');
