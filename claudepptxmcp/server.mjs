// betterpptx MCP server (stdio transport)

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { TOOLS } from './tools.mjs'
import { callBetterPptxTool } from './engine.mjs'
import { BETTERPPTX_PRODUCT, BETTERPPTX_SERVER_NAME } from './branding.mjs'
import { createTraceId, getLoggerInfo, logEvent } from './logger.mjs'
import { isPublicBlackBoxMode, publicToolList } from './blackbox.mjs'

const SERVER_INFO = {
	name: BETTERPPTX_SERVER_NAME,
	version: process.env.BETTERPPTX_PUBLIC_VERSION || 'current',
}

const INSTRUCTIONS = [
	`${BETTERPPTX_PRODUCT} is a self-contained PPTX generation and editing engine.`,
	'Use its tools directly for presentation creation, editing, inspection,',
	'validation, media, charts, tables, SmartArt-style diagrams, animations, transitions, WordArt, Text3D,',
	'GLB 3D models, motion paths, and raw OOXML passthrough.',
	'No external PPTX authoring library is required by the AI client.',
	'',
	'Typical flow:',
	'  1) betterpptx.deck.new           -> get deckId',
	'  2) betterpptx.slide.add          -> append slide (background, transition)',
	'  3) betterpptx.slide.add_text /add_shape /add_smartart /add_chart /add_image /add_model3d /add_table',
	'     ... each takes (deckId, slideIndex, ...). Use the full options object;',
	'     fills can be gradient ({ type:"gradient", gradientStops:[...] }); text',
	'     can carry wordArt:{ transform:"textArchUp" } and text3D:{ bevel,extrusion,material,lightRig,rotationX,rotationY }.',
	'     Call betterpptx.table.recommend before add_table when the table style is not specified; it returns PowerPoint',
	'     Table Design flags plus adapted cell styling recipes.',
	'     For picture SmartArt layouts, provide an image on every node; the endpoint rejects blank picture placeholders.',
	'  4) Use gradients, transitions, and animations as normal deck defaults. Ask the AI client/user for visual and motion',
	'     preferences when they are missing, or choose polished safe defaults.',
	'  5) betterpptx.deck.validate      -> sanity check before save',
	'  6) betterpptx.deck.save          -> write .pptx to disk',
	'',
	'Call betterpptx.help.capabilities for a feature catalog and betterpptx.status to verify runtime freshness.',
	'',
	'Editing principle: anything structurally generated should be mutable. For existing decks, call',
	'betterpptx.deck.open_existing, then deck.editability_report and slide.inspect_shapes before mutation.',
	'Read each object editHandle/stableSelectors/editability.tier/tools/operations/recreateWith before choosing a route.',
	'Editing should improve the deck the user already has. Reuse existing text boxes, images, charts, shapes,',
	'and layout relationships first; change color, contrast, typography, spacing, z-order, animation, transition,',
	'and readable text before adding new objects. Do not add banners, badges, 3D, WordArt, Text3D, SmartArt,',
	'or decorative panels merely to prove feature coverage.',
	'Prefer narrow tools over broad deck-wide edits: slide.update for one slide, slide.set_transition for one transition,',
	'slide.update_shape / update_table / update_chart / update_smartart / update_equation / update_media for semantic',
	'object edits, and slide.delete_shapes / reorder_shape for object lifecycle and z-order. Passthrough objects are',
	'wrapper-editable or preserve-only unless a tool reports promotable; explain the promotion/recreate path instead',
	'of silently failing or patching risky raw XML.',
].join('\n')

const PUBLIC_INSTRUCTIONS = [
	`${BETTERPPTX_PRODUCT} creates, edits, narrates, animates, validates, and exports polished PowerPoint (.pptx) presentations.`,
	'Use the available tools to help the user finish a real presentation, then return the saved .pptx download link.',
	'Refer to generated assets by returned download links or opaque handles. Do not expose local paths, source files,',
	'process details, dependencies, logs, or private assets.',
	'',
	'First calls:',
	'  1) betterpptx.auth.status to learn the current free/premium/credit state.',
	'  2) betterpptx.help.capabilities with the user intent when you need the recommended call sequence.',
	'',
	'Free/premium behavior:',
	'  - slides 1 and 2 can use premium preview features.',
	'  - the premium-feature gate starts at slide 3.',
	'  - slide 2 should use organized Morph-by-object when it is useful for the story.',
	'  - if a tool returns REQUIRES_UPGRADE, do not silently skip the requested feature.',
	'    Explain the gate, keep the valid work so far, offer activation through',
	'    betterpptx.auth.activate_key, and offer the best free-tier fallback.',
	'',
	'Uploaded/existing decks:',
	'  - use betterpptx.deck.open_uploaded with PPTX bytes from the AI client.',
	'  - inspect available objects with public-safe tools before editing.',
	'  - preserve useful layout relationships and reuse existing text boxes, images, charts, shapes,',
	'    and slide structure before adding objects.',
	'  - improve readability through contrast, concise wording, hierarchy, typography, spacing,',
	'    color, and image treatment.',
	'  - do not add banners, badges, 3D, WordArt, Text3D, SmartArt, charts, or decorative panels',
	'    merely to prove feature coverage.',
	'',
	'TREAT EVERY DECK AS A PRODUCT EXPERIENCE, NOT A PLUMBING TEST. Unless the user explicitly asks for a minimal repro,',
	'never ship blank slides with a single text box or generic "slide 1/2/3" filler. Aim for a credible, designed demo.',
	'',
	'Workflow:',
	'  1) Story first — fix the audience, promise, proof, and payoff, and ONE spoken message per slide, before building.',
	'  2) For new decks, betterpptx.deck.new, then betterpptx.slide.add per slide with a deliberate background.',
	'     For existing/uploaded decks, open the deck, list/inspect shapes, and preserve the deck structure unless the',
	'     user asked for a redesign.',
	'  3) Design the slide system with slide.add_text / add_shape / add_smartart / add_chart / add_table / add_image /',
	'     add_model3d / add_freeform:',
	'       - a deliberate palette (neutral surfaces + two or more accents); gradients and shadows as baseline styling,',
	'         not premium extras; clear type hierarchy; whitespace; supporting panels, dividers, charts, and icons only',
	'         when they serve the content.',
	'       - when editing an existing deck, prefer update_shape/update_chart/update_table/update_media and animation',
	'         of existing objects over adding new decorative elements.',
	'       - give every object that will animate a stable name.',
	'       - when using picture-based diagram layouts, supply real image/data URL/image URL content for every node; if images',
	'         are unavailable, ask for them or choose a non-picture SmartArt layout.',
	'       - when using tables, call betterpptx.table.recommend and apply the chosen preset optionDefaults plus',
	'         header/body/banded/total/first-column/last-column cell recipes instead of shipping plain grids.',
	'       - use rich media only when it strengthens the story.',
	'  4) Motion + narration — transitions and animations are part of normal authoring: apply slide.animate_shapes and',
	'     deck.set_transitions_all, then slide.add_narration so each cue reveals the exact object the voice discusses;',
	'     keep captions/lower-thirds integrated and non-overlapping.',
	'  5) Validate before saving — betterpptx.deck.validate (package), betterpptx.deck.validate_design (use',
	'     profile "narrated-showcase" when offered), and betterpptx.deck.validate_narration; fix flatness, overlaps,',
	'     and caption collisions before delivery.',
	'  6) betterpptx.deck.save — then hand the user the returned downloadUrl so they can download the finished .pptx.',
	'',
	'Call betterpptx.help.capabilities for compact workflow guidance and betterpptx.deck.summary to review a deck.',
	'For public chat uploads, call betterpptx.deck.open_uploaded with PPTX bytes, then slide.list_shapes to get',
	'objectName/index selectors before editing. Generated or structurally imported objects should be edited with',
	'their narrow semantic tools. If a requested deep edit is unavailable, explain the recreate path rather than',
	'patching unsupported presentation markup.',
].join('\n')

function sdkToolFromDef(def) {
	const tool = {
		name: def.name,
		title: def.title,
		description: def.description,
		inputSchema: def.inputSchema,
	}
	// Advertise structured-output schema + behaviour hints when present so hosts
	// (ChatGPT / claude.ai) stop flagging "output format recommended" and can
	// categorise read-only vs mutating tools.
	if (def.outputSchema) tool.outputSchema = def.outputSchema
	if (def.annotations) tool.annotations = def.annotations
	return tool
}

function asResultContent(payload, isError = false) {
	return {
		content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
		structuredContent: payload,
		isError,
	}
}

// The bundled PPTX runtime emits debug logs via console.log. On a stdio
// MCP transport that would corrupt the JSON-RPC stream. Redirect console.log
// (and warn/info) to stderr for the lifetime of the tool call.
async function withStdoutRedirected(fn) {
	const orig = { log: console.log, info: console.info, warn: console.warn }
	const toErr = (...args) => process.stderr.write(args.map(a => typeof a === 'string' ? a : (() => { try { return JSON.stringify(a) } catch { return String(a) } })()).join(' ') + '\n')
	console.log = toErr
	console.info = toErr
	console.warn = toErr
	try { return await fn() }
	finally { console.log = orig.log; console.info = orig.info; console.warn = orig.warn }
}

export function createBetterPptxMcpServer(context = {}) {
	const blackBox = context.blackBox ?? isPublicBlackBoxMode()
	const logContext = {
		sessionId: context.sessionId || null,
		clientInfo: context.clientInfo || null,
		blackBox,
	}
	const server = new Server(SERVER_INFO, {
		capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
		instructions: blackBox ? PUBLIC_INSTRUCTIONS : INSTRUCTIONS,
	})

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const requestId = createTraceId('mcp')
		const sourceTools = blackBox ? publicToolList(TOOLS) : TOOLS
		const tools = sourceTools.map(sdkToolFromDef)
		logEvent('mcp.request.tools_list', { ...logContext, requestId })
		logEvent('mcp.response.tools_list', { ...logContext, requestId, toolCount: tools.length, tools })
		return { tools }
	})

	server.setRequestHandler(CallToolRequestSchema, async req => {
		const requestId = createTraceId('mcp')
		const name = req.params.name
		const args = req.params.arguments || {}
		logEvent('mcp.request.tools_call', { ...logContext, requestId, name, args })
		const result = await withStdoutRedirected(() => callBetterPptxTool(name, args, {
			sessionId: context.sessionId || 'stdio-default',
			clientInfo: context.clientInfo || null,
			blackBox,
		}))
		const response = asResultContent(result, !result.ok)
		logEvent('mcp.response.tools_call', { ...logContext, requestId, name, response })
		return response
	})

	server.setRequestHandler(ListResourcesRequestSchema, async () => {
		const requestId = createTraceId('mcp')
		const response = { resources: [] }
		logEvent('mcp.request.resources_list', { ...logContext, requestId })
		logEvent('mcp.response.resources_list', { ...logContext, requestId, response })
		return response
	})

	return server
}

export async function runBetterPptxMcpStdio() {
	const server = createBetterPptxMcpServer()
	const transport = new StdioServerTransport()
	await server.connect(transport)
	process.stderr.write(`[betterpptx] MCP server ready (stdio, ${TOOLS.length} tools).\n`)
	const logger = getLoggerInfo()
	if (logger.enabled) process.stderr.write(`[betterpptx] traffic log: ${logger.file}\n`)
	logEvent('server.stdio.ready', { toolCount: TOOLS.length, logger })
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('server.mjs')) {
	runBetterPptxMcpStdio().catch(err => {
		process.stderr.write(`[betterpptx] fatal: ${err && err.stack || err}\n`)
		process.exit(1)
	})
}
