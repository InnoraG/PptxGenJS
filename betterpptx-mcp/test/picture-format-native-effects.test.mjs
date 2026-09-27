import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'

import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const ONE_PIXEL_PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

test('picture serializes continuous border, effectLst, 3-D, and nested transparency controls', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: ONE_PIXEL_PNG,
		x: 1, y: 1, w: 4, h: 3,
		objectName: 'picture-format-maximal-canary',
		line: { color: '22D3EE', transparency: 25, width: 2, dashType: 'dash' },
		imageAdjustments: { transparency: 35 },
		blur: { radiusPt: 3, grow: true },
		fillOverlay: { blend: 'mult', fill: { color: '102A43', transparency: 30 } },
		glow: { color: '38BDF8', opacity: 0.42, size: 18 },
		shadow: { type: 'outer', color: '000000', opacity: 0.4, blur: 5, offset: 2, angle: 90 },
		reflection: { blur: 0.5, offset: 8, angle: 90, opacity: 0.28, endOpacity: 0, fadeStart: 0, fadeEnd: 55 },
		softEdges: { size: 2.5 },
		effect3D: {
			bevel: { type: 'angle', width: 7, height: 3.5 },
			bevelBottom: { type: 'angle', width: 7, height: 3.5 },
			extrusion: 21,
			extrusionColor: '203864',
			contourWidth: 1.5,
			contourColor: '8EA9DB',
			material: 'warmMatte',
			lightRig: 'threePt',
			rotationX: 12,
			rotationY: 8,
			perspective: 35,
		},
	})

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-picture-format-'))
	const fileName = path.join(outDir, 'picture-format-maximal-canary.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	const pictureSpPr = slideXml.slice(slideXml.indexOf('<p:spPr>'), slideXml.indexOf('</p:spPr>') + '</p:spPr>'.length)

	assert.match(slideXml, /<a:alphaModFix amt="65000"\/>/)
	assert.match(pictureSpPr, /<a:ln w="25400"[^>]*>/)
	assert.match(pictureSpPr, /<a:prstDash val="dash"\/>/)
	assert.match(pictureSpPr, /<a:prstDash val="dash"\/><a:miter lim="800000"\/>/)
	assert.match(pictureSpPr, /<a:effectLst><a:blur /)
	assert.match(pictureSpPr, /<a:fillOverlay blend="mult">/)
	assert.match(pictureSpPr, /<a:glow rad="228600">/)
	assert.match(pictureSpPr, /<a:outerShdw /)
	assert.match(pictureSpPr, /<a:reflection /)
	assert.match(pictureSpPr, /<a:softEdge rad="31750"\/>/)
	assert.match(pictureSpPr, /<a:sp3d extrusionH="266700" contourW="19050" prstMaterial="warmMatte">/)

	const order = ['<a:ln ', '<a:effectLst>', '<a:scene3d>', '<a:sp3d ', '</p:spPr>']
	let previous = -1
	for (const token of order) {
		const index = pictureSpPr.indexOf(token)
		assert.ok(index > previous, `${token} must follow the previous picture-format component`)
		previous = index
	}
	assert.equal((pictureSpPr.match(/<a:effectLst>/g) || []).length, 1)
})

test('picture corrections serialize native sharpness, saturation, and temperature with PowerPoint ranges', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: ONE_PIXEL_PNG,
		x: 1, y: 1, w: 4, h: 3,
		objectName: 'native-correction-canary',
		imageAdjustments: {
			brightness: 0.1,
			contrast: -0.2,
			sharpness: 0.5,
			saturation: 2,
			temperature: 3500,
		},
	})

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-picture-corrections-'))
	const fileName = path.join(outDir, 'native-picture-corrections.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /<a:lum bright="10000" contrast="-20000"\/>/)
	assert.doesNotMatch(slideXml, /contrast="-2500"/)
	assert.match(slideXml, /<a14:colorTemperature colorTemp="3500"\/>/)
	assert.match(slideXml, /<a14:saturation sat="200000"\/>/)
	assert.match(slideXml, /<a14:sharpenSoften amount="50000"\/>/)
	assert.ok(slideXml.indexOf('a14:colorTemperature') < slideXml.indexOf('a14:saturation'))
	assert.ok(slideXml.indexOf('a14:saturation') < slideXml.indexOf('a14:sharpenSoften'))
})

test('picture recolor serializes editable theme-aware duotone endpoints', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: ONE_PIXEL_PNG,
		x: 1, y: 1, w: 4, h: 3,
		objectName: 'native-recolor-canary',
		imageAdjustments: {
			colorMode: 'recolor',
			recolor: {
				dark: 'black',
				light: { scheme: 'accent4', tint: 0.45, saturation: 4 },
			},
		},
	})

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-picture-recolor-'))
	const fileName = path.join(outDir, 'native-picture-recolor.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /<a:duotone><a:prstClr val="black"\/><a:schemeClr val="accent4"><a:tint val="45000"\/><a:satMod val="400000"\/><\/a:schemeClr><\/a:duotone>/)
})

test('picture recolor preserves the complete DrawingML theme-color domain', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: ONE_PIXEL_PNG,
		x: 1, y: 1, w: 4, h: 3,
		objectName: 'native-full-theme-recolor-canary',
		imageAdjustments: {
			colorMode: 'recolor',
			recolor: {
				dark: { scheme: 'dk1', shade: 0.2, opacity: 0.85 },
				light: { scheme: 'hlink', tint: 0.25, saturation: 1.5, opacity: 0.7 },
			},
		},
	})

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-picture-theme-recolor-'))
	const fileName = path.join(outDir, 'native-picture-theme-recolor.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(slideXml, /<a:duotone><a:schemeClr val="dk1"><a:shade val="20000"\/><a:alpha val="85000"\/><\/a:schemeClr><a:schemeClr val="hlink"><a:tint val="25000"\/><a:satMod val="150000"\/><a:alpha val="70000"\/><\/a:schemeClr><\/a:duotone>/)
})

test('JSON spec style effects lower to the public add-image operation', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Picture Format structured authoring',
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 's1',
			title: 'Picture proof',
			message: 'Author continuous picture effects without selecting a preset.',
			layoutIntent: 'title-body',
			content: [{
				kind: 'image',
				name: 'hero-picture',
				data: ONE_PIXEL_PNG,
				rect: { x: 1, y: 1.5, w: 5, h: 3.5 },
				style: {
					line: { color: '22D3EE', width: 2, dash: 'dashDot' },
					effects: [
						{ type: 'glow', color: '38BDF8', opacity: 0.42, radiusPt: 18 },
						{ type: 'reflection', blurPt: 0.5, distancePt: 8, startOpacity: 0.28, endOpacity: 0, endPosition: 0.55 },
						{ type: 'softEdge', radiusPt: 2.5 },
					],
					effect3D: { bevel: { type: 'angle', width: 7, height: 3.5 }, extrusion: 4, material: 'warmMatte' },
				},
				imageAdjustments: {
					transparency: 35, sharpness: 0.35, saturation: 1.25, temperature: 5400,
					colorMode: 'recolor', recolor: { dark: 'black', light: { scheme: 'accent4', tint: 0.45, saturation: 4 } },
				},
			}],
		}],
	}, { plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_image' && item.objectName?.includes('hero-picture'))
	assert.ok(operation)
	assert.equal(operation.args.options.line.color, '22D3EE')
	assert.equal(operation.args.options.line.dashType, 'dashDot')
	assert.equal(operation.args.options.glow.size, 18)
	assert.equal(operation.args.options.reflection.offset, 8)
	assert.equal(operation.args.options.softEdges.size, 2.5)
	assert.equal(operation.args.options.effect3D.material, 'warmMatte')
	assert.equal(operation.args.options.imageAdjustments.transparency, 35)
	assert.equal(operation.args.options.transparency, 35)
	assert.equal(operation.args.options.imageAdjustments.sharpness, 0.35)
	assert.equal(operation.args.options.imageAdjustments.saturation, 1.25)
	assert.equal(operation.args.options.imageAdjustments.temperature, 5400)
	assert.equal(operation.args.options.imageAdjustments.colorMode, 'recolor')
	assert.deepEqual(operation.args.options.imageAdjustments.recolor.light, { scheme: 'accent4', tint: 0.45, saturation: 4 })
})

test('Picture Style preset expands to typed components with partial override, component reset, and full reset', async () => {
	const [{ createMcpToolDispatcher, getDeck }, { pictureStylePresetById }] = await Promise.all([
		import('../engine.mjs'),
		import('../picture-style-presets.mjs'),
	])
	const preset = pictureStylePresetById('picture-style-001')
	assert.ok(preset?.recipe?.pictureStyle?.effects?.length)
	const image = (name, pictureStyle) => ({
		kind: 'image', name, data: ONE_PIXEL_PNG, pictureStylePresetId: preset.id, noFrame: true,
		...(Object.prototype.hasOwnProperty.call({ pictureStyle }, 'pictureStyle') ? { pictureStyle } : {}),
	})
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Expanded Picture Style authoring',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'authors', outcome: 'Prove preset-plus-parameter authoring and reset.', remember: 'Picture Styles are structured.' },
		visualDesign: { world: 'Meridian', framing: 'one native picture per slide' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		layout: 'LAYOUT_WIDE',
		slides: [
			{ id: 'override', title: 'Line override', message: 'One slider changes while other preset components remain.', layoutIntent: 'title-body', content: [image('override-picture', { line: { widthPt: 3.25 } })] },
			{ id: 'component-reset', title: 'Effect reset', message: 'Only the effect stack is reset.', layoutIntent: 'title-body', content: [image('effect-reset-picture', { effects: null })] },
			{ id: 'full-reset', title: 'Full reset', message: 'The complete Picture Style is reset.', layoutIntent: 'title-body', content: [image('full-reset-picture', null)] },
		],
	}
	const dryPlan = buildSpecOperationPlan(spec, { plan: 'premium' })
	const dryImages = dryPlan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_image')
	assert.equal(dryImages.length, 3)
	assert.deepEqual(dryImages[0].args.options.pictureStyle, { line: { widthPt: 3.25 } })
	assert.deepEqual(dryImages[1].args.options.pictureStyle, { effects: null })
	assert.equal(dryImages[2].args.options.pictureStyle, null)

	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `picture-style-expanded-${Date.now()}` })
	const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'picture-style-expanded-proof' } }
	const generated = await mcp.call('betterpptx.deck.generate_from_spec', { mode: 'expressive', spec }, context)
	assert.equal(generated.ok, true, JSON.stringify(generated))
	const entry = getDeck(generated.data.deckId)
	const pictures = entry.pptx.slides.map(slide => slide._slideObjects.find(object => object?._type === 'image'))
	assert.ok(pictures.every(Boolean))
	assert.equal(pictures[0].options.pictureStyle.line.widthPt, 3.25)
	assert.equal(pictures[0].options.pictureStyle.line.cap, preset.recipe.pictureStyle.line.cap)
	assert.deepEqual(pictures[0].options.pictureStyle.geometry, preset.recipe.pictureStyle.geometry)
	assert.equal(pictures[1].options.pictureStyle.effects, null)
	assert.deepEqual(pictures[1].options.pictureStyle.line, preset.recipe.pictureStyle.line)
	assert.equal(pictures[2].options.pictureStyle, undefined)
	for (const picture of pictures) assert.deepEqual(Object.keys(picture.options).filter(key => key.startsWith('_raw')), [])

	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-picture-style-expanded-'))
	const fileName = path.join(outDir, 'picture-style-expanded-reset.pptx')
	await entry.pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const pictureSpPr = async slideNumber => {
		const xml = await zip.file(`ppt/slides/slide${slideNumber}.xml`).async('string')
		const match = xml.match(/<p:pic>[\s\S]*?<p:spPr>([\s\S]*?)<\/p:spPr>[\s\S]*?<\/p:pic>/)
		assert.ok(match, `slide ${slideNumber} picture spPr`)
		return match[1]
	}
	assert.match(await pictureSpPr(1), /<a:ln w="41275"/)
	assert.match(await pictureSpPr(1), /<a:effectLst /)
	assert.doesNotMatch(await pictureSpPr(2), /<a:effectLst/)
	assert.doesNotMatch(await pictureSpPr(3), /<a:(?:solidFill|ln|effectLst|scene3d|sp3d)\b/)
})

test('effects empty-array reset clears a captured Picture Style effect list during execution', async () => {
	const [{ createMcpToolDispatcher, getDeck }, { PICTURE_STYLE_PRESETS }] = await Promise.all([
		import('../engine.mjs'),
		import('../picture-style-presets.mjs'),
	])
	const preset = PICTURE_STYLE_PRESETS.find(item => item.recipe._rawEffectLstXml)
	assert.ok(preset)
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Picture effect reset',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'reviewers', outcome: 'Prove picture effect reset.', remember: 'The preset effect is removable.' },
		visualDesign: { world: 'Luxe investment committee', framing: 'one native picture' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 's1', title: 'Reset proof', role: 'proof', message: 'The native effect list is removed.', layoutIntent: 'title-body',
			content: [{ kind: 'image', name: 'reset-picture', data: ONE_PIXEL_PNG, pictureStylePresetId: preset.id, style: { effects: [] } }],
		}],
	}
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `picture-reset-${Date.now()}` })
	const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'picture-format-reset-proof' } }
	const generated = await mcp.call('betterpptx.deck.generate_from_spec', { mode: 'expressive', spec }, context)
	assert.equal(generated.ok, true, JSON.stringify(generated))
	const image = getDeck(generated.data.deckId).pptx.slides[0]._slideObjects.find(object => object?._type === 'image')
	assert.ok(image)
	assert.equal(image.options._rawEffectLstXml, undefined)
	for (const key of ['shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay']) assert.equal(image.options[key], undefined)
})
