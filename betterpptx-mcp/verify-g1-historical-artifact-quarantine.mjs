// G1 governance gate for historical commercial-PoC PPTX evidence.
// Historical research artifacts are preserved, but they are explicitly
// ineligible for delivery and hash-pinned in a private-only manifest.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = path.join(repoRoot, 'betterpptx-mcp', 'outputs', 'commercial-poc')
const manifestPath = path.join(repoRoot, 'betterpptx-mcp', 'docs', 'release-safety', 'G1-HISTORICAL-ARTIFACT-QUARANTINE-2026-08-01.json')
const reportPath = path.join(repoRoot, 'betterpptx-mcp', 'outputs', 'g1-historical-quarantine-report.json')
const writeManifest = process.argv.includes('--write')
const strict = process.argv.includes('--strict')

const privateTokens = Object.freeze([
	'x-pipeline',
	'x-enhancement',
	'x-restoreformer-seconds',
	'x-restoreformer-segments',
	'liveportrait',
	'musetalk',
	'restoreformer',
	'providerexecutionid',
	'executionid',
])
const privateRe = new RegExp(privateTokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'ig')
const textPartRe = /\.(?:xml|rels|json|txt|vml)$/i
const visiblePartRe = /^ppt\/(?:slides\/slide\d+\.xml|notesSlides\/notesSlide\d+\.xml|charts\/(?:chart|chartEx)\d+\.xml|diagrams\/data\d+\.xml)$/i

const relative = value => path.relative(repoRoot, value).replaceAll('\\', '/')

async function walk(dir) {
	const out = []
	for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...await walk(file))
		else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pptx')) out.push(file)
	}
	return out
}

async function scanFile(file) {
	const bytes = fs.statSync(file).size
	const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
	const zip = await JSZip.loadAsync(fs.readFileSync(file))
	const hits = []
	for (const [part, entry] of Object.entries(zip.files)) {
		if (entry.dir || !textPartRe.test(part)) continue
		const text = await entry.async('string')
		privateRe.lastIndex = 0
		const tokens = [...new Set((text.match(privateRe) || []).map(token => token.toLowerCase()))]
		if (tokens.length) hits.push({ part, scope: visiblePartRe.test(part) ? 'visible-or-review-content' : 'package-text', tokens })
	}
	return {
		path: relative(file),
		bytes,
		sha256,
		privateVocabularyHits: hits,
		privateOnly: true,
		deliveryEligible: false,
	}
}

function manifestFrom(artifacts) {
	const tokenBearing = artifacts.filter(item => item.privateVocabularyHits.length > 0).length
	return {
		schema: 'betterpptx.g1.historical-artifact-quarantine.v1',
		generatedAt: new Date().toISOString(),
		sourceRoot: relative(sourceRoot),
		quarantineMode: 'manifest-enforced-private-only',
		physicalMovePerformed: false,
		researchArtifactsPreserved: true,
		deliveryEligible: false,
		exactDeliveryManifest: 'betterpptx-mcp/docs/release-safety/G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json',
		privateTokens,
		scanned: artifacts.length,
		tokenBearing,
		zeroHit: artifacts.length - tokenBearing,
		artifacts,
	}
}

const checks = []
const check = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
const files = await walk(sourceRoot)
const current = []
for (const file of files.sort()) current.push(await scanFile(file))

let manifest = null
if (writeManifest) {
	manifest = manifestFrom(current)
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
} else {
	try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch { manifest = null }
}

check('manifest-schema', manifest?.schema === 'betterpptx.g1.historical-artifact-quarantine.v1' && Array.isArray(manifest.artifacts), 'Private-only historical-artifact manifest is present.')
check('source-root', manifest?.sourceRoot === relative(sourceRoot), 'Manifest source root is the historical commercial-PoC tree.')
check('preserve-research-artifacts', manifest?.physicalMovePerformed === false && manifest?.researchArtifactsPreserved === true, 'Research evidence is preserved; quarantine is enforced by manifest policy, not deletion.')
check('delivery-exclusion', manifest?.deliveryEligible === false && manifest?.exactDeliveryManifest === 'betterpptx-mcp/docs/release-safety/G1-PRODUCTION-DELIVERY-RELEASE-MANIFEST.json', 'Historical artifacts are excluded from delivery; only the exact G1 manifest may be delivered.')

const currentByPath = new Map(current.map(item => [item.path, item]))
const manifestArtifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : []
check('coverage', manifestArtifacts.length === current.length && current.every(item => manifestArtifacts.some(expected => expected.path === item.path)), `Manifest covers ${manifestArtifacts.length}/${current.length} current PPTX artifacts.`)
const drift = []
for (const expected of manifestArtifacts) {
	const actual = currentByPath.get(expected.path)
	if (!actual || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256 || expected.privateOnly !== true || expected.deliveryEligible !== false) drift.push(expected.path || '<missing>')
}
check('hash-and-policy-pins', drift.length === 0, drift.length ? `Hash/policy drift: ${drift.join(', ')}` : 'Every historical artifact hash and private-only policy matches.')
const tokenBearing = current.filter(item => item.privateVocabularyHits.length > 0)
check('token-scan-accounting', manifest?.tokenBearing === tokenBearing.length && manifest?.zeroHit === current.length - tokenBearing.length, `Current scan finds ${tokenBearing.length} token-bearing and ${current.length - tokenBearing.length} zero-hit artifacts.`)
const deliverySet = manifestArtifacts.filter(item => item.path.includes('outputs/blackbox-delivery-refresh-20260801'))
check('delivery-set-disjoint', deliverySet.length === 0, deliverySet.length ? 'A delivery candidate is incorrectly inside historical quarantine.' : 'Historical quarantine is disjoint from the exact sanitized delivery set.')

const report = {
	schema: 'betterpptx.g1.historical-artifact-quarantine-report.v1',
	manifest: relative(manifestPath),
	mode: writeManifest ? 'write-and-verify' : strict ? 'strict' : 'report-only',
	status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'PENDING',
	releaseEligible: false,
	checks,
	currentScan: {
		scanned: current.length,
		tokenBearing: tokenBearing.length,
		zeroHit: current.length - tokenBearing.length,
	},
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(`G1 HISTORICAL QUARANTINE: ${report.status} checks=${checks.filter(item => item.status === 'PASS').length}/${checks.length} scanned=${current.length} tokenBearing=${tokenBearing.length}`)
for (const item of checks) console.log(`${item.status} ${item.id}: ${item.detail}`)
if (strict && report.status !== 'PASS') process.exitCode = 1
