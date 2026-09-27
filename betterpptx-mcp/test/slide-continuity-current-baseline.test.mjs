import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'
import { TOOLS } from '../tools.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { assertSlideContinuityCommitMode, assertSlideContinuityItemOperations, bindSlideContinuitiesToAuthoredActions, bindSlideContinuitiesToPlan, bindSlideContinuitiesToQualifiedReleases, normalizeSlideContinuities, SLIDE_CONTINUITIES_PUBLIC_SCHEMA, SLIDE_CONTINUITIES_READBACK_SCHEMA } from '../ir/slide-continuity-contract.mjs'
import { normalizePresenterPerformance, PRESENTER_PERFORMANCE_SCHEMA } from '../presenter-performance-contract.mjs'
import { EDITABLE_ITEM_PAYLOAD_VERSION } from '../ir/continuity-item-payload.mjs'

function withoutDescriptions(value) {
	if (Array.isArray(value)) return value.map(withoutDescriptions)
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, part]) => [key, withoutDescriptions(part)]))
}

function authoredBoundarySpec() {
	const digest = 'a'.repeat(64)
	const endpoint = suffix => ({
		actorInstanceId: `guide-${suffix}`, itemInstanceId: `card-${suffix}`, atMs: 2500,
		safeFrame: [0.05, 0.05, 0.95, 0.95],
		actor: {
			position: [0.5, 0.6], angleDeg: 0, velocity: [0.1, 0], poseDeg: [0, 10],
			supportFoot: 'left', motionId: 'motion.generic.carry', actionId: 'carry',
			sourceId: 'source.generic-carry', sourceTimeMs: 900, sourceDurationMs: 1375,
		},
		item: { kind: 'editable-shape', digestVersion: EDITABLE_ITEM_PAYLOAD_VERSION, dataDigest: digest, attachedTo: 'guide', position: [0.55, 0.5], angleDeg: 0 },
	})
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Cross-slide contract probe',
		slides: [
			{ id: 'departure', content: [{ kind: 'shape', name: 'card-departure' }] },
			{ id: 'arrival', content: [{ kind: 'shape', name: 'card-arrival' }] },
		],
		slideContinuities: [{
			id: 'boundary', fromSlideId: 'departure', toSlideId: 'arrival',
			actorLogicalId: 'guide', itemLogicalId: 'card',
			from: endpoint('departure'), to: endpoint('arrival'),
			transfer: { authoredBy: 'AI', atMs: 2500, fromOwner: 'departure', toOwner: 'arrival' },
			narration: { streamId: 'narration', boundaryMs: 2500, fromCueIds: ['out'], toCueIds: ['in'] },
			transition: { kind: 'explicit-cut', durationMs: 0 },
			depth: { shared3dPlane: false, fragmentInterleave: false },
			tolerance: { position: 0.01, velocity: 0.01, angleDeg: 1, poseDeg: 1, sourceMs: 1 },
		}],
	}
}

test('public and portable deck schemas advertise the same typed continuity contract', () => {
	const tool = TOOLS.find(entry => entry.name === 'betterpptx.deck.generate_from_spec')
	const portable = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
	assert.deepEqual(withoutDescriptions(tool.inputSchema.properties.spec.properties.slideContinuities), withoutDescriptions(SLIDE_CONTINUITIES_PUBLIC_SCHEMA))
	assert.deepEqual(withoutDescriptions(portable.properties.slideContinuities), withoutDescriptions(SLIDE_CONTINUITIES_PUBLIC_SCHEMA))
	assert.deepEqual(
		withoutDescriptions(tool.inputSchema.properties.spec.properties.slides.items.properties.presenterPerformance.oneOf[0].properties.actorInstanceId),
		withoutDescriptions(PRESENTER_PERFORMANCE_SCHEMA.properties.actorInstanceId),
	)
	assert.deepEqual(
		withoutDescriptions(portable.$defs.presenterPerformance.oneOf[0].properties.actorInstanceId),
		withoutDescriptions(PRESENTER_PERFORMANCE_SCHEMA.properties.actorInstanceId),
	)
})

test('continuity readback schema is closed around public semantic and planned fields', () => {
	const schema = SLIDE_CONTINUITIES_READBACK_SCHEMA.properties.boundaries.items
	assert.equal(schema.additionalProperties, false)
	assert.equal(schema.properties.plannedBindings.properties.from.properties.actor.additionalProperties, false)
	assert.equal(schema.properties.narrationBinding.properties.from.properties.cues.items.additionalProperties, false)
	for (const privateField of ['sourceBytes', 'nativeProofBytes', 'privatePath', 'privateEvidence']) assert.equal(schema.properties[privateField], undefined)
})

test('absence is a no-op and a mistyped singular request fails closed', () => {
	assert.deepEqual(normalizeSlideContinuities({ slides: [] }).boundaries, [])
	assert.throws(() => buildSpecOperationPlan({ ...authoredBoundarySpec(), slideContinuities: undefined, slideContinuity: {} }), {
		code: 'SLIDE_CONTINUITY_UNKNOWN_FIELD',
	})
})

test('continuity rejects non-atomic append and patch before mutation', () => {
	const spec = authoredBoundarySpec()
	for (const mode of ['append', 'patch']) assert.throws(() => assertSlideContinuityCommitMode(spec, mode), {
		code: 'SLIDE_CONTINUITY_COMMIT_MODE_NONATOMIC',
	})
	for (const mode of ['createNew', 'replaceDeck']) assert.doesNotThrow(() => assertSlideContinuityCommitMode(spec, mode))
	assert.doesNotThrow(() => assertSlideContinuityCommitMode({ ...spec, slideContinuities: [] }, 'append'))
})

test('a semantic boundary cannot silently execute without an exact presenter action', () => {
	const spec = authoredBoundarySpec()
	assert.equal(normalizeSlideContinuities(spec).boundaries.length, 1)
	assert.throws(() => buildSpecOperationPlan(spec), { code: 'SLIDE_CONTINUITY_ACTION_UNRESOLVED' })
})

test('authored item identity resolves to exactly one content block on each slide', () => {
	const spec = authoredBoundarySpec()
	spec.slides[1].content.push({ kind: 'shape', name: 'card-arrival' })
	assert.throws(() => normalizeSlideContinuities(spec), { code: 'SLIDE_CONTINUITY_ITEM_BINDING' })
	spec.slides[1].content.pop()
	spec.slides[1].content[0].kind = 'textShape'
	assert.throws(() => normalizeSlideContinuities(spec), { code: 'SLIDE_CONTINUITY_ITEM_BINDING' })
})

test('contrasting actor, item, direction and clock remain generic; unsupported transition fails closed', () => {
	const first = authoredBoundarySpec()
	const second = structuredClone(first)
	const boundary = second.slideContinuities[0]
	boundary.actorLogicalId = 'presenter-violet'
	boundary.itemLogicalId = 'editable-ledger'
	boundary.narration.boundaryMs = 4200
	boundary.transfer.atMs = 4200
	for (const side of ['from', 'to']) {
		const endpoint = boundary[side]
		endpoint.atMs = 4200
		endpoint.actor.position = [0.7, 0.6]
		endpoint.actor.velocity = [-0.12, 0]
		endpoint.actor.motionId = 'motion.generic.return'
		endpoint.actor.sourceId = 'source.return-carry'
		endpoint.actor.sourceTimeMs = 1500
		endpoint.actor.sourceDurationMs = 2600
		endpoint.item.attachedTo = 'presenter-violet'
		endpoint.item.dataDigest = 'b'.repeat(64)
	}
	assert.equal(normalizeSlideContinuities(first).boundaries.length, 1)
	assert.equal(normalizeSlideContinuities(second).boundaries.length, 1)
	boundary.transition.kind = 'morph'
	assert.throws(() => normalizeSlideContinuities(second), { code: 'SLIDE_CONTINUITY_UNSUPPORTED_TRANSITION' })
})

test('private qualified release bytes are verified and never enter semantic readback', () => {
	const spec = { ...authoredBoundarySpec(), presenter: { id: 'guide', identity: 'joe' } }
	const bytes = Buffer.from('synthetic local test data')
	const sha = createHash('sha256').update(bytes).digest('hex')
	const release = {
		status: 'QUALIFIED', motionId: 'motion.generic.carry', presenterIdentity: 'joe',
		sourceId: 'source.generic-carry', sourceDurationMs: 1375, releaseVersion: 'synthetic-v1',
		sourceBytes: bytes, sourceSha256: sha, assetBytes: bytes, assetSha256: sha,
		targetRigBytes: bytes, targetRigSha256: sha, nativeProofBytes: bytes, nativeProofSha256: sha,
		privatePath: 'C:\\private\\not-public.glb',
	}
	const normalized = normalizeSlideContinuities(spec)
	const bound = bindSlideContinuitiesToQualifiedReleases(normalized, spec, () => release)
	assert.equal(bound.boundaries[0].sourceReleaseStatus, 'QUALIFIED')
	assert.doesNotMatch(JSON.stringify(bound), /privatePath|not-public|sourceBytes|nativeProofBytes/)
	assert.throws(() => bindSlideContinuitiesToQualifiedReleases(normalized, spec, () => ({ ...release, assetSha256: '0'.repeat(64) })), {
		code: 'SLIDE_CONTINUITY_SOURCE_RELEASE_MISMATCH',
	})
})

test('actor instance IDs bind to exact authored performance and planned native objects', () => {
	const spec = authoredBoundarySpec()
	spec.motionTime = { kineticSelection: { presenters: [{ presenterId: 'guide', selectedMotionIds: ['motion.generic.carry'] }] } }
	for (const slide of spec.slides) {
		const actorInstanceId = `guide-${slide.id}`
		slide.presenterPerformance = normalizePresenterPerformance({ actor: 'guide', actorInstanceId, blendMs: 0, actions: [{ id: 'carry', motionId: 'motion.generic.carry', durationMs: 1375 }] })
	}
	assert.ok(PRESENTER_PERFORMANCE_SCHEMA.properties.actorInstanceId)
	const normalized = normalizeSlideContinuities(spec)
	const actions = bindSlideContinuitiesToAuthoredActions(normalized, spec)
	assert.equal(actions.boundaries[0].authoredActionBinding.status, 'AUTHORED_ACTION_ONLY')
	const plan = { slides: spec.slides.map(slide => ({
		slideId: slide.id,
		objects: [
			{ primitive: 'model3d', blockName: 'guide', objectName: `guide-${slide.id}`, editHandle: `actor-handle-${slide.id}` },
			{ primitive: 'shape', blockName: `card-${slide.id}`, objectName: `card-${slide.id}`, editHandle: `item-handle-${slide.id}` },
		],
	})) }
	const plannedBinding = bindSlideContinuitiesToPlan(actions, plan)
	assert.equal(plannedBinding.boundaries[0].bindingStatus, 'PLANNED_OBJECTS_ONLY')
	const itemOperations = ['departure', 'arrival'].map(slideId => ({ slideId, tool: 'betterpptx.slide.add_shape', objectName: `card-${slideId}`, args: { options: { objectName: `card-${slideId}`, editHandle: `item-handle-${slideId}` } } }))
	assert.equal(assertSlideContinuityItemOperations(plannedBinding, itemOperations), plannedBinding)
	const duplicateOperation = structuredClone(itemOperations)
	duplicateOperation.push(structuredClone(duplicateOperation[1]))
	assert.throws(() => assertSlideContinuityItemOperations(plannedBinding, duplicateOperation), { code: 'SLIDE_CONTINUITY_OPERATION_BINDING' })
	const wrongHandleOperation = structuredClone(itemOperations)
	wrongHandleOperation[1].args.options.editHandle = 'wrong-native-handle'
	assert.throws(() => assertSlideContinuityItemOperations(plannedBinding, wrongHandleOperation), { code: 'SLIDE_CONTINUITY_OPERATION_BINDING' })
	const wrongPlan = structuredClone(plan)
	wrongPlan.slides[1].objects[0].objectName = 'unrelated-native-actor'
	assert.throws(() => bindSlideContinuitiesToPlan(actions, wrongPlan), { code: 'SLIDE_CONTINUITY_PLANNED_ACTOR_BINDING' })
	spec.slides[1].presenterPerformance.actorInstanceId = 'wrong-authored-instance'
	assert.throws(() => bindSlideContinuitiesToAuthoredActions(normalized, spec), { code: 'SLIDE_CONTINUITY_ACTION_INSTANCE_MISMATCH' })
})

test('editable group operation retains its planned edit handle', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Editable group handle proof', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		slides: [{ id: 'group-slide', title: 'Group identity', content: [{ kind: 'group', name: 'editable-card', rect: { x: 1, y: 1, w: 3, h: 2 }, children: [{ kind: 'textShape', name: 'card-label', x: 0, y: 0, w: 2.8, h: 0.7, text: 'Editable' }] }] }],
	}
	const compiled = buildSpecOperationPlan(spec)
	const planned = compiled.plan.slides[0].objects.find(object => object.primitive === 'group' && object.blockName === 'editable-card')
	const operations = compiled.operations.filter(operation => operation.tool === 'betterpptx.slide.add_group' && operation.slideId === 'group-slide')
	assert.ok(planned?.editHandle)
	assert.equal(operations.length, 1)
	assert.equal(operations[0].objectName, planned.objectName)
	assert.equal(operations[0].args.options.editHandle, planned.editHandle)
})
