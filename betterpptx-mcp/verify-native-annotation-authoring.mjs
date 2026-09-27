// End-to-end hybrid illustration proof: clean owned-synthetic Schnell artwork
// plus native editable labels/arrows, saved as PPTX and reopened/exported by COM.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { routeVisualNeed } from './ir/visual-source-router.mjs'
import { buildVisualGenerationPlan } from './ir/visual-director.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const sourceImage = path.join(outputRoot, 'image-illustration-demo-schnell-v2.png')
const outputDir = path.join(outputRoot, 'annotated-native-deck')
const pptxPath = path.join(outputDir, 'carbon-cycle-native-annotations.pptx')
const renderDir = path.join(outputDir, 'com-render')
fs.mkdirSync(outputDir, { recursive: true })
fs.mkdirSync(renderDir, { recursive: true })

const spec = {
	 schemaVersion: 'betterpptx.deck-spec.v1',
	 title: 'Carbon Cycle — Native Annotations',
	 audience: 'science lesson',
	 objective: 'Explain how carbon moves among atmosphere, plants, soil and ocean.',
	 theme: { mode: 'light', palette: ['102A43', '2D6A4F', 'F4F1DE', 'FFFFFF'], fontFace: 'Aptos' },
	 slides: [{
		 id: 'carbon-cycle', title: 'The carbon cycle', role: 'teaching', message: 'Carbon moves among atmosphere, plants, soil and ocean.', layoutIntent: 'title-only',
		 content: [{
			 kind: 'image', name: 'carbon-illustration', path: sourceImage, bbox: { x: 0.8, y: 1.1, w: 11.7, h: 5.6 },
			 visualIntent: { mode: 'auto', style: 'illustration', concept: 'scientific carbon cycle cutaway landscape', nativeAnnotations: {
				 labels: [
					 { text: 'ATMOSPHERE', x: 0.36, y: 0.03, w: 0.24, h: 0.09 },
					 { text: 'PLANTS', x: 0.05, y: 0.36, w: 0.18, h: 0.09 },
					 { text: 'SOIL', x: 0.10, y: 0.78, w: 0.16, h: 0.09 },
					 { text: 'OCEAN', x: 0.78, y: 0.38, w: 0.17, h: 0.09 },
				],
				arrows: [
					 { x: 0.30, y: 0.15, w: 0.20, h: 0.15 },
					 { x: 0.13, y: 0.46, w: 0.06, h: 0.25 },
					 { x: 0.24, y: 0.82, w: 0.34, h: 0.04 },
					 { x: 0.55, y: 0.20, w: 0.17, h: 0.12 },
				],
			} },
		}],
	}],
}

const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

const annotationIntent = spec.slides[0].content[0].visualIntent
const route = routeVisualNeed({ spec, slide: spec.slides[0], block: { kind: 'image', visualIntent: annotationIntent } })
const plan = buildVisualGenerationPlan({ spec, slide: spec.slides[0], block: { kind: 'image', visualIntent: annotationIntent }, rect: spec.slides[0].content[0].bbox })
ok('annotated illustration routes to hybrid generation + native overlay', route.decision === 'hybrid-generated-native-annotations' && route.safeToGenerate === true && route.editabilityClass === 'hybrid-native-annotations')
ok('visual director forces generated pixels to remain text-free', plan?.request?.noText === true && plan?.nativeAnnotations?.labelCount === 4 && plan?.nativeAnnotations?.arrowCount === 4)

const engine = await import('./engine.mjs')
const generated = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'premium', detail: 'summary' })
const data = generated?.data || generated || {}
ok('deck generation succeeds without external AI', generated?.ok === true && Boolean(data.deckId))
const saved = data.deckId ? await engine.callBetterPptxTool('betterpptx.deck.save', { deckId: data.deckId, fileName: path.basename(pptxPath), outputDir }) : null
ok('PPTX save succeeds', saved?.ok === true && fs.existsSync(pptxPath))
try { if (data.deckId) await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId: data.deckId }) } catch {}

let slideXml = ''
if (fs.existsSync(pptxPath)) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	const names = Object.keys(zip.files)
	ok('package has a slide and embedded raster', names.includes('ppt/slides/slide1.xml') && names.some(name => /^ppt\/media\/image/i.test(name)))
	ok('required labels are native slide text', ['ATMOSPHERE', 'PLANTS', 'SOIL', 'OCEAN'].every(label => slideXml.includes(`>${label}<`)))
	ok('four native annotation labels are named', (slideXml.match(/native-annotation-label/g) || []).length >= 4)
	ok('four native annotation arrows are named', (slideXml.match(/native-annotation-arrow/g) || []).length >= 4)
	ok('no raw 3D export is present', !names.some(name => /\.(glb|fbx)$/i.test(name)))
}

const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Save(); $p.Slides.Item(1).Export('${path.join(renderDir, 'slide-1.png').replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
const comText = `${com.stdout || ''}\n${com.stderr || ''}`
const rendered = path.join(renderDir, 'slide-1.png')
ok('PowerPoint COM reopens and exports the deck', com.status === 0 && /SLIDES=1/.test(comText) && fs.existsSync(rendered), comText.trim().slice(-300))
if (fs.existsSync(rendered)) {
	const meta = await sharp(rendered).metadata().catch(() => null)
	ok('COM render has a valid raster canvas', meta?.width === 1600 && meta?.height === 900)
}

const passed = checks.filter(item => item.status === 'PASS').length
const report = {
	 schemaVersion: 'betterpptx.native-annotation-authoring.v1', status: passed === checks.length ? 'research-native-annotation-pass' : 'research-native-annotation-fail', checks: checks.length, failures: checks.length - passed, passed,
	 sourceImage: 'betterpptx-mcp/outputs/image-illustration-demo-schnell-v2.png', outputPptx: 'betterpptx-mcp/outputs/annotated-native-deck/carbon-cycle-native-annotations.pptx', render: 'betterpptx-mcp/outputs/annotated-native-deck/com-render/slide-1.png', labels: ['ATMOSPHERE', 'PLANTS', 'SOIL', 'OCEAN'], nativeArrows: 4, customerImages: false, externalAi: false, training: false, repairFreeEvidence: true,
	 checksDetail: checks,
}
fs.writeFileSync(path.join(outputRoot, 'native-annotation-authoring-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nNATIVE ANNOTATION AUTHORING: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
