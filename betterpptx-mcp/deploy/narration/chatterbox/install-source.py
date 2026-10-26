"""Build-only bounded installation of an immutable verified upstream archive."""
import argparse
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

MAX_SOURCE_BYTES = 8 * 1024 * 1024


def validate_identity(identity):
    commit = identity.get('commit', '')
    if identity.get('repository') != 'https://github.com/resemble-ai/chatterbox' or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('An immutable official runtime source identity is required.')
    if identity.get('archiveUrl') != f'https://codeload.github.com/resemble-ai/chatterbox/zip/{commit}':
        raise ValueError('Source URL does not match the immutable revision.')
    if not isinstance(identity.get('archiveBytes'), int) or not 0 < identity['archiveBytes'] <= MAX_SOURCE_BYTES:
        raise ValueError('Source archive exceeds the bounded build budget.')
    for key in ('archiveSha256', 'mtlSourceSha256'):
        if not re.fullmatch(r'[a-f0-9]{64}', identity.get(key, '')):
            raise ValueError('Pinned source digests are required.')
    expected = f'chatterbox-{commit}/src/chatterbox/mtl_tts.py'
    if identity.get('mtlSourceArchivePath') != expected:
        raise ValueError('Unexpected source member identity.')


def verify_archive(archive, identity):
    validate_identity(identity)
    if archive.stat().st_size != identity['archiveBytes']:
        raise ValueError('Pinned source archive size mismatch.')
    hasher = hashlib.sha256()
    with archive.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(block)
    if hasher.hexdigest() != identity['archiveSha256']:
        raise ValueError('Pinned source archive digest mismatch.')
    with zipfile.ZipFile(archive) as source:
        item = source.getinfo(identity['mtlSourceArchivePath'])
        if item.file_size > 1024 * 1024:
            raise ValueError('Pinned source module exceeds the build budget.')
        if hashlib.sha256(source.read(item)).hexdigest() != identity['mtlSourceSha256']:
            raise ValueError('Pinned source module digest mismatch.')


def install(identity, opener=urllib.request.urlopen, runner=subprocess.run):
    validate_identity(identity)
    with tempfile.TemporaryDirectory(prefix='pinned-speech-source-') as folder:
        archive = Path(folder) / 'upstream-source.zip'
        length = 0
        with opener(identity['archiveUrl'], timeout=90) as response, archive.open('wb') as output:
            while block := response.read(1024 * 1024):
                length += len(block)
                if length > identity['archiveBytes']:
                    raise ValueError('Source archive exceeds its exact pinned size.')
                output.write(block)
        verify_archive(archive, identity)
        # Dependencies come from the separately pinned bootstrap. In particular,
        # never resolve the upstream metadata's moving reference to Perth master.
        runner([sys.executable, '-m', 'pip', 'install', '--no-cache-dir', '--no-deps', '--force-reinstall', str(archive)], check=True)


def verify_installed(identity):
    files = importlib.metadata.files('chatterbox-tts') or []
    module = next((item for item in files if str(item).replace('\\', '/') == 'chatterbox/mtl_tts.py'), None)
    if module is None or hashlib.sha256(Path(module.locate()).read_bytes()).hexdigest() != identity['mtlSourceSha256']:
        raise ValueError('Installed runtime source differs from the pinned archive.')
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    if 't3_model' not in inspect.signature(ChatterboxMultilingualTTS.from_local).parameters:
        raise ValueError('Installed runtime lacks explicit model version selection.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--identity', type=Path, required=True)
    args = parser.parse_args()
    identity = json.loads(args.identity.read_text(encoding='utf-8'))
    install(identity)
    verify_installed(identity)
    print('Immutable runtime archive and installed version selector verified.')


if __name__ == '__main__':
    main()
