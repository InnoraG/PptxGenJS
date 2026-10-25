import { createHash } from 'node:crypto'

const IMPORT_FIELDS = ['localId', 'email', 'emailVerified', 'displayName', 'photoUrl', 'disabled', 'providerUserInfo', 'customAttributes', 'createdAt', 'lastLoginAt', 'validSince']
function profile(user) {
	return {
		localId: user.localId, email: user.email || '', emailVerified: user.emailVerified === true,
		disabled: user.disabled === true, displayName: user.displayName || '', photoUrl: user.photoUrl || '',
		customAttributes: user.customAttributes || '',
		// Firebase derives its built-in provider from email and materializes it
		// after the first sign-in. It is not an importable federated identity.
		providers: [...(user.providerUserInfo || [])].filter(p => p.providerId !== 'password').map(p => [p.providerId, p.rawId || '', p.email || '']).sort(),
	}
}
export const userIdentityDigest = users => createHash('sha256').update(JSON.stringify(users.map(profile).sort((a, b) => a.localId.localeCompare(b.localId)))).digest('hex')

export function planSignInUserImport(source, target) {
	const sourceIds = new Set(), sourceEmails = new Set()
	const byId = new Map(target.map(user => [user.localId, user]))
	const byEmail = new Map(target.filter(user => user.email).map(user => [user.email.toLowerCase(), user]))
	const pending = []
	for (const user of source) {
		if (!user.localId || sourceIds.has(user.localId)) throw new Error('Missing or duplicate source UID.')
		const email = user.email?.toLowerCase()
		if (email && sourceEmails.has(email)) throw new Error('Duplicate source email.')
		sourceIds.add(user.localId); if (email) sourceEmails.add(email)
		if (user.passwordHash || user.salt || user.mfaInfo?.length || user.tenantId) throw new Error('Password, MFA or tenant migration requires a dedicated preservation procedure.')
		if (user.providerUserInfo?.some(p => p.providerId !== 'password')) throw new Error('Configure and qualify federated providers before migrating their accounts.')
		const existing = byId.get(user.localId)
		if (existing) {
			if (JSON.stringify(profile(existing)) !== JSON.stringify(profile(user))) throw new Error('Target UID profile collision; no overwrite permitted.')
			continue
		}
		if (email && byEmail.has(email)) throw new Error('Target email has a different UID; no overwrite permitted.')
		// The batch API accepts only federated identities in providerUserInfo.
		// Its built-in password/email-link provider is recreated from email;
		// sending providerId=password is rejected as INVALID_PROVIDER_ID.
		pending.push(Object.fromEntries(IMPORT_FIELDS.filter(key => key !== 'providerUserInfo' && user[key] !== undefined).map(key => [key, user[key]])))
	}
	return { users: pending, sourceCount: source.length, sourceDigest: userIdentityDigest(source) }
}
