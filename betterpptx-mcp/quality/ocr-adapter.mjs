// Optional local OCR adapter for IMG4 no-text hard gates.
// The adapter is deliberately fail-closed: no binary, timeout, malformed output,
// or oversized input produces an incomplete result rather than a false "empty" scan.
// Images are written only to a short-lived OS temp directory and are removed in finally.
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
// Generated 1024px rasters are scanned on a short-lived 2x preparation image.
// Twelve seconds was too tight for a warm Windows Tesseract.js worker when a
// generation request evaluated more than one candidate; that made the hard
// no-text gate fail on OCR_TIMEOUT even when the pixels contained no text.
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_TESSDATA_DIR = path.resolve(MODULE_DIR, '..', 'assets', 'ocr')
const cryptoDigest = value => crypto.createHash('sha256').update(value).digest('hex')
let tesseractWorkerState = null

async function acquireTesseractWorker(language, langPath) {
	if (tesseractWorkerState?.language === language && tesseractWorkerState?.langPath === langPath && tesseractWorkerState.worker) {
		if (tesseractWorkerState.idleTimer) clearTimeout(tesseractWorkerState.idleTimer)
		return tesseractWorkerState.worker
	}
	if (tesseractWorkerState?.worker) await tesseractWorkerState.worker.terminate().catch(() => {})
	let createWorker
	try { ({ createWorker } = await import('tesseract.js')) } catch { return null }
	const worker = await createWorker(language, 1, { langPath, gzip: true, logger: () => {} })
	tesseractWorkerState = { worker, language, langPath, idleTimer: null }
	return worker
}

function scheduleTesseractWorkerIdleTermination() {
	if (!tesseractWorkerState?.worker) return
	if (tesseractWorkerState.idleTimer) clearTimeout(tesseractWorkerState.idleTimer)
	const state = tesseractWorkerState
	state.idleTimer = setTimeout(() => {
		if (tesseractWorkerState === state) {
			tesseractWorkerState = null
			state.worker.terminate().catch(() => {})
		}
	}, 1_000)
	state.idleTimer.unref?.()
}

// Small baked-in lettering is easy to miss at a generated raster's native
// resolution (especially after JPEG downsampling).  Upscale and lightly
// sharpen the short-lived OCR input so the no-text gate measures the pixels a
// reviewer can actually read.  The original bytes are never modified or
// persisted; this is only an OCR scan preparation step.
async function prepareScanBuffer(buffer, options = {}, maxBytes = DEFAULT_MAX_BYTES) {
	if (options.preprocess === false) return buffer
	const requestedScale = Number(options.scale ?? process.env.BETTERPPTX_OCR_SCALE ?? 2)
	const scale = Number.isFinite(requestedScale) ? Math.max(1, Math.min(4, requestedScale)) : 2
	if (scale <= 1) return buffer
	try {
		const metadata = await sharp(buffer).metadata()
		const width = Number(metadata.width || 0)
		const height = Number(metadata.height || 0)
		if (!(width > 0 && height > 0)) return buffer
		const targetWidth = Math.min(3072, Math.max(width, Math.round(width * scale)))
		if (targetWidth <= width) return buffer
		const prepared = await sharp(buffer)
			.resize({ width: targetWidth, withoutEnlargement: false })
			.sharpen({ sigma: 1 })
			.png()
			.toBuffer()
		return prepared.length <= maxBytes ? prepared : buffer
	} catch {
		return buffer
	}
}

function result(status, reason, extra = {}) {
	return { status, text: null, reason, ...extra }
}

function configuredBinary(options = {}) {
	const candidate = options.binary || process.env.BETTERPPTX_TESSERACT_BIN
	return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : 'tesseract'
}

function configuredBinaryOverride(options = {}) {
	return typeof options.binary === 'string' && options.binary.trim()
		? options.binary.trim()
		: (typeof process.env.BETTERPPTX_TESSERACT_BIN === 'string' && process.env.BETTERPPTX_TESSERACT_BIN.trim()
			? process.env.BETTERPPTX_TESSERACT_BIN.trim()
			: null)
}

async function runTesseractJs(buffer, options, timeout) {
	const language = String(options.language || process.env.BETTERPPTX_OCR_LANGUAGE || 'eng')
	if (!/^[a-z]{3}(?:\+[a-z]{3})*$/.test(language)) return result('blocked', 'OCR_LANGUAGE_NOT_ALLOWLISTED')
	const langPath = path.resolve(options.langPath || process.env.BETTERPPTX_TESSDATA_DIR || DEFAULT_TESSDATA_DIR)
	const trainedData = path.join(langPath, `${language}.traineddata.gz`)
	try { await fs.access(trainedData) } catch { return result('unavailable', 'OCR_TRAINEDDATA_UNAVAILABLE', { langPath, language }) }
	let worker
	let timer
	try {
		worker = await acquireTesseractWorker(language, langPath)
		if (!worker) return result('unavailable', 'OCR_JS_RUNTIME_UNAVAILABLE')
		const pageSegMode = String(options.pageSegMode || process.env.BETTERPPTX_OCR_PAGE_SEG_MODE || '11')
		const recognition = worker.recognize(buffer, { tessedit_pageseg_mode: pageSegMode })
		const bounded = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('OCR timeout'), { code: 'ETIMEDOUT' })), timeout) })
		const { data } = await Promise.race([recognition, bounded])
		const rawText = String(data?.text || '').trim()
		const minConfidence = Math.max(0, Math.min(Number(options.minConfidence ?? process.env.BETTERPPTX_OCR_MIN_CONFIDENCE ?? 60), 100))
		const readableTokens = (data?.words || [])
			.filter(word => Number(word?.confidence) >= minConfidence && /^[A-Za-z][A-Za-z'’-]{2,}$|^[0-9][0-9.,%]{1,}$/.test(String(word?.text || '').trim()))
			.map(word => String(word.text).trim())
		const text = readableTokens.join(' ')
		return { status: 'complete', text, rawTextLength: rawText.length, rawTextDigest: cryptoDigest(rawText), readableTokenCount: readableTokens.length, engine: 'tesseract.js', language, minConfidence, confidence: Number.isFinite(Number(data?.confidence)) ? Number(data.confidence) : null }
	} catch (error) {
		return result(error?.code === 'ETIMEDOUT' ? 'timeout' : 'unavailable', error?.code === 'ETIMEDOUT' ? 'OCR_TIMEOUT' : 'OCR_JS_EXECUTION_FAILED', { engine: 'tesseract.js', language })
	} finally {
		if (timer) clearTimeout(timer)
		if (worker) scheduleTesseractWorkerIdleTermination()
	}
}

export async function runLocalOcr(buffer, options = {}) {
	if (!Buffer.isBuffer(buffer) || buffer.length === 0) return result('invalid', 'OCR_INVALID_PAYLOAD')
	const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES)
	if (!Number.isFinite(maxBytes) || maxBytes <= 0 || buffer.length > maxBytes) {
		return result('blocked', 'OCR_PAYLOAD_TOO_LARGE', { maxBytes })
	}
	const timeout = Math.max(1000, Math.min(Number(options.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000))
	const scanBuffer = await prepareScanBuffer(buffer, options, maxBytes)
	const binaryOverride = configuredBinaryOverride(options)
	if (!binaryOverride && options.engine !== 'tesseract-cli') return runTesseractJs(scanBuffer, options, timeout)
	const binary = binaryOverride || configuredBinary(options)
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-ocr-'))
	const input = path.join(dir, 'input.png')
	const outputBase = path.join(dir, 'result')
	try {
		await fs.writeFile(input, scanBuffer, { flag: 'wx' })
		let stdout = ''
		try {
			({ stdout } = await execFileAsync(binary, [input, outputBase, '--psm', '6'], {
				cwd: dir,
				timeout,
				windowsHide: true,
				maxBuffer: 256 * 1024,
			}))
		} catch (error) {
			const code = error?.code === 'ETIMEDOUT' || error?.killed ? 'OCR_TIMEOUT' : (error?.code === 'ENOENT' ? 'OCR_BINARY_UNAVAILABLE' : 'OCR_EXECUTION_FAILED')
			return result('unavailable', code)
		}
		let text = ''
		try { text = await fs.readFile(`${outputBase}.txt`, 'utf8') } catch { return result('incomplete', 'OCR_OUTPUT_MISSING') }
		if (typeof text !== 'string') return result('incomplete', 'OCR_OUTPUT_INVALID')
		return { status: 'complete', text: text.trim(), engine: 'tesseract-local', stdout: String(stdout || '').slice(0, 512) }
	} finally {
		await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
	}
}

export function ocrGateInput(ocr) {
	return ocr && ocr.status === 'complete'
		? { status: 'complete', text: String(ocr.text || '') }
		: { status: ocr?.status || 'unavailable', text: null, reason: ocr?.reason || 'OCR_NOT_RUN' }
}
