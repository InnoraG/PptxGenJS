# Runs inside Blender: `blender --background --python canonical_build.py -- <skeleton.json> <out.glb>`
# PROOF SLICE for the presenter clip-baker: build the 22-bone canonical armature from canonical_skeleton.json,
# add one trivial animation, and export a valid GLB with 1 named glTF animation. This proves headless Blender
# runs on Modal and that our armature-build + glTF-animation export path works — before the full CMU retarget.
import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _canonical_rig import build_canonical_armature  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
skel_path, out_glb = argv[0], argv[1]
skel = json.load(open(skel_path))

# Empty scene + the canonical armature at its rest pose (shared builder).
bpy.ops.wm.read_factory_settings(use_empty=True)
arm_obj, arm_data = build_canonical_armature("canonical", skel)

# --- One trivial animation (nod the head) as a named action -----------------------------------------
action = bpy.data.actions.new("00_test")
arm_obj.animation_data_create()
arm_obj.animation_data.action = action
head = arm_obj.pose.bones["mixamorig:Head"]
head.rotation_mode = "XYZ"
for f in (1, 12, 24):
    bpy.context.scene.frame_set(f)
    head.rotation_euler = (math.radians(20.0 * math.sin(f / 24.0 * math.pi)), 0.0, 0.0)
    head.keyframe_insert("rotation_euler", frame=f)
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 24

# --- Export GLB (no Draco/meshopt; animations on) ---------------------------------------------------
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_draco_mesh_compression_enable=False,
    use_selection=False,
    export_yup=True,
)
print("CANONICAL_BUILD_OK", out_glb)
