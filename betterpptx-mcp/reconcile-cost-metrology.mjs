import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { reconcileCostLayers, summarizeCostRows } from './billing/cost-model.mjs'

function parseArgs(argv) {
	const out = {
		costRows: '',
		monitoring: '',
		billingExport: '',
		out: path.resolve('outputs', 'cost-metrology-reconciliation', `reconcile-${Date.now()}.json`),
		overheadOut: '',
		overheadFile: '',
		overheadUsd: undefined,
		billingMode: '',
		toleranceRatio: 0.10,
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--cost-rows') out.costRows = path.resolve(argv[++index])
		else if (arg === '--monitoring') out.monitoring = path.resolve(argv[++index])
		else if (arg === '--billing-export') out.billingExport = path.resolve(argv[++index])
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--overhead-out') out.overheadOut = path.resolve(argv[++index])
		else if (arg === '--overhead') out.overheadFile = path.resolve(argv[++index])
		else if (arg === '--overhead-usd') out.overheadUsd = Number(argv[++index])
		else if (arg === '--billing-mode') out.billingMode = String(argv[++index] || '')
		else if (arg === '--tolerance-ratio') out.toleranceRatio = Number(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'))
	} catch {
		throw new Error(`Could not read JSON file: ${file}`)
	}
}

function readNdjson(file) {
	const text = fs.readFileSync(file, 'utf8').trim()
	return text ? text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : []
}

function positive(value) {
	const number = Number(value)
	return Number.isFinite(number) && number >= 0 ? number : 0
}

function roundUsd(value) {
	return Number(Math.max(0, Number(value) || 0).toFixed(12))
}

function l2UsdFromMonitoring(input = {}) {
	if (input.totalUsd !== undefined) return positive(input.totalUsd)
	const cpuUsd = positive(input.cloudRunCpuUsd)
	const memoryUsd = positive(input.cloudRunMemoryUsd)
	const requestUsd = positive(input.cloudRunRequestUsd)
	const storageUsd = positive(input.gcsStorageUsd)
	const firestoreUsd = positive(input.firestoreUsd)
	const egressUsd = positive(input.egressUsd)
	return cpuUsd + memoryUsd + requestUsd + storageUsd + firestoreUsd + egressUsd
}

function l3UsdFromBillingExport(input = {}) {
	// Pricing uses gross cost, not net invoice after credits (Gross Cost Rule).
	if (input.grossCostUsd !== undefined) return positive(input.grossCostUsd)
	if (input.totalUsd !== undefined) return positive(input.totalUsd)
	if (Array.isArray(input.rows)) {
		return input.rows.reduce((sum, row) => sum + positive(row.grossCostUsd ?? row.costUsd ?? row.cost ?? row.amountUsd), 0)
	}
	return Object.values(input).reduce((sum, value) => sum + positive(value), 0)
}

// Sum the B3 cost-class split across cost rows. Used to surface how much measured cost is
// amortizable instance-time vs request-linear, independent of any overhead allocation.
function costClassSplit(costRows = []) {
	let amortizable = 0
	let requestLinear = 0
	for (const row of costRows) {
		amortizable += positive(row.amortizableInstanceUsd)
		requestLinear += positive(row.requestLinearUsd)
	}
	return { amortizableInstanceCostUsd: roundUsd(amortizable), requestLinearCostUsd: roundUsd(requestLinear) }
}

// Resolve the measured instance overhead to add to L1 before comparing to L3.
// Priority: explicit --overhead-usd > overhead file totals > 0 (raw L1, legacy behavior).
function resolveOverhead({ overheadUsd, overheadFile, operationCount } = {}) {
	if (Number.isFinite(overheadUsd) && overheadUsd >= 0) {
		return { totalUsd: roundUsd(overheadUsd), source: 'explicit', terms: {} }
	}
	if (overheadFile && fs.existsSync(overheadFile)) {
		const terms = readJson(overheadFile)
		const fields = ['startupOverheadUsd', 'warmIdleOverheadUsd', 'interRequestOverheadUsd', 'fixedDailyOverheadUsd']
		let total = fields.reduce((sum, field) => sum + positive(terms[field]), 0)
		if (positive(terms.amortizedOverheadUsdPerOperation) > 0 && operationCount > 0) {
			total += positive(terms.amortizedOverheadUsdPerOperation) * operationCount
		}
		return { totalUsd: roundUsd(total), source: 'overhead-file', terms }
	}
	return { totalUsd: 0, source: 'none', terms: {} }
}

export function reconcileCostMetrology({
	costRowsFile,
	monitoringFile,
	billingExportFile,
	outFile,
	overheadOutFile = '',
	overheadFile = '',
	overheadUsd = undefined,
	billingMode = '',
	toleranceRatio = 0.10,
} = {}) {
	const costRows = readNdjson(costRowsFile)
	const l1 = summarizeCostRows(costRows)
	const split = costClassSplit(costRows)
	const monitoring = readJson(monitoringFile)
	const billingExport = readJson(billingExportFile)
	const l2Usd = l2UsdFromMonitoring(monitoring)
	const l3Usd = l3UsdFromBillingExport(billingExport)
	const resolvedMode = String(billingMode || billingExport.cloudRunBillingMode || monitoring.cloudRunBillingMode
		|| costRows[0]?.cloudRunBillingMode || 'request_based')
	const overhead = resolveOverhead({ overheadUsd, overheadFile, operationCount: l1.count })
	const reconciliation = reconcileCostLayers({
		l1Usd: l1.totalUsd,
		l2Usd,
		l3Usd,
		overheadUsd: overhead.totalUsd,
		toleranceRatio,
	})

	// overhead-allocation.json: independent overhead evidence + residual, with the B3 split.
	// If overhead was not separately measured, the residual (L3 - rawL1) is surfaced rather
	// than hidden, and the allocation policy is marked so the matrix step cannot silently adopt it.
	const overheadAllocation = {
		schemaVersion: 'betterpptx.overhead-allocation.v1',
		generatedAt: new Date().toISOString(),
		cloudRunBillingMode: resolvedMode,
		startupOverheadUsd: roundUsd(overhead.terms.startupOverheadUsd),
		warmIdleOverheadUsd: roundUsd(overhead.terms.warmIdleOverheadUsd),
		interRequestOverheadUsd: roundUsd(overhead.terms.interRequestOverheadUsd),
		fixedDailyOverheadUsd: roundUsd(overhead.terms.fixedDailyOverheadUsd),
		amortizedOverheadUsdPerOperation: overhead.terms.amortizedOverheadUsdPerOperation !== undefined
			? roundUsd(overhead.terms.amortizedOverheadUsdPerOperation)
			: (l1.count > 0 ? roundUsd(overhead.totalUsd / l1.count) : 0),
		amortizableInstanceCostUsd: split.amortizableInstanceCostUsd,
		nonAmortizableRequestCostUsd: split.requestLinearCostUsd,
		requestLinearCostUsd: split.requestLinearCostUsd,
		appliedOverheadUsd: overhead.totalUsd,
		unexplainedResidualUsd: reconciliation.unexplainedResidualUsd,
		allocationPolicy: overhead.source === 'none'
			? 'residual-unattributed'
			: `measured-${overhead.source}`,
	}

	const report = {
		ok: reconciliation.ok,
		generatedAt: new Date().toISOString(),
		cloudRunBillingMode: resolvedMode,
		inputs: {
			costRowsFile,
			monitoringFile,
			billingExportFile,
			overheadFile: overheadFile || null,
		},
		l1: {
			source: 'betterpptx resource-meter cost rows (per-operation active processing)',
			...l1,
			...split,
		},
		overhead: overheadAllocation,
		l2: {
			source: 'Cloud Monitoring service metrics summary',
			totalUsd: l2Usd,
			monitoringWindow: monitoring.window || null,
			labels: monitoring.labels || null,
		},
		l3: {
			source: 'BigQuery detailed billing export summary (gross)',
			totalUsd: l3Usd,
			grossCostUsd: billingExport.grossCostUsd ?? null,
			creditsUsd: billingExport.creditsUsd ?? null,
			netCostUsd: billingExport.netCostUsd ?? null,
			billingExportWindow: billingExport.window || null,
			labels: billingExport.labels || null,
		},
		reconciliation,
	}
	if (outFile) {
		fs.mkdirSync(path.dirname(outFile), { recursive: true })
		fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
	}
	if (overheadOutFile) {
		fs.mkdirSync(path.dirname(overheadOutFile), { recursive: true })
		fs.writeFileSync(overheadOutFile, `${JSON.stringify(overheadAllocation, null, 2)}\n`, 'utf8')
	}
	return report
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.costRows || !args.monitoring || !args.billingExport) {
		console.log('Usage: node betterpptx-mcp/reconcile-cost-metrology.mjs --cost-rows cost-rows.ndjson --monitoring monitoring-summary.json --billing-export billing-export-summary.json [--billing-mode request_based|instance_based] [--overhead overhead.json | --overhead-usd N] [--overhead-out overhead-allocation.json] [--out report.json]')
		process.exit(args.help ? 0 : 2)
	}
	const report = reconcileCostMetrology({
		costRowsFile: args.costRows,
		monitoringFile: args.monitoring,
		billingExportFile: args.billingExport,
		outFile: args.out,
		overheadOutFile: args.overheadOut,
		overheadFile: args.overheadFile,
		overheadUsd: args.overheadUsd,
		billingMode: args.billingMode,
		toleranceRatio: args.toleranceRatio,
	})
	console.log(`COST METROLOGY RECONCILE: ${report.ok ? 'PASS' : 'FAIL'} mode=${report.cloudRunBillingMode} l1=${report.reconciliation.l1Usd} (raw=${report.reconciliation.l1RawUsd}+oh=${report.reconciliation.overheadUsd}) l2=${report.reconciliation.l2Usd} l3=${report.reconciliation.l3Usd}`)
	process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
