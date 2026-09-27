import test from 'node:test'
import assert from 'node:assert/strict'
import {
	PRODUCTION_TALKING_HEAD_ENHANCEMENT,
	PRODUCTION_TALKING_HEAD_CONTRACT_VERSION,
	PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
	PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
	PRODUCTION_TALKING_HEAD_PIPELINE,
	PRODUCTION_TALKING_HEAD_PROVIDER,
	assertProductionTalkingHeadAttestation,
	productionTalkingHeadOnlyEnabled,
	resolveProductionTalkingHeadOptions,
	resolveProductionTalkingHeadProvider,
} from '../avatar/production-profile.mjs'
import { normalizeAvatarMotionProfile, normalizeAvatarMouthProfile, avatarWorkerAccounts } from '../avatar/providers/musetalkHttp.mjs'
import { renderWithAvatarProvider } from '../avatar/providers/index.mjs'

const productionEnv = {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_AVATAR_PRODUCTION_ONLY: '1',
	BETTERPPTX_AVATAR_PROVIDER: PRODUCTION_TALKING_HEAD_PROVIDER,
	BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE: PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
	BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE: PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
}

test('production talking-head routing is commercial-only and cannot be overridden', () => {
	assert.match(PRODUCTION_TALKING_HEAD_CONTRACT_VERSION, /^commercial-only-reviewed-/)
	assert.equal(productionTalkingHeadOnlyEnabled(productionEnv), true)
	assert.equal(resolveProductionTalkingHeadProvider(undefined, { env: productionEnv }), PRODUCTION_TALKING_HEAD_PROVIDER)
	assert.equal(resolveProductionTalkingHeadProvider(PRODUCTION_TALKING_HEAD_PROVIDER, { env: productionEnv }), PRODUCTION_TALKING_HEAD_PROVIDER)
	for (const alternate of ['test-static', 'musetalk', 'liveportrait-musetalk', 'sadtalker', 'disabled']) {
		assert.throws(
			() => resolveProductionTalkingHeadProvider(alternate, { env: productionEnv }),
			(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_REQUIRED',
		)
	}
})

test('explicit production-only mode wins over a development switch', () => {
	const env = { ...productionEnv, BETTERPPTX_AVATAR_DEVELOPMENT_MODE: '1' }
	assert.equal(productionTalkingHeadOnlyEnabled(env), true)
	assert.throws(
		() => resolveProductionTalkingHeadProvider('test-static', { env }),
		(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_REQUIRED',
	)
})

test('the executable provider dispatcher rejects a non-commercial production request before rendering', async () => {
	const previous = Object.fromEntries([
		'BETTERPPTX_PUBLIC_BLACK_BOX',
		'BETTERPPTX_AVATAR_PRODUCTION_ONLY',
		'BETTERPPTX_AVATAR_PROVIDER',
	].map(key => [key, process.env[key]]))
	try {
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
		process.env.BETTERPPTX_AVATAR_PRODUCTION_ONLY = '1'
		process.env.BETTERPPTX_AVATAR_PROVIDER = PRODUCTION_TALKING_HEAD_PROVIDER
		await assert.rejects(
			renderWithAvatarProvider('test-static', {}),
			(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_REQUIRED',
		)
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})

test('the approved production motion and mouth profiles are frozen together', () => {
	const options = resolveProductionTalkingHeadOptions(PRODUCTION_TALKING_HEAD_PROVIDER, {}, {
		env: productionEnv,
		normalizeMotionProfile: normalizeAvatarMotionProfile,
		normalizeMouthProfile: normalizeAvatarMouthProfile,
	})
	assert.equal(options.motionProfile, 'blink')
	assert.equal(options.mouthProfile, 'jaw')
	assert.equal(normalizeAvatarMouthProfile('jaw'), 'jaw')
	assert.throws(
		() => resolveProductionTalkingHeadOptions(PRODUCTION_TALKING_HEAD_PROVIDER, { motionProfile: 'low' }, {
			env: productionEnv,
			normalizeMotionProfile: normalizeAvatarMotionProfile,
			normalizeMouthProfile: normalizeAvatarMouthProfile,
		}),
		(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_REQUIRED',
	)
	assert.throws(
		() => resolveProductionTalkingHeadOptions(PRODUCTION_TALKING_HEAD_PROVIDER, { mouthProfile: 'jaw-strong' }, {
			env: productionEnv,
			normalizeMotionProfile: normalizeAvatarMotionProfile,
			normalizeMouthProfile: normalizeAvatarMouthProfile,
		}),
		(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_REQUIRED',
	)
})

test('commercial responses must attest the approved private pipeline and profile', () => {
	const approved = {
		pipeline: PRODUCTION_TALKING_HEAD_PIPELINE,
		enhancement: PRODUCTION_TALKING_HEAD_ENHANCEMENT,
		motionProfile: PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
		mouthProfile: PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
		restorationSeconds: 1.25,
	}
	assert.equal(assertProductionTalkingHeadAttestation(PRODUCTION_TALKING_HEAD_PROVIDER, approved, { env: productionEnv }), true)
	for (const invalid of [
		{ ...approved, pipeline: '' },
		{ ...approved, enhancement: '' },
		{ ...approved, restorationSeconds: 0 },
		{ ...approved, motionProfile: 'low' },
		{ ...approved, mouthProfile: 'jaw-strong' },
	]) {
		assert.throws(
			() => assertProductionTalkingHeadAttestation(PRODUCTION_TALKING_HEAD_PROVIDER, invalid, { env: productionEnv }),
			(error) => error?.code === 'AVATAR_PRODUCTION_PROFILE_MISMATCH',
		)
	}
})

test('commercial worker discovery never falls back to the generic worker namespace', () => {
	const previous = Object.fromEntries([
		'BETTERPPTX_CREDENTIAL_STORE',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL',
		'BETTERPPTX_AVATAR_WORKER_URL',
		'BETTERPPTX_AVATAR_WORKER_ROUTE',
		'BETTERPPTX_AVATAR_WORKER_TOKEN',
	].map(key => [key, process.env[key]]))
	try {
		process.env.BETTERPPTX_CREDENTIAL_STORE = 'Z:\\betterpptx-does-not-exist\\credential-store.json'
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL
		process.env.BETTERPPTX_AVATAR_WORKER_URL = 'https://generic.invalid'
		process.env.BETTERPPTX_AVATAR_WORKER_TOKEN = 'generic-token'
		assert.deepEqual(avatarWorkerAccounts(PRODUCTION_TALKING_HEAD_PROVIDER), [])
		process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL = 'https://commercial.invalid'
		process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE = '/'
		process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN = 'commercial-token'
		assert.deepEqual(avatarWorkerAccounts(PRODUCTION_TALKING_HEAD_PROVIDER), [{
			id: 'env',
			url: 'https://commercial.invalid',
			route: '/',
			token: 'commercial-token',
			weight: undefined,
		}])
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})

test('commercial worker discovery accepts a commercial-only environment pool for quota rotation', () => {
	const previous = Object.fromEntries([
		'BETTERPPTX_CREDENTIAL_STORE',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE',
		'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN',
	].map(key => [key, process.env[key]]))
	try {
		process.env.BETTERPPTX_CREDENTIAL_STORE = 'Z:\\betterpptx-does-not-exist\\credential-store.json'
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_URL
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_ROUTE
		delete process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_TOKEN
		process.env.BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL = JSON.stringify([
			{ id: 'commercial-a', url: 'https://commercial-a.invalid', route: '/', token: 'token-a', weight: 2 },
			{ id: 'commercial-b', url: 'https://commercial-b.invalid', route: '/render', token: 'token-b', weight: 1 },
		])
		assert.deepEqual(avatarWorkerAccounts(PRODUCTION_TALKING_HEAD_PROVIDER), [
			{ id: 'commercial-a', url: 'https://commercial-a.invalid', route: '/', token: 'token-a', weight: 2 },
			{ id: 'commercial-b', url: 'https://commercial-b.invalid', route: '/render', token: 'token-b', weight: 1 },
		])
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
})
