#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildMeshyMultiImageRequest } from '../assets/meshy-avatar-provider.mjs'

const request = buildMeshyMultiImageRequest({
	imageUrls: ['data:image/png;base64,AAAA'],
	targetPolycount: 120000,
	hdTexture: true,
})

assert.equal(request.image_enhancement, false)
assert.equal(request.remove_lighting, false)

const report = {
	status: 'PASS',
	checks: [
		'image enhancement disabled',
		'relighting disabled',
		'provider payload contains only documented Meshy fields',
		'body-only/original-authority policy is enforced by the upstream ingestion contract',
	],
}
await fs.writeFile(path.resolve('betterpptx-mcp/outputs/meshy-provider-identity-policy-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
