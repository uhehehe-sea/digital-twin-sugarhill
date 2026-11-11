# sand3d_to_glb.py — USDA (Sand3D / Hugging Face) -> GLB for the Sugar Hill digital twin.
#
# Run by Blender (headless):
#   blender -b --factory-startup --python tools/sand3d_to_glb.py -- <in.usda> <out.glb>
#
# - Imports the USD. Sand3D files are Z-up, metres (metersPerUnit = 1, upAxis = "Z").
# - Prints one JSON line to stdout (marker SAND3D_JSON): dims in millimetres,
#   object/mesh counts. The caller (sand3d_import.mjs) parses it for the catalog.
# - Exports a standard Y-up GLB. The twin viewer rotates the loaded model
#   -90 deg about X when placing it, because the twin scene is Z-up.
#   (Keeping the GLB standard Y-up means it stays usable in any other viewer.)
import sys
import json

import bpy
from mathutils import Vector


def world_bbox():
    """World-space bounding box of every mesh object, in metres (Z-up)."""
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    found = False
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], world[i])
                maxs[i] = max(maxs[i], world[i])
            found = True
    if not found:
        return None
    return [maxs[i] - mins[i] for i in range(3)]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    if len(argv) != 2:
        print("usage: blender -b --python sand3d_to_glb.py -- <in.usda> <out.glb>", file=sys.stderr)
        sys.exit(2)
    in_path, out_path = argv

    # Clean scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Import USD (Sand3D: Z-up, metres).
    bpy.ops.wm.usd_import(filepath=in_path)

    dims_m = world_bbox()
    n_mesh = sum(1 for o in bpy.context.scene.objects if o.type == "MESH")
    n_obj = len(bpy.context.scene.objects)
    dims_mm = [round(d * 1000.0, 1) for d in dims_m] if dims_m else None

    # Export standard Y-up GLB.
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )

    print("SAND3D_JSON " + json.dumps({
        "dims_mm": dims_mm,
        "objects": n_obj,
        "meshes": n_mesh,
        "input": in_path,
        "output": out_path,
    }))
    sys.stdout.flush()


main()
