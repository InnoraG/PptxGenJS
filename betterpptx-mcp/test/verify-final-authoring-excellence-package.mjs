import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const root = path.resolve('betterpptx-mcp')
const outputDir = path.join(root, 'outputs', 'commercial-poc', 'final-authoring-excellence-20260728')
const pptxPath = path.join(outputDir, 'betterpptx-authoring-excellence-final-3min-quick-reference.pptx')
const reportPath = path.join(outputDir, 'betterpptx-authoring-excellence-final-3min-package-report.json')

const zip = await JSZip.loadAsync(await fs.readFile(pptxPath))
const names = Object.keys(zip.files)
const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
const presentationXml = await zip.file('ppt/presProps.xml')?.async('string') || ''
const slideRels = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string') || ''
const shapeNames = [...slideXml.matchAll(/name="([^"]+)"/g)].map(match => match[1])
const mediaEntries = names.filter(name => /^ppt\/media\//.test(name))
const model3dEntries = names.filter(name => /model3d|\.glb$|\.gltf$/i.test(name))
const checks = {
	packageOpen: true,
	oneSlide: names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === 1,
	roundAvatarShape: slideXml.includes('optional-talking-head-avatar') && slideXml.includes('prst="ellipse"'),
	aspectSafeCrop: slideXml.includes('<a:srcRect'),
	editableInkHighlightShape: shapeNames.includes('ink-proof-highlight'),
	editableLaserPointerShape: shapeNames.includes('laser-proof-pointer'),
	nativeNarrationMarker: /isNarration="1"/.test(slideXml),
	nativeMediaMarker: /<p14:media\b/.test(slideXml),
	nativeTimingTree: slideXml.includes('<p:timing>'),
	automatic180sTransition: /advTm="180000"/.test(slideXml),
	showNarration: /showNarration="1"/.test(presentationXml),
	useTimings: /useTimings="1"/.test(presentationXml),
	avatarMediaRelationship: /relationships\/video/.test(slideRels) && /relationships\/audio/.test(slideRels),
	native3dPayload: model3dEntries.length > 0,
	mediaPayload: mediaEntries.length >= 2,
}
const report = {
	schemaVersion: 'betterpptx.authoring-excellence.final-proof-package.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	pptx: pptxPath,
	checks,
	shapeNames,
	mediaEntries,
	model3dEntries,
	zipEntryCount: names.length,
}
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ ...report, reportPath }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
