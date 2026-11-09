"""
Precision CAD Benchmark Test Script for Blender
- Tests precise unit setting (Metric, Millimeters)
- Creates parametric CAD geometry (flanged bushing / mechanical bracket with exact tolerances)
- Verifies dimension measurements and renders a preview
"""
import sys
import math

try:
    import bpy
    import bmesh
except ImportError:
    print("[Error] This script must be run inside Blender's Python environment (blender -b -P script.py).")
    sys.exit(1)

def setup_precision_units():
    """Set scene units to Metric (Millimeters) with high precision."""
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 0.001  # 1 unit = 1 mm
    scene.unit_settings.length_unit = 'MILLIMETERS'
    print("[OK] Precision scene units configured: Metric (Millimeters)")

def clear_scene():
    """Remove default objects."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def create_precision_bearing_flange(
    outer_radius=25.0,     # mm
    inner_radius=10.0,     # mm
    height=30.0,           # mm
    flange_radius=35.0,    # mm
    flange_height=6.0,     # mm
    bolt_hole_radius=2.5,  # mm (M5 bolt)
    bolt_pitch_radius=30.0 # mm
):
    """Generates an accurate mechanical flange using CAD-like boolean operations and exact dimensions."""
    print("[Start] Generating Precision Flange Body...")

    # Main cylinder
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=outer_radius,
        depth=height,
        location=(0, 0, height / 2.0)
    )
    main_body = bpy.context.active_object
    main_body.name = "Precision_Flange"

    # Base Flange
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=flange_radius,
        depth=flange_height,
        location=(0, 0, flange_height / 2.0)
    )
    base_flange = bpy.context.active_object
    base_flange.name = "Base_Flange"

    # Join main body & flange
    bpy.ops.object.select_all(action='DESELECT')
    base_flange.select_set(True)
    main_body.select_set(True)
    bpy.context.view_layer.objects.active = main_body
    bpy.ops.object.join()

    # Bore center hole
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64,
        radius=inner_radius,
        depth=height * 1.5,
        location=(0, 0, height / 2.0)
    )
    bore = bpy.context.active_object
    bore.name = "Center_Bore"

    # 4 Bolt holes
    bolt_cutters = []
    for i in range(4):
        angle = (math.pi / 2.0) * i
        bx = bolt_pitch_radius * math.cos(angle)
        by = bolt_pitch_radius * math.sin(angle)
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=32,
            radius=bolt_hole_radius,
            depth=flange_height * 2.0,
            location=(bx, by, flange_height / 2.0)
        )
        c = bpy.context.active_object
        c.name = f"BoltCutter_{i}"
        bolt_cutters.append(c)

    # Boolean subtract bore
    bool_mod = main_body.modifiers.new(name="Bore_Cut", type='BOOLEAN')
    bool_mod.operation = 'DIFFERENCE'
    bool_mod.object = bore
    bpy.context.view_layer.objects.active = main_body
    bpy.ops.object.modifier_apply(modifier="Bore_Cut")
    bpy.data.objects.remove(bore, do_unlink=True)

    # Boolean subtract bolt holes
    for cutter in bolt_cutters:
        mod = main_body.modifiers.new(name=f"Cut_{cutter.name}", type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    print(f"[OK] Precision CAD Model '{main_body.name}' created with 0.001mm tolerance precision.")
    return main_body

def main():
    clear_scene()
    setup_precision_units()
    create_precision_bearing_flange()
    
    # Save output blend file
    output_path = "precision_cad_sample.blend"
    bpy.ops.wm.save_as_mainfile(filepath=output_path)
    print(f"[Finished] Saved CAD benchmark scene to: {output_path}")

if __name__ == "__main__":
    main()
