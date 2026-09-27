// Verify the public rolling-free-value contract without consuming a publication
// or invoking an identity-media provider.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
	return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
		.map(line => line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/))
		.filter(Boolean)
		.map(match => [match[1], match[2]]))
}

function resolveMcpUrl() {
	const explicit = process.argv[2]?.trim()
	if (explicit) return explicit
	const env = readEnvFile('deploy/production.env')
	if (process.env.BETTERPPTX_PUBLIC_MCP_URL) return process.env.BETTERPPTX_PUBLIC_MCP_URL
	if (env.BETTERPPTX_PUBLIC_MCP_URL) return env.BETTERPPTX_PUBLIC_MCP_URL
	const base = String(env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	if (base) return `${base}/mcp`
	throw new Error('Pass the public MCP URL or configure BETTERPPTX_PUBLIC_MCP_URL.')
}

const MCP = resolveMcpUrl()
const SUBJECT = process.env.BETTERPPTX_VERIFY_SUBJECT || `rolling-free-policy-${crypto.randomBytes(12).toString('hex')}`
let sessionId = ''
let requestId = 0

function decodeBody(raw, contentType) {
	if (contentType.includes('event-stream')) {
		const data = raw.split(/\r?\n/).find(line => line.startsWith('data:'))
		return data ? JSON.parse(data.slice(5).trim()) : null
	}
	return raw ? JSON.parse(raw) : null
}

async function rpc(method, params = {}) {
	const response = await fetch(MCP, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			'x-openai-subject': SUBJECT,
			...(sessionId ? { 'mcp-session-id': sessionId } : {}),
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
	})
	if (!response.ok) throw new Error(`HTTP ${response.status} from public MCP`)
	sessionId ||= response.headers.get('mcp-session-id') || ''
	return decodeBody(await response.text(), response.headers.get('content-type') || '')
}

function structured(response) {
	const result = response?.result
	if (result?.structuredContent) return result.structuredContent
	const text = result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : result
}

function assert(condition, message, evidence) {
	if (condition) return
	const error = new Error(message)
	error.evidence = evidence
	throw error
}

await rpc('initialize', {
	protocolVersion: '2025-11-25',
	capabilities: {},
	clientInfo: { name: 'betterpptx-rolling-free-verifier', version: '1.0.0' },
})
await rpc('notifications/initialized')

const listed = await rpc('tools/list')
const tools = listed?.result?.tools || []
const names = new Set(tools.map(tool => tool.name))
assert(!names.has('betterpptx.assets.generate_image'), 'Retired generic image generation is still publicly advertised.', [...names])
assert(names.has('betterpptx.avatar.render_job'), 'Talking-head generation is not publicly advertised.', [...names])
assert(names.has('betterpptx.assets.generate_rigged3d'), 'Rigged-persona generation is not publicly advertised.', [...names])

const auth = structured(await rpc('tools/call', {
	name: 'betterpptx.auth.status',
	arguments: {},
}))
const allowances = auth?.data?.freeAllowances || auth?.freeAllowances || {}
const publication = allowances.deckPublications || {}
const talkingHead = allowances.talkingHeads || {}
const rigged = allowances.rigged3dPersonas || {}
assert(publication.limit === 3 && publication.windowDays === 30, 'Publication allowance is not 3 per rolling 30 days.', publication)
assert(talkingHead.limit === 3 && talkingHead.windowDays === 30, 'Talking-head allowance is not independently 3 per rolling 30 days.', talkingHead)
assert(rigged.limit === 3 && rigged.windowDays === 30, 'Rigged-persona allowance is not independently 3 per rolling 30 days.', rigged)

const capabilities = structured(await rpc('tools/call', {
	name: 'betterpptx.help.capabilities',
	arguments: { detail: 'full' },
}))
const capabilityText = JSON.stringify(capabilities)
for (const obsolete of ['free 1-2', 'premium 3+', 'contextual-generated-visual', 'preview morph']) {
	assert(!capabilityText.includes(obsolete), `Obsolete creative gating remains in public discovery: ${obsolete}`, obsolete)
}
assert(capabilityText.includes('AI-client-generated') && capabilityText.includes('betterpptx.assets.upload'), 'Public discovery does not teach the AI-client-generated/uploaded image route.', capabilities)
const authorizationText = JSON.stringify(auth)
assert(authorizationText.includes('creativeFeatureGate') && authorizationText.includes('none'), 'Authorization readback does not explicitly state that creative features are ungated.', auth)

const estimate = structured(await rpc('tools/call', {
	name: 'betterpptx.billing.estimate',
	arguments: { toolName: 'betterpptx.avatar.render_job' },
}))
const quote = estimate?.data || estimate
assert(quote?.billingRequired === false, 'Covered talking-head estimate unexpectedly requires billing.', quote)
assert(Number(quote?.estimatedCredits) === 0, 'Covered talking-head estimate is not zero caller credits.', quote)
assert(quote?.authorization === 'bounded-free-allowance', 'Talking-head estimate is not bound to the sponsored allowance.', quote)

console.log(JSON.stringify({
	ok: true,
	contract: 'rolling-free-value-v1',
	publicToolCount: tools.length,
	genericImageGenerationAdvertised: false,
	publication: { limit: publication.limit, windowDays: publication.windowDays, remaining: publication.remaining },
	talkingHead: { limit: talkingHead.limit, windowDays: talkingHead.windowDays, remaining: talkingHead.remaining },
	riggedPersona: { limit: rigged.limit, windowDays: rigged.windowDays, remaining: rigged.remaining },
	providerInvocationPerformed: false,
	creativeFeatureGate: 'none',
}, null, 2))
