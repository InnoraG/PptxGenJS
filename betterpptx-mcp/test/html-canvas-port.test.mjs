import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { TOOL_SCHEMA_VERSION } from '../public-manifest.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { lowerHtmlSlide } = await import('../ir/html-slide-compiler.mjs')
const { buildSpecOperationPlan } = await import('../ir/spec-compiler.mjs')

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const canvasHtml = `<!DOCTYPE html><html><body>
<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1" data-duration="4000" data-transition="fade" data-title="Canvas">
  <div class="slide-canvas">
    <img class="layer picture content-image" src="images/hero.png" alt="Hero" style="left:80px;top:60px;width:400px;height:300px"/>
    <div class="layer text-shape" data-text="Hello stage" style="left:120px;top:80px;width:600px;height:80px"><span style="color:#67e8f9;font-size:48px">Hello stage</span></div>
  </div>
</section>
</body></html>`

function directorShell(extra = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Canvas port',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'reviewers', outcome: 'Port the HTML canvas', remember: 'Engine-owned stage geometry' },
		visualDesign: { world: 'luxe', framing: 'fixed 16:9 HTML canvas stage' },
		motionTime: { masterClock: 'authored', timingSource: 'html-stage autoplay' },
		...extra,
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

test('explicit secondary htmlConversion accepts HTML canvas without authored coordinates', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-canvas-${Date.now()}` })
	const uploaded = dataOf(await mcp.call('betterpptx.assets.upload', {
		kind: 'image',
		fileName: 'hero.png',
		data: `data:image/png;base64,${PNG.toString('base64')}`,
	}))
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
		spec: directorShell({ htmlConversion: {
			html: canvasHtml,
			assetMap: { 'images/hero.png': uploaded.asset?.handle || uploaded.handle },
		} }),
	})
	const data = dataOf(result)
	assert.equal(data.authoringRoute?.id, 'htmlConversion-secondary')
	assert.equal(data.authoringRoute?.g6bAiReconstructionEligible, false)
	assert.ok(!JSON.stringify(data).includes('DIRECTOR_ENGINE_PLACEMENT_REQUIRED'))
	assert.ok((data.slides || data.plan?.slides || []).length >= 1 || (data.operations || []).length > 0)
})

test('hand-authored coordinates are still rejected on a Director spec', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-canvas-reject-${Date.now()}` })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({
			slides: [{
				id: 's1',
				title: 'One',
				layoutIntent: 'hero',
				content: [{ kind: 'textBox', name: 't', text: 'Hello', x: 1, y: 1, w: 4, h: 1 }],
			}],
		}),
	})
	assert.equal(result?.ok, false)
	const blob = JSON.stringify(result)
	assert.match(blob, /DIRECTOR_ENGINE_PLACEMENT_REQUIRED/)
})

test('trusted export_spec roundtrip may preserve native geometry', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-canvas-roundtrip-${Date.now()}` })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({
			authoringContract: {
				workflow: 'authoring-excellence-director-v1',
				level: 'roundtrip',
				source: 'deck.export_spec',
				importedGeometryPolicy: 'preserve-native-geometry',
			},
			slides: [{
				id: 's1',
				title: 'One',
				layoutIntent: 'hero',
				content: [{ kind: 'textBox', name: 't', text: 'Hello', x: 1, y: 1, w: 4, h: 1 }],
			}],
		}),
	})
	const blob = JSON.stringify(result)
	assert.doesNotMatch(blob, /DIRECTOR_ENGINE_PLACEMENT_REQUIRED/)
	assert.equal(result?.ok, true, blob)
})

test('htmlPackage zip is unpacked into HTML plus locked image handles', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-canvas-zip-${Date.now()}` })
	const zip = new JSZip()
	zip.file('index.html', canvasHtml)
	zip.file('images/hero.png', PNG)
	const bytes = await zip.generateAsync({ type: 'nodebuffer' })
	const uploaded = dataOf(await mcp.call('betterpptx.assets.upload', {
		kind: 'htmlPackage',
		fileName: 'original.zip',
		data: `data:application/zip;base64,${bytes.toString('base64')}`,
	}))
	const handle = uploaded.asset?.handle || uploaded.handle
	assert.match(String(handle || ''), /^asset:\/\//)
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({ htmlConversion: { package: handle } }),
	})
	const blob = JSON.stringify(dataOf(result))
	assert.doesNotMatch(blob, /DIRECTOR_ENGINE_PLACEMENT_REQUIRED/)
	assert.doesNotMatch(blob, /HTML_PACKAGE/)
})

test('principal visualReference route is separate and G6B eligible', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `visual-reference-${Date.now()}` })
	const result = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
		spec: directorShell({
			visualReference: {
				schemaVersion: 'betterpptx.visual-reference-reconstruction.v1',
				mode: 'ai-reconstructed-native',
				coordinateMode: 'pixels',
				representationPolicy: 'native-except-media',
				viewport: { width: 1600, height: 900 },
				mediaAssets: [],
			},
			slides: [{
				id: 's1',
				title: 'Native reconstruction',
				content: [
					{ kind: 'shape', name: 'panel', role: 'decorative', shapeName: 'roundRect', pixelFrame: { x: 80, y: 80, w: 1440, h: 740 }, style: { fill: { color: '13213A' }, line: { color: '4D88FF' } } },
					{ kind: 'textBox', name: 'headline', text: 'AI reconstruction', pixelFrame: { x: 160, y: 140, w: 900, h: 120 }, style: { fontSize: 42, color: 'FFFFFF' } },
				],
			}],
		}),
	}))
	assert.equal(result.authoringRoute?.id, 'visualReference-ai')
	assert.equal(result.authoringRoute?.principal, true)
	assert.equal(result.authoringRoute?.g6bAiReconstructionEligible, true)
	assert.equal(result.visualReference?.mode, 'ai-reconstructed-native')
})

test('visualReference and htmlConversion cannot be combined', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `route-conflict-${Date.now()}` })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({
			visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 } },
			htmlConversion: { html: canvasHtml },
			slides: [],
		}),
	})
	assert.equal(result.ok, false)
	assert.match(JSON.stringify(result), /AUTHORING_MODE_CONFLICT/)
})

test('legacy direct HTML fields are rejected with both supported routes explained', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `legacy-html-reject-${Date.now()}` })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({ html: canvasHtml }),
	})
	assert.equal(result.ok, false)
	assert.match(JSON.stringify(result), /visualReference/)
	assert.match(JSON.stringify(result), /htmlConversion/)
})

test('native package validation binds route provenance and keeps HTML conversion G6B-ineligible', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `route-proof-${Date.now()}` })
	const visualSpec = directorShell({
		visualReference: {
			schemaVersion: 'betterpptx.visual-reference-reconstruction.v1',
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media',
			viewport: { width: 1600, height: 900 }, mediaAssets: [],
		},
		slides: [{ id: 's1', title: 'Native proof', content: [
			{ kind: 'textBox', name: 'headline', text: 'Package-backed native proof', pixelFrame: { x: 120, y: 100, w: 900, h: 120 }, style: { fontSize: 36, color: '172033' } },
			{ kind: 'shape', name: 'accent', role: 'decorative', shapeName: 'rect', pixelFrame: { x: 120, y: 280, w: 600, h: 20 }, style: { fill: { color: '4D88FF' }, line: { transparency: 100 } } },
		] }],
	})
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', plan: 'premium', spec: visualSpec }))
	const native = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId }))
	assert.equal(native.ok, true)
	assert.equal(native.authoringRoute?.id, 'visualReference-ai')
	assert.equal(native.packageAudit?.ok, true)
	assert.ok(native.packageAudit?.actual?.text >= 1)
	assert.ok(native.packageAudit?.actual?.shape >= 1)
	const g6b = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: committed.deckId, profile: 'g6b-ai-reconstruction' }))
	assert.equal(g6b.ok, false)
	assert.ok(g6b.issues.some(item => item.code === 'POWERPOINT_REOPEN_REQUIRED'))
	assert.ok(!g6b.issues.some(item => item.code === 'G6B_NATIVE_PACKAGE_PROOF_REQUIRED'))

	const converted = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'commit', commitMode: 'createNew', plan: 'premium',
		spec: directorShell({ htmlConversion: { html: '<section class="slide" data-title="Converted"><h1>Converted</h1></section>' } }),
	}))
	const rejected = dataOf(await mcp.call('betterpptx.deck.validate_native_visuals', { deckId: converted.deckId, requireAiReconstructionRoute: true }))
	assert.equal(rejected.ok, false)
	assert.ok(rejected.issues.some(item => item.code === 'G6B_AI_RECONSTRUCTION_ROUTE_REQUIRED'))
})

test('HTML lowering validates the public input before generating decorative vector objects', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-decorative-vector-${Date.now()}` })
	const html = `<!DOCTYPE html><html><body>
	<style>:root{--stage-w:1600px;--stage-h:900px}</style>
	<section class="slide" id="slide-1" data-title="Vector atmosphere">
	  <svg viewBox="0 0 1600 900" aria-label="Decorative orbit">
	    <path d="M 120 450 C 420 80 1180 80 1480 450" fill="none" stroke="#67e8f9" stroke-width="8"/>
	  </svg>
	  <h1>Native vector atmosphere</h1>
	</section>
	</body></html>`
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({ htmlConversion: { html }, validation: { requireAccessibility: true } }),
	})
	const data = dataOf(result)
	assert.ok(data.htmlConversion?.loweringManifest)
	assert.ok((data.objectCount || data.slides?.[0]?.objects?.length || 0) >= 1)
	assert.doesNotMatch(JSON.stringify(data), /not part of the public structural contract/)
})

test('filtered HTML atmosphere stays a background plus isolated fallback, not opaque custom geometry', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-filtered-atmosphere-${Date.now()}` })
	const html = `<!DOCTYPE html><html><body>
	<style>:root{--stage-w:1600px;--stage-h:900px}.slide{background:#111020}</style>
	<section class="slide" id="slide-1" data-title="Filtered atmosphere">
	  <svg class="layer native-background" data-kind="native-background" viewBox="0 0 1600 900" style="left:0;top:0;width:1600px;height:900px">
	    <defs>
	      <linearGradient id="g"><stop offset="0" stop-color="#111020"/><stop offset="1" stop-color="#241a45"/></linearGradient>
	      <filter id="f"><feTurbulence baseFrequency=".01"/></filter>
	    </defs>
	    <rect width="1600" height="900" fill="url(#g)"/>
	    <circle cx="1300" cy="120" r="360" fill="#241a45" filter="url(#f)"/>
	    <circle cx="220" cy="160" r="2" fill="#ffffff" opacity=".4"/>
	    <path d="M-80 820 C340 690 720 1000 1680 700" fill="none" stroke="#67e8f9" stroke-opacity=".055" stroke-width="2"/>
	    <rect width="1600" height="900" fill="none" stroke="#000000" stroke-opacity=".18" stroke-width="70"/>
	  </svg>
	  <h1>Filtered atmosphere</h1>
	</section>
	</body></html>`
	const data = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
		spec: directorShell({ htmlConversion: { html }, validation: { requireAccessibility: true } }),
	}))
	assert.equal(data.htmlConversion?.loweringManifest?.nativeBackgrounds, 1)
	assert.ok(data.htmlConversion?.loweringManifest?.fallbacks?.some(item => item.needsIsolatedRaster === true))
	assert.ok(!data.htmlConversion?.loweringManifest?.customDecisions?.some(item => item.sourceConcept === 'native-background-vectors'))
	assert.doesNotMatch(JSON.stringify(data), /not part of the public structural contract/)
	const slide = lowerHtmlSlide(html)
	assert.ok(slide.content.some(block => block.name?.startsWith('background-star') && block.shapeName === 'ellipse'))
	assert.ok(slide.content.some(block => block.name?.startsWith('background-curve') && block.kind === 'customGeometry'))
	assert.ok(!slide.content.some(block => block.name?.startsWith('background-frame')))
})

test('HTML canvas preserves native linear background gradients and CSS text-transform', () => {
	const html = `<!DOCTYPE html><html><body>
	<style>:root{--stage-w:1600px;--stage-h:900px}.hero{text-transform:uppercase;font-family:'Inter Display','Inter','Segoe UI',Arial,sans-serif;font-weight:900}</style>
	<section class="slide" id="slide-1" data-title="Faithful canvas">
	  <svg class="layer native-background" data-kind="native-background" viewBox="0 0 1600 900" style="left:0;top:0;width:1600px;height:900px">
	    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111020"/><stop offset="50%" stop-color="#241a45" stop-opacity=".8"/><stop offset="100%" stop-color="#0b0e16"/></linearGradient></defs>
	    <rect width="1600" height="900" fill="url(#g)"/>
	  </svg>
	  <div class="layer text-shape hero" style="left:80px;top:80px;width:1200px;height:100px;font-size:64px">Hello World</div>
	</section></body></html>`
	const slide = lowerHtmlSlide(html)
	assert.deepEqual(slide.background, {
		type: 'gradient',
		gradientDirection: 'linear',
		gradientAngle: 45,
		gradientStops: [
			{ position: 0, color: '111020' },
			{ position: 50, color: '241A45', transparency: 20 },
			{ position: 100, color: '0B0E16' },
		],
	})
	assert.equal(slide.content.find(block => block.kind === 'textBox')?.text, 'HELLO WORLD')
	assert.equal(slide.content.find(block => block.kind === 'textBox')?.style.fontSize, 33.92)
	assert.equal(slide.content.find(block => block.kind === 'textBox')?.style.fontFace, 'Arial Black')
	assert.equal(slide.content.find(block => block.kind === 'textBox')?.style.fit, 'none')
	assert.equal(slide.content.find(block => block.kind === 'textBox')?.style.wrap, false)
	assert.ok(!slide.content.some(block => block.kind === 'customGeometry'))
})

test('faithful HTML canvas does not receive world-invented headline reflection', () => {
	const html = `<!DOCTYPE html><html><body>
	<style>:root{--stage-w:1600px;--stage-h:900px}.hero{text-transform:uppercase;color:#f5ecd9;font-size:64px}</style>
	<section class="slide" id="slide-1" data-title="No invented reflection">
	  <div class="layer text-shape hero" style="left:80px;top:80px;width:1200px;height:100px">Original headline</div>
	</section></body></html>`
	const slide = lowerHtmlSlide(html)
	const spec = directorShell({
		authoringContract: { workflow: 'authoring-excellence-director-v1', htmlStagePolicy: 'preserve-canvas-geometry' },
		validation: { readabilityPolicy: 'faithful-html' },
		slides: [slide],
	})
	const plan = buildSpecOperationPlan(spec, { trustedHtmlLowering: true })
	const textOperation = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_text')
	assert.ok(textOperation)
	assert.equal(textOperation.args.options.reflection, undefined)
	assert.equal(textOperation.args.options.textGlow, undefined)
	assert.equal(textOperation.args.options.fit, 'none')
})

test('help.tool_recipe surface html advertises explicit secondary conversion', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-recipe-${Date.now()}` })
	const data = dataOf(await mcp.call('betterpptx.help.tool_recipe', { surface: 'html', detail: 'summary' }))
	assert.equal(data.unknownSurfaces?.length || 0, 0)
	const recipe = (data.recipes || []).find(item => item.surface === 'htmlConversion')
	assert.ok(recipe)
	assert.match(recipe.purpose, /secondary route/i)
	assert.match(recipe.primaryRoute, /visualReference AI reconstruction/i)
	assert.ok(recipe.sequence.some(step => step.tool === 'betterpptx.assets.upload'))
	assert.ok(recipe.sequence.some(step => step.tool === 'betterpptx.assets.inspect'))
	assert.ok(recipe.sequence.some(step => /spec\.htmlConversion/.test(String(step.when))))
})

test('help.tool_recipe surface animation teaches native object vocabulary not presenter IDs', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `anim-recipe-${Date.now()}` })
	const data = dataOf(await mcp.call('betterpptx.help.tool_recipe', { surface: 'animation', detail: 'summary' }))
	const recipe = (data.recipes || []).find(item => item.surface === 'animation')
	assert.ok(recipe)
	assert.match(String(recipe.purpose || ''), /object animation/i)
	assert.ok(recipe.objectAnimation.types.includes('entrance'))
	assert.ok(recipe.objectAnimation.effects.includes('wipe'))
	assert.match(String(recipe.objectAnimation.rule || ''), /AI authors/i)
	assert.doesNotMatch(JSON.stringify(recipe.sequence || []), /authoring\.catalog/)
})

const { publicToolList } = await import('../blackbox.mjs')
const { TOOLS } = await import('../tools.mjs')

test('assets.upload advertises a connector file parameter', () => {
	const listed = publicToolList(TOOLS, { fullSchemas: true })
	const upload = listed.find(tool => tool.name === 'betterpptx.assets.upload')
	assert.ok(upload)
	assert.deepEqual(upload._meta?.['openai/fileParams'], ['file'])
	assert.equal(upload.inputSchema?.properties?.file?.type, 'string')
	assert.ok(upload.inputSchema.properties.entryFile)
	assert.ok(upload.inputSchema.anyOf?.some(branch => branch.required?.includes('file')))
	assert.ok(upload.inputSchema.anyOf?.some(branch => branch.required?.includes('data')))
	assert.ok(upload.inputSchema.anyOf?.some(branch => branch.required?.includes('url')))
	assert.ok(listed.some(tool => tool.name === 'betterpptx.assets.inspect'))
})

test('assets.upload missing source returns CONNECTOR_FILE_MISSING', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-upload-missing-${Date.now()}` })
	const result = await mcp.call('betterpptx.assets.upload', { kind: 'htmlPackage', fileName: 'showcase.zip' })
	assert.equal(result?.ok, false)
	assert.equal(result.error?.code, 'CONNECTOR_FILE_MISSING')
	const accepted = result.error?.acceptedInputFields || result.error?.details?.acceptedInputFields
	assert.deepEqual(accepted, ['file', 'data', 'url'])
})

test('assets.upload sandbox path without host rewrite returns UNSUPPORTED_FILE_REFERENCE', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-upload-sandbox-${Date.now()}` })
	const result = await mcp.call('betterpptx.assets.upload', {
		kind: 'htmlPackage',
		file: '/mnt/data/betterpptxlatest_source/tiny.zip',
		fileName: 'tiny.zip',
		entryFile: 'index.html',
	})
	assert.equal(result?.ok, false)
	assert.equal(result.error?.code, 'UNSUPPORTED_FILE_REFERENCE')
})

test('assets.upload accepts a file data URI and inspects the htmlPackage', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-upload-file-uri-${Date.now()}` })
	const zip = new JSZip()
	zip.file('index.html', canvasHtml)
	zip.file('images/hero.png', PNG)
	zip.file('Narration_Granular_Cues.json', '{"cues":[]}')
	const bytes = await zip.generateAsync({ type: 'nodebuffer' })
	const uploaded = dataOf(await mcp.call('betterpptx.assets.upload', {
		kind: 'htmlPackage',
		fileName: 'tiny.zip',
		entryFile: 'index.html',
		file: `data:application/zip;base64,${bytes.toString('base64')}`,
	}))
	assert.match(String(uploaded.handle || ''), /^asset:\/\//)
	assert.equal(uploaded.entryFile, 'index.html')
	assert.equal(uploaded.images, 1)
	assert.equal(uploaded.detectedSlides, 1)
	assert.ok(uploaded.sidecars.some(name => /Narration_Granular_Cues/i.test(name)))
	const inspected = dataOf(await mcp.call('betterpptx.assets.inspect', { handle: uploaded.handle, entryFile: 'index.html' }))
	assert.equal(inspected.images, 1)
	assert.equal(inspected.relativeAssetsResolved, true)
	assert.equal(inspected.htmlViewport?.width, 1600)
	const compiled = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({
			htmlConversion: { package: {
				handle: uploaded.handle,
				entryFile: 'index.html',
				viewport: { width: 1600, height: 900 },
			} },
		}),
	}))
	assert.ok(compiled.htmlConversion?.loweringManifest)
	assert.equal(compiled.htmlConversion.loweringManifest.slideCount, 1)
	assert.ok(compiled.planId)
	assert.equal(compiled.planId, compiled.lockedPlanDigest || compiled.planDigest || compiled.estimatedPlanDigest)
	assert.ok(compiled.htmlConversion.loweringManifest.nativeImages >= 1 || compiled.htmlConversion.loweringManifest.nativeTextShapes >= 1 || compiled.htmlConversion.loweringManifest.nativeTextBoxes >= 1)
	assert.doesNotMatch(JSON.stringify(compiled), /DIRECTOR_ENGINE_PLACEMENT_REQUIRED/)
})

test('visualReference recipe includes a copyable principal-route example', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `visual-recipe-${Date.now()}` })
	const help = dataOf(await mcp.call('betterpptx.help.tool_recipe', { surface: 'visualReference', detail: 'summary' }))
	const recipe = (help.recipes || []).find(item => item.surface === 'visualReference')
	assert.ok(recipe?.example?.spec?.visualReference)
	assert.equal(recipe.nativeFirst?.mode, 'ai-reconstructed-native')
	assert.ok(recipe.nativeFirst?.forbiddenRepresentations?.includes('html-lowering'))
	const dryRun = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', recipe.example))
	assert.equal(dryRun.authoringRoute?.id, 'visualReference-ai')
})

test('portable jsonSpec upload compiles by handle and exports exact authored provenance', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `jsonspec-portable-${Date.now()}` })
	const spec = directorShell({
		title: 'Portable source',
		slides: [{
			id: 'portable-1',
			title: 'Portable source',
			role: 'section-opener',
			message: 'The JSON spec is reusable authoring source.',
			layoutIntent: 'hero',
			content: [{ kind: 'textBox', name: 'claim', text: 'Portable presentation source' }],
		}],
	})
	const raw = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`, 'utf8')
	const uploaded = dataOf(await mcp.call('betterpptx.assets.upload', {
		kind: 'jsonSpec',
		fileName: 'portable.betterpptx-spec.json',
		data: `data:application/json;base64,${raw.toString('base64')}`,
	}))
	assert.match(uploaded.handle, /^asset:\/\/locked\/uploaded-jsonspec\//)
	assert.equal(uploaded.slideCount, 1)
	assert.equal(uploaded.rawBytes, raw.length)
	assert.match(uploaded.rawSha256, /^[a-f0-9]{64}$/)
	assert.match(uploaded.canonicalSha256, /^[a-f0-9]{64}$/)
	const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		specHandle: uploaded.handle,
	}))
	assert.equal(dry.specProvenance?.submitted?.sourceKind, 'uploaded-jsonspec')
	assert.equal(dry.specProvenance?.submitted?.rawSubmissionSha256, uploaded.rawSha256)
	assert.equal(dry.specProvenance?.submitted?.sha256, uploaded.canonicalSha256)
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'commit',
		commitMode: 'createNew',
		specHandle: uploaded.handle,
		plan: 'premium',
	}))
	assert.ok(committed.deckId)
	assert.equal(committed.specProvenance?.submitted?.sha256, uploaded.canonicalSha256)
	const authored = dataOf(await mcp.call('betterpptx.deck.export_spec', {
		deckId: committed.deckId,
		mode: 'authoredInput',
	}))
	assert.deepEqual(authored.spec, spec)
	assert.equal(authored.specArtifact.sha256, uploaded.canonicalSha256)
	assert.equal(authored.privacy.storageDetailsIncluded, false)
	assert.doesNotMatch(JSON.stringify(authored), /"localPath"\s*:|"provider"\s*:|"objectName"\s*:/i)
})

test('status reports both authoring routes without build internals', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-status-${Date.now()}` })
	const data = dataOf(await mcp.call('betterpptx.status', {}))
	assert.equal(data.uploadAvailable, true)
	assert.equal(data.inspectAvailable, true)
	assert.equal(data.visualReferenceRecipeAvailable, true)
	assert.equal(data.htmlConversionRecipeAvailable, true)
	assert.equal(data.authoringRoutes?.principal, 'visualReference-ai')
	assert.equal(data.authoringRoutes?.secondary, 'htmlConversion-secondary')
	assert.equal(data.uploadSchema?.file, true)
	assert.equal(data.toolSchemaVersion, TOOL_SCHEMA_VERSION)
	assert.notEqual(data.semanticVersion, 'current')
	assert.equal(data.buildSha, undefined)
	assert.equal(data.capabilityDigest, undefined)
	assert.equal(data.toolsRegistered, undefined)
	assert.equal(data.deckSession?.recentTool, 'betterpptx.deck.recent')
	assert.equal(data.deckSession?.pinUntilSave, true)
})

test('private HTML-lowering fields are rejected from the public structural contract', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-svg-fail-${Date.now()}` })
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		commitMode: 'createNew',
		spec: directorShell({
			authoringContract: {
				workflow: 'authoring-excellence-director-v1',
				htmlStagePolicy: 'preserve-canvas-geometry',
			},
			slides: [{
				id: 's1',
				title: 'Broken vector',
				layoutIntent: 'hero',
				htmlCanvas: true,
				content: [{
					kind: 'customGeometry',
					name: 'photo-as-svg',
					svg: '<img src="images/hero.png" alt="Hero"/>',
					keep: true,
					decorative: true,
					_engineOwnedGeometry: true,
					_engineRect: { x: 0.5, y: 0.5, w: 4, h: 3 },
				}],
			}],
		}),
	})
	assert.equal(result?.ok, false)
	const blob = JSON.stringify(result)
	assert.match(blob, /not part of the public structural contract/)
})

test('deck.recent is a public lookup for active deck handles', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-recent-${Date.now()}` })
	const listed = dataOf(await mcp.call('betterpptx.deck.recent', {}))
	assert.equal(listed.pinUntilSave, true)
	assert.ok(Array.isArray(listed.decks))
	const ops = dataOf(await mcp.call('betterpptx.operation.recent', {}))
	assert.ok(Array.isArray(ops.operations))
})

test('status and capabilities expose public capability discovery without runtime internals', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `html-discovery-${Date.now()}` })
	const status = dataOf(await mcp.call('betterpptx.status', {}))
	const discovery = status.capabilityDiscovery || status.releaseInfrastructure?.capabilityDiscovery
	const capabilities = dataOf(await mcp.call('betterpptx.help.capabilities', { detail: 'summary' }))
	const fromHelp = capabilities.capabilityDiscovery
	const facts = discovery || fromHelp
	assert.ok(facts)
	assert.equal(facts.discoverWith, 'betterpptx.help.capabilities')
	assert.ok(Array.isArray(facts.callableTools))
	assert.ok(facts.callableTools.includes('betterpptx.deck.generate_from_spec'))
	assert.equal(facts.registeredOnServer, undefined)
	assert.equal(facts.loadedByHost, undefined)
	assert.equal(facts.plannedCapabilities, undefined)
	assert.equal(capabilities.authoringPrinciples?.portableJsonSpec?.schemaVersion, 'betterpptx.deck-spec.v1')
	assert.match(String(capabilities.authoringPrinciples?.portableJsonSpec?.rule || ''), /attached.*portable presentation source/i)
	assert.match(String(capabilities.authoringPrinciples?.portableJsonSpec?.publication || ''), /explicit permission/i)
	assert.ok(capabilities.authoringApi?.portableJsonSpec?.importRoute?.some(step => /jsonSpec/i.test(step)))
	assert.deepEqual(capabilities.authoringApi?.portableJsonSpec?.exportModes, ['authoredInput', 'effectivePrecompile', 'current'])
	assert.ok(capabilities.capabilityIndex?.some(item => /portable JSON specs/i.test(item.area)))
})

test('generate_from_spec advertises planId for compile-once commit', () => {
	const listed = publicToolList(TOOLS, { fullSchemas: true })
	const generate = listed.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	assert.ok(generate.inputSchema.properties.planId)
	assert.ok(generate.inputSchema.properties.lockedPlanId)
	assert.ok(generate.inputSchema.properties.planDigest)
	assert.ok(generate.inputSchema.properties.specHandle)
	assert.ok(generate.inputSchema.anyOf?.some(branch => branch.required?.includes('specHandle')))
	const specProps = generate.inputSchema.properties.spec.properties
	assert.ok(specProps.visualReference)
	assert.ok(specProps.htmlConversion)
	assert.ok(specProps.visualReference.properties.mediaAssets.items.required.includes('assetRef'))
	assert.ok(specProps.visualReference.properties.mediaAssets.items.required.includes('purpose'))
	const contentProps = specProps.slides.items.properties.content.items.properties
	assert.ok(contentProps.pixelFrame)
	assert.ok(contentProps.pixelPoints)
	assert.ok(contentProps.pixelPaths)
	const upload = listed.find(tool => tool.name === 'betterpptx.assets.upload')
	assert.ok(upload.inputSchema.properties.kind.enum.includes('jsonSpec'))
	const exportSpec = listed.find(tool => tool.name === 'betterpptx.deck.export_spec')
	assert.ok(exportSpec.inputSchema.properties.mode.enum.includes('authoredInput'))
	assert.ok(exportSpec.inputSchema.properties.mode.enum.includes('effectivePrecompile'))
})

test('public catalogs do not expose package vocabulary or internal proof ledgers', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `catalog-blackbox-${Date.now()}` })
	const options = dataOf(await mcp.call('betterpptx.options.catalog', { surface: 'structural', detail: 'full' }))
	const authoring = dataOf(await mcp.call('betterpptx.authoring.catalog', { family: 'structural', limit: 10 }))
	const blob = JSON.stringify({ options, authoring })
	assert.doesNotMatch(blob, /serializer|ledgerSemanticHash|mcpEngineProof|publicSpecFirstTools|catalogClosure|<a:|<p:|sourcePath|filePath|buildSha|capabilityDigest/i)
})
