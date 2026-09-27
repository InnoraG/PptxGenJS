// Verify production mode refuses avatar rendering when only a process-local artifact
// store is available. This prevents cross-instance cache/retention surprises.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-avatar-shared-gate-'))
const audioPath = path.join(dir, 'audio.wav')
fs.writeFileSync(audioPath, Buffer.from('RIFF0000WAVEfmt '))
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '1'
delete process.env.BETTERPPTX_GEN_ASSET_STORE
delete process.env.BETTERPPTX_LOCKED_ASSET_STORE
delete process.env.BETTERPPTX_GCS_BUCKET
const { renderAvatarNarrationVideo } = await import('./avatar/service.mjs')
let code = ''
try {
	await renderAvatarNarrationVideo({ provider: 'test-static', avatar: { source: 'default' }, audioPath, durationMs: 1000, sessionId: 'shared-store-gate' })
} catch (error) { code = error?.code || '' }
const report = {
	schemaVersion: 'betterpptx.avatar-shared-store-gate.v1',
	status: code === 'AVATAR_SHARED_STORE_REQUIRED' ? 'PASS' : 'FAIL',
	productionWithoutDistributedStoreFailsClosed: code === 'AVATAR_SHARED_STORE_REQUIRED',
	localFallbackAllowedInProduction: false,
	mutationsPerformed: false,
}
const output = path.resolve('betterpptx-mcp/outputs/avatar-shared-store-gate-report.json')
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR SHARED STORE GATE: ${report.status} failClosed=${report.productionWithoutDistributedStoreFailsClosed}`)
process.exit(report.status === 'PASS' ? 0 : 1)
