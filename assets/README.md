# assets/ — 조명 · 표면 텍스처 · 모델

`/v2` 화면이 `/assets/…` 경로로 읽는 파일들입니다. 없으면 화면은 이전 방식(텍스처 없는 재질)으로 그대로 뜹니다.

```
assets/
  hdri/empty_warehouse_01_2k.hdr      조명용 HDRI
  surfaces/manifest.json              어느 부재에 어느 텍스처를 입힐지
  surfaces/<세트>/diff.jpg nor.jpg arm.jpg
  models/factory_building.glb         건물 glTF (node tools/build_building_gltf.mjs 로 다시 생성)
```

## 지금 들어 있는 것 (2026-11-09)

모두 **Poly Haven** (https://polyhaven.com) 에서 받은 **CC0** 자료입니다. 출처 표기 의무가 없고 재배포할 수 있습니다.
Megascans를 받을 Fab 로그인이 없어서 임시로 넣은 것이며, 아래 "Megascans로 바꾸기" 대로 교체할 수 있습니다.

| 파일 | Poly Haven 이름 | 쓰이는 곳 |
|---|---|---|
| `hdri/empty_warehouse_01_2k.hdr` (6.6 MB) | Empty Warehouse 01, 2K | 장면 전체 조명·반사 |
| `surfaces/concrete_floor_worn_001/` | Concrete Floor Worn 001, 1K | 바닥 슬래브, 메자닌 슬래브 |
| `surfaces/corrugated_iron/` | Corrugated Iron, 1K | 외벽, 지붕 박공, 내부 라이너 패널 |
| `surfaces/white_plaster_02/` | White Plaster 02, 1K | 계단 벽, 화장실 벽, 사무실 벽 |
| `surfaces/plywood/` | Plywood, 1K | 합판 백보드, 목재 난간, 사무실 문 |
| `surfaces/metal_plate/` | Metal Plate, 1K | 계단 디딤판, 계단참 |

## 텍스처 세트 형식

폴더 하나에 파일 세 개:

| 파일 | 내용 | 색 공간 |
|---|---|---|
| `diff.jpg` | 기본 색 (Albedo / Base Color) | sRGB |
| `nor.jpg` | 노멀 맵, **OpenGL 방식**(초록 채널이 위쪽) | 선형 |
| `arm.jpg` | R = 앰비언트 오클루전, G = 거칠기, B = 금속성 | 선형 |

`arm.jpg`는 언리얼의 ORM 패킹과 같은 순서입니다.

## Megascans로 바꾸기

Megascans는 2026-11-05부터 Fab에서 무료이고, Fab 표준 라이선스로 어떤 엔진·도구에서도 쓸 수 있습니다.
Fab 로그인이 필요해서 Claude가 대신 받을 수 없었습니다. **Epic 계정으로 로그인한 사람이 받아 주세요.**

1. https://www.fab.com/sellers/Quixel%20Megascans 에서 로그인 → 아래 표의 검색어로 찾아 "라이브러리에 추가" → 다운로드.
   - 품질은 **2K** (웹 화면에는 충분, 4K는 파일이 4배).
   - 형식은 텍스처 JPG. 맵은 Base Color, Normal(**OpenGL**), 그리고 ORM(또는 AO·Roughness·Metalness 따로).
2. `assets/surfaces/<새 폴더>/` 에 `diff.jpg`, `nor.jpg`, `arm.jpg` 이름으로 넣습니다.
   - AO·Roughness·Metalness가 따로 왔으면 Claude에게 "ARM으로 합쳐 줘"라고 하면 됩니다.
   - 노멀이 DirectX 방식이면 초록 채널을 뒤집어야 합니다(같이 요청).
3. `surfaces/manifest.json`에서 해당 슬롯의 `"set"`을 새 폴더 이름으로 바꾸고 새로고침.

### 적용된 Megascans (2026-11-11)

사용자가 Fab에서 받은 원본 zip을 `assets/surfaces/ms_*/`로 변환해 연결했습니다. **이 폴더들은 git에 넣지 않습니다**(`.gitignore`, Fab 표준 라이선스의 재배포 조항 미확인). 로컬과 Drive zip에만 있습니다.
폴더가 없는 PC에서는 `manifest.json`의 `fallback`(Poly Haven CC0) 또는 `paint`(단색)로 자동 대체됩니다.

| 폴더 | 슬롯 | 원본 | 메모 |
|---|---|---|---|
| `ms_industrial_concrete_floor` (2K) | `floor` | Industrial Concrete Floor (sl2qedtp) | 평균색이 어두워(97,88,82) 밝기 ×1.55. 더 밝은 회색 바닥으로 바꾸면 더 좋음 |
| `ms_corrugated_metal_white` | `wainscot` | Corrugated Metal Sheet (vlxldfs) | 리브가 세로가 되게 90° 회전(`rotate`), 밝기 ×1.8 + 민트색 |
| `ms_painted_plaster` | `interior_walls` | Painted Plaster (pjBoU0) | 크림색으로 덧입힘 |
| `ms_plywood` | `wood` | Plywood (vf1oairg) | |
| `ms_metal_tread_plate` | `tread_plate` | Metal Tread Plate (ukukfgmew) | |
| `ms_painted_metal_a` | `steel_frame` | Scratched Painted Metal (tduwehmc) | 받은 파일에 거칠기 맵만 있음 → 색은 적갈색 단색 + 실제 거칠기 |
| `ms_painted_metal_b` | `stair_black` | Scratched Painted Metal (tduwejdc) | 위와 같음, 검은색 |
| `ms_scratched_metal` | `rollup`, `vents` | Scratched Metal (uh4obh1c) | 위와 같음, 은회색 |

노멀 맵은 높이 맵과 비교해 모두 OpenGL 방식임을 확인했습니다. 변환 크기는 바닥 2048, 나머지 1024(내장 그래픽 메모리 절약).
아직 안 쓴 것: `Tire Tracks On Concrete` 데칼(데칼 표시 기능이 없음), `Corrugated Metal Sheet (teimcgup)`(어두워서 예비).
아직 없는 것: 벽 상부·지붕 단열 마감(Stained Tarp 등), 철망, 벽 물 자국 데칼, 기름 얼룩 데칼.

### 받을 목록 (2026-11-10 수정 — 건물 내부 마감만, 소품 없음)

목표는 **공장 내부 인테리어(바닥·벽·천장·철골·계단)의 재현**입니다. 팔레트·드럼통·상자 같은 소품은 받지 않습니다.
(이전 목록에 소품 줄이 있었던 것은 잘못이었고 지웠습니다.)

검색어는 Fab에서 Quixel Megascans 판매자 안에서 쓰는 말입니다. Claude가 Fab에 로그인해 확인한 이름이 아니라서,
**정확히 같은 이름이 없으면 "고르는 기준"에 맞는 것**을 고르면 됩니다. 종류는 모두 Surface(머티리얼) 또는 Decal입니다.

| 우선 | 어디에 쓰나 | Fab 검색어 | 고르는 기준 (현장 영상 기준) | 넣을 슬롯 |
|---|---|---|---|---|
| 1 | 바닥 | `Dirty Concrete Floor`, `Stained Concrete`, `Worn Concrete Floor` | 밝은 회색, 광택 낮음, 얼룩과 닳은 자국이 있는 것. 타일 무늬나 깨진 콘크리트는 제외 | `floor` |
| 1 | 벽 하단 골판 | `Painted Corrugated Metal`, `Metal Siding`, `Ribbed Metal Panel` | 흰색이나 옅은 색 도장, 넓은 리브(간격 약 30 cm). 녹슨 것 제외 | `wainscot` |
| 1 | 벽 상부·지붕 안쪽 단열 마감 | `White Plastic Sheet`, `Vinyl`, `Tarp White`, `Insulation` | 흰색~크림색, 약간 주름진 비닐·방수포 느낌 | `wall_upper`, `roof_liner` (지금은 단색) |
| 2 | 철골 (기둥·서까래·중도리·띠장) | `Painted Metal`, `Painted Steel` | 무광 도장면, 살짝 벗겨짐·먼지. 색은 적갈색으로 덧입히므로 색은 상관없음 | `steel_frame` (지금은 단색) |
| 2 | 계단·난간 (검은 철) | `Black Painted Metal`, `Powder Coated Metal` | 검은 무광, 가장자리 마모 | `stair_black` |
| 2 | 계단 디딤판 | `Diamond Plate`, `Metal Tread Plate` | 검정 또는 짙은 회색 | `tread_plate` |
| 2 | 계단 옆판·화장실 벽·2층 사무실 벽 | `Painted Drywall`, `Painted Plaster Wall` | 흰색~크림색, 매끈함 | `interior_walls` |
| 3 | 롤업 도어·팬·루버·히터 | `Galvanized Metal`, `Brushed Aluminum` | 은회색 아연도금 | `rollup`, `vents` |
| 3 | 메자닌 난간 (목재) | `Rough Wood Plank`, `Lumber`, `Plywood` | 밝은 원목, 거친 면 | `wood` |
| 3 | 메자닌 아래 철망 | `Chain Link Fence` | 투명 배경(Opacity 맵)이 있는 것 | 새 슬롯 `cage` |

**데칼(표면 위의 자국 — 소품이 아니라 건물 표면의 일부):**

| 우선 | 어디에 | Fab 검색어 | 고르는 기준 |
|---|---|---|---|
| 1 | 바닥 | `Tire Marks`, `Floor Stain`, `Dirt Decal`, `Concrete Crack` | 검은 타이어 자국, 갈색·검은 얼룩, 가는 균열 |
| 2 | 벽 상부 | `Water Leak`, `Leak Stain`, `Rust Drip` | 세로로 흘러내린 갈색 물 자국 |

**받는 설정:** 품질 2K, 텍스처 JPG, 맵은 Base Color · Normal(**OpenGL**) · Roughness · AO (금속이면 Metalness, 철망·데칼은 Opacity도).
받은 폴더는 그대로 다운로드 폴더(Downloads) 에 두고 알려 주면 Claude가 형식을 맞춰 넣습니다.

**라이선스:** Megascans 원본은 공개 저장소에 올리지 않습니다(재배포 조항 미확인). 로컬과 Drive에만 둡니다.

**받지 않는 것:** 3D 소품(팔레트, 드럼통, 상자, 콘, 선반 등), HDRI(이미 있음), 기계 모델(Megascans에 없음).

## 건물 glTF

`models/factory_building.glb` — `factory_precision.obj`에서 만든 표준 glTF입니다 (226개 부재, 미터 단위, Y-up, 부재 이름 유지, UV 포함: 1 UV = 1 m).

- **Blender**: File → Import → glTF 2.0. 조명·AO를 굽거나(베이크) UV를 다듬을 때.
- **Unreal**: 콘텐츠 브라우저로 끌어다 놓기. Megascans 머티리얼을 슬롯 이름(floor, cladding, …)대로 지정.
- 다시 만들기: `node tools/build_building_gltf.mjs`

웹 화면은 아직 OBJ를 읽고 UV를 실행 중에 만듭니다(같은 투영 방식). Blender에서 조명을 구운 glb가 생기면 화면이 그 파일을 읽도록 바꿉니다.
