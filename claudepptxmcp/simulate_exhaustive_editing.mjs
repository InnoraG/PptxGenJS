#!/usr/bin/env node
// =============================================================================
// UNIVERSAL AI-TO-AI EXHAUSTIVE EDITING SIMULATION
// =============================================================================
//
//  This script connects to the local `claudepptxmcp` server, generates a baseline
//  deck with specific styling and named objects, and then runs the entire editing
//  and mutation API pipeline to test decypher parser quality and editor robustness:
//
//   1. Open presentation (claudepptx.deck.open_existing)
//   2. Read shapes properties & texts (claudepptx.slide.inspect_shapes)
//   3. Bulk recolor map & invert HSL lightness (claudepptx.deck.transform_shapes)
//   4. Shape property edit & property deletion (claudepptx.slide.update_shape)
//   5. Staggered animations on pre-existing shapes (claudepptx.slide.animate_shapes)
//   6. Transitions override (claudepptx.deck.set_transitions_all)
//   7. Autoplay timings rewrite (claudepptx.deck.autoplay)
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
			clientInfo: { name: 'antigravity-masterpiece-editor-simulator', version: '2.0.0' },
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
//  Main Script Orchestration
// --------------------------------------------------------------------------
async function main() {
	const mcp = startMcpBridge()
	
	try {
		console.log('[Client] Initializing handshake with local claudepptxmcp server...')
		await mcp.initialize()
		console.log('[Client] Connected! Generating baseline presentation for editing...')

		const outDir = path.resolve(__dirname, '../outputs')
		if (!fs.existsSync(outDir)) {
			fs.mkdirSync(outDir, { recursive: true })
		}

		// Palette colors for the dark neon baseline
		const DARK_NEON = {
			bg: '0A0F24',       // Deep space dark background
			primary: '22D3EE',  // Neon Cyan
			accent: 'C026D3',   // Neon Magenta
			text: 'FFFFFF',     // Crisp White
			surface: '111827'   // Dark Slate
		}

		// 1. Build a baseline slide presentation
		const { deckId: baseDeck } = await mcp.callTool('claudepptx.deck.new', {
			layout: 'LAYOUT_WIDE',
			title: 'Masterpiece Edit Baseline',
			author: 'Antigravity 2.0',
		})

		console.log('[Client] Composing Baseline Slide 1 (Cards)...')
		await mcp.callTool('claudepptx.slide.add', {
			deckId: baseDeck,
			background: { color: DARK_NEON.bg },
			transition: { type: 'fade', speed: 'medium' }
		})

		// Neon Title with Text3D and Glow
		await mcp.callTool('claudepptx.slide.add_text', {
			deckId: baseDeck,
			slideIndex: 0,
			text: 'BASELINE NEON DECK',
			options: {
				x: 0.5, y: 1.2, w: 12.33, h: 1.2,
				fontFace: 'Outfit',
				fontSize: 54,
				bold: true,
				color: DARK_NEON.text,
				align: 'center',
				glow: { size: 12, color: DARK_NEON.primary, opacity: 0.8 },
				shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 10 }, // We will test deletion of this shadow property
				text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: DARK_NEON.primary },
				objectName: 'main_title'
			}
		})

		// Three colorful cards for bulk transformations
		const CARDS = [
			{ name: 'card_cyan',    x: 1.5,  color: DARK_NEON.primary,  label: 'Card Cyan' },
			{ name: 'card_magenta', x: 5.4,  color: DARK_NEON.accent,   label: 'Card Magenta' },
			{ name: 'card_white',   x: 9.3,  color: DARK_NEON.text,     label: 'Card White' }
		]

		for (const card of CARDS) {
			await mcp.callTool('claudepptx.slide.add_shape', {
				deckId: baseDeck,
				slideIndex: 0,
				shapeName: 'roundRect',
				options: {
					x: card.x, y: 3.5, w: 2.5, h: 2.2,
					fill: { color: card.color },
					line: { pt: 2, color: 'FFFFFF' },
					objectName: card.name
				},
				text: card.label,
				textOptions: { fontFace: 'Outfit', fontSize: 16, bold: true, color: '000000', align: 'center', valign: 'middle' }
			})
		}

		console.log('[Client] Composing Baseline Slide 2 (Composite Chart)...')
		await mcp.callTool('claudepptx.slide.add', {
			deckId: baseDeck,
			background: { color: DARK_NEON.bg }
		})

		await mcp.callTool('claudepptx.slide.add_chart', {
			deckId: baseDeck,
			slideIndex: 1,
			chartMulti: [
				{
					type: 'bar',
					data: [{ name: 'Baseline Rate', labels: ['Q1', 'Q2', 'Q3'], values: [10, 25, 45] }],
					options: { chartColors: [DARK_NEON.primary] }
				}
			],
			options: { x: 1.0, y: 1.5, w: 11.3, h: 4.8 }
		})

		console.log('[Client] Composing Baseline Slide 3 (Table)...')
		await mcp.callTool('claudepptx.slide.add', {
			deckId: baseDeck,
			background: { color: DARK_NEON.bg }
		})

		await mcp.callTool('claudepptx.slide.add_table', {
			deckId: baseDeck,
			slideIndex: 2,
			rows: [
				[
					{ text: 'Baseline Cell 1', options: { fill: { color: DARK_NEON.surface }, color: DARK_NEON.text, fontFace: 'Outfit' } },
					{ text: 'Baseline Cell 2', options: { fill: { color: DARK_NEON.primary }, color: '000000', fontFace: 'Outfit' } }
				]
			],
			options: { x: 1.0, y: 2.0, w: 11.3, h: 3.5 }
		})

		// Save baseline file
		const baseFile = 'claudepptx_edit_baseline.pptx'
		console.log(`[Client] Saving baseline presentation to outputs/${baseFile}...`)
		const baseSave = await mcp.callTool('claudepptx.deck.save', {
			deckId: baseDeck,
			outputDir: 'outputs',
			fileName: baseFile
		})
		console.log(`[Client] Baseline saved! size: ${baseSave.bytes} bytes. Disposing deck...`)
		await mcp.callTool('claudepptx.deck.dispose', { deckId: baseDeck })

		// =========================================================================
		//  EXHAUSTIVE EDITING PIPELINE STARTS HERE
		// =========================================================================
		console.log('\n[Client] ==================================================')
		console.log('[Client]  EXHAUSTIVE EDITING PIPELINE: open_existing & mutate')
		console.log('[Client] ==================================================')

		// 1. Open the saved baseline presentation
		console.log(`[Client] Opening presentation ${baseSave.filePath} for editing...`)
		const opened = await mcp.callTool('claudepptx.deck.open_existing', {
			pptxPath: baseSave.filePath,
			preserveTiming: true
		})
		const editDeck = opened.deckId
		console.log(`[Client] Presentation imported successfully! slides: ${opened.slideCount}, shapes: ${opened.shapeCount}`)

		// 2. Inspect shape structures on Slide 1
		console.log('[Client] Inspecting all shape properties and colors on Slide 1...')
		const inspect = await mcp.callTool('claudepptx.slide.inspect_shapes', {
			deckId: editDeck,
			slideIndex: 0,
			includeText: true,
			full: true
		})

		const originalColors = new Set()
		for (const shape of inspect.shapes) {
			for (const c of shape.colors || []) {
				originalColors.add(c)
			}
			console.log(` - Shape Index: ${shape.index}, Name: ${shape.objectName || 'unnamed'}, Kind: ${shape.kind}, ShapeName: ${shape.shapeName}`)
		}
		console.log(`[Client] Discovered colors in baseline slide 1: ${[...originalColors].join(', ')}`)

		// 3. Bulk Recolor Mapping & HSL Transforms (Dark Neon -> Light Mode)
		// We translate Neon Cyan (#22D3EE) to Royal Blue (#2563EB), Neon Magenta (#C026D3) to Vivid Pink (#EC4899),
		// Space Dark (#0A0F24) to Soft White (#F8FAFC), and White (#FFFFFF) to Charcoal Slate (#0F172A).
		const colorMap = {
			'22D3EE': '2563EB', // Neon Cyan -> Royal Blue
			'C026D3': 'EC4899', // Neon Magenta -> Vivid Pink
			'0A0F24': 'F8FAFC', // Space Dark -> Soft White
			'FFFFFF': '0F172A'  // White -> Charcoal Slate
		}

		console.log('[Client] Executing deck-wide bulk recolor & invertLightness HSL transform...')
		const transformResult = await mcp.callTool('claudepptx.deck.transform_shapes', {
			deckId: editDeck,
			colorMap,
			colorTransform: 'invertLightness' // Fips lightness of remaining unmapped hexes (grays/surfaces)
		})
		console.log(`[Client] Recoloring complete! shapesTouched: ${transformResult.shapesTouched}, colorsRemapped: ${transformResult.colorsRemapped}`)

		// 4. Selective Shape Modification & Property Deletion (update_shape)
		console.log("[Client] Modifying 'main_title' shape (updating text style, deleting shadow property)...")
		await mcp.callTool('claudepptx.slide.update_shape', {
			deckId: editDeck,
			slideIndex: 0,
			target: { objectName: 'main_title' },
			patch: {
				fontSize: 64,
				glow: { size: 18, color: '2563EB', opacity: 0.5 },
				shadow: null, // Deletes the outer shadow property from Slide 1 Title
				text3D: { bevel: { type: 'slope' }, extrusion: 15, extrusionColor: '2563EB' }
			}
		})

		console.log("[Client] Mutating 'card_cyan' shape bounds (shifting coordinates)...")
		await mcp.callTool('claudepptx.slide.update_shape', {
			deckId: editDeck,
			slideIndex: 0,
			target: { objectName: 'card_cyan' },
			patch: {
				x: 1.8,
				y: 4.2,
				w: 2.8,
				h: 2.4,
				fill: { color: '2563EB' }
			}
		})

		// 5. Applying timing stagger animations to pre-existing shapes
		console.log('[Client] Applying staggered entrance animations to pre-existing shapes on Slide 1...')
		const animateResult = await mcp.callTool('claudepptx.slide.animate_shapes', {
			deckId: editDeck,
			slideIndex: 0,
			animation: { type: 'entrance', effect: 'fade', duration: 800 },
			kinds: ['text', 'shape'],
			staggerMs: 250,
			preserveExistingTiming: false
		})
		console.log(`[Client] Animations applied to ${animateResult.animationsApplied} existing objects!`)

		// 6. Slide Transitions override across the deck
		console.log('[Client] Batching transitions on all slides (rotating orbit, fade, morph)...')
		await mcp.callTool('claudepptx.deck.set_transitions_all', {
			deckId: editDeck,
			variants: [
				{ type: 'orbit', speed: 'medium' },
				{ type: 'fade', speed: 'fast' },
				{ type: 'morph', option: 'byObject' }
			]
		})

		// 7. Autoplay timings rewrite on deck
		console.log('[Client] Rewriting presentation autoplay settings (kiosk mode loop, 6s per slide)...')
		await mcp.callTool('claudepptx.deck.autoplay', {
			deckId: editDeck,
			secondsPerSlide: 6,
			loop: true,
			mode: 'kiosk'
		})

		// Validate & Save
		console.log('[Client] Running final deck validation on the edited deck...')
		const valResult = await mcp.callTool('claudepptx.deck.validate', {
			deckId: editDeck,
			mode: 'normal',
			autoFix: true
		})
		console.log(`[Client] Validation results: valid: ${valResult.valid}, issues fixed: ${valResult.issueCount}`)

		const finalFile = 'claudepptx_masterpiece_edited.pptx'
		console.log(`[Client] Saving edited presentation to outputs/${finalFile}...`)
		const saveResult = await mcp.callTool('claudepptx.deck.save', {
			deckId: editDeck,
			outputDir: 'outputs',
			fileName: finalFile
		})

		console.log('\n==========================================================')
		console.log('  EXHAUSTIVE EDITING SIMULATION COMPLETED SUCCESSFULLY!')
		console.log('==========================================================')
		console.log(`File Path : ${saveResult.filePath}`)
		console.log(`File Size : ${saveResult.bytes.toLocaleString()} bytes`)
		console.log(`Slides    : ${saveResult.slideCount}`)
		console.log('==========================================================\n')

	} catch (err) {
		console.error('\n[Client] FATAL ERROR IN EDITING PIPELINE:', err && err.stack || err)
		process.exit(1)
	} finally {
		mcp.close()
	}
}

main()
