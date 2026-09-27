import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { normalizeAvatarMotionProfile } from './avatar/providers/musetalkHttp.mjs'
import { normalizeAvatarMouthProfile } from './avatar/providers/musetalkHttp.mjs'

const workerPath = 'D:/PptxGenJS_Claude/betterpptx-mcp/deploy/avatar-worker/modal_avatar_commercial_eval.py'
const worker = await fs.readFile(workerPath, 'utf8')

for (const [input, expected] of [
	['default', 'default'],
	['low-motion', 'low'],
	['subtle', 'low'],
	['natural', 'natural'],
	['natural-blink', 'natural'],
	['blink-soft', 'blink-soft'],
	['soft-blink', 'blink-soft'],
	['reduced-eyes', 'blink-soft'],
	['blink-closed-soft-gaze', 'blink-closed-soft-gaze'],
	['lip-only', 'mouth-only'],
	['medium', 'balanced'],
	['full-no-mouth', 'balanced'],
	['static', 'static'],
]) assert.equal(normalizeAvatarMotionProfile(input), expected)

assert.throws(() => normalizeAvatarMotionProfile('raw-liveportrait-cli'), /Unsupported avatar motion profile/)
assert.equal(normalizeAvatarMouthProfile('jaw-strong'), 'jaw-strong')
assert.equal(normalizeAvatarMouthProfile('enhanced'), 'jaw-strong')
for (const field of ['motionProfile', '--driving_multiplier', '--animation_region', '--driving_smooth_observation_variance', '--eye_gaze_blend', 'liveportrait_eye_gaze_blend_patch.py']) {
	assert.match(worker, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(worker, /"--driving_option", "expression-friendly"/)
assert.match(worker, /"--driving_multiplier", "0\.60"/)
assert.match(worker, /"--animation_region", "all"/)
assert.match(worker, /profile == "natural"/)
assert.match(worker, /"--driving_multiplier", "0\.45"/)
assert.match(worker, /profile == "blink-soft"/)
assert.match(worker, /profile == "blink-closed-soft-gaze"/)
assert.match(worker, /"--eye_gaze_blend", "0\.40"/)
assert.match(worker, /"--animation_region", "eyes"/)
assert.match(worker, /motion_profile not in \{"low", "balanced", "natural", "medium", "blink", "blink-soft", "blink-closed-soft-gaze", "static"\}/)

console.log(JSON.stringify({ ok: true, profiles: ['default', 'low', 'natural', 'mouth-only', 'balanced', 'blink', 'blink-soft', 'blink-closed-soft-gaze', 'static'], workerPath }))
