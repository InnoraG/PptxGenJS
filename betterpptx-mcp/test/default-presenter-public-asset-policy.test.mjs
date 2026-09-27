import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureDefaultPresenterRegistered, isPublicDefaultPresenterHandle, registerPublicDefaultPresenterDerivation } from '../assets/default-presenter-roster.mjs'

test('released built-in presenters are public product assets while research personas remain gated', () => {
	for (const identity of ['joe', 'louise', 'pete']) {
		const registered = ensureDefaultPresenterRegistered(identity)
		assert.equal(isPublicDefaultPresenterHandle(registered.handle), true, `${identity} should use product-catalog authority`)
	}
	const mena = ensureDefaultPresenterRegistered('mena')
	assert.equal(isPublicDefaultPresenterHandle(mena.handle), false, 'research-only Mena must remain owner-gated')
	assert.equal(isPublicDefaultPresenterHandle(`gen://rigged3d/${'a'.repeat(40)}`), false, 'unknown generated assets remain owner-bound')
})

test('only deterministic descendants of released built-in presenters inherit catalog authority', () => {
	const joe = ensureDefaultPresenterRegistered('joe')
	const motionBundle = `gen://rigged3d/${'b'.repeat(40)}`
	const performance = `gen://rigged3d/${'c'.repeat(40)}`
	const ownerBound = `gen://rigged3d/${'d'.repeat(40)}`
	assert.equal(registerPublicDefaultPresenterDerivation(joe.handle, motionBundle), true)
	assert.equal(isPublicDefaultPresenterHandle(motionBundle), true)
	assert.equal(registerPublicDefaultPresenterDerivation(motionBundle, performance), true)
	assert.equal(isPublicDefaultPresenterHandle(performance), true)
	assert.equal(registerPublicDefaultPresenterDerivation(ownerBound, `gen://rigged3d/${'e'.repeat(40)}`), false)
	assert.equal(isPublicDefaultPresenterHandle(ownerBound), false)
})
