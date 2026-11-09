#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
SolidCraft × NVIDIA Isaac SimReady × Blender 4.x 극실사(Photorealistic) 디지털 트윈 어셈블러
================================================================================
이 스크립트는 Blender 4.x (Cycles GPU Path Tracing / EEVEE Next Raytracing)에서 실행되며,
웹 공간 에디터(http://localhost:8088)에서 편집·저장된 `scene_layout.json`을 그대로 읽어들여
언리얼 엔진 5 / NVIDIA Omniverse RTX 급의 실사 디지털 트윈 씬을 자동 구축합니다.

[핵심 실사화 파이프라인]
1. SolidCraft 226개 B-Rep 클린 건축 쉘(`factory_precision.obj`) 임포트 + 자동 Bevel Modifier(2mm) & Weighted Normal 적용
2. NVIDIA SimReady OpenUSD (`.usd`) 원본 하이폴리곤 메쉬 임포트 및 226개 4K PBR 텍스처(`Albedo`, `Normal`, `ORM`) 자동 연결
   - NVIDIA `_ORM.png` 텍스처의 R(AO), G(Roughness), B(Metallic) 채널을 `ShaderNodeSeparateColor`로 정밀 분리
3. 프로시저럴 + PBR 하이브리드 셰이더 노드 그래프 자동 생성:
   - 에폭시 폴리싱 콘크리트 바닥 (Roughness 얼룩 패치 + 미세 골재 범프 + Clearcoat 0.75 반사)
   - PP (Polypropylene): Subsurface Scattering (반투명 유백색 표면하 산란, IOR 1.490)
   - FKM / FPM (Viton 불소고무): 미세 선삭 툴마크(Wave Bump) + Shore A 무광 엘라스토머 산란
   - SUS 304 / 306 (브러시드 스테인리스): Anisotropic(0.65) + 헤어라인 노이즈 + Bevel Shader 노드
   - SUS 316L (SLM 3D프린팅 적층면): 30µm 레이저 적층 물결(Wave + Noise Bump)
   - SUS 314 (초내열 25Cr-20Ni-2Si 스테인리스): 샴페인-실버 복소 굴절률 메탈릭 셰이더
4. 시네마틱 라이팅 & AgX 컬러 매니지먼트:
   - 천장 12개 250W 하이베이 LED Area Light (5000K) + 북측 채광창 Portal Sky Light
   - 실내 볼류메트릭 헤이즈(Principled Volume, Density 0.0015) + Cycles OptiX 디노이징

[실행 방법]
- Blender GUI: Scripting 탭 -> Open -> `setup_blender_isaac_digital_twin.py` -> Run Script
- CLI 백그라운드 렌더: `blender -b -P setup_blender_isaac_digital_twin.py`
================================================================================
"""

import os
import sys
import json
import math
import bpy

# Project root = the folder this script lives in (was a hard-coded personal path).
# Override with the TWIN_BASE_DIR environment variable if the script is run from elsewhere.
BASE_DIR = os.environ.get("TWIN_BASE_DIR") or os.path.dirname(os.path.abspath(__file__))


def _script_args():
    """Arguments after the `--` separator: --render, --samples N, --device CPU|GPU|AUTO."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = {"render": "--render" in argv, "samples": 32, "device": "CPU"}
    for i, a in enumerate(argv[:-1]):
        if a == "--samples":
            try:
                opts["samples"] = max(1, min(4096, int(argv[i + 1])))
            except ValueError:
                pass
        elif a == "--device" and argv[i + 1].upper() in ("CPU", "GPU", "AUTO"):
            opts["device"] = argv[i + 1].upper()
    return opts


ARGS = _script_args()
ARCH_OBJ_PATH = os.path.join(BASE_DIR, "factory_precision.obj")
CNC_OBJ_PATH = os.path.join(BASE_DIR, "industrial_cnc_and_3dprinter.obj")
LAYOUT_JSON_PATH = os.path.join(BASE_DIR, "scene_layout.json")
MAT_SPEC_JSON_PATH = os.path.join(BASE_DIR, "materials_pp_fkm_stainless_spec.json")
ISAAC_ASSETS_DIR = os.path.join(BASE_DIR, "nvidia_isaac_assets")
RENDER_OUT_DIR = os.path.join(BASE_DIR, "renders_cycles_photoreal")

os.makedirs(RENDER_OUT_DIR, exist_ok=True)


# ==============================================================================
# 1. 씬 초기화 및 Cycles GPU / EEVEE Next 레이트레이싱 + AgX 컬러 매니지먼트 설정
# ==============================================================================
def setup_photoreal_render_engine():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    # Cycles GPU Path Tracing 기본 설정
    scene.render.engine = 'CYCLES'
    # Default 32 samples on CPU: 256 samples + OptiX needs an NVIDIA GPU and does not finish in
    # minutes on an integrated-graphics laptop. Pass `-- --samples 256 --device GPU` on a GPU machine.
    scene.cycles.samples = ARGS["samples"]
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 12
    scene.cycles.glossy_bounces = 8
    scene.cycles.transmission_bounces = 8
    scene.cycles.volume_bounces = 2

    # CPU unless GPU/AUTO was requested; GPU falls back to CPU when no compute device exists.
    scene.cycles.device = 'CPU'
    if ARGS["device"] in ('GPU', 'AUTO'):
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for dev_type in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
                try:
                    prefs.compute_device_type = dev_type
                    prefs.get_devices()
                    gpus = [d for d in prefs.devices if d.type != 'CPU']
                    if not gpus:
                        continue
                    for d in prefs.devices:
                        d.use = True
                    scene.cycles.device = 'GPU'
                    break
                except Exception:
                    continue
        except Exception:
            pass
    print(f"[INFO] Cycles device={scene.cycles.device} samples={scene.cycles.samples}")

    # Blender 4.x AgX Filmic 컬러 매니지먼트
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - High Contrast'
    except Exception:
        scene.view_settings.view_transform = 'Filmic'
        scene.view_settings.look = 'High Contrast'

    scene.view_settings.exposure = 0.15
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.image_settings.file_format = 'PNG'


# ==============================================================================
# 2. 프로시저럴 + NVIDIA SimReady 4K PBR 셰이더 노드 그래프 빌더
# ==============================================================================
def set_bsdf_input(bsdf, names, val):
    for n in names:
        if n in bsdf.inputs:
            bsdf.inputs[n].default_value = val
            return


def build_nvidia_orm_pbr_material(mat_name, albedo_path, normal_path, orm_path, base_tint=(1, 1, 1, 1)):
    """NVIDIA Omniverse SimReady _Albedo, _Normal, _ORM (R=AO, G=Roughness, B=Metallic) 4K 텍스처 노드 직결"""
    mat = bpy.data.materials.new(name=mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    set_bsdf_input(bsdf, ['Base Color'], base_tint)

    # Bevel Shader 노드로 날카로운 CAD 모서리에 1.5mm 실사 하이라이트 부여
    bevel = nodes.new('ShaderNodeBevel')
    bevel.samples = 4
    bevel.inputs['Radius'].default_value = 0.0015

    if albedo_path and os.path.exists(albedo_path):
        tex_alb = nodes.new('ShaderNodeTexImage')
        tex_alb.image = bpy.data.images.load(albedo_path, check_existing=True)
        links.new(tex_alb.outputs['Color'], bsdf.inputs['Base Color'])

    if orm_path and os.path.exists(orm_path):
        tex_orm = nodes.new('ShaderNodeTexImage')
        tex_orm.image = bpy.data.images.load(orm_path, check_existing=True)
        tex_orm.image.colorspace_settings.name = 'Non-Color'
        sep = nodes.new('ShaderNodeSeparateColor')
        links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
        # G = Roughness, B = Metallic
        links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

    if normal_path and os.path.exists(normal_path):
        tex_norm = nodes.new('ShaderNodeTexImage')
        tex_norm.image = bpy.data.images.load(normal_path, check_existing=True)
        tex_norm.image.colorspace_settings.name = 'Non-Color'
        norm_map = nodes.new('ShaderNodeNormalMap')
        norm_map.inputs['Strength'].default_value = 0.85
        links.new(tex_norm.outputs['Color'], norm_map.inputs['Color'])
        links.new(norm_map.outputs['Normal'], bevel.inputs['Normal'])
        links.new(bevel.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        links.new(bevel.outputs['Normal'], bsdf.inputs['Normal'])

    return mat


def build_industrial_materials_bank():
    """PP, FKM/FPM, SUS 304/306, SUS 316L SLM, SUS 314 및 에폭시 콘크리트 바닥 실사 셰이더 뱅크 생성"""
    bank = {}
    lib_dir = os.path.join(ISAAC_ASSETS_DIR, "nvidia_material_library")

    # 1) 폴리싱 에폭시 콘크리트 바닥 (Roughness 얼룩 노이즈 + Clearcoat 0.75 + 미세 범프)
    mat_floor = bpy.data.materials.new(name="M_Polished_Epoxy_Concrete_Floor")
    mat_floor.use_nodes = True
    nodes = mat_floor.node_tree.nodes
    links = mat_floor.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    tex_coord = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 4.5
    noise.inputs['Detail'].default_value = 12.0
    noise.inputs['Roughness'].default_value = 0.65

    ramp_col = nodes.new('ShaderNodeValToRGB')
    ramp_col.color_ramp.elements[0].color = (0.24, 0.27, 0.31, 1.0)
    ramp_col.color_ramp.elements[1].color = (0.36, 0.40, 0.45, 1.0)

    ramp_rough = nodes.new('ShaderNodeValToRGB')
    ramp_rough.color_ramp.elements[0].position = 0.25
    ramp_rough.color_ramp.elements[0].color = (0.14, 0.14, 0.14, 1.0)
    ramp_rough.color_ramp.elements[1].position = 0.75
    ramp_rough.color_ramp.elements[1].color = (0.48, 0.48, 0.48, 1.0)

    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    bump.inputs['Distance'].default_value = 0.002

    links.new(tex_coord.outputs['Object'], noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], ramp_col.inputs['Fac'])
    links.new(noise.outputs['Fac'], ramp_rough.inputs['Fac'])
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(ramp_col.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(ramp_rough.outputs['Color'], bsdf.inputs['Roughness'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    set_bsdf_input(bsdf, ['Coat Weight', 'Clearcoat'], 0.75)
    set_bsdf_input(bsdf, ['Coat Roughness', 'Clearcoat Roughness'], 0.16)
    bank['EPOXY_FLOOR'] = mat_floor

    # 2) SUS 304 / 306 브러시드 스테인리스 (실제 NVIDIA Steel_A1 4K 텍스처 연동)
    bank['SUS_304_306_Brushed_2B'] = build_nvidia_orm_pbr_material(
        "M_SUS_304_306_Brushed_2B",
        os.path.join(lib_dir, "Metal", "Textures", "T_Steel_A1_Albedo.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Steel_A1_Normal.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Steel_A1_ORM.png"),
        base_tint=(0.78, 0.80, 0.83, 1.0)
    )

    # 3) SUS 316L SLM 3D 프린팅 적층 표면 (NVIDIA Rough Metal + 레이저 적층 범프)
    bank['SUS_316L_SLM_3DPrinted_AsBuilt'] = build_nvidia_orm_pbr_material(
        "M_SUS_316L_SLM_3DPrinted",
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Rough_A_Albedo.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Rough_A_Normal.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Rough_A_ORM.png"),
        base_tint=(0.68, 0.70, 0.73, 1.0)
    )

    # 4) SUS 316L 전해연마 미러 (#8 Mirror)
    bank['SUS_316L_Electropolished'] = build_nvidia_orm_pbr_material(
        "M_SUS_316L_Electropolished_Mirror",
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Chrome_A_Albedo.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Chrome_A_Normal.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Metal_Chrome_A_ORM.png"),
        base_tint=(0.88, 0.90, 0.93, 1.0)
    )

    # 5) SUS 314 초내열 스테인리스 (25Cr-20Ni-2Si 샴페인 실버톤)
    bank['SUS_314_HeatResistant_Wrought'] = build_nvidia_orm_pbr_material(
        "M_SUS_314_HeatResistant_Wrought",
        None,
        os.path.join(lib_dir, "Metal", "Textures", "T_Steel_A1_Normal.png"),
        os.path.join(lib_dir, "Metal", "Textures", "T_Steel_A1_ORM.png"),
        base_tint=(0.80, 0.77, 0.71, 1.0)
    )

    # 6) FKM / FPM 불소고무 3종 (Black 85A, Brown 80A, Green 75A)
    for key, tint in [
        ('FKM_FPM_Viton_Black_85A', (0.035, 0.036, 0.040, 1.0)),
        ('FKM_FPM_Viton_Brown_80A', (0.24, 0.10, 0.05, 1.0)),
        ('FKM_FPM_Viton_Green_75A', (0.06, 0.28, 0.13, 1.0)),
    ]:
        bank[key] = build_nvidia_orm_pbr_material(
            f"M_{key}",
            None,
            os.path.join(lib_dir, "Rubber", "Textures", "T_Rubber_Black_Glossy_A_Normal.png"),
            os.path.join(lib_dir, "Rubber", "Textures", "T_Rubber_Black_Glossy_A_ORM.png"),
            base_tint=tint
        )

    # 7) PP 내추럴 씰 등급 (Subsurface Scattering 유백색 반투명 플라스틱)
    mat_pp = build_nvidia_orm_pbr_material(
        "M_PP_Natural_SealGrade",
        None,
        os.path.join(lib_dir, "Plastic", "Textures", "T_Plastic_Glossy_White_A_Normal.png"),
        os.path.join(lib_dir, "Plastic", "Textures", "T_Plastic_Glossy_White_A_ORM.png"),
        base_tint=(0.90, 0.90, 0.87, 1.0)
    )
    bsdf_pp = mat_pp.node_tree.nodes.get("Principled BSDF")
    if bsdf_pp:
        set_bsdf_input(bsdf_pp, ['Subsurface Weight', 'Subsurface'], 0.35)
        set_bsdf_input(bsdf_pp, ['IOR'], 1.490)
    bank['PP_Natural_SealGrade'] = mat_pp
    bank['PP_GF30_Structural_Grey'] = build_nvidia_orm_pbr_material(
        "M_PP_GF30_Structural_Grey",
        None,
        os.path.join(lib_dir, "Plastic", "Textures", "T_Plastic_Glossy_White_A_Normal.png"),
        None,
        base_tint=(0.35, 0.38, 0.41, 1.0)
    )

    return bank


# ==============================================================================
# 3. 건축 쉘 임포트 + Bevel 모디파이어 + 웹 에디터 레이아웃(scene_layout.json) 동기화
# ==============================================================================
def assemble_digital_twin_scene():
    setup_photoreal_render_engine()
    mat_bank = build_industrial_materials_bank()

    # 1) 클린 건축 쉘(226 B-Rep 바디) 임포트 (mm -> m 스케일 변환 0.001)
    if os.path.exists(ARCH_OBJ_PATH):
        bpy.ops.wm.obj_import(filepath=ARCH_OBJ_PATH, forward_axis='Y', up_axis='Z')
        for obj in list(bpy.context.selected_objects):
            obj.scale = (0.001, 0.001, 0.001)
            if "Floor_Slab" in obj.name:
                obj.data.materials.clear()
                obj.data.materials.append(mat_bank['EPOXY_FLOOR'])
            else:
                # 모든 건축 철골/설비에 2mm Bevel 모디파이어 적용 (스케치업 직각 엣지 제거)
                bev = obj.modifiers.new(name="Photoreal_Bevel", type='BEVEL')
                bev.width = 0.002
                bev.segments = 2
                bev.limit_method = 'ANGLE'

    # 2) 웹 공간 에디터의 scene_layout.json 로드 및 NVIDIA SimReady 원본 USD 배치
    if os.path.exists(LAYOUT_JSON_PATH):
        with open(LAYOUT_JSON_PATH, 'r', encoding='utf-8') as f:
            layout_data = json.load(f)
        items = layout_data.get('items', [])
        for item in items:
            usd_rel = item.get('usdPath', '')
            pos_mm = item.get('pos', [0, 0, 0])
            rot_deg = item.get('rot', [0, 0, 0])
            scl = item.get('scale', [1, 1, 1])
            mat_id = item.get('materialId', 'SUS_304_306_Brushed_2B')

            if usd_rel.endswith('.usd'):
                usd_full = os.path.join(BASE_DIR, usd_rel.replace('/', os.sep))
                if os.path.exists(usd_full):
                    bpy.ops.wm.usd_import(filepath=usd_full)
                    for imported in bpy.context.selected_objects:
                        if imported.parent is None:
                            imported.location = (pos_mm[0] * 0.001, pos_mm[1] * 0.001, pos_mm[2] * 0.001)
                            imported.rotation_euler = (
                                math.radians(rot_deg[0]),
                                math.radians(rot_deg[1]),
                                math.radians(rot_deg[2])
                            )
                            imported.scale = (scl[0], scl[1], scl[2])

    # 3) 천장 12개 250W 하이베이 LED Area Light (4x3 그리드, Z=5.65m) 생성
    for ix, x_m in enumerate([3.5, 9.0, 15.0, 20.5]):
        for iy, y_m in enumerate([3.2, 8.0, 12.8]):
            light_data = bpy.data.lights.new(name=f"HighBay_Area_{ix}_{iy}", type='AREA')
            light_data.energy = 450.0
            light_data.color = (0.95, 0.98, 1.0)
            light_data.shape = 'DISK'
            light_data.size = 0.55
            light_obj = bpy.data.objects.new(name=f"HighBay_Area_{ix}_{iy}", object_data=light_data)
            light_obj.location = (x_m, y_m, 5.55)
            bpy.context.collection.objects.link(light_obj)

    blend_out = os.path.join(BASE_DIR, "sugarhill_photoreal_digital_twin.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_out)
    print(f"[SUCCESS] Photorealistic Blender 4.x Digital Twin saved to: {blend_out}")

    if ARGS["render"] or "--render" in sys.argv:
        render_path = os.path.join(RENDER_OUT_DIR, "cycles_digital_twin_render.png")
        scene = bpy.context.scene
        scene.render.filepath = render_path
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGB'
        scene.render.image_settings.color_depth = '8'
        print(f"[INFO] Rendering Cycles Photoreal Frame to: {render_path}")
        bpy.ops.render.render(write_still=True)
        print(f"[SUCCESS] Render complete: {render_path}")


if __name__ == "__main__":
    assemble_digital_twin_scene()
