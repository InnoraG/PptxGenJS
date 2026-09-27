import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'

// This is an in-process test of the actual public-semantic executor. It does
// not substitute a source registry, proof, rig, retargeter, or asset bytes and
// never persists its generated cache entries or creates a presentation.
const priorPublicMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
after(() => {
	if (priorPublicMode === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = priorPublicMode
})

const { ensureDefaultPresenterRegistered, resolveDefaultPresenterContacts } = await import('../assets/default-presenter-roster.mjs')
const { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } = await import('../assets/model3d-gen-providers.mjs')
const { governedAuthoringMotionSelection } = await import('../assets/authoring-motion-sources.mjs')
const { assertPowerPointSafeStaticPose } = await import('../assets/glb-static-pose-profile.mjs')
const { computeContacts, extractRetargetRestProfile, parseGlb } = await import('../ir/kinetic-transplant.mjs')

const sha = value => createHash('sha256').update(value).digest('hex')
const asset = name => new URL(`../assets/${name}`, import.meta.url)
const contractFile = asset('default-presenter-motion-contract.json')
const contractBytes = readFileSync(contractFile)
const contract = JSON.parse(contractBytes)
const motions = [
	{ slot: 1, slug: 'talk', motionId: 'motion.ordinary.talk', durationMs: 10267, samples: 309 },
	{ slot: 7, slug: 'enumerate', motionId: 'motion.ordinary.enumerate', durationMs: 6633, samples: 200 },
]
const selectedMotionIds = motions.map(motion => motion.motionId)
const curated = [
	[3602, 9958], [2021, 4800], [507, 542], [926, 3625], [2050, 5200], [3302, 6208],
	[681, 2000], [723, 2000], [723, 2000], [2726, 5125], [521, 1750], [995, 2750],
	[1628, 4250], [819, 1833], [693, 1917], [1702, 4000], [798, 1042], [1250, 4200],
].map(([contactMs, durationMs], animId) => ({ animId, clipName: contract.clipNames[animId], contactMs, durationMs }))

function floatSamples(parsed, accessorIndex, expectedType, label) {
	const accessor = parsed.json.accessors[accessorIndex]
	assert.equal(accessor.componentType, 5126, `${label} must remain FLOAT`)
	assert.equal(accessor.type, expectedType, `${label} type`)
	assert.equal(accessor.sparse, undefined, `${label} must remain ordinary`)
	assert.ok(accessor.normalized === undefined || accessor.normalized === false, `${label} cannot be quantized`)
	assert.ok(Number.isSafeInteger(accessor.count) && accessor.count > 0, `${label} sample count`)
	const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[expectedType]
	const view = parsed.json.bufferViews[accessor.bufferView]
	assert.equal(view.buffer, 0, `${label} embedded buffer`)
	const stride = view.byteStride ?? components * 4
	const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
	assert.ok(Number.isSafeInteger(stride) && stride >= components * 4 && stride % 4 === 0)
	assert.ok(start >= 0 && start + (accessor.count - 1) * stride + components * 4 <= parsed.bin.length)
	const rows = []
	const bytes = Buffer.alloc(accessor.count * components * 4)
	for (let row = 0; row < accessor.count; row++) {
		const values = []
		for (let component = 0; component < components; component++) {
			const offset = start + row * stride + component * 4
			const value = parsed.bin.readFloatLE(offset)
			assert.ok(Number.isFinite(value), `${label} sample ${row}:${component}`)
			values.push(value)
			parsed.bin.copy(bytes, (row * components + component) * 4, offset, offset + 4)
		}
		rows.push(values)
	}
	return { rows, bytes }
}

function decodedTracks(parsed, animationIndex, label) {
	const animation = parsed.json.animations[animationIndex]
	assert.ok(animation, `${label} missing animation`)
	assert.equal(animation.channels.length, 66, `${label} must be exactly 65 R plus one Hips T`)
	assert.equal(animation.channels.filter(channel => channel.target.path === 'rotation').length, 65)
	assert.equal(animation.channels.filter(channel => channel.target.path === 'translation').length, 1)
	const result = new Map()
	for (const channel of animation.channels) {
		const path = channel.target.path
		assert.ok(['rotation', 'translation'].includes(path), `${label} must not acquire scale or other tracks`)
		const node = parsed.json.nodes[channel.target.node]
		assert.ok(node?.name, `${label} target name`)
		if (path === 'translation') assert.match(node.name, /^mixamorig\d*:Hips$/)
		const key = `${node.name}:${path}`
		assert.equal(result.has(key), false, `${label} duplicate target ${key}`)
		const sampler = animation.samplers[channel.sampler]
		const interpolation = sampler.interpolation ?? 'LINEAR'
		assert.equal(interpolation, 'LINEAR', `${label} ${key} interpolation`)
		result.set(key, {
			node: channel.target.node, interpolation,
			input: floatSamples(parsed, sampler.input, 'SCALAR', `${label} ${key} time`),
			output: floatSamples(parsed, sampler.output, path === 'rotation' ? 'VEC4' : 'VEC3', `${label} ${key} value`),
		})
	}
	return result
}

function assertSamplesExact(actual, expected, label) {
	assert.equal(actual.rows.length, expected.rows.length, `${label} key count`)
	for (let row = 0; row < expected.rows.length; row++) {
		assert.equal(actual.rows[row].length, expected.rows[row].length)
		for (let component = 0; component < expected.rows[row].length; component++) {
			assert.ok(Object.is(actual.rows[row][component], expected.rows[row][component]), `${label} sample ${row}:${component} changed from ${expected.rows[row][component]} to ${actual.rows[row][component]}`)
		}
	}
	assert.ok(actual.bytes.equals(expected.bytes), `${label} every serialized float must be byte-exact`)
}

for (const identity of ['joe', 'louise', 'pete']) test(`${identity}: real semantic Talk and Enumerate reproduce every promoted sample, static asset and warm cache`, () => {
	const defaultFile = asset(`default-presenter-${identity}.glb`)
	const restFile = asset(`presenter-source-${identity}-static.glb`)
	const raw = readFileSync(defaultFile)
	const construction = readFileSync(restFile)
	const rawHash = sha(raw), constructionHash = sha(construction)
	const reference = parseGlb(raw)
	assert.equal(reference.json.animations.length, 18)
	const registered = ensureDefaultPresenterRegistered(identity)
	const base = getCachedGeneratedRigged3d(registered.hash)
	assert.ok(Buffer.from(base.glbBase64, 'base64').equals(raw), 'registration must use the installed approved GLB exactly')
	assert.deepEqual(base.retargetRestProfile, extractRetargetRestProfile(construction), 'use the exact construction rest, never the idle display pose as the bind basis')
	assert.notDeepEqual(base.retargetRestProfile, extractRetargetRestProfile(raw))
	const restBefore = JSON.stringify(base.retargetRestProfile)
	const request = {
		baseGlbBase64: base.glbBase64,
		retargetRestProfile: base.retargetRestProfile,
		baseHash: `${registered.hash}:native-ordinary-exact-sample-regression-v1`,
		selectedMotionIds,
		previewBase64: base.previewBase64,
		license: base.license,
		staticPoseClipName: base.manifest.staticPoseClipName,
		staticPoseProfileVersion: base.manifest.staticPoseProfileVersion,
	}
	for (const motion of motions) {
		const governed = governedAuthoringMotionSelection(motion.motionId, { targetGlbBuffer: raw, retargetRestProfile: base.retargetRestProfile })
		assert.equal(governed.sourceProvider, 'mixamo')
		assert.equal(governed.durationMs, motion.durationMs)
		assert.equal(governed.channelPolicy, 'root-motion')
		assert.equal(governed.rootMotionSpace, 'world')
		assert.equal(governed.rotationRetargetSpace, 'global')
		assert.match(governed.playbackProofSha256, /^[a-f0-9]{64}$/)
	}
	const first = materializeAuthoringMotionPresenter(request)
	assert.equal(first.cached, false)
	const generated = getCachedGeneratedRigged3d(first.hash)
	const generatedBytes = Buffer.from(generated.glbBase64, 'base64')
	const actual = parseGlb(generatedBytes)
	assert.deepEqual(first.selectedMotionIds, selectedMotionIds)
	assert.equal(actual.json.animations.length, 2)
	assert.equal(Object.hasOwn(generated.manifest, 'articulationConstraints'), false, 'Mixamo must bypass Kimodo joint constraints')
	assert.equal(Object.hasOwn(generated.manifest, 'motionStabilization'), false, 'Mixamo must bypass Kimodo smoothing')
	assert.equal(generated.manifest.retargetValidation.length, 2)
	for (const row of generated.manifest.retargetValidation) {
		assert.equal(row.rotationRetargetSpace, 'global')
		assert.equal(row.boundaryBlendMs, 0)
		assert.equal(row.status, 'PASS')
	}
	for (const motion of motions) {
		assert.equal(reference.json.animations[motion.slot].name, contract.clipNames[motion.slot])
		const actualIndex = first.motionIdToAnimId[motion.motionId]
		assert.ok(Number.isInteger(actualIndex))
		const expectedTracks = decodedTracks(reference, motion.slot, `${identity} installed ${motion.slug}`)
		const actualTracks = decodedTracks(actual, actualIndex, `${identity} materialized ${motion.slug}`)
		assert.deepEqual([...actualTracks.keys()].sort(), [...expectedTracks.keys()].sort())
		for (const [key, expected] of expectedTracks) {
			const received = actualTracks.get(key)
			assert.equal(received.node, expected.node, 'only animation/accessor locations may change')
			assert.equal(received.interpolation, expected.interpolation)
			assert.equal(expected.input.rows.length, motion.samples)
			assert.equal(expected.output.rows.length, motion.samples)
			assert.equal(expected.input.rows[0][0], 0)
			assert.equal(Math.round(expected.input.rows.at(-1)[0] * 1000), motion.durationMs)
			assertSamplesExact(received.input, expected.input, `${identity} ${motion.slug} ${key} input`)
			assertSamplesExact(received.output, expected.output, `${identity} ${motion.slug} ${key} output`)
		}
		const contact = generated.contacts.find(row => row.motionId === motion.motionId)
		const installedContact = registered.manifest.contacts[motion.slot]
		assert.deepEqual({ contactMs: contact.contactMs, durationMs: contact.durationMs }, { contactMs: installedContact.contactMs, durationMs: motion.durationMs })
	}
	// Appending the selected animation accessors cannot alter existing mesh,
	// weight, inverse-bind, image, material or stopped-display payloads.
	for (const [key, value] of Object.entries(reference.json)) {
		if (!['animations', 'buffers', 'bufferViews', 'accessors'].includes(key)) assert.deepEqual(actual.json[key], value, `${identity} ${key} changed`)
	}
	assert.deepEqual(actual.json.bufferViews.slice(0, reference.json.bufferViews.length), reference.json.bufferViews)
	assert.deepEqual(actual.json.accessors.slice(0, reference.json.accessors.length), reference.json.accessors)
	assert.ok(actual.bin.subarray(0, reference.bin.length).equals(reference.bin), 'every existing mesh/skin/texture and motion byte remains unchanged')
	assert.deepEqual(assertPowerPointSafeStaticPose(generatedBytes), assertPowerPointSafeStaticPose(raw))
	assert.equal(generated.previewBase64, base.previewBase64)
	assert.deepEqual(generated.license, base.license)
	const warm = materializeAuthoringMotionPresenter(request)
	assert.equal(warm.cached, true)
	assert.equal(warm.hash, first.hash)
	assert.equal(warm.handle, first.handle)
	assert.deepEqual(warm.contacts, first.contacts)
	assert.equal(getCachedGeneratedRigged3d(warm.hash), generated, 'the existing exact bundle is reused on a cache hit')
	assert.equal(JSON.stringify(base.retargetRestProfile), restBefore)
	assert.equal(sha(readFileSync(defaultFile)), rawHash)
	assert.equal(sha(readFileSync(restFile)), constructionHash)
})

test('promoted contact metadata measures only Talk/Enumerate and preserves the other sixteen curated rows exactly', () => {
	assert.deepEqual(contract.motions.map((motion, index) => motion.contactPolicy === 'rotation-peak' ? index : null).filter(index => index !== null), [1, 7])
	for (const identity of ['joe', 'louise', 'pete']) {
		const file = asset(`default-presenter-${identity}.glb`)
		const raw = readFileSync(file), before = sha(raw)
		const actual = resolveDefaultPresenterContacts(raw, contract)
		const measured = computeContacts(raw)
		assert.equal(actual.length, 18)
		for (let index = 0; index < actual.length; index++) {
			const motion = motions.find(row => row.slot === index)
			if (!motion) assert.equal(JSON.stringify(actual[index]), JSON.stringify(curated[index]), `${identity} curated slot ${index} changed`)
			else {
				assert.equal(actual[index].durationMs, motion.durationMs)
				assert.equal(actual[index].contactMs, measured[motion.slug].contactMs)
				assert.equal(actual[index].contactPolicy, 'rotation-peak')
				assert.ok(Number.isSafeInteger(actual[index].contactMs) && actual[index].contactMs >= 0 && actual[index].contactMs <= motion.durationMs)
			}
		}
		assert.deepEqual(ensureDefaultPresenterRegistered(identity).manifest.contacts, actual)
		assert.equal(sha(raw), before)
		assert.equal(sha(readFileSync(file)), before)
	}
	assert.ok(readFileSync(contractFile).equals(contractBytes))
})
