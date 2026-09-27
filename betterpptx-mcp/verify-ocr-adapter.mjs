// OCR adapter contract tests. No OCR binary or customer image is required.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ocrGateInput, runLocalOcr } from './quality/ocr-adapter.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const fixture = await fs.readFile(path.join(root, 'deploy', 'image-edit-worker', 'canary-multi-reference.png'))
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}

console.log('IMG4 OCR ADAPTER (offline contract):')
const invalid = await runLocalOcr(Buffer.alloc(0))
ok('invalid payload is rejected', invalid.status === 'invalid' && invalid.reason === 'OCR_INVALID_PAYLOAD')
const oversized = await runLocalOcr(Buffer.alloc(1024), { maxBytes: 32 })
ok('oversized payload is blocked before execution', oversized.status === 'blocked' && oversized.reason === 'OCR_PAYLOAD_TOO_LARGE')
const unavailable = await runLocalOcr(fixture, { binary: '__betterpptx_missing_tesseract__' })
ok('missing binary is unavailable and never treated as empty text', unavailable.status === 'unavailable' && unavailable.reason === 'OCR_BINARY_UNAVAILABLE' && unavailable.text === null)
const normalized = ocrGateInput({ status: 'complete', text: '  hello  ' })
ok('completed OCR is normalized for the deterministic gate', normalized.status === 'complete' && normalized.text === '  hello  ')
const incomplete = ocrGateInput({ status: 'timeout', reason: 'OCR_TIMEOUT' })
ok('incomplete OCR remains fail-closed', incomplete.status === 'timeout' && incomplete.text === null && incomplete.reason === 'OCR_TIMEOUT')
const dimensions = await sharp(fixture).metadata()
ok('tests use the owned synthetic fixture only', dimensions.width === 1024 && dimensions.height === 1024)

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

