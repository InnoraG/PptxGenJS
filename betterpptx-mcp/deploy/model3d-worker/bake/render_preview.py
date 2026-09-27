# Runs inside Blender: `blender --background --python render_preview.py -- <in.glb> <out.png>`
# Ground-truth render of a GLB (Cycles CPU, headless) with an auto-framed front camera — isolates "is the model
# itself upright/correct" from PowerPoint's am3d camera framing. Renders front + 3/4 views side by side.
import bpy
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
in_glb, out_png = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=in_glb)

# World bbox of all mesh objects (rest pose).
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# Force vertex colors (COLOR_0) to actually RENDER. Blender's glTF importer leaves the resale-safe vertex-color
# GLB with a neutral/absent material (trimesh writes COLOR_0 but no PBR material) → it would render as WHITE CLAY,
# making --preview useless for the default resale-clean path. Wire a Color-Attribute node -> Base Color for any
# mesh that HAS a color attribute. Meshes WITHOUT COLOR_0 (e.g. the premium UV-textured export) are SKIPPED so
# their imported baseColorTexture material is preserved untouched.
for o in meshes:
    me = o.data
    if not getattr(me, "color_attributes", None):
        continue
    mat = bpy.data.materials.new("vcol")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    ca = nt.nodes.new("ShaderNodeVertexColor")  # "Color Attribute" node
    ca.layer_name = me.color_attributes[0].name
    if bsdf is not None:
        nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.clear()
    me.materials.append(mat)
    print("VCOL material wired for", o.name, "attr", ca.layer_name)
lo = Vector((1e18, 1e18, 1e18))
hi = Vector((-1e18, -1e18, -1e18))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
center = (lo + hi) / 2.0
size = max((hi - lo)[i] for i in range(3)) or 1.0
print("MODEL bbox lo", [round(x, 3) for x in lo], "hi", [round(x, 3) for x in hi], "size", round(size, 3))

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.render.resolution_x = 640
scene.render.resolution_y = 640
# TRANSPARENT film → RGBA PNG with an alpha background. The front render doubles as the PowerPoint POSTER: an
# am3d model renders EMPTY without a raster anchor, and a transparent poster lets the presenter stand ON the
# slide instead of inside a grey studio box. Lighting still uses the world below; only the bg pixels go alpha.
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.9, 0.96, 1)

# Sun
light = bpy.data.lights.new("sun", "SUN")
light.energy = 4.0
lo_obj = bpy.data.objects.new("sun", light)
scene.collection.objects.link(lo_obj)
lo_obj.rotation_euler = (0.6, 0.2, 0.4)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens_unit = "FOV"
cam_data.angle = 0.7  # ~40deg
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
dist = size * 1.6


def look_at(obj, target):
    d = (obj.location - target)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()


renders = []
# glTF import into Blender is Z-up; a Y-up model's "up" becomes +Z, "front" faces -Y. Try front (-Y) + 3/4.
for tag, offset in [("front", Vector((0, -dist, 0))), ("threeq", Vector((dist * 0.7, -dist * 0.7, size * 0.15)))]:
    cam.location = center + offset
    look_at(cam, center)
    p = out_png.replace(".png", f"_{tag}.png")
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    renders.append(p)
    print("RENDERED", tag, p)
print("RENDER_PREVIEW_OK", renders)
