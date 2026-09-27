// Verify that a public BetterPPTX endpoint behaves as a product black box.
import * as fs from 'node:fs'
import * as crypto from 'node:crypto'

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
	console.error('Usage: node betterpptx/verify-blackbox-public.mjs <public-mcp-url>')
	process.exit(2)
}

function baseUrl(mcpUrl) {
	return String(mcpUrl).replace(/\/s\/[^/]+\/mcp$|\/mcp$/, '')
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const MCP = resolveMcpUrl()
const BASE = baseUrl(MCP)
const AUTHORIZATION = process.env.BETTERPPTX_AUTHORIZATION || (process.env.BETTERPPTX_TOKEN ? `Bearer ${process.env.BETTERPPTX_TOKEN}` : '')
// A public black-box probe must behave like a fresh client by default. Supplying a
// fabricated device token makes an identity-aware endpoint correctly reject the
// request before the product surface can be verified. Maintainers can still pass
// a real provisioned token explicitly when testing an install-bound deployment.
const DEVICE_TOKEN = String(process.env.BETTERPPTX_VERIFY_DEVICE_TOKEN || '').trim()
const H = {
	'Content-Type': 'application/json',
	Accept: 'application/json, text/event-stream',
	...(DEVICE_TOKEN ? { 'x-betterpptx-device': DEVICE_TOKEN } : {}),
	...(AUTHORIZATION ? { Authorization: AUTHORIZATION } : {}),
}
const OLD_PUBLIC_PREFIX = ['claude', 'pptx'].join('')
const OLD_PACKAGE_NAME = ['claude', 'pptx', 'mcp'].join('')
const BANNED = [
	new RegExp(`\\b${OLD_PUBLIC_PREFIX}`, 'i'),
	new RegExp(`\\b${OLD_PACKAGE_NAME}`, 'i'),
	/\bPptxGenJS\b/i,
	/\bnode\.js\b/i,
	/\bexpress\b/i,
	/\bdependency\b/i,
	/\bdependencies\b/i,
	/\bsource code\b/i,
	/\bcwd\b/i,
	/\bpid\b/i,
	/\bexecPath\b/i,
	/\bargv\b/i,
	/\blocal filesystem\b/i,
	/\bfilesystem path\b/i,
	/\bserver filesystem\b/i,
	/\bprocess metadata\b/i,
	// G1 (2026-07-14): generation-stack internals must never surface on the public boundary —
	// upstream model/rigger names, host/GPU identifiers, and the legacy provider-bearing handles.
	/\btrellis[-.\s]?2\b/i,
	/\bunirig\b/i,
	/\bflux[-.\s]?1\b/i,
	/\bflux[-.\s]?2\b/i,
	/\bflux[-\s]?schnell\b/i,
	/\bklein[-\s]?(?:4b|9b)\b/i,
	/black-forest-labs/i,
	/\bhuggingface\b/i,
	/\bmodal\s+l40s\b/i,
	/\bl40s\b/i,
	/\bworkers\s+ai\b/i,
	/gen:\/\/(?:trellis|flux)\//i,
]
const BANNED_SCHEMA_KEYS = new Set([
	'pptxPath',
	'outputDir',
	'saveToPath',
	'sourcePath',
	'templatePath',
	'filePath',
])
const DISALLOWED_PUBLIC_TOOLS = [
	'betterpptx.version',
	'betterpptx.deck.load_template',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.analyze_reference',
	'betterpptx.deck.recreate_reference',
	'betterpptx.deck.compare_reference',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.inspect_layouts',
	'betterpptx.deck.editability_report',
	'betterpptx.slide.inspect_shapes',
	'betterpptx.slide.passthrough_xml',
	'betterpptx.io.read_file',
	'betterpptx.io.write_file',
	'betterpptx.io.list_dir',
	'betterpptx.io.read_json',
	'betterpptx.fs.find',
	'betterpptx.http.fetch',
	'betterpptx.image.sample_palette',
	'betterpptx.geometry.polygon_to_custgeom',
	'betterpptx.geometry.simplify_path',
	'betterpptx.library.list_xml_groups',
	'betterpptx.library.import_xml_group',
	'betterpptx.deck.list',
]
const REQUIRED_PUBLIC_TOOLS = [
	'betterpptx.help.capabilities',
	'betterpptx.help.workflow',
	'betterpptx.help.tool_recipe',
	'betterpptx.options.catalog',
	'betterpptx.auth.status',
	'betterpptx.billing.estimate',
	'betterpptx.status',
	'betterpptx.chart.recommend',
	'betterpptx.table.recommend',
	'betterpptx.equation.catalog',
	'betterpptx.smartart.catalog',
	'betterpptx.deck.new',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.director_status',
	'betterpptx.deck.define_message_architecture',
	'betterpptx.deck.assign_slide_roles',
	'betterpptx.deck.define_design_system',
	'betterpptx.deck.preview',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.save',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.summary',
	'betterpptx.slide.add',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.revise',
	'betterpptx.slide.list_shapes',
	'betterpptx.deck.revise',
	'betterpptx.assets.catalog',
	'betterpptx.assets.generate_model3d',
]
const REQUIRED_SPEC_FIRST_PUBLIC_TOOLS = [
	'betterpptx.help.capabilities',
	'betterpptx.help.workflow',
	'betterpptx.help.tool_recipe',
	'betterpptx.auth.status',
	'betterpptx.billing.estimate',
	'betterpptx.status',
	'betterpptx.chart.recommend',
	'betterpptx.table.recommend',
	'betterpptx.equation.catalog',
	'betterpptx.smartart.catalog',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.export_spec',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_design',
	'betterpptx.deck.validate_accessibility',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.save',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.summary',
	'betterpptx.assets.catalog',
]
const SPEC_FIRST_HIDDEN_PRIMITIVES = [
	'betterpptx.slide.add',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_avatar_narration',
	'betterpptx.slide.animate_shapes',
]
const PUBLIC_PAYMENT_COMPAT_TOOLS = new Set([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
])
const MODEL3D_FORBIDDEN_SCHEMA_TEXT = [
	/outputDir/i,
	/procedural/i,
	/generated model assets/i,
]

const sse = text => {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}
const body = async res => {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	if (raw && !ct.includes('application/json') && !ct.includes('event-stream')) {
		const preview = raw.replace(/\s+/g, ' ').replace(/\/s\/[^/\s<'"]+/g, '/s/<redacted>').slice(0, 140)
		console.error(`BLACKBOX VERIFY: ENDPOINT MISCONFIGURED - HTTP ${res.status} ${ct || 'no content-type'} from ${redactUrl(MCP)}`)
		console.error('The endpoint returned a non-JSON page. Deployed backend down, or auth/URL drift between deploy/production.env and the running server.')
		console.error('First bytes:', preview)
		process.exitCode = 3
		throw new Error('ENDPOINT_MISCONFIGURED')
	}
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}

async function preflight() {
	const healthUrl = `${BASE}/health`
	try {
		const res = await fetch(healthUrl, { headers: { Accept: 'application/json' } })
		const ct = res.headers.get('content-type') || ''
		if (!res.ok || !ct.includes('application/json')) {
			console.error(`BLACKBOX VERIFY: ENDPOINT PREFLIGHT FAILED - HTTP ${res.status} ${ct || 'no content-type'} from ${redactUrl(healthUrl)}`)
			process.exitCode = 3
			throw new Error('ENDPOINT_PREFLIGHT_FAILED')
		}
	} catch (error) {
		if (process.exitCode === 3) throw error
		console.error(`BLACKBOX VERIFY: ENDPOINT UNREACHABLE - ${error?.message} (${redactUrl(healthUrl)})`)
		process.exitCode = 3
		throw new Error('ENDPOINT_UNREACHABLE')
	}
}

let SID = null
async function rpc(method, params) {
	const res = await fetch(MCP, {
		method: 'POST',
		headers: { ...H, ...(SID ? { 'mcp-session-id': SID } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
	})
	if (!SID) SID = res.headers.get('mcp-session-id')
	return body(res)
}

async function tool(name, args) {
	const response = await rpc('tools/call', { name, arguments: args })
	return JSON.parse(response?.result?.content?.[0]?.text || '{}')
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function awaitDurableResult(result, label, timeoutMs = 180000) {
	if (result?.ok !== false || result?.error?.code !== 'OPERATION_PENDING') return result
	const operationId = result?.error?.details?.operationId
	if (!/^op_[0-9a-f]{32}$/i.test(operationId || '')) return result
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		await sleep(2000)
		const status = await tool('betterpptx.operation.status', { operationId })
		if (status?.ok !== true) fail(`${label} operation status failed`, status)
		if (status.data?.state === 'succeeded') return status.data.result
		if (status.data?.state === 'failed' || status.data?.state === 'cancelled') fail(`${label} operation ended as ${status.data.state}`, status)
	}
	fail(`${label} operation did not finish`, { operationId, timeoutMs })
}

function schemaKeyIssues(schema, trail = '') {
	const issues = []
	if (!schema || typeof schema !== 'object') return issues
	if (Array.isArray(schema)) {
		schema.forEach((item, i) => issues.push(...schemaKeyIssues(item, `${trail}[${i}]`)))
		return issues
	}
	for (const [key, value] of Object.entries(schema)) {
		if (BANNED_SCHEMA_KEYS.has(key)) issues.push(`${trail}.${key}`)
		issues.push(...schemaKeyIssues(value, trail ? `${trail}.${key}` : key))
	}
	return issues
}

function textIssues(value, context) {
	const text = typeof value === 'string' ? value : JSON.stringify(value)
	return BANNED.filter(rx => rx.test(text)).map(rx => `${context}: ${rx}`)
}

function fail(message, payload) {
	console.error('BLACKBOX VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function isSpecFirstPrimitiveBlocked(result) {
	return result?.ok === false
		&& ['BLACK_BOX', 'JSON_SPEC_AUTHORING_REQUIRED'].includes(result?.error?.code)
}

async function main() {
	console.log('MCP:', redactUrl(MCP))
	await preflight()
	const healthRes = await fetch(`${BASE}/health`)
	const health = await body(healthRes)
	if (healthRes.status !== 200 || health?.status !== 'ok') fail('health did not return generic ok', health)
	if (textIssues(health, 'health').length) fail('health leaked banned terms', health)

	const toolsRes = await fetch(`${BASE}/tools`)
	const toolsPayload = await body(toolsRes)
	if (toolsRes.status !== 200 || !Array.isArray(toolsPayload?.tools)) fail('/tools failed', toolsPayload)
	const toolTextIssues = textIssues(toolsPayload, 'tools')
	if (toolTextIssues.length) fail('/tools leaked banned terms', toolTextIssues)
	if ((toolsPayload.tools || []).some(t => !String(t.name || '').startsWith('betterpptx.') && !PUBLIC_PAYMENT_COMPAT_TOOLS.has(String(t.name || '')))) fail('/tools contains non-betterpptx tool', toolsPayload.tools)

	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'blackbox-verify', version: '1' },
		capabilities: {},
	})
	console.log('initialize ->', init?.result?.serverInfo?.name, 'session', SID ? 'yes' : 'no')
	await fetch(MCP, {
		method: 'POST',
		headers: { ...H, 'mcp-session-id': SID },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})
	const list = await rpc('tools/list', {})
	const listed = list?.result?.tools || []
	if (!listed.length) fail('tools/list returned no tools', list)
	const listedNames = listed.map(t => t.name)
	const disallowedListed = DISALLOWED_PUBLIC_TOOLS.filter(name => listedNames.includes(name))
	if (disallowedListed.length) fail('tools/list exposed non-public tools', disallowedListed)
	const isSpecFirstOnly = listedNames.includes('betterpptx.deck.generate_from_spec') && !listedNames.includes('betterpptx.slide.add_text')
	const requiredTools = isSpecFirstOnly ? REQUIRED_SPEC_FIRST_PUBLIC_TOOLS : REQUIRED_PUBLIC_TOOLS
	const missingRequired = requiredTools.filter(name => !listedNames.includes(name))
	if (missingRequired.length) fail('tools/list is missing required product tools', missingRequired)
	if (isSpecFirstOnly) {
		const exposedPrimitives = SPEC_FIRST_HIDDEN_PRIMITIVES.filter(name => listedNames.includes(name))
		if (exposedPrimitives.length) fail('spec-first public profile exposed direct primitives', exposedPrimitives)
	}
	const listedTextIssues = textIssues(listed, 'tools/list')
	if (listedTextIssues.length) fail('tools/list leaked banned terms', listedTextIssues)
	const schemaIssues = listed.flatMap(t => schemaKeyIssues(t.inputSchema, t.name))
	if (schemaIssues.length) fail('tools/list exposed banned schema keys', schemaIssues.slice(0, 20))
	const modelTool = listed.find(t => t.name === 'betterpptx.assets.generate_model3d')
	if (!isSpecFirstOnly) {
		if (!modelTool) fail('tools/list is missing public 3D asset selector', listedNames)
		const modelSchemaText = JSON.stringify(modelTool)
		const modelSchemaHits = MODEL3D_FORBIDDEN_SCHEMA_TEXT.filter(pattern => pattern.test(modelSchemaText)).map(String)
		if (modelSchemaHits.length) fail('3D asset selector schema exposed procedural/local generation controls', modelSchemaHits)
		if (!/does not synthesize new model geometry/i.test(modelSchemaText)) {
			fail('3D asset selector schema does not clearly state non-procedural behavior', modelTool)
		}
	}

	const status = await tool('betterpptx.status', {})
	if (!status.ok) fail('status failed', status)
	if (textIssues(status, 'status').length) fail('status leaked banned terms', status)

	if (isSpecFirstOnly) {
		const hiddenPrimitive = await tool('betterpptx.slide.add_text', {
			deckId: 'deck_private_surface_probe',
			slideIndex: 0,
			text: 'should be blocked',
			options: { x: 0.5, y: 0.5, w: 2, h: 0.4 },
		})
		if (!isSpecFirstPrimitiveBlocked(hiddenPrimitive)) {
			fail('spec-first public mode did not block hidden primitive call', hiddenPrimitive)
		}
		const generated = await awaitDurableResult(await tool('betterpptx.deck.generate_from_spec', {
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				title: 'Blackbox spec path guard',
				authoringContract: {
					workflow: 'authoring-excellence-director-v1',
					level: 'deterministic',
					coordinateSystem: 'inches',
					layerModel: 'flat-object-array',
					objectIdentity: 'stable-names-required',
					textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.',
				},
				contentStory: {
					audience: 'Public black-box verifier',
					outcome: 'Verify that the governed JSON-spec authoring path remains available.',
					remember: 'Public authoring uses one governed JSON specification.',
				},
				visualDesign: {
					world: 'Minimal verification brief',
					framing: 'One clear claim on a restrained native slide.',
					tone: 'precise and neutral',
				},
				motionTime: {
					masterClock: 'authored slide timeline',
					timingSource: 'Static verification plan',
					syncPolicy: 'No decorative motion; preserve deterministic timing.',
				},
				slides: [{
					id: 'blackbox-spec-1',
					title: 'Blackbox spec path guard',
					role: 'verification',
					message: 'The governed public JSON-spec path is executable.',
					layoutIntent: 'title-body',
					content: [
						{ kind: 'title', name: 'title', text: 'Blackbox spec path guard' },
						{ kind: 'body', name: 'body', text: 'Public generation uses one deterministic JSON spec.' },
					],
				}],
			},
			detail: 'summary',
			validateAfterCompile: false,
			idempotencyKey: `blackbox-spec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
		}), 'spec-first public generation')
		const generatedData = generated.data || generated
		if (!generated.ok || !generatedData?.deckId || generatedData?.slideCount !== 1) {
			fail('spec-first public mode did not generate via JSON spec', generated)
		}
		const localPathPrimitive = await tool('betterpptx.slide.add_image', {
			deckId: generatedData.deckId,
			slideIndex: 0,
			options: { path: 'C:\\private\\image.png', x: 1, y: 1, w: 2, h: 2 },
		})
		if (!isSpecFirstPrimitiveBlocked(localPathPrimitive)) {
			fail('spec-first public mode did not block hidden image primitive', localPathPrimitive)
		}
		const genericFetch = await tool('betterpptx.http.fetch', { url: 'http://169.254.169.254/latest/meta-data/' })
		if (genericFetch.ok !== false || genericFetch.error?.code !== 'BLACK_BOX') {
			fail('generic http.fetch was not blocked in public mode', genericFetch)
		}
		const version = await tool('betterpptx.version', {})
		if (version.ok !== false || version.error?.code !== 'BLACK_BOX') {
			fail('version diagnostic was not blocked in public mode', version)
		}
		const rawXml = await tool('betterpptx.slide.passthrough_xml', { deckId: generatedData.deckId, slideIndex: 0, xml: '<p:sp />' })
		if (!isSpecFirstPrimitiveBlocked(rawXml)) {
			fail('raw XML passthrough was not blocked in public mode', rawXml)
		}

		console.log('BLACKBOX VERIFY: PASS')
		return
	}

	const deck = await tool('betterpptx.deck.new', { title: 'Blackbox path guard' })
	if (!deck.ok) fail('deck.new failed', deck)
	const deckId = deck.data.deckId
	let deckVersion = deck.data.deckVersion
	if (!Number.isInteger(deckVersion)) fail('deck.new did not return deckVersion', deck)
	if (deck.data.director?.mode !== 'director-strict') fail('public deck.new did not default to director-strict', deck)
	const earlyAdd = await tool('betterpptx.slide.add', { deckId, deckVersion, background: { color: 'FFFFFF' } })
	if (earlyAdd.ok !== false || earlyAdd.error?.code !== 'DIRECTOR_STAGE_REQUIRED') {
		fail('strict public new deck allowed slide.add before director planning', earlyAdd)
	}
	const message = await tool('betterpptx.deck.define_message_architecture', {
		deckId,
		deckVersion,
		audience: 'Black-box endpoint verifier',
		deliveryMode: 'executive',
		thesis: 'Public endpoints must guide authoring without exposing internals.',
		storyArc: ['Plan', 'Build', 'Validate'],
		wordBudget: { maxVisibleWordsPerSlide: 45 },
		slides: [{ index: 0, message: 'The director gate is visible as a product workflow.' }],
	})
	if (!message.ok) fail('define_message_architecture failed', message)
	deckVersion = message.data.deckVersion
	const roles = await tool('betterpptx.deck.assign_slide_roles', {
		deckId,
		deckVersion,
		roles: [{ slideIndex: 0, role: 'system-map', purpose: 'Verify strict workflow gating.' }],
	})
	if (!roles.ok) fail('assign_slide_roles failed', roles)
	deckVersion = roles.data.deckVersion
	const system = await tool('betterpptx.deck.define_design_system', {
		deckId,
		deckVersion,
		structuralArchitecture: { grid: 'safe 16:9', masters: ['default'] },
		semanticColorArchitecture: { base: 'FFFFFF', text: '111827', accent: '2563EB', positive: '16A34A', negative: 'DC2626' },
		typographicHierarchy: { heading: 'Aptos Display', body: 'Aptos', scale: { title: 28, body: 15 } },
		visualAssetEcosystem: { geometry: 'low-radius panels', imagery: 'message-relevant only' },
		dataVisualizationSystems: { charts: 'semantic series colors', tables: 'readable headers' },
		motionTransitionDynamics: { transitions: ['fade'], maxDurationMs: 700 },
		packagingPackout: { outputFormat: 'pptx', validation: ['validate_quality'] },
	})
	if (!system.ok || system.data?.completed !== true) fail('define_design_system failed to complete', system)
	deckVersion = system.data.deckVersion
	const director = await tool('betterpptx.deck.director_status', { deckId })
	if (!director.ok || director.data?.readyForAuthoring !== true || director.data?.requiredBeforeAuthoring !== true) fail('director_status did not expose the governed authoring readiness contract', director)
	if (/primitive/i.test(JSON.stringify(director.data)) || director.data?.next?.recommendedTool !== 'betterpptx.deck.generate_from_spec') {
		fail('public director_status leaked an implementation authoring mode or recommended a non-spec route', director)
	}
	const stageTools = (director.data?.stages || []).map(stage => stage.tool).filter(Boolean)
	if (stageTools.some(toolName => !['betterpptx.deck.generate_from_spec', 'betterpptx.deck.validate_quality'].includes(toolName))) {
		fail('public director_status exposed a non-public stage tool route', director)
	}
	const added = await tool('betterpptx.slide.add', { deckId, deckVersion, background: { color: 'FFFFFF' } })
	if (!added.ok || !Number.isInteger(added.data?.deckVersion) || added.data.deckVersion <= deckVersion) {
		fail('slide.add did not advance deckVersion', added)
	}
	const stale = await tool('betterpptx.slide.add_text', {
		deckId,
		deckVersion,
		slideIndex: 0,
		text: 'stale mutation',
		options: { x: 0.5, y: 0.5, w: 2, h: 0.4 },
	})
	if (stale.ok !== false || stale.error?.code !== 'DECK_VERSION_CONFLICT') {
		fail('stale deckVersion mutation was not rejected', stale)
	}
	deckVersion = added.data.deckVersion
	const blocked = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'C:\\private\\image.png', x: 1, y: 1, w: 2, h: 2 },
	})
	if (blocked.ok !== false || blocked.error?.code !== 'BLACK_BOX' || blocked.error?.recoverable !== true) {
		fail('local path request was not blocked with structured BLACK_BOX error', blocked)
	}

	const genericFetch = await tool('betterpptx.http.fetch', { url: 'http://169.254.169.254/latest/meta-data/' })
	if (genericFetch.ok !== false || genericFetch.error?.code !== 'BLACK_BOX') {
		fail('generic http.fetch was not blocked in public mode', genericFetch)
	}
	const version = await tool('betterpptx.version', {})
	if (version.ok !== false || version.error?.code !== 'BLACK_BOX') {
		fail('version diagnostic was not blocked in public mode', version)
	}
	const rawXml = await tool('betterpptx.slide.passthrough_xml', { deckId, slideIndex: 0, xml: '<p:sp />' })
	if (rawXml.ok !== false || rawXml.error?.code !== 'BLACK_BOX') {
		fail('raw XML passthrough was not blocked in public mode', rawXml)
	}

	const metadataImage = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'http://169.254.169.254/latest/meta-data/', x: 1, y: 1, w: 2, h: 2 },
	})
	if (metadataImage.ok !== false || metadataImage.error?.code !== 'SAFE_FETCH_REFUSED' || metadataImage.error?.recoverable !== true) {
		fail('metadata-host image URL was not refused by safe fetch', metadataImage)
	}

	const privateImage = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'http://127.0.0.1/private.png', x: 1, y: 1, w: 2, h: 2 },
	})
	if (privateImage.ok !== false || privateImage.error?.code !== 'SAFE_FETCH_REFUSED' || privateImage.error?.recoverable !== true) {
		fail('private-IP image URL was not refused by safe fetch', privateImage)
	}

	console.log('BLACKBOX VERIFY: PASS')
}

main().catch(err => {
	if (process.exitCode === 3) return
	fail(err.message || String(err))
})
