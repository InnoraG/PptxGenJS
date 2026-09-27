import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-production-policy-'))
Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0',
	BETTERPPTX_ENV: 'production',
	BETTERPPTX_DEPLOYMENT_STAGE: 'production',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
	BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW: '0',
	BETTERPPTX_FORCE_PLAN: '',
	BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_PROVIDER: 'crypto_credits',
	BETTERPPTX_BILLING_MODEL: 'pay_per_job',
	BETTERPPTX_BILLING_ENFORCE: '1',
	BETTERPPTX_BILLING_DRY_RUN: '0',
	BETTERPPTX_BILLING_SHADOW_MODE: '0',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_BILLING_LEDGER_FILE: path.join(artifactRoot, 'ledger.json'),
	BETTERPPTX_ASSET_GRANT_STORE: 'firestore',
	BETTERPPTX_INSTALL_USAGE_STORE: 'local',
	BETTERPPTX_INSTALL_USAGE_FILE: path.join(artifactRoot, 'usage.json'),
	BETTERPPTX_ENTITLEMENTS_FILE: path.join(artifactRoot, 'entitlements.json'),
	BETTERPPTX_AUTH: 'none',
	BETTERPPTX_URL_SECRET: '',
	BETTERPPTX_PUBLIC_BASE: '',
	BETTERPPTX_DOWNLOAD_ROOT: artifactRoot,
	BETTERPPTX_LOG: '',
})

// Exercise the production shared-grant contract without contacting a cloud
// database. Real IAM, persistence and disaster recovery are separate live gates.
const sharedGrantFixture = new BillingSecurityFirestore()
const { createMcpToolDispatcher, authoritativePreviewInfrastructureStatus, setAssetGrantFirestoreClientForTest } = await import('../engine.mjs')
setAssetGrantFirestoreClientForTest(sharedGrantFixture)
const installHash = `install_${'c'.repeat(64)}`
const paidJobAuthorization = {
	paymentModel: 'one_payment_per_job',
	settled: true,
	jobId: 'production-policy-job',
	quoteId: 'production-policy-quote',
}

function dataOf(result, label) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

function minimalSpec(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title,
		layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		contentStory: { audience: 'Leaders', outcome: 'Understand the decision.', remember: 'Choose with evidence.' },
		visualDesign: { world: 'Clear', framing: 'One message.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
		validation: { validateBeforeSave: true },
		slides: [{
			id: 'slide-1',
			title,
			message: 'Choose with evidence.',
			layoutIntent: 'title-only',
			content: [{ kind: 'title', name: 'headline', text: 'Choose with evidence.', rect: { x: 0.9, y: 2.35, w: 11.5, h: 1.2 } }],
		}],
	}
}

test('production save succeeds without PowerPoint and remains blocked without current validation evidence', async () => {
	try {
		const preview = authoritativePreviewInfrastructureStatus()
		assert.equal(preview.policy, 'production-non-rendering')
		assert.equal(preview.rendererRequiredForSave, false)
		assert.equal(preview.available, false)

		const dispatcher = createMcpToolDispatcher({
			installHash,
			__paidJobAuthorization: paidJobAuthorization,
			__skipDurableOperationLedger: true,
			sessionId: `production-policy-${Date.now()}`,
			clientInfo: { name: 'production-non-rendering-regression', version: '1' },
			blackBox: true,
		})
		const committed = dataOf(await dispatcher.call('betterpptx.deck.generate_from_spec', {
			spec: minimalSpec('Production policy pass'),
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'summary',
		}), 'commit')
		const validated = dataOf(await dispatcher.call('betterpptx.deck.validate_quality', {
			deckId: committed.deckId,
			profile: 'modern',
		}), 'validate_quality')
		assert.equal(validated.ok, true)
		const nativeAudit = dataOf(await dispatcher.call('betterpptx.deck.validate_native_visuals', {
			deckId: committed.deckId,
		}), 'validate_native_visuals')
		assert.ok(nativeAudit.nativeRepresentation.nativeObjects > 0)
		assert.equal(nativeAudit.atmosphereReadback.coverageStatus, 'not-applicable')
		assert.equal(nativeAudit.atmosphereReadback.structuralNativeCoverage, null)
		assert.equal(nativeAudit.atmosphereReadback.perceptualVerification.status, 'not-performed')
		assert.equal(nativeAudit.authoritativePowerPointReopen.status, 'not-requested')
		assert.ok(nativeAudit.packageAudit.objectEvidence.some(item => item.objectName))
		const saved = dataOf(await dispatcher.call('betterpptx.deck.save', {
			deckId: committed.deckId,
			idempotencyKey: 'production-policy-pass-v1',
			outputFormat: 'pptx',
		}), 'save')
		assert.equal(saved.verification?.policy, 'production-non-rendering')
		assert.equal(saved.verification?.environmentMode, 'production')
		assert.equal(saved.verification?.renderPerformed, false)
		assert.equal(saved.verification?.previewStatus, 'not-performed-by-policy')
		assert.match(String(saved.verification?.packageSha256 || ''), /^[a-f0-9]{64}$/)
		assert.match(String(saved.verification?.validationEvidenceSha256 || ''), /^[a-f0-9]{64}$/)
		assert.equal(saved.verification?.packageSafety?.passed, true)
		assert.equal(saved.verification?.selectionVerification?.status, 'not-requested')
		assert.equal('passed' in saved.verification.selectionVerification, false)
		assert.match(saved.verification?.statement, /not performed/i)

		const unvalidatedDispatcher = createMcpToolDispatcher({
			installHash,
			__paidJobAuthorization: { ...paidJobAuthorization, jobId: 'production-policy-negative-job', quoteId: 'production-policy-negative-quote' },
			__skipDurableOperationLedger: true,
			sessionId: `production-policy-negative-${Date.now()}`,
			clientInfo: { name: 'production-non-rendering-regression', version: '1' },
			blackBox: true,
		})
		const unvalidated = dataOf(await unvalidatedDispatcher.call('betterpptx.deck.generate_from_spec', {
			spec: minimalSpec('Production policy negative'),
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'summary',
		}), 'negative commit')
		const rejected = await unvalidatedDispatcher.call('betterpptx.deck.save', {
			deckId: unvalidated.deckId,
			idempotencyKey: 'production-policy-negative-v1',
			outputFormat: 'pptx',
		})
		assert.equal(rejected.ok, false)
		assert.equal(rejected.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED')
		assert.equal(rejected.error?.artifact_state, 'not_saved')
	} finally {
		setAssetGrantFirestoreClientForTest(null)
		await fs.rm(artifactRoot, { recursive: true, force: true })
	}
})
