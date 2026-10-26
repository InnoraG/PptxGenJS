"""Private local speech worker. Models must be provisioned before startup."""
import argparse
import base64
import copy
import hashlib
import io
import inspect
import json
import math
import os
from pathlib import Path
import re
import struct
import threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import wave

MAX_BODY = 16384
MAX_TEXT = 1000
MAX_REFERENCE_BYTES = 8 * 1024 * 1024
MAX_REGISTRATION_BODY = 12 * 1024 * 1024
MAX_CUSTOM_VOICES = 32
WEIGHT_FILES = ('conds.pt', 's3gen.safetensors', 't3_cfg.safetensors', 've.safetensors')
MULTILINGUAL_FILES = ('conds.pt', 'grapheme_mtl_merged_expanded_v1.json', 's3gen.pt', 't3_mtl23ls_v2.safetensors', 've.pt')
MULTILINGUAL_WEIGHT_FILES = {'v2': 't3_mtl23ls_v2.safetensors', 'v3': 't3_mtl23ls_v3.safetensors'}
MULTILINGUAL_LANGUAGES = frozenset('ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh'.split())


class RequestError(Exception):
    pass


def file_digest(path):
    hasher = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            hasher.update(chunk)
    return 'sha256:' + hasher.hexdigest()


def validate_model_selection(variant='english', multilingual_version='v2'):
    if variant not in ('english', 'multilingual'):
        raise RequestError('Unsupported speech model variant.')
    if multilingual_version not in MULTILINGUAL_WEIGHT_FILES:
        raise RequestError('Unsupported speech model version.')
    if variant != 'multilingual' and multilingual_version != 'v2':
        raise RequestError('Speech model version does not match the selected variant.')


def model_files(variant='english', multilingual_version='v2'):
    validate_model_selection(variant, multilingual_version)
    if variant == 'english':
        return WEIGHT_FILES
    return tuple(MULTILINGUAL_WEIGHT_FILES[multilingual_version] if name == MULTILINGUAL_WEIGHT_FILES['v2'] else name for name in MULTILINGUAL_FILES)


def model_digest(root, variant='english', multilingual_version='v2'):
    hasher = hashlib.sha256()
    # The selected weight filename participates in identity. Keep legacy v2
    # digests stable while making v3 identities unambiguously version-specific.
    for name in model_files(variant, multilingual_version):
        path = Path(root) / name
        if not path.is_file():
            raise RequestError('Required local model weights are unavailable.')
        hasher.update((name + '\0' + file_digest(path) + '\n').encode())
    return 'sha256:' + hasher.hexdigest()


def language_code(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z]{2}(?:[-_][A-Za-z]{2})?', value):
        raise RequestError('Invalid speech language.')
    return re.split('[-_]', value.lower())[0]


def supported_for_variant(variant):
    if variant == 'english':
        return frozenset({'en'})
    if variant == 'multilingual':
        return MULTILINGUAL_LANGUAGES
    raise RequestError('Unsupported speech model variant.')


def load_voices(manifest_path, model_dir, reference_root=None, variant='english', multilingual_version='v2'):
    validate_model_selection(variant, multilingual_version)
    manifest_path = Path(manifest_path).resolve(strict=True)
    root = Path(reference_root or manifest_path.parent).resolve(strict=True)
    data = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    if data.get('provider') != 'chatterbox-http' or not isinstance(data.get('voices'), list):
        raise RequestError('Invalid voice catalog.')
    supported = supported_for_variant(variant)
    if data.get('modelVariant', variant) != variant:
        raise RequestError('Voice catalog does not match the speech model.')
    if variant == 'multilingual' and data.get('multilingualVersion', 'v2') != multilingual_version:
        raise RequestError('Voice catalog does not match the speech model version.')
    if variant == 'multilingual' and multilingual_version == 'v3' and not re.fullmatch(r'sha256:[a-f0-9]{64}', str(data.get('modelDigest', ''))):
        raise RequestError('Voice catalog requires the selected model identity.')
    actual_model_digest = model_digest(model_dir, variant, multilingual_version)
    if data.get('modelDigest') and data['modelDigest'] != actual_model_digest:
        raise RequestError('Model identity does not match the voice catalog.')
    voices = {}
    for entry in data['voices']:
        voice = dict(entry)
        identity = voice.get('id', '')
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', identity) or identity in voices:
            raise RequestError('Invalid voice identity.')
        if voice.get('reviewStatus') != 'approved' or voice.get('commercialUse') not in ('allowed', 'attribution'):
            raise RequestError('Voice is not approved for use.')
        if voice.get('provider', 'chatterbox-http') != 'chatterbox-http':
            raise RequestError('Voice runtime mismatch.')
        if voice.get('modelDigest') and voice['modelDigest'] != actual_model_digest:
            raise RequestError('Model identity does not match the voice catalog.')
        if variant == 'multilingual' and voice.get('multilingualVersion', multilingual_version) != multilingual_version:
            raise RequestError('Voice does not match the speech model version.')
        languages = voice.get('languages', [voice.get('language', voice.get('locale', 'en'))])
        if not isinstance(languages, list) or not languages:
            raise RequestError('Invalid voice languages.')
        voice['languages'] = sorted({language_code(value) for value in languages})
        if not set(voice['languages']).issubset(supported):
            raise RequestError('Voice declares unsupported languages.')
        reference = voice.get('referenceAudio')
        if reference:
            candidate = Path(reference)
            candidate = (root / candidate).resolve(strict=True) if not candidate.is_absolute() else candidate.resolve(strict=True)
            if not candidate.is_relative_to(root) or not candidate.is_file():
                raise RequestError('Invalid approved reference audio.')
            if voice.get('referenceDigest') and voice['referenceDigest'] != file_digest(candidate):
                raise RequestError('Reference identity does not match the voice catalog.')
            voice['referenceAudio'] = str(candidate)
        elif voice.get('referenceDigest'):
            raise RequestError('Reference identity has no approved audio.')
        voices[identity] = voice
    if not voices:
        raise RequestError('Voice catalog is empty.')
    return voices


def load_local_model(model_class, model_dir, device='cpu', variant='english', multilingual_version='v2'):
    validate_model_selection(variant, multilingual_version)
    if variant != 'multilingual':
        return model_class.from_local(model_dir, device=device)
    try:
        parameter = inspect.signature(model_class.from_local).parameters.get('t3_model')
        selector_supported = parameter is not None and parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    except (TypeError, ValueError):
        selector_supported = False
    if not selector_supported:
        if multilingual_version == 'v3':
            raise RequestError('The configured speech runtime cannot load the selected model version.')
        # Older supported runtimes have a fixed v2 loader. Never take this
        # compatibility route for a v3 selection or retry a failed v3 load.
        return model_class.from_local(model_dir, device=device)
    return model_class.from_local(model_dir, device=device, t3_model=multilingual_version)


def validate_request(data, voices, variant='english', supported_languages=None):
    if not isinstance(data, dict) or set(data) - {'text', 'voice', 'language'}:
        raise RequestError('Unsupported synthesis fields.')
    text = data.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise RequestError('Text must contain between 1 and 1000 characters.')
    voice = data.get('voice')
    if not isinstance(voice, str) or voice not in voices:
        raise RequestError('Unknown voice identity.')
    chosen = voices[voice]
    language = language_code(data.get('language', chosen.get('language', chosen.get('locale', 'en'))))
    supported = supported_languages if supported_languages is not None else supported_for_variant(variant)
    if language not in supported:
        raise RequestError('This voice runtime does not support the requested language.')
    allowed = {language_code(value) for value in chosen.get('languages', [chosen.get('language', chosen.get('locale', 'en'))])}
    if language not in allowed:
        raise RequestError('The selected voice does not support the requested language.')
    return text.strip(), chosen, language


def pcm_wav(samples, sample_rate):
    if not isinstance(sample_rate, int) or sample_rate <= 0:
        raise RequestError('Invalid generated audio.')
    values = list(samples)
    if not values or any(not math.isfinite(float(value)) for value in values):
        raise RequestError('Invalid generated audio.')
    pcm = bytearray()
    for value in values:
        sample = max(-1.0, min(1.0, float(value)))
        pcm.extend(struct.pack('<h', round(sample * (32767 if sample >= 0 else 32768))))
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sample_rate)
        stream.writeframes(pcm)
    return output.getvalue()


def validate_reference_wav(audio):
    if not audio or len(audio) > MAX_REFERENCE_BYTES:
        raise RequestError('Invalid voice reference size.')
    try:
        with wave.open(io.BytesIO(audio), 'rb') as stream:
            channels = stream.getnchannels()
            rate = stream.getframerate()
            frames = stream.getnframes()
            if stream.getcomptype() != 'NONE' or stream.getsampwidth() != 2 or channels not in (1, 2) or not 8000 <= rate <= 48000:
                raise RequestError('Voice reference must be PCM16 WAV audio.')
            duration_ms = round(frames * 1000 / rate)
            if not 3 * rate <= frames <= 30 * rate:
                raise RequestError('Voice reference must last between 3 and 30 seconds.')
            samples = stream.readframes(frames)
            if len(samples) != frames * channels * 2:
                raise RequestError('Voice reference audio is empty or incomplete.')
            rms = math.sqrt(sum(value[0] ** 2 for value in struct.iter_unpack('<h', samples)) / (frames * channels)) / 32768
            if rms <= 0.0001:
                raise RequestError('Voice reference audio is effectively silent.')
            return duration_ms
    except (wave.Error, EOFError, struct.error) as cause:
        raise RequestError('Invalid voice reference audio.') from cause


class SpeechWorker:
    def __init__(self, model, voices, torch_module, seed=7, variant='english', custom_reference_root=None):
        self.model = model
        self.voices = voices
        self.torch = torch_module
        self.seed = seed
        self.variant = variant
        self.supported_languages = supported_for_variant(variant)
        if variant == 'multilingual':
            self.supported_languages = self.supported_languages.intersection(model.get_supported_languages())
        self.lock = threading.Lock()
        self.default_conditionals = copy.deepcopy(model.conds)
        self.custom_voice_order = OrderedDict()
        self.custom_reference_root = None
        if custom_reference_root:
            root = Path(custom_reference_root)
            root.mkdir(parents=True, exist_ok=True)
            self.custom_reference_root = root.resolve(strict=True)
        self.ready = True

    def _evict_custom_voice(self):
        identity, _ = self.custom_voice_order.popitem(last=False)
        record = self.voices.pop(identity)
        reference = Path(record['referenceAudio'])
        if not any(voice.get('_custom') and voice.get('referenceAudio') == str(reference) for voice in self.voices.values()):
            if reference.parent == self.custom_reference_root and not reference.is_symlink():
                reference.unlink(missing_ok=True)

    def _make_reference_cache_space(self, reference):
        if reference.exists():
            return
        while True:
            cache_files = [path for path in self.custom_reference_root.glob('*.wav') if re.fullmatch(r'[0-9a-f]{64}\.wav', path.name) and path.is_file() and not path.is_symlink()]
            if len(cache_files) < MAX_CUSTOM_VOICES:
                return
            active = {voice.get('referenceAudio') for voice in self.voices.values() if voice.get('_custom')}
            unused = sorted((path for path in cache_files if str(path) not in active), key=lambda path: path.stat().st_mtime_ns)
            if unused:
                unused[0].unlink()
            elif self.custom_voice_order:
                self._evict_custom_voice()
            else:
                raise RequestError('Private voice reference cache is unavailable.')

    def register_voice(self, data):
        if self.custom_reference_root is None:
            raise RequestError('Custom voice registration is unavailable.')
        expected_fields = {'voice', 'referenceWavBase64', 'referenceDigest', 'languages', 'rightsConfirmed'}
        if not isinstance(data, dict) or set(data) != expected_fields or data.get('rightsConfirmed') is not True:
            raise RequestError('Invalid custom voice registration.')
        identity = data['voice']
        if not isinstance(identity, str) or not re.fullmatch(r'voice_[0-9a-f]{64}', identity):
            raise RequestError('Invalid custom voice identity.')
        if not isinstance(data['languages'], list) or not data['languages']:
            raise RequestError('Invalid custom voice languages.')
        languages = sorted({language_code(value) for value in data['languages']})
        if not set(languages).issubset(self.supported_languages):
            raise RequestError('Unsupported custom voice language.')
        expected_digest = data['referenceDigest']
        if not isinstance(expected_digest, str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', expected_digest):
            raise RequestError('Invalid voice reference identity.')
        encoded = data['referenceWavBase64']
        if not isinstance(encoded, str) or len(encoded) > (MAX_REFERENCE_BYTES + 2) // 3 * 4:
            raise RequestError('Invalid voice reference size.')
        try:
            audio = base64.b64decode(encoded, validate=True)
        except (ValueError, UnicodeError) as cause:
            raise RequestError('Invalid voice reference encoding.') from cause
        if 'sha256:' + hashlib.sha256(audio).hexdigest() != expected_digest:
            raise RequestError('Voice reference identity does not match.')
        duration_ms = validate_reference_wav(audio)
        if not self.lock.acquire(blocking=False):
            raise BlockingIOError('Speech worker is busy.')
        try:
            existing = self.voices.get(identity)
            if existing and (not existing.get('_custom') or existing.get('referenceDigest') != expected_digest or existing.get('languages') != languages):
                raise RequestError('Custom voice identity is already registered with different settings.')
            if not existing and len(self.custom_voice_order) >= MAX_CUSTOM_VOICES:
                self._evict_custom_voice()
            reference = self.custom_reference_root / (expected_digest.removeprefix('sha256:') + '.wav')
            if reference.is_symlink() or reference.resolve().parent != self.custom_reference_root:
                raise RequestError('Invalid private voice reference destination.')
            self._make_reference_cache_space(reference)
            try:
                with reference.open('xb') as output:
                    output.write(audio)
            except FileExistsError:
                if file_digest(reference) != expected_digest:
                    raise RequestError('Stored voice reference identity does not match.')
            self.voices[identity] = {'id': identity, 'languages': languages, 'language': languages[0], 'referenceAudio': str(reference), 'referenceDigest': expected_digest, '_custom': True}
            self.custom_voice_order[identity] = None
            self.custom_voice_order.move_to_end(identity)
            return {'id': identity, 'referenceDigest': expected_digest, 'languages': languages, 'durationMs': duration_ms}
        finally:
            self.lock.release()

    def synthesize(self, data):
        if not self.lock.acquire(blocking=False):
            raise BlockingIOError('Speech worker is busy.')
        try:
            text, voice, language = validate_request(data, self.voices, self.variant, self.supported_languages)
            if voice.get('_custom'):
                self.custom_voice_order.move_to_end(voice['id'])
            self.model.conds = copy.deepcopy(self.default_conditionals)
            self.torch.manual_seed(self.seed)
            with self.torch.inference_mode():
                kwargs = {'audio_prompt_path': voice.get('referenceAudio')}
                if self.variant == 'multilingual':
                    kwargs['language_id'] = language
                generated = self.model.generate(text, **kwargs)
            samples = generated.detach().cpu().numpy().reshape(-1)
            return pcm_wav(samples, self.model.sr)
        finally:
            self.model.conds = copy.deepcopy(self.default_conditionals)
            self.lock.release()


def make_handler(worker):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'SpeechService'
        sys_version = ''

        def log_message(self, *args):
            pass

        def send_json(self, status, payload):
            self.send_bytes(status, json.dumps(payload).encode(), 'application/json')

        def send_bytes(self, status, payload, content_type):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.path == '/health':
                self.send_json(200 if worker.ready else 503, {'ready': worker.ready})
            elif self.path == '/voices':
                fields = ('id', 'name', 'language', 'languages', 'locale', 'gender')
                self.send_json(200, {'voices': [{key: voice[key] for key in fields if key in voice} for voice in list(worker.voices.values()) if not voice.get('_custom')]})
            else:
                self.send_json(404, {'error': 'Unknown route.'})

        def do_POST(self):
            if self.path not in ('/synthesize', '/voices/register'):
                self.send_json(404, {'error': 'Unknown route.'})
                return
            try:
                if self.headers.get('Transfer-Encoding'):
                    raise RequestError('Unsupported request encoding.')
                length = int(self.headers.get('Content-Length', '0'))
                body_limit = MAX_REGISTRATION_BODY if self.path == '/voices/register' else MAX_BODY
                if length <= 0 or length > body_limit:
                    raise RequestError('Invalid request size.')
                self.connection.settimeout(10)
                data = json.loads(self.rfile.read(length))
                if self.path == '/voices/register':
                    self.send_json(200, worker.register_voice(data))
                else:
                    audio = worker.synthesize(data)
                    self.send_bytes(200, audio, 'audio/wav')
            except BlockingIOError:
                self.send_json(503, {'error': 'Speech service is busy.'})
            except (RequestError, ValueError, UnicodeError):
                self.send_json(400, {'error': 'Invalid synthesis request.'})
            except Exception:
                if os.environ.get('CHATTERBOX_LOCAL_DIAGNOSTICS') == '1':
                    import traceback
                    traceback.print_exc()
                self.send_json(503, {'error': 'Speech service is unavailable.'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description='Run the private local speech service.')
    parser.add_argument('--host', default=os.environ.get('CHATTERBOX_HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('CHATTERBOX_PORT', '5001')))
    args = parser.parse_args()
    try:
        model_dir = Path(os.environ['CHATTERBOX_MODEL_DIR']).resolve(strict=True)
        variant = os.environ.get('CHATTERBOX_MODEL_VARIANT', 'english').lower()
        multilingual_version = os.environ.get('CHATTERBOX_MULTILINGUAL_VERSION', 'v2')
        voices = load_voices(os.environ['CHATTERBOX_VOICES_MANIFEST'], model_dir, os.environ.get('CHATTERBOX_REFERENCE_ROOT'), variant, multilingual_version)
        cpu_threads = min(os.cpu_count() or 1, max(1, int(os.environ.get('CHATTERBOX_CPU_THREADS', '4'))))
        os.environ['OMP_NUM_THREADS'] = str(cpu_threads)
        os.environ['MKL_NUM_THREADS'] = str(cpu_threads)
        os.environ.setdefault('TQDM_DISABLE', '1')
        import torch
        torch.set_num_threads(cpu_threads)
        if variant == 'multilingual':
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS as Model
        else:
            from chatterbox.tts import ChatterboxTTS as Model
        model = load_local_model(Model, model_dir, device=os.environ.get('CHATTERBOX_DEVICE', 'cpu'), variant=variant, multilingual_version=multilingual_version)
        worker = SpeechWorker(model, voices, torch, seed=int(os.environ.get('CHATTERBOX_SEED', '7')), variant=variant, custom_reference_root=os.environ.get('CHATTERBOX_CUSTOM_REFERENCE_ROOT'))
        server = ThreadingHTTPServer((args.host, args.port), make_handler(worker))
        print('Local speech service ready.', flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception:
        if os.environ.get('CHATTERBOX_LOCAL_DIAGNOSTICS') == '1':
            import traceback
            traceback.print_exc()
        raise SystemExit('Local speech service startup failed.') from None


if __name__ == '__main__':
    main()
