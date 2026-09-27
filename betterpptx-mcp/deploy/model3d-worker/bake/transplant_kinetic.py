"""PURE-PYGLTFLIB CPU transplant — copy a custom N-of-31 kinetic clips from the kinetic library onto a rigged
character, on-the-fly, NO Blender/Modal GPU. The linchpin of custom-18-per-deck: the character's bones and the
library's bones share names (both derive from mixamorig; the canonical rig was built to match its LOCAL axes, so
mixamo_bake uses COPY_ROTATION LOCAL), so each animation channel copies by BONE NAME (library node -> same-named
character node); the sampler bytes are appended to the character's buffer. Bones the character lacks (or the
library root) are skipped; the character's extra bones (fingers) stay at rest; old character animations are
replaced. Callable as transplant_kinetic(char, lib, out, slugs) or CLI: <char.glb> <lib.glb> <out.glb> <slug,...>."""
from pygltflib import (GLTF2, Animation, AnimationChannel, AnimationChannelTarget, AnimationSampler,
                       Accessor, BufferView)


def transplant_kinetic(char_path, lib_path, out_path, slugs):
    """Copy the kinetic clips named by `slugs` (matched by library-clip-name suffix) onto the character at
    char_path, writing out_path. Returns (n_clips, [(slug, status)...])."""
    char = GLTF2().load(char_path)
    lib = GLTF2().load(lib_path)
    cblob = bytearray(char.binary_blob())
    lblob = lib.binary_blob()

    cnode = {n.name: i for i, n in enumerate(char.nodes or []) if n.name}
    lib_by_slug = {}
    for a in (lib.animations or []):
        lib_by_slug[a.name] = a
        if '_' in a.name:
            lib_by_slug[a.name.split('_', 1)[1]] = a

    def _align4():
        while len(cblob) % 4:
            cblob.append(0)

    def _copy_accessor(ai):
        a = lib.accessors[ai]; bv = lib.bufferViews[a.bufferView]
        start = bv.byteOffset or 0
        _align4()
        off = len(cblob)
        cblob.extend(lblob[start:start + bv.byteLength])
        char.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=bv.byteLength))
        char.accessors.append(Accessor(bufferView=len(char.bufferViews) - 1, byteOffset=0,
                                        componentType=a.componentType, count=a.count, type=a.type,
                                        min=a.min, max=a.max, normalized=a.normalized))
        return len(char.accessors) - 1

    new_anims, report = [], []
    for i, slug in enumerate(slugs):
        src = lib_by_slug.get(slug)
        if src is None:
            report.append((slug, 'MISSING')); continue
        nsamplers, smap = [], {}
        for si, s in enumerate(src.samplers):
            nsamplers.append(AnimationSampler(input=_copy_accessor(s.input), output=_copy_accessor(s.output),
                                               interpolation=s.interpolation))
            smap[si] = len(nsamplers) - 1
        nchannels, skipped = [], 0
        for ch in src.channels:
            cn = cnode.get(lib.nodes[ch.target.node].name)
            if cn is None:
                skipped += 1; continue
            nchannels.append(AnimationChannel(sampler=smap[ch.sampler],
                                              target=AnimationChannelTarget(node=cn, path=ch.target.path)))
        new_anims.append(Animation(name='%02d_%s' % (i, slug), samplers=nsamplers, channels=nchannels))
        report.append((slug, 'ok ch=%d skip=%d' % (len(nchannels), skipped)))

    char.animations = new_anims
    char.buffers[0].byteLength = len(cblob)
    char.set_binary_blob(bytes(cblob))
    char.save(out_path)
    return len(new_anims), report


if __name__ == '__main__':
    import sys
    n, rep = transplant_kinetic(sys.argv[1], sys.argv[2], sys.argv[3],
                                [s.strip() for s in sys.argv[4].split(',') if s.strip()])
    for slug, r in rep:
        print('  %-20s %s' % (slug, r))
    print('TRANSPLANT_OK', n, 'clips ->', sys.argv[3])
