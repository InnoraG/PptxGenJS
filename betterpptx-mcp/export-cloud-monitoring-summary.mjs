import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { loadCloudBillingCatalogSnapshot } from './billing/cost-model.mjs'

// L2 exporter: Cloud Run service metrics for the run window, summarized to USD via the catalog.
// Billable Cloud Run metric descriptors (current names):
export const METRIC_DESCRIPTORS = Object.freeze({
	requestCount: 'run.googleapis.com/request_count',
	cpuAllocationVcpuSeconds: 'run.googleapis.com/container/cpu/allocation_time',
	memoryAllocationGibSeconds: 'run.googleapis.com/container/memory/allocation_time',
	billableInstanceSeconds: 'run.googleapis.com/container/billable_instance_time',
	startupLatencies: 'run.googleapis.com/container/startup_latencies',
	instanceCount: 'run.googleapis.com/container/instance_count',
})

function positive(value) {
	const n = Number(value)
	return Number.isFinite(n) && n >= 0 ? n : 0
}

function roundUsd(value) {
	return Number(Math.max(0, Number(value) || 0).toFixed(12))
}

// Pure, testable: given metric aggregates and a validated catalog, compute the L2 summary + USD.
export function summarizeMonitoring(aggregates = {}, { catalog, window = null, labels = null } = {}) {
	if (!catalog) throw new Error('summarizeMonitoring requires a validated catalog.')
	const mode = catalog.cloudRunBillingMode || 'request_based'
	const requestCount = positive(aggregates.requestCount)
	const cpuVcpuSeconds = positive(aggregates.cpuAllocationVcpuSeconds)
	const memoryGibSeconds = positive(aggregates.memoryAllocationGibSeconds)
	const cloudRunCpuUsd = roundUsd(cpuVcpuSeconds * catalog.cloudRun.vcpuUsdPerSecond)
	const cloudRunMemoryUsd = roundUsd(memoryGibSeconds * catalog.cloudRun.gibUsdPerSecond)
	const cloudRunRequestUsd = mode === 'instance_based'
		? 0
		: roundUsd(requestCount * catalog.cloudRun.requestUsdPerMillion / 1_000_000)
	const totalUsd = roundUsd(cloudRunCpuUsd + cloudRunMemoryUsd + cloudRunRequestUsd)
	return {
		schemaVersion: 'betterpptx.cloud-monitoring-summary.v1',
		generatedAt: new Date().toISOString(),
		cloudRunBillingMode: mode,
		catalogDigest: catalog.digest,
		window,
		labels,
		metricDescriptors: METRIC_DESCRIPTORS,
		metrics: {
			requestCount,
			cpuAllocationVcpuSeconds: cpuVcpuSeconds,
			memoryAllocationGibSeconds: memoryGibSeconds,
			billableInstanceSeconds: positive(aggregates.billableInstanceSeconds),
			instanceCountMax: positive(aggregates.instanceCountMax),
			coldStartCount: positive(aggregates.coldStartCount),
			startupLatencyMsP95: positive(aggregates.startupLatencyMsP95),
		},
		cloudRunCpuUsd,
		cloudRunMemoryUsd,
		cloudRunRequestUsd,
		totalUsd,
	}
}

function fetchMetricSum({ project, metric, service, start, end }) {
	// Best-effort live read via gcloud monitoring. Returns null if unavailable; caller can fall
	// back to --input-file. Kept defensive so a missing alpha component does not crash the run.
	const filter = `metric.type="${metric}" AND resource.labels.service_name="${service}"`
	const result = spawnSync('gcloud', [
		'monitoring', 'time-series', 'list',
		`--project=${project}`,
		`--filter=${filter}`,
		`--interval-start-time=${start}`,
		`--interval-end-time=${end}`,
		'--format=json',
	], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
	if (result.status !== 0) return null
	try {
		const series = JSON.parse(result.stdout || '[]')
		let sum = 0
		for (const ts of series) {
			for (const point of ts.points || []) {
				const v = point.value || {}
				sum += positive(v.doubleValue ?? v.int64Value ?? v.distributionValue?.count)
			}
		}
		return sum
	} catch {
		return null
	}
}

export function exportMonitoringSummary({ project, region, service, runId, start, end, catalogFile, outFile, inputFile = '' } = {}) {
	const catalog = loadCloudBillingCatalogSnapshot(catalogFile)
	let aggregates
	if (inputFile) {
		aggregates = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
	} else {
		aggregates = {
			requestCount: fetchMetricSum({ project, metric: METRIC_DESCRIPTORS.requestCount, service, start, end }),
			cpuAllocationVcpuSeconds: fetchMetricSum({ project, metric: METRIC_DESCRIPTORS.cpuAllocationVcpuSeconds, service, start, end }),
			memoryAllocationGibSeconds: fetchMetricSum({ project, metric: METRIC_DESCRIPTORS.memoryAllocationGibSeconds, service, start, end }),
			billableInstanceSeconds: fetchMetricSum({ project, metric: METRIC_DESCRIPTORS.billableInstanceSeconds, service, start, end }),
		}
		const anyFetched = Object.values(aggregates).some(v => v !== null)
		if (!anyFetched) {
			throw new Error('Cloud Monitoring read returned no data (component/permission/empty). Provide --input-file with metric aggregates to proceed.')
		}
	}
	const summary = summarizeMonitoring(aggregates, {
		catalog,
		window: { start, end },
		labels: { betterpptx_run: runId, region },
	})
	fs.mkdirSync(path.dirname(outFile), { recursive: true })
	fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
	return summary
}

function parseArgs(argv) {
	const out = { project: '', region: 'us-central1', service: '', runId: '', start: '', end: '', catalog: '', out: '', inputFile: '' }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--region') out.region = String(argv[++index] || '')
		else if (arg === '--service') out.service = String(argv[++index] || '')
		else if (arg === '--run-id') out.runId = String(argv[++index] || '')
		else if (arg === '--start') out.start = String(argv[++index] || '')
		else if (arg === '--end') out.end = String(argv[++index] || '')
		else if (arg === '--catalog') out.catalog = path.resolve(argv[++index])
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--input-file') out.inputFile = path.resolve(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.service || !args.catalog || !args.out) {
		console.log('Usage: node betterpptx-mcp/export-cloud-monitoring-summary.mjs --project P --region R --service S --run-id ID --start ISO --end ISO --catalog catalog.json --out l2/cloud-monitoring-summary.json [--input-file aggregates.json]')
		process.exit(args.help ? 0 : 2)
	}
	const summary = exportMonitoringSummary({ ...args, catalogFile: args.catalog, outFile: args.out })
	console.log(`L2 MONITORING: mode=${summary.cloudRunBillingMode} requests=${summary.metrics.requestCount} totalUsd=${summary.totalUsd} out=${args.out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
