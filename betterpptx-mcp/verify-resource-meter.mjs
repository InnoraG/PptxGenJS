import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const outputDir = path.resolve('outputs', 'metrology-verify', `run-${Date.now()}-${process.pid}`)
const outputFile = path.join(outputDir, 'resource-meter.ndjson')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_METROLOGY = '1'
process.env.BETTERPPTX_METROLOGY_SINK = 'file'
process.env.BETTERPPTX_METROLOGY_FILE = outputFile

const {
	finishResourceMeasure,
	recordResourceUnitEvent,
	recordResourceUsage,
	resourceMeterCapabilities,
	startResourceMeasure,
} = await import('./billing/resource-meter.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const measure = startResourceMeasure({
	toolName: 'betterpptx.verify.resource_meter',
	callId: 'verify-resource-meter',
	workload: 'cpu-and-child-process',
})

function burnCpuUntilMeasured({ maxMs = 1500 } = {}) {
	const before = process.cpuUsage()
	const deadline = Date.now() + maxMs
	let accumulator = 0
	let iterations = 0
	let cpu = { user: 0, system: 0 }
	do {
		for (let index = 0; index < 250_000; index += 1) accumulator += Math.sqrt(index + iterations)
		iterations += 1
		cpu = process.cpuUsage(before)
	} while ((cpu.user + cpu.system) <= 0 && Date.now() < deadline)
	return { accumulator, iterations, cpuUsec: cpu.user + cpu.system }
}

const cpuBurn = burnCpuUntilMeasured()

const child = spawnSync(process.execPath, [
	'-e',
	'let x=0; for(let i=0;i<3000000;i+=1)x+=Math.sqrt(i); process.stdout.write(String(x));',
], { encoding: 'utf8' })
const childSpawnSandboxBlocked = child.error?.code === 'EPERM'
expect(child.status === 0 || childSpawnSandboxBlocked, 'Resource-meter child workload failed.', {
	status: child.status,
	stderr: child.stderr,
	error: child.error?.code,
})
recordResourceUsage({
	gcsClassAOps: 1,
	firestoreReads: 3,
	firestoreWrites: 2,
	firestoreTransactions: 1,
	firestoreTxRetries: 1,
	externalCalls: 2,
	ttsCharacters: 120,
	ttsAudioSeconds: 8.5,
})

const row = finishResourceMeasure(measure, {
	ok: true,
	usage: {
		artifactBytes: 4096,
		egressBytes: 2048,
		firestoreReads: 2,
		firestoreWrites: 1,
	},
})

expect(row?.wallMs > 0, 'Resource meter did not record wall time.', { row })
expect(cpuBurn.cpuUsec > 0, 'Local CPU probe did not observe CPU usage; verifier workload is invalid.', { cpuBurn })
expect(row?.cpuUsec > 0, 'Resource meter did not record CPU usage.', { row, cpuBurn })
expect(row?.memoryCurrentBytesEnd > 0, 'Resource meter did not record memory.', { row })
expect(row?.artifactBytes === 4096 && row?.egressBytes === 2048, 'Explicit usage counters were not preserved.', { row })
expect(row?.firestoreReads === 5 && row?.firestoreWrites === 3, 'Firestore counters were not accumulated.', { row })
expect(row?.firestoreTransactions === 1 && row?.firestoreTxRetries === 1, 'Firestore transaction counters were not preserved.', { row })
expect(row?.gcsClassAOps === 1 && row?.externalCalls === 2, 'External service counters were not preserved.', { row })
expect(row?.ttsCharacters === 120 && row?.ttsAudioSeconds === 8.5, 'TTS counters were not preserved.', { row })
expect(typeof row?.coldStart === 'boolean' && row?.startupLatencyMs >= 0, 'Startup markers were not emitted.', { row })

recordResourceUnitEvent({
	eventType: 'artifact_download',
	usage: { egressBytes: 8192 },
	metadata: { delivery: 'verify' },
})

const lines = fs.readFileSync(outputFile, 'utf8').trim().split(/\r?\n/)
expect(lines.length === 2, 'Resource meter should emit one tool row and one unit event.', { lines: lines.length })
const persisted = JSON.parse(lines[0])
expect(persisted.callId === 'verify-resource-meter', 'Persisted resource row lost its call identifier.', { persisted })
const unitEvent = JSON.parse(lines[1])
expect(unitEvent.eventType === 'artifact_download' && unitEvent.egressBytes === 8192, 'Standalone unit event was not preserved.', { unitEvent })

const capabilities = resourceMeterCapabilities()
expect(capabilities.includesChildProcesses === (capabilities.meterSource === 'cgroup_v2'), 'Child-process capability flag is inconsistent.', { capabilities })

console.log(`RESOURCE METER: PASS source=${row.meterSource} childProcesses=${row.includesChildProcesses} childSpawn=${childSpawnSandboxBlocked ? 'sandbox-blocked' : 'ok'} cpuUsec=${row.cpuUsec} cpuProbeUsec=${cpuBurn.cpuUsec} wallMs=${row.wallMs} checksum=${Math.round(cpuBurn.accumulator)}`)
