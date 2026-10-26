"""Maintainer-only single-clip container acceptance; run inside an owned container."""
import base64
import hashlib
import io
import json
import math
from pathlib import Path
import time
import struct
import urllib.request
import wave

BASE = 'http://127.0.0.1:8080'


def request(route, payload=None, timeout=5):
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {'Content-Type': 'application/json'} if data is not None else {}
    with urllib.request.urlopen(urllib.request.Request(BASE + route, data=data, headers=headers), timeout=timeout) as response:
        return response.read(8 * 1024 * 1024)


deadline = time.monotonic() + 240
while True:
    try:
        assert json.loads(request('/health'))['ready'] is True
        break
    except Exception:
        if time.monotonic() >= deadline:
            raise RuntimeError('Container did not become ready within the bounded wait')
        time.sleep(2)
catalog = json.loads(request('/voices'))['voices']
assert len(catalog) == 8
assert all(not set(voice) & {'referenceAudio', 'customReference', 'modelPath', 'referenceDigest'} for voice in catalog)
sample = Path('/speech-bundle/references/female-ljspeech.wav').read_bytes()
identity = 'voice_' + hashlib.sha256(b'private-container-acceptance-current').hexdigest()
languages = 'ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh'.split()
registered = json.loads(request('/voices/register', {
    'voice': identity, 'referenceWavBase64': base64.b64encode(sample).decode(),
    'referenceDigest': 'sha256:' + hashlib.sha256(sample).hexdigest(),
    'languages': languages, 'rightsConfirmed': True,
}))
assert registered['id'] == identity
after = json.loads(request('/voices'))['voices']
assert len(after) == 8 and not any(voice['id'] == identity for voice in after)
started = time.monotonic()
audio = request('/synthesize', {'text': 'Hello. Welcome.', 'voice': identity, 'language': 'en'}, timeout=600)
seconds = time.monotonic() - started
with wave.open(io.BytesIO(audio)) as stream:
    assert stream.getnchannels() == 1 and stream.getsampwidth() == 2 and stream.getnframes() > 0
    duration_ms = round(stream.getnframes() / stream.getframerate() * 1000)
    sample_rate = stream.getframerate()
    pcm = stream.readframes(stream.getnframes())
rms = math.sqrt(sum((value[0] / 32768) ** 2 for value in struct.iter_unpack('<h', pcm)) / (len(pcm) / 2))
assert rms > 0.0001, 'Generated speech is effectively silent'
Path('/tmp/private-container-acceptance.wav').write_bytes(audio)
report = {'status': 'PASS', 'catalogCount': 8, 'privateVoiceHidden': True,
          'registeredLanguageCount': len(languages), 'synthesisSeconds': round(seconds, 3),
          'audioBytes': len(audio), 'audioSha256': hashlib.sha256(audio).hexdigest(),
          'audioDurationMs': duration_ms, 'sampleRate': sample_rate,
          'channels': 1, 'bitsPerSample': 16,
          'rms': round(rms, 6),
          'peakMemoryBytes': int(Path('/sys/fs/cgroup/memory.peak').read_text()),
          'limitations': ['No native listening or speaker-similarity certification.',
                          'This local container proof does not certify Cloud Run cold starts or mounted private-profile persistence.']}
Path('/tmp/private-container-acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report), flush=True)
