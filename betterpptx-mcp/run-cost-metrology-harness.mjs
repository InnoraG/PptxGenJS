import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	estimateResourceRowCost,
	loadCloudBillingCatalogSnapshot,
	summarizeCostRows,
} from './billing/cost-model.mjs'
import { buildChargingMatrixFromFiles } from '../tools/build-charging-matrix.mjs'

function parseArgs(argv) {
	const out = {
		resourceRows: [],
		catalog: '',
		outDir: path.resolve('outputs', 'cost-metrology-harness', `run-${Date.now()}`),
		buildMatrix: false,
		allowSmall: false,
		syntheticFixture: false,
		serviceVcpu: 1,
		serviceMemoryGiB: 1,
		artifactRetentionDays: 1,
		fixedOverheadUsdPerOperation: 0,
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--resource-rows') out.resourceRows.push(path.resolve(argv[++index]))
		else if (arg === '--catalog') out.catalog = path.resolve(argv[++index])
		else if (arg === '--out') out.outDir = path.resolve(argv[++index])
		else if (arg === '--build-matrix') out.buildMatrix = true
		else if (arg === '--allow-small') out.allowSmall = true
		else if (arg === '--synthetic-fixture') out.syntheticFixture = true
		else if (arg === '--service-vcpu') out.serviceVcpu = Number(argv[++index])
		else if (arg === '--service-memory-gib') out.serviceMemoryGiB = Number(argv[++index])
		else if (arg === '--artifact-retention-days') out.artifactRetentionDays = Number(argv[++index])
		else if (arg === '--fixed-overhead-usd-per-operation') out.fixedOverheadUsdPerOperation = Number(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function readNdjson(file) {
	const text = fs.readFileSync(file, 'utf8').trim()
	return text ? text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : []
}

function writeNdjson(file, rows) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')
}

function mbFromBytes(bytes) {
	return Math.max(0, Number(bytes) || 0) / 1048576
}

function safeNumber(value) {
	const number = Number(value)
	return Number.isFinite(number) && number >= 0 ? number : 0
}

function featuresForResourceRow(row = {}) {
	if (row.features && row.model) return { model: String(row.model), features: row.features }
	const tool = String(row.toolName || '').toLowerCase()
	if (tool.includes('deck.save') || tool.includes('generate_from_spec') || tool.includes('replace_from_spec')) {
		return {
			model: 'checkpoint',
			features: {
				deckSaveBase: 1,
				perFinalSlide: safeNumber(row.slideCount || row.metrics?.slideCount),
				perFinalObject: safeNumber(row.finalObjectCount || row.metrics?.finalObjectCount),
				perRichObject: safeNumber(row.richObjectCount || row.metrics?.richObjectCount),
				perOutputMb: mbFromBytes(row.artifactBytes || row.outputBytes),
				// SERVER/SERVICE cost of free-content processing in the edit loop: dedicated
				// columns so the fit attributes imageOps raster CPU + stock resolve download/decode
				// here instead of biasing perRichObject/perOutputMb. Content itself costs nothing.
				perImageOp: safeNumber(row.imageOpsOps),
				perResolvedAssetMb: mbFromBytes(row.stockResolveBytes),
			},
		}
	}
	// External 3D model import (Sketchfab / assets.generate_model3d) — a real archive
	// download+extract egress op. Must precede the generic model3d match below (which the
	// tool name would otherwise absorb) so it prices as its own family, not model placement.
	if (tool.includes('generate_model3d') || tool.includes('sketchfab.import')) {
		return { model: 'heavy', features: { model3dImportBase: 1, model3dImportPerMb: mbFromBytes(row.model3dImportBytes || row.artifactBytes) } }
	}
	if (tool.includes('open_uploaded') || tool.includes('open_existing') || tool.includes('load_template')) {
		return { model: 'heavy', features: { openUploadedBase: 1, openUploadedPerMb: mbFromBytes(row.artifactBytes || row.uploadBytes) } }
	}
	if (tool.includes('narration')) {
		return { model: 'heavy', features: { narrationBase: 1, narrationPer1000Chars: safeNumber(row.ttsCharacters) / 1000 } }
	}
	if (tool.includes('avatar')) {
		return { model: 'heavy', features: { avatarBase: 1, avatarPerSecond: safeNumber(row.avatarVideoSeconds) } }
	}
	if (tool.includes('model3d')) {
		return { model: 'heavy', features: { model3dBase: 1, model3dPerMb: mbFromBytes(row.artifactBytes || row.modelBytes) } }
	}
	if (tool.includes('media')) {
		return { model: 'heavy', features: { mediaImportBase: 1, mediaImportPerMb: mbFromBytes(row.artifactBytes || row.mediaBytes) } }
	}
	if (tool.includes('transform')) {
		return { model: 'heavy', features: { batchTransformBase: 1, batchTransformPerObject: safeNumber(row.objectCount || row.targetCount) } }
	}
	return { model: 'heavy', features: { mediaImportBase: 1 } }
}

function syntheticRows() {
	const checkpoint = ['deckSaveBase', 'perFinalSlide', 'perFinalObject', 'perRichObject', 'perOutputMb', 'perImageOp', 'perResolvedAssetMb']
	const heavy = [
		'openUploadedBase',
		'openUploadedPerMb',
		'narrationBase',
		'narrationPer1000Chars',
		'avatarBase',
		'avatarPerSecond',
		'model3dBase',
		'model3dPerMb',
		'model3dImportBase',
		'model3dImportPerMb',
		'mediaImportBase',
		'mediaImportPerMb',
		'batchTransformBase',
		'batchTransformPerObject',
	]
	const rows = []
	let index = 0
	for (const feature of checkpoint) {
		index += 1
		rows.push({
			schemaVersion: 'betterpptx.metrology.v1',
			metricType: 'betterpptx.resource_measurement',
			toolName: 'betterpptx.deck.save',
			workload: 'W3-op-grid',
			callId: `synthetic-checkpoint-${feature}`,
			wallMs: 100 + index * 25,
			cpuUsec: 10000 + index * 1000,
			meterSource: 'synthetic',
			includesChildProcesses: true,
			model: 'checkpoint',
			features: { [feature]: 1 },
		})
	}
	for (const feature of heavy) {
		index += 1
		rows.push({
			schemaVersion: 'betterpptx.metrology.v1',
			metricType: 'betterpptx.resource_measurement',
			toolName: feature.toLowerCase().includes('avatar') ? 'betterpptx.avatar.render_job' : 'betterpptx.slide.add_media',
			workload: 'W3-op-grid',
			callId: `synthetic-heavy-${feature}`,
			wallMs: 100 + index * 25,
			cpuUsec: 10000 + index * 1000,
			meterSource: 'synthetic',
			includesChildProcesses: true,
			model: 'heavy',
			features: { [feature]: 1 },
		})
	}
	return rows
}

export function runCostMetrologyHarness(options = {}) {
	const outDir = path.resolve(options.outDir)
	fs.mkdirSync(outDir, { recursive: true })
	const catalog = loadCloudBillingCatalogSnapshot(options.catalog)
	const resourceRows = [
		...(options.syntheticFixture ? syntheticRows() : []),
		...options.resourceRows.flatMap(readNdjson),
	].filter(row => row.metricType === 'betterpptx.resource_measurement' || row.wallMs !== undefined)
	if (!resourceRows.length) throw new Error('No resource rows were provided.')
	const costRows = resourceRows.map(row => ({
		...estimateResourceRowCost(row, {
			catalog,
			serviceShape: {
				vcpu: options.serviceVcpu,
				memoryGiB: options.serviceMemoryGiB,
			},
			artifactRetentionDays: options.artifactRetentionDays,
			fixedOverheadUsdPerOperation: options.fixedOverheadUsdPerOperation,
		}),
		originalToolName: row.toolName || null,
		originalWorkload: row.workload || null,
	}))
	const featureRows = resourceRows.map((row, index) => {
		const { model, features } = featuresForResourceRow(row)
		return {
			model,
			scenario: row.scenario || row.callId || `${model}-${index}`,
			toolName: row.toolName || 'unknown',
			workload: row.workload || '',
			measuredUsd: costRows[index].measuredUsd,
			amortizableInstanceUsd: costRows[index].amortizableInstanceUsd,
			requestLinearUsd: costRows[index].requestLinearUsd,
			cloudRunBillingMode: costRows[index].cloudRunBillingMode,
			catalogDigest: costRows[index].catalogDigest,
			features,
		}
	})
	const costRowsFile = path.join(outDir, 'cost-rows.ndjson')
	const featureRowsFile = path.join(outDir, 'matrix-feature-rows.ndjson')
	writeNdjson(costRowsFile, costRows)
	writeNdjson(featureRowsFile, featureRows)
	let matrix = null
	let reportFile = null
	if (options.buildMatrix) {
		reportFile = path.join(outDir, 'cost-metrology-report.md')
		matrix = buildChargingMatrixFromFiles({
			inputs: [featureRowsFile],
			output: path.join(outDir, 'charging-matrix-v1.json'),
			report: reportFile,
			allowSmall: options.allowSmall,
		})
	}
	const summary = {
		ok: true,
		generatedAt: new Date().toISOString(),
		outDir,
		resourceRows: resourceRows.length,
		costRowsFile,
		featureRowsFile,
		reportFile,
		matrixVersion: matrix?.version || null,
		costSummary: summarizeCostRows(costRows),
	}
	fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
	return summary
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || (!args.resourceRows.length && !args.syntheticFixture) || !args.catalog) {
		console.log('Usage: node betterpptx-mcp/run-cost-metrology-harness.mjs --catalog <catalog.json> [--resource-rows rows.ndjson] [--synthetic-fixture] [--build-matrix] [--allow-small] [--out outDir]')
		process.exit(args.help ? 0 : 2)
	}
	const summary = runCostMetrologyHarness(args)
	console.log(`COST METROLOGY HARNESS: rows=${summary.resourceRows} matrix=${summary.matrixVersion || 'not-built'} out=${summary.outDir}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
