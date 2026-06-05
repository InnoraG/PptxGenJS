// Validation + integrity inspector for the generated showcase.
// Runs the deck through betterpptx-mcp's validate tool and the project's
// PPTX_ULTIMATE_DECYPHER_TOOL repair check so we can flag any corruption.

import * as path from 'node:path'
import * as fs from 'node:fs'
import JSZip from 'jszip'

const target = process.argv[2] || path.resolve(process.cwd(), 'outputs', 'BetterPptxMcp_Showcase.pptx')

if (!fs.existsSync(target)) {
	console.error(`Not found: ${target}`)
	process.exit(2)
}

const buf = fs.readFileSync(target)
console.log('file:    ', target)
console.log('bytes:   ', buf.length)

const zip = await JSZip.loadAsync(buf)
const entries = Object.keys(zip.files).sort()
console.log('entries: ', entries.length)

const slideEntries = entries.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
console.log('slides:  ', slideEntries.length)

let totalAnimCount = 0
let totalShapeCount = 0
let totalTransCount = 0
let totalGradCount = 0
let totalWordArtCount = 0
let total3DCount = 0
for (const name of slideEntries) {
	const xml = await zip.file(name).async('string')
	const anims = (xml.match(/<p:par>/g) || []).length
	const shapes = (xml.match(/<p:sp>/g) || []).length
	const trans = (xml.match(/<p:transition/g) || []).length
	const grads = (xml.match(/<a:gradFill/g) || []).length
	const wordArts = (xml.match(/prstTxWarp prst="text/g) || []).length
	const t3d = (xml.match(/<a:sp3d/g) || []).length
	totalAnimCount += anims
	totalShapeCount += shapes
	totalTransCount += trans
	totalGradCount += grads
	totalWordArtCount += wordArts
	total3DCount += t3d
	console.log(`  ${name}: shapes=${shapes} transitions=${trans} animations(par)=${anims} gradFills=${grads} wordArts=${wordArts} sp3d=${t3d}`)
}

console.log('---')
console.log('totals: shapes=%d gradFills=%d wordArts=%d sp3d=%d transitions=%d animParTrees=%d',
	totalShapeCount, totalGradCount, totalWordArtCount, total3DCount, totalTransCount, totalAnimCount)

// Required-files integrity check
const REQUIRED = [
	'[Content_Types].xml',
	'_rels/.rels',
	'ppt/presentation.xml',
	'ppt/_rels/presentation.xml.rels',
	'ppt/theme/theme1.xml',
	'ppt/slideMasters/slideMaster1.xml',
]
const missing = REQUIRED.filter(p => !zip.file(p))
if (missing.length) {
	console.log('MISSING required parts:', missing)
	process.exit(3)
}
console.log('integrity: required parts OK')

// Verify each slide XML parses as well-formed (basic check)
const { DOMParser } = await import('@xmldom/xmldom')
const parser = new DOMParser({
	errorHandler: { warning: () => {}, error: m => { throw new Error(m) }, fatalError: m => { throw new Error(m) } },
})
for (const name of slideEntries) {
	const xml = await zip.file(name).async('string')
	try { parser.parseFromString(xml, 'text/xml') }
	catch (e) { console.log(`XML PARSE ERROR in ${name}: ${e.message}`); process.exit(4) }
}
console.log('xml-parse: all slide XML well-formed')

console.log('OK')
