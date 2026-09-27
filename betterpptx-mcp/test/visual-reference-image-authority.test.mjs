import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { artDepthForSpec, listArtDirections, planDeckLayout, validateLayoutPlan } from '../ir/layout-engine.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

// In-process public contract fixtures only: no Office, service reload, deck
// artifact, image processing, or production/reference asset modification.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck, collectCompositionIssues } = await import('../engine.mjs')

const IMAGE_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARklEQVR4nO3XQREAMAgDwSqIfwMRhwrqov3sgz8zQLg76ezPOhqIEdQSjjNcQRRRXM9ovOMFJIFkBaUDy5eYhJqVnM5zPb+Oa2yXkEs5uwAAAABJRU5ErkJggg=='
const VIEWPORT = { width: 1600, height: 900 }
const SLIDE_SIZE = { w: 13.333333, h: 7.5 }
const FRAME = { x: 480, y: 90, w: 640, h: 720 }
const rounded = number => Math.round(number * 1000) / 1000
const rectFromPixels = frame => ({ x: frame.x / VIEWPORT.width * SLIDE_SIZE.w, y: frame.y / VIEWPORT.height * SLIDE_SIZE.h, w: frame.w / VIEWPORT.width * SLIDE_SIZE.w, h: frame.h / VIEWPORT.height * SLIDE_SIZE.h })
const roundedRectFromPixels = frame => Object.fromEntries(Object.entries(rectFromPixels(frame)).map(([key, value]) => [key, rounded(value)]))
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }

function fixture(world = 'observatory', imagePatch = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Reference image authority', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Retain authored image layers.', remember: 'A photo frame is already designed.' },
		visualDesign: { world, framing: 'Exact photograph frame with editable type' },
		styleIntent: { artDirection: world, mode: 'dark' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: VIEWPORT,
			mediaAssets: [{ name: 'photo-layer', kind: 'detailed-illustration', assetRef: IMAGE_DATA, purpose: 'Small immutable test image, not slide content.' }],
		},
		slides: [{ id: 'proof', title: 'Reference image authority', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'image', name: 'photo-layer', objectName: 'photo-layer', role: 'background', pixelFrame: { ...FRAME }, imageOptions: { source: { kind: 'inline', data: IMAGE_DATA, format: 'png' } }, ...imagePatch },
			{ kind: 'textBox', name: 'headline', objectName: 'headline', text: 'ONE DECISION', pixelFrame: { x: 550, y: 280, w: 520, h: 85 }, style: { fontSize: 30, color: 'FFFFFF', fit: 'none', margin: 0 } },
		] }],
	}
}

function planFor(spec) {
	return planDeckLayout(normalizeVisualReferenceReconstruction(spec), { slideSize: SLIDE_SIZE, preserveAuthoredPrecision: true })
}
function imageOf(plan) { return plan.slides[0].objects.find(object => object.primitive === 'image') }
function nativePicture(entry) { return entry.pptx.slides[0]._slideObjects.find(object => (object.type || object._type) === 'image') }
function mcpFixture() { return createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `reference-image-${Date.now()}-${Math.random()}`, blackBox: true }) }

test('exact-reference image geometry and layer role are authoritative in all named Worlds', () => {
	for (const { key: world } of listArtDirections()) {
		const input = fixture(world)
		const original = structuredClone(input)
		const plan = planFor(input)
		const photo = imageOf(plan)
		assert.deepEqual(photo.rect, rectFromPixels(FRAME), world)
		assert.equal(photo.role, 'background', world)
		assert.equal(photo.placementSource, 'author', world)
		assert.equal(plan.slides[0].objects.some(object => object.role === 'image-frame'), false, world)
		assert.equal(photo.style.shadow, undefined, world)
		assert.equal(photo.style.rectRadius, undefined, world)
		assert.equal(photo.imageOps, undefined, world)
		assert.equal(validateLayoutPlan(plan).issues.some(issue => issue.code === 'OBJECT_OVERLAP'), false, world)
		assert.deepEqual(input, original, 'Planning must not modify the source composition.')
	}
})

test('ordinary semantic Worlds retain their existing frame, inset, radius and shadow defaults', () => {
	for (const { key: world } of listArtDirections()) {
		const input = normalizeVisualReferenceReconstruction(fixture(world))
		delete input.visualReference
		delete input.authoringContract.placementPolicy
		const depth = artDepthForSpec(input)
		const plan = planDeckLayout(input, { slideSize: SLIDE_SIZE })
		const photo = imageOf(plan)
		const imageFrame = plan.slides[0].objects.find(object => object.role === 'image-frame')
		const original = roundedRectFromPixels(FRAME)
		const inset = depth.imageFrame ? Math.max(0.025, (depth.imageFrame.width || 1) * 0.022) : 0
		assert.equal(Boolean(imageFrame), Boolean(depth.imageFrame), world)
		assert.deepEqual(photo.rect, Object.fromEntries(Object.entries({ x: original.x + inset, y: original.y + inset, w: original.w - inset * 2, h: original.h - inset * 2 }).map(([key, value]) => [key, rounded(value)])), world)
		assert.equal(photo.role, 'image', world)
		assert.equal(photo.style.rectRadius, depth.imageRadius, world)
		assert.equal(Boolean(photo.style.shadow), depth.shadow !== 'none' && !depth.imageFrame, world)
	}
})

test('explicit native picture treatments and raster-grade opt-in stay available without moving reference pixels', () => {
	const treatments = [
		{ style: { line: { color: '12ABEF', width: 1.5 }, shadow: { type: 'outer', color: '002244', blur: 4, offset: 2, angle: 45, opacity: 0.3 }, glow: { color: '22CCFF', size: 5, opacity: 0.25 } } },
		{ pictureStylePresetId: 'picture-style-001', pictureStyle: { geometry: { preset: 'roundRect' } } },
		{ imageOptions: { source: { kind: 'inline', data: IMAGE_DATA }, pictureStyle: { geometry: { preset: 'ellipse' } }, shadow: null } },
	]
	for (const treatment of treatments) {
		const input = fixture('observatory', treatment)
		const compiled = buildSpecOperationPlan(input)
		const image = imageOf(compiled.plan)
		const op = compiled.operations.find(operation => operation.tool === 'betterpptx.slide.add_image')
		assert.deepEqual(image.rect, rectFromPixels(FRAME))
		assert.equal(compiled.plan.slides[0].objects.some(object => object.role === 'image-frame'), false)
		assert.equal(op.args.options.role, 'background')
		assert.deepEqual(Object.fromEntries(['x', 'y', 'w', 'h'].map(key => [key, op.args.options[key]])), rectFromPixels(FRAME))
		for (const [key, value] of Object.entries(treatment.style || {})) {
			for (const [field, authored] of Object.entries(value)) assert.deepEqual(op.args.options[key][field], authored)
		}
		if (treatment.pictureStylePresetId) assert.equal(op.args.options.pictureStylePresetId, treatment.pictureStylePresetId)
		if (treatment.pictureStyle) assert.deepEqual(op.args.options.pictureStyle, treatment.pictureStyle)
		if (treatment.imageOptions?.pictureStyle) assert.deepEqual(op.args.options.pictureStyle, treatment.imageOptions.pictureStyle)
		if (treatment.imageOptions?.shadow === null) assert.equal(op.args.options.shadow, null)
	}
	const gradingInput = fixture('blueprint', { imageTreatment: 'world', imageOps: [{ op: 'flip', horizontal: true }] })
	const graded = imageOf(planFor(gradingInput))
	const semanticInput = normalizeVisualReferenceReconstruction(gradingInput)
	delete semanticInput.visualReference
	const semantic = imageOf(planDeckLayout(semanticInput, { slideSize: SLIDE_SIZE }))
	assert.deepEqual(graded.imageOps, semantic.imageOps)
	assert.ok(graded.imageOps.length > 1, 'The explicit World grade remains active.')
	assert.deepEqual(graded.rect, rectFromPixels(FRAME))
})

test('all image-role overlaps remain measurable without an engine spatial veto', () => {
	for (const role of ['background', 'decorative', 'image', 'proof', undefined]) {
		const input = fixture('observatory', { role })
		const plan = planFor(input)
		const photo = imageOf(plan)
		assert.equal(photo.role, role || 'image')
		const overlap = validateLayoutPlan(plan).issues.find(issue => issue.code === 'OBJECT_OVERLAP')
		assert.equal(overlap?.severity, role === 'background' || role === 'decorative' ? undefined : 'warning', String(role))
	}
})

test('public commit, native carriers and export replay keep a background image exact and editable', async () => {
	const mcp = mcpFixture()
	const input = fixture()
	dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: input, phase: 'dryRun', detail: 'full' }))
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: input, phase: 'commit', detail: 'full' }))
	const entry = getDeck(committed.deckId)
	const picture = nativePicture(entry)
	assert.ok(picture)
	assert.equal(picture.options.role, 'background')
	assert.deepEqual(Object.fromEntries(['x', 'y', 'w', 'h'].map(key => [key, picture.options[key]])), rectFromPixels(FRAME))
	assert.equal(entry.pptx.slides[0]._slideObjects.some(object => String(object.options?.objectName).includes('image-frame')), false)
	assert.equal(collectCompositionIssues(entry).some(issue => issue.code === 'TEXT_VISUAL_OVERLAP'), false)
	const design = dataOf(await mcp.call('betterpptx.deck.validate_design', { deckId: committed.deckId, profile: 'static', mode: 'strict', requireNarration: false, requireMotion: false }))
	assert.equal(design.issues.some(issue => issue.code === 'TEXT_VISUAL_OVERLAP'), false)
	const inspect = async current => {
		const zip = await JSZip.loadAsync(await current.pptx.write({ outputType: 'nodebuffer', compression: false }))
		const doc = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml')
		assert.equal(doc.getElementsByTagName('p:pic').length, 1)
		const pic = doc.getElementsByTagName('p:pic')[0]
		const off = pic.getElementsByTagName('a:off')[0]
		const ext = pic.getElementsByTagName('a:ext')[0]
		const rect = rectFromPixels(FRAME)
		assert.equal(Number(off.getAttribute('x')), Math.round(rect.x * 914400))
		assert.equal(Number(off.getAttribute('y')), Math.round(rect.y * 914400))
		assert.equal(Number(ext.getAttribute('cx')), Math.round(rect.w * 914400))
		assert.equal(Number(ext.getAttribute('cy')), Math.round(rect.h * 914400))
		assert.equal(pic.getElementsByTagName('a:effectLst').length, 0)
		assert.equal(pic.getElementsByTagName('a:prstGeom')[0].getAttribute('prst'), 'rect')
		assert.ok(Array.from(doc.getElementsByTagName('a:t')).some(node => node.textContent === 'ONE DECISION'))
		const images = Object.keys(zip.files).filter(name => /^ppt\/media\/.*\.png$/.test(name))
		assert.equal(images.length, 1)
		assert.deepEqual(await zip.file(images[0]).async('nodebuffer'), Buffer.from(IMAGE_DATA.split(',')[1], 'base64'))
		return pic.toString()
	}
	const signature = await inspect(entry)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' })).spec
	const image = exported.slides[0].content.find(block => block.kind === 'image-feature' || block.kind === 'image')
	assert.equal(image.role, 'background')
	assert.ok(image.imageOptions.source)
	assert.doesNotMatch(JSON.stringify(image), /_authoredImageSource|_imageSource|sourcePath|node_modules/)
	const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported, phase: 'commit', commitMode: 'createNew', detail: 'full' }))
	const replayEntry = getDeck(replayed.deckId)
	assert.equal(nativePicture(replayEntry).options.role, 'background')
	assert.equal(collectCompositionIssues(replayEntry).some(issue => issue.code === 'TEXT_VISUAL_OVERLAP'), false)
	assert.equal(await inspect(replayEntry), signature)
})

test('public foreground image overlap is returned as an AI-authoring diagnostic', async () => {
	const mcp = mcpFixture()
	const result = await mcp.call('betterpptx.deck.generate_from_spec', { spec: fixture('observatory', { role: 'image' }), phase: 'dryRun', detail: 'full' })
	assert.equal(result.ok, true, JSON.stringify(result.error || result))
	assert.ok(result.warnings.some(issue => issue.code === 'OBJECT_OVERLAP' && issue.severity === 'warning'))
	const input = fixture('observatory', { role: 'image' })
	input.slides[0].content[1].pixelFrame = { x: 10, y: 30, w: 420, h: 85 }
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: input, phase: 'commit', detail: 'full' }))
	const entry = getDeck(committed.deckId)
	assert.equal(nativePicture(entry).options.role, 'image')
	const text = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === 'headline')
	// Diagnostic mutation exercises post-materialization validation, not a fix.
	text.options.x = 4.8
	text.options.y = 2.5
	const design = dataOf(await mcp.call('betterpptx.deck.validate_design', { deckId: committed.deckId, profile: 'static', mode: 'strict', requireNarration: false, requireMotion: false }))
	assert.ok(design.issues.some(issue => issue.code === 'TEXT_VISUAL_OVERLAP'))
})
