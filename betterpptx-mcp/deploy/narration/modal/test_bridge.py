"""Private bridge behavior: failover identity, input rejection, boundaries and audio."""
import asyncio
import base64
import io
import json
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

import httpx
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / 'deploy/docker'))
import bridge
import fallback
from speech_loudness import analyze_wav


def wav(rate=22050):
    values = np.rint(np.sin(np.arange(rate * 2) * 2 * np.pi * 220 / rate) * 400).astype('<i2')
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(rate)
        stream.writeframes(values.tobytes())
    return output.getvalue()


class FakeFunction:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.cancelled, self.calls = result, error, False, 0
        self.spawn = SimpleNamespace(aio=self.submit)

    async def submit(self, *args):
        self.calls += 1
        return SimpleNamespace(get=SimpleNamespace(aio=self.get), cancel=SimpleNamespace(aio=self.cancel))

    async def get(self, **kwargs):
        if self.error:
            raise self.error
        return self.result

    async def cancel(self, **kwargs):
        self.cancelled = True


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=bridge.app), base_url='http://local')
        self.environment = patch.dict(os.environ, {
            'BETTERPPTX_NARRATION_PIPER_URL': 'https://private-fallback.run.app/',
            'BETTERPPTX_NARRATION_CATALOG': str(HERE.parent / 'chatterbox/runtime-manifest.json'),
            'BETTERPPTX_NARRATION_LEGACY_CATALOG': str(REPO / 'betterpptx-mcp/narration/voices/runtime-manifest.production.json'),
        })
        self.environment.start()
        fallback.configuration.cache_clear(); fallback.legacy_voices.cache_clear(); fallback._identity.clear()

    async def asyncTearDown(self):
        self.environment.stop()
        fallback.configuration.cache_clear(); fallback.legacy_voices.cache_clear(); fallback._identity.clear()
        await self.client.aclose()

    async def test_primary_bytes_and_actual_identity_are_preserved(self):
        audio = wav(24000)
        fn = FakeFunction({'ok': True, 'audio': audio})
        with patch.object(bridge, 'worker', return_value=SimpleNamespace(synthesize=fn)):
            response = await self.client.post('/synthesize', json={'text': 'Hello.', 'voice': 'narrator-en-female', 'language': 'en'})
        self.assertEqual(response.content, audio)
        self.assertEqual(response.headers['x-speech-fallback'], '0')
        self.assertEqual(response.headers['x-speech-voice-id'], 'narrator-en-female')

    async def test_invalid_primary_input_does_not_invoke_fallback(self):
        fn = FakeFunction({'ok': False, 'status': 400})
        with patch.object(bridge, 'worker', return_value=SimpleNamespace(synthesize=fn)), patch.object(fallback, 'synthesize_fallback') as alternate:
            response = await self.client.post('/synthesize', json={'text': 'Hello.', 'voice': 'narrator-en-female'})
            self.assertEqual(response.status_code, 400)
            alternate.assert_not_called()
            response = await self.client.post('/synthesize', json={'text': 'Hello.', 'voice': 'narrator-en-female', 'sourcePath': '/private'})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(fn.calls, 1)

    async def test_private_fallback_auth_resampling_loudness_and_speaker(self):
        raw = wav()
        requests = []
        token = 'test.' + base64.urlsafe_b64encode(json.dumps({'exp': time.time() + 3600}).encode()).decode().rstrip('=') + '.test'

        def handler(request):
            requests.append(request)
            if request.url.host == 'metadata.google.internal':
                self.assertEqual(request.headers['metadata-flavor'], 'Google')
                self.assertEqual(request.url.params['audience'], 'https://private-fallback.run.app')
                return httpx.Response(200, text=token)
            self.assertEqual(request.headers['x-serverless-authorization'], 'Bearer ' + token)
            self.assertEqual(json.loads(request.content), {'text': 'Bonjour.', 'voice': 'fr_FR-mls-medium', 'speaker': 88})
            return httpx.Response(200, content=raw)

        original = httpx.AsyncClient
        def backend(**kwargs):
            return original(transport=httpx.MockTransport(handler), **kwargs)
        fn = FakeFunction(error=RuntimeError('private details must not escape'))
        with patch.object(bridge, 'worker', return_value=SimpleNamespace(synthesize=fn)), patch.object(fallback.httpx, 'AsyncClient', side_effect=backend):
            response = await self.client.post('/synthesize', json={'text': 'Bonjour.', 'voice': 'narrator-fr-female', 'language': 'fr'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['x-speech-fallback'], '1')
        self.assertEqual(response.headers['x-speech-voice-id'], 'fr_FR-mls-medium')
        self.assertEqual(response.headers['x-speech-speaker'], '88')
        with wave.open(io.BytesIO(response.content)) as stream:
            self.assertEqual((stream.getframerate(), stream.getnchannels(), stream.getsampwidth(), stream.getnframes()), (24000, 1, 2, 48000))
        metrics = analyze_wav(response.content)
        self.assertLess(abs(metrics['integratedLufs'] + 20), .1)
        self.assertLessEqual(metrics['truePeakDbfs'], -1)
        self.assertEqual(len(requests), 2)

    async def test_unsupported_and_cross_language_voices_never_fallback(self):
        for voice, language in [('narrator-ar-female', 'ar'), ('narrator-sw-male', 'sw'), ('private-123', 'en'), ('narrator-en-female', 'fr')]:
            with patch.object(fallback.httpx, 'AsyncClient') as backend:
                self.assertIsNone(await fallback.synthesize_fallback({'text': 'A test.', 'voice': voice, 'language': language}))
                backend.assert_not_called()

    async def test_timeout_is_cancelled_and_internal_routes_are_absent(self):
        fn = FakeFunction(error=TimeoutError())
        with patch.object(bridge, 'worker', return_value=SimpleNamespace(synthesize=fn)):
            result = await bridge.invoke('synthesize', {'text': 'Hello.', 'voice': 'private-123'})
        self.assertEqual(result.status_code, 504)
        self.assertTrue(fn.cancelled)
        for route in ['/docs', '/openapi.json', '/inspect_state', '/source', '/../../private']:
            response = await self.client.get(route)
            self.assertEqual(response.status_code, 404)
            self.assertNotIn('traceback', response.text.lower())

    async def test_admission_is_bounded_and_overflow_does_not_start_rpc(self):
        held = []
        for _ in range(4):
            self.assertTrue(bridge.admission.acquire(blocking=False)); held.append(True)
        fn = FakeFunction({'voices': []})
        try:
            with patch.object(bridge, 'worker', return_value=SimpleNamespace(voices=fn)):
                result = await bridge.invoke('voices')
            self.assertEqual(result.status_code, 503)
            self.assertEqual(fn.calls, 0)
        finally:
            for _ in held: bridge.admission.release()

    async def test_explicit_legacy_selection_preserves_controls_and_never_uses_gpu(self):
        voice = 'fr_FR-mls-medium'
        captured = []
        async def render(payload):
            captured.append(payload)
            return wav(24000)
        body = {'text': 'Bonjour.', 'voice': voice, 'speaker': 88, 'length_scale': 1.2, 'noise_scale': .5, 'noise_w_scale': .7}
        with patch.object(fallback, 'request_piper', side_effect=render), patch.object(bridge, 'worker') as gpu:
            response = await self.client.post('/fallback/synthesize', json=body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured, [body])
        self.assertEqual(response.headers['x-speech-selection'], 'explicit')
        self.assertEqual(response.headers['x-speech-fallback'], '0')
        self.assertEqual(response.headers['x-speech-speaker'], '88')
        gpu.assert_not_called()

    async def test_legacy_catalog_and_numeric_bounds_fail_closed(self):
        self.assertEqual(len(fallback.legacy_voices()), 51)
        cases = [
            {'voice': 'unapproved-model'}, {'speaker': 100000}, {'speaker': -1},
            {'length_scale': 0}, {'noise_scale': -1}, {'noise_w_scale': float('inf')},
            {'sourcePath': '/private/model'}, {'text': 'x' * 4001},
        ]
        for change in cases:
            with self.subTest(change=list(change)):
                with self.assertRaises(ValueError):
                    fallback.validate_legacy({'text': 'Hello.', 'voice': 'en_US-ljspeech-high', **change})


if __name__ == '__main__':
    unittest.main()
