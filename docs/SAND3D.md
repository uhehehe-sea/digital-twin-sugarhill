# Sand3D — Hugging Face 오픈 3D 에셋을 트윈으로 가져오기

Sand3D(Sandflow)는 Hugging Face에 공개된 약 10만 6천 개 3D 오브젝트 모음입니다.
가구·생활용품·장식품·기계장치·CAD 부품이 들어 있습니다. 라이선스는 **CC-BY-4.0**
(원작자 표기 필수)이며, 각 에셋은 sand3d 프로그램(Python)과 함께
바로 쓸 수 있는 **.usda 파일**(USD ASCII, Z-up, 미터 단위)로 제공됩니다.

| 데이터셋 | 개수 | 내용 |
|---|---|---|
| `sand3d-objaverse` | 66.9k | 가구·생활용품·차량·전자제품 등 (Objaverse/Sketchfab 원본) |
| `sand3d-cad` | 24.5k | CAD 부품 — 브라켓·플레이트·플랜지·소켓·클립 등 |
| `sand3d-articraft` | 9.2k | 수제 소품 |
| `sand3d-simready` | 2.3k | 시뮬레이션용 에셋 |
| `sand3d-automate` | 3.2k | 자동화·기계장치 |

## 파이프라인

```
Hugging Face datasets-server API (검색)
  → .usda 다운로드 (크기·SHA-256 검증, resolve/main)
  → Blender 헤드리스 변환 USDA → 표준 Y-up GLB (tools/sand3d_to_glb.py)
  → assets/sand3d/<id>.glb + 썸네일(<id>.jpg) + catalog.json 등록
  → 뷰어에서 GLTFLoader로 로드, +90° X 회전(Y-up → Z-up)으로 배치
```

트윈 뷰어(Three.js)는 USDA를 직접 못 읽습니다. 그래서 Blender를 거쳐
GLB로 바꿉니다. GLB는 표준 Y-up으로 유지하고, 배치할 때 뷰어가 회전시켜
트윈의 Z-up 좌표계에 맞춥니다. (GLB가 표준이라 다른 뷰어에서도 그대로 씁니다.)

## CLI로 가져오기

```bash
# 검색 (기본: 가구+CAD)
node tools/sand3d_import.mjs search pallet --dataset objaverse --limit 5
node tools/sand3d_import.mjs search bracket --dataset cad --limit 5
node tools/sand3d_import.mjs search forklift --dataset all --limit 5

# 한 개 가져오기 (검색 결과의 id 사용)
node tools/sand3d_import.mjs import objaverse-000bef5af9d442bc9e3eaf61e03dfc38 --dataset objaverse

# 검색 상위 N개를 한 번에 가져오기
node tools/sand3d_import.mjs import --query pallet --dataset objaverse --limit 3
```

Blender 경로: `BLENDER_EXE`(라이트맵 굽기와 동일) 또는 `BLENDER_PATH`(서버와 동일)
환경변수, 없으면 PATH의 `blender`. 윈도우 노트북:
`$env:BLENDER_EXE='C:\Tools\blender\blender.exe'`.

주의:
- Hugging Face 토큰은 필요 없습니다 (공개 데이터셋).
- datasets-server `/search`가 가끔 500을 냅니다. 그럴 땐 도구가 자동으로
  `/rows`를 페이지 단위로 훑어 필터링하는 폴백으로 전환합니다 (조금 느림).
- Node의 `fetch`는 이 VM의 이그레스 프록시를 안 타서, HTTP는 전부 `curl`로
  처리합니다. 윈도우·맥·리눅스 모두 curl이 기본 제공됩니다.
- `.usda` 원본은 `assets/sand3d/usda/`에 보관합니다 (재변환용).

## 뷰어에서 쓰기

드로어의 **🧊 Sand3D** 버튼으로 모달을 엽니다.

- **가져온 에셋**: `assets/sand3d/catalog.json`을 읽어 썸네일·이름·크기·
  원작자 표기와 함께 보여줍니다. 클릭하면 카메라가 보는 위치에 배치됩니다.
  정적 페이지(GitHub Pages)에서도 됩니다 (카탈로그·GLB가 레포 안에 있음).
- **검색·가져오기**: 로컬 서버(`npm run dev`)에서만 됩니다. 검색어를 치면
  Hugging Face에서 찾아오고, "가져오기"를 누르면 서버가 Blender 변환까지
  마친 뒤 목록에 추가합니다. Pages에서는 이 버튼이 비활성화되고 이유를
  알려줍니다.

서버 API (로컬 전용):
- `GET /api/sand3d/search?q=...&dataset=all|objaverse|cad|...&limit=10`
- `POST /api/sand3d/import {"id": "...", "dataset": "objaverse"}` — EXEC 전용
  (loopback만, Blender 실행. 한 번에 하나씩.)

## 라이선스·표기

가져온 모든 에셋은 CC-BY-4.0입니다. 원작자 표기는
- 각 에셋 카드에 표시,
- `assets/sand3d/catalog.json`의 `attribution` 필드,
- `assets/sand3d/ATTRIBUTION.md`에 누적 기록.

공개 저장소에 올릴 때 표기를 지우지 마세요. Megascans와 달리 Sand3D는
CC-BY라 공개 레포에 GLB를 커밋해도 됩니다 (표기 유지 조건).

## 파일

- `tools/sand3d_import.mjs` — 검색·다운로드·검증·Blender 변환·카탈로그 등록
- `tools/sand3d_to_glb.py` — Blender 스크립트 (USDA → GLB, 치수 출력)
- `viewer/sand3d.js` — 모달·검색·배치 (GLTFLoader, +90° X 회전)
- `viewer/server.mjs` — `/api/sand3d/search`, `/api/sand3d/import`
- `assets/sand3d/catalog.json` — 가져온 에셋 목록
- `assets/sand3d/ATTRIBUTION.md` — CC-BY 표기 누적
