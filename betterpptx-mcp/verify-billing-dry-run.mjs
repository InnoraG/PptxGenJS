import * as fs from 'node:fs'
import * as path from 'node:path'

import { createBillingLedgerStore } from './billing/ledger-store.mjs'
import { classifyBillingTool } from './billing/classifier.mjs'
import {
	buildBillingOperationFact,
	estimateBillingForTool,
	publicBillingDryRunSummary,
	recordBillingDryRunOperation,
} from './billing/estimator.mjs'
import { getBillingTelemetrySummary } from './telemetry.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

function fakeObject(type = 'shape') {
	return { type, options: { x: 1, y: 1, w: 1, h: 1 } }
}

function fakeDeck({ slides, plainObjects, richObjects, animations = 0, transitions = 0 } = {}) {
	const out = []
	for (let i = 0; i < slides; i++) {
		const objects = []
		const plainThisSlide = Math.floor(plainObjects / slides) + (i < plainObjects % slides ? 1 : 0)
		const richThisSlide = Math.floor(richObjects / slides) + (i < richObjects % slides ? 1 : 0)
		for (let j = 0; j < plainThisSlide; j++) objects.push(fakeObject('shape'))
		for (let j = 0; j < richThisSlide; j++) objects.push(fakeObject(j % 2 ? 'chart' : 'image'))
		out.push({
			_slideObjects: objects,
			transition: i < transitions ? { type: 'fade' } : null,
			_animations: Array.from({ length: i < animations ? 1 : 0 }, () => ({ effect: 'fade' })),
		})
	}
	return { pptx: { slides: out } }
}

process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_DRY_RUN = '1'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-dry-run-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

expect(classifyBillingTool('betterpptx.auth.status').category === 'free', 'Auth status should be free/control.', {})
expect(classifyBillingTool('betterpptx.slide.add_text').category === 'draft-accrual', 'Ordinary slide edits should be draft-accrual.', {})
expect(classifyBillingTool('betterpptx.deck.save').category === 'checkpoint', 'Deck save should be checkpoint-billed.', {})
expect(classifyBillingTool('betterpptx.narration.get_voice_timing').category === 'heavy', 'Narration synthesis should be heavy.', {})

const simple = estimateBillingForTool({
	name: 'betterpptx.deck.save',
	entry: fakeDeck({ slides: 2, plainObjects: 6, richObjects: 0 }),
	result: { bytes: 250 * 1024, slideCount: 2 },
})
const medium = estimateBillingForTool({
	name: 'betterpptx.deck.save',
	entry: fakeDeck({ slides: 7, plainObjects: 36, richObjects: 8, transitions: 3 }),
	result: { bytes: 3 * 1024 * 1024, slideCount: 7 },
})
const heavy = estimateBillingForTool({
	name: 'betterpptx.deck.save',
	entry: fakeDeck({ slides: 14, plainObjects: 120, richObjects: 40, animations: 10, transitions: 8 }),
	result: { bytes: 18 * 1024 * 1024, slideCount: 14 },
})
expect(simple.estimatedCredits > 0, 'Simple checkpoint should have a positive dry-run estimate.', { simple })
expect(simple.estimatedCredits < medium.estimatedCredits, 'Simple deck should cost less than medium deck.', { simple, medium })
expect(medium.estimatedCredits < heavy.estimatedCredits, 'Medium deck should cost less than heavy deck.', { medium, heavy })

const draft = estimateBillingForTool({
	name: 'betterpptx.slide.update_shape',
	args: { deckId: 'deck_verify_dry_run', text: 'Correction '.repeat(100) },
	result: { ok: true },
})
expect(draft.estimatedCredits === 0 && draft.classification.category === 'draft-accrual', 'Draft edit should accrue telemetry but not direct charges.', { draft })

const store = createBillingLedgerStore()
const context = { sessionId: 'session_verify_dry_run' }
for (let i = 0; i < 20; i++) {
	const recorded = await recordBillingDryRunOperation({
		name: 'betterpptx.slide.update_shape',
		args: {
			deckId: 'deck_verify_dry_run',
			target: `shape_${i}`,
			text: `raw user correction text ${i}`,
			filePath: 'C:\\secret\\do-not-store.pptx',
		},
		context,
		result: { changed: 1 },
		store,
	})
	expect(recorded.recorded === true, 'Draft dry-run operation should be recorded.', { recorded })
	expect(recorded.fact.estimatedCredits === 0, 'Draft dry-run operation should record zero direct credits.', { recorded })
}

const saveRecorded = await recordBillingDryRunOperation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_dry_run', idempotencyKey: 'save-1', outputDir: 'C:\\secret\\output' },
	context,
	entry: fakeDeck({ slides: 7, plainObjects: 36, richObjects: 8 }),
	result: { bytes: 3 * 1024 * 1024, slideCount: 7 },
	store,
})
expect(saveRecorded.recorded === true, 'Save dry-run operation should be recorded.', { saveRecorded })
expect(saveRecorded.fact.estimatedCredits === medium.estimatedCredits, 'Recorded save estimate should match medium estimate.', { saveRecorded, medium })

const heavyRecorded = await recordBillingDryRunOperation({
	name: 'betterpptx.narration.get_voice_timing',
	args: { text: 'Narration '.repeat(1200), idempotencyKey: 'tts-1' },
	context,
	result: { audioHandle: 'asset://generated/audio/verify' },
	store,
})
expect(heavyRecorded.fact.estimatedCredits > 0, 'Heavy dry-run operation should estimate direct credits.', { heavyRecorded })

const freeRecorded = await recordBillingDryRunOperation({
	name: 'betterpptx.auth.status',
	args: {},
	context,
	result: {},
	store,
})
expect(freeRecorded.recorded === false && freeRecorded.reason === 'free-tool', 'Free tools should not create ledger operation facts.', { freeRecorded })

const summary = publicBillingDryRunSummary(getBillingTelemetrySummary())
expect(summary.mode === 'dry_run', 'Public billing summary should report dry-run mode.', { summary })
expect(summary.operations === 22, 'Billing telemetry should count 20 draft + 1 save + 1 heavy operation.', { summary })
expect(summary.byCategory['draft-accrual'] === 20, 'Draft operation count should be summarized.', { summary })
expect(summary.byCategory.checkpoint === 1, 'Checkpoint count should be summarized.', { summary })
expect(summary.byCategory.heavy === 1, 'Heavy count should be summarized.', { summary })

const fact = buildBillingOperationFact({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_dry_run', outputDir: 'C:\\secret\\another-output' },
	context,
	result: { bytes: 1024, slideCount: 1 },
	entry: fakeDeck({ slides: 1, plainObjects: 1, richObjects: 0 }),
})
expect(fact.argSummary.hasFilePath === true, 'Arg summary should preserve only the fact that a path-like arg existed.', { fact })

const ledgerText = fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8')
expect(!ledgerText.includes('C:\\secret'), 'Dry-run ledger should not persist raw local paths.', {})
expect(!ledgerText.includes('raw user correction text'), 'Dry-run ledger should not persist raw user text.', {})

console.log(`BILLING DRY RUN: PASS simple=${simple.estimatedCredits} medium=${medium.estimatedCredits} heavy=${heavy.estimatedCredits} operations=${summary.operations}`)
