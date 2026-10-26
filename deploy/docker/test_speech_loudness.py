import io
import unittest
import wave

import numpy as np
from scipy.signal import resample_poly
from speech_loudness import analyze_wav, normalize_samples_to_wav, normalize_wav


class LoudnessTests(unittest.TestCase):
    rate = 24000

    def speech(self, gain=1.0):
        t = np.arange(self.rate * 2) / self.rate
        envelope = .3 + .7 * np.sin(2*np.pi*2.1*t)**2
        return gain * envelope * (.12*np.sin(2*np.pi*180*t) + .06*np.sin(2*np.pi*730*t))

    def assert_safe_target(self, audio, frames):
        metrics = analyze_wav(audio)
        self.assertEqual(metrics['frames'], frames)
        self.assertEqual(metrics['sampleRate'], self.rate)
        self.assertLessEqual(metrics['truePeakDbfs'], -1.0)
        self.assertAlmostEqual(metrics['integratedLufs'], -20.0, delta=.15)

    def test_quiet_and_loud_voices_converge_without_timing_change(self):
        results = [normalize_samples_to_wav(self.speech(gain), self.rate) for gain in (.035, .3, 1, 8)]
        for audio in results:
            self.assert_safe_target(audio, self.rate*2)
            self.assertEqual(normalize_wav(audio), audio)
        loudness = [analyze_wav(audio)['integratedLufs'] for audio in results]
        self.assertLess(max(loudness)-min(loudness), .2)

    def test_high_crest_factor_uses_limiter_without_peak_or_loudness_tradeoff(self):
        samples = self.speech(.12)
        samples[2000:2005] = np.array([.8, -.9, 1.8, -.8, .5])
        audio = normalize_samples_to_wav(samples, self.rate)
        self.assert_safe_target(audio, len(samples))

    def test_oversampled_peak_cap_handles_near_nyquist_clipping(self):
        t = np.arange(self.rate) / self.rate
        audio = normalize_samples_to_wav(3*np.sin(2*np.pi*11000*t+.6), self.rate)
        self.assertLessEqual(analyze_wav(audio)['truePeakDbfs'], -1.0)
        self.assertEqual(analyze_wav(audio)['frames'], len(t))
        with wave.open(io.BytesIO(audio), 'rb') as sound:
            actual = np.frombuffer(sound.readframes(sound.getnframes()), dtype='<i2').astype(float) / 32768
        independent_peak = np.max(np.abs(resample_poly(actual, 16, 1, window=('kaiser', 12))))
        self.assertLessEqual(independent_peak, 10**(-1/20))

    def test_silence_and_sub_block_transient_preserve_length(self):
        audio = normalize_samples_to_wav(np.zeros(self.rate), self.rate)
        self.assertEqual(normalize_wav(audio), audio)
        self.assertIsNone(analyze_wav(audio)['integratedLufs'])
        with self.assertRaises(ValueError): normalize_wav(audio, target_lufs=float('nan'))
        short = normalize_samples_to_wav([0, 2, -2, 0], self.rate)
        self.assertEqual(analyze_wav(short)['frames'], 4)
        self.assertLessEqual(analyze_wav(short)['truePeakDbfs'], -1)

    def test_nonfinite_empty_invalid_rate_and_wrong_wav_format_rejected(self):
        for samples in ([], [np.nan], [np.inf], [-np.inf], [1e300]):
            with self.assertRaises(ValueError): normalize_samples_to_wav(samples, self.rate)
        with self.assertRaises(ValueError): normalize_samples_to_wav([0, 1], 0)
        with self.assertRaises(ValueError): normalize_wav(b'not audio')
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(self.rate); wav.writeframes(b'\0'*16)
        with self.assertRaises(ValueError): normalize_wav(out.getvalue())

    def test_piper_rate_stays_unchanged(self):
        rate = 22050
        t = np.arange(rate) / rate
        audio = normalize_samples_to_wav(.02*np.sin(2*np.pi*250*t), rate)
        self.assertEqual(analyze_wav(audio)['sampleRate'], rate)
        self.assertEqual(analyze_wav(audio)['frames'], rate)


if __name__ == '__main__':
    unittest.main()
