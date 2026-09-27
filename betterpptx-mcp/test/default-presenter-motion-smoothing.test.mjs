import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { smoothRotationAnimations } from '../assets/glb-motion-smoothing.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

const pathFromAssets = relative => fileURLToPath(new URL(`../assets/${relative}`, import.meta.url))
const motionLibraryPath = fileURLToPath(new URL('../../outputs/kimodo/presenter-motion-quality-20260830-v4-unpacked/default-presenter-joe-kimodo-candidate.glb', import.meta.url))
const emphasizeLibraryPath = fileURLToPath(new URL('../../outputs/kimodo/presenter-emphasize-quality-20260830-v1-direct-unpacked/default-presenter-joe-kimodo-emphasize-candidate.glb', import.meta.url))

function animationShape(buffer) {
	const parsed = parseGlb(buffer)
	return (parsed.json.animations || []).map(animation => ({
		name: animation.name,
		channels: (animation.channels || []).map(channel => channel.target?.path),
		durationMs: Math.round(1000 * Math.max(...(animation.samplers || []).flatMap(sampler => parsed.json.accessors[sampler.input].max))),
	}))
}

test('Kimodo presenter smoothing removes high-frequency quaternion reversals without changing timing or channels', () => {
	for (const libraryPath of [motionLibraryPath, emphasizeLibraryPath]) {
		const source = readFileSync(libraryPath)
		const smoothed = smoothRotationAnimations(source, { passes: 6 })
		assert.deepEqual(animationShape(smoothed.buffer), animationShape(source))
		assert.equal(parseGlb(smoothed.buffer).bin.length, parseGlb(source).bin.length)
		for (const row of smoothed.report) {
			assert.ok(row.before.roughnessMedian > 1.5, `${row.animation} should reproduce the measured Kimodo vibration`)
			assert.ok(row.after.roughnessMedian < 0.1, `${row.animation} median roughness remains too high`)
			assert.ok(row.after.roughnessP95 < 0.15, `${row.animation} p95 roughness remains too high`)
			assert.ok(row.after.reversalRateP95 < 0.04, `${row.animation} reversal rate remains too high`)
		}
	}
})

test('the shipped roster is Mixamo-only and keeps the exact canonical clip order', () => {
	const contract = JSON.parse(readFileSync(pathFromAssets('default-presenter-motion-contract.json'), 'utf8'))
	const enumerate = contract.motions.find(motion => motion.intent === 'enumerate')
	assert.deepEqual(
		contract.motions.filter(motion => String(motion.source).startsWith('kimodo')).map(motion => motion.intent),
		[],
	)
	assert.ok(contract.motions.every(motion => motion.source === 'proven' || motion.source === 'native-mixamo'))
	assert.equal(enumerate.source, 'native-mixamo')
	assert.equal(enumerate.sourceSlug, 'enumerate')
	for (const identity of ['joe', 'louise', 'pete', 'mena']) {
		const parsed = parseGlb(readFileSync(pathFromAssets(`default-presenter-${identity}.glb`)))
		const names = (parsed.json.animations || []).map(animation => animation.name)
		assert.deepEqual(names, ['00_idle', '01_talk', '02_greet', '03_point', '04_emphasize', '05_magnitude', '06_contrast', '07_enumerate', '08_ask', '09_present', '10_agree', '11_bow', '12_think', '13_disagree', '14_happy', '15_surprise', '16_walk', '17_clap'])
		assert.equal((parsed.json.animations || []).every((animation, index) => {
			const translations = animation.channels.filter(channel => channel.target?.path === 'translation')
			const expectedTranslations = contract.motions[index].channelPolicy === 'root-motion' ? 1 : 0
			return translations.length === expectedTranslations
		}), true)
	}
})
