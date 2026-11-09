# 뮤즈 전달 메모 — 2026-11-09 Claude Code 작업분

## 받는 파일
`factory-digital-twin_claude_2026-11-09_v3.zip` — 저장소 전체 + **`.git` 기록 포함**(`node_modules/`, `dist/` 제외). 풀고 `npm install && npm test` → 71/71.
같은 날짜에 여러 번 올릴 때는 `_v1`, `_v2`, `_v3` … 으로 구분합니다. **번호가 가장 큰 것이 최신**입니다. (v1·v2는 이름 규칙을 정하기 전에 같은 이름으로 덮어써서 Drive에 남아 있지 않습니다. 내용은 모두 v3에 포함되어 있습니다.)

## 기준과 커밋
- 기준: Drive의 `factory-digital-twin_muse_2026-11-09.zip`을 **받은 그대로** 커밋 `483778d` (`npm test` 47/47).
- 이 zip에는 `.git`이 없었고, **z-fighting·version 수정도 들어 있지 않았습니다.** 뮤즈의 11/9 작업이 GitHub에만 있다면 아래처럼 합쳐 주세요.

```bash
# 이 zip을 푼 폴더에서
git remote add origin https://github.com/<계정>/factory-digital-twin.git
git fetch origin
git log --oneline origin/main -5            # 뮤즈의 최신 커밋 확인
git rebase --onto origin/main 483778d main  # 483778d(=받은 zip) 이후 커밋들을 뮤즈 최신본 위로 옮김
npm test
```
483778d와 뮤즈의 GitHub 최신본이 다른 파일 상태라면 충돌이 날 수 있습니다. 주로 `viewer/server.mjs`(전체 재작성), `viewer/twin_live.js`, `viewer/editor_v2.js`(카메라 부분)에서 날 가능성이 큽니다.

| 커밋 | 내용 |
|---|---|
| aa48aa3 | 서버: 잘못된 URL 한 번에 서버가 죽던 버그, 경로 격리, 본문 413, 실행 API 보호(루프백·토큰·execFile), CAMotics API. Blender 스크립트 경로·샘플·장치 |
| d2aa4fa | 개인 절대경로 전부 제거, 1회성 스크립트 78개 → `legacy/viewer_oneoff/` |
| 23a7637 | DXF 정확도(현 오차 0.02 mm, 원판·블록·미러·SPLINE·ELLIPSE·단위·경고) |
| e9b6793 | 자동 클로즈업, CNC 검증(CAMotics) 창, 이벤트 500개 이후 처리 멈춤 버그, 미리보기 예외 |
| 6ac3280 / 8f192b2 | README·작업기록·공구 교환 설계안, 테스트 정리 |
| 86d4b39 | 카메라: 선택 오브제 중심으로 회전 |
| f67f9c1 | 건물 부재 208개 선택·이동·삭제·복제·되돌리기·저장, 기즈모 실행 취소 시점 수정 |
| f3cc0b2 | 사이드바: 생산·실시간 트윈 패널을 속성 탭에 붙임, 게이트 카드 축소, 재질 스튜디오 기본 접힘 |
| d238dfd | CAD 모델링 탭 → 빠른 스케치 창, 라우터 클램프 절반 크기, **절삭 위치 버그(반 장 밀림) 수정** + 공구 범위만 촘촘한 격자·깊이 색, 한/EN 토글 |

`scene_layout.json`에 `building: { removed, moved, clones }` 필드가 새로 생깁니다. 이전 형식 파일도 그대로 읽힙니다.

자세한 내용: `docs/WORKLOG.md`의 2026-11-09 항목, `README.md`(환경변수 표 포함), `docs/TOOL_CHANGE.md`.

## 확인 안 된 것
- CAMotics·Blender 실제 실행(설치 안 된 컴퓨터).
- 클로즈업 중 반투명 외장 깜빡임(정지 화면으로는 판단 불가).
- 공개 저장소의 **이전 커밋 기록에는 개인 경로가 남아 있음** — 지우려면 기록 재작성 후 강제 푸시(사용자 결정).

## 사용자 결정 대기
- 공구 정보(슬롯·T번호·컨트롤러) → `docs/TOOL_CHANGE.md` 구현
- 공개 저장소 기록 재작성 여부
- Drive `factory_digital_twin_unified.obj` 중복 정리
