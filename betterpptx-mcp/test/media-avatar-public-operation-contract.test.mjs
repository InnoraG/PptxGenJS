import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { TOOLS } from '../tools.mjs'
import {
	MEDIA_AVATAR_PUBLIC_OPERATION_CONTRACTS,
	MEDIA_AVATAR_PUBLIC_OPERATION_NAMES,
	MEDIA_AVATAR_PUBLIC_OPERATION_OUTPUT_CONTRACTS,
	MEDIA_AVATAR_PUBLIC_OPERATION_ROW_ID_BY_NAME,
	MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS,
	MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS,
	assertMediaAvatarPublicOutput,
	mediaAvatarPublicOperationCapabilityContractForEntry,
	validateMediaAvatarPublicOperationArgs,
} from '../media-avatar-public-operation-contract.mjs'
import { assertAvatarGenerationInput } from '../avatar/consent.mjs'
import { assertAvatarJobAccess, publicAvatarJob } from '../avatar/jobs.mjs'

const rows = Object.entries(MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS)
const rowIds = new Set(rows.map(([, id]) => id))

test('the active media/avatar rows close as exact public host commands while retired image generation stays unadvertised', () => {
	assert.equal(MEDIA_AVATAR_PUBLIC_OPERATION_NAMES.length, 6)
	assert.equal(rowIds.size, 7)
	assert.equal(MEDIA_AVATAR_PUBLIC_OPERATION_NAMES.includes('betterpptx.assets.generate_image'), false)
	for (const name of MEDIA_AVATAR_PUBLIC_OPERATION_NAMES) {
		const contract = MEDIA_AVATAR_PUBLIC_OPERATION_CONTRACTS[name]
		assert.ok(contract, name)
		const entry = {
			id: MEDIA_AVATAR_PUBLIC_OPERATION_ROW_ID_BY_NAME[name], sourceKind: 'public-tool', family: 'media-images-avatar',
			label: name, implemented: true,
		}
		const projected = mediaAvatarPublicOperationCapabilityContractForEntry(entry)
		assert.equal(projected.capabilityStatus, 'host-command-not-persistent-style', name)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'host-command-not-persistent-style', name)
		assert.equal(projected.runtimeReady, true)
		assert.deepEqual(projected.overrideFields, [])
		assert.equal(projected.resetBehavior.nullBehavior, 'not-applicable')
	}
})

test('public operation schemas are closed, bounded, and private-vocabulary free', () => {
	for (const name of MEDIA_AVATAR_PUBLIC_OPERATION_NAMES) {
		const schema = MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS[name]
		assert.equal(schema.type, 'object', name)
		assert.equal(schema.additionalProperties, false, name)
		assert.doesNotMatch(JSON.stringify(schema), /filesystem|server.?path|modelPath|configPath|provider.?model|relationship\s*id|rId\d/i, name)
	}
	const image = MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.assets.generate_image']
	assert.equal(image.properties.steps.type, 'integer')
	assert.equal(image.properties.steps.minimum, 1)
	assert.equal(image.properties.steps.maximum, 8)
	assert.equal(image.properties.referenceHandles.maxItems, 4)
	const render = MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.avatar.render_job']
	assert.equal(render.properties.avatar.properties.source.const, 'uploaded')
	assert.equal(render.properties.avatar.properties.consentAffirmed.const, true)
	assert.equal(render.properties.mode.const, 'videoWithAudio')
	assert.deepEqual(render.required, ['avatar', 'idempotencyKey'])
	assert.deepEqual(render.anyOf, [{ required: ['script'] }, { required: ['audio'] }])
	assert.equal(render.properties.script.minLength, 1)
})

test('tool discovery publishes the same closed schemas and no private implementation selectors', () => {
	const byName = new Map(TOOLS.map(tool => [tool.name, tool]))
	for (const name of MEDIA_AVATAR_PUBLIC_OPERATION_NAMES) {
		const tool = byName.get(name)
		assert.ok(tool, name)
		assert.equal(tool.inputSchema.type, 'object', name)
		assert.equal(tool.inputSchema.additionalProperties, false, name)
		for (const key of Object.keys(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS[name].properties || {})) assert.ok(tool.inputSchema.properties[key], `${name}.${key}`)
		assert.doesNotMatch(JSON.stringify(tool), /flux|modal|huggingface|liveportrait|musetalk|modelPath|configPath|server path|filesystem/i, name)
	}
})

test('argument validator covers image capability bounds and avatar consent without weakening operation errors', () => {
	assert.doesNotThrow(() => validateMediaAvatarPublicOperationArgs('betterpptx.assets.generate_image', { prompt: 'a quiet blue background', steps: 1 }))
	assert.doesNotThrow(() => validateMediaAvatarPublicOperationArgs('betterpptx.assets.generate_image', { prompt: 'combine', referenceHandles: [`gen://image/${'a'.repeat(40)}`] }))
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.assets.generate_image', { prompt: 'bad', steps: 0 }), /between 1 and 8/)
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.assets.generate_image', { prompt: 'bad', referenceHandles: ['gen://image/a', 'gen://image/b', 'gen://image/c', 'gen://image/d', 'gen://image/e'] }), /at most four/)
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.assets.generate_image', { prompt: 'bad', secret: 'x' }), /not part of the public/)
	assert.doesNotThrow(() => validateMediaAvatarPublicOperationArgs('betterpptx.avatar.render_job', { avatar: { source: 'uploaded', image: { data: validPngDataUri() }, consentAffirmed: true }, script: 'Hello.' }))
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.avatar.render_job', { avatar: { source: 'uploaded', image: { data: validPngDataUri() }, consentAffirmed: true } }), /requires script or supplied audio/)
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.avatar.render_job', { script: 'Hello.' }), /avatar is required/)
	assert.throws(() => validateMediaAvatarPublicOperationArgs('betterpptx.avatar.render_job', { avatar: { source: 'default' } }), /uploaded image/)
	assert.throws(() => assertAvatarGenerationInput({ source: 'default' }), error => error?.code === 'AVATAR_SELFIE_REQUIRED')
	assert.throws(() => assertAvatarGenerationInput({ source: 'uploaded' }), error => error?.code === 'AVATAR_CONSENT_REQUIRED')
})

test('public output contracts retain opaque handles while rejecting paths and provider payloads', () => {
	for (const name of MEDIA_AVATAR_PUBLIC_OPERATION_NAMES) {
		const output = MEDIA_AVATAR_PUBLIC_OPERATION_OUTPUT_CONTRACTS[name]
		assert.ok(output.allowedKeys.length > 0, name)
		assert.ok(output.forbiddenKeys.length > 0, name)
	}
	assert.doesNotThrow(() => assertMediaAvatarPublicOutput('betterpptx.avatar.job_status', {
		jobId: 'avatar_job_public', status: 'succeeded', video: { ref: 'asset://locked/video/example', posterRef: 'asset://locked/poster/example', durationMs: 1000 },
	}))
	assert.throws(() => assertMediaAvatarPublicOutput('betterpptx.avatar.job_status', { jobId: 'x', normalizedVideoPath: 'C:\\private\\avatar.mp4' }), /private/)
	assert.throws(() => assertMediaAvatarPublicOutput('betterpptx.assets.generate_image', { handle: 'gen://image/abc', model: 'private-model' }), /private/)
	assert.throws(() => assertMediaAvatarPublicOutput('betterpptx.deck.validate_avatar_narration', { ok: false, filePath: 'C:\\private\\deck.pptx' }), /private/)
})

test('avatar job projection is session-bound and omits internal task/result payloads', () => {
	const job = {
		id: 'avatar_job_contract', status: 'succeeded', createdAt: '2026-08-29T00:00:00.000Z',
		startedAt: '2026-08-29T00:00:01.000Z', completedAt: '2026-08-29T00:00:02.000Z',
		sessionId: 'contract-session', result: { publicVideo: { ref: 'asset://locked/video/contract', posterRef: 'asset://locked/poster/contract', durationMs: 1000 }, normalizedVideoPath: 'C:\\private\\video.mp4' },
		task: () => {}, error: null,
	}
	assert.deepEqual(publicAvatarJob(job), {
		jobId: 'avatar_job_contract', status: 'succeeded', createdAt: job.createdAt, startedAt: job.startedAt,
		completedAt: job.completedAt, video: job.result.publicVideo, error: null,
	})
	assert.doesNotThrow(() => assertAvatarJobAccess(job, { sessionId: 'contract-session' }))
	assert.throws(() => assertAvatarJobAccess(job, { sessionId: 'other-session' }), error => error?.code === 'AVATAR_JOB_NOT_FOUND')
})

function validPngDataUri() {
	return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='
}
