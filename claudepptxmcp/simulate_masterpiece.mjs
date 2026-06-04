#!/usr/bin/env node
// =============================================================================
// UNIVERSAL AI-TO-AI MASTERPIECE SIMULATION
// =============================================================================
//
//  This script simulates a highly capable external AI agent that has discovered
//  the `claudepptxmcp` repository over the internet. Acting as the "Cognitive
//  Director", it consumes the raw primitives of the MCP server over standard
//  JSON-RPC stdio wire to engineer the ultimate, premium, high-fidelity PPTX deck.
//
//  Theme: "The Autonomous Agent SaaS Paradigm — Double MCP & Evolved OpenXML"
//  Slides: 6 premium, visual-centric, highly styled, animated, and morphed slides.
//
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, 'cli.mjs')

// --------------------------------------------------------------------------
//  Wire-only JSON-RPC Client Bridge
// --------------------------------------------------------------------------
function startMcpBridge() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1
	let rxBuf = Buffer.alloc(0)

	child.stderr.on('data', b => {
		const s = b.toString()
		if (/^\[claudepptxmcp\]/.test(s) || /server ready/.test(s)) {
			process.stderr.write(`[MCP Engine] ${s}`)
		}
	})

	child.stdout.on('data', chunk => {
		rxBuf = Buffer.concat([rxBuf, chunk])
		while (true) {
			const nl = rxBuf.indexOf(0x0a)
			if (nl < 0) break
			const line = rxBuf.subarray(0, nl).toString('utf8').trim()
			rxBuf = rxBuf.subarray(nl + 1)
			if (!line) continue
			try {
				const msg = JSON.parse(line)
				if (msg.id != null && pending.has(msg.id)) {
					const { resolve, reject } = pending.get(msg.id)
					pending.delete(msg.id)
					if (msg.error) reject(new Error(msg.error.message))
					else resolve(msg.result)
				}
			} catch (_e) {}
		}
	})

	function rpc(method, params) {
		const id = nextId++
		const body = { jsonrpc: '2.0', id, method, params }
		const line = JSON.stringify(body) + '\n'
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject })
			child.stdin.write(line)
		})
	}

	function notify(method, params) {
		const body = { jsonrpc: '2.0', method, params }
		child.stdin.write(JSON.stringify(body) + '\n')
	}

	async function initialize() {
		await rpc('initialize', {
			protocolVersion: '2024-11-05',
			clientInfo: { name: 'antigravity-masterpiece-simulator', version: '2.0.0' },
			capabilities: {},
		})
		notify('notifications/initialized', {})
	}

	async function callTool(name, args = {}) {
		const r = await rpc('tools/call', { name, arguments: args })
		const text = r.content && r.content[0] && r.content[0].text
		if (!text) throw new Error(`${name}: empty response`)
		const parsed = JSON.parse(text)
		if (!parsed.ok) {
			throw new Error(`${name} failed: ${parsed.error?.message || JSON.stringify(parsed.error)}`)
		}
		return parsed.data
	}

	function close() {
		child.stdin.end()
		child.kill()
	}

	return { initialize, callTool, close }
}

// --------------------------------------------------------------------------
//  Masterpiece Generator Recipe
// --------------------------------------------------------------------------
async function generateMasterpiece() {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const mcp = startMcpBridge()
	
	console.log('\n[Client] Initializing handshake with local MCP server...')
	await mcp.initialize()
	console.log('[Client] Connected! Initializing new presentation session...')

	// 1. Create a WIDE presentation with automatic iterate engine enabled
	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'The AI-to-AI SaaS Masterpiece',
		author: 'Antigravity 2.0',
		company: 'DeepMind Advanced Agentic Coding',
		enableIterateEngine: true
	})
	console.log(`[Client] In-memory presentation created (deckId: ${deckId})`)

	// =========================================================================
	//  SLIDE 1: The Title Cover (Agentic Convergence)
	// =========================================================================
	console.log('[Client] Composing Slide 1 (Nebula Cover)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: {
			type: 'gradient',
			gradientDirection: 'linear',
			gradientAngle: 135,
			gradientStops: [
				{ position: 0, color: '0B0F19' },   // Deep cosmic blue-black
				{ position: 50, color: '1E1B4B' },  // Deep indigo
				{ position: 100, color: '311042' }  // Deep space violet
			]
		},
		transition: { type: 'orbit', speed: 'medium' }
	})

	// Add high-end background glowing accent orb (ellipse with reflection and soft edges)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 0,
		shapeName: 'ellipse',
		options: {
			x: 8.0, y: -1.0, w: 6.0, h: 6.0,
			fill: {
				type: 'gradient',
				gradientDirection: 'radial',
				gradientStops: [
					{ position: 0, color: '67E8F9', transparency: 50 },  // Neon Cyan glow
					{ position: 100, color: '1E1B4B', transparency: 100 }
				]
			},
			softEdges: { size: 30 }
		}
	})

	// Title: Huge WordArt Arch text with soft glow
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'AGENTIC CONVERGENCE',
		options: {
			x: 0.5, y: 1.8, w: 12.33, h: 2.0,
			fontFace: 'Outfit',
			fontSize: 64,
			bold: true,
			color: 'FFFFFF',
			align: 'center',
			wordArt: { transform: 'textArchUp' },
			glow: { size: 10, color: 'A78BFA', opacity: 0.8 }, // Indigo glow
			animation: { type: 'entrance', effect: 'zoom', duration: 1000 }
		}
	})

	// Subtitle: Modern Text3D styled metallic subtitle
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'The Stateless, Double-MCP SaaS Architecture',
		options: {
			x: 0.5, y: 4.0, w: 12.33, h: 1.0,
			fontFace: 'Plus Jakarta Sans',
			fontSize: 26,
			color: '67E8F9', // Cyan
			align: 'center',
			text3D: {
				bevel: { type: 'circle', width: 4, height: 4 },
				extrusion: 6,
				extrusionColor: '4F46E5', // Slate indigo
				material: 'metal',
				lightRig: 'threePt',
				rotationX: 12,
				rotationY: -8,
				rotationZ: 2
			},
			animation: { type: 'entrance', effect: 'fade', duration: 800, delay: 500 }
		}
	})

	// Bottom tech-tagline
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'STATELExecution: Pure Primitives · Cloud Compiling · Zero GPU Overhead',
		options: {
			x: 0.5, y: 6.2, w: 12.33, h: 0.5,
			fontFace: 'Courier New',
			fontSize: 13,
			color: '94A3B8',
			align: 'center'
		}
	})

	// =========================================================================
	//  SLIDE 2: Native Combo Chart (AI-to-AI Performance Indicators)
	// =========================================================================
	console.log('[Client] Composing Slide 2 (Dual-Axis Performance Combo Chart)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: 'FAFBFD' }, // Crisp, clean grey-white
		transition: { type: 'fade', speed: 'medium' }
	})

	// Slide Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'AI-to-AI Performance Indicators',
		options: {
			x: 0.8, y: 0.6, w: 10.0, h: 0.8,
			fontFace: 'Outfit',
			fontSize: 32,
			bold: true,
			color: '0F172A'
		}
	})

	// Text description box
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'Stateless orchestrations leverage client tokens for cognitive processing, driving down CAC (Customer Acquisition Cost) to near-zero while simultaneously increasing secure back-end API volume.',
		options: {
			x: 0.8, y: 1.3, w: 11.5, h: 0.8,
			fontFace: 'Plus Jakarta Sans',
			fontSize: 15,
			color: '475569'
		}
	})

	// Native Dual-Axis Chart: Column Chart + Line Chart combo
	await mcp.callTool('claudepptx.slide.add_chart', {
		deckId,
		slideIndex: 1,
		chartMulti: [
			{
				type: 'bar',
				data: [
					{
						name: 'AI-to-AI API Calls (k)',
						labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Projected Y2'],
						values: [45, 120, 380, 890, 2450]
					}
				],
				options: {
					chartColors: ['6366F1'], // Indigo primary
					barGapWidthPct: 60
				}
			},
			{
				type: 'line',
				data: [
					{
						name: 'CAC Reduction %',
						labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Projected Y2'],
						values: [10, 35, 68, 92, 98]
					}
				],
				options: {
					chartColors: ['F59E0B'], // Amber secondary
					lineSmooth: true,
					lineDataSymbol: 'circle',
					lineDataSymbolSize: 8,
					secondaryValAxis: true // Bind to right vertical axis
				}
			}
		],
		options: {
			x: 0.8, y: 2.2, w: 11.7, h: 4.3,
			chartColors: ['6366F1', 'F59E0B'],
			showLegend: true,
			legendPos: 't',
			plotArea: {
				fill: {
					type: 'gradient',
					gradientDirection: 'linear',
					gradientAngle: 90,
					gradientStops: [
						{ position: 0, color: 'FFFFFF' },
						{ position: 100, color: 'F8FAFC' }
					]
				}
			},
			valAxes: [
				{ valAxisTitle: 'API Invocations (Thousands)', valAxisTitleFontSize: 10, valAxisLabelColor: '6366F1' },
				{ valAxisTitle: 'CAC Reduction (%)', valAxisTitleFontSize: 10, valAxisLabelColor: 'F59E0B' }
			]
		}
	})

	// =========================================================================
	//  SLIDE 3: Evolved Primitives Table
	// =========================================================================
	console.log('[Client] Composing Slide 3 (Visual Primitives Table)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '0F172A' }, // Rich slate dark background
		transition: { type: 'glitter', direction: 'left', speed: 'medium' }
	})

	// Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'Evolved OOXML Feature Table',
		options: {
			x: 0.8, y: 0.6, w: 10.0, h: 0.8,
			fontFace: 'Outfit',
			fontSize: 32,
			bold: true,
			color: 'FFFFFF'
		}
	})

	// Table columns definitions: Features comparison
	const borderStyle = { pt: 1, color: '334155' }
	const accentGradient = {
		type: 'gradient',
		gradientDirection: 'linear',
		gradientAngle: 45,
		gradientStops: [
			{ position: 0, color: '1E1B4B' },
			{ position: 100, color: '311042' }
		]
	}

	const headerStyle = {
		fill: accentGradient,
		color: '67E8F9',
		fontFace: 'Outfit',
		fontSize: 16,
		bold: true,
		align: 'center',
		valign: 'middle',
		border: [borderStyle, borderStyle, { pt: 2, color: '67E8F9' }, borderStyle]
	}

	const cellStyleLeft = {
		color: 'E2E8F0',
		fontFace: 'Plus Jakarta Sans',
		fontSize: 13,
		align: 'left',
		valign: 'middle',
		border: borderStyle
	}

	const cellStyleCenter = {
		color: '38BDF8', // Soft cyan
		fontFace: 'Plus Jakarta Sans',
		fontSize: 13,
		bold: true,
		align: 'center',
		valign: 'middle',
		border: borderStyle
	}

	const cellStyleLegacy = {
		color: '94A3B8',
		fontFace: 'Plus Jakarta Sans',
		fontSize: 13,
		align: 'center',
		valign: 'middle',
		border: borderStyle
	}

	await mcp.callTool('claudepptx.slide.add_table', {
		deckId,
		slideIndex: 2,
		rows: [
			[
				{ text: 'Capability', options: headerStyle },
				{ text: 'Legacy pptxgenjs', options: headerStyle },
				{ text: 'Evolved claudepptxmcp', options: headerStyle },
				{ text: 'AI Directives', options: headerStyle }
			],
			[
				{ text: '3D Materials & Bevels', options: cellStyleLeft },
				{ text: '❌ Plain 2D only', options: cellStyleLegacy },
				{ text: '✅ Native Text3D Engine', options: cellStyleCenter },
				{ text: 'Autonomous styling options', options: cellStyleLeft }
			],
			[
				{ text: 'Fluid Morph Transitions', options: cellStyleLeft },
				{ text: '❌ Standard slide wipes', options: cellStyleLegacy },
				{ text: '✅ Morph byObject / Word', options: cellStyleCenter },
				{ text: 'Implicit magic moves via duplicate', options: cellStyleLeft }
			],
			[
				{ text: 'Multi-axis Combo Charts', options: cellStyleLeft },
				{ text: '❌ Single type only', options: cellStyleLegacy },
				{ text: '✅ Full native composite plots', options: cellStyleCenter },
				{ text: 'Plot complex KPIs natively', options: cellStyleLeft }
			],
			[
				{ text: 'SmartArt-style Layouts', options: cellStyleLeft },
				{ text: '❌ Custom drawing required', options: cellStyleLegacy },
				{ text: '✅ Editable native shapes', options: cellStyleCenter },
				{ text: 'Auto-arrange cards & processes', options: cellStyleLeft }
			],
			[
				{ text: 'Direct Vector custGeom', options: cellStyleLeft },
				{ text: '❌ Simple presets only', options: cellStyleLegacy },
				{ text: '✅ Polygon points & Beziers', options: cellStyleCenter },
				{ text: 'Dynamically render maps & SVGs', options: cellStyleLeft }
			]
		],
		options: {
			x: 0.8, y: 1.6, w: 11.7, h: 4.8,
			colW: [3.5, 2.5, 2.7, 3.0],
			rowH: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]
		}
	})

	// =========================================================================
	//  SLIDE 4: Morph Magic — Source (The Gateway)
	// =========================================================================
	console.log('[Client] Composing Slide 4 (Morph Gateway - Source)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '070A13' }, // Intense dark theme
		transition: { type: 'fade', speed: 'fast' }
	})

	// Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'The Architecture Split',
		options: {
			x: 0.8, y: 0.6, w: 10.0, h: 0.8,
			fontFace: 'Outfit',
			fontSize: 32,
			bold: true,
			color: 'FFFFFF'
		}
	})

	// Subtitle
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'The system operates as distinct functional nodes across the network, initialized and controlled in sequence by the orchestrating AI.',
		options: {
			x: 0.8, y: 1.3, w: 11.0, h: 0.6,
			fontFace: 'Plus Jakarta Sans',
			fontSize: 15,
			color: '94A3B8'
		}
	})

	// Card 1: Client AI (source state)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 3,
		shapeName: 'roundRect',
		options: {
			x: 1.0, y: 2.8, w: 3.2, h: 3.2,
			objectName: 'Client_AI_Node',
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 90,
				gradientStops: [
					{ position: 0, color: '0284C7' },
					{ position: 100, color: '0EA5E9' }
				]
			},
			line: { pt: 2, color: '38BDF8' },
			shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 15 }
		},
		text: 'Client AI\n(The Director)',
		textOptions: { fontFace: 'Outfit', fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Card 2: SaaS MCP Gateway (source state)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 3,
		shapeName: 'roundRect',
		options: {
			x: 5.0, y: 2.8, w: 3.2, h: 3.2,
			objectName: 'SaaS_MCP_Node',
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 90,
				gradientStops: [
					{ position: 0, color: 'C026D3' },
					{ position: 100, color: 'E879F9' }
				]
			},
			line: { pt: 2, color: 'F472B6' },
			shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 15 }
		},
		text: 'SaaS MCP\n(The Stateless Bridge)',
		textOptions: { fontFace: 'Outfit', fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Card 3: OOXML Engine (source state)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 3,
		shapeName: 'roundRect',
		options: {
			x: 9.0, y: 2.8, w: 3.2, h: 3.2,
			objectName: 'OOXML_Engine_Node',
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 90,
				gradientStops: [
					{ position: 0, color: 'D97706' },
					{ position: 100, color: 'F59E0B' }
				]
			},
			line: { pt: 2, color: 'FBBF24' },
			shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 15 }
		},
		text: 'OOXML Engine\n(The Compiler)',
		textOptions: { fontFace: 'Outfit', fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// =========================================================================
	//  SLIDE 5: Morph Magic — Target (The Orcheration Convergence)
	// =========================================================================
	console.log('[Client] Composing Slide 5 (Morph Target - Magic Move via Duplicate)...')
	// Deep-clone Slide 4 so the shape object names & IDs map with perfect identity
	await mcp.callTool('claudepptx.slide.duplicate', {
		deckId,
		slideIndex: 3,
		transition: { type: 'morph', option: 'byObject' }
	})

	// Modify cloned Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 4,
		text: 'Stateless Converged Flow',
		options: {
			x: 0.8, y: 0.6, w: 10.0, h: 0.8,
			fontFace: 'Outfit',
			fontSize: 32,
			bold: true,
			color: 'FFFFFF'
		}
	})

	// Modify cloned Subtitle
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 4,
		text: 'Under convergence, the nodes reposition, scale, and rotate to establish a secure, multi-layered data handshake—fluidly interpolated in real-time.',
		options: {
			x: 0.8, y: 1.3, w: 11.0, h: 0.6,
			fontFace: 'Plus Jakarta Sans',
			fontSize: 15,
			color: '94A3B8'
		}
	})

	// Morph shape 1 (Client AI): Move, grow, rotate, and update colors/text
	await mcp.callTool('claudepptx.slide.update_shape', {
		deckId,
		slideIndex: 4,
		target: { objectName: 'Client_AI_Node' },
		patch: {
			x: 1.5, y: 2.2, w: 3.5, h: 4.2,
			rotate: 10,
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 45,
				gradientStops: [
					{ position: 0, color: '1E3A8A' }, // Darker, richer primary
					{ position: 100, color: '0284C7' }
				]
			}
		}
	})

	// Morph shape 2 (SaaS MCP): Shrink slightly, move to middle as a narrow connector
	await mcp.callTool('claudepptx.slide.update_shape', {
		deckId,
		slideIndex: 4,
		target: { objectName: 'SaaS_MCP_Node' },
		patch: {
			x: 5.6, y: 2.2, w: 2.0, h: 4.2,
			rotate: 0,
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 45,
				gradientStops: [
					{ position: 0, color: '581C87' },
					{ position: 100, color: 'C026D3' }
				]
			}
		}
	})

	// Morph shape 3 (OOXML Engine): Move, grow, tilt inverse, and update colors/text
	await mcp.callTool('claudepptx.slide.update_shape', {
		deckId,
		slideIndex: 4,
		target: { objectName: 'OOXML_Engine_Node' },
		patch: {
			x: 8.2, y: 2.2, w: 3.5, h: 4.2,
			rotate: -10,
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 45,
				gradientStops: [
					{ position: 0, color: '78350F' },
					{ position: 100, color: 'D97706' }
				]
			}
		}
	})

	// =========================================================================
	//  SLIDE 6: The Finale (Custom Geometry Vector Sparks)
	// =========================================================================
	console.log('[Client] Composing Slide 6 (Vector Spark Finale)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: {
			type: 'gradient',
			gradientDirection: 'radial',
			gradientStops: [
				{ position: 0, color: '1E1B4B' },   // Deep purple nebula
				{ position: 100, color: '09070F' }  // Pitch black edges
			]
		},
		transition: { type: 'vortex', speed: 'slow' }
	})

	// Custom hand-drawn vector lightning bolt (custGeom) glowing in gold
	const boltPoints = [
		{ x: 6.6, y: 1.5, moveTo: true },
		{ x: 5.6, y: 3.5 },
		{ x: 6.2, y: 3.5 },
		{ x: 5.4, y: 5.5 },
		{ x: 7.2, y: 3.2 },
		{ x: 6.5, y: 3.2 },
		{ close: true }
	]

	await mcp.callTool('claudepptx.slide.add_freeform', {
		deckId,
		slideIndex: 5,
		x: 5.0, y: 1.0, w: 3.3, h: 5.0,
		points: boltPoints,
		fill: {
			type: 'gradient',
			gradientDirection: 'linear',
			gradientAngle: 90,
			gradientStops: [
				{ position: 0, color: 'FBBF24' },  // Neon yellow glow
				{ position: 100, color: 'F59E0B' }
			]
		},
		line: { pt: 3, color: 'FFFFFF' },
		glow: { size: 25, color: 'F59E0B', opacity: 0.9 },
		animation: { type: 'emphasis', effect: 'pulse', duration: 1200, repeatCount: 'indefinite' }
	})

	// Concluding Text3D Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 5,
		text: 'PROVE THE FUTURE',
		options: {
			x: 0.5, y: 2.2, w: 12.33, h: 1.8,
			fontFace: 'Outfit',
			fontSize: 72,
			bold: true,
			color: 'FFFFFF',
			align: 'center',
			text3D: {
				bevel: { type: 'circle', width: 6, height: 6 },
				extrusion: 15,
				extrusionColor: '1E1B4B',
				material: 'powder',
				lightRig: 'brightRoom',
				rotationX: 18,
				rotationY: -12,
				rotationZ: 0
			}
		}
	})

	// Subtext
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 5,
		text: 'Autonomous AI Orchestration · Stateless Vector Compiling',
		options: {
			x: 0.5, y: 5.8, w: 12.33, h: 0.8,
			fontFace: 'Plus Jakarta Sans',
			fontSize: 18,
			color: '67E8F9',
			align: 'center',
			glow: { size: 5, color: '0284C7', opacity: 0.6 }
		}
	})

	// =========================================================================
	//  DECK AUTOPLAY & SAVE LIFECYCLE
	// =========================================================================
	console.log('[Client] Setting deck to Autoplay Kiosk Loop...')
	await mcp.callTool('claudepptx.deck.autoplay', {
		deckId,
		secondsPerSlide: 8,
		loop: true,
		mode: 'kiosk',
		defaultTransition: { type: 'fade', speed: 'medium' }
	})

	console.log('[Client] Running final semantic validation check...')
	const valResult = await mcp.callTool('claudepptx.deck.validate', {
		deckId,
		mode: 'normal',
		autoFix: true
	})
	console.log(`[Client] Validation results: valid: ${valResult.valid}, issues: ${valResult.issueCount}`)

	console.log('[Client] Saving masterpiece presentation to disk...')
	const fileName = `BetterPPTX_SaaS_Masterpiece_${stamp}.pptx`
	const saveResult = await mcp.callTool('claudepptx.deck.save', {
		deckId,
		outputDir: 'outputs',
		fileName
	})

	console.log('\n==========================================================')
	console.log('  SIMULATED MASTERPIECE DECK GENERATED SUCCESSFULLY!')
	console.log('==========================================================')
	console.log(`File Path : ${saveResult.filePath}`)
	console.log(`File Size : ${saveResult.bytes.toLocaleString()} bytes`)
	console.log(`Slides    : ${saveResult.slideCount}`)
	console.log('==========================================================\n')

	mcp.close()
}

generateMasterpiece().catch(err => {
	console.error('\n[Client] FATAL ERROR:', err && err.stack || err)
	process.exit(1)
})
