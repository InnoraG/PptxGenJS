"""Private Cloud Run IAM bridge. No model, credentials or diagnostics in HTTP results."""
import asyncio
from functools import lru_cache
import json
import os
import re
import threading
import budget

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, debug=False)
admission = threading.BoundedSemaphore(4)
SYNTHESIS_LIMIT = 16384
REGISTRATION_LIMIT = 12 * 1024 * 1024
RPC_TIMEOUT_SECONDS = 720  # Leaves up to120s for approved fallback within a900s HTTP deadline.


def failure(status=503):
    message = 'Invalid synthesis request.' if status == 400 else 'Speech service is unavailable.'
    return JSONResponse({'error': message}, status_code=status)


@lru_cache(maxsize=1)
def worker():
    # Cloud Run injects this JSON from a private Secret Manager secret. Never log it.
    try:
        account = json.loads(os.environ['BETTERPPTX_SPEECH_WORKER_CREDENTIALS'])
        if not isinstance(account, dict) or not all(isinstance(account.get(key), str) and account[key] for key in ('token_id', 'token_secret')):
            raise ValueError()
        os.environ['MODAL_TOKEN_ID'] = account['token_id']
        os.environ['MODAL_TOKEN_SECRET'] = account['token_secret']
        import modal
        return modal.Cls.from_name(os.environ.get('BETTERPPTX_NARRATION_MODAL_APP', 'betterpptx-narration-modal'), 'NarrationWorker')()
    except Exception:
        raise RuntimeError('Speech service configuration is unavailable.') from None


async def request_json(request, limit):
    if request.headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
        raise ValueError()
    length = request.headers.get('content-length')
    if length is not None and (not length.isdecimal() or not 0 < int(length) <= limit):
        raise ValueError()
    chunks, total = [], 0
    async for block in request.stream():
        total += len(block)
        if total > limit:
            raise ValueError()
        chunks.append(block)
    if total == 0:
        raise ValueError()
    value = json.loads(b''.join(chunks).decode('utf-8'))
    if not isinstance(value, dict):
        raise ValueError()
    return value


async def invoke(method, payload=None):
    if not admission.acquire(blocking=False):
        return failure()
    call = None
    try:
        reservation = await asyncio.to_thread(budget.reserve)
        function = getattr(worker(), method)
        call = await (function.spawn.aio() if payload is None else function.spawn.aio(payload))
        result = await asyncio.wait_for(call.get.aio(timeout=RPC_TIMEOUT_SECONDS), RPC_TIMEOUT_SECONDS + 1)
        try:
            await asyncio.to_thread(budget.settle, reservation)
        except Exception:
            pass  # Keep the full reservation if accounting cannot confirm settlement.
        if method == 'voices':
            return JSONResponse(result)
        if not isinstance(result, dict) or result.get('ok') is not True:
            return failure(400 if isinstance(result, dict) and result.get('status') == 400 else 503)
        if method == 'synthesize':
            audio = result.get('audio')
            if not isinstance(audio, bytes) or not 44 < len(audio) <= 64 * 1024 * 1024:
                return failure()
            return Response(audio, media_type='audio/wav', headers={'X-Speech-Fallback': '0', 'X-Speech-Voice-Id': payload['voice']})
        return JSONResponse(result['result'])
    except (TimeoutError, asyncio.CancelledError):
        if call is not None:
            try:
                await call.cancel.aio(terminate_containers=False)
            except Exception:
                pass
        return failure(504)
    except Exception:
        return failure()
    finally:
        admission.release()


@app.exception_handler(HTTPException)
async def generic_http_error(request, exception):
    return JSONResponse({'error': 'Unknown route.'}, status_code=exception.status_code)


@app.get('/health')
async def health():
    # Readiness means the IAM-protected bridge accepts requests; probes do not wake a GPU.
    try:
        worker()
        return {'ready': True}
    except Exception:
        return JSONResponse({'ready': False}, status_code=503)


@app.get('/voices')
async def voices():
    return await invoke('voices')


async def post(request, method, limit):
    try:
        value = await asyncio.wait_for(request_json(request, limit), 10)
    except Exception:
        return failure(400)
    return await invoke(method, value)


@app.post('/voices/register')
async def register(request: Request):
    return await post(request, 'register', REGISTRATION_LIMIT)


@app.post('/synthesize')
async def synthesize(request: Request):
    try:
        value = await asyncio.wait_for(request_json(request, SYNTHESIS_LIMIT), 10)
        if set(value) - {'text', 'voice', 'language'} or not isinstance(value.get('text'), str) or not 0 < len(value['text'].strip()) <= 1000:
            raise ValueError()
        if not isinstance(value.get('voice'), str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', value['voice']):
            raise ValueError()
        if 'language' in value and (not isinstance(value['language'], str) or not re.fullmatch(r'[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?', value['language'])):
            raise ValueError()
    except Exception:
        return failure(400)
    result = await invoke('synthesize', value)
    if result.status_code < 500:
        return result
    if not admission.acquire(blocking=False):
        return result
    try:
        from fallback import synthesize_fallback
        alternate = await asyncio.wait_for(synthesize_fallback(value), 125)
        if alternate is not None:
            audio, headers = alternate
            return Response(audio, media_type='audio/wav', headers=headers)
    except Exception:
        pass
    finally:
        admission.release()
    return result


@app.post('/fallback/synthesize')
async def explicit_voice(request: Request):
    from fallback import synthesize_legacy, validate_legacy
    try:
        value = await asyncio.wait_for(request_json(request, 65536), 10)
        validate_legacy(value)
    except Exception:
        return failure(400)
    if not admission.acquire(blocking=False):
        return failure()
    try:
        audio, headers = await asyncio.wait_for(synthesize_legacy(value), 180)
        return Response(audio, media_type='audio/wav', headers=headers)
    except TimeoutError:
        return failure(504)
    except Exception:
        return failure()
    finally:
        admission.release()
