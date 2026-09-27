# Runs inside Blender: blender --background --python render_poster.py -- <in.glb> <out.png> [size]
# A clean SQUARE, TRANSPARENT, FRONT-orthographic poster of a character GLB (the am3d raster anchor +
# static fallback). Cycles CPU, headless, no GPU/CUDA. Mirrors Joe's joe_front_alpha.png (640x640).
import bpy, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
in_glb, out_png = argv[0], argv[1]
size = int(argv[2]) if len(argv) > 2 else 640

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_glb)

# REST POSE: a GLB with transplanted clips shows animation frame 0 (a crouched landing) unless we
# force the armature to its bind pose. The poster is the STANDING anchor, independent of the clips.
for o in bpy.data.objects:
    if getattr(o, "animation_data", None):
        o.animation_data_clear()
for arm in [o for o in bpy.data.objects if o.type == "ARMATURE"]:
    arm.data.pose_position = "REST"
bpy.context.view_layer.update()

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("no mesh in GLB")

# world-space bbox of all mesh verts (rest pose)
lo = Vector(( 1e9,  1e9,  1e9)); hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
        hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
center = (lo + hi) * 0.5
dims = hi - lo
height = max(dims.z, 1e-3)

# FRONT orthographic camera looking along -Y (Mixamo characters face +Y after export_yup; front is -Y view).
cam_data = bpy.data.cameras.new("posterCam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = height * 1.12  # a little headroom so hands/feet aren't clipped
cam = bpy.data.objects.new("posterCam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cam.location = (center.x, center.y - max(dims.y, height) * 3 - 2, center.z)
cam.rotation_euler = (1.5708, 0.0, 0.0)  # look toward +Y... face the character front
bpy.context.scene.camera = cam

# soft key + fill so the matte character reads (Cycles); transparent film.
for pos, energy in [((center.x - height, center.y - height * 2, center.z + height), 800.0),
                    ((center.x + height, center.y - height * 2, center.z + height * 0.5), 400.0)]:
    ld = bpy.data.lights.new("k", "AREA"); ld.energy = energy; ld.size = height
    lo_ = bpy.data.objects.new("k", ld); lo_.location = pos
    bpy.context.scene.collection.objects.link(lo_)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 48
sc.render.film_transparent = True
sc.render.resolution_x = size
sc.render.resolution_y = size
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print("POSTER_OK", out_png)
