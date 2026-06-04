#!/usr/bin/env node
// =============================================================================
// UNIVERSAL AI-TO-AI EXHAUSTIVE MASTERPIECES GENERATOR
// =============================================================================
//
//  This script simulates a highly advanced AI client that exhaustively tests
//  every capability, feature, option, and variant of the `claudepptxmcp` server.
//  It generates 5 distinct masterpiece presentations saved under `outputs/`:
//
//  1. claudepptx_masterpiece_text.pptx (Text, Layouts & Equations)
//  2. claudepptx_masterpiece_shapes.pptx (Shapes & Vector Geometry)
//  3. claudepptx_masterpiece_tables_charts.pptx (Tables & Composite Charts)
//  4. claudepptx_masterpiece_animations.pptx (Animations & Transitions)
//  5. claudepptx_masterpiece_advanced.pptx (SmartArt, 3D & Narration)
//
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'

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
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
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
//  Masterpiece Generators
// --------------------------------------------------------------------------

// Masterpiece 1: Layouts, Master Slides, and Text Formatting
async function runTextMasterpiece(mcp) {
	console.log('\n[Client] ==================================================')
	console.log('[Client]  Generating MASTERPIECE 1: Text, Layouts & Equations')
	console.log('[Client] ==================================================')

	// Test custom slide layouts
	console.log('[Client] Registering custom LAYOUT_BILLBOARD size (20x10 inches)...')
	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Masterpiece 1: Text & Layouts',
		author: 'Antigravity 2.0',
		enableIterateEngine: true
	})

	await mcp.callTool('claudepptx.deck.define_layout', {
		deckId,
		name: 'LAYOUT_BILLBOARD',
		width: 20,
		height: 10,
		activate: true
	})

	// Test complex slide masters
	console.log('[Client] Defining complex SLIDE_MASTER_PREMIUM...')
	await mcp.callTool('claudepptx.deck.define_master', {
		deckId,
		master: {
			title: 'SLIDE_MASTER_PREMIUM',
			background: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 90,
				gradientStops: [
					{ position: 0, color: '0F172A' },
					{ position: 100, color: '1E293B' }
				]
			},
			margin: 0.5,
			slideNumber: { x: 19.0, y: 9.3, fontSize: 10, color: '64748B' },
			objects: [
				{
					rect: {
						x: 0, y: 0, w: 20.0, h: 0.1,
						fill: {
							type: 'gradient',
							gradientDirection: 'linear',
							gradientAngle: 90,
							gradientStops: [
								{ position: 0, color: '6366F1' },
								{ position: 50, color: 'EC4899' },
								{ position: 100, color: '3B82F6' }
							]
						}
					}
				},
				{
					text: {
						text: 'THE STATELESS PARADIGM · ANTIGRAVITY EXHAUSTIVE SUITE',
						options: { x: 0.5, y: 9.3, w: 10, h: 0.4, fontFace: 'Courier New', fontSize: 10, color: '64748B' }
					}
				}
			]
		}
	})

	// Slide 1: WordArt Transform Matrix
	console.log('[Client] Composing Slide 1: Exhaustive WordArt Transform Grid...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		masterName: 'SLIDE_MASTER_PREMIUM',
		background: { color: '090D1A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'EXHAUSTIVE WORDART TRANSFORMS',
		options: { x: 0.5, y: 0.5, w: 19, h: 0.8, fontFace: 'Outfit', fontSize: 28, bold: true, color: 'F1F5F9', align: 'center' }
	})

	const wordArtTransforms = [
		'textArchUp', 'textArchDown', 'textCircle', 'textButton',
		'textCurveUp', 'textCurveDown', 'textCanUp', 'textCanDown',
		'textWave1', 'textWave2', 'textDoubleWave1', 'textDoubleWave2',
		'textFadeUp', 'textFadeDown', 'textFadeLeft', 'textFadeRight',
		'textInflate', 'textDeflate', 'textChevron', 'textChevronDown'
	]

	// Grid layout
	let cols = 5
	let w = 3.5, h = 1.4
	let gapX = 0.4, gapY = 0.3
	let startX = 0.5, startY = 1.6

	for (let i = 0; i < wordArtTransforms.length; i++) {
		const t = wordArtTransforms[i]
		const r = Math.floor(i / cols)
		const c = i % cols
		const x = startX + c * (w + gapX)
		const y = startY + r * (h + gapY)

		await mcp.callTool('claudepptx.slide.add_text', {
			deckId,
			slideIndex: 0,
			text: t.substring(4).toUpperCase(),
			options: {
				x, y, w, h,
				fontFace: 'Plus Jakarta Sans',
				fontSize: 16,
				bold: true,
				color: '67E8F9',
				align: 'center',
				valign: 'middle',
				fill: { color: '111827' },
				line: { pt: 1.5, color: '1E293B' },
				wordArt: { transform: t }
			}
		})
	}

	// Slide 2: Text3D Extrusion & Material Gallery
	console.log('[Client] Composing Slide 2: High-End Text3D Styling Gallery...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		masterName: 'SLIDE_MASTER_PREMIUM',
		background: { color: '0B0F19' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'NATIVE TEXT3D DEPTH GALLERY',
		options: { x: 0.5, y: 0.5, w: 19, h: 0.8, fontFace: 'Outfit', fontSize: 28, bold: true, color: 'F1F5F9', align: 'center' }
	})

	const bevels = ['circle', 'relaxedInset', 'cross', 'coolSlant', 'angle', 'softRound', 'convex', 'slope']
	const materials = ['metal', 'matte', 'plastic', 'powder']
	const lights = ['threePt', 'balanced', 'brightRoom', 'harsh']

	cols = 4
	w = 4.4; h = 1.8
	gapX = 0.5; gapY = 0.4
	startX = 0.6; startY = 1.6

	for (let i = 0; i < 8; i++) {
		const b = bevels[i]
		const m = materials[i % materials.length]
		const l = lights[i % lights.length]
		const r = Math.floor(i / cols)
		const c = i % cols
		const x = startX + c * (w + gapX)
		const y = startY + r * (h + gapY)

		await mcp.callTool('claudepptx.slide.add_text', {
			deckId,
			slideIndex: 1,
			text: `${b.toUpperCase()}\n[${m}/${l}]`,
			options: {
				x, y, w, h,
				fontFace: 'Outfit',
				fontSize: 16,
				bold: true,
				color: 'F3F4F6',
				align: 'center',
				valign: 'middle',
				fill: { color: '090D16' },
				line: { pt: 1.5, color: '3B82F6' },
				text3D: {
					bevel: { type: i === 0 ? 'circle' : b, width: 6, height: 6 },
					extrusion: 10,
					extrusionColor: i % 2 === 0 ? '3B82F6' : 'EC4899',
					material: m,
					lightRig: l,
					rotationX: 18,
					rotationY: -12,
					rotationZ: 0
				}
			}
		})
	}

	// Slide 3: Rich Formatting & Inline Run Styles
	console.log('[Client] Composing Slide 3: Rich Typography & Paragraph Run Styling...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		masterName: 'SLIDE_MASTER_PREMIUM',
		background: { color: '0F172A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'RICH TYPOGRAPHY & INLINE STYLES',
		options: { x: 0.5, y: 0.5, w: 19, h: 0.8, fontFace: 'Outfit', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// Add complex inline run styles
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: [
			{
				text: 'EXHAUSTIVE MIXED RUNS: ',
				options: { bold: true, fontSize: 18, color: '67E8F9', fontFace: 'Outfit' }
			},
			{
				text: 'Here is Outfit Font. ',
				options: { fontSize: 16, color: 'E2E8F0', fontFace: 'Outfit' }
			},
			{
				text: 'This run is Playfair Display and Italic. ',
				options: { italic: true, fontSize: 18, color: 'F472B6', fontFace: 'Playfair Display' }
			},
			{
				text: 'This is monospace Courier New and bold-underlined. ',
				options: { bold: true, underline: true, fontSize: 14, color: 'FBBF24', fontFace: 'Courier New' }
			},
			{
				text: 'Click here for the Google site.',
				options: { bold: true, fontSize: 16, color: '38BDF8', fontFace: 'Outfit', hyperlink: { url: 'https://google.com' } }
			}
		],
		options: {
			x: 0.8, y: 1.6, w: 18.4, h: 1.8,
			fill: { color: '1E293B' },
			line: { pt: 1, color: '334155' },
			margin: 0.2
		}
	})

	// Test customized bullet and paragraph list
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: [
			{ text: 'Evolved Paragraph Bullet Matrices', options: { fontSize: 18, bold: true, color: '38BDF8' } },
			{ text: 'Level 1 item with specific margins (marL: 40) and character spacing', options: { bullet: true, indentLevel: 0, marL: 40, charSpacing: 4 } },
			{ text: 'Level 2 sub-bullet item with custom color and italics', options: { bullet: true, indentLevel: 1, color: 'F472B6', italic: true } },
			{ text: 'Level 3 deep bullet with custom line spacing (lineSpacing: 30)', options: { bullet: true, indentLevel: 2, lineSpacing: 30, color: '94A3B8' } },
			{ text: 'Numbered list item showing automatic numbering support', options: { bullet: { type: 'number', numberType: 'alphaLcParen' }, indentLevel: 0 } },
			{ text: 'Another numbered list item', options: { bullet: { type: 'number', numberType: 'alphaLcParen' }, indentLevel: 0 } }
		],
		options: {
			x: 0.8, y: 3.8, w: 18.4, h: 4.8,
			fill: { color: '090D16' },
			line: { pt: 1, color: '1E293B' },
			paraSpaceBefore: 12,
			paraSpaceAfter: 8,
			margin: 0.3
		}
	})

	// Slide 4: Office Math Equations
	console.log('[Client] Composing Slide 4: Native Office Math Equations (all 3 input formats)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		masterName: 'SLIDE_MASTER_PREMIUM',
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'NATIVE POWERPOINT OFFICE MATH',
		options: { x: 0.5, y: 0.5, w: 19, h: 0.8, fontFace: 'Outfit', fontSize: 28, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// 1. unicodeMath / plain
	await mcp.callTool('claudepptx.slide.add_equation', {
		deckId,
		slideIndex: 3,
		source: '\\sum_{i=1}^n i^2 = \\frac{n(n+1)(2n+1)}{6}',
		sourceFormat: 'unicodeMath',
		x: 1.0, y: 1.8, w: 8.5, h: 2.2,
		fontSize: 22,
		color: '38BDF8',
		align: 'center',
		options: { fill: { color: '0F172A' }, line: { pt: 1, color: '1E293B' } }
	})

	// 2. unicodeMath (continuous integral)
	await mcp.callTool('claudepptx.slide.add_equation', {
		deckId,
		slideIndex: 3,
		source: 'f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi) e^{2 \\pi i x \\xi} d\\xi',
		sourceFormat: 'unicodeMath',
		x: 10.5, y: 1.8, w: 8.5, h: 2.2,
		fontSize: 22,
		color: 'F472B6',
		align: 'center',
		options: { fill: { color: '0F172A' }, line: { pt: 1, color: '1E293B' } }
	})

	// 3. template fractional structure
	await mcp.callTool('claudepptx.slide.add_equation', {
		deckId,
		slideIndex: 3,
		source: { kind: 'fraction', numerator: 'E = mc^2', denominator: '1 - v^2/c^2' },
		sourceFormat: 'template',
		x: 1.0, y: 4.5, w: 18.0, h: 3.5,
		fontSize: 26,
		color: 'FBBF24',
		align: 'center',
		options: { fill: { color: '0F172A' }, line: { pt: 1.5, color: '334155' } }
	})

	// Validate & Save
	console.log('[Client] Validating Masterpiece 1...')
	const val = await mcp.callTool('claudepptx.deck.validate', { deckId, mode: 'strict', autoFix: true })
	console.log(`[Client] Validation: valid: ${val.valid}, issues fixed: ${val.issueCount}`)

	const fName = 'claudepptx_masterpiece_text.pptx'
	console.log(`[Client] Saving Masterpiece 1 to outputs/${fName}...`)
	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: fName })
	console.log(`[Client] Saved! File size: ${save.bytes.toLocaleString()} bytes.`)

	await mcp.callTool('claudepptx.deck.dispose', { deckId })
}

// Masterpiece 2: Shapes, Effects, and Vector Geometry
async function runShapesMasterpiece(mcp) {
	console.log('\n[Client] ==================================================')
	console.log('[Client]  Generating MASTERPIECE 2: Shapes & Vector Geometry')
	console.log('[Client] ==================================================')

	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Masterpiece 2: Shapes & Geometry',
		author: 'Antigravity 2.0',
	})

	// Slide 1: Shape Catalog & Advanced Gradient Matrix
	console.log('[Client] Composing Slide 1: Evolved Shape Catalog & Fill Matrix...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '080A10' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'SHAPE CATALOG & GRADIENT MATRIX',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	const shapeCatalog = ['ellipse', 'roundRect', 'hexagon', 'octagon', 'star8', 'star12', 'cloud', 'lightningBolt', 'smileyFace', 'cube']
	let cols = 5
	let w = 2.0, h = 1.4
	let gapX = 0.4, gapY = 0.3
	let startX = 0.6, startY = 1.3

	for (let i = 0; i < shapeCatalog.length; i++) {
		const s = shapeCatalog[i]
		const r = Math.floor(i / cols)
		const c = i % cols
		const x = startX + c * (w + gapX)
		const y = startY + r * (h + gapY)

		// Linear/Radial gradient
		const fill = i % 2 === 0 ? {
			type: 'gradient',
			gradientDirection: 'linear',
			gradientAngle: i * 30,
			gradientStops: [
				{ position: 0, color: '6366F1' },
				{ position: 100, color: 'EC4899' }
			]
		} : {
			type: 'gradient',
			gradientDirection: 'radial',
			gradientStops: [
				{ position: 0, color: '10B981', transparency: 20 },
				{ position: 100, color: '047857', transparency: 80 }
			]
		}

		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId,
			slideIndex: 0,
			shapeName: s,
			options: {
				x, y, w, h,
				fill,
				line: { pt: 2, color: 'FFFFFF' },
				rectRadius: s === 'roundRect' ? 0.3 : undefined
			},
			text: s.toUpperCase(),
			textOptions: { fontFace: 'Outfit', fontSize: 11, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
		})
	}

	// Slide 2: Borders & Depth Effects Gallery
	console.log('[Client] Composing Slide 2: Effects & Depth Gallery (glows, soft edges, shadows)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'EFFECTS, SHADOWS, GLOWS & BORDERS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// Test dashed borders
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 1,
		shapeName: 'rect',
		options: {
			x: 0.8, y: 1.4, w: 3.5, h: 2.2,
			fill: { color: '1E293B' },
			line: { pt: 3.5, color: '6366F1', style: 'dash' }
		},
		text: 'DASHED BORDER',
		textOptions: { fontFace: 'Plus Jakarta Sans', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Test Glow & Outer Shadow
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 1,
		shapeName: 'ellipse',
		options: {
			x: 4.8, y: 1.4, w: 3.5, h: 2.2,
			fill: { color: 'EC4899' },
			glow: { size: 15, color: 'F472B6', opacity: 0.8 },
			shadow: { type: 'outer', color: '000000', opacity: 0.6, blur: 20, offset: 12, angle: 90 }
		},
		text: 'GLOW & SHADOW',
		textOptions: { fontFace: 'Plus Jakarta Sans', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Test Soft Edges & 3D rotation
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 1,
		shapeName: 'triangle',
		options: {
			x: 8.8, y: 1.4, w: 3.5, h: 2.2,
			fill: { color: 'FBBF24' },
			softEdges: { size: 10 },
			rotate: 45
		},
		text: 'SOFT EDGES & ROTATION',
		textOptions: { fontFace: 'Plus Jakarta Sans', fontSize: 12, bold: true, color: '000000', align: 'center', valign: 'middle' }
	})

	// Test 3D rotated shape
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 1,
		shapeName: 'cube',
		options: {
			x: 3.0, y: 4.2, w: 7.0, h: 2.5,
			fill: {
				type: 'gradient',
				gradientDirection: 'linear',
				gradientAngle: 185,
				gradientStops: [
					{ position: 0, color: '10B981' },
					{ position: 100, color: '059669' }
				]
			},
			shadow: { type: 'outer', color: '000000', opacity: 0.8, blur: 15 }
		},
		text: 'NATIVE 3D ROTATION COMBINATIONS',
		textOptions: { fontFace: 'Outfit', fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Slide 3: Custom Freeform Vector Geometry (custGeom)
	console.log('[Client] Composing Slide 3: Custom Vector Freeforms (custGeom / polygon)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '09070F' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'FREEFORM VECTOR VECTOR SPARKS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	const complexPoints = [
		{ x: 3.5, y: 1.5, moveTo: true },
		{ x: 2.5, y: 3.2 },
		{ x: 3.0, y: 3.2 },
		{ x: 2.2, y: 5.0 },
		{ x: 4.0, y: 2.8 },
		{ x: 3.3, y: 2.8 },
		{ close: true }
	]

	await mcp.callTool('claudepptx.slide.add_freeform', {
		deckId,
		slideIndex: 2,
		x: 2.0, y: 1.5, w: 3.0, h: 4.5,
		points: complexPoints,
		fill: {
			type: 'gradient',
			gradientDirection: 'linear',
			gradientAngle: 45,
			gradientStops: [
				{ position: 0, color: 'FBBF24' },
				{ position: 100, color: 'F59E0B' }
			]
		},
		line: { pt: 2, color: 'FFFFFF' },
		glow: { size: 10, color: 'FBBF24', opacity: 0.8 }
	})

	// Vector wave
	const wavePoints = [
		{ x: 6.0, y: 2.5, moveTo: true },
		{ x: 7.5, y: 2.0, curve: { type: 'quadratic', x1: 6.7, y1: 1.8 } },
		{ x: 9.0, y: 3.0, curve: { type: 'quadratic', x1: 8.2, y1: 3.2 } },
		{ x: 10.5, y: 2.2, curve: { type: 'quadratic', x1: 9.7, y1: 1.8 } },
		{ x: 10.5, y: 4.0 },
		{ x: 6.0, y: 4.0 },
		{ close: true }
	]

	await mcp.callTool('claudepptx.slide.add_freeform', {
		deckId,
		slideIndex: 2,
		x: 6.0, y: 1.5, w: 5.0, h: 4.5,
		points: wavePoints,
		fill: {
			type: 'gradient',
			gradientDirection: 'linear',
			gradientAngle: 90,
			gradientStops: [
				{ position: 0, color: '06B6D4' },
				{ position: 100, color: '3B82F6' }
			]
		},
		line: { pt: 2.5, color: 'FFFFFF' }
	})

	// Slide 4: Direct XML Insertion via passthrough_xml
	console.log('[Client] Composing Slide 4: Direct XML Insertion via passthrough_xml...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'DIRECT OOXML PASSTHROUGH',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	const rawShapeXml = `
		<p:sp>
			<p:nvSpPr>
				<p:cNvPr id="1025" name="Custom_Passthrough_Shape" />
				<p:cNvSpPr />
				<p:nvPr />
			</p:nvSpPr>
			<p:spPr>
				<a:xfrm>
					<a:off x="3810000" y="2857500" />
					<a:ext cx="4572000" cy="1905000" />
				</a:xfrm>
				<a:prstGeom prst="roundRect">
					<a:avLst>
						<a:gd name="adj" fmla="val 25000" />
					</a:avLst>
				</a:prstGeom>
				<a:gradFill flip="none" rotWithShape="1">
					<a:gsLst>
						<a:gs pos="0">
							<a:schemeClr val="accent1" />
						</a:gs>
						<a:gs pos="100000">
							<a:schemeClr val="accent2" />
						</a:gs>
					</a:gsLst>
					<a:lin ang="5400000" scaled="1" />
				</a:gradFill>
				<a:ln w="25400">
					<a:solidFill>
						<a:srgbClr val="FFFFFF" />
					</a:solidFill>
				</a:ln>
			</p:spPr>
			<p:txBody>
				<a:bodyPr rtlCol="0" anchor="ctr" />
				<a:lstStyle />
				<a:p>
					<a:pPr algn="ctr" />
					<a:r>
						<a:rPr lang="en-US" sz="2000" bold="1">
							<a:solidFill>
								<a:srgbClr val="FFFFFF" />
							</a:solidFill>
						</a:rPr>
						<a:t>RAW PASSTHROUGH SHAPE</a:t>
					</a:r>
				</a:p>
			</p:txBody>
		</p:sp>
	`

	await mcp.callTool('claudepptx.slide.passthrough_xml', {
		deckId,
		slideIndex: 3,
		xml: rawShapeXml
	})

	// Save
	const fName = 'claudepptx_masterpiece_shapes.pptx'
	console.log(`[Client] Saving Masterpiece 2 to outputs/${fName}...`)
	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: fName })
	console.log(`[Client] Saved! File size: ${save.bytes.toLocaleString()} bytes.`)

	await mcp.callTool('claudepptx.deck.dispose', { deckId })
}

// Masterpiece 3: Highly-Styled Tables and Advanced Charts
async function runTablesChartsMasterpiece(mcp) {
	console.log('\n[Client] ==================================================')
	console.log('[Client]  Generating MASTERPIECE 3: Tables & Composite Charts')
	console.log('[Client] ==================================================')

	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Masterpiece 3: Tables & Charts',
		author: 'Antigravity 2.0',
	})

	// Slide 1: Combo Column + Line chart with Dual vertical Y-axes
	console.log('[Client] Composing Slide 1: Dual-Axis Composite combo chart...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: 'FAFBFD' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'DUAL-AXIS PERFORMANCE INDICATORS',
		options: { x: 0.8, y: 0.4, w: 11.5, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: '0F172A' }
	})

	await mcp.callTool('claudepptx.slide.add_chart', {
		deckId,
		slideIndex: 0,
		chartMulti: [
			{
				type: 'bar', // Column Chart
				data: [
					{
						name: 'AI Agent Call Rate (M)',
						labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
						values: [8.5, 14.2, 28.5, 52.4, 98.6, 210.4]
					}
				],
				options: {
					chartColors: ['6366F1'],
					barGapWidthPct: 50
				}
			},
			{
				type: 'line',
				data: [
					{
						name: 'Parity Ratio (%)',
						labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
						values: [22.4, 45.2, 78.4, 94.2, 98.6, 100.0]
					}
				],
				options: {
					chartColors: ['EC4899'],
					lineSmooth: true,
					lineDataSymbol: 'circle',
					lineDataSymbolSize: 10,
					secondaryValAxis: true // Bind to secondary axis
				}
			}
		],
		options: {
			x: 0.8, y: 1.2, w: 11.7, h: 5.2,
			showLegend: true,
			legendPos: 't',
			plotArea: {
				fill: {
					type: 'gradient',
					gradientDirection: 'linear',
					gradientAngle: 90,
					gradientStops: [
						{ position: 0, color: 'FFFFFF' },
						{ position: 100, color: 'F1F5F9' }
					]
				}
			},
			valAxes: [
				{ valAxisTitle: 'Invocations (Millions)', valAxisLabelColor: '6366F1', valAxisTitleFontSize: 11 },
				{ valAxisTitle: 'Convergence Parity Ratio %', valAxisLabelColor: 'EC4899', valAxisTitleFontSize: 11 }
			]
		}
	})

	// Slide 2: Comparative Dashboard of diverse chart types
	console.log('[Client] Composing Slide 2: Radar, Doughnut & Area Dashboard...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: 'FAFBFD' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'EXHAUSTIVE VISUAL PLOTS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: '0F172A', align: 'center' }
	})

	// Radar chart
	await mcp.callTool('claudepptx.slide.add_chart', {
		deckId,
		slideIndex: 1,
		chartType: 'radar',
		data: [
			{
				name: 'Capability Index',
				labels: ['Speed', 'Style', 'Scale', 'Secure', 'Savings', 'SmartArt'],
				values: [85, 95, 80, 99, 90, 75]
			}
		],
		options: {
			x: 0.6, y: 1.2, w: 5.3, h: 5.2,
			chartColors: ['6366F1'],
			radarStyle: 'filled',
			showLegend: false
		}
	})

	// Doughnut chart
	await mcp.callTool('claudepptx.slide.add_chart', {
		deckId,
		slideIndex: 1,
		chartType: 'doughnut',
		data: [
			{
				name: 'Resource Mix',
				labels: ['Cognitive Tokens', 'Cloud Primitives', 'Local Cache', 'VBA Hooks'],
				values: [55, 25, 15, 5]
			}
		],
		options: {
			x: 6.4, y: 1.2, w: 5.3, h: 5.2,
			chartColors: ['3B82F6', '10B981', 'FBBF24', 'EF4444'],
			holeSize: 65,
			showLegend: true,
			legendPos: 'b'
		}
	})

	// Slide 3: Complex Cell-Style Table Matrix
	console.log('[Client] Composing Slide 3: Table Cell Styling Matrix (gradients, borders, spans)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '0F172A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'TABLE CELL STYLING MATRIX',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	const borderPt1 = { pt: 1, color: '334155' }
	const borderAccent = { pt: 3.5, color: 'EC4899' }
	const gradientStops1 = [
		{ position: 0, color: '1E1B4B' },
		{ position: 100, color: '311042' }
	]

	const headerCell = {
		fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 45, gradientStops: gradientStops1 },
		color: '67E8F9',
		fontFace: 'Outfit',
		fontSize: 14,
		bold: true,
		align: 'center',
		valign: 'middle',
		border: [borderAccent, borderAccent, borderAccent, borderAccent]
	}

	const bodyCellLeft = {
		color: 'E2E8F0',
		fontFace: 'Plus Jakarta Sans',
		fontSize: 12,
		align: 'left',
		valign: 'middle',
		border: borderPt1,
		margin: 0.15
	}

	const bodyCellAccent = {
		fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90, gradientStops: [{ position: 0, color: '1E293B' }, { position: 100, color: '0F172A' }] },
		color: '38BDF8',
		fontFace: 'Plus Jakarta Sans',
		fontSize: 12,
		bold: true,
		align: 'center',
		valign: 'middle',
		border: borderPt1
	}

	await mcp.callTool('claudepptx.slide.add_table', {
		deckId,
		slideIndex: 2,
		rows: [
			// Header (Colspan 1, colspan 2)
			[
				{ text: 'Capability Layer', options: headerCell },
				{ text: 'Visual Performance Matrix', options: { ...headerCell, colspan: 3 } }
			],
			[
				{ text: 'Text3D Layout Rendering', options: bodyCellLeft },
				{ text: 'Linear Gradients', options: bodyCellLeft },
				{ text: 'EXHAUSTIVE', options: bodyCellAccent },
				{ text: '100% Repair Free', options: bodyCellLeft }
			],
			// Rowspan example
			[
				{ text: 'Fluid Morph Moves\n[Double MCP]', options: { ...bodyCellLeft, rowspan: 2 } },
				{ text: 'Identical Objects Interpolate', options: bodyCellLeft },
				{ text: 'morph: byObject', options: bodyCellAccent },
				{ text: '0.8s transition', options: bodyCellLeft }
			],
			[
				{ text: 'Text/Char Interpolation', options: bodyCellLeft },
				{ text: 'morph: byWord', options: bodyCellAccent },
				{ text: 'PowerPoint Native', options: bodyCellLeft }
			]
		],
		options: {
			x: 0.8, y: 1.4, w: 11.7, h: 4.8,
			colW: [3.2, 3.5, 2.5, 2.5],
			rowH: [0.8, 0.8, 0.8, 0.8]
		}
	})

	// Slide 4: Auto-Pagination and Cell Spanning
	console.log('[Client] Composing Slide 4: Multi-Slide Auto-Pagination table...');
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: 'FAFBFD' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'AUTO-PAGINATION & LONG DATA SETS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: '0F172A', align: 'center' }
	})

	const tableHeaderStyle = {
		fill: { color: '1E293B' },
		color: 'FFFFFF',
		fontFace: 'Outfit',
		fontSize: 12,
		bold: true,
		align: 'center',
		valign: 'middle'
	}

	const tableRows = [
		[
			{ text: 'INDEX', options: tableHeaderStyle },
			{ text: 'KEY COEFFICIENT', options: tableHeaderStyle },
			{ text: 'TEST VALUE', options: tableHeaderStyle }
		]
	]

	for (let j = 1; j <= 20; j++) {
		tableRows.push([
			{ text: `#${j}`, options: { align: 'center', color: '475569' } },
			{ text: `Coefficient Category ${String.fromCharCode(64 + (j % 5) + 1)}`, options: { color: '0F172A', fontFace: 'Plus Jakarta Sans' } },
			{ text: (Math.sin(j) * 100).toFixed(4), options: { align: 'right', color: '4F46E5', bold: true } }
		])
	}

	await mcp.callTool('claudepptx.slide.add_table', {
		deckId,
		slideIndex: 3,
		rows: tableRows,
		options: {
			x: 1.0, y: 1.3, w: 11.3, h: 5.3,
			colW: [1.5, 6.0, 3.8],
			autoPage: true,
			autoPageRepeatHeader: true,
			border: { pt: 1, color: 'E2E8F0' }
		}
	})

	// Save
	const fName = 'claudepptx_masterpiece_tables_charts.pptx'
	console.log(`[Client] Saving Masterpiece 3 to outputs/${fName}...`)
	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: fName })
	console.log(`[Client] Saved! File size: ${save.bytes.toLocaleString()} bytes.`)

	await mcp.callTool('claudepptx.deck.dispose', { deckId })
}

// Masterpiece 4: Transitions and Animation Orchestrations
async function runAnimationsMasterpiece(mcp) {
	console.log('\n[Client] ==================================================')
	console.log('[Client]  Generating MASTERPIECE 4: Animations & Transitions')
	console.log('[Client] ==================================================')

	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Masterpiece 4: Animations & Transitions',
		author: 'Antigravity 2.0',
	})

	// Slide 1 & 2: Morph Magic Move byObject
	console.log('[Client] Composing Slide 1 & 2: Morph Magic Move Node transforms...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '080B14' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'THE CONVERGING SYSTEM',
		options: { x: 0.8, y: 0.4, w: 11.5, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF' }
	})

	// Node 1: Server
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 0,
		shapeName: 'roundRect',
		options: {
			x: 1.5, y: 2.5, w: 2.5, h: 2.5,
			objectName: 'Node_Server',
			fill: { color: '6366F1' },
			line: { pt: 1.5, color: 'FFFFFF' }
		},
		text: 'SERVER\n[1.5, 2.5]',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Node 2: Gateway
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 0,
		shapeName: 'roundRect',
		options: {
			x: 8.5, y: 2.5, w: 2.5, h: 2.5,
			objectName: 'Node_Gateway',
			fill: { color: 'EC4899' },
			line: { pt: 1.5, color: 'FFFFFF' }
		},
		text: 'GATEWAY\n[8.5, 2.5]',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Duplicate slide 1 using Morph byObject transition
	console.log('[Client] Cloning Slide 1 to Slide 2 with Morph transition...')
	await mcp.callTool('claudepptx.slide.duplicate', {
		deckId,
		slideIndex: 0,
		transition: { type: 'morph', option: 'byObject' }
	})

	// Modify cloned slide Title
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'THE CONVERGING SYSTEM [MERGED STATE]',
		options: { x: 0.8, y: 0.4, w: 11.5, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF' }
	})

	// Reposition Node 1 Server (moved middle left, tilted, grew larger)
	await mcp.callTool('claudepptx.slide.update_shape', {
		deckId,
		slideIndex: 1,
		target: { objectName: 'Node_Server' },
		patch: {
			x: 2.5, y: 2.0, w: 3.5, h: 3.5,
			rotate: 15,
			fill: { color: '4338CA' }
		}
	})

	// Reposition Node 2 Gateway (moved middle right, tilted reverse, grew larger)
	await mcp.callTool('claudepptx.slide.update_shape', {
		deckId,
		slideIndex: 1,
		target: { objectName: 'Node_Gateway' },
		patch: {
			x: 6.5, y: 2.0, w: 3.5, h: 3.5,
			rotate: -15,
			fill: { color: 'BE185D' }
		}
	})

	// Slide 3: Entrance & Exit Sequence click/with/after previous
	console.log('[Client] Composing Slide 3: Entrance & Exit Timing Sequence click/with/after previous...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'COMPLEX TIMING TREE SEQUENCING',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// Animate Server Node (starts onClick)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 2,
		shapeName: 'rect',
		options: {
			x: 1.5, y: 2.5, w: 3.0, h: 3.0,
			objectName: 'Seq_Server',
			fill: { color: '3B82F6' },
			animation: { type: 'entrance', effect: 'zoom', duration: 1000, trigger: 'onClick' }
		},
		text: '1. ON CLICK\n[Server Zoom]',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Animate Gateway Node (starts withPrevious of Server)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 2,
		shapeName: 'rect',
		options: {
			x: 4.8, y: 2.5, w: 3.0, h: 3.0,
			objectName: 'Seq_Gateway',
			fill: { color: '10B981' },
			animation: { type: 'entrance', effect: 'fade', duration: 1000, trigger: 'withPrevious', delay: 300 }
		},
		text: '2. WITH SERVER\n[Gateway Fade + 300ms]',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	// Animate Database Node (starts afterPrevious of Gateway)
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 2,
		shapeName: 'rect',
		options: {
			x: 8.1, y: 2.5, w: 3.0, h: 3.0,
			objectName: 'Seq_Database',
			fill: { color: 'FBBF24' },
			animation: { type: 'entrance', effect: 'fly', direction: 'top', duration: 800, trigger: 'afterPrevious' }
		},
		text: '3. AFTER GATEWAY\n[Database Fly Top]',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: '000000', align: 'center', valign: 'middle' }
	})

	// Slide 4: TypeScript-Native Text Animation Engine (bullet byParagraph)
	console.log('[Client] Composing Slide 4: Bulleted Text Animation (byParagraph/allAtOnce/asOneObject)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '090D1A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'NATIVE TEXT PARAGRAPH BULLET SEQUENCING',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: [
			{ text: 'Bullet Point #1 - Animates first', options: { bullet: true, color: '67E8F9' } },
			{ text: 'Bullet Point #2 - Animates second', options: { bullet: true, color: 'E2E8F0' } },
			{ text: 'Bullet Point #3 - Animates third', options: { bullet: true, color: 'F472B6' } }
		],
		options: {
			x: 1.5, y: 1.8, w: 9.3, h: 4.8,
			fontSize: 20,
			fontFace: 'Plus Jakarta Sans',
			fill: { color: '111827' },
			line: { pt: 1.5, color: '1E293B' },
			margin: 0.3,
			paraSpaceBefore: 12,
			animation: {
				type: 'entrance',
				effect: 'fade',
				duration: 800,
				sequence: 'byParagraph' // Tests bullet by paragraph sequencing
			}
		}
	})

	// Slide 5: Custom Motion Paths & Simultaneous Emphasis
	console.log('[Client] Composing Slide 5: SVG Motion Paths & Simultaneous Emphasis pulse/spin...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 4,
		text: 'SVG PATHS & SIMULTANEOUS EMPHASIS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// SVG Curved loop path: M 1 4 C 3 1 6 1 8 4 C 10 7 7 7 5 5 Z
	const pathData = 'M 1 4 C 3 1 6 1 8 4 C 10 7 7 7 5 5 Z'

	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 4,
		shapeName: 'ellipse',
		options: {
			x: 1.0, y: 2.2, w: 2.0, h: 2.0,
			fill: { color: 'FBBF24' },
			line: { pt: 2, color: 'FFFFFF' },
			glow: { size: 10, color: 'FBBF24', opacity: 0.8 },
			animation: [
				{
					type: 'path',
					path: pathData,
					duration: 3000,
					trigger: 'onClick'
				},
				{
					type: 'emphasis',
					effect: 'spin',
					duration: 3000,
					trigger: 'withPrevious'
				}
			]
		},
		text: 'FLY!',
		textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: '000000', align: 'center', valign: 'middle' }
	})

	// Save
	const fName = 'claudepptx_masterpiece_animations.pptx'
	console.log(`[Client] Saving Masterpiece 4 to outputs/${fName}...`)
	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: fName })
	console.log(`[Client] Saved! File size: ${save.bytes.toLocaleString()} bytes.`)

	await mcp.callTool('claudepptx.deck.dispose', { deckId })
}

// Masterpiece 5: SmartArt, 3D Models, and Audio/Video Narration
async function runAdvancedMasterpiece(mcp) {
	console.log('\n[Client] ==================================================')
	console.log('[Client]  Generating MASTERPIECE 5: SmartArt, 3D & Narration')
	console.log('[Client] ==================================================')

	const { deckId } = await mcp.callTool('claudepptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Masterpiece 5: Advanced Media',
		author: 'Antigravity 2.0',
	})

	// Slide 1: Shape-built SmartArt Process Diagram
	console.log('[Client] Composing Slide 1: Premium SmartArt Process/Timeline Layouts...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '0F172A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 0,
		text: 'PREMIUM SMARTART PROCESS FLOW',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	await mcp.callTool('claudepptx.slide.add_smartart', {
		deckId,
		slideIndex: 0,
		mode: 'shape',
		layout: 'process',
		x: 0.8, y: 1.8, w: 11.7, h: 4.0,
		palette: ['6366F1', 'EC4899', '10B981', 'FBBF24'],
		nodes: [
			{ text: 'PHASE 1\nInitialization', title: 'Start' },
			{ text: 'PHASE 2\nCompilation', title: 'Build' },
			{ text: 'PHASE 3\nConvergence', title: 'Align' },
			{ text: 'PHASE 4\nMasterpiece', title: 'Perfect' }
		]
	})

	// Slide 2: Native 3D Model Viewports
	console.log('[Client] Composing Slide 2: Native 3D Model viewport & lights (using sandbox fallback model)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '020617' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 1,
		text: 'NATIVE 3D MODEL VIEWPORTS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// Embed a native 3D model using the project lab-pyramid asset (fallback)
	const modelAssetPath = path.resolve(__dirname, '../demos/ultimate-showcase/assets/lab-pyramid.glb')
	const posterAssetPath = path.resolve(__dirname, '../demos/ultimate-showcase/assets/model-fallback.png')

	if (fs.existsSync(modelAssetPath)) {
		await mcp.callTool('claudepptx.slide.add_model3d', {
			deckId,
			slideIndex: 1,
			options: {
				modelAsset: modelAssetPath,
				posterAsset: fs.existsSync(posterAssetPath) ? posterAssetPath : undefined,
				x: 3.66, y: 1.5, w: 5.0, h: 5.0,
				camera: { fieldOfView: 45, lookAt: { x: 0, y: 0, z: 0 } },
				ambientLight: { intensity: 75, color: 'FFFFFF' },
				rotate: { x: 25, y: -35, z: 15 }
			}
		})
	} else {
		// Fallback generated geometry shape if file is not found
		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId,
			slideIndex: 1,
			shapeName: 'cube',
			options: {
				x: 3.66, y: 1.5, w: 5.0, h: 5.0,
				fill: { color: '6366F1' },
				line: { pt: 2, color: 'FFFFFF' }
			},
			text: '3D MODEL REPRESENTATION\n(Pyramid Asset Not Found)',
			textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
		})
	}

	// Slide 3: High-Fidelity Audio & Video Embeds
	console.log('[Client] Composing Slide 3: High-Fidelity Media Embeds (local MP4)...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: 'FAFBFD' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 2,
		text: 'HIGH-FIDELITY MEDIA EMBEDS',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: '0F172A', align: 'center' }
	})

	// Add local sample video if exists
	const videoPath = path.resolve(__dirname, '../Media1.mp4')
	if (fs.existsSync(videoPath)) {
		await mcp.callTool('claudepptx.slide.add_media', {
			deckId,
			slideIndex: 2,
			options: {
				type: 'video',
				path: videoPath,
				x: 3.66, y: 1.5, w: 5.0, h: 3.5,
				autoplay: true,
				showMediaControls: true
			}
		})
	} else {
		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId,
			slideIndex: 2,
			shapeName: 'rect',
			options: {
				x: 3.66, y: 1.5, w: 5.0, h: 3.5,
				fill: { color: 'E2E8F0' },
				line: { pt: 1.5, color: '94A3B8' }
			},
			text: 'VIDEO NOT FOUND\n(Embeds are verified via zip mapping)',
			textOptions: { fontFace: 'Outfit', fontSize: 14, bold: true, color: '475569', align: 'center', valign: 'middle' }
		})
	}

	// Slide 4: Narrated Kiosk Autoplay Show Settings
	console.log('[Client] Composing Slide 4: Synthesized Live TTS Narration & Autoplay show...')
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { color: '090D1A' }
	})

	await mcp.callTool('claudepptx.slide.add_text', {
		deckId,
		slideIndex: 3,
		text: 'AUTOPLAY KIOSK NARRATION',
		options: { x: 0.5, y: 0.4, w: 12.33, h: 0.6, fontFace: 'Outfit', fontSize: 24, bold: true, color: 'FFFFFF', align: 'center' }
	})

	// Elements to animate on cues
	await mcp.callTool('claudepptx.slide.add_shape', {
		deckId,
		slideIndex: 3,
		shapeName: 'ellipse',
		options: {
			x: 2.0, y: 2.5, w: 2.5, h: 2.5,
			objectName: 'Cue_Orb',
			fill: { color: 'EC4899' },
			line: { pt: 2, color: 'FFFFFF' },
			animation: { type: 'entrance', effect: 'zoom', trigger: 'onClick' } // Triggered via cue
		},
		text: 'CUE ORB',
		textOptions: { fontFace: 'Outfit', fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }
	})

	await mcp.callTool('claudepptx.slide.add_narration', {
		deckId,
		slideIndex: 3,
		script: 'Under convergence, the double mcp client automates slides, synthesizes deep voice tracks, and overlays narration captions synced flawlessly in real-time.',
		voice: 'en_US-ljspeech-high',
		cues: [
			{ atMs: 1500, target: 'Cue_Orb', effect: 'zoom', type: 'entrance', duration: 1000 }
		],
		captions: {
			enabled: true,
			fontSize: 16,
			color: 'FFFFFF',
			fill: { color: '000000', transparency: 30 },
			x: 1.0, y: 5.8, w: 10.33, h: 0.8
		}
	})

	// Configure autoplay kiosk show settings on the deck
	console.log('[Client] Locking deck into Autoplay Kiosk mode...')
	await mcp.callTool('claudepptx.deck.autoplay', {
		deckId,
		secondsPerSlide: 7,
		loop: true,
		mode: 'kiosk',
		showNarration: true
	})

	// Save
	const fName = 'claudepptx_masterpiece_advanced.pptx'
	console.log(`[Client] Saving Masterpiece 5 to outputs/${fName}...`)
	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: fName })
	console.log(`[Client] Saved! File size: ${save.bytes.toLocaleString()} bytes.`)

	await mcp.callTool('claudepptx.deck.dispose', { deckId })
}

// --------------------------------------------------------------------------
//  Main Script Orchestration
// --------------------------------------------------------------------------
async function main() {
	const mcp = startMcpBridge()
	
	try {
		console.log('[Client] Initializing handshake with local claudepptxmcp server...')
		await mcp.initialize()
		console.log('[Client] Connected and initialized! Starting test pipeline...')

		// Ensure output directory exists
		const outDir = path.resolve(__dirname, '../outputs')
		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true })
		}

		// Run all masterpieces
		await runTextMasterpiece(mcp)
		await runShapesMasterpiece(mcp)
		await runTablesChartsMasterpiece(mcp)
		await runAnimationsMasterpiece(mcp)
		await runAdvancedMasterpiece(mcp)

		console.log('\n==========================================================')
		console.log('  ALL 5 EXHAUSTIVE MASTERPIECE DECKS GENERATED SUCCESSFULLY!')
		console.log('==========================================================')
		console.log(' Saved Files under outputs/:')
		console.log('  1. claudepptx_masterpiece_text.pptx')
		console.log('  2. claudepptx_masterpiece_shapes.pptx')
		console.log('  3. claudepptx_masterpiece_tables_charts.pptx')
		console.log('  4. claudepptx_masterpiece_animations.pptx')
		console.log('  5. claudepptx_masterpiece_advanced.pptx')
		console.log('==========================================================\n')

	} catch (err) {
		console.error('\n[Client] FATAL ERROR IN PIPELINE:', err && err.stack || err)
		process.exit(1)
	} finally {
		mcp.close()
	}
}

main()
