import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { mock, test } from 'node:test'
import { parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'

// Importing a maintainer builder is permitted only after it is read-only on
// import. Refuse filesystem writes even if an entry guard ever regresses.
const writeGuards = ['writeFileSync', 'copyFileSync', 'mkdirSync'].map(name => mock.method(fs, name, () => { throw new Error('Builder import attempted a filesystem mutation.') }))
let roster
let sourceFirst
try {
	roster = await import('../assets/build-default-presenter-roster.mjs')
	sourceFirst = await import('../build-presenter-motion-51-source-first-models.mjs')
} finally {
	writeGuards.forEach(guard => guard.mock.restore())
}
const { buildDefaultPresenterMotionSelections, validateDefaultPresenterBuildContract, validateBuiltPresenterMotionChannels, presenterMotionSourceProvider } = roster
const { buildOrdinaryMotionProvenanceRows, expectedPresenterMotionProviderCounts, validatePresenterMotionProviderCounts } = sourceFirst
const canonical = JSON.parse(fs.readFileSync(new URL('../deploy/model3d-worker/canonical/canonical-clipmap.json', import.meta.url), 'utf8'))
const sha = value => createHash('sha256').update(value).digest('hex')

function legacyContract() {
	return {
		clipNames: [...canonical.clipNames],
		motions: canonical.intents.map((intent, index) => ({ intent, source: index === 4 ? 'kimodo-emphasize' : ([1, 17].includes(index) ? 'kimodo' : 'proven'), sourceSlug: index === 7 ? 'ask' : intent, expectedRotationChannels: 22 })),
	}
}

function nativeContract({ rootMotion = false } = {}) {
	const contract = legacyContract()
	for (const [index, take] of [[1, 'Talking'], [7, 'Counting']]) Object.assign(contract.motions[index], {
		source: 'native-mixamo', sourceFile: `ordinary-${contract.motions[index].intent}-native-v1.glb`, sourceSlug: contract.motions[index].intent,
		sourceTake: take, expectedRotationChannels: 65, channelPolicy: rootMotion ? 'root-motion' : 'rotation-only', rotationRetargetSpace: 'global', boneNamePolicy: 'mixamo-suffix', contactPolicy: 'rotation-peak',
		...(rootMotion ? { rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: 0.35, rootMotionMaxHorizontalStatures: 0.5 } : {}),
	})
	return contract
}

function smallRig({ namespace = 0, names = [], channels = 22, rootMotion = false, rawTrs = false, duration = 2, targetVariant = false } = {}) {
	const nodes = Array.from({ length: 65 }, (_, index) => ({
		name: `mixamorig${namespace || (targetVariant && index >= 22 ? 2 : '')}:${index === 0 ? 'Hips' : `Joint${index}`}`,
		rotation: [0, 0, 0, 1], translation: [0, index === 0 ? 1 : 0.02, 0], ...(index < 64 ? { children: [index + 1] } : {}),
	}))
	const times = Buffer.alloc(12)
	;[0, duration * 0.37, duration].forEach((value, index) => times.writeFloatLE(value, index * 4))
	const rotations = Buffer.alloc(48)
	;[0, 0, 0, 1, 0, Math.sin(0.1), 0, Math.cos(0.1), 0, 0, 0, 1].forEach((value, index) => rotations.writeFloatLE(value, index * 4))
	const translations = Buffer.alloc(36)
	;[0, 1, 0, 0.1, 0.98, 0.1, 0.2, 1, 0.2].forEach((value, index) => translations.writeFloatLE(value, index * 4))
	const scales = Buffer.alloc(36)
	for (let index = 0; index < 9; index++) scales.writeFloatLE(1, index * 4)
	const bin = Buffer.concat([times, rotations, translations, ...(rawTrs ? [scales] : [])])
	const json = {
		asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
		materials: [{ name: 'Original matte', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
		buffers: [{ byteLength: bin.length }],
		bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 12, byteLength: 48 }, { buffer: 0, byteOffset: 60, byteLength: 36 }, ...(rawTrs ? [{ buffer: 0, byteOffset: 96, byteLength: 36 }] : [])],
		accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 3 }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: 3 }, { bufferView: 2, componentType: 5126, type: 'VEC3', count: 3 }, ...(rawTrs ? [{ bufferView: 3, componentType: 5126, type: 'VEC3', count: 3 }] : [])],
		animations: names.map(name => ({ name, samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }, ...((rootMotion || rawTrs) ? [{ input: 0, output: 2, interpolation: 'LINEAR' }] : []), ...(rawTrs ? [{ input: 0, output: 3, interpolation: 'LINEAR' }] : [])],
			channels: [...Array.from({ length: channels }, (_, index) => ({ sampler: 0, target: { node: index, path: 'rotation' } })),
				...(rawTrs ? Array.from({ length: 65 }, (_, node) => ({ sampler: 1, target: { node, path: 'translation' } })) : (rootMotion ? [{ sampler: 1, target: { node: 0, path: 'translation' } }] : [])),
				...(rawTrs ? Array.from({ length: 65 }, (_, node) => ({ sampler: 2, target: { node, path: 'scale' } })) : []),
			],
		})),
	}
	return serializeGlb(json, bin)
}

function sourceFixture(contract) {
	const legacy = smallRig({ names: canonical.intents })
	const libraries = { proven: legacy, kimodo: legacy, 'kimodo-emphasize': legacy }
	const donors = new Map(contract.motions.filter(motion => motion.source === 'native-mixamo').map((motion, index) => [
		motion.sourceFile, smallRig({ namespace: 9, names: [motion.sourceSlug], channels: 65, rootMotion: motion.channelPolicy === 'root-motion', duration: index ? 6.633333333 : 10.266666667 }),
	]))
	return { libraries, donors, readNativeSource: sourceFile => donors.get(sourceFile) }
}

function mutated(buffer, mutate) {
	const parsed = parseGlb(buffer)
	mutate(parsed.json)
	return serializeGlb(parsed.json, parsed.bin)
}

test('builder imports expose helpers without running either asset-generation entry point', () => {
	assert.equal(typeof roster.buildDefaultPresenterRoster, 'function')
	assert.equal(typeof sourceFirst.buildPresenterMotion51SourceFirstModels, 'function')
	assert.equal(canonical.canonicalSkeletonVersion, '2')
	assert.deepEqual(canonical.clipNames, canonical.intents.map((intent, index) => `${String(index).padStart(2, '0')}_${intent}`))
	assert.deepEqual(canonical.clipMap, Object.fromEntries(canonical.intents.map((intent, index) => [intent, index])))
})

test('native donors match each target independently without smoothing or changing the sixteen legacy selections', () => {
	const contract = nativeContract()
	const sources = sourceFixture(contract)
	const sourceHashes = new Map([...sources.donors].map(([name, buffer]) => [name, sha(buffer)]))
	const targets = [smallRig(), smallRig({ targetVariant: true })]
	const prepared = targets.map(target => {
		const before = sha(target)
		const result = buildDefaultPresenterMotionSelections(contract, target, sources)
		assert.equal(sha(target), before)
		return result
	})
	for (const result of prepared) for (let index = 0; index < result.length; index++) {
		const motion = contract.motions[index]
		const selection = result[index]
		if (motion.source !== 'native-mixamo') assert.deepEqual(selection, {
			motionId: motion.intent, sourceSlug: motion.sourceSlug, outputSlug: motion.intent, library: sources.libraries[motion.source], libraryKey: `${motion.source}-presenter-motion`, expectedName: contract.clipNames[index],
		})
		else {
			assert.equal(selection.rotationRetargetSpace, 'global')
			assert.equal(selection.channelPolicy, 'rotation-only')
			assert.equal(selection.boneNameMatch.policy, 'mixamo-suffix')
			assert.ok(parseGlb(selection.library).bin.equals(parseGlb(sources.donors.get(motion.sourceFile)).bin), 'matching must not smooth or change native animation bytes')
		}
	}
	assert.notEqual(prepared[0][1].libraryKey, prepared[0][7].libraryKey, 'separate sources must not collide in the transplant library cache')
	assert.notDeepEqual(parseGlb(prepared[0][1].library).json.nodes.map(node => node.name), parseGlb(prepared[1][1].library).json.nodes.map(node => node.name))
	for (const [name, source] of sources.donors) assert.equal(sha(source), sourceHashes.get(name))
})

test('a small in-memory mixed transplant retains local legacy behavior and globally retargets only explicit native sources', () => {
	const contract = nativeContract()
	const target = smallRig({ targetVariant: true })
	const selections = buildDefaultPresenterMotionSelections(contract, target, sourceFixture(contract))
	const selected = [selections[0], selections[1], selections[7]]
	const result = transplantMotionSet(target, selected, { strict: true, channelPolicy: 'rotation-only' })
	const parsed = parseGlb(result.glb)
	assert.deepEqual(parsed.json.animations.map(animation => animation.channels.length), [22, 65, 65])
	assert.deepEqual(result.retargetValidation.map(row => row.motionId), [contract.motions[1].intent, contract.motions[7].intent])
	assert.ok(result.retargetValidation.every(row => row.status === 'PASS' && row.rotationRetargetSpace === 'global' && row.boundaryBlendMs === 0 && row.maxParityErrorDegrees < 0.01))
	assert.match(result.report[0].status, /basis=local/)
	assert.deepEqual(parsed.json.nodes, parseGlb(target).json.nodes)
	assert.deepEqual(parsed.json.materials, parseGlb(target).json.materials)
	assert.ok(parsed.bin.subarray(0, parseGlb(target).bin.length).equals(parseGlb(target).bin))
})

test('explicit world-root policy forwards its authored fields and validates 65 rotations separately from one Hips translation', () => {
	const contract = nativeContract({ rootMotion: true })
	const target = smallRig({ targetVariant: true })
	const sources = sourceFixture(contract)
	const selections = buildDefaultPresenterMotionSelections(contract, target, sources)
	for (const index of [1, 7]) {
		for (const field of ['channelPolicy', 'rotationRetargetSpace', 'rootMotionSpace', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures']) assert.equal(selections[index][field], contract.motions[index][field])
		const channels = parseGlb(selections[index].library).json.animations[0].channels
		assert.equal(channels.filter(channel => channel.target.path === 'rotation').length, 65)
		assert.equal(channels.filter(channel => channel.target.path === 'translation').length, 1)
	}
	const output = parseGlb(target).json
	output.animations = contract.clipNames.map((name, index) => ({ name,
		channels: [...Array.from({ length: contract.motions[index].expectedRotationChannels }, (_, node) => ({ sampler: 0, target: { node, path: 'rotation' } })), ...([1, 7].includes(index) ? [{ sampler: 1, target: { node: 0, path: 'translation' } }] : [])],
	}))
	const counts = validateBuiltPresenterMotionChannels(output, contract)
	assert.deepEqual(counts[1], { rotation: 65, translation: 1 })
	assert.deepEqual(counts[0], { rotation: 22 })
	for (const index of [0, 1, 7]) {
		const broken = structuredClone(output)
		broken.animations[index].channels.pop()
		assert.throws(() => validateBuiltPresenterMotionChannels(broken, contract), /channel drift/)
	}
	const wrongJoint = structuredClone(output)
	wrongJoint.animations[1].channels.at(-1).target.node = 1
	assert.throws(() => validateBuiltPresenterMotionChannels(wrongJoint, contract), /channel drift/)
	for (const extra of [{ sampler: 1, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 0, path: 'scale' } }]) {
		const leakedSourceChannel = structuredClone(output)
		leakedSourceChannel.animations[1].channels.push(extra)
		assert.throws(() => validateBuiltPresenterMotionChannels(leakedSourceChannel, contract), /channel drift/, 'discarded donor TRS must never be accepted as delivered output')
	}
	const file = contract.motions[1].sourceFile
	for (const change of [
		json => { json.animations[0].channels.at(-1).target.node = 1 },
		json => { json.animations[0].channels.at(-1).target.path = 'scale' },
		json => { json.animations[0].channels.push(structuredClone(json.animations[0].channels.at(-1))) },
	]) {
		const invalid = mutated(sources.donors.get(file), change)
		assert.throws(() => buildDefaultPresenterMotionSelections(contract, target, { ...sources, readNativeSource: name => name === file ? invalid : sources.donors.get(name) }), /rotation coverage/)
	}
})

test('raw native TRS input retains all tracks while either explicit transplant policy selects its own output coverage', () => {
	for (const rootMotion of [false, true]) {
		const contract = nativeContract({ rootMotion })
		const sources = sourceFixture(contract)
		for (const motion of contract.motions.filter(row => row.source === 'native-mixamo')) sources.donors.set(motion.sourceFile,
			smallRig({ namespace: 9, names: [motion.sourceSlug], channels: 65, rawTrs: true }))
		const before = new Map([...sources.donors].map(([file, buffer]) => [file, sha(buffer)]))
		const target = smallRig({ targetVariant: true })
		const selections = buildDefaultPresenterMotionSelections(contract, target, sources)
		for (const index of [1, 7]) {
			const file = contract.motions[index].sourceFile
			const source = parseGlb(sources.donors.get(file))
			const prepared = parseGlb(selections[index].library)
			assert.equal(prepared.json.animations[0].channels.length, 195)
			for (const path of ['rotation', 'translation', 'scale']) assert.equal(prepared.json.animations[0].channels.filter(channel => channel.target.path === path).length, 65)
			assert.deepEqual(prepared.json.animations, source.json.animations, 'source channels and sampler references are not trimmed or rewritten')
			assert.ok(prepared.bin.equals(source.bin))
			assert.equal(sha(sources.donors.get(file)), before.get(file))
			assert.equal(selections[index].channelPolicy, rootMotion ? 'root-motion' : 'rotation-only')
		}
		const file = contract.motions[1].sourceFile
		const raw = sources.donors.get(file)
		for (const change of [
			json => { json.animations[0].channels.push(structuredClone(json.animations[0].channels.at(-1))) },
			json => { json.animations[0].channels.at(-1).target.path = 'weights' },
			json => { json.animations[0].channels.at(-1).target.node = json.nodes.length },
			json => { json.animations[0].channels.at(-1).target.node = '64' },
			json => { json.animations[0].channels.at(-1).sampler = 99 },
		]) {
			const invalid = mutated(raw, change)
			assert.throws(() => buildDefaultPresenterMotionSelections(contract, target, { ...sources, readNativeSource: name => name === file ? invalid : sources.donors.get(name) }), /rotation coverage/)
		}
		if (rootMotion) {
			const noHipsTranslation = mutated(raw, json => { json.animations[0].channels = json.animations[0].channels.filter(channel => channel.target.node !== 0 || channel.target.path !== 'translation') })
			assert.throws(() => buildDefaultPresenterMotionSelections(contract, target, { ...sources, readNativeSource: name => name === file ? noHipsTranslation : sources.donors.get(name) }), /rotation coverage/)
		}
	}
})

const actualDonorEvidence = ['talk', 'enumerate'].map(slug => ({ slug,
	file: new URL(`../../.codex-tmp/presenter-talk-enumerate-20260903/native-donors-02/${slug}.glb`, import.meta.url),
	sha256: slug === 'talk' ? '1029ba9997a6da3ed0f8ef933600ad67fc6aa6ff9540ecb94ac17b259a7ebd78' : 'c0203ad97475c1b22c18e16f640c4d7c928e766a04693e2d4814f16d4d417242',
}))
const actualTargetEvidence = ['joe', 'louise', 'pete'].map(identity => new URL(`../assets/presenter-source-${identity}-static.glb`, import.meta.url))
test('actual unoptimized native donors match all three real static targets read-only through dependency injection', {
	skip: [...actualDonorEvidence.map(row => row.file), ...actualTargetEvidence].every(file => fs.existsSync(file)) ? false : 'Local immutable donor/static-target evidence is not available in this checkout.',
}, () => {
	const contract = nativeContract({ rootMotion: true })
	const sources = sourceFixture(contract)
	const files = [...actualDonorEvidence.map(row => row.file), ...actualTargetEvidence]
	const original = new Map(files.map(file => [file, fs.readFileSync(file)]))
	const hashes = new Map(files.map(file => [file, sha(original.get(file))]))
	for (const row of actualDonorEvidence) {
		assert.equal(hashes.get(row.file), row.sha256)
		const motion = contract.motions.find(entry => entry.intent === row.slug)
		sources.donors.set(motion.sourceFile, original.get(row.file))
	}
	for (const targetFile of actualTargetEvidence) {
		const target = original.get(targetFile)
		const selections = buildDefaultPresenterMotionSelections(contract, target, sources)
		for (const index of [1, 7]) {
			const raw = parseGlb(sources.donors.get(contract.motions[index].sourceFile))
			const prepared = parseGlb(selections[index].library)
			assert.equal(prepared.json.animations[0].channels.length, 195)
			for (const path of ['rotation', 'translation', 'scale']) assert.equal(prepared.json.animations[0].channels.filter(channel => channel.target.path === path).length, 65)
			const hips = prepared.json.animations[0].channels.filter(channel => channel.target.path === 'translation' && /^mixamorig\d*:Hips$/.test(prepared.json.nodes[channel.target.node].name))
			assert.equal(hips.length, 1)
			assert.equal(selections[index].boneNameMatch.sourceJoints, 65)
			assert.equal(selections[index].boneNameMatch.sourceBinaryExact, true)
			assert.equal(selections[index].boneNameMatch.targetUntouched, true)
			assert.deepEqual(prepared.json.animations, raw.json.animations)
			assert.deepEqual(prepared.json.accessors, raw.json.accessors)
			assert.ok(prepared.bin.equals(raw.bin), 'all native donor samples remain byte-exact')
			assert.equal(selections[index].channelPolicy, 'root-motion')
			assert.equal(selections[index].rootMotionSpace, 'world')
		}
		assert.equal(sha(target), hashes.get(targetFile))
	}
	for (const file of files) {
		assert.equal(sha(original.get(file)), hashes.get(file), 'input buffers remain unchanged')
		assert.equal(sha(fs.readFileSync(file)), hashes.get(file), 'evidence files remain unchanged')
	}
})

test('unsafe filenames, unknown source kinds and unsupported policy combinations fail before loading a donor', () => {
	for (const sourceFile of ['../other.glb', '..\\other.glb', 'C:\\secret.glb', '/secret.glb', 'https://host/asset.glb', 'safe.glb:stream', 'CON.glb', 'bad\0.glb', 'file.fbx']) {
		const contract = nativeContract()
		contract.motions[1].sourceFile = sourceFile
		let reads = 0
		assert.throws(() => buildDefaultPresenterMotionSelections(contract, smallRig(), { readNativeSource() { reads++; return null } }), /safe GLB basename/)
		assert.equal(reads, 0)
	}
	for (const source of ['unknown', 'mixamo', 'kimodo-unknown', null]) {
		const contract = legacyContract()
		contract.motions[1].source = source
		assert.throws(() => validateDefaultPresenterBuildContract(contract), /Unsupported presenter motion source/)
		assert.throws(() => presenterMotionSourceProvider(source), /Unsupported presenter motion source/)
		assert.throws(() => buildOrdinaryMotionProvenanceRows(contract, Array(18).fill(1000)), /Unsupported presenter motion source/)
	}
	for (const [field, value] of [['rootMotionSpace', 'local'], ['rootMotionAnchor', 'end'], ['rootMotionMaxStatures', 0], ['rootMotionMaxHorizontalStatures', null], ['boneNamePolicy', 'unchecked'], ['rotationRetargetSpace', 'local']]) {
		const contract = nativeContract({ rootMotion: true })
		contract.motions[1][field] = value
		assert.throws(() => validateDefaultPresenterBuildContract(contract))
	}
})

test('missing or ambiguous native motions and bone collisions never fall back to another source', () => {
	const contract = nativeContract()
	const target = smallRig()
	const sources = sourceFixture(contract)
	const key = contract.motions[1].sourceFile
	const raw = sources.donors.get(key)
	for (const donor of [
		undefined,
		mutated(raw, json => { json.animations[0].name = 'another-take' }),
		mutated(raw, json => { json.animations.push(structuredClone(json.animations[0])) }),
		mutated(raw, json => { json.animations[0].channels.pop() }),
		mutated(raw, json => { json.animations[0].channels[0].target.path = 'translation' }),
		mutated(raw, json => { json.nodes[2].name = 'mixamorig4:Joint1' }),
	]) {
		assert.throws(() => buildDefaultPresenterMotionSelections(contract, target, { ...sources, readNativeSource: file => file === key ? donor : sources.donors.get(file) }))
	}
	const ambiguous = mutated(target, json => { json.nodes[2].name = 'mixamorig4:Joint1' })
	assert.throws(() => buildDefaultPresenterMotionSelections(contract, ambiguous, sources), /ambiguous joint identities/)
	const missing = mutated(target, json => { json.nodes[2].name = 'unrelated-name' })
	assert.throws(() => buildDefaultPresenterMotionSelections(contract, missing, sources), /without dropping joints/)
})

test('contract-driven source rows retain indices and unrelated provenance while replacing stale provider, take and alias labels', () => {
	const durations = canonical.intents.map((_, index) => 1000 + index)
	const before = buildOrdinaryMotionProvenanceRows(legacyContract(), durations)
	const contract = nativeContract({ rootMotion: true })
	durations[1] = 10267
	durations[7] = 6633
	const after = buildOrdinaryMotionProvenanceRows(contract, durations)
	for (let index = 0; index < after.length; index++) {
		assert.deepEqual([after[index].index, after[index].animId, after[index].clipName, after[index].motionId], [index + 1, index, canonical.clipNames[index], canonical.intents[index]])
		if (![1, 7].includes(index)) assert.equal(JSON.stringify(after[index]), JSON.stringify(before[index]))
	}
	assert.equal(before[1].provider, 'nvidia-kimodo')
	assert.equal(before[7].sourceTake, 'Shrugging / ask take reused')
	assert.deepEqual([after[1].sourceTake, after[7].sourceTake], ['Talking', 'Counting'])
	for (const index of [1, 7]) {
		assert.equal(after[index].provider, 'mixamo')
		assert.equal(after[index].sourceLabel, 'SOURCE · MIXAMO')
		assert.equal(after[index].qualifier, 'direct approved take')
		assert.equal(Object.hasOwn(after[index], 'sourceFile'), false)
		assert.doesNotMatch(JSON.stringify(after[index]), /\.glb|Kimodo|ask take reused/)
	}
	contract.motions[7].sourceQualifier = 'reviewed standing count'
	assert.equal(buildOrdinaryMotionProvenanceRows(contract, durations)[7].qualifier, 'reviewed standing count')
	assert.throws(() => buildOrdinaryMotionProvenanceRows(contract, durations.slice(1)), /exact measured/)
})

test('expected source-provider totals are computed from the contract and bank coverage rather than fixed campaign counts', () => {
	const banks = [18, 13, 2].map(length => ({ provider: 'mixamo', sourceNames: Array.from({ length }, (_, index) => `source-${index}`) }))
	const contract = nativeContract({ rootMotion: true })
	assert.deepEqual(expectedPresenterMotionProviderCounts(contract, banks), { mixamo: 49, 'nvidia-kimodo': 2 })
	const rows = [...buildOrdinaryMotionProvenanceRows(contract, Array(18).fill(1000)), ...Array.from({ length: 33 }, () => ({ provider: 'mixamo' }))]
	assert.equal(rows.length, 51)
	assert.deepEqual(validatePresenterMotionProviderCounts(rows, contract, banks), { mixamo: 49, 'nvidia-kimodo': 2 })
	rows[0].provider = 'nvidia-kimodo'
	assert.throws(() => validatePresenterMotionProviderCounts(rows, contract, banks), /Unexpected provider counts/)
	const alternate = legacyContract()
	alternate.motions.forEach(motion => { motion.source = 'proven' })
	assert.deepEqual(expectedPresenterMotionProviderCounts(alternate, banks), { mixamo: 51, 'nvidia-kimodo': 0 })
	alternate.motions.forEach(motion => { motion.source = 'kimodo' })
	assert.deepEqual(expectedPresenterMotionProviderCounts(alternate, banks), { mixamo: 33, 'nvidia-kimodo': 18 })
})
