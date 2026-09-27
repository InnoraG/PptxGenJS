# Runs inside Blender: `blender --background --python flatten_scale.py -- <in.glb> <out.glb> [target_height]`
# Fixes the PowerPoint am3d framing bug: PP auto-frames a model on its RAW vertex bbox but RENDERS at the node
# scale, so any residual root-node scale (Blender's 0.01 export root + the Baker's normalize node) makes PP
# over-zoom to a fraction of the model (the boots). This BAKES all node scale into the mesh vertices (+ armature,
# via Blender's transform_apply which handles the skin), leaving identity node scale so accessor bbox == render.
# Then PP's auto-frame matches the geometry. Also centers the model so PP frames it centered.
import bpy
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
in_glb, out_glb = argv[0], argv[1]
target = float(argv[2]) if len(argv) > 2 else 1.8

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_glb)


def mesh_world_bbox():
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo[i], w[i]) for i in range(3)))
            hi = Vector((max(hi[i], w[i]) for i in range(3)))
    return lo, hi


lo, hi = mesh_world_bbox()
H = max((hi - lo)[i] for i in range(3)) or 1.0
S = target / H
roots = [o for o in bpy.data.objects if o.parent is None]
for o in roots:
    o.scale = (o.scale[0] * S, o.scale[1] * S, o.scale[2] * S)
    o.location = o.location * S
bpy.context.view_layer.update()

# Bake scale+rotation into the geometry (armature rest + mesh); Blender scales animation F-curves with it.
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = roots[0]
try:
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
except RuntimeError as e:
    print("APPLY_WARN", e)

# Center the (now baked) mesh bbox on the origin so PP frames it centered.
lo, hi = mesh_world_bbox()
center = (lo + hi) / 2.0
for o in [x for x in bpy.data.objects if x.parent is None]:
    o.location = o.location - center
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="SELECT")
try:
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
except RuntimeError as e:
    print("APPLY_LOC_WARN", e)

lo, hi = mesh_world_bbox()
print("FLATTEN final bbox lo", [round(x, 3) for x in lo], "hi", [round(x, 3) for x in hi],
      "H", round(max((hi - lo)[i] for i in range(3)), 3))

bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB",
    export_animations=True, export_animation_mode="ACTIONS", export_bake_animation=True,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_vertex_color="ACTIVE", export_optimize_animation_size=False,
    use_selection=False, export_yup=True,
)
print("FLATTEN_SCALE_OK", out_glb)
