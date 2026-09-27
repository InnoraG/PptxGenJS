# Imported by the /opt/bake Blender scripts (canonical_build / library_build / retarget_bake) to build the ONE
# canonical armature identically everywhere. Reads restWorld head/tail (Blender Z-up) from canonical_skeleton.json
# when present; falls back to a trivial vertical stack otherwise. Kept tiny + bpy-only so it composes across the
# subprocess boundary (the GPL stays inside Blender).
import bpy


def build_canonical_armature(name, skel):
    """Create + link an armature object with the canonical bones/hierarchy at their rest pose. Returns (obj, data).
    Leaves the object active in POSE mode."""
    arm_data = bpy.data.armatures.new(name)
    arm_obj = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    ebs = {}
    for b in skel["bones"]:
        eb = arm_data.edit_bones.new(b["name"])
        rw = b.get("restWorld")
        if rw:
            eb.head = tuple(rw["head"])
            eb.tail = tuple(rw["tail"])
        else:  # placeholder vertical stack (only for the ordering proof — no real motion)
            z = b["index"] * 0.1
            eb.head = (0.0, 0.0, z)
            eb.tail = (0.0, 0.0, z + 0.08)
        ebs[b["name"]] = eb
    for b in skel["bones"]:
        if b["parent"]:
            ebs[b["name"]].parent = ebs[b["parent"]]
    bpy.ops.object.mode_set(mode="POSE")
    return arm_obj, arm_data
