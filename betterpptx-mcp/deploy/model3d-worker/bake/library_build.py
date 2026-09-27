# Runs inside Blender: `blender --background --python library_build.py -- <skeleton.json> <clipmap.json> <out.glb>`
# PROOF/SCAFFOLD for the presenter clip-baker's OUTPUT contract. Builds the canonical armature and one named
# Action per gesture intent, stashes each to its own muted NLA track, and exports a single multi-clip GLB with
# the §1 recipe export settings. The gestures here are trivial hand-keyed placeholders (distinct bone + motion
# per clip so every channel is provably non-trivial and distinct) — the REAL motion comes from the offline
# CMU->canonical retarget (retarget_bake.py). This script exists to prove the multi-animation glTF export +
# the animId-ordering contract before investing in CMU sourcing.
#
# IMPORTANT: the Actions are created in a DELIBERATELY SCRAMBLED order so that if Blender's exporter preserved
# insertion order (instead of the name sort), the downstream pygltflib reorder is what rescues the animId
# contract. The post-export gate (gltf_ops.reorder_and_validate) asserts the final order is the identity map.
import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _canonical_rig import build_canonical_armature  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
skel_path, clipmap_path, out_glb = argv[0], argv[1], argv[2]
skel = json.load(open(skel_path))
clipmap = json.load(open(clipmap_path))
clip_names = clipmap["clipNames"]  # ["00_greet", ..., "08_bow"] — the frozen order

# Which bone each placeholder clip drives + how (axis index 0=X,1=Y,2=Z, amplitude in degrees). Distinct per
# clip so no two exported animations are identical; enough to survive the "channel has >1 keyframe" gate.
CLIP_MOTION = {
    "00_greet":     ("mixamorig:RightArm",      2, 35.0),
    "01_point":     ("mixamorig:RightForeArm",  0, 45.0),
    "02_enumerate": ("mixamorig:LeftHand",      1, 25.0),
    "03_emphasize": ("mixamorig:Spine1",        0, 15.0),
    "04_contrast":  ("mixamorig:LeftArm",       2, 30.0),
    "05_ask":       ("mixamorig:LeftShoulder",  2, 20.0),
    "06_magnitude": ("mixamorig:RightShoulder", 2, 40.0),
    "07_talk":      ("mixamorig:Head",          1, 10.0),
    "08_bow":       ("mixamorig:Spine",         0, 30.0),
}

bpy.ops.wm.read_factory_settings(use_empty=True)

# Build the canonical armature at its rest pose (shared with retarget_bake / canonical_build).
arm_obj, arm_data = build_canonical_armature("canonical", skel)
arm_obj.animation_data_create()


def make_action(name):
    bone_name, axis, amp = CLIP_MOTION[name]
    action = bpy.data.actions.new(name)
    arm_obj.animation_data.action = action
    pb = arm_obj.pose.bones[bone_name]
    pb.rotation_mode = "XYZ"
    for f in (1, 12, 24):
        bpy.context.scene.frame_set(f)
        euler = [0.0, 0.0, 0.0]
        euler[axis] = math.radians(amp * math.sin(f / 24.0 * math.pi))
        pb.rotation_euler = euler
        pb.keyframe_insert("rotation_euler", index=axis, frame=f)
    # Stash to its OWN muted NLA track named identically to the action (protects the Blender>=4.5
    # animation-name-source change: track.name == action.name either way). Unstashed non-active actions
    # are dropped by the exporter, so stashing is mandatory, not optional.
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.name = name
    track.mute = True
    arm_obj.animation_data.action = None
    return action


# SCRAMBLED creation order (reversed) — the reorder must fix animId regardless of insertion order.
for name in reversed(clip_names):
    make_action(name)

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 24

# --- Export multi-clip GLB (ACTIONS mode: one glTF animation per stashed Action) --------------------
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_bake_animation=True,
    export_draco_mesh_compression_enable=False,  # MANDATORY — PP rejects Draco
    export_skins=True,
    export_optimize_animation_size=False,
    use_selection=False,
    export_yup=True,
)
print("LIBRARY_BUILD_OK", out_glb, "clips=", len(clip_names))
