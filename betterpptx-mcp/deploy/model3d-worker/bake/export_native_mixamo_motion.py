"""Maintainer-only, animation-only import preserving the source bone axes.

Run in the existing pinned Blender runtime. Never auto-orient bones, transplant
translations/scales onto a presenter, simplify keyframes, or insert rest keys.
The exported library is subsequently retargeted once to each original rig.
"""
import bpy
import hashlib
import json
import os
import sys


arguments = sys.argv[sys.argv.index("--") + 1:]
if len(arguments) != 4:
    raise RuntimeError("Expected input FBX, output GLB, animation name, and audit JSON paths")
input_fbx, output_glb, animation_name, report_path = arguments
if os.path.exists(output_glb) or os.path.exists(report_path):
    raise RuntimeError("Motion import outputs must be new files")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.fbx(filepath=input_fbx, automatic_bone_orientation=False, use_anim=True)
armatures = [item for item in bpy.context.scene.objects if item.type == "ARMATURE"]
if len(armatures) != 1:
    raise RuntimeError(f"Expected exactly one source armature, received {len(armatures)}")
armature = armatures[0]
action = armature.animation_data.action if armature.animation_data else None
if action is None:
    raise RuntimeError("Source contains no active motion")
scene = bpy.context.scene
frame_start, frame_end = [float(value) for value in action.frame_range]
fps = scene.render.fps / scene.render.fps_base
scene.frame_start = int(frame_start)
scene.frame_end = int(frame_end)
source_curves = [{"path": curve.data_path, "axis": curve.array_index, "keys": len(curve.keyframe_points)} for curve in action.fcurves]
original_bone_names = [bone.name for bone in armature.data.bones]
for bone in armature.data.bones:
    if bone.name.lower().startswith("mixamorig"):
        bone.name = f"mixamorig:{bone.name.split(':', 1)[-1]}"
if len(set(bone.name for bone in armature.data.bones)) != len(original_bone_names):
    raise RuntimeError("Bone namespace normalization collided")
action.name = animation_name

# Keep only the original rest skeleton and selected action. Character geometry
# and materials are supplied by the unchanged approved presenter, never here.
for item in list(bpy.data.objects):
    if item != armature:
        bpy.data.objects.remove(item, do_unlink=True)
for candidate in list(bpy.data.actions):
    if candidate != action:
        bpy.data.actions.remove(candidate)
armature.animation_data.action = action
track = armature.animation_data.nla_tracks.new()
track.name = animation_name
strip = track.strips.new(animation_name, int(frame_start), action)
strip.name = animation_name
track.mute = True
armature.animation_data.action = None
os.makedirs(os.path.dirname(os.path.abspath(output_glb)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_anim_slide_to_zero=True,
    export_frame_step=1,
    export_frame_range=False,
    export_bake_animation=True,
    export_skins=True,
    export_optimize_animation_size=False,
    export_draco_mesh_compression_enable=False,
    use_selection=False,
    export_yup=True,
)
if not os.path.isfile(output_glb):
    raise RuntimeError("Native motion export produced no output")
with open(input_fbx, "rb") as stream:
    source_sha = hashlib.sha256(stream.read()).hexdigest()
with open(output_glb, "rb") as stream:
    result_sha = hashlib.sha256(stream.read()).hexdigest()
report = {
    "schemaVersion": "betterpptx.native-mixamo-motion-import.v1",
    "sourceFile": os.path.basename(input_fbx),
    "sourceSha256": source_sha,
    "sourceBytes": os.path.getsize(input_fbx),
    "animationName": animation_name,
    "sourceFrameRange": [frame_start, frame_end],
    "sourceFps": fps,
    "sourceDurationMs": (frame_end - frame_start) * 1000 / fps,
    "boneCount": len(original_bone_names),
    "boneNames": [bone.name for bone in armature.data.bones],
    "sourceCurves": source_curves,
    "automaticBoneOrientation": False,
    "animationSimplification": False,
    "constructionBoundaryKeysAdded": False,
    "animationTimeOrigin": "zero-based; source span and key cadence preserved",
    "outputSha256": result_sha,
    "outputBytes": os.path.getsize(output_glb),
    "runtimeVersion": bpy.app.version_string,
}
with open(report_path, "w", encoding="utf-8") as stream:
    json.dump(report, stream, indent=2)
print(json.dumps({key: value for key, value in report.items() if key not in ("boneNames", "sourceCurves")}, indent=2))
