import assert from 'node:assert/strict'
import test from 'node:test'
import { planSignInUserImport, userIdentityDigest } from '../deploy/identity/auth-project-users.mjs'

const user = { localId: 'existingUid123', email: 'owner@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'password', rawId: 'owner@example.test', email: 'owner@example.test' }], customAttributes: '{"tier":"member"}', createdAt: '1234' }
test('import preserves UID, verification and claims before and after derived email-provider metadata appears', () => {
	const result = planSignInUserImport([user], [{ localId: 'testUid456', email: 'test@example.test' }])
	const { providerUserInfo, ...upload } = user
	assert.deepEqual(result.users, [upload])
	assert.equal(result.sourceCount, 1)
	assert.equal(userIdentityDigest(result.users), result.sourceDigest)
	assert.equal(userIdentityDigest([{ ...result.users[0], providerUserInfo }]), result.sourceDigest)
	assert.equal(planSignInUserImport([user], [structuredClone(user)]).users.length, 0)
	assert.equal(planSignInUserImport([user], [upload]).users.length, 0)
})
test('UID/email collisions cannot replace accounts', () => {
	assert.throws(() => planSignInUserImport([user], [{ ...user, localId: 'wrongUid' }]), /different UID/)
	assert.throws(() => planSignInUserImport([user], [{ ...user, emailVerified: false }]), /profile collision/)
	assert.throws(() => planSignInUserImport([user, user], []), /duplicate source UID/)
})
test('unsupported credentials and federation are rejected instead of being dropped', () => {
	for (const extra of [{ passwordHash: 'hash' }, { salt: 'salt' }, { mfaInfo: [{ phoneInfo: '+10000000000' }] }, { tenantId: 'tenant' }, { providerUserInfo: [{ providerId: 'google.com' }] }]) {
		assert.throws(() => planSignInUserImport([{ ...user, ...extra }], []))
	}
})
