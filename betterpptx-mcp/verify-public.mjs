// Verify the live public MCP endpoint end-to-end (initialize → tools/list → tools/call).
import * as fs from 'node:fs'

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
	const env = {}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/)
		if (m) env[m[1]] = m[2]
	}
	return env
}

function resolveMcpUrl() {
	const explicit = process.argv[2]?.trim()
	if (explicit) return explicit
	const env = readEnvFile('deploy/production.env')
	if (process.env.BETTERPPTX_PUBLIC_MCP_URL) return process.env.BETTERPPTX_PUBLIC_MCP_URL
	if (env.BETTERPPTX_PUBLIC_MCP_URL) return env.BETTERPPTX_PUBLIC_MCP_URL
	const base = (env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	const secret = env.BETTERPPTX_URL_SECRET
	const auth = env.BETTERPPTX_AUTH
	if (base && auth === 'none') return `${base}/mcp`
	if (base && secret) return `${base}/s/${secret}/mcp`
	console.error('Usage: node betterpptx/verify-public.mjs <public-mcp-url>')
	console.error('Or configure BETTERPPTX_PUBLIC_MCP_URL, or BETTERPPTX_PUBLIC_BASE with BETTERPPTX_AUTH=none.')
	process.exit(2)
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const URL = resolveMcpUrl()
const OLD_PUBLIC_PREFIX = ['claude', 'pptx'].join('')
console.log('MCP:', redactUrl(URL))
const H = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
const sse = t => { for (const l of String(t).split('\n')) { const m = l.match(/^data:\s*(.+)$/); if (m) return JSON.parse(m[1]) } return null }
const body = async r => { const ct = r.headers.get('content-type') || ''; const raw = await r.text(); return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null) }
function schemaIssues(schema, path = '') {
	const issues = []
	if (!schema || typeof schema !== 'object') return issues
	if (schema.type === 'object') {
		const props = schema.properties || {}
		if (Object.keys(props).length === 0 && !schema.description) issues.push(`${path || '<root>'}: empty object schema without description`)
		for (const [key, child] of Object.entries(props)) {
			if (!child.description && !child.title) issues.push(`${path}.${key}: missing description/title`)
			issues.push(...schemaIssues(child, `${path}.${key}`))
		}
	}
	if (schema.items) issues.push(...schemaIssues(schema.items, `${path}[]`))
	return issues
}

async function main() {
	const root = await fetch(URL.replace(/\/s\/[^/]+\/mcp$|\/mcp$/, '/'))
	console.log('GET / ->', root.status, JSON.stringify(await root.json()).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp'))
	const r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'public-verify', version: '1' }, capabilities: {} } }) })
	const sid = r.headers.get('mcp-session-id'); const ib = await body(r)
	console.log('initialize ->', r.status, 'server:', ib?.result?.serverInfo?.name, 'session:', sid ? 'yes' : 'no')
	await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })
	const lr = await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) })
	const lb = await body(lr); console.log('tools/list ->', lr.status, 'tools:', lb?.result?.tools?.length)
	const tools = lb?.result?.tools || []
	const names = new Set(tools.map(t => t.name))
	const issueTools = tools
		.map(t => ({ name: t.name, issues: schemaIssues(t.inputSchema, t.name).slice(0, 5) }))
		.filter(t => t.issues.length)
	console.log('schema audit -> issueToolCount:', issueTools.length)
	if (issueTools.length) console.log('schema audit first issue ->', JSON.stringify(issueTools[0]))
	const ar = await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'betterpptx.auth.status', arguments: {} } }) })
	const ab = await body(ar); const auth = ab?.result?.content && JSON.parse(ab.result.content[0].text)
	const authData = auth?.data || {}
	const quota = authData.quota || {}
	const policy = authData.policy || {}
	const hasOldPolicy = [authData, quota, policy].some(obj => Object.prototype.hasOwnProperty.call(obj, 'blockedFeatures') || Object.prototype.hasOwnProperty.call(obj, 'maxSlidesPerDeck'))
	const authPolicyOk = auth?.ok === true && quota.premiumPreviewSlides === 2 && quota.gateStartsAfterSlide === 2 && policy.premiumPreviewSlides === 2 && policy.gateStartsAfterSlide === 2 && !hasOldPolicy
	console.log('auth.status ->', ar.status, 'plan:', authData.plan, 'preview:', quota.premiumPreviewSlides, 'gate:', quota.gateStartsAfterSlide, 'oldPolicy:', hasOldPolicy ? 'yes' : 'no')
	const cr = await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'betterpptx.help.capabilities', arguments: { intent: 'animated AI history deck', detail: 'plan' } } }) })
	const cb = await body(cr); const payload = cb?.result?.content && JSON.parse(cb.result.content[0].text)
	const brand = payload?.data?.brand || payload?.brand || payload?.product
	const hasPlan = Array.isArray(payload?.data?.recommendedWorkflow) && payload.data.recommendedWorkflow.length > 0
	console.log('tools/call(capabilities) ->', cr.status, 'brand:', brand || '<generic>', 'planner:', hasPlan ? 'yes' : 'no')
	const sr = await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'betterpptx.status', arguments: {} } }) })
	const sb = await body(sr); const statusPayload = sb?.result?.content && JSON.parse(sb.result.content[0].text)
	const statusData = statusPayload?.data || {}
	const statusOk = statusPayload?.ok === true && statusData.status === 'ok' && statusData.policy?.premiumPreviewSlides === 2 && !('pid' in statusData) && !('cwd' in statusData)
	console.log('tools/call(status) ->', sr.status, 'status:', statusData.status, 'safe:', statusOk ? 'yes' : 'no')
	console.log(r.status === 200 && tools.length > 0 && names.has('betterpptx.auth.status') && ![...names].some(n => n.startsWith(`${OLD_PUBLIC_PREFIX}.`)) && issueTools.length === 0 && authPolicyOk && cr.status === 200 && !cb?.error && hasPlan && statusOk ? 'PUBLIC VERIFY: PASS' : 'PUBLIC VERIFY: FAIL')
}
main().catch(e => { console.error('PUBLIC VERIFY ERR:', e.message); process.exit(1) })
