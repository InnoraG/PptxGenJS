#!/usr/bin/env node
// Build a synthetic, product-owned paired identity fixture: the same Meshy
// poster is used as the native-3D identity source and as the LivePortrait input
// portrait. This does not use the consented human research asset.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(repo, 'research-demos/2026-07-18-meshy-avatar/visual-artifacts/meshy-poster/meshy-native-poster.png')
const output = path.resolve(repo, 'betterpptx-mcp/outputs/presenter-identity-continuity-fixture.png')
const metadataPath = path.resolve(repo, 'betterpptx-mcp/outputs/presenter-identity-continuity-fixture.json')
const crop = { left: 120, top: 60, width: 340, height: 480 }
if (!fs.existsSync(source)) throw new Error(`Missing synthetic Meshy poster: ${source}`)
await sharp(source).extract(crop).resize(512, 768, { fit: 'contain', background: { r: 8, g: 14, b: 26 } }).png().toFile(output)
const sourceBytes = fs.readFileSync(source)
const outputBytes = fs.readFileSync(output)
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const metadata = {
	schemaVersion: 'betterpptx.presenter-identity-continuity-fixture.v1',
	status: 'READY_FOR_PRIVATE_SYNTHETIC_CANARY',
	source: { path: source, sha256: digest(sourceBytes), bytes: sourceBytes.length, identity: 'personalizedMeshy' },
	portrait: { path: output, sha256: digest(outputBytes), bytes: outputBytes.length, width: 512, height: 768, crop },
	pairedNative3d: { glb: path.resolve(repo, 'research-demos/2026-07-18-meshy-avatar/production-hybrid-proof.glb'), identity: 'personalizedMeshy' },
	researchOnly: true,
	consentedHumanAssetUsed: false,
	customerData: false,
	training: false,
	note: 'Synthetic product-owned identity fixture. The poster and GLB are the same Meshy identity; the portrait derivative is used only for private LivePortrait/MuseTalk quality evidence.',
}
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
console.log(JSON.stringify(metadata, null, 2))
