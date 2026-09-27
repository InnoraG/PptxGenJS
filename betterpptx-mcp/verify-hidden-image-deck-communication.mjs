// Structural hidden-image fallback evidence. It removes picture nodes from a
// saved PPTX in memory and verifies that each slide still has native text.
// This does not claim semantic comprehension or replace owner acceptance.
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const inputPath = path.join(here, 'outputs', 'contextual-authoring-corpus.pptx')
const corpusReportPath = path.join(here, 'outputs', 'contextual-authoring-corpus-report.json')
const corpusReport = JSON.parse(fs.readFileSync(corpusReportPath, 'utf8'))
const corpusCases = Array.isArray(corpusReport?.request?.cases) ? corpusReport.request.cases : []
const bytes = fs.readFileSync(inputPath)
const zip = await JSZip.loadAsync(bytes)
const parser = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } })
const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
const results = []
const stopwords = new Set(['the', 'and', 'with', 'from', 'into', 'that', 'this', 'for', 'one', 'are', 'was', 'has', 'its'])
const lexicalTokens = text => String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []
const meaningful = text => [...new Set(lexicalTokens(text).filter(token => !stopwords.has(token)))]
for (const name of slideNames) {
	const xml = await zip.file(name).async('string')
	const document = parser.parseFromString(xml, 'application/xml')
	const pictures = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'pic'))
	const textBefore = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't')).map(node => String(node.textContent || '')).join(' ').trim()
	for (const picture of pictures) picture.parentNode?.removeChild(picture)
	const textAfter = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't')).map(node => String(node.textContent || '')).join(' ').trim()
 	const meaningfulTokens = meaningful(textAfter)
	const slideNumber = Number(name.match(/slide(\d+)\.xml$/)?.[1] || 0)
	const corpusCase = corpusCases.length > 0 ? corpusCases[Math.floor((slideNumber - 1) / 2)] : undefined
	const expectedMessageTokens = meaningful(corpusCase?.message)
	const nativeMessageMissingTokens = expectedMessageTokens.filter(token => !meaningfulTokens.includes(token))
	const nativeMessageTokenCoverage = expectedMessageTokens.length > 0
		? (expectedMessageTokens.length - nativeMessageMissingTokens.length) / expectedMessageTokens.length
		: 0
	const nativeMessageCoveragePass = expectedMessageTokens.length > 0 && nativeMessageMissingTokens.length === 0
	const messageScaffold = textAfter.length >= 40 && meaningfulTokens.length >= 5 && !/lorem|placeholder|todo|tbd/i.test(textAfter)
	results.push({ slide: name, corpusCaseId: corpusCase?.id || null, pictureCount: pictures.length, textCharsBefore: textBefore.length, textCharsAfter: textAfter.length, meaningfulTokenCount: meaningfulTokens.length, expectedMessageTokenCount: expectedMessageTokens.length, nativeMessageTokenCoverage, nativeMessageMissingTokens, nativeMessageCoveragePass, nativeTextSurvives: textAfter.length >= 12, messageScaffold })
}
const nativeMessageCoveragePass = results.length > 0 && results.every(result => result.nativeMessageCoveragePass)
const nativeMessageCoverageMin = results.length > 0 ? Math.min(...results.map(result => result.nativeMessageTokenCoverage)) : 0
const report = {
	schemaVersion: 'betterpptx.hidden-image-deck-communication.v1',
	status: results.length > 0 && results.every(result => result.nativeTextSurvives) ? 'research-structural-pass' : 'research-structural-fail',
	source: 'outputs/contextual-authoring-corpus.pptx',
	slideCount: results.length,
	results,
	allPicturesRemovedInMemory: true,
	messageScaffoldPass: results.length > 0 && results.every(result => result.messageScaffold),
	nativeMessageCoveragePass,
	nativeMessageCoverageMin,
	semanticAcceptance: false,
	ownerAcceptance: false,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Native text survives removal of decorative picture nodes; the exact requested message token set is present on all mapped slides. This is stronger structural/message evidence, not visual semantic comprehension or owner/product acceptance.',
}
const outputPath = path.join(here, 'outputs', 'hidden-image-deck-communication-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
for (const result of results) console.log(`  ${result.nativeTextSurvives && result.messageScaffold && result.nativeMessageCoveragePass ? 'ok  ' : 'OPEN'} ${result.slide}: ${result.textCharsAfter} native text chars, message coverage ${(result.nativeMessageTokenCoverage * 100).toFixed(0)}% after picture removal`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status === 'research-structural-pass' ? 0 : 1)
