import assert from 'node:assert/strict'
import test from 'node:test'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_ENV = 'production'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'production'
process.env.BETTERPPTX_VERIFICATION_POLICY = 'production-non-rendering'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_MODEL = 'pay_per_job'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_ASSET_GRANT_STORE = 'firestore'

const sharedGrantFixture = new BillingSecurityFirestore()
test.mock.module('@google-cloud/firestore', { namedExports: { Firestore: class { constructor() { return sharedGrantFixture } } } })

const {
	publicGeneratedImagePolicy,
	generatedImageUnavailableInProductionError,
} = await import('../verification-policy.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')

test('production allows generated images independently of PowerPoint preview', () => {
	const policy = publicGeneratedImagePolicy({ env: {
		BETTERPPTX_ENV: 'production',
		BETTERPPTX_DEPLOYMENT_STAGE: 'production',
	} })
	assert.equal(policy.available, true)
	assert.equal(policy.executableNow, true)
	assert.equal(policy.productionAvailable, true)
	assert.equal(policy.clientMayOverride, false)
	assert.equal(policy.materialization, 'permitted-by-deployment-policy')
	assert.equal(policy.rendererDependency, 'none')
	assert.match(policy.intentRule, /PowerPoint preview is not required/i)
	assert.equal(generatedImageUnavailableInProductionError({ env: {
		BETTERPPTX_ENV: 'production',
		BETTERPPTX_DEPLOYMENT_STAGE: 'production',
	} }), null)
})

test('an explicit deployment disable remains authoritative and cannot be client-overridden', () => {
	const env = {
		BETTERPPTX_ENV: 'production',
		BETTERPPTX_DEPLOYMENT_STAGE: 'production',
		BETTERPPTX_GENERATED_IMAGE_POLICY: 'disabled',
	}
	const policy = publicGeneratedImagePolicy({ env })
	assert.equal(policy.available, false)
	assert.equal(policy.productionAvailable, false)
	assert.equal(policy.clientMayOverride, false)
	assert.equal(generatedImageUnavailableInProductionError({ env })?.code, 'IMAGE_GENERATION_DISABLED_BY_DEPLOYMENT_POLICY')
})

test('production dry-run accepts generated-image intent without treating PowerPoint as a dependency', async () => {
	const dispatcher = createMcpToolDispatcher({
		__skipDurableOperationLedger: true,
		sessionId: `production-image-spec-policy-${Date.now()}`,
		clientInfo: { name: 'production-image-spec-policy-test', version: '1' },
		blackBox: true,
	})
	const result = await dispatcher.call('betterpptx.deck.generate_from_spec', {
		phase: 'dryRun',
		dryRun: true,
		commitMode: 'createNew',
		spec: {
			schemaVersion: 'betterpptx.deck-spec.v1',
			title: 'Production visual intent',
			authoringContract: { workflow: 'authoring-excellence-director-v1' },
			contentStory: { audience: 'Leaders', outcome: 'See the concept.', remember: 'Keep intent native.' },
			visualDesign: { world: 'Clear', framing: 'One visual concept.' },
			motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'manual' },
			slides: [{ id: 'slide-1', title: 'Intent', message: 'Keep intent native.', layoutIntent: 'title-only', content: [{ kind: 'image', name: 'generated-concept', visualIntent: { mode: 'auto', purpose: 'conceptual-hero', concept: 'A visual concept for the decision.' } }] }],
		},
	})
	assert.equal(result.ok, true, JSON.stringify(result))
	assert.equal(result.data?.phase, 'dryRun')
	assert.equal(result.data?.mutationFree, true)
})
