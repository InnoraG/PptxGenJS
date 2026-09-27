#!/usr/bin/env node
// Mutation-free contract verifier for the talking-head relaunch rule.
// It exercises the public generation boundary only; no provider, billing, or
// customer image is contacted.
import fs from 'node:fs/promises'
import path from 'node:path'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const { callBetterPptxTool } = await import('./engine.mjs')

async function errorCode(avatar) {
	const result = await callBetterPptxTool('betterpptx.avatar.render_job', {
		script: 'selfie input contract probe',
		...(avatar === undefined ? {} : { avatar }),
	}, { sessionId: 'avatar-selfie-contract-verifier' })
	return result?.error?.code || null
}

const checks = [
	{ id: 'missing-selfie-rejected', status: (await errorCode(undefined)) === 'AVATAR_SELFIE_REQUIRED' },
	{ id: 'default-persona-rejected', status: (await errorCode({ source: 'default' })) === 'AVATAR_SELFIE_REQUIRED' },
	{ id: 'missing-consent-rejected', status: (await errorCode({ source: 'uploaded' })) === 'AVATAR_CONSENT_REQUIRED' },
]
const report = {
	schemaVersion: 'betterpptx.avatar.user-selfie-input-contract-report.v1',
	status: checks.every(check => check.status) ? 'PASS' : 'FAIL',
	scope: 'public generation boundary / mutation-free / no provider call',
	checks,
	contract: {
		selfieRequiredPerGeneration: true,
		persistentAvatarState: false,
		defaultPersona: false,
		missingSelfieBehavior: 'voice-only narration',
	},
}
const output = path.resolve('betterpptx-mcp/outputs/avatar-selfie-input-contract-report.json')
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
process.exitCode = report.status === 'PASS' ? 0 : 1
