// Verify tenant-scoped durable avatar media artifacts using the local content-addressed
// backend. This is research evidence; production still requires the configured GCS backend.
import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-avatar-artifacts-'))
const input = path.join(root, 'input'); fs.mkdirSync(input)
const video = path.join(input, 'video.mp4'); const poster = path.join(input, 'poster.png')
fs.writeFileSync(video, Buffer.from('ftyp-mp42-mdat-avatar'))
fs.writeFileSync(poster, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
process.env.BETTERPPTX_GEN_ASSET_STORE = 'local'
process.env.BETTERPPTX_GEN_ASSET_DIR = path.join(root, 'shared')
const { avatarArtifactStoreReadiness, persistAvatarArtifact, loadAvatarArtifact } = await import('./storage/avatar-artifact-store.mjs')
const key = 'avatar-cache-key-for-lifecycle'
const first = await persistAvatarArtifact({ tenantId: 'tenant-a', cacheKey: key, normalizedVideoPath: video, posterPath: poster, durationMs: 1500, provider: 'research' })
const replay = await persistAvatarArtifact({ tenantId: 'tenant-a', cacheKey: key, normalizedVideoPath: video, posterPath: poster, durationMs: 1500, provider: 'research' })
const loaded = await loadAvatarArtifact({ tenantId: 'tenant-a', cacheKey: key, materializeDir: path.join(root, 'materialized') })
const crossTenant = await loadAvatarArtifact({ tenantId: 'tenant-b', cacheKey: key, materializeDir: path.join(root, 'other') })
const recordFile = path.join(root, 'shared', 'betterpptx-gen-assets', 'tenants', 'tenant-a', 'records', `${requireHash(key)}.json`)
const recordRaw = fs.existsSync(recordFile) ? fs.readFileSync(recordFile, 'utf8') : ''
const checks = {
	persisted: first.ok === true && first.provider === 'local',
	idempotentReplay: replay.ok === true && replay.skipped === true,
	materializedBytesVerified: Boolean(loaded?.normalizedVideoPath) && fs.readFileSync(loaded.normalizedVideoPath).equals(fs.readFileSync(video)) && fs.readFileSync(loaded.posterPath).equals(fs.readFileSync(poster)),
	tenantIsolation: crossTenant === null,
	metadataOpaque: !recordRaw.includes('tenant-a') && !recordRaw.includes('video.mp4') && !recordRaw.includes('poster.png'),
}
const passed = Object.values(checks).filter(Boolean).length
const report = { schemaVersion: 'betterpptx.avatar-artifact-lifecycle.v1', status: passed === Object.keys(checks).length ? 'PASS' : 'FAIL', checks, passed, distributedProductionBackend: avatarArtifactStoreReadiness().distributed }
const output = path.resolve('betterpptx-mcp/outputs/avatar-artifact-lifecycle-report.json')
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR ARTIFACT LIFECYCLE: ${report.status} ${passed}/${Object.keys(checks).length} local checks; distributed=${report.distributedProductionBackend}`)
process.exit(report.status === 'PASS' ? 0 : 1)

function requireHash(value) {
	return crypto.createHash('sha256').update(String(value)).digest('hex')
}
