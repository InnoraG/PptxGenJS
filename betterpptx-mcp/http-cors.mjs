// CORS headers for browser-based AI clients (MCP Inspector, web connectors).
export function applyCorsHeaders(req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, DPoP, mcp-session-id, mcp-protocol-version, MCP-Protocol-Version, x-betterpptx-device, x-betterpptx-mission-control-token, x-betterpptx-mission-control-admin-token, PAYMENT-SIGNATURE, X-PAYMENT')
	res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, MCP-Protocol-Version, WWW-Authenticate, DPoP-Nonce, PAYMENT-REQUIRED, PAYMENT-RESPONSE')
	res.setHeader('Access-Control-Max-Age', '86400')
}
