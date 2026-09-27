import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { constrainPresenterArmArticulations } from '../assets/glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from '../assets/glb-motion-smoothing.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

const motionLibraryPath = fileURLToPath(new URL('../../outputs/kimodo/presenter-motion-quality-20260830-v4-unpacked/default-presenter-joe-kimodo-candidate.glb', import.meta.url))
const emphasizeLibraryPath = fileURLToPath(new URL('../../outputs/kimodo/presenter-emphasize-quality-20260830-v1-direct-unpacked/default-presenter-joe-kimodo-emphasize-candidate.glb', import.meta.url))
const twistMotionNames = new Set(['00_talk', '01_enumerate', '02_clap', '00_emphasize', '01_talk', '04_emphasize', '07_enumerate', '17_clap'])
const enumerateMotionNames = new Set(['01_enumerate', '07_enumerate'])

function animationShape(buffer) {
	const parsed = parseGlb(buffer)
	return (parsed.json.animations || []).map(animation => ({
		name: animation.name,
		channels: (animation.channels || []).map(channel => ({
			path: channel.target?.path,
			node: parsed.json.nodes?.[channel.target?.node]?.name,
		})),
		durationMs: Math.round(1000 * Math.max(...(animation.samplers || []).flatMap(sampler => parsed.json.accessors[sampler.input].max))),
	}))
}

test('Kimodo shoulder, arm, wrist, and forearm tracks stay inside the soft anatomical articulation envelope', () => {
	const rows = []
	for (const libraryPath of [motionLibraryPath, emphasizeLibraryPath]) {
		const source = readFileSync(libraryPath)
		const smoothed = smoothRotationAnimations(source, { passes: 6 }).buffer
		const constrained = constrainPresenterArmArticulations(smoothed)
		assert.deepEqual(animationShape(constrained.buffer), animationShape(smoothed))
		assert.equal(parseGlb(constrained.buffer).bin.length, parseGlb(smoothed).bin.length)
		rows.push(...constrained.report)
	}

	assert.equal(rows.length, 24)
	for (const row of rows) {
		assert.ok(row.afterMaxStepDegrees <= 30, `${row.animation}/${row.joint} contains a discontinuous ${row.afterMaxStepDegrees.toFixed(2)} degree frame step`)
		if (Number.isFinite(row.maxDegrees)) {
			assert.ok(row.afterMaxDegrees <= row.maxDegrees + 0.001, `${row.animation}/${row.joint} exceeds ${row.maxDegrees} degrees`)
		}
		if (row.joint.endsWith('Hand')) {
			assert.equal(row.parentWorldCompensated, true, `${row.animation}/${row.joint} did not compensate the corrected parent chain`)
			assert.ok(row.parentWorldPreservationErrorMaxDegrees <= 0.001, `${row.animation}/${row.joint} parent compensation did not preserve the authored world orientation`)
			assert.ok(row.finalWorldOrientationErrorAfterOpeningBlendMaxDegrees <= 0.001, `${row.animation}/${row.joint} changes palm orientation after the opening cleanup`)
		}
		if (row.joint.endsWith('ForeArm')) {
			assert.ok(row.afterMaxDegrees <= 130.001)
			if (twistMotionNames.has(row.animation)) {
				assert.ok(row.twistAfterMaxDegrees <= row.twistMaxDegrees + 0.001, `${row.animation}/${row.joint} axial twist exceeds ${row.twistMaxDegrees} degrees`)
			} else {
				assert.equal(row.twistAfterMaxDegrees, undefined, `${row.animation}/${row.joint} received an unintended axial-twist correction`)
			}
		}
		if (row.joint.endsWith('LeftShoulder')) {
			assert.ok(row.twistAfterMaxDegrees <= 25.001, `${row.animation}/${row.joint} axial twist exceeds 25 degrees`)
		}
		if (row.joint.endsWith('RightArm') && enumerateMotionNames.has(row.animation)) {
			assert.ok(row.twistAfterMaxDegrees <= 145.001, `${row.animation}/${row.joint} axial twist exceeds 145 degrees`)
		}
		if (row.joint.endsWith('RightArm') && !enumerateMotionNames.has(row.animation)) {
			assert.equal(row.twistAfterMaxDegrees, undefined, `${row.animation}/${row.joint} received an unintended axial-twist correction`)
		}
	}

	const anchoredHands = rows.filter(row => row.joint.endsWith('Hand') && row.openingSpikeAnchored)
	assert.equal(anchoredHands.length, 4)
	assert.ok(anchoredHands.every(row => row.beforeStartDegrees > 140))
	assert.ok(anchoredHands.every(row => row.afterStartDegrees < 0.01))

	const enumerateAndClapHands = rows.filter(row => row.joint.endsWith('Hand') && ['01_enumerate', '02_clap'].includes(row.animation))
	assert.equal(enumerateAndClapHands.length, 4)
	assert.ok(enumerateAndClapHands.every(row => row.finalWorldOrientationErrorMaxDegrees <= 0.001))
})

test('the shipped roster contains no Kimodo controls or post-retarget articulation corrections', () => {
	const motionContract = JSON.parse(readFileSync(new URL('../assets/default-presenter-motion-contract.json', import.meta.url), 'utf8'))
	const animationNames = motionContract.motions.flatMap((motion, index) => String(motion.source).startsWith('kimodo') ? [motionContract.clipNames[index]] : [])
	assert.deepEqual(animationNames, [], 'the active default contract must be Mixamo-only')
	for (const identity of ['joe', 'louise', 'pete']) {
		const source = readFileSync(fileURLToPath(new URL(`../assets/default-presenter-${identity}.glb`, import.meta.url)))
		const constrained = constrainPresenterArmArticulations(source, {
			animationNames,
		})
		assert.deepEqual(constrained.report, [], `${identity} must not receive a Kimodo-only post-retarget correction`)
		assert.ok(constrained.buffer.equals(source), `${identity} bytes must remain unchanged when no corrections are active`)
	}
})
