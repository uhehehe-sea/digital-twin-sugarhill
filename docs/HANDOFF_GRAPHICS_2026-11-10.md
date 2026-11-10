# 그래픽 강화 프로젝트 — 이어받기 메모 (2026-11-10, Fable 작성)

이 문서 하나로 다음 담당(어느 모델이든)이 바로 이어갈 수 있게 압축했습니다. 자세한 근거는 끝의 "읽을 문서".

## 0. 사용자와 규칙
- 사용자: 공장 운영자(비개발자). 한국어로 짧게 지시. 답은 한국어, 쉬운 말, **한 것 / 안 한 것 구분**, 화면으로 확인.
- 목표: **공장 내부 인테리어(바닥·벽·천장·철골·계단·문)를 영상과 구분 안 될 만큼 재현.** 소품(팔레트·드럼통·상자 등)은 **넣지 않음**.
- 판정 기준: 영상 프레임과 같은 위치·각도의 뷰어 화면을 나란히 비교.
- 확인 못 한 것은 확인했다고 쓰지 않기. 추정은 "가정값" 표시. 사람이 찍힌 프레임은 저장소에 넣지 않기.
- Megascans 원본은 공개 저장소에 커밋 금지(재배포 조항 미확인) → 로컬·Drive만.
- Drive 업로드: `H:\내 드라이브\factory-digital-twin_claude_<날짜>_v<N>.zip` (같은 날은 번호 증가, 현재 11/10 **v4**가 최신 zip, v5는 에셋 목록 md). zip은 임시 폴더에 만든 뒤 복사(tar가 한글 경로에 직접 못 씀).
- PC: Intel UHD 내장 그래픽 → 실시간 효과 최소, 대부분 굽기로 해결.

## 1. 실행
```bash
npm install
npm run dev          # http://127.0.0.1:8089/v2
npm test             # 97개 통과가 기준
node tools/build_factory_shell.mjs   # building.config.json → factory_precision.obj
node tools/bake_lightmap.mjs         # 조명 굽기(Node, 약 6분) → assets/lightmap/
node tools/build_building_gltf.mjs   # → assets/models/factory_building.glb (Blender 입력용)
```

## 2. 4단계 계획과 현재 위치

| 단계 | 내용 | 담당(제안) | 상태 |
|---|---|---|---|
| 1 | 영상 재분석, 치수·구조 조사 | Fable | **완료** — `docs/STRUCTURE_SURVEY_2026-11-10.md` |
| 2 | 건물 생성기에 구조 반영 | Opus/Fable | **완료** — 커밋 `d6de815` |
| 3 | Blender Cycles로 빛 굽기 + 바닥 반사 | Fable | **시작 전** (아래 4절) |
| 4 | 재질(Megascans) 적용 | Opus | 사용자가 Fab에서 다운로드 중 (5절) |
| 5 | 카메라 마무리(노출·색·빛 번짐), 영상과 최종 비교 | Fable | 시작 전 |

## 3. 지금까지 된 것 (요약)
- 건물: 60.96 × 30.48 m, 처마 6.1 m, 8칸(7.62 m), 가운데 기둥 1줄. 좌표 X = 길이(0 = 먼 끝벽, 최대 = 사무실 쪽 끝벽), Y = 폭(0 = 메자닌 쪽 긴 벽, 최대 = 화물벽), mm, Z-up.
- 구조(모두 편집 가능한 낱개 부재, 365개): 메자닌 + 케이지, 서쪽 계단 + 화장실 2칸, **유리 출입문(사무실 쪽 끝벽, Y 17.0~18.8)**, 화물벽 섹셔널 도어(X 36) → 출구문(39.6) → 롤업 도어(43.3), 출구문 3개, 셔터 팬 5, 루버 4, 유닛 히터 3, 둥근 LED 16 + 메자닌 아래 띠 조명 4(가정값), **동쪽 계단(형태 가정값)**.
- 조명: `tools/bake_lightmap.mjs`(직접광 + 간접광 2회 + 문으로 들어오는 바깥 빛 + 바닥 얼룩·벽 물때) → `assets/lightmap/{lightmap.png, lightmap_uv.bin, lightmap.json}`.
- 뷰어 `viewer/visual_upgrade.js`: 라이트맵 자동 적용(`applyLightmap`), 구운 부재는 확산광을 라이트맵에서만 받음(`bakedOnly` 셰이더 패치), 반사는 실내 큐브 캡처, 기계 그림자는 바닥 위 `Baked_Shadow_Catcher`, 화질 단계(자동/높음/균형/기본).

## 4. 3단계 할 일 — Blender 굽기

**막힌 곳: Blender 실행.** Microsoft Store로 5.3.0이 설치됐지만(`C:\Program Files\WindowsApps\BlenderFoundation.Blender_5.3.0.0_x64__ppwjx1n5r4v9t\Blender\blender.exe`) 직접 실행은 "Access is denied". 별칭은 `%LOCALAPPDATA%\Microsoft\WindowsApps\blender-launcher.exe`뿐. 공식 서버 직접 다운로드(winget)는 403.
시도 순서: (1) `blender-launcher.exe -b --version`이 인수를 넘기는지 확인 → (2) 안 되면 사용자에게 blender.org에서 **Windows 포터블 zip**을 받아 `C:\Tools\blender\`에 풀어 달라고 요청 → 경로는 환경변수 `BLENDER_EXE`로만 받기(저장소에 개인 경로 금지).

Blender가 되면:
1. `tools/bake_blender.py`(신규, `blender -b --python`): `assets/models/factory_building.glb` 가져오기 → 등기구(`HighBay_LED_*`)를 발광체로, 유리(`Main_Glass_Entry_Panel*`)는 투명 → 부재별 두 번째 UV(라이트맵용) 펼치기 → Cycles Diffuse(Direct+Indirect, Color 제외) 굽기 + 노이즈 제거 → 한 장의 아틀라스.
2. **출력 형식은 지금 뷰어가 읽는 것과 같게** 맞추면 뷰어 수정이 필요 없음: `lightmap.png`(sRGB로 인코딩한 조도 ÷ maxE), `lightmap_uv.bin`(부재별 Float32 UV, **OBJLoader 정점 순서** = 면을 부채꼴로 삼각분할한 순서), `lightmap.json`(`size`, `maxE`, `parts: {이름: [float 오프셋, 정점 수]}`). 정점 순서가 어긋나면 뷰어가 그 부재를 건너뜀(`pos.count !== e[1]`) → glb가 아니라 OBJ를 Blender로 가져오는 편이 순서 맞추기 쉬울 수 있음. 어려우면 뷰어가 glb(UV2 포함)를 직접 읽도록 바꾸는 쪽이 정석.
3. 바닥 반사: 지금은 홀 가운데 한 점의 큐브 캡처. 홀/메자닌 아래 등 구역별 캡처 + 박스 투영으로 **천장등이 바닥에 제 위치로 비치게**(`captureInterior` 확장, 바닥 재질 roughness 맵 필요).
4. 유리문이 불투명한 파란 판으로 보이는 문제 수정(editor_v2.js의 `Main_Glass_Entry` 재질 또는 manifest 슬롯에 투명 유리 추가).
5. Node 베이커는 Blender 없는 PC용 예비로 유지.

## 5. 4단계 — 재질 (사용자가 Fab에서 받는 중)
- 받을 목록: `assets/README.md`의 "받을 목록" (내부 마감 10종 + 표면 데칼 2종, **소품 없음**). Drive 사본: `..._v5_에셋목록_내부마감만.md`.
- 받은 파일은 사용자 Downloads에 있음 → `assets/surfaces/<이름>/{diff,nor,arm}.jpg`로 변환(AO·Roughness·Metalness → ARM 합치기, 노멀 DirectX면 초록 채널 반전) → `assets/surfaces/manifest.json` 슬롯의 `set` 교체. `wall_upper`, `roof_liner`, `steel_frame`은 지금 단색(`paint`) → `set` + `tint`로 전환.
- 재질 관찰(영상): 바닥은 **매우 지저분함**(타이어 자국, 갈색 얼룩, 흰 가루, 균열), 벽 상부에 세로 갈색 물 자국, 하단 골판 윗선 들쭉날쭉, 철골은 짙은 적갈색 무광. 데칼 표시 기능은 아직 없음(구현 필요: 바닥 위 얇은 투명 평면 또는 라이트맵에 굽기).
- 재질을 바꾸면 반사율이 달라지므로 조명을 다시 굽기.

## 6. 현장 확인 대기 (없으면 가정값 유지)
1. 유리 출입문이 화물벽 쪽 모서리에서 몇 m인지.
2. 동쪽 계단 사진 2장(정면·옆) — 실제는 꺾이는 계단일 가능성 큼.
3. 메자닌 깊이·길이, 화장실 깊이, 건물 안쪽 길이·폭.

## 7. 알려진 문제
- 유리문 불투명(4절-4). 팬·루버·히터·먼 쪽 출구문 위치는 확신 낮음.
- 건물 부재를 편집기에서 옮기면 구운 그림자는 그대로 남음(다시 구워야 함).
- 콘솔에 nvidia 텍스처 404 10건(기존), `Uncaught SyntaxError` 1건은 이전 세션의 잔여 기록으로 보이나 **새 창에서 재확인 필요**.
- 기계(CNC)는 상자 모양 그대로(범위 밖). 트윈 1~4단계 엔진은 UI에 미연결(`docs/NEXT_STEPS_FOR_OPUS.md` A절).
- 영문 사용설명서 PDF는 UI 정리 전 화면.
- 원격 저장소에 push한 적 없음. Drive의 `..._v3_2차작업지시_통합.md`는 현재 상태(폭 30.48 m, 구조물, 라이트맵)를 모르고 쓰인 문서이며 "구조물 재현 금지"는 이후 사용자 지시("큰 구조는 실제와 똑같이")로 바뀜.

## 8. 읽을 문서
`docs/STRUCTURE_SURVEY_2026-11-10.md`(구조 조사·장면 시각) · `docs/LIGHTING_NOTES.md`(조명 설계, 굽기 사용법) · `docs/WORKLOG.md`(날짜별 기록) · `docs/SITE_REFERENCE_2026-11-09.md`(치수 근거) · `assets/README.md`(에셋 형식·받을 목록) · `building.config.json`(치수와 확신도).
영상 원본: 사용자 Downloads의 `copy_0AF1B3ED-….MOV`(70.8초). 주요 장면: 43.8~45.3초(화물벽 정면), 42.0초(서쪽 계단), 63.0~64.2초(유리문·동쪽 계단), 66.5~67.0초(길이 방향), 68.7초(메자닌 앞면).
