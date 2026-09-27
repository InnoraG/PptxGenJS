#!/usr/bin/env node
// Local proof that avatar.render_job can enter the same durable operation
// queue used by the production gateway. This uses test-static media only; it
// does not contact a model worker or create a public artifact.
import fs from 'node:fs'
import path from 'node:path'

const outputDir = path.resolve('betterpptx-mcp/outputs/avatar-durable-dispatch-verify', `run-${Date.now()}-${process.pid}`)
const fixtureImage = path.resolve('betterpptx-mcp/avatar/assets/default-presenter.png')
fs.mkdirSync(outputDir, { recursive: true })
process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = path.join(outputDir, 'operation-store.json')
process.env.BETTERPPTX_OPERATION_DISPATCHER = 'inline'
process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
// This is a maintainer-only local verifier because it invokes the primitive
// avatar tool directly; public clients remain spec-first/black-box.
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_AVATAR_PROVIDER = 'test-static'
process.env.BETTERPPTX_AVATAR_MAX_SECONDS = '10'
const firstExisting = candidates => candidates.find(candidate => candidate && fs.existsSync(candidate))
const ffmpeg = firstExisting([
	process.env.BETTERPPTX_FFMPEG_PATH,
	path.join(process.env.TEMP || '', 'betterpptx-media-tools', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
	path.resolve('betterpptx-mcp', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
	path.resolve('node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
])
const ffprobe = firstExisting([
	process.env.BETTERPPTX_FFPROBE_PATH,
	path.join(process.env.TEMP || '', 'betterpptx-media-tools', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
	path.resolve('betterpptx-mcp', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
	path.resolve('node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
])
if (ffmpeg) process.env.BETTERPPTX_FFMPEG_PATH = ffmpeg
if (ffprobe) process.env.BETTERPPTX_FFPROBE_PATH = ffprobe

const { callBetterPptxTool, runDurableOperationById } = await import('./engine.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function toneWavDataUri(seconds = 0.8) {
	const sampleRate = 8000
	const samples = Math.max(1, Math.floor(sampleRate * seconds))
	const data = Buffer.alloc(samples * 2)
	for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 4000), i * 2)
	const header = Buffer.alloc(44)
	header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
	header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
	header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
	header.write('data', 36); header.writeUInt32LE(data.length, 40)
	return `data:audio/wav;base64,${Buffer.concat([header, data]).toString('base64')}`
}

const context = { sessionId: 'avatar-durable-dispatch-session', installHash: 'avatar-durable-dispatch-install' }
const args = {
	renderMode: 'job',
	avatarProvider: 'test-static',
	avatar: { source: 'uploaded', consentAffirmed: true, image: { path: fixtureImage } },
	audio: { data: toneWavDataUri(), durationMs: 800, extn: 'wav' },
	idempotencyKey: 'avatar-durable-dispatch-1',
}
const pending = await callBetterPptxTool('betterpptx.avatar.render_job', args, context)
expect(pending.ok === false && pending.error?.code === 'OPERATION_PENDING', 'Avatar render should be queued before worker execution.', { pending })
const operationId = pending.error.details?.operationId
expect(/^op_[0-9a-f]{32}$/i.test(operationId), 'Queued avatar response should expose an opaque operation id.', { pending })

const before = await callBetterPptxTool('betterpptx.operation.status', { operationId }, context)
expect(before.ok === true && before.data?.state === 'queued', 'Queued avatar operation should be visible before worker delivery.', { before })
const worker = await runDurableOperationById(operationId, { leaseOwner: 'avatar-durable-dispatch-worker' })
expect(worker.state === 'succeeded' && worker.result?.jobId && worker.result?.status === 'succeeded', 'Durable worker should wait for the avatar job to succeed before acknowledging.', { worker })

let jobStatus = null
for (let i = 0; i < 80; i++) {
	jobStatus = await callBetterPptxTool('betterpptx.avatar.job_status', { jobId: worker.result.jobId }, context)
	if (jobStatus.data?.status === 'succeeded' || jobStatus.data?.status === 'failed') break
	await new Promise(resolve => setTimeout(resolve, 250))
}
expect(jobStatus.ok === true && jobStatus.data?.status === 'succeeded', 'Durable avatar job should reach a terminal success state.', { jobStatus })

const replay = await callBetterPptxTool('betterpptx.avatar.render_job', args, context)
expect(replay.ok === true && replay.data?.jobId === worker.result.jobId && replay.data?.status === 'succeeded' && replay.data?.durableOperation?.replay === true, 'Same idempotency key should replay the completed durable avatar operation.', { replay, worker })

const report = {
	schemaVersion: 'betterpptx.avatar-durable-dispatch-report.v1',
	status: 'PASS',
	queued: true,
	workerCompleted: true,
	jobSucceeded: true,
	replay: true,
	provider: 'test-static',
}
const reportPath = path.resolve('betterpptx-mcp/outputs/avatar-durable-dispatch-report.json')
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
