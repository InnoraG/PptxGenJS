// Consolidated proof for the canonical HTML/native fallback boundary.
// This is deliberately generic: it inspects every lowered fallback record,
// proves that residual rasterization is isolated and owner-approved, and
// refuses to claim whole-slide or Office parity.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { lowerHtmlAuthoringSurface } from './ir/html-slide-compiler.mjs'
import { htmlUnsupportedRepresentationFindings } from './ir/html-representation.mjs'

const sourcePath = path.resolve('GPT_5_6_Pro_Capability_Showcase_HTML_Native_External_Images_Edition/index.html')
const archivedInventoryPath = path.resolve('outputs/authoring-principle-corpus/global-extended-option-five-point/html-canonical-public/20260825T140000Z-inventory-matrix/html-representation-inventory-proof.json')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = path.resolve(process.argv.includes('--evidence-dir')
	? process.argv[process.argv.indexOf('--evidence-dir') + 1]
	: `outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-html-raster-fallback-inventory/${stamp}`)

const sourceBytes = fs.readFileSync(sourcePath)
const archived = JSON.parse(fs.readFileSync(archivedInventoryPath, 'utf8'))
const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex')
const spec = lowerHtmlAuthoringSurface({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Canonical HTML fallback inventory',
	fallbackPolicy: archived.policy,
	html: sourceBytes.toString('utf8'),
})
const slides = spec.slides || []
const fallbacks = slides.flatMap(slide => slide.htmlFallbacks || [])
const residuals = fallbacks.filter(entry => entry.needsIsolatedRaster)
const findings = htmlUnsupportedRepresentationFindings(spec)
const objectCount = slides.reduce((sum, slide) => sum + (slide.content || []).length, 0)
const mappedMotion = slides.reduce((sum, slide) => sum + (slide.content || []).filter(block => block.animation).length, 0)
const byRepresentation = {}
const byFallbackComponent = {}
for (const entry of fallbacks) {
	byRepresentation[entry.sourceRepresentation] = (byRepresentation[entry.sourceRepresentation] || 0) + 1
	for (const component of entry.fallbackComponents || []) byFallbackComponent[component] = (byFallbackComponent[component] || 0) + 1
}

const invalidResiduals = residuals.filter(entry =>
	!entry.aiApprovedDowngrade ||
	!entry.needsIsolatedRaster ||
	entry.wholeSlideRasterized ||
	!entry.sourceObjectId ||
	!entry.slideId ||
	!Array.isArray(entry.fallbackComponents) ||
	entry.fallbackComponents.length === 0 ||
	!entry.fidelityImpact ||
	!entry.editabilityImpact)
const wholeSlideRasters = fallbacks.filter(entry => entry.wholeSlideRasterized)
const unapprovedRasterEntries = fallbacks.filter(entry => entry.needsIsolatedRaster && !entry.aiApprovedDowngrade)
const sourceDrift = archived.source?.sha256 !== sourceSha256
const expectedCounts = {
	slides: 25,
	objects: 871,
	fallbackEntries: 131,
	nativeSupportEntries: 106,
	isolatedResidualEntries: 25,
	approvedResidualEntries: 25,
	wholeSlideRasters: 0,
	mappedMotion: 746,
}
const actualCounts = {
	slides: slides.length,
	objects: objectCount,
	fallbackEntries: fallbacks.length,
	nativeSupportEntries: fallbacks.filter(entry => !entry.needsIsolatedRaster).length,
	isolatedResidualEntries: residuals.length,
	approvedResidualEntries: residuals.filter(entry => entry.aiApprovedDowngrade).length,
	wholeSlideRasters: wholeSlideRasters.length,
	mappedMotion,
	byRepresentation,
	byFallbackComponent,
}
const countMatch = Object.entries(expectedCounts).every(([key, value]) => actualCounts[key] === value)
const status = archived.status === 'PASS' && !sourceDrift && countMatch && invalidResiduals.length === 0 && wholeSlideRasters.length === 0 && unapprovedRasterEntries.length === 0 && findings.filter(item => item.severity === 'warning').length === 0
const evidence = {
	schemaVersion: 'betterpptx.canonical-raster-fallback-inventory-proof.v1',
	status: status ? 'PASS' : 'FAIL',
	source: { path: sourcePath, sha256: sourceSha256, expectedSlides: 25 },
	archivedInventory: {
		path: archivedInventoryPath,
		sha256: crypto.createHash('sha256').update(fs.readFileSync(archivedInventoryPath)).digest('hex'),
		status: archived.status,
	},
	policy: archived.policy,
	counts: actualCounts,
	expectedCounts,
	checks: {
		archivedInventoryPass: archived.status === 'PASS',
		sourceHashMatchesArchived: !sourceDrift,
		countsMatchCanonical: countMatch,
		allResidualsIsolatedAndOwnerApproved: invalidResiduals.length === 0 && unapprovedRasterEntries.length === 0,
		wholeSlideRasterization: wholeSlideRasters.length === 0,
		warningCount: findings.filter(item => item.severity === 'warning').length,
		residualComponentInventory: byFallbackComponent,
	},
	residuals: residuals.map(entry => ({ sourceObjectId: entry.sourceObjectId, slideId: entry.slideId, fallbackComponents: entry.fallbackComponents, fidelityImpact: entry.fidelityImpact, editabilityImpact: entry.editabilityImpact })),
	boundary: 'PASS certifies canonical lowering and fallback governance only. The 25 feTurbulence residues remain minimal isolated raster remainders; no whole-slide rasterization and no Office visual/preview/save parity are claimed.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-raster-fallback-inventory-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const digest = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex')
fs.writeFileSync(`${evidencePath}.sha256`, `${digest}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256: digest, invalidResidualCount: invalidResiduals.length, unapprovedRasterCount: unapprovedRasterEntries.length }, null, 2))
if (evidence.status !== 'PASS') process.exitCode = 1
