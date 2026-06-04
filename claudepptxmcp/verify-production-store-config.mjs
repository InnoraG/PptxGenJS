import { createArtifactStore } from './storage/artifact-store.mjs'
import { createEntitlementStore } from './auth/entitlement-store.mjs'

function fail(message, payload) {
	console.error('PRODUCTION STORE CONFIG: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function requireCode(label, fn, code) {
	try {
		fn()
		fail(`${label} did not fail`)
	} catch (err) {
		if (err?.code !== code) fail(`${label} failed with wrong code`, { expected: code, actual: err?.code, message: err?.message })
	}
}

async function main() {
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '1'
	delete process.env.BETTERPPTX_ARTIFACT_STORE
	delete process.env.BETTERPPTX_ENTITLEMENT_STORE
	requireCode('local artifact store with shared required', () => createArtifactStore(), 'ARTIFACT_STORE_NOT_SHARED')
	requireCode('local entitlement store with shared required', () => createEntitlementStore(), 'ENTITLEMENT_STORE_NOT_SHARED')

	process.env.BETTERPPTX_ARTIFACT_STORE = 'gcs'
	delete process.env.BETTERPPTX_GCS_BUCKET
	requireCode('gcs artifact store without bucket', () => createArtifactStore(), 'GCS_BUCKET_MISSING')

	process.env.BETTERPPTX_GCS_BUCKET = 'betterpptx-config-verify'
	process.env.BETTERPPTX_GCS_PREFIX = 'verify-prefix'
	const artifactStore = createArtifactStore()
	const artifactInfo = artifactStore.describe()
	if (artifactInfo.provider !== 'gcs' || artifactInfo.shared !== true || artifactInfo.bucketConfigured !== true) {
		fail('gcs artifact store did not describe as shared', artifactInfo)
	}

	process.env.BETTERPPTX_ENTITLEMENT_STORE = 'firestore'
	process.env.BETTERPPTX_FIRESTORE_ENTITLEMENTS_COLLECTION = 'betterpptx_verify_entitlements'
	const entitlementStore = createEntitlementStore()
	const entitlementInfo = entitlementStore.describe()
	if (entitlementInfo.provider !== 'firestore' || entitlementInfo.shared !== true) {
		fail('firestore entitlement store did not describe as shared', entitlementInfo)
	}

	console.log('PRODUCTION STORE CONFIG: PASS')
}

main().catch(err => fail(err?.message || String(err)))
