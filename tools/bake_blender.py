"""Cycles lighting for tools/bake_lightmap.mjs --blender.  Not run by hand:

    blender -b --factory-startup --python tools/bake_blender.py -- <layout.obj> <layout.json> <out.f32>

layout.obj  : the building in mm with the lightmap UVs already assigned (the Node script owns the atlas layout)
layout.json : { size: [w, h], samples, sky: [r, g, b], parts: { name: { albedo, bake, emit, drop } } }
out.f32     : w*h*3 float32, rows bottom-up (Blender order): diffuse light arriving at each texel, without surface colour

Lamps are the HighBay_LED parts (emission), daylight is a plain sky colour that only reaches the hall through
the glass entrance (glass and other see-through parts are removed, like in the built-in tracer).
"""
import bpy, json, sys
import numpy as np

obj_path, side_path, out_path = sys.argv[sys.argv.index('--') + 1:][:3]
side = json.load(open(side_path, encoding='utf-8'))
W, H = side['size']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=obj_path, global_scale=0.001, forward_axis='Y', up_axis='Z', use_split_objects=True, validate_meshes=False)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = int(side.get('samples', 96))
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4
scene.cycles.sample_clamp_indirect = 10.0

world = bpy.data.worlds.new('Sky'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*side['sky'], 1.0)
bg.inputs['Strength'].default_value = 2.5            # against lamp strength 1000: about the ratio the built-in tracer uses

img = bpy.data.images.new('lightmap', W, H, alpha=False, float_buffer=True)
img.colorspace_settings.name = 'Non-Color'

mats = {}
def material(key, albedo, emit):
    if key in mats: return mats[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if emit:
        sh = nt.nodes.new('ShaderNodeEmission'); sh.inputs['Color'].default_value = (*emit, 1.0)
        # high-bay lamps shine downward only: strength 1000 on faces whose normal points down, 0 elsewhere
        geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); lt = nt.nodes.new('ShaderNodeMath'); mul = nt.nodes.new('ShaderNodeMath')
        lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = -0.5; mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 1000.0
        nt.links.new(geo.outputs['Normal'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], lt.inputs[0]); nt.links.new(lt.outputs[0], mul.inputs[0]); nt.links.new(mul.outputs[0], sh.inputs['Strength'])
    else:
        sh = nt.nodes.new('ShaderNodeBsdfDiffuse'); sh.inputs['Color'].default_value = (*albedo, 1.0)
    nt.links.new(sh.outputs[0], out.inputs['Surface'])
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex      # bake target
    mats[key] = m
    return m

targets = []
for ob in list(scene.objects):
    info = side['parts'].get(ob.name)
    if ob.type != 'MESH' or info is None or info.get('drop'):
        bpy.data.objects.remove(ob, do_unlink=True); continue
    emit = info.get('emit')
    key = ('E%.2f_%.2f_%.2f' % tuple(emit)) if emit else ('D%.3f_%.3f_%.3f' % tuple(info['albedo']))
    ob.data.materials.clear(); ob.data.materials.append(material(key, info['albedo'], emit))
    if info.get('bake'): targets.append(ob)

print('[blender] %d objects, %d to bake, %d materials, %dx%d, %d samples' % (len(scene.objects), len(targets), len(mats), W, H, scene.cycles.samples), flush=True)
bpy.ops.object.select_all(action='DESELECT')
for ob in targets: ob.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
scene.render.bake.margin = 1
scene.render.bake.use_clear = True
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=1, use_clear=True)

px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
rgb = np.ascontiguousarray(px.reshape(H, W, 4)[:, :, :3])
rgb[~np.isfinite(rgb)] = 0.0
rgb.tofile(out_path)
print('[blender] wrote %s (mean %.4f)' % (out_path, float(rgb.mean())), flush=True)
