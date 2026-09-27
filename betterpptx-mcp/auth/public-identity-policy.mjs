import { canonicalToolName } from '../tools.mjs'
import { anonymousToolAllowed } from './tool-security.mjs'

// Public discovery is deliberately explicit. A read-only annotation does not
// imply anonymous access: reads of a customer's deck/job/account need identity.
const ANONYMOUS_METHODS = new Set([
	'initialize', 'server/discover', 'ping', 'notifications/initialized',
	'tools/list', 'resources/list', 'resources/templates/list', 'prompts/list',
])

export function anonymousMcpRequestAllowed(body) {
	const messages = Array.isArray(body) ? body : [body]
	if (!messages.length || messages.length > 16) return false
	return messages.every(message => {
		if (!message || typeof message !== 'object' || Array.isArray(message)) return false
		if (ANONYMOUS_METHODS.has(message.method)) return true
		return message.method === 'tools/call'
			&& anonymousToolAllowed(canonicalToolName(message.params?.name))
			&& !Object.hasOwn(message.params || {}, 'requestState')
			&& !Object.hasOwn(message.params || {}, 'inputResponses')
	})
}

export function publicIdentityPolicy({ configured = false } = {}) {
	return {
		policy: 'verified-account-required-v1',
		anonymousDiscovery: true,
		protectedExecution: true,
		authentication: 'oauth-access-token',
		status: configured ? 'configured-awaiting-client-qualification' : 'identity-provider-setup-required',
		callerIdentityHeadersTrusted: false,
		legacyIdentityMigration: 'owner-verified-only',
	}
}
