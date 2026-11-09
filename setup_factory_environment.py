import bpy
import os

def setup_factory_environment():
    """
    공장 디지털 트윈 환경 설정 및 가우시안 스캔 메시 Decimate 최적화 자동화 스크립트
    """
    # 1. 씬 단위계 밀리미터 설정
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.length_unit = 'MILLIMETERS'
    scene.unit_settings.scale_length = 0.001

    # 2. 임포트된 GS 메시 오브젝트 기준 축 보정
    gs_mesh = bpy.context.active_object
    if gs_mesh:
        gs_mesh.name = "Factory_Base_Scanned"
        # 3DGS 표준 평면(Z-up) 보정 필요 시 회전값 적용
        gs_mesh.rotation_euler = (0, 0, 0)
        
        # 3. Decimate 최적화 적용 (Planar 평면 평탄화)
        dec_mod = gs_mesh.modifiers.new(name="Decimate_Planar", type='DECIMATE')
        dec_mod.decimate_type = 'DISSOLVE'
        dec_mod.angle_limit = 0.0523599  # 약 3도
        
        # 4. 렌더 노멀 최적화
        if hasattr(gs_mesh.data, "use_auto_smooth"):
            gs_mesh.data.use_auto_smooth = True
            gs_mesh.data.auto_smooth_angle = 0.523599  # 30도

        print("[SUCCESS] Factory environment and GS mesh optimized.")
    else:
        print("[INFO] No active object selected. Scene units configured to Metric/Millimeters.")

if __name__ == "__main__":
    setup_factory_environment()
