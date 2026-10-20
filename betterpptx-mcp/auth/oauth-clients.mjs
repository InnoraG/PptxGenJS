// The only OAuth clients the built-in authorization server accepts: the
// pre-registered CIMD clients of ChatGPT, hosted Claude and Claude Code.
// Metadata is pinned from each client's published metadata document (checked
// by deploy/identity/check-client-metadata.mjs) instead of being fetched per
// request, so the allowlist is exact and sign-in does not depend on a remote
// fetch. Claude Code uses RFC 8252 loopback redirects on ephemeral ports,
// which requires the native application type.
export const OAUTH_CLIENTS = Object.freeze([
	Object.freeze({
		client_id: 'https://chatgpt.com/oauth/client.json',
		client_name: 'ChatGPT',
		application_type: 'web',
		redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'private_key_jwt',
		token_endpoint_auth_signing_alg: 'RS256',
		jwks_uri: 'https://chatgpt.com/oauth/jwks.json',
	}),
	Object.freeze({
		client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
		client_name: 'Claude',
		application_type: 'web',
		redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none',
	}),
	Object.freeze({
		client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
		client_name: 'Claude Code',
		application_type: 'native',
		redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code'],
		token_endpoint_auth_method: 'none',
	}),
])

export const OAUTH_CLIENT_IDS = Object.freeze(OAUTH_CLIENTS.map(client => client.client_id))
