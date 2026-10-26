"""Private authenticated-RPC worker; no HTTP endpoints or product diagnostics."""
import modal


class NarrationWorker:
    @modal.enter()
    def load(self):
        import hashlib
        import importlib.util
        import inspect
        import json
        import os
        from pathlib import Path
        import sys
        import time
        import uuid

        started = time.perf_counter()
        os.environ['OMP_NUM_THREADS'] = '2'
        os.environ['MKL_NUM_THREADS'] = '2'
        import torch
        import chatterbox.mtl_tts as mtl
        assert hashlib.sha256(Path(mtl.__file__).read_bytes()).hexdigest() == '936759044e54cffe8c68b91b32e01da0bc032a1e084f769f0403080d86ad153c'
        assert 't3_model' in inspect.signature(mtl.ChatterboxMultilingualTTS.from_local).parameters
        torch.set_num_threads(2)
        sys.path.insert(0, '/app')
        import speech_loudness
        spec = importlib.util.spec_from_file_location('private_speech_runtime', '/app/runtime.py')
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        catalog = json.loads(Path('/app/runtime-manifest.json').read_text())
        expected_digest = 'sha256:4afe36eeb538555c62c8b768f312a89580a1ef8f764dc7ef87487f8289e25875'
        expected_checkpoint = 'sha256:5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953'
        assert catalog['modelDigest'] == expected_digest and catalog['multilingualVersion'] == 'v3'
        original_digest, observed = runtime.file_digest, {}

        def capture_digest(path):
            result = original_digest(path)
            observed[Path(path).name] = result
            return result

        runtime.file_digest = capture_digest
        try:
            voices = runtime.load_voices('/app/runtime-manifest.json', '/app/model-links', '/references', 'multilingual', 'v3')
        finally:
            runtime.file_digest = original_digest
        assert observed['t3_mtl23ls_v3.safetensors'] == expected_checkpoint
        model = runtime.load_local_model(mtl.ChatterboxMultilingualTTS, Path('/app/model-links'), device='cuda', variant='multilingual', multilingual_version='v3')
        assert {parameter.dtype for parameter in model.t3.parameters()} == {torch.float32}
        self.worker = runtime.SpeechWorker(model, voices, torch, seed=7, variant='multilingual', custom_reference_root='/tmp/private-reference-cache')
        self.runtime, self.loudness, self.torch = runtime, speech_loudness, torch
        self.instance_id = uuid.uuid4().hex
        self.load_seconds = time.perf_counter() - started
        self.synthesis_count = 0
        self.registration_count = 0

    @modal.method()
    def voices(self):
        fields = ('id', 'name', 'language', 'languages', 'locale', 'gender')
        return {'voices': [{key: voice[key] for key in fields if key in voice}
                           for voice in self.worker.voices.values() if not voice.get('_custom')]}

    @modal.method()
    def register(self, data):
        try:
            result = self.worker.register_voice(data)
            self.registration_count += 1
            return {'ok': True, 'result': result}
        except (self.runtime.RequestError, ValueError, UnicodeError):
            return {'ok': False, 'status': 400}
        except BlockingIOError:
            return {'ok': False, 'status': 503}

    @modal.method()
    def synthesize(self, data):
        try:
            self.runtime.validate_request(data, self.worker.voices, 'multilingual', self.worker.supported_languages)
        except (self.runtime.RequestError, ValueError, UnicodeError):
            return {'ok': False, 'status': 400}
        try:
            # Canonical SpeechWorker levels FLOAT samples before PCM encoding.
            audio = self.worker.synthesize(data)
            self.synthesis_count += 1
            return {'ok': True, 'audio': audio}
        except Exception:
            return {'ok': False, 'status': 503}

    @modal.method()
    def inspect_state(self):
        """Maintainer RPC only. The HTTP bridge never exposes this method."""
        return {'instanceId': self.instance_id, 'loadCount': 1,
                'loadSeconds': round(self.load_seconds, 4),
                'synthesisCount': self.synthesis_count, 'registrationCount': self.registration_count,
                'multilingualVersion': 'v3', 'checkpointVerified': True,
                'gpuName': self.torch.cuda.get_device_name(),
                'gpuPeakAllocatedBytes': self.torch.cuda.max_memory_allocated()}
