"""Build-time provisioning of the two pinned multilingual tokenizer resources."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import zipfile

REVISION = '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18'
CANGJIE_SHA = '7073fd9de919443ae88e0bd2449917a65fe54898a4413ed1edcc4b67f28bce8c'
PKUSEG_SHA = 'b216e7f92de7ae285aeab8feba2faa8ea8216e5995ff6fb3d391cc8356db1bfe'


def download(url, expected, max_bytes):
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Pinned tokenizer resource identity mismatch')
    return data


def main():
    links = Path('/app/model-links')
    links.mkdir(exist_ok=True)
    source = json.loads(Path('/app/model-source.json').read_text())
    for name in source['files']:
        (links / name).symlink_to(Path('/speech-bundle/models') / name)
    cache = links / 'models--ResembleAI--chatterbox'
    snapshot = cache / 'snapshots' / REVISION
    snapshot.mkdir(parents=True)
    (cache / 'refs').mkdir()
    (cache / 'refs' / 'main').write_text(REVISION)
    (snapshot / 'Cangjie5_TC.json').write_bytes(download(
        f'https://huggingface.co/ResembleAI/chatterbox/resolve/{REVISION}/Cangjie5_TC.json', CANGJIE_SHA, 2_000_000))
    home = Path(os.environ['PKUSEG_HOME'])
    home.mkdir(parents=True, exist_ok=True)
    archive = home / 'spacy_ontonotes.zip'
    archive.write_bytes(download('https://github.com/explosion/spacy-pkuseg/releases/download/v0.0.26/spacy_ontonotes.zip', PKUSEG_SHA, 40_000_000))
    target = home / 'spacy_ontonotes'
    target.mkdir()
    with zipfile.ZipFile(archive) as bundle:
        if sum(item.file_size for item in bundle.infolist()) > 256 * 1024 * 1024:
            raise ValueError('Tokenizer archive expanded size exceeds the build budget')
        for item in bundle.infolist():
            if not (target / item.filename).resolve().is_relative_to(target.resolve()):
                raise ValueError('Invalid tokenizer archive path')
        bundle.extractall(target)
    # Upstream uses the verified archive itself as its cache-presence marker.
    # Keep it alongside the extracted files to prevent a startup download.
    # Retain the upstream MIT notice with the embedded tokenizer resource.
    with urllib.request.urlopen('https://raw.githubusercontent.com/explosion/spacy-pkuseg/v0.0.26/LICENSE', timeout=30) as response:
        license_text = response.read(16384)
    if b'MIT License' not in license_text:
        raise ValueError('Unexpected upstream tokenizer license')
    (home / 'LICENSE').write_bytes(license_text)
    print('Pinned tokenizer resources provisioned at build time; no speech weights copied.')


if __name__ == '__main__':
    main()
