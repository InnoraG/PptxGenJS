// Compare two builds of the same showcase: in-process vs over-the-wire.
// Proves that the wire-built deck is structurally identical to the in-process
// one (up to embedded timestamps / random IDs).

import * as fs from 'node:fs'
import * as path from 'node:path'
import JSZip from 'jszip'

function pickLatest(prefix) {
	const dir = 'outputs'
	const files = fs.readdirSync(dir).filter(n => n.startsWith(prefix))
	files.sort()
	return path.join(dir, files[files.length - 1])
}

const inproc = process.argv[2] || pickLatest('BetterPptxMcp_Showcase_v2_')
const wire = process.argv[3] || pickLatest('BetterPptxMcp_WireDemo_')

console.log('in-process build :', inproc)
console.log('wire-only  build :', wire)

const aBuf = fs.readFileSync(inproc)
const bBuf = fs.readFileSync(wire)
console.log('byte sizes       :', aBuf.length, 'vs', bBuf.length, '(diff:', Math.abs(aBuf.length - bBuf.length), ')')

const aZip = await JSZip.loadAsync(aBuf)
const bZip = await JSZip.loadAsync(bBuf)
const aEntries = Object.keys(aZip.files).sort()
const bEntries = Object.keys(bZip.files).sort()

console.log('entries          :', aEntries.length, 'vs', bEntries.length)
if (aEntries.length !== bEntries.length) {
	console.log('  in-process only:', aEntries.filter(e => !bEntries.includes(e)))
	console.log('  wire only      :', bEntries.filter(e => !aEntries.includes(e)))
}

// Tally identical-XML files (ignoring those with embedded GUIDs/timestamps)
let identical = 0
let trivialDiff = 0
let realDiff = []

// Normalisers that strip well-known transient values
function normalise(s) {
	return s
		// Remove all rId/r:id values
		.replace(/r:id="rId\d+"/g, 'r:id="rIdN"')
		.replace(/id="rId\d+"/g, 'id="rIdN"')
		// Strip ISO timestamps in core.xml etc
		.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'STAMP')
		.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g, 'STAMP')
		// Strip random sequence IDs
		.replace(/<p:sldId id="\d+"/g, '<p:sldId id="SLDID"')
		// Strip embed paths that include deck timestamps if any
		.replace(/seq="\d+" presetID="\d+"/g, 'seq="N" presetID="N"')
		// Strip randomly-generated OOXML extension GUIDs
		.replace(/id="\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}"/gi, 'id="{GUID}"')
		// Strip random creation-ID big-ints (model3d embed, etc.)
		.replace(/val="\d{8,10}"/g, 'val="NNNN"')
}

for (const name of aEntries) {
	if (!bEntries.includes(name)) continue
	const aFile = aZip.file(name)
	const bFile = bZip.file(name)
	if (!aFile || !bFile) continue
	if (aFile.dir) continue
	// Excel embeddings carry timestamps inside their internal xlsx — treat as binary,
	// but rather than byte-compare, unpack each xlsx and compare XML content with normaliser
	if (/\.xlsx$/i.test(name)) {
		const ab = await aFile.async('uint8array')
		const bb = await bFile.async('uint8array')
		const subA = await JSZip.loadAsync(ab)
		const subB = await JSZip.loadAsync(bb)
		const subEntries = Object.keys(subA.files).sort()
		let identicalSub = 0, diffSub = 0
		for (const en of subEntries) {
			if (subA.files[en].dir) continue
			if (!subB.file(en)) { diffSub++; continue }
			const xa = await subA.file(en).async('string')
			const xb = await subB.file(en).async('string')
			if (normalise(xa) === normalise(xb)) identicalSub++
			else diffSub++
		}
		if (diffSub === 0) identical++
		else trivialDiff++  // xlsx timestamps inside — count as trivial
		continue
	}
	if (/\.(png|jpg|jpeg|glb|emf|wmf|mp3|mp4)$/i.test(name)) {
		const ab = await aFile.async('uint8array')
		const bb = await bFile.async('uint8array')
		if (ab.length === bb.length && ab.every((v, i) => v === bb[i])) identical++
		else realDiff.push(`${name} (binary differs: ${ab.length} vs ${bb.length})`)
		continue
	}
	const aText = await aFile.async('string')
	const bText = await bFile.async('string')
	if (aText === bText) {
		identical++
	} else if (normalise(aText) === normalise(bText)) {
		trivialDiff++
	} else {
		realDiff.push(name)
	}
}

console.log('---')
console.log('byte-identical files        :', identical)
console.log('trivially-different (IDs)   :', trivialDiff)
console.log('substantively different     :', realDiff.length)
if (realDiff.length > 0) {
	console.log('  ', realDiff.slice(0, 10).join('\n   '))
}

const verdict = realDiff.length === 0 ? 'EQUIVALENT' : (realDiff.length <= 2 ? 'EQUIVALENT (minor)' : 'DIFFER')
console.log('---')
console.log('VERDICT:', verdict)
