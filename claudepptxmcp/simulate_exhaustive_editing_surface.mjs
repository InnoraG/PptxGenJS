#!/usr/bin/env node
// Categorized MCP editing surface regression.
// Exercises direct MCP editing operations that were previously unexposed:
// slide delete/reorder, layout inspection, section management, table/chart
// mutation, SmartArt node rebuild, and media playback updates.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CLI_PATH = path.resolve(__dirname, 'cli.mjs')
const OUT_DIR = path.resolve(ROOT, 'outputs')

function startMcpBridge() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1
	let rxBuf = Buffer.alloc(0)

	child.stderr.on('data', b => {
		const text = b.toString()
		if (/^\[claudepptxmcp\]/.test(text) || /server ready/.test(text)) process.stderr.write(`[MCP] ${text}`)
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
			} catch {}
		}
	})

	function rpc(method, params) {
		const id = nextId++
		const body = { jsonrpc: '2.0', id, method, params }
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject })
			child.stdin.write(JSON.stringify(body) + '\n')
		})
	}

	function notify(method, params) {
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
	}

	async function initialize() {
		await rpc('initialize', {
			protocolVersion: '2024-11-05',
			clientInfo: { name: 'editing-surface-regression', version: '1.0.0' },
			capabilities: {},
		})
		notify('notifications/initialized', {})
	}

	async function callTool(name, args = {}) {
		const result = await rpc('tools/call', { name, arguments: args })
		const text = result.content?.[0]?.text
		if (!text) throw new Error(`${name}: empty response`)
		const parsed = JSON.parse(text)
		if (!parsed.ok) throw new Error(`${name} failed: ${parsed.error?.message || JSON.stringify(parsed.error)}`)
		return parsed.data
	}

	function close() {
		child.stdin.end()
		child.kill()
	}

	return { initialize, callTool, close }
}

function writeToneWav(filePath) {
	const sampleRate = 8000
	const durationSeconds = 0.35
	const samples = Math.floor(sampleRate * durationSeconds)
	const dataBytes = samples * 2
	const buffer = Buffer.alloc(44 + dataBytes)
	buffer.write('RIFF', 0)
	buffer.writeUInt32LE(36 + dataBytes, 4)
	buffer.write('WAVE', 8)
	buffer.write('fmt ', 12)
	buffer.writeUInt32LE(16, 16)
	buffer.writeUInt16LE(1, 20)
	buffer.writeUInt16LE(1, 22)
	buffer.writeUInt32LE(sampleRate, 24)
	buffer.writeUInt32LE(sampleRate * 2, 28)
	buffer.writeUInt16LE(2, 32)
	buffer.writeUInt16LE(16, 34)
	buffer.write('data', 36)
	buffer.writeUInt32LE(dataBytes, 40)
	for (let i = 0; i < samples; i++) {
		const value = Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 12000)
		buffer.writeInt16LE(value, 44 + i * 2)
	}
	fs.writeFileSync(filePath, buffer)
}

function relSourcePart(relsPath) {
	const marker = '/_rels/'
	const idx = relsPath.indexOf(marker)
	if (idx < 0) return null
	const dir = relsPath.slice(0, idx)
	const relName = relsPath.slice(idx + marker.length).replace(/\.rels$/, '')
	return path.posix.join(dir, relName)
}

function resolveRelTarget(relsPath, target) {
	if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null
	if (target.startsWith('/')) return target.slice(1)
	const source = relSourcePart(relsPath)
	if (!source) return null
	return path.posix.normalize(path.posix.join(path.posix.dirname(source), target))
}

async function inspectSavedPackage(filePath) {
	const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath))
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const read = async name => zip.files[name] ? zip.files[name].async('string') : ''
	const slideNames = names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort()
	const chartNames = names.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).sort()
	const diagramNames = names.filter(name => /^ppt\/diagrams\/data\d+\.xml$/.test(name)).sort()
	const slideXml = (await Promise.all(slideNames.map(read))).join('\n')
	const chartXml = (await Promise.all(chartNames.map(read))).join('\n')
	const diagramXml = (await Promise.all(diagramNames.map(read))).join('\n')
	const presentationXml = await read('ppt/presentation.xml')
	const relIssues = []
	for (const relsPath of names.filter(name => name.endsWith('.rels'))) {
		const relsXml = await read(relsPath)
		for (const match of relsXml.matchAll(/\bTarget="([^"]+)"/g)) {
			const target = resolveRelTarget(relsPath, match[1])
			if (target && !zip.files[target]) relIssues.push({ relsPath, target: match[1], resolved: target })
		}
	}
	return {
		filePath,
		bytes: (await fs.promises.stat(filePath)).size,
		slideCount: slideNames.length,
		chartCount: chartNames.length,
		diagramDataCount: diagramNames.length,
		relationshipIssueCount: relIssues.length,
		relationshipIssues: relIssues.slice(0, 10),
		checks: {
			tableCellEdited: slideXml.includes('Northstar') && slideXml.includes('Channel'),
			chartDataEdited: chartXml.includes('FY26') && chartXml.includes('120'),
			smartArtEdited: diagramXml.includes('Launch') && diagramXml.includes('Scale'),
			mediaPlaybackEdited: slideXml.includes('vol="35000"') && slideXml.includes('playFrom(0.0)'),
			sectionsEdited: presentationXml.includes('Delivery') && presentationXml.includes('Evidence'),
			deletedSlideGone: !slideXml.includes('DELETE-ME-SLIDE'),
			reorderedSlidePresent: slideXml.includes('REORDER-ME-SLIDE'),
		},
	}
}

function assertCheck(report, key) {
	if (!report.checks[key]) throw new Error(`package check failed: ${key}`)
}

async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true })
	const audioPath = path.join(OUT_DIR, 'claudepptx_editing_surface_tone.wav')
	writeToneWav(audioPath)

	const mcp = startMcpBridge()
	const report = {
		startedAt: new Date().toISOString(),
		categories: {},
		files: {},
	}

	try {
		await mcp.initialize()
		const { deckId } = await mcp.callTool('claudepptx.deck.new', {
			layout: 'LAYOUT_WIDE',
			title: 'Editing Surface Baseline',
			author: 'claudepptxmcp regression',
		})
		await mcp.callTool('claudepptx.deck.define_layout', { deckId, name: 'REGRESSION_WIDE', width: 13.333, height: 7.5, activate: true })
		await mcp.callTool('claudepptx.deck.define_master', {
			deckId,
			master: { title: 'Editing Regression Master', background: { color: 'F8FAFC' }, margin: 0.35 },
		})

		await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'add', title: 'Draft' })
		await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'add', title: 'Appendix' })

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'F8FAFC' } })
		await mcp.callTool('claudepptx.slide.add_text', {
			deckId, slideIndex: 0, text: 'EDITING SURFACE',
			options: {
				x: 0.6, y: 0.5, w: 12, h: 0.7,
				objectName: 'surface_title',
				fontFace: 'Aptos Display',
				fontSize: 34,
				bold: true,
				color: '111827',
				shadow: { type: 'outer', color: '94A3B8', opacity: 0.35, blur: 3 },
			},
		})
		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId, slideIndex: 0, shapeName: 'roundRect', text: 'baseline shape',
			options: { x: 0.8, y: 1.6, w: 3, h: 1.2, fill: { color: 'DBEAFE' }, line: { color: '2563EB' }, objectName: 'surface_card' },
			textOptions: { fontSize: 15, color: '0F172A', bold: true, align: 'center', valign: 'middle' },
		})

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
		await mcp.callTool('claudepptx.slide.add_table', {
			deckId, slideIndex: 1,
			rows: [
				['Metric', 'Value'],
				['Pipeline', '72'],
			],
			options: {
				x: 0.75, y: 1.2, w: 6.2, h: 1.6,
				objectName: 'edit_table',
				fontSize: 13,
				color: '111827',
				border: { color: 'CBD5E1', pt: 0.75 },
				fill: { color: 'F8FAFC' },
			},
		})

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
		await mcp.callTool('claudepptx.slide.add_chart', {
			deckId, slideIndex: 2, chartType: 'bar',
			data: [{ name: 'Baseline', labels: ['FY23', 'FY24'], values: [40, 64] }],
			options: { x: 0.8, y: 1.1, w: 6.5, h: 3.7, objectName: 'edit_chart', showLegend: true, chartColors: ['2563EB'] },
		})

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
		await mcp.callTool('claudepptx.slide.add_smartart', {
			deckId, slideIndex: 3, mode: 'native',
			layout: 'Basic Process',
			nodes: ['Plan', 'Build', 'Ship'],
			x: 0.8, y: 1.1, w: 8.5, h: 2.4,
			objectName: 'edit_smartart',
		})

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
		await mcp.callTool('claudepptx.slide.add_media', {
			deckId, slideIndex: 4,
			options: { type: 'audio', path: audioPath, extn: 'wav', x: 0.9, y: 1.2, w: 0.35, h: 0.35, objectName: 'edit_audio', interactivePlayback: true },
		})

		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'FFF7ED' } })
		await mcp.callTool('claudepptx.slide.add_text', { deckId, slideIndex: 5, text: 'DELETE-ME-SLIDE', options: { x: 1, y: 1, w: 6, h: 1, objectName: 'delete_marker', fontSize: 28, color: '9A3412' } })
		await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: 'F0FDFA' } })
		await mcp.callTool('claudepptx.slide.add_text', { deckId, slideIndex: 6, text: 'REORDER-ME-SLIDE', options: { x: 1, y: 1, w: 6, h: 1, objectName: 'reorder_marker', fontSize: 28, color: '115E59' } })

		await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'assign_slide', index: 0, slideIndexes: [0, 1, 2, 3] })
		await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'assign_slide', index: 1, slideIndexes: [4, 5, 6] })

		const baseline = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: 'claudepptx_editing_surface_baseline.pptx' })
		report.files.baseline = baseline.filePath

		report.categories.layoutBefore = await mcp.callTool('claudepptx.deck.inspect_layouts', { deckId })
		report.categories.sectionsBefore = await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'list' })

		report.categories.shapeUpdate = await mcp.callTool('claudepptx.slide.update_shape', {
			deckId, slideIndex: 0, target: { objectName: 'surface_title' },
			patch: { fontSize: 40, color: '0F766E', shadow: null, glow: { size: 8, color: '14B8A6', opacity: 0.45 } },
		})
		report.categories.tableUpdate = await mcp.callTool('claudepptx.slide.update_table', {
			deckId, slideIndex: 1, target: { objectName: 'edit_table' },
			operations: [
				{ op: 'setCell', row: 1, col: 0, text: 'Northstar', options: { bold: true, color: '0F172A' } },
				{ op: 'setCell', row: 1, col: 1, text: '120', options: { color: '047857' } },
				{ op: 'addColumn', index: 2, cells: ['Channel', 'Enterprise'] },
				{ op: 'addRow', cells: ['Quality', '98', 'Repair-free'] },
			],
		})
		report.categories.chartUpdate = await mcp.callTool('claudepptx.slide.update_chart', {
			deckId, slideIndex: 2, target: { objectName: 'edit_chart' },
			data: [{ name: 'FY26', labels: ['Plan', 'Actual', 'Stretch'], values: [80, 120, 140] }],
			optionsPatch: { chartColors: ['0F766E'], showLegend: false, showValue: true, title: 'FY26 Progress', showTitle: true },
		})
		report.categories.smartArtUpdate = await mcp.callTool('claudepptx.slide.update_smartart', {
			deckId, slideIndex: 3, target: { objectName: 'edit_smartart' },
			nodes: ['Launch', 'Learn', 'Scale'],
			optionsPatch: { quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1', colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2' },
		})
		report.categories.mediaUpdate = await mcp.callTool('claudepptx.slide.update_media', {
			deckId, slideIndex: 4, target: { objectName: 'edit_audio' },
			interactivePlayback: false,
			volume: 0.35,
			command: 'playFrom(0.0)',
			trigger: 'afterPrevious',
			delay: 250,
			replaceExistingCommands: true,
		})
		report.categories.slideDuplicate = await mcp.callTool('claudepptx.slide.duplicate', {
			deckId, slideIndex: 0, transition: { type: 'morph', option: 'byObject', p14dur: 700 },
		})
		await mcp.callTool('claudepptx.slide.update_shape', {
			deckId, slideIndex: report.categories.slideDuplicate.newSlideIndexes[0], target: { objectName: 'surface_card' },
			patch: { x: 7.8, fill: { color: 'DCFCE7' }, line: { color: '16A34A' } },
		})
		report.categories.slideReorder = await mcp.callTool('claudepptx.slide.reorder', { deckId, fromIndex: 6, toIndex: 1 })
		report.categories.slideDelete = await mcp.callTool('claudepptx.slide.delete', { deckId, slideIndex: 6 })
		report.categories.sectionsAfter = await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'rename', index: 0, title: 'Delivery' })
		report.categories.sectionsAfter = await mcp.callTool('claudepptx.deck.sections', { deckId, action: 'rename', index: 1, title: 'Evidence' })
		report.categories.layoutAfter = await mcp.callTool('claudepptx.deck.inspect_layouts', { deckId })
		report.categories.validate = await mcp.callTool('claudepptx.deck.validate', { deckId, mode: 'strict' })

		const edited = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir: 'outputs', fileName: 'claudepptx_editing_surface_edited.pptx' })
		report.files.edited = edited.filePath
		await mcp.callTool('claudepptx.deck.dispose', { deckId })

		const reopened = await mcp.callTool('claudepptx.deck.open_existing', { pptxPath: edited.filePath, preserveTiming: true })
		report.categories.reopenEdited = reopened
		report.categories.reopenValidate = await mcp.callTool('claudepptx.deck.validate', { deckId: reopened.deckId, mode: 'strict' })
		await mcp.callTool('claudepptx.deck.dispose', { deckId: reopened.deckId })

		report.package = await inspectSavedPackage(edited.filePath)
		for (const key of ['tableCellEdited', 'chartDataEdited', 'smartArtEdited', 'mediaPlaybackEdited', 'sectionsEdited', 'deletedSlideGone', 'reorderedSlidePresent']) {
			assertCheck(report.package, key)
		}
		if (report.package.relationshipIssueCount !== 0) throw new Error(`relationship issues found: ${JSON.stringify(report.package.relationshipIssues)}`)
		if (report.categories.validate.issueCount !== 0 || report.categories.reopenValidate.issueCount !== 0) throw new Error('deck validation reported issues')

		report.finishedAt = new Date().toISOString()
		report.ok = true
		const reportPath = path.join(OUT_DIR, 'claudepptx_editing_surface_report.json')
		await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2))
		console.log(JSON.stringify({ ok: true, baseline: baseline.filePath, edited: edited.filePath, report: reportPath, package: report.package }, null, 2))
	} catch (err) {
		report.finishedAt = new Date().toISOString()
		report.ok = false
		report.error = String(err?.stack || err?.message || err)
		const reportPath = path.join(OUT_DIR, 'claudepptx_editing_surface_report.json')
		await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2))
		throw err
	} finally {
		mcp.close()
	}
}

main().catch(err => {
	console.error(err?.stack || err)
	process.exitCode = 1
})
