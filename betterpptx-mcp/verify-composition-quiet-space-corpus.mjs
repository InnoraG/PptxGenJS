// CPU deterministic focal/quiet-space metric for the current owned-synthetic runtime corpus.
// This is a composition hard-gate measurement, not an aesthetic or semantic judgment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))
const reports = [read('contextual-authoring-corpus-report.json'), read('photorealistic-contextual-corpus-report.json')]
const images = []
for (const report of reports) for (const item of report.results || []) for (const lane of ['create', 'edit']) {
	if (item[lane]?.status === 'PASS' && item[lane].outputPath) images.push({ id: `${item.id}:${lane}`, file: path.join(root, path.basename(item[lane].outputPath)) })
}
const results = []
for (const item of images) {
	const buffer = fs.readFileSync(item.file)
	const quality = await evaluateImageQuality(buffer, {
		aspect: 'landscape', minWidth: 512, minHeight: 512,
		focalRegion: { x: 50, y: 0, w: 50, h: 100 },
		quietRegion: { x: 0, y: 0, w: 50, h: 100 },
		minFocalEdgeDensity: 0.01, minFocalOccupancy: 0.03,
		// Photographic editorial images carry natural texture in copy space; this calibrated
		// profile is distinct from the stricter abstract/background profile.
		maxQuietEdgeDensity: 0.36, maxQuietOccupancy: 0.72,
	})
	results.push({ id: item.id, focalRegionPresent: quality.checks.focalRegionPresent === true, quietSpace: quality.checks.quietSpace === true, focal: quality.regions.focal, quiet: quality.regions.quiet, blockingIssues: quality.blockingIssues })
}
const passCount = results.filter(item => item.focalRegionPresent && item.quietSpace).length
const passRate = results.length ? passCount / results.length : 0
const report = {
	schemaVersion: 'betterpptx.composition-quiet-space-corpus.v1',
	status: results.length >= 16 && passRate >= 0.95 ? 'research-composition-pass' : 'research-composition-open',
	metric: 'deterministic focal-subject + quiet-space hard gate for composition-specified photographic editorial requests',
	acceptedOutputCount: results.length,
	passCount,
	passRate,
	threshold: 0.95,
	calibratedProfile: { maxQuietEdgeDensity: 0.36, maxQuietOccupancy: 0.72, minFocalEdgeDensity: 0.01, minFocalOccupancy: 0.03 },
	orientation: 'right focal / left copy space',
	results,
	ownedSyntheticOnly: true,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Deterministic composition evidence only; it does not replace blind semantic/perceptual review.',
}
const outputPath = path.join(root, 'composition-quiet-space-corpus-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status.endsWith('pass') ? 'ok  ' : 'OPEN'} composition pass rate ${(passRate * 100).toFixed(1)}% (${passCount}/${results.length})`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status.endsWith('pass') ? 0 : 1)
