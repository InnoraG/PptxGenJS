"""Approved, language-preserving private speech fallback and output leveling."""
import asyncio
import base64
from functools import lru_cache
import io
import json
import math
import os
from pathlib import Path
import time
from urllib.parse import urlsplit
import wave

import httpx

MAX_AUDIO_BYTES = 64 * 1024 * 1024
_identity = {}
_normalization = asyncio.Semaphore(1)


def language(value):
    return str(value or '').lower().replace('_', '-').split('-')[0]


@lru_cache(maxsize=1)
def configuration():
    url = os.environ.get('BETTERPPTX_NARRATION_PIPER_URL', '').rstrip('/')
    if not url:
        return None
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.run.app') or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError('Invalid private fallback configuration.')
    audience = f'https://{parsed.hostname}'
    source = os.environ.get('BETTERPPTX_NARRATION_FALLBACK_MAP')
    data = json.loads(source) if source else json.loads(Path(__file__).with_name('fallback-map.json').read_text())
    catalog_path = os.environ.get('BETTERPPTX_NARRATION_CATALOG', str(Path(__file__).with_name('runtime-manifest.json')))
    catalog = json.loads(Path(catalog_path).read_text())
    voices = {row['id']: row for row in catalog['voices']}
    if data.get('schemaVersion') != 1 or not isinstance(data.get('mappings'), dict):
        raise ValueError('Invalid private fallback configuration.')
    for source_voice, target in data['mappings'].items():
        if source_voice not in voices or not isinstance(target, dict) or set(target) - {'voice', 'speaker'}:
            raise ValueError('Fallback requires an approved catalog voice.')
        if not isinstance(target.get('voice'), str) or not 0 < len(target['voice']) <= 128 or not all(char.isalnum() or char in '_.-' for char in target['voice']):
            raise ValueError('Invalid private fallback configuration.')
        if 'speaker' in target and (type(target['speaker']) is not int or not 0 <= target['speaker'] <= 65535):
            raise ValueError('Invalid private fallback configuration.')
    return {'url': url, 'audience': audience, 'mappings': data['mappings'], 'voices': voices}


async def identity_token(client, audience):
    cached = _identity.get(audience)
    if cached and cached[1] > time.time() + 60:
        return cached[0]
    response = await client.get('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity',
                                params={'audience': audience, 'format': 'full'},
                                headers={'Metadata-Flavor': 'Google'}, timeout=3)
    response.raise_for_status()
    token = response.text.strip()
    if len(token) > 16384 or len(token.split('.')) != 3:
        raise ValueError('Identity unavailable.')
    claims = token.split('.')[1]
    expiry = json.loads(base64.urlsafe_b64decode(claims + '=' * (-len(claims) % 4)))['exp']
    if not isinstance(expiry, (int, float)) or expiry <= time.time():
        raise ValueError('Identity unavailable.')
    _identity[audience] = (token, expiry)
    return token


def normalize_fallback(audio):
    import numpy as np
    from scipy.signal import resample_poly
    from speech_loudness import normalize_wav, normalize_samples_to_wav
    if len(audio) > MAX_AUDIO_BYTES:
        raise ValueError('Invalid audio.')
    with wave.open(io.BytesIO(audio)) as source:
        rate, channels, width = source.getframerate(), source.getnchannels(), source.getsampwidth()
        if source.getcomptype() != 'NONE' or channels != 1 or width != 2 or not 8000 <= rate <= 96000 or not 0 < source.getnframes() <= rate * 600:
            raise ValueError('Invalid audio.')
        frames = source.readframes(source.getnframes())
        if len(frames) != source.getnframes() * 2:
            raise ValueError('Invalid audio.')
    if rate != 24000:
        divisor = math.gcd(rate, 24000)
        samples = np.frombuffer(frames, dtype='<i2').astype(np.float64) / 32768
        samples = resample_poly(samples, 24000 // divisor, rate // divisor)
        return normalize_samples_to_wav(samples, 24000)
    return normalize_wav(audio)


async def request_piper(body):
    config = configuration()
    if config is None:
        raise RuntimeError('Speech service is unavailable.')
    async with httpx.AsyncClient(timeout=120, follow_redirects=False, trust_env=False) as client:
        token = await identity_token(client, config['audience'])
        async with client.stream('POST', config['url'], headers={'Content-Type': 'application/json', 'Accept': 'audio/wav',
                                  'X-Serverless-Authorization': f'Bearer {token}'},
                                 json=body) as response:
            response.raise_for_status()
            chunks, total = [], 0
            async for block in response.aiter_bytes():
                total += len(block)
                if total > MAX_AUDIO_BYTES:
                    raise ValueError('Invalid audio.')
                chunks.append(block)
    # Bound CPU/DSP memory independently of the four admitted RPC requests.
    async with _normalization:
        task = asyncio.create_task(asyncio.to_thread(normalize_fallback, b''.join(chunks)))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise


async def synthesize_fallback(payload):
    """None means no approved fallback; errors remain generic at the HTTP boundary."""
    config = configuration()
    if config is None:
        return None
    source_voice = payload.get('voice')
    target = config['mappings'].get(source_voice)
    if target is None:
        return None
    declared = config['voices'][source_voice]
    source_language = language(declared.get('language', declared.get('locale')))
    selected_language = language(payload.get('language', source_language))
    if not source_language or selected_language != source_language:
        return None
    audio = await request_piper({'text': payload['text'], **target})
    headers = {'X-Speech-Fallback': '1', 'X-Speech-Voice-Id': target['voice']}
    if 'speaker' in target:
        headers['X-Speech-Speaker'] = str(target['speaker'])
    return audio, headers


@lru_cache(maxsize=1)
def legacy_voices():
    source = os.environ.get('BETTERPPTX_NARRATION_LEGACY_CATALOG', str(Path(__file__).with_name('piper-manifest.json')))
    rows = json.loads(Path(source).read_text())['voices']
    return {row['id']: row for row in rows if row.get('reviewStatus') == 'approved' and row.get('commercialUse') in ('allowed', 'attribution')}


def validate_legacy(payload):
    if not isinstance(payload, dict) or set(payload) - {'text', 'voice', 'speaker', 'length_scale', 'noise_scale', 'noise_w_scale'}:
        raise ValueError()
    if not isinstance(payload.get('text'), str) or not 0 < len(payload['text'].strip()) <= 4000:
        raise ValueError()
    if not isinstance(payload.get('voice'), str) or payload['voice'] not in legacy_voices():
        raise ValueError()
    approved = legacy_voices()[payload['voice']]
    if 'speaker' in payload and (type(payload['speaker']) is not int or not 0 <= payload['speaker'] < int(approved.get('numSpeakers', 1))):
        raise ValueError()
    for field in ('length_scale', 'noise_scale', 'noise_w_scale'):
        if field in payload:
            value = payload[field]
            if type(value) not in (int, float) or not math.isfinite(value) or not (0 < value <= 10 if field == 'length_scale' else 0 <= value <= 10):
                raise ValueError()
    return payload


async def synthesize_legacy(payload):
    validate_legacy(payload)
    audio = await request_piper(payload)
    headers = {'X-Speech-Fallback': '0', 'X-Speech-Selection': 'explicit', 'X-Speech-Voice-Id': payload['voice']}
    if 'speaker' in payload:
        headers['X-Speech-Speaker'] = str(payload['speaker'])
    return audio, headers
