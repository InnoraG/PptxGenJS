// IMG4 frozen corpus smoke gate. This is deliberately a small owned synthetic corpus;
// it does not claim broad semantic quality or production readiness.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const worker = path.join(root, 'deploy', 'image-edit-worker')
const corpus = JSON.parse(await fs.readFile(path.join(root, 'quality', 'image-quality-corpus.json'), 'utf8'))
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}

console.log(`IMG4 FROZEN SYNTHETIC CORPUS (${corpus.version}):`)
ok('corpus declares owned fixtures and no customer images', corpus.ownership.startsWith('owned-') && corpus.customerImages === false)
ok('corpus has at least five deterministic records', Array.isArray(corpus.records) && corpus.records.length >= 5)
const results = []
for (const record of corpus.records) {
	const filePath = record.file.startsWith('synthetic-') ? path.join(worker, 'fixtures', record.file) : path.join(worker, record.file)
	const buffer = await fs.readFile(filePath)
	const result = await evaluateImageQuality(buffer, {
		aspect: record.aspect,
		noText: record.noText === true,
		...(record.noText ? { ocr: { status: 'complete', text: '' } } : {}),
	})
	results.push({ id: record.id, status: result.status, averageHash: result.measurements?.averageHash })
	ok(`${record.id} passes deterministic hard gates`, result.status === 'pass')
}
const hashes = results.map(item => item.averageHash)
ok('corpus includes more than one accepted visual digest', new Set(hashes).size > 1)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
