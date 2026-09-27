import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import {
	calculateJwkThumbprint,
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	SignJWT,
} from 'jose'
import { createVerifiedIdentityVerifier } from '../auth/verified-identity.mjs'

// Entirely offline, ephemeral synthetic keys/tokens. No credential files, live
// service startup, environment mutations, network calls or persistent writes.
const issuer = 'https://issuer.example.test'
const audience = 'https://api.example.test'
const secret = randomBytes(32).toString('hex')
const env = Object.freeze({
	BETTERPPTX_OAUTH_ISSUER: issuer,
	BETTERPPTX_OAUTH_AUDIENCE: audience,
	BETTERPPTX_OAUTH_JWKS_URL: `${issuer}/jwks`,
	BETTERPPTX_INSTALL_HMAC_SECRET: secret,
})
const algorithms = ['RS256', 'ES256', 'PS256']
const keys = Object.fromEntries(await Promise.all(algorithms.map(async alg => {
	const pair = await generateKeyPair(alg, { extractable: true })
	return [alg, { ...pair, jwk: { ...await exportJWK(pair.publicKey), kid: alg, alg, use: 'sig' } }]
})))
const attacker = await generateKeyPair('ES256', { extractable: true })
const attackerJwk = await exportJWK(attacker.publicKey)
const proofKey = keys.ES256
const jkt = await calculateJwkThumbprint(proofKey.jwk)
const jwks = { keys: Object.values(keys).map(key => key.jwk) }
const localKeys = createLocalJWKSet(jwks)
const now = () => Math.floor(Date.now() / 1000)
const verifier = (overrides = {}, keyResolver = localKeys) => createVerifiedIdentityVerifier({
	env: { ...env, ...overrides }, keyResolver,
})

async function access(claims = {}, header = {}, key) {
	const alg = header.alg ?? 'ES256'
	return new SignJWT({
		iss: issuer, aud: audience, sub: 'account-a', iat: now(), exp: now() + 600,
		jti: randomUUID(), client_id: 'test-client', scope: 'betterpptx', ...claims,
	}).setProtectedHeader({ alg, typ: 'at+jwt', kid: alg, ...header })
		.sign(key ?? keys[alg].privateKey)
}

const request = (token, headers = {}, method = 'POST') => ({
	method, originalUrl: '/mcp', headers: { authorization: `Bearer ${token}`, ...headers },
})

async function dpop(token, claims = {}, header = {}, key = proofKey.privateKey) {
	return new SignJWT({
		iat: now(), jti: randomUUID(), htm: 'POST', htu: `${audience}/mcp`,
		ath: createHash('sha256').update(token, 'ascii').digest('base64url'), ...claims,
	}).setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: proofKey.jwk, ...header }).sign(key)
}

const dpopRequest = (token, proof, headers = {}, method = 'POST') => request(token, {
	authorization: `DPoP ${token}`, dpop: proof, ...headers,
}, method)

async function rejects(promise, status = 401) {
	await assert.rejects(promise, error => {
		assert.equal(error.status, status)
		assert.equal(error.statusCode, status)
		assert.equal(error.name, 'VerifiedIdentityError')
		assert.equal(error.message, ({ 401: 'Authentication required.', 403: 'Access denied.', 503: 'Authentication unavailable.' })[status])
		assert.equal(error.code, ({ 401: 'AUTHENTICATION_REQUIRED', 403: 'ACCESS_DENIED', 503: 'AUTHENTICATION_UNAVAILABLE' })[status])
		assert.deepEqual(Object.keys(error).sort(), ['code', 'name', 'status', 'statusCode'])
		assert.equal(error.cause, undefined)
		return true
	})
}

test('all three allowed asymmetric algorithms return only frozen server identity', async () => {
	for (const alg of algorithms) {
		const expires = now() + 300
		const identity = await verifier().verifyRequest(request(await access({ exp: expires, scope: 'read betterpptx read' }, { alg })))
		assert.deepEqual(identity, {
			installHash: `install_${createHmac('sha256', secret)
				.update(JSON.stringify(['betterpptx:oauth-identity:v1', issuer, 'account-a'])).digest('hex')}`,
			authenticated: true, authenticationBasis: 'oauth-access-token', expiresAt: expires, scope: 'betterpptx read',
		})
		assert.equal(Object.isFrozen(identity), true)
	}
	assert.equal(Object.isFrozen(verifier()), true)
})

test('empty, partial, invalid and unrelated-secret configuration fails closed', async () => {
	const configurations = [{}, { BETTERPPTX_URL_SECRET: secret }, { BETTERPPTX_OAUTH_REQUIRE_DPOP: '1' }]
	for (const name of Object.keys(env)) {
		const partial = { ...env }
		delete partial[name]
		configurations.push(partial, { ...env, [name]: '' })
	}
	for (const field of ['BETTERPPTX_OAUTH_ISSUER', 'BETTERPPTX_OAUTH_AUDIENCE', 'BETTERPPTX_OAUTH_JWKS_URL']) {
		for (const value of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/#',
			'https://example.test/?', '/relative', 'https://example.test\\other', ' https://example.test']) {
			configurations.push({ ...env, [field]: value })
		}
	}
	for (const [field, values] of Object.entries({
		BETTERPPTX_INSTALL_HMAC_SECRET: ['s'.repeat(31), ' '.repeat(32), 1234],
		BETTERPPTX_OAUTH_REQUIRE_DPOP: ['', 'true', 'yes', 1],
		BETTERPPTX_OAUTH_TOKEN_PROFILE: ['', 'auto', 'JWT', 'Keycloak', false, null],
		BETTERPPTX_OAUTH_REQUIRED_ACR: ['', [], ' acr'],
		BETTERPPTX_OAUTH_REQUIRED_AMR: ['', 'pwd  mfa', 'pwd\tmfa', []],
		BETTERPPTX_OAUTH_DPOP_REPLAY_MAX_ENTRIES: ['', '0', '-1', '1.5', '10001', 'Infinity', '01'],
	})) for (const value of values) configurations.push({ ...env, [field]: value })
	for (const configuration of configurations) {
		let calls = 0
		const disabled = createVerifiedIdentityVerifier({ env: configuration, keyResolver: () => { calls += 1 } })
		assert.equal(disabled.configured, false)
		await rejects(disabled.verifyRequest({ headers: { 'x-openai-subject': 'spoof' } }), 503)
		assert.equal(calls, 0)
	}
	assert.equal(createVerifiedIdentityVerifier({ env: { ...env, BETTERPPTX_OAUTH_TOKEN_PROFILE: 'keycloak' }, keyResolver: localKeys }).configured, false)
	const invalidResolver = createVerifiedIdentityVerifier({ env, keyResolver: {} })
	assert.equal(invalidResolver.configured, false)
	await rejects(invalidResolver.verifyRequest({}), 503)
	assert.equal(verifier({ BETTERPPTX_INSTALL_HMAC_SECRET: 's'.repeat(32) }).configured, true)
	// Even an injected resolver cannot replace the required pinned configuration.
	assert.equal(createVerifiedIdentityVerifier({ env: {}, keyResolver: localKeys }).configured, false)
})

test('issuer and audience require one exact resource and reject multi-audience tokens', async () => {
	assert.equal((await verifier().verifyRequest(request(await access({ aud: [audience] })))).authenticated, true)
	for (const claims of [
		{ iss: `${issuer}/` }, { iss: 'https://attacker.example.test' },
		{ aud: `${audience}/` }, { aud: `${audience}.attacker.test` },
		{ aud: [audience, 'https://other.test'] }, { aud: [] },
	]) await rejects(verifier().verifyRequest(request(await access(claims))))
})

test('rejections expose only bounded non-secret diagnostics to the local caller', async () => {
	const token = await access({ aud: [audience, 'https://other.test'] })
	let rejection
	try { await verifier().verifyRequest(request(token)) } catch (error) { rejection = error }
	assert.ok(rejection)
	assert.deepEqual(rejection.diagnostic, {
		profile: 'rfc9068', configured: true, claimsVerified: false, authorizationPresent: true,
		authorizationScheme: 'bearer', jwtShapeValid: true, headerTypeMatches: true,
		headerAlgorithmAllowed: true, issuerMatches: true, audienceShape: 'array',
		audienceCount: 2, audienceMatchesExactly: false, accessTokenTypeMatches: true,
		clientClaimPresent: true, clientClaimMatches: true, subjectPresent: true, tokenIdPresent: true,
		scopeIsString: true, betterpptxScopePresent: true,
		lifetimeWithinLimit: true, confirmationBound: false, dpopProofPresent: false,
	})
	assert.equal(JSON.stringify(rejection).includes(token), false)
	assert.equal(Object.keys(rejection).includes('diagnostic'), false)
})

test('all required claims are mandatory and strictly typed/nonempty', async () => {
	for (const name of ['exp', 'iat', 'sub', 'iss', 'aud', 'jti', 'client_id']) {
		for (const value of [undefined, null, '', [], {}]) {
			await rejects(verifier().verifyRequest(request(await access({ [name]: value }))))
		}
	}
	for (const name of ['sub', 'jti', 'client_id']) {
		for (const value of [123, ' ', ' padded ', 'a\nb', 'x'.repeat(2049)]) {
			await rejects(verifier().verifyRequest(request(await access({ [name]: value }))))
		}
	}
})

test('expiry, issued-at, not-before and ten-minute lifetime are enforced without skew', async () => {
	const time = now()
	for (const claims of [
		{ exp: time }, { exp: time - 1 }, { iat: time + 60, exp: time + 600 },
		{ iat: time - 601, exp: time + 1 }, { iat: time, exp: time + 601 },
		{ iat: time, exp: time - 1 }, { nbf: time + 60 },
		{ iat: time + 0.5 }, { exp: time + 599.5 }, { exp: String(time + 300) },
		{ iat: -1 }, { exp: Number.MAX_SAFE_INTEGER + 1 }, { nbf: '0' }, { nbf: -1 },
	]) await rejects(verifier().verifyRequest(request(await access(claims))))
	assert.equal((await verifier().verifyRequest(request(await access({ iat: time, exp: time + 600 })))).authenticated, true)
})

test('type confusion, unsigned tokens, HMAC confusion and unapproved algorithms fail before key lookup', async () => {
	let calls = 0
	const v = verifier({}, async (...args) => { calls += 1; return localKeys(...args) })
	for (const typ of [undefined, 'JWT', 'AT+JWT', 'application/at+jwt', 'dpop+jwt', '']) {
		await rejects(v.verifyRequest(request(await access({}, { typ }))))
	}
	const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString('base64url')}.e30.`
	await rejects(v.verifyRequest(request(none)))
	await rejects(v.verifyRequest(request(await access({}, { alg: 'HS256' }, randomBytes(32)))))
	const es384 = await generateKeyPair('ES384')
	await rejects(v.verifyRequest(request(await access({}, { alg: 'ES384' }, es384.privateKey))))
	assert.equal(calls, 0)
})

test('forgeries, tampered claims, unknown key ids and attacker key hints never authenticate', async () => {
	const v = verifier()
	await rejects(v.verifyRequest(request(await access({}, {}, attacker.privateKey))))
	const original = await access()
	const parts = original.split('.')
	parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), sub: 'victim' })).toString('base64url')
	await rejects(v.verifyRequest(request(parts.join('.'))))
	await rejects(v.verifyRequest(request(await access({}, { kid: 'attacker-key' }))))
	let calls = 0
	const counting = verifier({}, async (...args) => { calls += 1; return localKeys(...args) })
	for (const header of [{ jku: 'https://attacker.test/keys' }, { x5u: 'https://attacker.test/cert' },
		{ jwk: attackerJwk }, { x5c: ['attacker-certificate'] }]) {
		await rejects(counting.verifyRequest(request(await access({}, header, attacker.privateKey))))
	}
	assert.equal(calls, 0)
})

test('scope is a precise permission and optional ACR/AMR constraints cannot be spoofed', async () => {
	for (const scope of [undefined, '', 'other', 'betterpptx.admin', 'betterpptx:read', 'BetterPPTX',
		['betterpptx'], 'betterpptx\tadmin', 'betterpptx  admin', 'betterpptx\\admin']) {
		await rejects(verifier().verifyRequest(request(await access({ scope }))), 403)
	}
	const v = verifier({ BETTERPPTX_OAUTH_REQUIRED_ACR: 'urn:test:strong', BETTERPPTX_OAUTH_REQUIRED_AMR: 'pwd mfa' })
	for (const claims of [{}, { acr: 'weak', amr: ['pwd', 'mfa'] }, { acr: 'urn:test:strong' },
		{ acr: 'urn:test:strong', amr: ['pwd'] }, { acr: 'urn:test:strong', amr: 'pwd mfa' },
		{ acr: 'urn:test:strong', amr: ['pwd', 'mfa', 1] }]) {
		await rejects(v.verifyRequest(request(await access(claims), { 'x-acr': 'urn:test:strong', 'x-amr': 'pwd mfa' })), 403)
	}
	assert.equal((await v.verifyRequest(request(await access({ acr: 'urn:test:strong', amr: ['mfa', 'pwd', 'hwk'] })))).authenticated, true)
})

test('identity is stable across refresh/client/session and independent of every caller identity hint', async () => {
	const v = verifier()
	const token = await access()
	const baseline = await v.verifyRequest(request(token))
	const spoofed = await v.verifyRequest({ ...request(token, {
		'x-openai-subject': 'victim', 'x-openai-session': 'victim-session',
		'x-betterpptx-device': 'victim-device', 'x-betterpptx-install': 'victim-install',
		'x-install-hash': 'install_spoof', 'x-resource-identity': 'victim',
		'x-forwarded-user': 'victim', 'x-authenticated-user': 'victim',
		'x-forwarded-host': 'attacker.test', host: 'attacker.test',
	}), installHash: 'install_spoof', user: { sub: 'victim' }, authenticated: true })
	assert.deepEqual(spoofed, baseline)
	const refreshed = await v.verifyRequest(request(await access({ client_id: 'different-client', scope: 'extra betterpptx' })))
	assert.equal(refreshed.installHash, baseline.installHash)
	const changedSubject = await v.verifyRequest(request(await access({ sub: 'account-b' })))
	assert.notEqual(changedSubject.installHash, baseline.installHash)
	const secondIssuer = 'https://second-issuer.test'
	const changedIssuer = await verifier({ BETTERPPTX_OAUTH_ISSUER: secondIssuer })
		.verifyRequest(request(await access({ iss: secondIssuer })))
	assert.notEqual(changedIssuer.installHash, baseline.installHash)
	const changedSecret = await verifier({ BETTERPPTX_INSTALL_HMAC_SECRET: randomBytes(32).toString('hex') }).verifyRequest(request(token))
	assert.notEqual(changedSecret.installHash, baseline.installHash)
	await rejects(v.verifyRequest({ headers: { 'x-openai-subject': 'victim', 'x-betterpptx-device': 'device' }, authenticated: true }))
})

test('malformed, oversized and ambiguous authorization headers fail closed; Fetch Headers work', async () => {
	const token = await access()
	const v = verifier()
	for (const authorization of [undefined, '', `Basic ${token}`, `Bearer  ${token}`, `Bearer\t${token}`,
		`Bearer ${token}, Bearer ${token}`, [`Bearer ${token}`], ['a', 'b'], `Bearer ${token}\r\n`,
		`Bearer ${'a'.repeat(17000)}`, 'Bearer a.b.c']) {
		await rejects(v.verifyRequest({ headers: { authorization } }))
	}
	await rejects(v.verifyRequest(request(token, { Authorization: `Bearer ${token}` })))
	await rejects(v.verifyRequest({ ...request(token), rawHeaders: ['Authorization', `Bearer ${token}`, 'authorization', `Bearer ${token}`] }))
	assert.equal((await v.verifyRequest({ method: 'POST', headers: new Headers({ Authorization: `bEaReR ${token}` }) })).authenticated, true)
	assert.equal((await v.verifyRequest({ ...request(token), rawHeaders: ['Authorization', `Bearer ${token}`] })).authenticated, true)
})

test('configuration is snapshotted and resolver errors never expose tokens or internals', async () => {
	const mutable = { ...env }
	const v = createVerifiedIdentityVerifier({ env: mutable, keyResolver: localKeys })
	mutable.BETTERPPTX_OAUTH_ISSUER = 'https://attacker.test'
	mutable.BETTERPPTX_INSTALL_HMAC_SECRET = 'bad'
	assert.equal((await v.verifyRequest(request(await access()))).authenticated, true)
	const token = await access()
	await rejects(verifier({}, () => { throw new Error(`private upstream detail ${token}`) }).verifyRequest(request(token)), 503)
})

test('production resolver fetches only pinned HTTPS JWKS with redirects disabled', async t => {
	const calls = []
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		calls.push({ url: String(url), redirect: options.redirect, method: options.method })
		return new Response(JSON.stringify(jwks), { status: 200, headers: { 'content-type': 'application/json' } })
	})
	const v = createVerifiedIdentityVerifier({ env })
	assert.equal(v.configured, true)
	assert.equal(calls.length, 0)
	assert.equal((await v.verifyRequest(request(await access()))).authenticated, true)
	assert.deepEqual(calls, [{ url: env.BETTERPPTX_OAUTH_JWKS_URL, redirect: 'manual', method: 'GET' }])
	await rejects(v.verifyRequest(request(await access({}, { jku: 'https://attacker.test/jwks' }))))
	assert.equal(calls.length, 1)
})

test('production JWKS failures and redirects fail closed with generic 503', async t => {
	for (const response of [
		() => new Response(null, { status: 302, headers: { location: 'https://attacker.test/jwks' } }),
		() => new Response('unavailable', { status: 500 }),
		() => new Response('invalid json', { status: 200 }),
		() => { throw new Error('private network detail') },
	]) {
		const mocked = t.mock.method(globalThis, 'fetch', async () => response())
		await rejects(createVerifiedIdentityVerifier({ env }).verifyRequest(request(await access())), 503)
		mocked.mock.restore()
	}
})

test('DPoP cache fails closed at capacity, retains live entries and expires at five minutes', async t => {
	// Run before other successful proofs. A past mock clock keeps later real-time
	// tests independent without exporting a replay-cache clearing backdoor.
	const time = Math.floor(Date.now() / 1000) - 3600
	t.mock.timers.enable({ apis: ['Date'], now: time * 1000 })
	const v = verifier({ BETTERPPTX_OAUTH_DPOP_REPLAY_MAX_ENTRIES: '1' })
	const token = await access({ cnf: { jkt } })
	const proof = await dpop(token)
	assert.equal((await v.verifyRequest(dpopRequest(token, proof))).authenticated, true)
	await rejects(v.verifyRequest(dpopRequest(token, await dpop(token))), 503)
	await rejects(v.verifyRequest(dpopRequest(token, proof)))
	t.mock.timers.setTime((time + 299) * 1000)
	await rejects(v.verifyRequest(dpopRequest(token, await dpop(token))), 503)
	t.mock.timers.setTime((time + 300) * 1000)
	await rejects(v.verifyRequest(dpopRequest(token, proof)))
	assert.equal((await v.verifyRequest(dpopRequest(token, await dpop(token)))).authenticated, true)
})

test('bound tokens always require a valid DPoP proof and cannot fall back to bearer', async () => {
	const token = await access({ cnf: { jkt } })
	for (const setting of [undefined, '0', '1']) {
		const v = verifier({ BETTERPPTX_OAUTH_REQUIRE_DPOP: setting })
		await rejects(v.verifyRequest(request(token)))
		await rejects(v.verifyRequest(dpopRequest(token, undefined)))
		await rejects(v.verifyRequest(request(token, { dpop: await dpop(token) })))
		assert.equal((await v.verifyRequest(dpopRequest(token, await dpop(token)))).authenticated, true)
	}
	const unbound = await access()
	await rejects(verifier({ BETTERPPTX_OAUTH_REQUIRE_DPOP: '1' }).verifyRequest(request(unbound)))
	await rejects(verifier().verifyRequest(dpopRequest(unbound, await dpop(unbound))))
	await rejects(verifier().verifyRequest(request(unbound, { dpop: await dpop(unbound) })))
	for (const cnf of [null, {}, [], { jkt: '' }, { jkt: 42 }, { 'x5t#S256': 'unsupported' }]) {
		await rejects(verifier().verifyRequest(request(await access({ cnf }))))
	}
})

test('DPoP sequential, concurrent and cross-instance replay allows exactly one request', async () => {
	const token = await access({ cnf: { jkt } })
	const proof = await dpop(token)
	const v = verifier()
	const result = await Promise.allSettled(Array.from({ length: 8 }, () => v.verifyRequest(dpopRequest(token, proof))))
	assert.equal(result.filter(item => item.status === 'fulfilled').length, 1)
	assert.equal(result.filter(item => item.status === 'rejected' && item.reason.status === 401).length, 7)
	await rejects(v.verifyRequest(dpopRequest(token, proof)))
	await rejects(verifier().verifyRequest(dpopRequest(token, proof)))
	// New issuance time/token must not make a previously consumed key+jti reusable.
	const sameId = randomUUID()
	await v.verifyRequest(dpopRequest(token, await dpop(token, { jti: sameId })))
	const refreshed = await access({ cnf: { jkt } })
	await rejects(v.verifyRequest(dpopRequest(refreshed, await dpop(refreshed, { jti: sameId }))))
})

test('DPoP checks actual method, fixed htu, token hash, age and required proof claims', async () => {
	const token = await access({ cnf: { jkt } })
	const v = verifier()
	for (const claims of [
		{ htm: 'GET' }, { htm: 'post' }, { htu: `${audience}/` },
		{ htu: 'https://attacker.test/mcp' }, { htu: `${audience}?query=1` },
		{ ath: 'x'.repeat(43) }, { ath: '' }, { iat: now() - 300 }, { iat: now() + 60 },
		{ iat: now() + 0.5 }, { jti: '' }, { jti: 'x'.repeat(257) },
		{ exp: now() - 1 }, { nbf: now() + 60 },
		...['iat', 'jti', 'htm', 'htu', 'ath'].map(name => ({ [name]: undefined })),
	]) {
		await rejects(v.verifyRequest(dpopRequest(token, await dpop(token, claims), {
			host: 'attacker.test', 'x-forwarded-host': 'attacker.test', 'x-forwarded-method': 'GET',
		})))
	}
	const proof = await dpop(token)
	await rejects(v.verifyRequest(dpopRequest(token, proof, {}, 'GET')))
	const secondToken = await access({ cnf: { jkt } })
	await rejects(v.verifyRequest(dpopRequest(secondToken, proof)))
	// Failed requests did not consume the proof; proxy hints cannot affect htu.
	assert.equal((await v.verifyRequest(dpopRequest(token, proof, {
		host: 'attacker.test', 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'http',
	}))).authenticated, true)
})

test('DPoP key binding, signature, typ, algorithm and public-only key checks', async () => {
	const token = await access({ cnf: { jkt } })
	const v = verifier()
	const forged = await dpop(token, {}, {}, attacker.privateKey)
	await rejects(v.verifyRequest(dpopRequest(token, forged)))
	const wrongKey = await dpop(token, {}, { jwk: attackerJwk }, attacker.privateKey)
	await rejects(v.verifyRequest(dpopRequest(token, wrongKey)))
	for (const header of [{ typ: 'at+jwt' }, { typ: undefined }, { typ: 'DPOP+JWT' },
		{ jwk: undefined }, { jwk: await exportJWK(proofKey.privateKey) },
		{ jwk: { ...proofKey.jwk, d: '' } }, { jwk: { ...proofKey.jwk, key_ops: ['sign'] } },
		{ jwk: { ...proofKey.jwk, use: 'enc' } }, { jwk: { ...proofKey.jwk, alg: 'ES384' } },
		{ jku: 'https://attacker.test/jwks' }, { x5u: 'https://attacker.test/cert' }]) {
		await rejects(v.verifyRequest(dpopRequest(token, await dpop(token, {}, header))))
	}
	const symmetric = await dpop(token, {}, { alg: 'HS256', jwk: { kty: 'oct', k: randomBytes(32).toString('base64url') } }, randomBytes(32))
	await rejects(v.verifyRequest(dpopRequest(token, symmetric)))
	for (const alg of ['RS256', 'PS256']) {
		const rsaToken = await access({ cnf: { jkt: await calculateJwkThumbprint(keys[alg].jwk) } })
		const proof = await dpop(rsaToken, {}, { alg, jwk: keys[alg].jwk }, keys[alg].privateKey)
		assert.equal((await v.verifyRequest(dpopRequest(rsaToken, proof))).authenticated, true)
	}
})

test('duplicate or folded DPoP headers are rejected, including raw Node duplicates', async () => {
	const token = await access({ cnf: { jkt } })
	const proof = await dpop(token)
	const v = verifier()
	for (const dpopValue of [[proof], [proof, proof], `${proof}, ${proof}`, 'invalid', '']) {
		await rejects(v.verifyRequest(dpopRequest(token, dpopValue)))
	}
	await rejects(v.verifyRequest(dpopRequest(token, proof, { DPoP: proof })))
	await rejects(v.verifyRequest({ ...dpopRequest(token, proof), rawHeaders: ['DPoP', proof, 'dpop', proof] }))
	assert.equal((await v.verifyRequest(new Request(`${audience}/mcp`, {
		method: 'POST', headers: { authorization: `DPoP ${token}`, dpop: proof },
	}))).authenticated, true)
})

test('explicit Keycloak profile requires signed Bearer discriminator and azp; never falls back', async () => {
	const v = verifier({ BETTERPPTX_OAUTH_TOKEN_PROFILE: 'keycloak', BETTERPPTX_OAUTH_CLIENT_ID: 'keycloak-client' })
	const kcAccess = (claims = {}, header = {}) => access({ client_id: undefined,
		typ: 'Bearer', azp: 'keycloak-client', ...claims }, { typ: 'JWT', ...header })
	const token = await kcAccess()
	const identity = await v.verifyRequest(request(token))
	assert.equal(identity.authenticated, true)
	assert.equal((await v.verifyRequest(request(await kcAccess({ aud: [audience] })))).authenticated, true)
	assert.equal(identity.authenticationBasis, 'oauth-access-token')
	assert.equal(identity.installHash, (await verifier().verifyRequest(request(await access()))).installHash)
	for (const claims of [
		{ typ: undefined }, { typ: 'ID' }, { typ: 'Refresh' }, { typ: 'Offline' },
		{ typ: 'bearer' }, { typ: ['Bearer'] }, { typ: 'DPoP' },
		{ azp: undefined }, { azp: '' }, { azp: [] }, { azp: ' ' },
		{ azp: 'different-client' },
		{ azp: undefined, client_id: 'cannot-substitute' },
		{ aud: [audience, 'account'] }, { exp: now() + 602 },
	]) await rejects(v.verifyRequest(request(await kcAccess(claims))))
	for (const header of [{ typ: 'at+jwt' }, { typ: 'jwt' }, { typ: undefined }]) {
		await rejects(v.verifyRequest(request(await kcAccess({}, header))))
	}
	await rejects(v.verifyRequest(request(await access())))
	await rejects(verifier().verifyRequest(request(token)))
	await rejects(verifier({ BETTERPPTX_OAUTH_TOKEN_PROFILE: 'rfc9068' }).verifyRequest(request(token)))
	await rejects(v.verifyRequest(request(await kcAccess({ typ: undefined }), { 'x-token-type': 'Bearer' })))
	await rejects(v.verifyRequest(request(await kcAccess({ scope: 'openid profile' }))), 403)
	// DPoP does not relax profile validation or alter principal identity.
	const bound = await kcAccess({ cnf: { jkt } })
	await rejects(v.verifyRequest(request(bound)))
	assert.equal((await v.verifyRequest(dpopRequest(bound, await dpop(bound)))).installHash, identity.installHash)
})

test('DPoP binds /mcp, /files and /pay paths while JWT audience stays on the resource origin', async () => {
	const token = await access({ cnf: { jkt } })
	const v = verifier()
	for (const path of ['/mcp', '/files/opaque-file', '/pay/session']) {
		const htu = `https://api.example.test${path}`
		const proof = await dpop(token, { htu })
		const req = { ...dpopRequest(token, proof, {
			host: 'attacker.test', 'x-forwarded-host': 'attacker.test',
			'x-forwarded-proto': 'http', 'x-original-url': '/attacker',
		}), originalUrl: `${path}?download=1#ignored`, url: '/mounted-router-path' }
		assert.equal((await v.verifyRequest(req)).authenticated, true)
		await rejects(v.verifyRequest({ ...req, headers: { ...req.headers,
			dpop: await dpop(token, { htu: `https://attacker.test${path}` }),
		} }))
		await rejects(v.verifyRequest({ ...req, headers: { ...req.headers,
			dpop: await dpop(token, { htu: `${htu}?download=1` }),
		} }))
	}
	const mcpProof = await dpop(token)
	await rejects(v.verifyRequest({ ...dpopRequest(token, mcpProof), originalUrl: '/files/opaque-file' }))
	const fileProof = await dpop(token, { htu: 'https://api.example.test/files/a' })
	await rejects(v.verifyRequest({ ...dpopRequest(token, fileProof), originalUrl: '/files/b' }))
	await rejects(v.verifyRequest({ ...dpopRequest(token, fileProof), originalUrl: '/pay/session' }))
	const wrongAudience = await access({ cnf: { jkt }, aud: 'https://api.example.test/files/a' })
	await rejects(v.verifyRequest({ ...dpopRequest(wrongAudience,
		await dpop(wrongAudience, { htu: 'https://api.example.test/files/a' })), originalUrl: '/files/a' }))
	// Node fallback uses req.url only when originalUrl is absent.
	assert.equal((await v.verifyRequest({ ...dpopRequest(token, fileProof),
		originalUrl: undefined, url: '/files/a?download=1',
	})).authenticated, true)
	for (const originalUrl of [undefined, '', '//attacker.test/mcp', 'https://attacker.test/mcp',
		'/\\attacker.test/mcp', '/mcp\n', ['/mcp']]) {
		await rejects(v.verifyRequest({ ...dpopRequest(token, await dpop(token)), originalUrl }))
	}
})
