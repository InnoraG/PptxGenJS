// Focused native-annotation typography proof. It uses an owned synthetic raster,
// exact longer factual labels, and PowerPoint-native shrink-to-fit text. No image
// service is called; the test proves that factual annotation remains editable and
// readable even when labels exceed the short carbon-cycle fixture.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import sharp from 'sharp'

const here = new URL('.', import.meta.url).pathname.replace(/^\/(\w):/, '$1:')
const outputRoot = path.join(here, 'outputs')
const sourceImage = path.join(outputRoot, 'image-illustration-demo-schnell-v2.png')
const outputDir = path.join(outputRoot, 'native-annotation-text-fit')
const pptxPath = path.join(outputDir, 'carbon-cycle-native-text-fit.pptx')
const renderDir = path.join(outputDir, 'com-render')
fs.mkdirSync(renderDir, { recursive: true })

const labels = [
	{ text: 'ATMOSPHERIC CARBON', x: 0.33, y: 0.03, w: 0.30, h: 0.10, fontSize: 12 },
	{ text: 'PHOTOSYNTHESIS IN PLANTS', x: 0.03, y: 0.34, w: 0.28, h: 0.11, fontSize: 12 },
	{ text: 'SOIL CARBON STORAGE', x: 0.08, y: 0.78, w: 0.25, h: 0.10, fontSize: 12 },
	{ text: 'OCEANIC CARBON SINK', x: 0.73, y: 0.37, w: 0.24, h: 0.10, fontSize: 12 },
]
const arrows = [
	{ x: 0.29, y: 0.16, w: 0.20, h: 0.14 },
	{ x: 0.16, y: 0.46, w: 0.06, h: 0.23 },
	{ x: 0.25, y: 0.92, w: 0.32, h: 0.04 },
	{ x: 0.54, y: 0.20, w: 0.17, h: 0.12 },
]

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Carbon Cycle — Native Text Fit',
	audience: 'science lesson',
	objective: 'Explain carbon movement with exact editable annotations.',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use shape only for geometry. Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
	contentStory: { audience: 'science lesson', outcome: 'explain carbon movement clearly', remember: 'Carbon moves among connected reservoirs.' },
	visualDesign: { world: 'clean scientific editorial', framing: 'diagram-led teaching composition' },
	designSystem: { visualAssetEcosystem: { imageryDirection: 'owned scientific illustration with exact native annotations' } },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
	styleIntent: { artDirection: 'scientific', mode: 'light', density: 'moderate' },
	sections: [{ id: 'main', title: 'Main', slideIds: ['carbon-text-fit'] }],
	theme: { mode: 'light', palette: ['102A43', '2D6A4F', 'F4F1DE', 'FFFFFF'], fontFace: 'Aptos' },
	slides: [{
		id: 'carbon-text-fit',
		title: 'The carbon cycle',
		role: 'teaching',
		message: 'Carbon moves among atmosphere, plants, soil and ocean.',
		layoutIntent: 'title-body',
		notes: 'Native annotation text-fit proof.',
		content: [{
			kind: 'image', name: 'carbon-text-fit-illustration', path: sourceImage,
			region: 'body', imageOptions: { sizing: { type: 'contain' } },
			altText: 'Scientific carbon cycle illustration with editable native labels and arrows.', visualIntent: { mode: 'auto', style: 'illustration', concept: 'scientific carbon cycle cutaway landscape', noText: true, nativeAnnotations: { labels, arrows } },
		}],
	}],
}

const checks = []
const ok = (name, condition, detail = '') => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const engine = await import('./engine.mjs')
const { createMcpToolDispatcher } = engine
const dispatch = createMcpToolDispatcher({ host: '127.0.0.1', port: 0, mode: 'development' })
const call = (toolName, args) => dispatch.call(toolName, args)
const generated = await call('betterpptx.deck.generate_from_spec', { spec, commitMode: 'createNew', phase: 'commit', plan: 'premium', detail: 'full' })
const data = generated?.data || generated || {}
ok('native text-fit deck generation succeeds without an image call', generated?.ok === true && Boolean(data.deckId), JSON.stringify(generated).slice(0, 500))
const warnings = JSON.stringify(data?.warnings || data?.layout?.warnings || [])
ok('compiler emits no text-overflow warning', !/TEXT_OVERFLOW_RISK/i.test(warnings), warnings.slice(0, 240))
const quality = data.deckId ? await call('betterpptx.deck.validate_quality', { deckId: data.deckId, profile: 'modern', strictness: 'normal' }) : null
const saved = data.deckId && quality?.ok !== false ? await call('betterpptx.deck.save', { deckId: data.deckId, fileName: path.basename(pptxPath), outputDir }) : null
ok('native text-fit PPTX saves', saved?.ok === true && fs.existsSync(pptxPath), JSON.stringify(saved).slice(0, 500))
try { if (data.deckId) await call('betterpptx.deck.dispose', { deckId: data.deckId }) } catch {}

let slideXml = ''
if (fs.existsSync(pptxPath)) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const names = Object.keys(zip.files)
	slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	ok('package remains PPTX-only', !names.some(name => /\.(glb|fbx)$/i.test(name)))
	ok('all longer labels remain exact native text', labels.every(label => slideXml.includes(`>${label.text}<`)))
	ok('native labels use shrink-to-fit body properties', (slideXml.match(/normAutofit/g) || []).length >= labels.length)
	ok('native annotation objects remain named', (slideXml.match(/native-annotation-label/g) || []).length >= labels.length && (slideXml.match(/native-annotation-arrow/g) || []).length >= arrows.length)
}

const renderPath = path.join(renderDir, 'slide-1.png')
const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Slides.Item(1).Export('${renderPath.replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
const comText = `${com.stdout || ''}\n${com.stderr || ''}`
ok('PowerPoint COM reopens and exports native text-fit deck', com.status === 0 && /SLIDES=1/.test(comText) && fs.existsSync(renderPath), comText.trim().slice(-300))
if (fs.existsSync(renderPath)) {
	const meta = await sharp(renderPath).metadata().catch(() => null)
	ok('COM render has a valid canvas', meta?.width === 1600 && meta?.height === 900)
}

const passed = checks.filter(item => item.status === 'PASS').length
const report = {
	schemaVersion: 'betterpptx.native-annotation-text-fit.v1',
	status: passed === checks.length ? 'research-native-annotation-text-fit-pass' : 'research-native-annotation-text-fit-fail',
	checks: checks.length, failures: checks.length - passed, passed,
	labels: labels.map(label => label.text), nativeArrows: arrows.length,
	outputPptx: 'betterpptx-mcp/outputs/native-annotation-text-fit/carbon-cycle-native-text-fit.pptx',
	render: 'betterpptx-mcp/outputs/native-annotation-text-fit/com-render/slide-1.png',
	customerImages: false, consentedHumanImages: false, externalAi: false, training: false,
	note: 'This proves exact native annotation and shrink-to-fit behavior; it does not claim semantic or aesthetic model judgment.',
	checksDetail: checks,
}
fs.writeFileSync(path.join(outputRoot, 'native-annotation-text-fit-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nNATIVE ANNOTATION TEXT FIT: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
