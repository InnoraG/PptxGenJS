import { randomUUID } from 'node:crypto'

const UNBOUND_SESSION_IDS = new Set(['anonymous', 'default', 'stdio-default'])

/** Resolve the server-owned resource boundary for one stdio process. */
export function resolveStdioSessionId(env = process.env) {
	const configuredSessionId = env.BETTERPPTX_PUBLIC_SESSION_ID || env.BETTERPPTX_STDIO_SESSION_ID || ''
	const validConfiguredSessionId = typeof configuredSessionId === 'string'
		&& configuredSessionId.length > 0
		&& configuredSessionId.length <= 512
		&& configuredSessionId.trim() === configuredSessionId
		&& !/[\x00-\x1f\x7f]/.test(configuredSessionId)
		&& !UNBOUND_SESSION_IDS.has(configuredSessionId)
	return validConfiguredSessionId ? configuredSessionId : `stdio-${randomUUID()}`
}

