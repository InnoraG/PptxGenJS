# Runs inside Blender: `blender --background --python synth_avatar.py -- <out.glb>`
# TEST FIXTURE (not shipped) for the per-avatar Baker proof. Builds a UniRig-LIKE rigged avatar: a biped skeleton
# with ARBITRARY bone names (j00..) in canonical topology + anatomically plausible rest positions, a skinned mesh
# (one cube per bone, each in its own vertex group) with a COLOR_0 vertex-color layer. This stands in for a real
# UniRig GLB so normalize.py's topology labeler must relabel by hierarchy/position (never by name) and the skin
# must survive the rename+rebind. Rest pose == canonical (unit-ish height, hips at origin, Blender Z-up), so the
# transplant is exact — a real UniRig rest may need the flagged per-avatar delta.
import bpy
import sys

out_glb = sys.argv[sys.argv.index("--") + 1:][0]

# (arbitrary_name, parent_arbitrary_name, head_xyz, tail_xyz) — Blender Z-up. Deliberately NON-canonical names.
B = [
    ("j00", None,  (0.0, 0.0, 1.00), (0.0, 0.0, 1.05)),   # Hips
    ("j07", "j00", (0.0, 0.0, 1.05), (0.0, 0.0, 1.20)),   # Spine
    ("j11", "j07", (0.0, 0.0, 1.20), (0.0, 0.0, 1.33)),   # Spine1
    ("j03", "j11", (0.0, 0.0, 1.33), (0.0, 0.0, 1.42)),   # Spine2 (the fork)
    ("j19", "j03", (0.0, 0.0, 1.45), (0.0, 0.0, 1.52)),   # Neck
    ("j05", "j19", (0.0, 0.0, 1.52), (0.0, 0.0, 1.66)),   # Head
    # left arm (character-left = +X)
    ("j14", "j03", (0.06, 0.0, 1.40), (0.16, 0.0, 1.40)),  # LeftShoulder
    ("j02", "j14", (0.16, 0.0, 1.40), (0.36, 0.0, 1.40)),  # LeftArm
    ("j18", "j02", (0.36, 0.0, 1.40), (0.56, 0.0, 1.40)),  # LeftForeArm
    ("j09", "j18", (0.56, 0.0, 1.40), (0.66, 0.0, 1.40)),  # LeftHand
    # right arm (-X)
    ("j21", "j03", (-0.06, 0.0, 1.40), (-0.16, 0.0, 1.40)),  # RightShoulder
    ("j06", "j21", (-0.16, 0.0, 1.40), (-0.36, 0.0, 1.40)),  # RightArm
    ("j13", "j06", (-0.36, 0.0, 1.40), (-0.56, 0.0, 1.40)),  # RightForeArm
    ("j01", "j13", (-0.56, 0.0, 1.40), (-0.66, 0.0, 1.40)),  # RightHand
    # left leg
    ("j16", "j00", (0.10, 0.0, 0.95), (0.10, 0.0, 0.55)),   # LeftUpLeg
    ("j04", "j16", (0.10, 0.0, 0.55), (0.10, 0.0, 0.12)),   # LeftLeg
    ("j20", "j04", (0.10, 0.0, 0.12), (0.10, 0.10, 0.06)),  # LeftFoot
    ("j10", "j20", (0.10, 0.10, 0.06), (0.10, 0.18, 0.04)),  # LeftToeBase
    # right leg
    ("j17", "j00", (-0.10, 0.0, 0.95), (-0.10, 0.0, 0.55)),  # RightUpLeg
    ("j08", "j17", (-0.10, 0.0, 0.55), (-0.10, 0.0, 0.12)),  # RightLeg
    ("j15", "j08", (-0.10, 0.0, 0.12), (-0.10, 0.10, 0.06)),  # RightFoot
    ("j12", "j15", (-0.10, 0.10, 0.06), (-0.10, 0.18, 0.04)),  # RightToeBase
]

bpy.ops.wm.read_factory_settings(use_empty=True)

# --- Armature -------------------------------------------------------------------------------------
arm_data = bpy.data.armatures.new("rig")
arm = bpy.data.objects.new("rig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
for name, parent, head, tail in B:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = head, tail
for name, parent, head, tail in B:
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode="OBJECT")

# --- Skinned mesh: one cube per bone, each in its own vertex group ---------------------------------
cubes = []
for name, parent, head, tail in B:
    cx = (head[0] + tail[0]) / 2.0
    cy = (head[1] + tail[1]) / 2.0
    cz = (head[2] + tail[2]) / 2.0
    bpy.ops.mesh.primitive_cube_add(size=0.09, location=(cx, cy, cz))
    cube = bpy.context.active_object
    cube.name = f"c_{name}"
    vg = cube.vertex_groups.new(name=name)
    vg.add([v.index for v in cube.data.vertices], 1.0, "REPLACE")
    cubes.append(cube)

# Join into one body mesh (vertex groups merge by name -> 22 groups, one per bone).
bpy.ops.object.select_all(action="DESELECT")
for c in cubes:
    c.select_set(True)
bpy.context.view_layer.objects.active = cubes[0]
bpy.ops.object.join()
body = bpy.context.active_object
body.name = "body"

# COLOR_0 vertex color (we ship no texture — vertex color is the look). Gradient by height.
mesh = body.data
attr = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="POINT")
zmin = min(v.co.z for v in mesh.vertices)
zmax = max(v.co.z for v in mesh.vertices)
span = max(zmax - zmin, 1e-6)
for i, v in enumerate(mesh.vertices):
    t = (v.co.z - zmin) / span
    attr.data[i].color = (0.2 + 0.6 * t, 0.3, 0.8 - 0.5 * t, 1.0)
mesh.color_attributes.active_color_index = 0
mesh.color_attributes.render_color_index = 0

# Bind mesh to armature (explicit vertex groups, NOT automatic weights).
body.parent = arm
mod = body.modifiers.new(name="Armature", type="ARMATURE")
mod.object = arm

bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB", export_animations=False,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_vertex_color="ACTIVE", use_selection=False, export_yup=True,
)
print("SYNTH_AVATAR_OK", out_glb, "bones=", len(B))
