// Corpus-wide local OCR evidence for noText image requests.
// The corpus is owned-synthetic only. OCR text is never written to the report;
// only a digest and length are retained so accidental text does not leak.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorker } from 'tesseract.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outputs = path.join(here, 'outputs')
const readJson = async name => JSON.parse(await fs.readFile(path.join(outputs, name), 'utf8').then(value => value.replace(/^\uFEFF/, '')))

const sourceReports = [
	'contextual-authoring-corpus-report.json',
	'photorealistic-contextual-corpus-report.json',
	'live-modal-image-generation-bakeoff-report.json',
]
const imageRecords = []
for (const source of sourceReports) {
	const report = await readJson(source)
	for (const result of report.results || []) {
		const variants = result.create || result.edit ? [['create', result.create], ['edit', result.edit]] : [['bakeoff', result]]
		for (const [variant, item] of variants) {
			if (!item?.outputPath) continue
			imageRecords.push({ source, id: `${result.id || result.caseId || result.lane}-${variant}`, variant, outputPath: item.outputPath })
		}
	}
}

function resolveOutput(outputPath) {
	const normalized = String(outputPath).replaceAll('\\', '/')
	const absolute = normalized.startsWith('betterpptx-mcp/') ? path.resolve(root, normalized) : path.resolve(here, normalized)
	const allowed = path.resolve(outputs) + path.sep
	if (!absolute.startsWith(allowed)) throw new Error(`output outside research output boundary: ${outputPath}`)
	return absolute
}

const langPath = path.join(here, 'assets', 'ocr')
const trainedDataPath = path.join(langPath, 'eng.traineddata.gz')
const trainedData = await fs.readFile(trainedDataPath)
const worker = await createWorker('eng', 1, { langPath, gzip: true, logger: () => {} })
const results = []
try {
	for (const record of imageRecords) {
		const absolute = resolveOutput(record.outputPath)
		const bytes = await fs.readFile(absolute)
		let ocr
		try {
			const response = await worker.recognize(bytes, { tessedit_pageseg_mode: '6' })
			const rawText = String(response.data?.text || '').trim()
			const minConfidence = 70
			const readableTokens = (response.data?.words || [])
				.filter(word => Number(word?.confidence) >= minConfidence && /^[A-Za-z][A-Za-z'’-]{2,}$|^[0-9][0-9.,%]{1,}$/.test(String(word?.text || '').trim()))
				.map(word => String(word.text).trim())
			const text = readableTokens.join(' ')
			ocr = {
				status: 'complete',
				textLength: text.length,
				textDigest: crypto.createHash('sha256').update(text).digest('hex'),
				rawTextLength: rawText.length,
				rawTextDigest: crypto.createHash('sha256').update(rawText).digest('hex'),
				readableTokenCount: readableTokens.length,
				minConfidence,
				confidence: Number.isFinite(Number(response.data?.confidence)) ? Number(response.data.confidence) : null,
				noReadableText: text.length === 0,
			}
		} catch (error) {
			ocr = { status: 'unavailable', reason: 'OCR_JS_EXECUTION_FAILED', errorCode: String(error?.code || 'unknown') }
		}
		results.push({ ...record, bytes: bytes.length, ocr })
	}
} finally {
	await worker.terminate().catch(() => {})
}

const complete = results.length === imageRecords.length && results.every(result => result.ocr.status === 'complete')
const noText = complete && results.every(result => result.ocr.noReadableText)
const report = {
	schemaVersion: 'betterpptx.image-authoring-ocr-corpus.v1',
	status: noText ? 'research-ocr-no-text-pass' : (complete ? 'blocked-ocr-detected-text' : 'blocked-ocr-incomplete'),
	engine: 'tesseract.js',
	engineVersion: '5.1.1',
	language: 'eng',
	trainedData: { file: 'assets/ocr/eng.traineddata.gz', sha256: crypto.createHash('sha256').update(trainedData).digest('hex'), bytes: trainedData.length, license: 'Apache-2.0 (tesseract-ocr tessdata)' },
	sourceReports,
	imageCount: imageRecords.length,
	complete,
	noText,
	results,
	ownedSyntheticOnly: true,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Corpus-wide local OCR evidence for generated research rasters. OCR text is intentionally omitted from this report; only length/digest are retained. This does not enable semantic auto-accept or production activation.',
}
const outputPath = path.join(outputs, 'image-authoring-ocr-corpus-report.json')
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
for (const result of results) console.log(`  ${result.ocr.noReadableText ? 'ok  ' : 'OPEN'} ${result.id}: ${result.ocr.status}, textLength=${result.ocr.textLength ?? 'n/a'}`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status === 'research-ocr-no-text-pass' ? 0 : 1)
