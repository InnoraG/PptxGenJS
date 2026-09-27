import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('native SmartArt package lifecycle preserves selectors, RTL, hierarchy, and picture relationships', async () => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-smartart-lifecycle-'))
	let deckId = null
	const mcp = createMcpToolDispatcher({ sessionId: `smartart-lifecycle-${Date.now()}`, clientInfo: { name: 'smartart-lifecycle-unit', version: '1' }, blackBox: false })
	try {
		const lifecycleSpec = {
			schemaVersion: 'betterpptx.deck-spec.v1', title: 'SmartArt lifecycle unit', layout: 'LAYOUT_WIDE',
			authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
			contentStory: { audience: 'SmartArt lifecycle reviewers', outcome: 'Preserve editable diagram semantics through save and update.', remember: 'Selectors and node meaning remain explicit.' },
			visualDesign: { world: 'SmartArt package proof', framing: 'Native diagrams', tone: 'clear' },
			motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
			slides: [{ id: 'smartart-unit', title: 'SmartArt', content: [
				{ kind: 'smartart', name: 'process', objectName: 'process-smartart', layout: 'process', mode: 'native', rightToLeft: true, fontFace: 'Aptos', fontSize: 16, color: '112233', textColors: ['FFFFFF', '112233'], nodes: ['Plan', 'Build', 'Ship'], altText: 'Plan, build, and ship process.' },
				{ kind: 'smartart', name: 'hierarchy', objectName: 'hierarchy-smartart', layout: 'hierarchy', mode: 'native', nodes: [{ text: 'Leadership', role: 'root', children: [{ text: 'Engineering', role: 'manager', children: [{ text: 'Platform', role: 'member' }] }, { text: 'Design', role: 'assistant' }] }], altText: 'Leadership hierarchy.' },
				{ kind: 'smartart', name: 'picture', objectName: 'picture-smartart', layout: 'picture', mode: 'native', nodes: [{ text: 'One', role: 'image', imageData: PIXEL }, { text: 'Two', role: 'image', imageData: PIXEL }], altText: 'Two picture milestones.' },
			] }],
			validation: { validateBeforeSave: true, requireAccessibility: true },
		}
		const generated = await mcp.call('betterpptx.deck.generate_from_spec', {
			phase: 'commit', commitMode: 'createNew', detail: 'full',
			spec: lifecycleSpec,
		})
		assert.equal(generated?.ok, true, JSON.stringify(generated))
		deckId = (generated.data || generated).deckId
		assert.ok(deckId)
		const updated = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, phase: 'commit', commitMode: 'patch', spec: { ...lifecycleSpec, title: 'SmartArt lifecycle update', slides: [{ id: 'smartart-unit', content: [{ kind: 'smartart', name: 'hierarchy-patch', objectName: 'smartart-unit.hierarchy.smartart', nodePath: [0, 0], text: 'Engineering Platform' }] }] } })
		assert.equal(updated?.ok, true, JSON.stringify(updated))
		for (const name of ['betterpptx.deck.validate', 'betterpptx.deck.validate_design', 'betterpptx.deck.validate_accessibility', 'betterpptx.deck.validate_quality']) {
			const result = await mcp.call(name, { deckId, mode: 'strict' })
			assert.equal(result?.ok, true, `${name}: ${JSON.stringify(result)}`)
		}
		const saved = await mcp.call('betterpptx.deck.save', { deckId, outputDir: tempDir, fileName: 'smartart-unit.pptx' })
		assert.equal(saved?.ok, true, JSON.stringify(saved))
		const filePath = (saved.data || saved).filePath || (saved.data || saved).path
		const zip = await JSZip.loadAsync(await fs.readFile(filePath))
		const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
		const diagrams = names.filter(name => /^ppt\/diagrams\/(?:data|layout|quickStyle|colors|drawing)\d+\.xml$/i.test(name))
		assert.ok(diagrams.length >= 15, `expected five diagram parts per native SmartArt object, found ${diagrams.length}`)
		assert.ok(names.some(name => /^ppt\/diagrams\/_rels\/data\d+\.xml\.rels$/i.test(name)), 'diagram relationship parts missing')
		assert.ok(names.some(name => /^ppt\/media\/smartart\d+\.(?:png|jpg|jpeg)$/i.test(name)), 'picture SmartArt media missing')
		const xml = await zip.file('ppt/slides/slide1.xml').async('string')
		assert.equal((xml.match(/graphicData uri="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/diagram/g) || []).length, 3)
		const dataParts = diagrams.filter(name => /\/data\d+\.xml$/i.test(name))
		const dataXml = await Promise.all(dataParts.map(name => zip.file(name).async('string')))
		assert.ok(dataXml.some(value => value.includes('val="rev"')), 'right-to-left data-model direction missing')
		assert.ok(dataXml.some(value => value.includes('Engineering Platform')), 'hierarchy update was not serialized')
		assert.ok(dataXml.some(value => value.includes('type="asst"')), 'assistant role was not serialized')
		const contentTypes = await zip.file('[Content_Types].xml').async('string')
		assert.ok(contentTypes.includes('drawingml.diagramData+xml') && contentTypes.includes('drawingml.diagramDrawing+xml'))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
		await fs.rm(tempDir, { recursive: true, force: true })
	}
})
