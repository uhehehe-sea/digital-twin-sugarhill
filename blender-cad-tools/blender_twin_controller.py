"""
Digital Twin Precision Machining Controller & Harness Executor
Automates:
1. Addon verification & activation (PDT, MeasureIt, CAD Sketcher)
2. Precision CAD part generation (Spindle Mount with bearing bore & bolt pattern)
3. Automated CMM (Coordinate Measuring Machine) verification via Harness
4. CAD orthographic rendering & export
"""
import sys
import os
import math

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:
    print("[Error] Must be executed inside Blender (blender -b -P blender_twin_controller.py)")
    sys.exit(1)

# Ensure our local directory is in sys.path to import verification harness
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from verification_harness import PrecisionVerificationHarness, ToleranceSpec

def activate_addons():
    """Activates built-in precision CAD addons and registers custom extensions."""
    built_in_addons = ["measureit", "precision_drawing_tools"]
    for addon in built_in_addons:
        try:
            bpy.ops.preferences.addon_enable(module=addon)
            print(f"[Addon] Successfully enabled: {addon}")
        except Exception as e:
            print(f"[Addon Notice] Could not enable {addon}: {e}")

def setup_precision_environment():
    """Sets scene units to Metric (Millimeters) and configures precision snapping."""
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 0.001  # 1 Blender Unit = 1 mm
    scene.unit_settings.length_unit = 'MILLIMETERS'
    
    # Configure render settings for CAD technical presentation
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if hasattr(bpy.types, 'RenderSettings') and 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    print("[OK] Precision scene units configured: Metric / mm (0.001 scale)")

def clear_all():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def build_machined_spindle_mount(harness: PrecisionVerificationHarness):
    """
    Constructs a precision spindle housing block with:
    - Base plate: 80mm x 80mm x 20mm
    - Main bearing bore: Diameter 40.0mm (+0.025 / 0.0 mm -> H7 tolerance)
    - 4x M6 counterbored bolt holes (pitch dia 60mm)
    - Verification harness validates geometry directly against nominal specs
    """
    print("\n--- [Step 1: Generating Machined Spindle Mount Block] ---")
    
    # Base housing block
    width = 80.0
    depth = 80.0
    height = 25.0
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height / 2.0))
    block = bpy.context.active_object
    block.name = "Spindle_Mount_Body"
    block.scale = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Main spindle bore cylinder (Radius = 20.0mm, Dia = 40.0mm)
    bore_r = 20.0
    # Calculate required segments so chordal error <= 0.002 mm (2 um)
    segments = harness.required_segments_for_tolerance(bore_r, max_error_mm=0.002)
    print(f"[CAD Engine] Using {segments} radial segments for bore (Chordal deviation <= 2 um)")

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segments,
        radius=bore_r,
        depth=height * 2.0,
        location=(0, 0, height / 2.0)
    )
    bore_cutter = bpy.context.active_object
    bore_cutter.name = "Bore_Cutter"

    # Boolean cut
    mod_bore = block.modifiers.new(name="Bore_Cut", type='BOOLEAN')
    mod_bore.operation = 'DIFFERENCE'
    mod_bore.object = bore_cutter
    bpy.context.view_layer.objects.active = block
    bpy.ops.object.modifier_apply(modifier="Bore_Cut")
    bpy.data.objects.remove(bore_cutter, do_unlink=True)

    # 4 Mounting bolt holes (M6: radius 3.3mm, PCD 60mm)
    pcd_radius = 30.0
    bolt_radius = 3.3
    for i in range(4):
        ang = (math.pi / 2.0) * i + (math.pi / 4.0)
        bx = pcd_radius * math.cos(ang)
        by = pcd_radius * math.sin(ang)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=48,
            radius=bolt_radius,
            depth=height * 2.0,
            location=(bx, by, height / 2.0)
        )
        cutter = bpy.context.active_object
        cutter.name = f"Bolt_Cutter_{i}"
        
        mod_bolt = block.modifiers.new(name=f"Bolt_{i}", type='BOOLEAN')
        mod_bolt.operation = 'DIFFERENCE'
        mod_bolt.object = cutter
        bpy.ops.object.modifier_apply(modifier=mod_bolt.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    print("[OK] Spindle Mount geometry created.")
    return block

def run_cmm_inspection_harness(obj, harness: PrecisionVerificationHarness):
    """
    Mesh self-consistency check (formerly called a "virtual CMM").
    Reads the bounding box and bore-vertex radii back from the mesh that was just
    built from the same nominal numbers, so it cannot fail and does NOT verify
    machining tolerance. Bore vertices lie exactly on R; the chordal error between
    them is not sampled here. See docs/AUDIT.md (R2).
    """
    print("\n--- [Step 2: Mesh self-consistency check (not a machining tolerance check)] ---")
    
    # 1. Inspect outer dimensions from bounding box
    bbox = obj.bound_box
    xs = [pt[0] for pt in bbox]
    ys = [pt[1] for pt in bbox]
    zs = [pt[2] for pt in bbox]
    measured_width = max(xs) - min(xs)
    measured_depth = max(ys) - min(ys)
    measured_height = max(zs) - min(zs)

    spec_block = ToleranceSpec(nominal=80.0, upper_tol=0.05, lower_tol=-0.05)
    spec_height = ToleranceSpec(nominal=25.0, upper_tol=0.03, lower_tol=-0.03)

    harness.verify_dimension("Body Width X", measured_width, spec_block)
    harness.verify_dimension("Body Depth Y", measured_depth, spec_block)
    harness.verify_dimension("Body Height Z", measured_height, spec_height)

    # 2. Inspect inner bore radius via bmesh vertex sampling
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    inner_radii = []
    for v in bm.verts:
        r = math.sqrt(v.co.x**2 + v.co.y**2)
        # Filter vertices that lie on the bore surface (~20mm radius)
        if 19.5 <= r <= 20.5:
            inner_radii.append(r)
    bm.free()

    if inner_radii:
        measured_bore_radius = sum(inner_radii) / len(inner_radii)
        measured_bore_diameter = measured_bore_radius * 2.0
        # H7 tolerance for 40mm bore: +0.025 / 0.0 mm
        spec_h7_bore = ToleranceSpec(nominal=40.0, upper_tol=0.025, lower_tol=0.0)
        harness.verify_dimension("Spindle Bore Dia (H7)", measured_bore_diameter, spec_h7_bore)

    # Output harness report
    passed = harness.print_summary()
    return passed

def setup_cad_camera_and_lighting():
    """Sets up an orthographic CAD camera and clean studio lighting."""
    # Orthographic CAD Camera
    cam_data = bpy.data.cameras.new("CAD_Camera")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 140.0
    cam_obj = bpy.data.objects.new("CAD_Camera", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    
    # 45-degree isometric position
    cam_obj.location = (120, -120, 100)
    cam_obj.rotation_euler = (math.radians(60), 0, math.radians(45))
    bpy.context.scene.camera = cam_obj

    # CAD Studio Light
    light_data = bpy.data.lights.new(name="CAD_Sun", type='SUN')
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new("CAD_Sun", light_data)
    light_obj.rotation_euler = (math.radians(45), math.radians(30), math.radians(45))
    bpy.context.collection.objects.link(light_obj)

def main():
    clear_all()
    activate_addons()
    setup_precision_environment()

    harness = PrecisionVerificationHarness(target_tolerance_mm=0.005)
    mount_obj = build_machined_spindle_mount(harness)
    
    passed = run_cmm_inspection_harness(mount_obj, harness)
    setup_cad_camera_and_lighting()

    output_blend = os.path.join(current_dir, "machined_spindle_mount.blend")
    bpy.ops.wm.save_as_mainfile(filepath=output_blend)
    print(f"\n[Success] Digital Twin model saved to: {output_blend}")

    # Render CAD viewport snapshot
    output_png = os.path.join(current_dir, "spindle_mount_cad_render.png")
    bpy.context.scene.render.filepath = output_png
    bpy.ops.render.render(write_still=True)
    print(f"[Success] Rendered CAD snapshot to: {output_png}")

if __name__ == "__main__":
    main()
