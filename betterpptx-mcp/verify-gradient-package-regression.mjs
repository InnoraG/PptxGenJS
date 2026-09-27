// Director World-gradient package regression.
//
// This deliberately goes through the semantic MCP front door, saves real PPTX
// packages, and then inspects the package background XML. The plan-level policy
// test proves intent; this test proves the serialized artifact still carries the
// intended gradient (and does not add one to a flat World).
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const ROOT = 'D:/PptxGenJS_Claude'
const OUT_DIR = path.join(ROOT, 'tmp_autonomous_test', 'gradient-package-regression')
const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const namedWorlds = ['aurora', 'editorial', 'blueprint', 'brutalist', 'luxe', 'mist', 'atelier', 'meridian', 'chalkline', 'playbook', 'pulse', 'collage', 'observatory', 'storybook', 'candy', 'horizon', 'mono', 'botanical']
const gradientWorlds = new Set(['aurora', 'luxe', 'candy'])
const cases = [
	...namedWorlds.map(world => ({ world, expected: gradientWorlds.has(world) })),
	{ world: 'aurora-light', styleWorld: 'aurora', mode: 'light', expected: true },
	{ world: 'luxe-light', styleWorld: 'luxe', mode: 'light', expected: true },
	{ world: 'candy-dark', styleWorld: 'candy', mode: 'dark', expected: true },
	{ world: 'observatory-light', styleWorld: 'observatory', mode: 'light', expected: false },
	{ world: 'style-glass', expected: true, styleArtDirection: { label: 'Style glass', mode: 'light', card: 'panel', surface: { fill: 'glass' } } },
	// Compatibility/readback form: the same bespoke surface may arrive under
	// theme.artDirection. Keep this on the real MCP/package path as well as in
	// the pure policy test so serialization cannot drift by input form.
	{ world: 'theme-glass', expected: true, themeArtDirection: { label: 'Theme glass', mode: 'light', card: 'panel', surface: { fill: 'glass' } } },
	{ world: 'theme-flat', expected: false, themeArtDirection: { label: 'Theme flat', mode: 'light', card: 'panel', surface: { fill: 'flat' } } },
	{ world: 'theme-flat-empty-style', expected: false, themeArtDirection: { label: 'Theme flat with empty styleIntent', mode: 'light', card: 'panel', surface: { fill: 'flat' } }, styleIntentEmpty: true },
]

await fs.mkdir(OUT_DIR, { recursive: true })

const ttsWav = Buffer.from('')
const ttsServer = createServer((req, res) => {
	if (req.method === 'GET' && req.url === '/voices') {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ voices: [] }))
		return
	}
	if (req.method === 'POST' && req.url === '/') {
		req.resume()
		req.on('end', () => {
			// No narration is authored in this regression. Keep an explicit endpoint
			// so a future compiler default cannot accidentally reach the developer's
			// Piper service while this package-only test is running.
			res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': ttsWav.length })
			res.end(ttsWav)
		})
		return
	}
	res.writeHead(404)
	res.end()
})
await new Promise((resolve, reject) => {
	ttsServer.once('error', reject)
	ttsServer.listen(0, '127.0.0.1', resolve)
})
const ttsAddress = ttsServer.address()
const env = {
	...process.env,
	BETTERPPTX_ASSETS_ROOT: ROOT,
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_TOOL_TIMEOUT_MS: '120000',
	BETTERPPTX_TTS_PROVIDER: 'piper-http',
	BETTERPPTX_TTS_URL: `http://127.0.0.1:${ttsAddress.port}`,
}
const child = spawn(process.execPath, [`${ROOT}/betterpptx-mcp/cli.mjs`], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] })
const pending = new Map()
let inputBuffer = ''
let requestId = 0
child.stdout.on('data', data => {
	inputBuffer += data
	let newline
	while ((newline = inputBuffer.indexOf('\n')) >= 0) {
		const line = inputBuffer.slice(0, newline).trim()
		inputBuffer = inputBuffer.slice(newline + 1)
		if (!line) continue
		let message
		try { message = JSON.parse(line) } catch { continue }
		if (message.id != null && pending.has(message.id)) {
			pending.get(message.id)(message)
			pending.delete(message.id)
		}
	}
})
child.stderr.on('data', () => {})
const rpc = (method, params) => new Promise(resolve => {
	const id = ++requestId
	pending.set(id, resolve)
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
})
const call = (name, args) => rpc('tools/call', { name, arguments: args }).then(response => {
	try { return JSON.parse(response.result.content[0].text) } catch { return response }
})

const results = []
try {
	await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gradient-package-regression', version: '1' } })
	child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

	for (const item of cases) {
		const file = path.join(OUT_DIR, `${item.world}.pptx`)
		const spec = {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: `gradient-package-${item.world}`,
			authoringContract: {
				workflow: 'authoring-excellence-director-v1', level: 'deterministic',
				coordinateSystem: 'inches', layerModel: 'flat-object-array',
				objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
				placementPolicy: 'semantic-layout-only',
				textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.',
			},
			contentStory: { audience: 'presentation authors', outcome: 'verify world treatment', remember: 'World treatment is engine-governed.' },
			visualDesign: { world: item.world, framing: 'engine-owned composition' },
			motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic content', syncPolicy: 'One governed clock.' },
			layout: 'LAYOUT_WIDE',
			...(item.themeArtDirection
				? { theme: { artDirection: item.themeArtDirection }, ...(item.styleIntentEmpty ? { styleIntent: {} } : {}) }
				: { styleIntent: { artDirection: item.styleArtDirection || item.styleWorld || item.world, ...(item.mode ? { mode: item.mode } : {}) } }),
			slides: [{
				id: 'cover', title: `${item.world} treatment`, message: 'World treatment.', layoutIntent: 'title-body',
				content: [
					{ kind: 'title', name: 'title', text: `${item.world} World` },
					{ kind: 'body', name: 'body', text: 'The Director owns the visual treatment.' },
					// Include a semantic data surface so the package regression proves
					// World-aware object fills as well as the canvas background. Flat
					// Worlds must stay flat; gradient-native Worlds may apply their
					// governed card treatment without any authored geometry.
					{ kind: 'metric-grid', name: 'surface-proof', items: [
						{ name: 'one', label: 'Surface', value: 'World', text: 'Engine-owned treatment.', verified: true, evidenceSource: 'contract fixture' },
						{ name: 'two', label: 'Placement', value: 'Auto', text: 'Semantic placement only.', verified: true, evidenceSource: 'contract fixture' },
					] },
					{ kind: 'chart-panel', name: 'chart-proof', chartType: 'bar', data: [{ name: 'Signal', labels: ['A', 'B'], values: [1, 2] }], verified: true, evidenceSource: 'contract fixture', altText: 'Contract fixture signal rises from one to two.' },
					{ kind: 'table-panel', name: 'table-proof', header: ['Signal', 'Value'], rows: [['A', '1'], ['B', '2']], verified: true, evidenceSource: 'contract fixture', altText: 'Contract fixture signal table.' },
				],
			}],
		}
		let status = 'FAIL'
		let detail = ''
		try {
			const generated = await call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'summary' })
			if (!generated?.ok) throw new Error(`commit failed: ${JSON.stringify(generated?.data?.errors || generated?.error || generated).slice(0, 240)}`)
			const expectedPolicy = generated.data?.appliedDefaults?.gradientPolicy
			if (expectedPolicy?.expected !== item.expected) throw new Error(`policy expected=${expectedPolicy?.expected}, wanted=${item.expected}`)
			const quality = await call('betterpptx.deck.validate_quality', { deckId: generated.data.deckId, profile: 'modern' })
			if (!quality?.ok) throw new Error(`quality failed: ${JSON.stringify(quality?.data?.blockingIssues || quality?.error || quality).slice(0, 240)}`)
			const qualityData = quality.data || quality
			const qualityPolicy = qualityData.designValidation?.gradientPolicy
			if (!qualityPolicy || qualityPolicy.expected !== item.expected) throw new Error(`quality policy expected=${qualityPolicy?.expected}, wanted=${item.expected}`)
			const semanticGradientSurfaces = Number(qualityData.designValidation?.metrics?.gradientSurfaces)
			const exported = await call('betterpptx.deck.export_spec', { deckId: generated.data.deckId, detail: 'summary' })
			if (!exported?.ok) throw new Error(`export_spec failed: ${JSON.stringify(exported?.error || exported).slice(0, 240)}`)
			const exportedSpec = exported.data?.spec || exported.spec
			const exportedArtDirection = exportedSpec?.styleIntent?.artDirection
			const expectedArtDirection = item.themeArtDirection || item.styleArtDirection
			if (expectedArtDirection && JSON.stringify(exportedArtDirection) !== JSON.stringify(expectedArtDirection)) {
				throw new Error(`exported artDirection did not preserve authored World for ${item.world}`)
			}
			const saved = await call('betterpptx.deck.save', { deckId: generated.data.deckId, fileName: file })
			if (!saved?.ok) throw new Error(`save failed: ${JSON.stringify(saved?.error || saved).slice(0, 240)}`)
			const zip = await JSZip.loadAsync(readFileSync(file))
			const slide = zip.file('ppt/slides/slide1.xml')
			if (!slide) throw new Error('saved package has no slide1.xml')
			const xml = await slide.async('text')
			const doc = new DOMParser().parseFromString(xml, 'application/xml')
			if (doc.getElementsByTagName('parsererror').length) throw new Error('slide XML parser error')
			const bgPr = doc.getElementsByTagNameNS(P_NS, 'bgPr')[0]
			const gradients = bgPr ? Array.from(bgPr.getElementsByTagNameNS(A_NS, 'gradFill')) : []
			const allGradientFills = Array.from(doc.getElementsByTagNameNS(A_NS, 'gradFill'))
			const objectGradientFills = allGradientFills.filter(fill => fill.parentNode?.localName === 'spPr')
			const surfaceGradientCount = objectGradientFills.length
			const positions = gradients[0]
				? Array.from(gradients[0].getElementsByTagNameNS(A_NS, 'gs')).map(stop => Number(stop.getAttribute('pos')))
				: []
			const ordered = positions.length >= 2 && positions[0] === 0 && positions.at(-1) === 100000 && positions.every((position, index) => index === 0 || position > positions[index - 1])
			const packagePass = item.expected ? gradients.length > 0 && ordered : gradients.length === 0
			if (!packagePass) throw new Error(`package gradient=${gradients.length > 0}, positions=${positions.join(',') || 'none'}`)
			const serializedGradientSurfaces = gradients.length + surfaceGradientCount
			if (Number.isFinite(semanticGradientSurfaces)) {
				if (item.expected && serializedGradientSurfaces < semanticGradientSurfaces) {
					throw new Error(`serialized gradient surfaces=${serializedGradientSurfaces} < Director metric=${semanticGradientSurfaces}`)
				}
				if (!item.expected && serializedGradientSurfaces !== 0) {
					throw new Error(`flat World serialized gradient surfaces=${serializedGradientSurfaces}`)
				}
			}
			status = 'PASS'
			detail = `policy=${expectedPolicy.expected} packageGradient=${gradients.length > 0} serializedSurfaces=${serializedGradientSurfaces}/${Number.isFinite(semanticGradientSurfaces) ? semanticGradientSurfaces : 'n/a'} positions=${positions.join(',') || 'none'}`
		} catch (error) {
			detail = error.message
		}
		results.push({ world: item.world, expectedGradient: item.expected, status, detail })
		console.log(`${status} ${item.world.padEnd(11)} ${detail}`)
	}
} finally {
	child.kill()
	await new Promise(resolve => ttsServer.close(resolve))
}

const failed = results.filter(result => result.status !== 'PASS')
console.log(`GRADIENT PACKAGE REGRESSION: ${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length ? 1 : 0)
