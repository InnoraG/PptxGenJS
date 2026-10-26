"""Shared, frame-preserving speech leveling. Measurements are private diagnostics.

Policy: -20 LUFS integrated speech, at most -1 dBTP. This is a presentation
policy, not the EBU broadcast target (-23 LUFS). An 8x reconstruction estimate
and 0.25 dB safety margin protect intersample peaks. Originals are never edited.
"""
import io
import math
import wave

import numpy as np
from scipy.signal import resample_poly
import pyloudnorm as pyln

TARGET_LUFS = -20.0
TRUE_PEAK_DBFS = -1.0
OVERSAMPLE = 8
PEAK_MARGIN_DB = 0.25
POLICY_VERSION = 'speech-level-v1'


def _samples(values, sample_rate):
    if not isinstance(sample_rate, int) or not 8000 <= sample_rate <= 48000:
        raise ValueError('Unsupported speech sample rate.')
    data = np.asarray(values, dtype=np.float64)
    if data.ndim != 1 or not data.size or data.size > sample_rate * 600:
        raise ValueError('Invalid speech sample count.')
    if not np.isfinite(data).all() or np.max(np.abs(data)) > 1e6:
        raise ValueError('Invalid speech sample values.')
    return data


def _read_wav(audio):
    if not isinstance(audio, bytes) or len(audio) > 64 * 1024**2:
        raise ValueError('Invalid speech audio.')
    try:
        with wave.open(io.BytesIO(audio), 'rb') as stream:
            if stream.getnchannels() != 1 or stream.getsampwidth() != 2 or stream.getcomptype() != 'NONE':
                raise ValueError('Speech audio must be mono PCM16 WAV.')
            rate, count = stream.getframerate(), stream.getnframes()
            frames = stream.readframes(count)
            if len(frames) != count * 2:
                raise ValueError('Incomplete speech audio.')
        return _samples(np.frombuffer(frames, dtype='<i2').astype(np.float64) / 32768.0, rate), rate
    except (wave.Error, EOFError) as cause:
        raise ValueError('Invalid speech WAV.') from cause


def _pcm(values):
    return np.clip(np.rint(values * 32768.0), -32768, 32767).astype('<i2')


def _wav(values, rate):
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(_pcm(values).tobytes())
    return output.getvalue()


def _peak(values):
    return float(np.max(np.abs(resample_poly(values, OVERSAMPLE, 1, window=('kaiser', 8.6)))))


def _loudness(values, rate):
    # Integrated programme loudness is undefined for silence or <400 ms.
    if len(values) < math.ceil(rate * .4) or np.max(np.abs(values)) == 0:
        return None
    measured = float(pyln.Meter(rate).integrated_loudness(values))
    return measured if math.isfinite(measured) else None


def _db(value):
    return 20.0 * math.log10(value) if value > 0 else None


def _policy(target_lufs, true_peak_dbfs):
    if not math.isfinite(target_lufs) or not -36 <= target_lufs <= -12:
        raise ValueError('Unsupported speech loudness target.')
    if not math.isfinite(true_peak_dbfs) or not -6 <= true_peak_dbfs <= -0.5:
        raise ValueError('Unsupported speech peak ceiling.')


def analyze_wav(audio):
    values, rate = _read_wav(audio)
    return {'policyVersion': POLICY_VERSION, 'sampleRate': rate, 'frames': len(values),
            'durationSeconds': len(values) / rate, 'integratedLufs': _loudness(values, rate),
            'samplePeakDbfs': _db(float(np.max(np.abs(values)))),
            'truePeakDbfs': _db(_peak(values)), 'truePeakOversample': OVERSAMPLE}


def normalize_samples_to_wav(samples, sample_rate, *, target_lufs=TARGET_LUFS, true_peak_dbfs=TRUE_PEAK_DBFS):
    """Level finite mono float samples before PCM quantization, preserving count."""
    values = _samples(samples, sample_rate)
    _policy(target_lufs, true_peak_dbfs)
    cap = 10 ** ((true_peak_dbfs - PEAK_MARGIN_DB) / 20)
    peak = _peak(values)
    if peak == 0:
        return _wav(values, sample_rate)
    loudness = _loudness(values, sample_rate)
    if loudness is None:
        # Never amplify silence, below-gate noise, or a sub-400 ms transient.
        return _wav(values * min(1.0, cap / peak), sample_rate)
    desired_db = target_lufs - loudness
    gain = 10 ** (desired_db / 20)
    if peak * gain <= cap:
        return _wav(values * gain, sample_rate)

    # Nonlinear processing happens at 8x rate, with zero-phase resampling and no
    # inserted lookahead delay. Only samples above the soft knee are changed.
    up = resample_poly(values, OVERSAMPLE, 1, window=('kaiser', 8.6))
    knee = cap * .9
    def render(db):
        scaled = up * 10 ** (db / 20)
        magnitude = np.abs(scaled)
        limited = np.where(magnitude <= knee, magnitude,
                           knee + (cap-knee) * np.tanh((magnitude-knee)/(cap-knee)))
        down = resample_poly(np.copysign(limited, scaled), 1, OVERSAMPLE, window=('kaiser', 8.6))[:len(values)]
        reconstructed_peak = _peak(down)
        if reconstructed_peak > cap:
            down *= cap / reconstructed_peak
        quantized = _pcm(down).astype(np.float64) / 32768.0
        return quantized, _loudness(quantized, sample_rate)

    low, high = desired_db - 24, desired_db + 48
    best, distance = None, float('inf')
    db = desired_db
    for iteration in range(16):
        result, measured = render(db)
        if measured is None:
            low = db
            db = (low + high) / 2
            continue
        error = measured - target_lufs
        if abs(error) < distance:
            best, distance = result, abs(error)
        if abs(error) <= .03:
            break
        if error < 0:
            low = db
        else:
            high = db
        # Most speech needs only a small correction after limiting. Start with
        # that measured correction; retain bounded bisection for difficult crest
        # factors instead of repeatedly rendering obviously excessive gain.
        correction = max(-12.0, min(12.0, -error * 1.2))
        candidate = db + correction
        db = candidate if iteration < 4 and low < candidate < high else (low + high) / 2
    if best is None:
        raise ValueError('Speech leveling could not measure the signal.')
    # Sparse impulses cannot always attain integrated target under a peak cap.
    # Preserve their timing and prioritize safe peaks over fabricated loudness.
    return _wav(best, sample_rate)


def normalize_wav(audio, *, target_lufs=TARGET_LUFS, true_peak_dbfs=TRUE_PEAK_DBFS):
    """Common V3/Piper path; already compliant WAVs are returned byte-identically."""
    _policy(target_lufs, true_peak_dbfs)
    values, rate = _read_wav(audio)
    metrics = analyze_wav(audio)
    if metrics['truePeakDbfs'] is None:
        return audio
    if (metrics['integratedLufs'] is not None and abs(metrics['integratedLufs']-target_lufs) <= .10
            and metrics['truePeakDbfs'] <= true_peak_dbfs - .05):
        return audio
    return normalize_samples_to_wav(values, rate, target_lufs=target_lufs, true_peak_dbfs=true_peak_dbfs)
