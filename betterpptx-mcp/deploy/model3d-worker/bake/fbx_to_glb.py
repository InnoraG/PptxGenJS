# Runs inside Blender: `blender --background --python fbx_to_glb.py -- <in.fbx> <out.glb>`
# Convert an ALREADY-RIGGED character FBX (e.g. a Mixamo character, skinned to mixamorig:*) to GLB, preserving
# the skinned armature + mesh. Mixamo characters download as FBX/Collada only; the Baker (normalize->transplant)
# consumes GLB. We DROP any bundled animation (the character's own T-pose/idle) — our 18-clip library is
# transplanted later; we only need the mesh + skeleton + skin here. Built-in io_scene_fbx only (GPL stays in
# this Blender subprocess). Same import settings as mixamo_bake.py so the skeleton orientation matches the rig
# the clips were baked against.
import bpy
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
in_fbx, out_glb = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
# automatic_bone_orientation=FALSE: PRESERVE Mixamo's native mixamorig:* bone axes. All Mixamo characters share
# the identical native skeleton with consistent orientations; auto-orientation RE-DERIVES axes from geometry and
# flips left/right INCONSISTENTLY per-character (measured: Josh's RightUpLeg + Spine came out ~180deg off vs Remy,
# bending the right leg + twisting the torso once the canonical clips were transplanted). False keeps every
# character in the same native frame the clips expect.
bpy.ops.import_scene.fbx(filepath=in_fbx, automatic_bone_orientation=False)

arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
bones = len(arms[0].data.bones) if arms else 0
print("FBX2GLB_IMPORT armatures=%d meshes=%d bones=%d" % (len(arms), len(meshes), bones))
if not arms:
    raise RuntimeError("no armature in FBX — not a rigged character")
if not meshes:
    raise RuntimeError("no mesh in FBX — need a skinned character, not skeleton-only")

bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB",
    export_skins=True, export_animations=False,   # drop the character's bundled anim; clips transplanted later
    export_draco_mesh_compression_enable=False,    # PP rejects Draco/meshopt
    export_optimize_animation_size=False, use_selection=False, export_yup=True,
)
print("FBX2GLB_OK", out_glb)
