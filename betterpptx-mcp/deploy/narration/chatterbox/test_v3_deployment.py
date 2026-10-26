import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

HERE = Path(__file__).parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


installer = module('pinned_installer', 'install-source.py')
bundle = module('pinned_bundle', 'verify-bundle.py')


class DeploymentTests(unittest.TestCase):
    def archive(self):
        commit = 'a' * 40
        member = f'chatterbox-{commit}/src/chatterbox/mtl_tts.py'
        code = b'# mocked selector-capable source identity\n'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr(member, code)
        data = buffer.getvalue()
        identity = {'repository': 'https://github.com/resemble-ai/chatterbox', 'commit': commit, 'archiveUrl': f'https://codeload.github.com/resemble-ai/chatterbox/zip/{commit}', 'archiveBytes': len(data), 'archiveSha256': hashlib.sha256(data).hexdigest(), 'mtlSourceArchivePath': member, 'mtlSourceSha256': hashlib.sha256(code).hexdigest()}
        return data, identity

    def test_only_verified_source_is_installed_without_dependency_resolution(self):
        data, identity = self.archive()
        calls = []
        def run(arguments, check):
            self.assertTrue(check)
            self.assertIn('--no-deps', arguments)
            self.assertIn('--force-reinstall', arguments)
            installer.verify_archive(Path(arguments[-1]), identity)
            calls.append(arguments)
        installer.install(identity, opener=lambda *args, **kwargs: io.BytesIO(data), runner=run)
        self.assertEqual(len(calls), 1)
        self.assertFalse(Path(calls[0][-1]).exists(), 'Temporary source archive must be removed after installation.')

    def test_corrupt_oversized_and_moving_sources_never_reach_install(self):
        data, identity = self.archive()
        calls = []
        run = lambda *args, **kwargs: calls.append(args)
        for changed, received in [
            ({**identity, 'archiveSha256': 'b' * 64}, data),
            ({**identity, 'mtlSourceSha256': 'b' * 64}, data),
            ({**identity, 'commit': 'main'}, data),
            ({**identity, 'archiveUrl': 'https://example.com/source.zip'}, data),
            ({**identity, 'archiveBytes': len(data) - 1}, data),
            (identity, data[:-1]),
        ]:
            with self.assertRaises(ValueError): installer.install(changed, opener=lambda *args, **kwargs: io.BytesIO(received), runner=run)
        self.assertEqual(calls, [])

    def test_bundle_rejects_wrong_version_weight_name_or_runtime_source(self):
        identity = json.loads((HERE / 'model-source.json').read_text(encoding='utf-8'))
        catalog = json.loads((HERE / 'runtime-manifest.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for changed in [
                {**catalog, 'multilingualVersion': 'v2'},
                {**catalog, 'runtimeSourceCommit': 'b' * 40},
            ]:
                with self.assertRaisesRegex(ValueError, 'selected speech version|runtime source'): bundle.verify(root, root, identity, changed)
            wrong_files = {**identity, 'files': {name.replace('_v3.', '_v2.'): value for name, value in identity['files'].items()}}
            with self.assertRaisesRegex(ValueError, 'model files'): bundle.verify(root, root, wrong_files, catalog)


if __name__ == '__main__':
    unittest.main()
