import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs, { readFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const previousPublicMode = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
after(() => {
	if (previousPublicMode === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previousPublicMode
})
const { ensureDefaultPresenterRegistered, resolveDefaultPresenterContacts } = await import('../assets/default-presenter-roster.mjs')
const { getCachedGeneratedRigged3d } = await import('../assets/model3d-gen-providers.mjs')
const { computeContacts, parseGlb, serializeGlb } = await import('../ir/kinetic-transplant.mjs')

const canonical = JSON.parse(readFileSync(new URL('../deploy/model3d-worker/canonical/canonical-clipmap.json', import.meta.url), 'utf8'))
const contractPath = fileURLToPath(new URL('../assets/default-presenter-motion-contract.json', import.meta.url))
const assetPath = identity => fileURLToPath(new URL(`../assets/default-presenter-${identity}.glb`, import.meta.url))
const sha = value => createHash('sha256').update(value).digest('hex')
const legacy = [
	[3602, 9958], [2021, 4800], [507, 542], [926, 3625], [2050, 5200], [3302, 6208],
	[681, 2000], [723, 2000], [723, 2000], [2726, 5125], [521, 1750], [995, 2750],
	[1628, 4250], [819, 1833], [693, 1917], [1702, 4000], [798, 1042], [1250, 4200],
].map(([contactMs, durationMs], animId) => ({ animId, clipName: canonical.clipNames[animId], contactMs, durationMs }))

function motionContract(optedIn = []) {
	return {
		clipNames: [...canonical.clipNames],
		motions: canonical.intents.map((intent, index) => ({ intent, expectedRotationChannels: 1, ...(optedIn.includes(index) ? { contactPolicy: 'rotation-peak' } : {}) })),
	}
}

function fixture(durations = {}) {
	const chunks = []
	const views = []
	const accessors = []
	let byteOffset = 0
	const append = (values, type, components) => {
		const bytes = Buffer.alloc(values.length * 4)
		values.forEach((value, index) => bytes.writeFloatLE(value, index * 4))
		views.push({ buffer: 0, byteOffset, byteLength: bytes.length })
		accessors.push({ bufferView: views.length - 1, componentType: 5126, type, count: values.length / components })
		chunks.push(bytes)
		byteOffset += bytes.length
		return accessors.length - 1
	}
	const animations = canonical.clipNames.map((name, index) => {
		const duration = durations[index] ?? 3.25
		const input = append([0, duration * 0.37, duration], 'SCALAR', 1)
		const output = append([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, 0, 0, 1], 'VEC4', 4)
		// The source bytes, not optional or stale accessor max metadata, own time.
		accessors[input].max = [999]
		return { name, samplers: [{ input, output, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }
	})
	const bin = Buffer.concat(chunks)
	return serializeGlb({ asset: { version: '2.0' }, nodes: [{ name: 'Joint', rotation: [0, 0, 0, 1] }], buffers: [{ byteLength: bin.length }], bufferViews: views, accessors, animations }, bin)
}

function modified(raw, mutate) {
	const parsed = parseGlb(raw)
	mutate(parsed.json, parsed.bin)
	return serializeGlb(parsed.json, parsed.bin)
}

function rejects(raw, contract) {
	assert.throws(() => resolveDefaultPresenterContacts(raw, contract), error => error?.code === 'DEFAULT_PRESENTER_CONTACTS_INVALID')
}

function rootMotionFixture() {
	const { json, bin } = parseGlb(fixture({ 5: 4 }))
	json.nodes[0].name = 'mixamorig:Hips'
	const values = Buffer.alloc(36)
	;[0, 0, 0, 0.1, 0.03, 0.2, 0.2, 0, 0.4].forEach((value, index) => values.writeFloatLE(value, index * 4))
	json.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: values.length })
	json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, type: 'VEC3', count: 3 })
	const animation = json.animations[4]
	animation.samplers.push({ input: animation.samplers[0].input, output: json.accessors.length - 1, interpolation: 'LINEAR' })
	animation.channels.push({ sampler: 1, target: { node: 0, path: 'translation' } })
	json.buffers[0].byteLength += values.length
	return serializeGlb(json, Buffer.concat([bin, values]))
}

function rootMotionContract() {
	const contract = motionContract([4])
	Object.assign(contract.motions[4], { channelPolicy: 'root-motion', rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: 0.35, rootMotionMaxHorizontalStatures: 0.5 })
	return contract
}

test('absent contact policies preserve every legacy record and do not mutate inputs or baseline records', () => {
	const raw = fixture()
	const contract = motionContract()
	const rawHash = sha(raw)
	const contractBefore = JSON.stringify(contract)
	const result = resolveDefaultPresenterContacts(raw, contract)
	assert.equal(JSON.stringify(result), JSON.stringify(legacy))
	result[0].contactMs = -1
	assert.equal(JSON.stringify(resolveDefaultPresenterContacts(raw, contract)), JSON.stringify(legacy))
	assert.equal(sha(raw), rawHash)
	assert.equal(JSON.stringify(contract), contractBefore)
})

test('any opted-in slots receive exact rounded source clocks and rotation peaks while the other sixteen stay byte-identical', () => {
	const selected = [5, 10]
	const raw = fixture({ 5: 10.266666667, 10: 6.633333333 })
	const before = sha(raw)
	const contract = motionContract(selected)
	const contractBefore = JSON.stringify(contract)
	const result = resolveDefaultPresenterContacts(raw, contract)
	assert.deepEqual(selected.map(index => result[index].durationMs), [10267, 6633])
	assert.deepEqual(selected.map(index => result[index].contactMs), [3799, 2454])
	const measured = computeContacts(raw)
	for (let index = 0; index < result.length; index++) {
		if (selected.includes(index)) {
			assert.deepEqual(result[index], { ...legacy[index], ...measured[canonical.intents[index]], contactPolicy: 'rotation-peak' })
		} else assert.equal(JSON.stringify(result[index]), JSON.stringify(legacy[index]))
	}
	assert.equal(sha(raw), before)
	assert.equal(JSON.stringify(contract), contractBefore)
})

test('real current roster measurements use each untouched raw asset and retain all unselected legacy rows', () => {
	for (const identity of ['joe', 'louise', 'pete']) {
		const raw = readFileSync(assetPath(identity))
		const before = sha(raw)
		const { json } = parseGlb(raw)
		const selected = [5, 10]
		const contract = motionContract(selected)
		contract.motions.forEach((motion, index) => { motion.expectedRotationChannels = json.animations[index].channels.length })
		const result = resolveDefaultPresenterContacts(raw, contract)
		const measured = computeContacts(raw)
		for (let index = 0; index < result.length; index++) {
			if (selected.includes(index)) assert.deepEqual(result[index], { ...legacy[index], ...measured[canonical.intents[index]], contactPolicy: 'rotation-peak' })
			else assert.equal(JSON.stringify(result[index]), JSON.stringify(legacy[index]))
		}
		assert.equal(sha(raw), before)
		assert.equal(sha(readFileSync(assetPath(identity))), before)
	}
})

test('invalid policies, motion identity, ordered names and cardinality fail closed', () => {
	const raw = fixture()
	const cases = [
		null,
		{},
		{ ...motionContract(), clipNames: canonical.clipNames.slice(1) },
		{ ...motionContract(), motions: motionContract().motions.slice(1) },
	]
	for (const mutate of [
		contract => { contract.clipNames[4] = contract.clipNames[5] },
		contract => { [contract.clipNames[0], contract.clipNames[1]] = [contract.clipNames[1], contract.clipNames[0]] },
		contract => { contract.motions[4].intent = contract.motions[5].intent },
		contract => { contract.motions[4] = null },
		...['auto', 'physical-contact', null, false, 0, undefined].map(value => contract => { contract.motions[4].contactPolicy = value }),
	]) {
		const contract = motionContract()
		mutate(contract)
		cases.push(contract)
	}
	for (const contract of cases) rejects(raw, contract)
	for (const mutate of [
		json => { json.animations.pop() },
		json => { json.animations.push(structuredClone(json.animations[0])) },
		json => { json.animations[4].name = json.animations[5].name },
		json => { delete json.animations[4].name },
		json => { [json.animations[0], json.animations[1]] = [json.animations[1], json.animations[0]] },
	]) rejects(modified(raw, mutate), motionContract([4]))
})

test('opted-in clips reject missing, unsupported or malformed rotation sampling instead of defaulting to zero', () => {
	const raw = fixture()
	const contract = motionContract([4])
	const timingAccessor = json => json.accessors[json.animations[4].samplers[0].input]
	const rotationAccessor = json => json.accessors[json.animations[4].samplers[0].output]
	const mutations = [
		json => { json.animations[4].channels = [] },
		json => { json.animations[4].samplers = [] },
		json => { json.animations[4].channels[0].sampler = 9 },
		json => { json.animations[4].channels[0].target.path = 'translation' },
		json => { json.animations[4].channels[0].target.node = 9 },
		json => { json.animations[4].samplers[0].interpolation = 'CUBICSPLINE' },
		json => { json.animations[4].samplers[0].interpolation = null },
		json => { timingAccessor(json).componentType = 5123 },
		json => { timingAccessor(json).sparse = {} },
		json => { timingAccessor(json).count = 1.5 },
		json => { timingAccessor(json).normalized = true },
		json => { timingAccessor(json).bufferView = 1000 },
		json => { timingAccessor(json).byteOffset = -4 },
		json => { timingAccessor(json).count = 1000 },
		json => { json.bufferViews[timingAccessor(json).bufferView].byteStride = 3 },
		json => { rotationAccessor(json).count = 2 },
		(json, bin) => { bin.writeFloatLE(NaN, json.bufferViews[timingAccessor(json).bufferView].byteOffset + 4) },
		(json, bin) => { bin.writeFloatLE(Infinity, json.bufferViews[rotationAccessor(json).bufferView].byteOffset) },
		(json, bin) => { bin.writeFloatLE(-1, json.bufferViews[timingAccessor(json).bufferView].byteOffset + 4) },
		(json, bin) => { bin.writeFloatLE(4, json.bufferViews[timingAccessor(json).bufferView].byteOffset + 4) },
		(json, bin) => { bin.fill(0, json.bufferViews[rotationAccessor(json).bufferView].byteOffset, json.bufferViews[rotationAccessor(json).bufferView].byteOffset + 16) },
	]
	for (const mutate of mutations) rejects(modified(raw, mutate), contract)
	const wrongCount = motionContract([4])
	wrongCount.motions[4].expectedRotationChannels = 2
	rejects(raw, wrongCount)
	const duplicate = modified(raw, json => json.animations[4].channels.push(structuredClone(json.animations[4].channels[0])))
	rejects(duplicate, wrongCount)
	for (const duration of [0.0001, 1e13]) rejects(fixture({ 4: duration }), contract)
	assert.doesNotThrow(() => resolveDefaultPresenterContacts(modified(raw, json => { json.animations[4].samplers[0].interpolation = 'STEP' }), contract))
})

test('explicit bounded world-root policy accepts exactly one finite matching Hips translation without changing the rotation peak', () => {
	const raw = rootMotionFixture()
	const before = sha(raw)
	const result = resolveDefaultPresenterContacts(raw, rootMotionContract())
	assert.equal(result[4].durationMs, 3250)
	assert.deepEqual(result[4], resolveDefaultPresenterContacts(fixture({ 5: 4 }), motionContract([4]))[4])
	for (let index = 0; index < result.length; index++) if (index !== 4) assert.equal(JSON.stringify(result[index]), JSON.stringify(legacy[index]))
	assert.equal(sha(raw), before)
	const mutations = [
		json => { json.animations[4].channels.push(structuredClone(json.animations[4].channels[1])) },
		json => { json.animations[4].channels[1].target.path = 'scale' },
		json => { json.nodes[0].name = 'mixamorig:RightHand' },
		json => { json.animations[4].samplers[1].interpolation = 'CUBICSPLINE' },
		json => { json.animations[4].samplers[1].input = json.animations[5].samplers[0].input },
		json => { json.accessors[json.animations[4].samplers[1].output].type = 'VEC4' },
		json => { json.accessors[json.animations[4].samplers[1].output].count = 2 },
		(json, bin) => { bin.writeFloatLE(NaN, json.bufferViews.at(-1).byteOffset) },
	]
	for (const mutate of mutations) rejects(modified(raw, mutate), rootMotionContract())
	for (const [field, value] of [['channelPolicy', 'full-trs'], ['rootMotionSpace', 'local'], ['rootMotionAnchor', 'end'], ['rootMotionMaxStatures', 0], ['rootMotionMaxHorizontalStatures', undefined]]) {
		const contract = rootMotionContract()
		contract.motions[4][field] = value
		rejects(raw, contract)
	}
	rejects(raw, motionContract([4]))
})

test('registration serves exact asset bytes and invalidates policy-only metadata without changing legacy identities', t => {
	// Only this process's contract read is substituted. No file, asset or service
	// is written, and all other reads keep the normal governed registration path.
	const originalRead = fs.readFileSync
	const identity = 'louise'
	const raw = originalRead(assetPath(identity))
	const sourceHash = sha(raw)
	const sourceContract = originalRead(contractPath)
	const fixtureContract = motionContract()
	const { json } = parseGlb(raw)
	fixtureContract.motions.forEach((motion, index) => { motion.expectedRotationChannels = json.animations[index].channels.length })
	let activeContract = structuredClone(fixtureContract)
	const readMock = t.mock.method(fs, 'readFileSync', function (file, options) {
		const path = file instanceof URL ? fileURLToPath(file) : file
		if (path === contractPath) return options === 'utf8' ? JSON.stringify(activeContract) : Buffer.from(JSON.stringify(activeContract))
		return originalRead.call(this, file, options)
	})
	syncBuiltinESMExports()
	try {
		const baseline = ensureDefaultPresenterRegistered(identity)
		const expectedBasis = `default-presenter.v4:${identity}:${sourceHash.slice(0, 16)}:mixamo-dielectric-v4:idle-frame0-v1:none`
		assert.equal(baseline.hash, sha(`local:${expectedBasis}`).slice(0, 40))
		assert.equal(JSON.stringify(baseline.manifest.contacts), JSON.stringify(legacy))
		activeContract.motions[5].contactPolicy = 'rotation-peak'
		const measured = ensureDefaultPresenterRegistered(identity)
		assert.notEqual(measured.hash, baseline.hash)
		assert.notEqual(measured.registrationKey, baseline.registrationKey)
		assert.deepEqual(measured.manifest.contacts, resolveDefaultPresenterContacts(raw, activeContract))
		assert.equal(measured.sourceSignature, baseline.sourceSignature)
		assert.equal(ensureDefaultPresenterRegistered(identity), measured)
		const cached = getCachedGeneratedRigged3d(measured.hash)
		assert.ok(Buffer.from(cached.glbBase64, 'base64').equals(raw))
		assert.deepEqual(cached.contacts, measured.manifest.contacts)
		assert.deepEqual(cached.manifest.materialProfileMaterials, baseline.manifest.materialProfileMaterials)
		assert.equal(cached.manifest.staticPoseProfileVersion, baseline.manifest.staticPoseProfileVersion)
		activeContract = structuredClone(fixtureContract)
		const restored = ensureDefaultPresenterRegistered(identity)
		assert.equal(restored.hash, baseline.hash)
		assert.deepEqual(restored.manifest.contacts, baseline.manifest.contacts)
		activeContract.motions[5].contactPolicy = 'unsupported'
		assert.throws(() => ensureDefaultPresenterRegistered(identity), error => error?.code === 'DEFAULT_PRESENTER_CONTACTS_INVALID')
		assert.deepEqual(getCachedGeneratedRigged3d(restored.hash).contacts, baseline.manifest.contacts)
	} finally {
		readMock.mock.restore()
		syncBuiltinESMExports()
	}
	assert.equal(sha(readFileSync(assetPath(identity))), sourceHash)
	assert.ok(readFileSync(contractPath).equals(sourceContract))
})
