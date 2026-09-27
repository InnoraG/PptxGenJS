// Durable local inventory for the native-first HTML representation boundary.
// This is intentionally source-generic: it reports every lowered fallback,
// not just the current canonical effect name, and never claims Office parity.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { lowerHtmlAuthoringSurface } from './ir/html-slide-compiler.mjs'
import { htmlUnsupportedRepresentationFindings } from './ir/html-representation.mjs'

const sourcePath = path.resolve('GPT_5_6_Pro_Capability_Showcase_HTML_Native_External_Images_Edition/index.html')
const evidenceDir = path.resolve(process.argv.includes('--evidence-dir')
	? process.argv[process.argv.indexOf('--evidence-dir') + 1]
	: 'outputs/authoring-principle-corpus/global-extended-option-five-point/html-canonical-public/20260825T130000Z-inventory')
const sourceBytes = fs.readFileSync(sourcePath)
const policy = {
	unsupportedAtmosphere: {
		feTurbulence: {
			decision: 'approve-minimal-isolated-raster',
			rationale: 'No native procedural-noise primitive; retain the native base and isolate only the residual.',
		},
		feDisplacementMap: { decision: 'approve-minimal-isolated-raster', rationale: 'No native displacement-map primitive; future uses remain owner-linked and isolated.' },
		'backdrop-filter': { decision: 'approve-minimal-isolated-raster', rationale: 'Browser backdrop filters are not a DrawingML primitive; future uses remain isolated.' },
		'css-filter-url': { decision: 'approve-minimal-isolated-raster', rationale: 'Unresolved CSS filter URLs require an explicit isolated fallback decision.' },
	},
}
const spec = lowerHtmlAuthoringSurface({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Canonical HTML representation inventory',
	fallbackPolicy: policy,
	html: sourceBytes.toString('utf8'),
})
const slides = spec.slides || []
const fallbacks = slides.flatMap(slide => slide.htmlFallbacks || [])
const residual = fallbacks.filter(entry => entry.needsIsolatedRaster)
const findings = htmlUnsupportedRepresentationFindings(spec)
const byFallbackComponent = {}
const byRepresentation = {}
for (const entry of fallbacks) {
	byRepresentation[entry.sourceRepresentation] = (byRepresentation[entry.sourceRepresentation] || 0) + 1
	for (const component of entry.fallbackComponents || []) byFallbackComponent[component] = (byFallbackComponent[component] || 0) + 1
}
const objectCount = slides.reduce((sum, slide) => sum + (slide.content || []).length, 0)
const mappedMotion = slides.reduce((sum, slide) => sum + (slide.content || []).filter(block => block.animation).length, 0)
const evidence = {
	schemaVersion: 'betterpptx.html-representation-inventory-proof.v1',
	status: slides.length === 25 && objectCount === 871 && residual.length === 25 && residual.every(entry => entry.aiApprovedDowngrade && entry.needsIsolatedRaster && !entry.wholeSlideRasterized) && !fallbacks.some(entry => entry.wholeSlideRasterized) && findings.filter(item => item.severity === 'warning').length === 0 ? 'PASS' : 'FAIL',
	source: { sha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'), expectedSlides: 25 },
	policy,
	counts: {
		slides: slides.length,
		objects: objectCount,
		fallbackEntries: fallbacks.length,
		nativeSupportEntries: fallbacks.filter(entry => !entry.needsIsolatedRaster).length,
		isolatedResidualEntries: residual.length,
		approvedResidualEntries: residual.filter(entry => entry.aiApprovedDowngrade).length,
		wholeSlideRasters: fallbacks.filter(entry => entry.wholeSlideRasterized).length,
		mappedMotion,
		byRepresentation,
		byFallbackComponent,
	},
	findings: {
		warningCount: findings.filter(item => item.severity === 'warning').length,
		infoCount: findings.filter(item => item.severity === 'info').length,
		codes: [...new Set(findings.map(item => item.code))],
	},
	boundary: 'This inventory certifies source lowering and policy accounting only. feTurbulence remains non-native; no Office visual/preview/save parity is asserted.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'html-representation-inventory-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const digest = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${digest}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256: digest }, null, 2))
if (evidence.status !== 'PASS') process.exitCode = 1
