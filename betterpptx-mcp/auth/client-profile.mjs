// Which authentication-challenge dialect a caller understands. This is a
// presentation choice only: it never grants access, and a caller that spoofs
// another profile merely receives a different (equally protected) refusal.
//
// - 'openai': ChatGPT's connector platform. It expects protected tools/call
//   refusals as a 200 tool result carrying _meta["mcp/www_authenticate"], and
//   was qualified against the origin-form protected resource. Keep its contract
//   byte-for-byte stable.
// - 'standard': every other MCP client (Claude, Claude Code, SDK clients). They
//   start sign-in only on a transport-level 401 + WWW-Authenticate and require
//   the protected resource to equal the MCP endpoint URL exactly.

const OPENAI_USER_AGENT = /^openai-mcp\//i
const OPENAI_CLIENT_NAME = /^(?:openai|chatgpt)\b/i

function headerValue(headers, name) {
	const value = headers?.[name]
	return typeof value === 'string' ? value : ''
}

function requestClientName(body) {
	const messages = Array.isArray(body) ? body : [body]
	for (const message of messages) {
		const info = message?.params?._meta?.['io.modelcontextprotocol/clientInfo'] || message?.params?.clientInfo
		if (info && typeof info.name === 'string') return info.name
	}
	return ''
}

export function authChallengeProfile(req) {
	const headers = req?.headers || {}
	if (headerValue(headers, 'x-openai-session') || headerValue(headers, 'x-openai-subject')) return 'openai'
	if (OPENAI_USER_AGENT.test(headerValue(headers, 'user-agent'))) return 'openai'
	if (OPENAI_CLIENT_NAME.test(requestClientName(req?.body))) return 'openai'
	return 'standard'
}

// The identity proxy and the fallback authorization-server document publish the
// same union of accepted methods: private_key_jwt for ChatGPT's signed CIMD
// client, none for Claude's public CIMD clients. The OpenAI profile keeps its
// qualified single-method list so ChatGPT never sees a changed contract.
export function tokenEndpointAuthMethods(profile = 'standard') {
	return profile === 'openai' ? ['private_key_jwt'] : ['private_key_jwt', 'none']
}
