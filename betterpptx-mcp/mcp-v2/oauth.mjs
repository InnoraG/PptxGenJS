import { advertisedPublicTools } from '../public-manifest.mjs'
import { BETTERPPTX_PRODUCT } from '../branding.mjs'
import { MCP_SUPPORTED_PROTOCOL_VERSIONS, MCP_V2_PROTOCOL_VERSION } from './protocol.mjs'
import { mcpV2ToolScopes } from './catalog.mjs'
import { tokenEndpointAuthMethods } from '../auth/client-profile.mjs'

function originFrom(publicBase, fallback = '') {
	const text = String(publicBase || fallback || '').trim().replace(/\/+$/, '')
	return text || ''
}

export function oauthProtectedResourceMetadata({
	publicBase = '',
	mcpPath = '/mcp',
	authMode = 'none',
	requestOrigin = '',
	resourceForm = 'origin',
} = {}) {
	const origin = originFrom(publicBase, requestOrigin)
	const endpoint = origin ? `${origin}${mcpPath.startsWith('/') ? mcpPath : `/${mcpPath}`}` : mcpPath
	// ChatGPT treats the protected resource as the canonical MCP server origin
	// and sends this exact value through authorization and token requests. Keep
	// the transport endpoint separate: /mcp remains where JSON-RPC is served.
	// The path-suffixed document (RFC 9728 3.1) instead names the endpoint
	// itself, which Claude requires to equal the connector URL exactly.
	const resource = authMode === 'oauth' && origin && resourceForm !== 'endpoint' ? origin : endpoint
	const issuer = String(process.env.BETTERPPTX_OAUTH_ISSUER || '').trim().replace(/\/+$/, '')
	const metadata = {
		resource,
		resource_name: BETTERPPTX_PRODUCT,
		bearer_methods_supported: ['bearer', 'oauth'].includes(authMode) || issuer ? ['header'] : [],
		scopes_supported: authMode === 'oauth' ? ['betterpptx'] : mcpV2ToolScopes(advertisedPublicTools()),
		...(authMode === 'oauth' ? { code_challenge_methods_supported: ['S256'] } : {}),
		resource_documentation: origin || undefined,
		mcp_protocol_versions_supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
		mcp_latest_protocol_version: MCP_V2_PROTOCOL_VERSION,
	}
	if (issuer) metadata.authorization_servers = [issuer]
	return metadata
}

export function oauthAuthorizationServerMetadata({ profile = 'standard' } = {}) {
	const issuer = String(process.env.BETTERPPTX_OAUTH_ISSUER || '').trim().replace(/\/+$/, '')
	if (!issuer) return null
	const selfHosted = process.env.BETTERPPTX_OAUTH_TOKEN_PROFILE === 'keycloak'
	const authorizationEndpoint = String(process.env.BETTERPPTX_OAUTH_AUTHORIZATION_ENDPOINT || `${issuer}${selfHosted ? '/protocol/openid-connect/auth' : '/authorize'}`).trim()
	const tokenEndpoint = String(process.env.BETTERPPTX_OAUTH_TOKEN_ENDPOINT || `${issuer}${selfHosted ? '/protocol/openid-connect/token' : '/token'}`).trim()
	const registrationEndpoint = String(process.env.BETTERPPTX_OAUTH_REGISTRATION_ENDPOINT || '').trim()
	return {
		issuer,
		authorization_endpoint: authorizationEndpoint,
		token_endpoint: tokenEndpoint,
		...(selfHosted ? {
			jwks_uri: `${issuer}/protocol/openid-connect/certs`,
			userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`,
			end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
			revocation_endpoint: `${issuer}/protocol/openid-connect/revoke`,
			introspection_endpoint: `${issuer}/protocol/openid-connect/token/introspect`,
		} : {}),
		...(registrationEndpoint ? { registration_endpoint: registrationEndpoint } : {}),
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		// private_key_jwt: ChatGPT's signed CIMD client. none: Claude's public
		// CIMD clients (PKCE S256 only). Each pre-registered client still accepts
		// exactly its own method; the list is the union, not a per-client choice.
		token_endpoint_auth_methods_supported: selfHosted ? tokenEndpointAuthMethods(profile) : ['none', 'client_secret_post'],
		...(selfHosted ? { token_endpoint_auth_signing_alg_values_supported: ['RS256'] } : {}),
		// The ChatGPT CIMD URL is pinned and validated by the private provisioner
		// before the corresponding exact client/callback is activated.
		client_id_metadata_document_supported: selfHosted,
		authorization_response_iss_parameter_supported: selfHosted,
		// The self-hosted issuer exposes UserInfo, so advertise the OIDC marker
		// alongside the sole resource-authorization scope.
		scopes_supported: selfHosted ? ['openid', 'betterpptx'] : ['betterpptx'],
		...(selfHosted ? {
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'email', 'preferred_username', 'name'],
			request_parameter_supported: true,
			request_uri_parameter_supported: true,
		} : {}),
		application_type_supported: ['web', 'native'],
	}
}

export function oauthAuthorizationServerMetadataPath(issuer = process.env.BETTERPPTX_OAUTH_ISSUER || '') {
	const text = String(issuer || '').trim().replace(/\/+$/, '')
	if (!text) return '/.well-known/oauth-authorization-server'
	let parsed
	try { parsed = new URL(text) } catch { return '/.well-known/oauth-authorization-server' }
	const issuerPath = parsed.pathname.replace(/^\/+|\/+$/g, '')
	return `/.well-known/oauth-authorization-server${issuerPath ? `/${issuerPath}` : ''}`
}

export function oauthAuthorizationServerCompatibilityPaths(issuer = process.env.BETTERPPTX_OAUTH_ISSUER || '') {
	const text = String(issuer || '').trim().replace(/\/+$/, '')
	if (!text) return ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']
	let parsed
	try { parsed = new URL(text) } catch { return ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'] }
	const issuerPath = `/${parsed.pathname.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '')
	return [...new Set([
		'/.well-known/oauth-authorization-server',
		oauthAuthorizationServerMetadataPath(text),
		'/.well-known/openid-configuration',
		`/.well-known/openid-configuration${issuerPath}`,
		`${issuerPath}/.well-known/oauth-authorization-server`,
	].filter(Boolean))]
}

function quotedChallengeValue(value) {
	return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ')
}

export function wwwAuthenticateHeader({
	publicBase = '',
	requestOrigin = '',
	resourcePath = '',
	realm = BETTERPPTX_PRODUCT,
	scope = '',
	error = '',
	errorDescription = '',
} = {}) {
	const origin = originFrom(publicBase, requestOrigin)
	// resourcePath selects the path-suffixed document (e.g. /mcp) whose resource
	// is the endpoint URL; omitted, the root document names the origin.
	const suffix = resourcePath ? `/${String(resourcePath).replace(/^\/+/, '')}` : ''
	const metadataUrl = `${origin}/.well-known/oauth-protected-resource${suffix}`
	const fields = [
		`realm="${quotedChallengeValue(realm)}"`,
		`resource_metadata="${quotedChallengeValue(metadataUrl)}"`,
	]
	if (scope) fields.push(`scope="${quotedChallengeValue(scope)}"`)
	if (error) fields.push(`error="${quotedChallengeValue(error)}"`)
	if (errorDescription) fields.push(`error_description="${quotedChallengeValue(errorDescription)}"`)
	return `Bearer ${fields.join(', ')}`
}
