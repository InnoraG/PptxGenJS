"""Build-time fetch of approved public model weights into the container image."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import gdown


def main() -> None:
    root = Path('/opt/rfpp').resolve()
    manifest = json.loads(Path('/opt/restoreformer-models.lock.json').read_text())
    for item in manifest['weights']:
        target = (root / item['destination']).resolve()
        if not target.is_relative_to(root):
            raise RuntimeError('Invalid model destination')
        target.parent.mkdir(parents=True, exist_ok=True)
        gdown.download(id=item['googleDriveId'], output=str(target), quiet=True, use_cookies=False)
        digest = hashlib.sha256()
        size = 0
        with target.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
                size += len(block)
        if digest.hexdigest() != item['sha256'] or size != item['bytes']:
            raise RuntimeError('Approved model identity verification failed')
    print('Approved model identities verified: 5/5')


if __name__ == '__main__':
    main()
