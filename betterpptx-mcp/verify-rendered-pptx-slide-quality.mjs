// IMG4/IMG9 bridge: run deterministic raster hard gates on actual PowerPoint-rendered
// slide-context PNGs. This does not claim semantic or aesthetic correctness.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { evaluateImageQuality, hamming } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const files = [
	'img7-treatment-com-slide-1.png',
	'img7-treatment-com-slide-2.png',
	'img7-treatment-com-slide-3.png',
	'img7-treatment-com-slide-4.png',
	'img12-e2e-com-slide-1.png',
]
let pass = 0
let fail = 0
const results = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	results.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('RENDERED PPTX SLIDE-CONTEXT DETERMINISTIC QUALITY:')
const measurements = []
for (const file of files) {
	const full = path.join(outputRoot, file)
	const buffer = await fs.readFile(full).catch(() => null)
	ok(`${file}: PowerPoint-rendered PNG exists`, Buffer.isBuffer(buffer) && buffer.length > 1000)
	if (!buffer) continue
	const metadata = await sharp(buffer).metadata()
	const quality = await evaluateImageQuality(buffer, { aspect: 'wide', minWidth: 1024, minHeight: 576, minEntropy: 0.3, minStdev: 2 })
	const digest = crypto.createHash('sha256').update(buffer).digest('hex')
	measurements.push({ file, width: metadata.width, height: metadata.height, digest, quality: quality.measurements })
	ok(`${file}: rendered slide is 16:9 at usable resolution`, metadata.width === 1600 && metadata.height === 900 && quality.checks.requestedAspectHonored && quality.checks.minimumResolution)
	ok(`${file}: rendered slide contains deterministic visual information`, quality.status === 'pass' && quality.checks.minimumVisualInformation)
}
const hashes = measurements.map(item => item.quality.averageHash)
const distinctDigests = new Set(measurements.map(item => item.digest)).size
const distinctPerceptual = new Set(hashes).size
ok('all five rendered slide artifacts were measured', measurements.length === files.length)
ok('rendered slide artifacts are byte-distinct', distinctDigests === files.length, `distinct=${distinctDigests}/${files.length}`)
ok('rendered corpus retains at least four perceptually distinct slide contexts', distinctPerceptual >= 4, `distinct=${distinctPerceptual}/${files.length}`)
if (hashes.length > 1) ok('duplicate hard gate remains deterministic on the rendered corpus', hamming(hashes[0], hashes[1]) === 0)

const report = {
	schemaVersion: 'betterpptx.rendered-pptx-slide-quality.v1',
	ownedSyntheticOnly: true,
	customerImages: false,
	externalAi: false,
	semanticJudgmentIncluded: false,
	files,
	measurements,
	checks: pass,
	failures: fail,
}
await fs.writeFile(path.join(outputRoot, 'rendered-pptx-slide-quality-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
