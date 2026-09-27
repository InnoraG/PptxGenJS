// Verify that a candidate production-delivery PPTX set contains no private
// avatar provider/enhancement/execution vocabulary anywhere in its package.
// This is intentionally a package-level gate: notes, chart caches, metadata,
// and relationship-adjacent text are delivery surface just like slide text.
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const rootArg = process.argv[2] || 'outputs/commercial-poc'
const strict = process.argv.includes('--strict')
const root = path.resolve(rootArg)

const PRIVATE_TOKENS = Object.freeze([
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
const PRIVATE_RE = new RegExp(PRIVATE_TOKENS.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'ig')
const TEXT_PART_RE = /\.(?:xml|rels|json|txt|vml)$/i
const VISIBLE_PART_RE = /^ppt\/(?:slides\/slide\d+\.xml|notesSlides\/notesSlide\d+\.xml|charts\/(?:chart|chartEx)\d+\.xml|diagrams\/data\d+\.xml)$/i

async function walk(dir) {
	const out = []
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...await walk(file))
		else if (entry.name.toLowerCase().endsWith('.pptx')) out.push(file)
	}
	return out
}

async function scanFile(file) {
	const zip = await JSZip.loadAsync(await fs.readFile(file))
	const hits = []
	for (const [part, entry] of Object.entries(zip.files)) {
		if (entry.dir || !TEXT_PART_RE.test(part)) continue
		const text = await entry.async('string')
		const tokens = [...new Set((text.match(PRIVATE_RE) || []).map(token => token.toLowerCase()))]
		if (!tokens.length) continue
		hits.push({ part, scope: VISIBLE_PART_RE.test(part) ? 'visible-or-review-content' : 'package-text', tokens })
	}
	return { file: path.relative(process.cwd(), file).replaceAll('\\', '/'), hits, zeroHit: hits.length === 0 }
}

const files = await walk(root)
const results = []
for (const file of files.sort()) results.push(await scanFile(file))
const filesWithHits = results.filter(result => !result.zeroHit)
const report = {
	schemaVersion: 'betterpptx.production-deck-blackbox.v1',
	root: path.relative(process.cwd(), root).replaceAll('\\', '/'),
	tokens: PRIVATE_TOKENS,
	scanned: results.length,
	zeroHit: results.length - filesWithHits.length,
	filesWithHits: filesWithHits.length,
	pass: filesWithHits.length === 0,
	results,
}
console.log(JSON.stringify(report, null, 2))
if (strict && !report.pass) process.exitCode = 1

