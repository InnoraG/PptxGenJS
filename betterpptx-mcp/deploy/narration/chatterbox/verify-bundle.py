"""Validate a pre-provisioned immutable bundle; never downloads model files."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def verify(model_root, reference_root, identity, catalog, full_hash=True):
    if identity['repository'] != 'ResembleAI/chatterbox' or identity['variant'] != 'multilingual':
        raise ValueError('Unsupported pinned speech bundle')
    version = identity.get('multilingualVersion', 'v2')
    if version not in ('v2', 'v3') or catalog.get('multilingualVersion', 'v2') != version:
        raise ValueError('Catalog differs from the selected speech version')
    expected_files = {'conds.pt', 'grapheme_mtl_merged_expanded_v1.json', 's3gen.pt', f't3_mtl23ls_{version}.safetensors', 've.pt'}
    if set(identity['files']) != expected_files:
        raise ValueError('Pinned model files differ from the selected speech version')
    if identity.get('runtimeSourceCommit') != catalog.get('runtimeSourceCommit'):
        raise ValueError('Catalog differs from the pinned runtime source')
    aggregate = hashlib.sha256()
    for name in sorted(identity['files']):
        expected = identity['files'][name]
        if Path(name).name != name:
            raise ValueError('Invalid model file name')
        item = model_root / name
        if item.stat().st_size != expected['bytes'] or (full_hash and sha(item) != expected['sha256']):
            raise ValueError('Pinned model identity mismatch')
        aggregate.update((name + '\0sha256:' + expected['sha256'] + '\n').encode('utf-8'))
    if 'sha256:' + aggregate.hexdigest() != catalog['modelDigest']:
        raise ValueError('Catalog differs from the pinned model source identities')
    for voice in catalog['voices']:
        name = voice.get('referenceAudio')
        if not name or Path(name).name != name:
            raise ValueError('Invalid approved reference')
        if 'sha256:' + sha(reference_root / name) != voice['referenceDigest']:
            raise ValueError('Pinned reference identity mismatch')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-root', type=Path, default=Path(os.getenv('CHATTERBOX_MODEL_DIR', '/speech-bundle/models')))
    parser.add_argument('--reference-root', type=Path, default=Path(os.getenv('CHATTERBOX_REFERENCE_ROOT', '/speech-bundle/references')))
    parser.add_argument('--start', action='store_true')
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    verify(args.model_root, args.reference_root,
           json.loads((here / 'model-source.json').read_text(encoding='utf-8')),
           json.loads((here / 'runtime-manifest.json').read_text(encoding='utf-8')),
           full_hash=not args.start)
    if args.start:
        os.execv(sys.executable, [sys.executable, str(here / 'runtime.py')])
    print('Pinned model and approved references verified; no files copied or downloaded.')


if __name__ == '__main__':
    main()
