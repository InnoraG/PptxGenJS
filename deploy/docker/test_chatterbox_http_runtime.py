import contextlib
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.request
import urllib.error
import wave

spec = importlib.util.spec_from_file_location('speech_runtime', Path(__file__).with_name('chatterbox_http_runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class FakeTensor:
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return self
    def reshape(self, *args): return [0.0, 0.1, -0.1]


class FakeTorch:
    def manual_seed(self, value): self.seed = value
    def inference_mode(self): return contextlib.nullcontext()


class FakeModel:
    sr = 24000
    def __init__(self):
        self.conds = {'speaker': 'default'}
        self.observed = []
        self.fail = False

    def generate(self, text, audio_prompt_path=None):
        self.last_prompt = audio_prompt_path
        self.observed.append(self.conds['speaker'])
        if audio_prompt_path:
            self.conds['speaker'] = 'reference'
        if self.fail:
            raise RuntimeError('private implementation error')
        return FakeTensor()


class FakeMultilingualModel(FakeModel):
    def get_supported_languages(self): return {'en': 'English', 'fr': 'French', 'ar': 'Arabic', 'sw': 'Swahili'}

    def generate(self, text, audio_prompt_path=None, language_id=None):
        self.last_language = language_id
        return super().generate(text, audio_prompt_path)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.voices = {'voice': {'id': 'voice'}, 'reference': {'id': 'reference', 'referenceAudio': 'approved.wav'}}

    def test_selected_multilingual_version_controls_required_files_and_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for filename in runtime.model_files('multilingual', 'v3'):
                (root / filename).write_bytes(b'version fixture')
            v3 = runtime.model_digest(root, 'multilingual', 'v3')
            with self.assertRaises(runtime.RequestError): runtime.model_digest(root, 'multilingual')
            (root / runtime.MULTILINGUAL_WEIGHT_FILES['v2']).write_bytes(b'version fixture')
            v2 = runtime.model_digest(root, 'multilingual')
            legacy_identity = hashlib.sha256()
            for filename in runtime.MULTILINGUAL_FILES:
                legacy_identity.update((filename + '\0' + runtime.file_digest(root / filename) + '\n').encode())
            self.assertEqual(v2, 'sha256:' + legacy_identity.hexdigest())
            self.assertNotEqual(v2, v3, 'Even equal weight bytes with different selected filenames have distinct identities.')
            (root / runtime.MULTILINGUAL_WEIGHT_FILES['v2']).write_bytes(b'changed unused v2')
            self.assertEqual(runtime.model_digest(root, 'multilingual', 'v3'), v3)
            (root / runtime.MULTILINGUAL_WEIGHT_FILES['v3']).write_bytes(b'changed selected v3')
            self.assertNotEqual(runtime.model_digest(root, 'multilingual', 'v3'), v3)
        for version in ('v1', 'V3', '', None, 't3_mtl23ls_v3.safetensors'):
            with self.assertRaises(runtime.RequestError): runtime.model_files('multilingual', version)
        with self.assertRaises(runtime.RequestError): runtime.model_files('english', 'v3')

    def test_multilingual_loader_selects_v3_explicitly_and_never_retries_v2(self):
        class SelectorModel:
            calls = []
            @classmethod
            def from_local(cls, directory, device, t3_model=None):
                cls.calls.append((directory, device, t3_model))
                return 'selected-model'
        self.assertEqual(runtime.load_local_model(SelectorModel, Path('local-model'), variant='multilingual', multilingual_version='v3'), 'selected-model')
        self.assertEqual(SelectorModel.calls, [(Path('local-model'), 'cpu', 'v3')])
        runtime.load_local_model(SelectorModel, Path('local-model'), variant='multilingual')
        self.assertEqual(SelectorModel.calls[-1][2], 'v2')
        class LegacyModel:
            calls = 0
            @classmethod
            def from_local(cls, directory, device):
                cls.calls += 1
                return 'legacy-model'
        with self.assertRaises(runtime.RequestError): runtime.load_local_model(LegacyModel, Path('local-model'), variant='multilingual', multilingual_version='v3')
        self.assertEqual(LegacyModel.calls, 0)
        self.assertEqual(runtime.load_local_model(LegacyModel, Path('local-model'), variant='multilingual'), 'legacy-model')
        class WildcardModel:
            calls = 0
            @classmethod
            def from_local(cls, directory, device, **kwargs):
                cls.calls += 1
        with self.assertRaises(runtime.RequestError): runtime.load_local_model(WildcardModel, Path('local-model'), variant='multilingual', multilingual_version='v3')
        self.assertEqual(WildcardModel.calls, 0, 'A wildcard argument must not be assumed to honor explicit model selection.')
        class FailedSelector:
            calls = []
            @classmethod
            def from_local(cls, directory, device, t3_model=None):
                cls.calls.append(t3_model)
                raise TypeError('selected runtime load failed')
        with self.assertRaises(TypeError): runtime.load_local_model(FailedSelector, Path('local-model'), variant='multilingual', multilingual_version='v3')
        self.assertEqual(FailedSelector.calls, ['v3'])

    def test_v3_catalog_requires_explicit_version_and_matching_selected_digest(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for filename in set(runtime.model_files('multilingual', 'v2') + runtime.model_files('multilingual', 'v3')):
                (root / filename).write_bytes(b'identity fixture')
            manifest = root / 'voices.json'
            voice = {'id': 'voice', 'reviewStatus': 'approved', 'commercialUse': 'allowed', 'language': 'en'}
            data = {'provider': 'chatterbox-http', 'modelVariant': 'multilingual', 'multilingualVersion': 'v3', 'modelDigest': runtime.model_digest(root, 'multilingual', 'v3'), 'voices': [voice]}
            manifest.write_text(json.dumps(data))
            self.assertIn('voice', runtime.load_voices(manifest, root, variant='multilingual', multilingual_version='v3'))
            with self.assertRaises(runtime.RequestError): runtime.load_voices(manifest, root, variant='multilingual')
            for changed in [
                {**data, 'multilingualVersion': 'v2'},
                {key: value for key, value in data.items() if key != 'multilingualVersion'},
                {key: value for key, value in data.items() if key != 'modelDigest'},
                {**data, 'modelDigest': runtime.model_digest(root, 'multilingual', 'v2')},
                {**data, 'voices': [{**voice, 'multilingualVersion': 'v2'}]},
            ]:
                manifest.write_text(json.dumps(changed))
                with self.assertRaises(runtime.RequestError): runtime.load_voices(manifest, root, variant='multilingual', multilingual_version='v3')
            legacy = {**data, 'modelDigest': runtime.model_digest(root, 'multilingual', 'v2')}
            del legacy['multilingualVersion']
            manifest.write_text(json.dumps(legacy))
            self.assertIn('voice', runtime.load_voices(manifest, root, variant='multilingual'))

    def test_validation_rejects_unknown_fields_voices_and_languages(self):
        self.assertEqual(runtime.validate_request({'text': 'Hello', 'voice': 'voice', 'language': 'en-US'}, self.voices)[0], 'Hello')
        for request in [
            {'text': 'Hello', 'voice': 'voice', 'speaker': 0},
            {'text': 'Hello', 'voice': '../private'},
            {'text': 'Hello', 'voice': 'voice', 'language': 'fr'},
            {'text': 'x' * 1001, 'voice': 'voice'},
            {'text': ' ', 'voice': 'voice'},
            [],
        ]:
            with self.assertRaises(runtime.RequestError):
                runtime.validate_request(request, self.voices)

    def test_wav_conversion_is_pcm16_finite_clipped_and_measured(self):
        data = runtime.pcm_wav([-2, -1, 0, 1, 2], 24000)
        with wave.open(io.BytesIO(data), 'rb') as stream:
            self.assertEqual((stream.getframerate(), stream.getsampwidth(), stream.getnchannels()), (24000, 2, 1))
            self.assertEqual(struct.unpack('<5h', stream.readframes(5)), (-32768, -32768, 0, 32767, 32767))
        for samples in [[], [float('nan')], [float('inf')]]:
            with self.assertRaises(runtime.RequestError): runtime.pcm_wav(samples, 24000)

    def test_multilingual_uses_actual_requested_language_and_voice_allowlist(self):
        voices = {'female': {'id': 'female', 'languages': ['en', 'fr', 'ar', 'sw']}, 'english': {'id': 'english', 'language': 'en'}}
        model = FakeMultilingualModel()
        worker = runtime.SpeechWorker(model, voices, FakeTorch(), variant='multilingual')
        for language in ('en-US', 'fr-FR', 'ar', 'sw-KE'):
            worker.synthesize({'text': 'Test', 'voice': 'female', 'language': language})
            self.assertEqual(model.last_language, language.split('-')[0])
        with self.assertRaises(runtime.RequestError): worker.synthesize({'text': 'Test', 'voice': 'english', 'language': 'fr'})
        with self.assertRaises(runtime.RequestError): worker.synthesize({'text': 'Test', 'voice': 'female', 'language': 'xx'})
        with self.assertRaises(runtime.RequestError): worker.synthesize({'text': 'Test', 'voice': 'female', 'language': 'de'})

    def test_reference_conditionals_reset_even_after_failure_and_busy_is_nonblocking(self):
        model = FakeModel()
        torch = FakeTorch()
        worker = runtime.SpeechWorker(model, self.voices, torch)
        worker.synthesize({'text': 'Hello', 'voice': 'reference'})
        self.assertEqual(model.conds, {'speaker': 'default'})
        worker.synthesize({'text': 'Hello', 'voice': 'voice'})
        self.assertEqual(model.observed, ['default', 'default'])
        self.assertEqual(torch.seed, 7)
        model.fail = True
        with self.assertRaises(RuntimeError): worker.synthesize({'text': 'Hello', 'voice': 'reference'})
        self.assertEqual(model.conds, {'speaker': 'default'})
        self.assertTrue(worker.lock.acquire(blocking=False))
        try:
            with self.assertRaises(BlockingIOError): worker.synthesize({'text': 'Hello', 'voice': 'voice'})
        finally: worker.lock.release()

    def test_manifest_checks_approval_reference_root_and_declared_hashes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            models = root / 'models'; models.mkdir()
            with self.assertRaises(runtime.RequestError): runtime.model_digest(models)
            for name in runtime.WEIGHT_FILES:
                (models / name).write_bytes(b'fixture only')
            reference = root / 'reference.wav'; reference.write_bytes(b'fixture only')
            manifest = root / 'voices.json'
            voice = {'id': 'voice', 'reviewStatus': 'approved', 'commercialUse': 'allowed', 'referenceAudio': 'reference.wav', 'referenceDigest': runtime.file_digest(reference)}
            data = {'provider': 'chatterbox-http', 'modelDigest': runtime.model_digest(models), 'voices': [voice]}
            manifest.write_text(json.dumps(data))
            self.assertEqual(runtime.load_voices(manifest, models)['voice']['referenceAudio'], str(reference.resolve()))
            data['modelDigest'] = 'sha256:incorrect'; manifest.write_text(json.dumps(data))
            with self.assertRaises(runtime.RequestError): runtime.load_voices(manifest, models)
            del data['modelDigest']; voice['commercialUse'] = 'unknown'; manifest.write_text(json.dumps(data))
            with self.assertRaises(runtime.RequestError): runtime.load_voices(manifest, models)
            voice['commercialUse'] = 'allowed'; voice['referenceAudio'] = '../outside.wav'; manifest.write_text(json.dumps(data))
            with self.assertRaises((runtime.RequestError, FileNotFoundError)): runtime.load_voices(manifest, models)

    def registration(self, voice='voice_' + 'a' * 64, languages=None):
        audio = runtime.pcm_wav([0.05, -0.05] * 12000, 8000)
        return {'voice': voice, 'referenceWavBase64': base64.b64encode(audio).decode(), 'referenceDigest': 'sha256:' + hashlib.sha256(audio).hexdigest(), 'languages': languages or ['en'], 'rightsConfirmed': True}

    def test_custom_registration_is_opt_in_strict_bounded_and_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            worker = runtime.SpeechWorker(FakeModel(), dict(self.voices), FakeTorch(), custom_reference_root=folder)
            request = self.registration()
            registered = worker.register_voice(request)
            self.assertEqual(registered, {'id': 'voice_' + 'a' * 64, 'referenceDigest': request['referenceDigest'], 'languages': ['en'], 'durationMs': 3000})
            self.assertEqual(worker.register_voice(request), registered)
            self.assertEqual(len(list(Path(folder).iterdir())), 1)
            worker.synthesize({'text': 'New words.', 'voice': request['voice'], 'language': 'en'})
            self.assertEqual(Path(worker.model.last_prompt).parent, Path(folder).resolve())
            self.assertEqual(worker.model.conds, {'speaker': 'default'})
            invalid = [
                {**request, 'referenceAudio': '/private/sample.wav'},
                {**request, 'voice': '../custom-test'},
                {**request, 'rightsConfirmed': False},
                {**request, 'referenceDigest': 'sha256:' + '0' * 64},
                {**request, 'languages': ['fr']},
                {**request, 'referenceWavBase64': 'https://example.test/sample.wav'},
            ]
            for value in invalid:
                with self.assertRaises(runtime.RequestError): worker.register_voice(value)
            changed = self.registration()
            changed_audio = runtime.pcm_wav([0.1, -0.1] * 12000, 8000)
            changed['referenceWavBase64'] = base64.b64encode(changed_audio).decode()
            changed['referenceDigest'] = 'sha256:' + hashlib.sha256(changed_audio).hexdigest()
            with self.assertRaises(runtime.RequestError): worker.register_voice(changed)
        disabled = runtime.SpeechWorker(FakeModel(), dict(self.voices), FakeTorch())
        with self.assertRaises(runtime.RequestError): disabled.register_voice(self.registration())

    def test_custom_reference_requires_complete_audible_three_to_thirty_second_pcm16(self):
        for audio in [runtime.pcm_wav([0.1] * 7999, 8000), runtime.pcm_wav([0.0] * 24000, 8000), runtime.pcm_wav([0.00003] * 24000, 8000), b'not WAV']:
            with self.assertRaises(runtime.RequestError): runtime.validate_reference_wav(audio)
        data = runtime.pcm_wav([0.1] * 24000, 8000)
        with self.assertRaises(runtime.RequestError): runtime.validate_reference_wav(data[:-2])
        with self.assertRaises(runtime.RequestError): runtime.validate_reference_wav(b'x' * (runtime.MAX_REFERENCE_BYTES + 1))

    def test_custom_voice_http_registration_hides_private_voices_and_references(self):
        with tempfile.TemporaryDirectory() as folder:
            worker = runtime.SpeechWorker(FakeMultilingualModel(), dict(self.voices), FakeTorch(), variant='multilingual', custom_reference_root=folder)
            server = runtime.ThreadingHTTPServer(('127.0.0.1', 0), runtime.make_handler(worker))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            origin = 'http://127.0.0.1:' + str(server.server_port)
            try:
                payload = self.registration(languages=['en', 'fr'])
                request = urllib.request.Request(origin + '/voices/register', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
                with urllib.request.urlopen(request) as response:
                    registration = json.load(response)
                self.assertNotIn('referenceAudio', registration)
                self.assertNotIn(folder, json.dumps(registration))
                with urllib.request.urlopen(origin + '/voices') as response:
                    catalog = json.load(response)
                self.assertFalse(any(voice['id'] == payload['voice'] for voice in catalog['voices']))
                worker.synthesize({'text': 'Bonjour.', 'voice': payload['voice'], 'language': 'fr'})
                self.assertEqual(worker.model.last_language, 'fr')
                bad = urllib.request.Request(origin + '/voices/register', data=json.dumps({**payload, 'rightsConfirmed': False}).encode(), method='POST')
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(bad)
                self.assertEqual(caught.exception.code, 400)
                self.assertNotIn(folder, caught.exception.read().decode())
                caught.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_custom_voice_cache_evicts_lru_and_rehydrates_without_cross_voice_state(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(runtime, 'MAX_CUSTOM_VOICES', 2):
            worker = runtime.SpeechWorker(FakeModel(), dict(self.voices), FakeTorch(), custom_reference_root=folder)
            first = self.registration('voice_' + 'a' * 64)
            second = self.registration('voice_' + 'b' * 64)
            third = self.registration('voice_' + 'c' * 64)
            audio = runtime.pcm_wav([0.1, -0.1] * 12000, 8000)
            third['referenceWavBase64'] = base64.b64encode(audio).decode()
            third['referenceDigest'] = 'sha256:' + hashlib.sha256(audio).hexdigest()
            worker.register_voice(first)
            worker.register_voice(second)
            worker.register_voice(third)
            self.assertNotIn(first['voice'], worker.voices)
            self.assertIn(second['voice'], worker.voices)
            self.assertEqual(len(list(Path(folder).glob('*.wav'))), 2)
            worker.register_voice(first)
            self.assertNotIn(second['voice'], worker.voices)
            worker.synthesize({'text': 'Restored.', 'voice': first['voice'], 'language': 'en'})
            self.assertEqual(worker.model.conds, {'speaker': 'default'})
            worker.register_voice(third)
            self.assertEqual(len(worker.custom_voice_order), 2)
            # A busy inference lock prevents registration from evicting its input.
            worker.lock.acquire()
            try:
                with self.assertRaises(BlockingIOError): worker.register_voice(second)
                self.assertIn(first['voice'], worker.voices)
            finally:
                worker.lock.release()
            # Restart retains no tenant catalog. A new registration can reclaim
            # old, unreferenced cache files without a lifetime capacity failure.
            restarted = runtime.SpeechWorker(FakeModel(), dict(self.voices), FakeTorch(), custom_reference_root=folder)
            fourth = self.registration('voice_' + 'd' * 64)
            other = runtime.pcm_wav([0.15, -0.15] * 12000, 8000)
            fourth['referenceWavBase64'] = base64.b64encode(other).decode()
            fourth['referenceDigest'] = 'sha256:' + hashlib.sha256(other).hexdigest()
            restarted.register_voice(fourth)
            self.assertEqual(len(list(Path(folder).glob('*.wav'))), 2)


if __name__ == '__main__':
    unittest.main()
