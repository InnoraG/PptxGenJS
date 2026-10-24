import assert from 'node:assert/strict'
import test from 'node:test'
import { relayEmailAuthAction } from '../deploy/cloudflare-edge/src/email-auth-proxy.mjs'

test('account links and relative assets use a pinned project, without product credentials or caching', async () => {
	const original = globalThis.fetch
	try {
		for (const project of ['sample-project-123', 'another-project-456']) {
			let received, options
			globalThis.fetch = async (request, init) => {
				received = request; options = init
				return new Response('handler', { headers: { 'content-type': 'text/html', 'set-cookie': 'private=1', server: 'private-platform', 'cache-control': 'public' } })
			}
			for (const path of ['/__/auth/action?mode=signIn&oobCode=one-time', '/__/auth/action.js']) {
				const response = await relayEmailAuthAction(new Request(`https://product.example${path}`, { headers: { cookie: 'product_session=secret', authorization: 'Bearer secret', accept: 'text/html' } }), { BETTERPPTX_SIGNIN_PROJECT: project })
				assert.equal(received.url, `https://${project}.firebaseapp.com${path}`)
				assert.equal(received.headers.get('cookie'), null)
				assert.equal(received.headers.get('authorization'), null)
				assert.equal(received.redirect, 'manual')
				assert.equal(options.cache, 'no-store')
				assert.equal(response.headers.get('cache-control'), 'no-store')
				assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
				assert.equal(response.headers.get('set-cookie'), null)
				assert.equal(response.headers.get('server'), null)
				assert.equal(await response.text(), 'handler')
			}
		}
	} finally { globalThis.fetch = original }
})

test('unrelated routes, unsupported methods and invalid configuration never fetch the action origin', async () => {
	const original = globalThis.fetch
	let calls = 0
	globalThis.fetch = async () => { calls++; throw new Error('must not fetch') }
	try {
		assert.equal(await relayEmailAuthAction(new Request('https://product.example/mcp'), {}), null)
		assert.equal(await relayEmailAuthAction(new Request('https://product.example/__/auth-like'), {}), null)
		assert.equal((await relayEmailAuthAction(new Request('https://product.example/__/auth/action', { method: 'POST' }), {})).status, 405)
		for (const project of ['', 'https://other.example', 'valid-project/../other']) {
			assert.equal((await relayEmailAuthAction(new Request('https://product.example/__/auth/action'), { BETTERPPTX_SIGNIN_PROJECT: project })).status, 503)
		}
		assert.equal(calls, 0)
	} finally { globalThis.fetch = original }
})

test('same-origin redirects remain branded and upstream failures are generic', async () => {
	const original = globalThis.fetch
	try {
		globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://sample-project-123.firebaseapp.com/__/auth/action?mode=verifyEmail' } })
		const request = new Request('https://product.example/__/auth/action')
		const env = { BETTERPPTX_SIGNIN_PROJECT: 'sample-project-123' }
		assert.equal((await relayEmailAuthAction(request, env)).headers.get('location'), 'https://product.example/__/auth/action?mode=verifyEmail')
		globalThis.fetch = async () => { throw new Error('private-platform-detail') }
		const failed = await relayEmailAuthAction(request, env)
		assert.equal(failed.status, 502)
		assert.doesNotMatch(await failed.text(), /private-platform-detail/)
	} finally { globalThis.fetch = original }
})
