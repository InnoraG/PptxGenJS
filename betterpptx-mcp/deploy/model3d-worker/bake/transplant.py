# Runs inside Blender: `blender --background --python transplant.py -- <normalized_avatar.glb> <clip_library.glb> <clipmap.json> <out.glb>`
# PER-AVATAR STEP 2. The avatar is already normalized (canonical mixamorig:* bone names, skin rebound). The clip
# library is the canonical 9-clip GLB (same bone names, no mesh). A Blender Action is just fcurve data whose
# data_paths reference pose.bones["<name>"] — since both skeletons share the canonical names, each library Action
# applies to the avatar armature directly. We stash each onto its own muted NLA track named NN_intent (ACTIONS
# mode drops unstashed non-active actions) and export ONE multi-clip GLB. The pygltflib reorder + gate
# (gltf_ops.py) then enforce animId order OUTSIDE Blender.
#
# TIER GATING: clips whose channels reference a bone the avatar lacks (e.g. a leg clip on a T2 body-only match)
# are SKIPPED here; the worker's tier already told the director which intents to expect, and the gate checks the
# manifest, not a fixed count. REST-POSE DELTA: transplanting local-rotation keyframes is exact only when the
# avatar rest pose matches canonical; a real UniRig rest (arms-down vs A/T-pose) may skew — flagged as the
# iterate-on-real-output risk (recipe §5). The synthetic proof uses the canonical rest pose, so it is exact.
import bpy
import json
import re
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
avatar_glb, library_glb, clipmap_path, out_glb = argv[0], argv[1], argv[2], argv[3]
clipmap = json.load(open(clipmap_path))
clip_names = clipmap["clipNames"]  # ["00_greet", ..., "08_bow"]

bpy.ops.wm.read_factory_settings(use_empty=True)

# Import the avatar first (mesh + skinned armature, canonical names).
bpy.ops.import_scene.gltf(filepath=avatar_glb)
avatar_arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if avatar_arm is None:
    raise RuntimeError("no armature in normalized avatar GLB")
avatar_bones = set(b.name for b in avatar_arm.data.bones)

# Import the clip library (its 9 Actions land in bpy.data.actions; its armature we discard).
actions_before = set(bpy.data.actions.keys())
bpy.ops.import_scene.gltf(filepath=library_glb)
new_actions = [bpy.data.actions[n] for n in bpy.data.actions.keys() if n not in actions_before]


def clip_key(action_name):
    """Map an imported action name back to its NN_intent clip name (glTF import may prefix/suffix)."""
    for cn in clip_names:
        if cn in action_name:
            return cn
    return None


def action_bone_names(action):
    names = set()
    for fc in action.fcurves:
        m = re.match(r'pose\.bones\["([^"]+)"\]', fc.data_path)
        if m:
            names.add(m.group(1))
    return names


avatar_arm.animation_data_create()
transplanted = []
for action in new_actions:
    cn = clip_key(action.name)
    if cn is None:
        continue
    needed = action_bone_names(action)
    if needed and not needed.issubset(avatar_bones):
        print("TRANSPLANT_SKIP", cn, "missing", sorted(needed - avatar_bones))
        continue
    action.name = cn  # normalize to the exact NN_intent name (belt for the exporter name-sort)
    track = avatar_arm.animation_data.nla_tracks.new()
    track.name = cn
    strip = track.strips.new(cn, 1, action)
    strip.name = cn
    track.mute = True
    transplanted.append(cn)

# Discard the library armature + any of its now-empty child objects (keep the avatar mesh + armature).
for o in list(bpy.data.objects):
    if o.type == "ARMATURE" and o is not avatar_arm:
        bpy.data.objects.remove(o, do_unlink=True)

avatar_arm.animation_data.action = None
bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 24

bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB",
    export_animations=True, export_animation_mode="ACTIONS", export_bake_animation=True,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_vertex_color="ACTIVE", export_optimize_animation_size=False,
    use_selection=False, export_yup=True,
)
print("TRANSPLANT_OK", "clips=", transplanted)
