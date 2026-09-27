// A4a non-wide CreateVideo metrology gate.
// This validates captured PowerPoint COM exports against same-layout static controls.
// It intentionally does not certify live fullscreen slideshow playback: that surface
// remains foreground-lock protected and must be measured in an interactive session.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const evidenceDir = path.join(here, 'outputs', 'a2a-nonwide-playback-20260801')
const reportPath = path.join(evidenceDir, 'nonwide-playback-metrology.json')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const existsAndSized = (file, minBytes = 1_000_000) => fs.existsSync(file) && fs.statSync(file).size >= minBytes

console.log('A4a NON-WIDE CREATEVIDEO PLAYBACK METROLOGY:')
ok('report schema is the non-wide metrology contract', report.schemaVersion === 'betterpptx.a2a.nonwide-playback-metrology.v1')
ok('square and vertical captures are present', Boolean(report.layouts?.square && report.layouts?.vertical))

for (const [layout, expectedDimensions, names] of [
	['square', [720, 720], ['square-createvideo.mp4', 'square-static-createvideo.mp4', 'square-roundtrip.pptx', 'square-static-roundtrip.pptx']],
	['vertical', [404, 720], ['vertical-createvideo.mp4', 'vertical-static-createvideo.mp4', 'vertical-roundtrip.pptx', 'vertical-static-roundtrip.pptx']],
]) {
	const evidence = report.layouts[layout]
	const [dynamicVideo, staticVideo, roundTrip, staticRoundTrip] = names.map(name => path.join(evidenceDir, name))
	const dynamic = evidence?.dynamic
	const control = evidence?.static
	const dynamicSlide = dynamic?.slides?.[0] || {}
	const controlSlide = control?.slides?.[0] || {}
	ok(`${layout}: CreateVideo and static-control artifacts exist`, existsAndSized(dynamicVideo) && existsAndSized(staticVideo) && existsAndSized(roundTrip) && existsAndSized(staticRoundTrip))
	ok(`${layout}: exported dimensions match the declared non-wide layout`, JSON.stringify(dynamic?.dimensions) === JSON.stringify(expectedDimensions), JSON.stringify(dynamic?.dimensions))
	ok(`${layout}: dynamic export has a stronger sustained motion signal than static control`, dynamicSlide.p90 > controlSlide.p90 * 1.1 && dynamicSlide['pairsAbove0.35'] > controlSlide['pairsAbove0.35'], JSON.stringify({ dynamic: dynamicSlide, staticControl: controlSlide }))
	ok(`${layout}: captured frames are aligned between dynamic and static controls`, dynamic?.frames === control?.frames && dynamic?.frames > 0)
}

const out = {
	schemaVersion: 'betterpptx.a2a.nonwide-playback-metrology-verification.v1',
	evidence: 'betterpptx-mcp/outputs/a2a-nonwide-playback-20260801/nonwide-playback-metrology.json',
	createVideoStatus: 3,
	liveFullscreenCertified: false,
	checks: pass,
	failures: fail,
}
fs.writeFileSync(path.join(evidenceDir, 'nonwide-playback-metrology-verification.json'), JSON.stringify(out, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
