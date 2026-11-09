# PLAN — Phase 1: 정직성 수정 (기능 변경 최소)

- 작성: 2026-11-08 (ET), Opus
- 근거: `docs/AUDIT.md`
- 원칙: 기능은 최소한으로 바꾸고 표기를 사실에 맞춘다. G-code 결함 수정(탭, 볼트홀, 포스트)은 Phase 3에서 한다. 여기서는 "검증 안 됨" 표시만 한다.

## 0. 로컬 실행 기반
- `viewer/server.mjs`
  - `baseDir`를 `server.mjs` 위치 기준 상대경로로 바꾼다 (`path.resolve(__dirname, '..')`).
  - `PORT` 환경변수 지원 (기본 8088). 원본 scratch 서버가 8088을 쓰고 있으므로 복사본은 8089로 띄운다.
  - `127.0.0.1`에만 바인딩하고 `Access-Control-Allow-Origin: *`를 제거한다.
  - `/api/rebuild`는 POST만 허용. `solidcraft-cli` 경로는 `SOLIDCRAFT_CLI` 환경변수로 받고, 없으면 기존 기본 경로.
  - `/api/render-blender`는 요청 본문의 `blenderPath`를 무시한다 (`BLENDER_PATH` 환경변수와 고정 후보만).
  - `/lib/*.js` 정적 서빙 추가 (아래 공용 모듈용).
- `npm run dev` → `PORT=8089 node viewer/server.mjs`, `npm test` → `node --test tests/`.

## 1. 공용 순수 함수 분리 (테스트 가능하게)
- `viewer/lib/sketch_core.js` (브라우저 전역 `SketchCore` + Node `module.exports` 겸용)
  - `buildPanelShape(THREE, vertices, holes)` → `THREE.Shape`
  - `buildPanelGeometry(THREE, vertices, holes, thickness, curveSegments)` → `ExtrudeGeometry`
  - `snapValue(v, step)`, `validateThickness(v)` (0 이하·숫자 아님 → 오류 반환, 조용한 40 대체 금지)
  - `chordalError(radius, segments)` — 원 하나를 몇 각형으로 근사했는지에 따른 최대 편차
- `viewer/lib/cam_core.js`
  - `gridNestLayout(part, nesting)` → `{capacity, placed[]}` (G-code와 DXF가 같은 배치를 쓰게. 동작은 기존과 동일: clamp 추가는 Phase 3)
  - `buildNestingDXF(part, nesting)` → 문자열 (기존 출력과 바이트 동일)
- `editor_v2.js`, `polymer_auto_cam_nesting_studio.html`이 이 함수를 호출하도록 교체.

## 2. 테스트 (`tests/`, Node 내장 테스트 러너, three@0.128.0 devDependency)
- 익스트루드 치수: 사다리꼴 프리셋 bbox = 300 × 250 × 40.
- 두께 입력: 0, 음수, 문자열은 거부.
- 홀 위치: 홀 경계 정점들의 중심이 지정 좌표와 일치 (허용 1e-6), 반경 일치.
- 현 오차: `chordalError(8, 24)` ≈ 0.0684.
- DXF 좌표: 원판 내 각 부품의 LINE 4개 / CIRCLE 5개 좌표가 `gridNestLayout` 결과와 일치.
- 스냅: 0.1 / 1 / 10mm 반올림.

## 3. Mode 2 → "빠른 스케치·견적 모드"
- 모달 제목·HUD·로그에서 "정밀/μm/B-Rep" 표현을 제거하고 "빠른 스케치·견적 모드"로 바꾼다.
- 스냅 간격 선택: 0.1 / 1 / 10 mm (기본 10) + ON/OFF 유지.
- 두께: 입력칸 유지, "(4cm)" 고정 문구 제거, 잘못된 값이면 경고하고 익스트루드 안 함.
- 정밀도 3층 표기(3D HUD 아래 고정 줄):
  - 화면 표시: 메쉬, 원 N분할, 최대 현 오차 X mm
  - 모델 수치: 입력 좌표(브라우저 Float32 메쉬) — 정밀 형상 기준(SSoT) 아님
  - 가공 공차: 미검증 (Phase 2 B-Rep 파이프라인에서 다룸)

## 4. 과장 문구 수정 (목록)
| 위치 | 기존 | 변경 |
|---|---|---|
| `index_v2.html` 탭 툴팁, 배지, 설명 | "B-Rep Kernel v0.30", "파라메트릭 B-Rep 솔리드" | "메쉬 기반 (Three.js)", "형상 미리보기용" |
| `editor_v2.js` 로그 `[SolidCraft B-Rep]`, `[CAD B-Rep]`, "226개 B-Rep 건축 쉘" | B-Rep | `[메쉬]` / "226개 건축 쉘 메쉬 (원본 STEP은 B-Rep)" |
| `editor_v2.js` 챔퍼·필렛 | "가공 완료" | **"근사 미리보기 — 실제 챔퍼/필렛 아님 (외곽 축소 박스로 대체)"** 로그 + 버튼 라벨 |
| `polymer...html` 부제·후처리 설명·G-code 헤더 | "네이티브 G-code", "Native" | "G-code 초안 (미검증)". G-code 헤더에 경고 주석: 포스트 선택은 헤더만 바뀜, 기계 투입 전 시뮬레이션·사람 검토 필수 |
| `polymer...html` "Bore H7" | H7 | "보어 내경 (공칭)" |
| `digital_twin_closed_loop_studio.html` CMM 표 | 정적 "+0.00 μm / PASS" | 제목 "테셀레이션 오차 측정 (가공 공차 검증 아님)". 편차·판정 칸을 "미측정"으로, 현 오차 줄만 계산값 유지. 생성 스크립트 마지막 `print`를 사실대로 |

## 5. FPM
- 폴리머 CAM의 FPM 버튼: "FPM (가스켓용 · 밀링 비대상)" 표시, 선택 시 경고 토스트, G-code 다운로드 차단.
- FPM의 3D 프린팅 프리셋은 "비대상"으로 표시.
- 공장 씬 재질(FKM 씰 렌더용)은 렌더 재질이므로 그대로 둔다.

## 6. 하네스
- `blender-cad-tools/verification_harness.py`
  - 모듈 docstring·출력 제목을 "테셀레이션 오차 측정 (가공 공차 검증 아님)"으로.
  - `__main__` 예제는 "예시 입력값 — 실제 측정 아님"으로 표기, "Ready for Machining" 삭제.
- `blender_twin_controller.py` 주석: CMM → 메쉬 자기 일관성 검사.

## 7. 범위 밖 (기록만)
- G-code 탭·볼트홀·포스트·원판 초과·진입이탈 → Phase 3
- `/v2` 초기 캔버스 0×0, `updateOutlinerUI` null 에러 → Phase 1 안에서 원인이 단순하면 수정, 아니면 기록
- 1회성 패치 스크립트 정리 → 이동 목록을 보여준 뒤 결정 (이번엔 안 함)
- 회고록 재작성 → Phase 5

## 완료 기준
- `npm test` 전부 통과.
- 8089 복사본 서버에서 `/v2`, `/polymer`, `/studio` 로드, 새 콘솔 에러 없음.
- 위 4절 문구가 화면에 남아 있지 않음 (grep으로 확인).
