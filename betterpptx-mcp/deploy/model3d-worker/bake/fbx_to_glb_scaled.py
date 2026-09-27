# blender --background --python fbx_to_glb_scaled.py -- <in.fbx> <out.glb> [targetHeight]
# Like fbx_to_glb.py but: (1) normalizes the mixamorigN: namespace, (2) drops far-outlier/degenerate
# meshes that would pollute the bbox, (3) scales the whole rig so the ARMATURE height = targetHeight,
# (4) APPLIES transforms (bakes scale into geometry — no root-node scale, clean bbox), (5) Y-up export.
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
in_fbx, out_glb = argv[0], argv[1]
target_h = float(argv[2]) if len(argv) > 2 else 1.6

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=in_fbx, automatic_bone_orientation=False)

# normalize mixamorigN: -> mixamorig: on bones (match the canonical clip library)
import re
for arm in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
    for b in arm.data.bones:
        b.name = re.sub(r"^mixamorig\d+:", "mixamorig:", b.name)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not arms or not meshes:
    raise RuntimeError("need a skinned character")

# per-mesh world bbox; report + drop far-outlier meshes (bbox center > 4x the median mesh size away)
def wbbox(o):
    lo = Vector((1e18, 1e18, 1e18)); hi = Vector((-1e18, -1e18, -1e18))
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
        hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi
sizes = []
for o in meshes:
    lo, hi = wbbox(o); d = hi - lo
    sizes.append((o, max(d.x, d.y, d.z), (lo + hi) / 2))
    print("MESH %s size=%.4f center=(%.3f,%.3f,%.3f) verts=%d" % (o.name, max(d.x, d.y, d.z), (lo+hi).x/2, (lo+hi).y/2, (lo+hi).z/2, len(o.data.vertices)))
med = sorted(s[1] for s in sizes)[len(sizes) // 2]
for o, sz, ctr in sizes:
    if sz > med * 6 or sz < 1e-6:   # a mesh 6x bigger than median (outlier prop) or degenerate → drop
        print("DROP outlier/degenerate mesh", o.name, sz)
        bpy.data.objects.remove(o, do_unlink=True)

# armature world-Z height (clean, skeleton-based)
arm = arms[0]
zs = [(arm.matrix_world @ b.head_local).z for b in arm.data.bones] + [(arm.matrix_world @ b.tail_local).z for b in arm.data.bones]
h = max(zs) - min(zs)
scale = target_h / h if h > 1e-9 else 1.0
print("ARMATURE height=%.4f scale=%.3f" % (h, scale))

# Scale, and BAKE a Blender-Z-up → glTF-Y-up rotation into the geometry (rotate -90deg X, apply),
# then export with export_yup=FALSE. Result: vertices are natively Y-up with identity node transforms,
# matching the canonical clip library (Joe) — so meshRestBBox reads height along Y like the clips expect.
import math
bpy.ops.object.select_all(action="DESELECT")
for o in list(bpy.data.objects):
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
arm.scale = (scale, scale, scale)
arm.rotation_euler = (-math.pi / 2, 0.0, 0.0)   # Z-up → Y-up
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB",
    export_skins=True, export_animations=False, export_draco_mesh_compression_enable=False,
    export_optimize_animation_size=False, use_selection=False, export_yup=False)
print("FBX2GLB_SCALED_OK", out_glb)
