import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ARTISTIC_EFFECT_PARAMETER_CATALOG, normalizeArtisticEffect } from '../ir/native-visual-primitives.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const JSZip = require('jszip')

const CASES = [
	['blur', { radius: 18 }, 'artisticBlur radius="18"'],
	['brightnessContrast', { brightness: -0.25, contrast: 0.35 }, 'brightnessContrast bright="-25000" contrast="35000"'],
	['cement', { transparency: 0.42, crackSpacing: 31 }, 'artisticCement trans="42000" crackSpacing="31"'],
	['crisscrossEtching', { transparency: 0.42, pressure: 17 }, 'artisticCrisscrossEtching trans="42000" pressure="17"'],
	['chalkSketch', { transparency: 0.42, pressure: 3 }, 'artisticChalkSketch trans="42000" pressure="3"'],
	['cutout', { transparency: 0.42, numberOfShades: 5 }, 'artisticCutout trans="42000" numberOfShades="5"'],
	['filmGrain', { transparency: 0.42, grainSize: 27 }, 'artisticFilmGrain trans="42000" grainSize="27"'],
	['glass', { transparency: 0.42, scaling: 61 }, 'artisticGlass trans="42000" scaling="61"'],
	['glowDiffused', { transparency: 0.42, intensity: 8 }, 'artisticGlowDiffused trans="42000" intensity="8"'],
	['glowEdges', { transparency: 0.42, smoothness: 7 }, 'artisticGlowEdges trans="42000" smoothness="7"'],
	['lightScreen', { transparency: 0.42, gridSize: 6 }, 'artisticLightScreen trans="42000" gridSize="6"'],
	['lineDrawing', { transparency: 0.42, pencilSize: 4 }, 'artisticLineDrawing trans="42000" pencilSize="4"'],
	['marker', { transparency: 0.42, size: 63 }, 'artisticMarker trans="42000" size="63"'],
	['mosaicBubbles', { transparency: 0.42, pressure: 17 }, 'artisticMosiaicBubbles trans="42000" pressure="17"'],
	['paintBrush', { transparency: 0.42, brushSize: 4 }, 'artisticPaintBrush trans="42000" brushSize="4"'],
	['paintStrokes', { transparency: 0.42, intensity: 8 }, 'artisticPaintStrokes trans="42000" intensity="8"'],
	['pastelsSmooth', { transparency: 0.42, scaling: 61 }, 'artisticPastelsSmooth trans="42000" scaling="61"'],
	['pencilGrayscale', { transparency: 0.42, pencilSize: 4 }, 'artisticPencilGrayscale trans="42000" pencilSize="4"'],
	['pencilSketch', { transparency: 0.42, pressure: 17 }, 'artisticPencilSketch trans="42000" pressure="17"'],
	['photocopy', { transparency: 0.42, detail: 5 }, 'artisticPhotocopy trans="42000" detail="5"'],
	['plasticWrap', { transparency: 0.42, smoothness: 7 }, 'artisticPlasticWrap trans="42000" smoothness="7"'],
	['texturizer', { transparency: 0.42, scaling: 61 }, 'artisticTexturizer trans="42000" scaling="61"'],
	['watercolorSponge', { transparency: 0.42, brushSize: 4 }, 'artisticWatercolorSponge trans="42000" brushSize="4"'],
]

test('all persistent Artistic Effects sliders serialize with PowerPoint-authored attribute names', async () => {
	const image = await fs.readFile(path.resolve('betterpptx-mcp/assets/default-presenter-joe.png'))
	const pptx = new PptxGenJS()
	for (const [type, parameters] of CASES) {
		const slide = pptx.addSlide()
		slide.addImage({
			data: `image/png;base64,${image.toString('base64')}`,
			x: 1, y: 1, w: 3, h: 3, objectName: `artistic.${type}`,
			imageAdjustments: { artisticEffect: { type, ...parameters } },
		})
	}
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-artistic-parameters-'))
	const fileName = path.join(outDir, 'artistic-parameters.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const contentTypes = await zip.file('[Content_Types].xml').async('string')
	assert.match(contentTypes, /Extension="wdp" ContentType="image\/vnd\.ms-photo"/)
	assert.equal(Object.keys(zip.files).filter(name => /ppt\/media\/.*\.wdp$/i.test(name)).length, CASES.length)
	for (let index = 0; index < CASES.length; index++) {
		const xml = await zip.file(`ppt/slides/slide${index + 1}.xml`).async('string')
		const rels = await zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`).async('string')
		assert.match(xml, new RegExp(`<a14:${CASES[index][2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\/>`), CASES[index][0])
		const visibleRid = /<a:blip r:embed="(rId\d+)"/.exec(xml)?.[1]
		const nativeRid = /<a14:imgLayer r:embed="(rId\d+)"/.exec(xml)?.[1]
		assert.ok(visibleRid, `${CASES[index][0]} visible image relationship`)
		assert.ok(nativeRid, `${CASES[index][0]} native HD Photo relationship`)
		assert.notEqual(nativeRid, visibleRid, `${CASES[index][0]} uses a distinct editable-original layer`)
		assert.match(rels, new RegExp(`Id="${nativeRid}" Type="http://schemas\\.microsoft\\.com/office/2007/relationships/hdphoto" Target="[^"]+\\.wdp"`))
		const nativeTarget = new RegExp(`Id="${nativeRid}"[^>]+Target="([^"]+)"`).exec(rels)?.[1]
		const nativePart = nativeTarget ? `ppt/${nativeTarget.replace(/^\.\.\//, '')}` : ''
		const nativeBytes = nativePart ? await zip.file(nativePart)?.async('nodebuffer') : null
		assert.ok(nativeBytes?.length > 4, `${CASES[index][0]} WDP package payload`)
		assert.deepEqual([...nativeBytes.subarray(0, 4)], [0x49, 0x49, 0xbc, 0x01], `${CASES[index][0]} HD Photo signature`)
	}
})

test('layered picture corrections retain an editable HD Photo source and rendered preview', async () => {
	const image = await fs.readFile(path.resolve('betterpptx-mcp/assets/default-presenter-joe.png'))
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addImage({
		data: `image/png;base64,${image.toString('base64')}`,
		x: 1, y: 1, w: 3, h: 3,
		imageAdjustments: { temperature: 4200, saturation: 1.5, sharpness: 0.35 },
	})
	const bytes = await pptx.write({ outputType: 'nodebuffer' })
	const zip = await JSZip.loadAsync(bytes)
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
	assert.doesNotMatch(xml, /a14:artistic/)
	assert.match(xml, /a14:colorTemperature colorTemp="4200"/)
	assert.match(xml, /a14:saturation sat="150000"/)
	assert.match(xml, /a14:sharpenSoften amount="35000"/)
	assert.match(rels, /relationships\/hdphoto/)
	assert.equal(Object.keys(zip.files).filter(name => /\.wdp$/i.test(name)).length, 1)
	const nativeTarget = rels.match(/relationships\/hdphoto" Target="\.\.\/media\/([^"]+)"/)?.[1]
	const nativeBytes = nativeTarget ? await zip.file(`ppt/media/${nativeTarget}`)?.async('nodebuffer') : null
	assert.deepEqual([...nativeBytes.subarray(0, 4)], [0x49, 0x49, 0xbc, 0x01])
})

test('artistic parameter catalog is exhaustive and the normalizer clamps every slider', () => {
	assert.equal(Object.keys(ARTISTIC_EFFECT_PARAMETER_CATALOG).length, CASES.length)
	for (const [type] of CASES) {
		const parameters = ARTISTIC_EFFECT_PARAMETER_CATALOG[type]
		assert.ok(parameters?.length, type)
		const authored = { type, parameters: Object.fromEntries(parameters.map(parameter => [parameter.id, parameter.maximum + 1000])) }
		const normalized = normalizeArtisticEffect(authored)
		assert.equal(normalized.type, type)
		for (const parameter of parameters) assert.equal(normalized[parameter.id], parameter.maximum, `${type}.${parameter.id}`)
	}
	assert.deepEqual(normalizeArtisticEffect({ type: 'paintStrokes', trans: 5000, intensity: 9 }), { type: 'paintStrokes', transparency: 0.05, intensity: 9 })
	assert.throws(() => normalizeArtisticEffect({ type: 'imaginaryFilter', sparkle: 99 }), /must be one of/)
})

test('public JSON-spec authoring saves a native editable Artistic Effect deck', async () => {
	const { createMcpToolDispatcher } = await import('../engine.mjs')
	const image = await fs.readFile(path.resolve('betterpptx-mcp/assets/default-presenter-joe.png'))
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-public-artistic-'))
	const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'public-artistic-effect-proof' } }
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `public-artistic-${Date.now()}` })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native Artistic Effect public proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.',
		},
		contentStory: { audience: 'presentation authors', outcome: 'Prove native artistic-effect authoring.', remember: 'JSON controls remain editable in PowerPoint.' },
		visualDesign: { world: 'observatory', framing: 'title, concise proof statement, and one hero picture' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'artistic-proof', title: 'Native paint strokes', message: 'The public JSON spec controls the persistent sliders.', layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'proof-title', text: 'Native paint strokes' },
				{ kind: 'body', name: 'proof-body', text: 'Editable type, intensity, and transparency — not a flattened slide.' },
				{
					kind: 'image', name: 'artistic-hero', region: 'hero',
					data: `image/png;base64,${image.toString('base64')}`,
					imageAdjustments: { artisticEffect: { type: 'paintStrokes', intensity: 8, transparency: 0.2 } },
				},
			],
		}],
	}
	const generated = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'summary',
	}, context)
	assert.equal(generated.ok, true, JSON.stringify(generated))
	const deckId = generated.data.deckId
	try {
		const quality = await mcp.call('betterpptx.deck.validate_quality', { deckId, profile: 'modern' }, context)
		assert.equal(quality.ok, true, JSON.stringify(quality))
		const saved = await mcp.call('betterpptx.deck.save', { deckId, outputDir, fileName: 'public-artistic-effect.pptx' }, context)
		assert.equal(saved.ok, true, JSON.stringify(saved))
		const zip = await JSZip.loadAsync(await fs.readFile(path.join(outputDir, 'public-artistic-effect.pptx')))
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
		assert.match(slideXml, /<a14:artisticPaintStrokes trans="20000" intensity="8"\/>/)
		assert.match(relsXml, /relationships\/hdphoto/)
		assert.ok(Object.keys(zip.files).some(name => /ppt\/media\/.*\.wdp$/i.test(name)))
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId }, context)
	}
})
