import assert from 'node:assert/strict'
import test from 'node:test'
import { publicRuntimeValidationError } from '../public-runtime-validation-error.mjs'
import { sanitizePublicResult, sanitizePublicAuthoredSpec } from '../blackbox.mjs'

const rawMessage = [
	'PptxGenJS: Repair-risk validation failed with 2 issue(s):',
	'Slide 7 (pull-owners-into-conversation.s07-owners-table.table): pull-owners-into-conversation.s07-owners-table.table.options.margin must be a number or four-number array from 0 to 100 points at a 0.01-point step [pull-owners-into-conversation.s07-owners-table.table.options.margin]',
	'Slide 7 (pull-owners-into-conversation.s07-owners-table.table): pull-owners-into-conversation.s07-owners-table.table.table[1][2].options.margin must be a number or four-number array from 0 to 100 points at a 0.01-point step [pull-owners-into-conversation.s07-owners-table.table.table[1][2].options.margin]',
	'',
	'Fix these object-model values before exporting; the serializer will not emit a PPTX with known repair-risk inputs.',
	"Use pptx.validate({ checks: ['repair'] }) for the detailed repair-risk report.",
].join('\n')

function inPublicMode(fn) {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try { return fn() }
	finally { if (previous === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX; else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous }
}

test('repair validation has actionable public table/cell constraints without runtime names or object-model paths', () => {
	const original = { code: 'TOOL_ERROR', message: rawMessage, requestId: 'request_123', details: { path: 'D:/private/engine.mjs', stack: 'private stack' } }
	const safe = publicRuntimeValidationError(original)
	assert.equal(safe.code, 'PRESENTATION_VALIDATION_FAILED')
	assert.equal(safe.details.issueCount, 2)
	assert.equal(safe.details.issues[0].slideNumber, 7)
	assert.equal(safe.details.issues[0].slideIndex, 6)
	assert.equal(safe.details.issues[0].field, 'margin')
	assert.equal(safe.details.issues[1].rowIndex, 1)
	assert.equal(safe.details.issues[1].columnIndex, 2)
	assert.equal(safe.details.issues[1].constraint, undefined, 'a legacy text-box point rule must not be repeated as the table contract')
	assert.match(safe.details.issues[1].fix, /do not share the same unit rules/)
	assert.equal(safe.next_actions[0].tool, 'betterpptx.deck.generate_from_spec')
	assert.equal(safe.requestId, 'request_123')
	for (const secret of ['PptxGenJS', 'pptx.validate(', '.options.', '.table[', 'serializer', 'D:/private', 'engine.mjs']) assert.equal(JSON.stringify(safe).includes(secret), false, secret)
	assert.equal(original.message, rawMessage)
})

test('actual public result sanitizer translates this nested error and remains idempotent', () => inPublicMode(() => {
	const safe = sanitizePublicResult({ ok: false, error: { code: 'TOOL_ERROR', message: rawMessage, recoverable: false } })
	assert.equal(safe.error.code, 'PRESENTATION_VALIDATION_FAILED')
	assert.equal(safe.error.recoverable, true)
	assert.match(safe.error.details.issues[0].message, /four-number/)
	assert.equal(safe.error.details.issues[0].constraint, undefined)
	assert.deepEqual(sanitizePublicResult(safe), safe)
	assert.equal(JSON.stringify(safe).includes('.options.'), false)
	assert.equal(JSON.stringify(safe).includes('PptxGenJS'), false)
}))

test('unknown repair findings remain blocked and generic while independent public input errors retain their detail', () => {
	assert.equal(publicRuntimeValidationError({ message: 'fontSize must be greater than zero.' }), null)
	const safe = publicRuntimeValidationError({ message: 'PptxGenJS: Repair-risk validation failed with 1 issue(s):\nSlide 3 (private.object): secret runtime detail at D:/private/model.glb [private.object.options.xyz]' })
	assert.equal(safe.details.issues[0].slideNumber, 3)
	assert.equal(safe.artifact_state, 'not_saved')
	assert.equal(JSON.stringify(safe).includes('secret runtime'), false)
	assert.equal(JSON.stringify(safe).includes('D:/private'), false)
})

test('corrected table rule preserves its stated range without inventing point or inch interpretation', () => {
	const corrected = publicRuntimeValidationError({ message: 'PptxGenJS: Repair-risk validation failed with 1 issue(s):\nSlide 7 (owners.table): owners.table.table[2][3].options.margin must be a finite number or four-number array from 0 to 56 in native table-cell margin units.' })
	assert.equal(corrected.details.issues[0].code, 'INVALID_MARGIN')
	assert.deepEqual(corrected.details.issues[0].constraint, { minimum: 0, maximum: 56, arrayLength: 4 })
	assert.equal(corrected.details.issues[0].rowIndex, 2)
	assert.equal(corrected.details.issues[0].columnIndex, 3)
})

test('visible client-authored words retain their existing provenance exemption, not a diagnostic exemption', () => inPublicMode(() => {
	const source = { title: 'PptxGenJS history', slides: [{ id: 's1', content: [{ kind: 'textBox', text: 'PptxGenJS is in this user-authored historical sentence.' }] }] }
	const authored = sanitizePublicAuthoredSpec(structuredClone(source), source)
	assert.equal(authored.title, source.title)
	assert.equal(authored.slides[0].content[0].text, source.slides[0].content[0].text)
	assert.equal(sanitizePublicResult({ error: { code: 'TOOL_ERROR', message: 'PptxGenJS: unrelated private diagnostic.' } }).error.message.includes('PptxGenJS'), false)
}))
