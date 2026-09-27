import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-source-inventory-'))

process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_REQUIRE_QUOTE_BINDING = '0'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
process.env.BETTERPPTX_DECK_STATE_FILE = path.join(fixtureRoot, 'decks.json')
process.env.BETTERPPTX_DECK_SNAPSHOT_STORE = 'local'
process.env.BETTERPPTX_DECK_SNAPSHOT_DIR = path.join(fixtureRoot, 'snapshots')
process.env.BETTERPPTX_ASSET_GRANT_STORE = 'local'
process.env.BETTERPPTX_ASSET_GRANT_DIR = path.join(fixtureRoot, 'grants')
process.env.BETTERPPTX_LOCKED_ASSET_STORE = 'local'
process.env.BETTERPPTX_LOCKED_ASSET_ROOT = path.join(fixtureRoot, 'locked')
process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR = path.join(fixtureRoot, 'shared-locked')

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const { buildSpecOperationPlan } = await import('../ir/spec-compiler.mjs')

test.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function dataOf(result, label) {
	assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.error || result)}`)
	return result.data
}

test('a free publication plan cannot strip authored effects or gradients on later slides or cold recovery', () => {
	const authoredShadow = { type: 'outer', color: '000000', opacity: 0.16, blur: 8, angle: 70, distance: 3 }
	const authoredGradient = { gradientStops: [{ color: '14263D', position: 0 }, { color: '5074AD', position: 100 }], angle: 45 }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Plan-neutral native carrier fixture',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1' },
		slides: Array.from({ length: 12 }, (_, index) => ({
			id: `effect-${index}`, title: `Effect ${index}`,
			content: [{ kind: 'shape', name: 'focus', shapeName: 'rect', rect: { x: 1, y: 1, w: 3, h: 1.5 }, style: { fill: authoredGradient, shadow: authoredShadow, line: { transparency: 100 } } }],
		})),
	}
	const selections = plan => {
		const compiled = buildSpecOperationPlan(structuredClone(spec), { plan })
		return compiled.operations.filter(op => op.tool === 'betterpptx.slide.add_shape' && op.args?.options?.objectName === 'focus.shape')
			.map(op => ({ slideIndex: op.slideIndex, shadow: op.args.options.shadow, fill: op.args.options.fill }))
	}
	const free = selections('free')
	const premium = selections('premium')
	assert.equal(free.length, 12)
	assert.deepEqual(free, premium, 'publication eligibility must not rewrite the same source during recovery')
	for (const item of free) {
		assert.equal(item.shadow?.type, 'outer', `shadow missing on slide ${item.slideIndex}`)
		assert.equal(item.fill?.gradientStops?.length, 2, `gradient missing on slide ${item.slideIndex}`)
	}
})

test('current source retains authored shape and timeline while package audit classifies accessibility support', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `source-inventory-${Date.now()}`, blackBox: true })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Sovereign current-source fixture',
		authoringContract: {
			workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete',
			geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1',
		},
		slides: [{
			id: 'signal-slide', title: 'Signal',
			content: [
				{ kind: 'shape', name: 'signal', shapeName: 'ellipse', rect: { x: 1, y: 1, w: 1.4, h: 1.4 }, style: { fill: { color: '5B5CE2' }, line: { transparency: 100 } } },
				{ kind: 'textBox', name: 'author-facing-label', text: 'Stable identity', rect: { x: 2.8, y: 1.2, w: 3, h: 0.6 } },
			],
			timeline: [{ objectName: 'signal', type: 'entrance', effect: 'fade', trigger: 'afterPrevious', durationMs: 500 }],
		}],
	}
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	}), 'commit')
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'current', detail: 'full' }), 'export')
	assert.equal(exported.spec.slides[0].content[0].kind, 'shape', JSON.stringify(exported.spec.slides[0].content[0]))
	assert.equal(exported.spec.slides[0].content[0].shapeName, 'ellipse')
	assert.equal(exported.spec.slides[0].content[0].name, 'signal')
	assert.equal(exported.spec.slides[0].content[1].name, 'author-facing-label')
	assert.equal(exported.spec.slides[0].content[1].objectName, 'author-facing-label')
	assert.match(exported.editabilityMap.find(item => item.objectName === 'author-facing-label')?.nativeObjectName, /^signal-slide\.author-facing-label\./)
	assert.equal(exported.spec.slides[0].content.some(item => item.nativePreservation), false, 'ordinary AI-authored objects must remain semantic source, not preservation-only carriers')
	assert.deepEqual(exported.spec.slides[0].timeline, spec.slides[0].timeline)

	const audit = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }), 'audit')
	assert.equal(audit.packageAudit.inventoryReconciliation.supportCarrierCount, 1)
	assert.equal(audit.packageAudit.inventoryReconciliation.unexplainedCarrierCount, 0)
	assert.equal(audit.packageAudit.inventoryReconciliation.supportObjects[0].visibility, 'non-visible-transparent')
	assert.equal(audit.packageAudit.inventoryReconciliation.supportObjects[0].pricingRole, 'excluded-support-object')
	await mcp.call('betterpptx.deck.dispose', { deckId: committed.deckId })
})

test('repeated author IDs resolve per slide without compiler-suffix workarounds', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `identity-map-${Date.now()}`, blackBox: true })
	const slide = index => ({
		id: `identity-${index}`, title: `Identity ${index}`,
		content: [{ kind: 'shape', name: 'light-core', shapeName: 'ellipse', rect: { x: 1 + index, y: 1, w: 1, h: 1 }, style: { fill: { color: 'F4D35E' }, line: { transparency: 100 } } }],
		timeline: [{ objectName: 'light-core', type: 'emphasis', effect: 'pulse', trigger: 'afterPrevious', durationMs: 450 }],
	})
	const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'Repeated identity',
			authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1' },
			slides: [slide(1), { ...slide(2), transition: { type: 'morph', option: 'byObject' } }],
		},
		phase: 'dryRun', plan: 'premium', detail: 'full',
	}), 'dryRun')
	assert.equal((dry.warnings || []).some(item => item.code === 'MOTION_TARGET_NOT_FOUND'), false, JSON.stringify(dry.warnings || []))
	assert.equal(dry.identityMap.slides.length, 2)
	for (const mappedSlide of dry.identityMap.slides) {
		const mapped = mappedSlide.objects.find(object => object.authorId === 'light-core')
		assert.ok(mapped)
		assert.match(mapped.nativeObjectId, /(?:^|\.)light-core\./)
	}
})

test('fifteen-slide native audit reconciles numeric slide order and individual animation effects', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-carrier-order-${Date.now()}`, blackBox: true })
	const slides = Array.from({ length: 15 }, (_, index) => {
		const slideNumber = index + 1
		const content = [{
			kind: 'shape', name: `signal-${slideNumber}`, shapeName: 'ellipse',
			rect: { x: 1, y: 1, w: 1, h: 1 },
			style: { fill: { color: '5B5CE2' }, line: { transparency: 100 } },
			animation: [{ type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', durationMs: 400 }],
		}]
		if (index < 4) content.push({
			kind: 'textBox', name: `label-${slideNumber}`, text: `Signal ${slideNumber}`,
			rect: { x: 2.2, y: 1, w: 2, h: 0.5 },
			animation: [{ type: 'emphasis', effect: 'pulse', trigger: 'afterPrevious', durationMs: 400 }],
		})
		return { id: `slide-${slideNumber}`, title: `Slide ${slideNumber}`, content }
	})
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native carrier order and count',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1' },
		slides,
	}
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	}), 'commit')
	const audit = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }), 'audit')
	assert.equal(audit.ok, true, JSON.stringify(audit.issues))
	assert.equal(audit.packageAudit.ok, true, JSON.stringify(audit.packageAudit.carrierDeficits))
	assert.equal(audit.packageAudit.expected.animations, 19)
	assert.equal(audit.packageAudit.actual.animations, 19)
	assert.equal(audit.packageAudit.timingTreeCount, 15)
	assert.equal(audit.packageAudit.inventoryReconciliation.unexplainedCarrierCount, 0)
	assert.equal(audit.packageAudit.objectEvidence.find(item => item.objectName.includes('signal-10'))?.slideIndex, 9)
	assert.equal(audit.packageAudit.objectEvidence.find(item => item.objectName.includes('signal-2'))?.slideIndex, 1)
	const entry = getDeck(committed.deckId)
	entry.pptx.slides[0]._animations.pop()
	const tampered = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }), 'tampered audit')
	assert.equal(tampered.ok, false)
	assert.equal(tampered.packageAudit.ok, false)
	assert.ok(tampered.packageAudit.carrierDeficits.some(item => item.carrier === 'animations' && item.expected === 19 && item.actual === 18))
	assert.ok(tampered.issues.some(item => item.code === 'NATIVE_PACKAGE_AUDIT_FAILED'))
	await mcp.call('betterpptx.deck.dispose', { deckId: committed.deckId })
})

test('gradient surface retains its authored native shadow in the carrier audit', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-shadow-${Date.now()}`, blackBox: true })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native shadow carrier',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1' },
		slides: [{ id: 'shadow-slide', title: 'Shadow', content: [{
			kind: 'shape', name: 'lit-panel', shapeName: 'rect', rect: { x: 1, y: 1, w: 4, h: 2 },
			style: {
				fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 25, gradientStops: [{ position: 0, color: 'E1ECE3' }, { position: 100, color: 'CFE4DD' }] },
				line: { color: '101F29', width: 0 },
				shadow: { type: 'outer', color: '000000', opacity: 0.16, blur: 8, distance: 3, angle: 70 },
			},
		}] }],
	}
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true }), 'commit')
	const audit = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }), 'audit')
	assert.equal(audit.packageAudit.expected.effects, 1)
	assert.equal(audit.packageAudit.actual.effects, 1, JSON.stringify(audit.packageAudit.carrierDeficits))
	assert.equal(audit.packageAudit.ok, true)
	const canonicalBeforeExport = getDeck(committed.deckId).canonicalSpecState?.digest
	assert.ok(canonicalBeforeExport, 'the committed draft has a durable compilation source')
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'current', download: false }), 'current source export')
	assert.ok(exported.spec.slides[0].content.some(block => block.name === 'lit-panel' && block.style?.shadow), 'current source preserves the authored shadow')
	assert.equal(getDeck(committed.deckId).canonicalSpecState?.digest, canonicalBeforeExport, 'read-only export cannot replace the durable compilation source')
	const nativeShape = getDeck(committed.deckId).pptx.slides[0]._slideObjects.find(item => item?.options?.objectName?.includes('lit-panel'))
	assert.ok(nativeShape)
	delete nativeShape.options.shadow
	const tampered = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }), 'tampered shadow audit')
	assert.equal(tampered.ok, false)
	assert.equal(tampered.packageAudit.selectedEffectFailures[0].control, 'shadow')
	assert.equal(tampered.packageAudit.selectedEffectFailures[0].objectName, 'lit-panel')
	await mcp.call('betterpptx.deck.dispose', { deckId: committed.deckId })
})
