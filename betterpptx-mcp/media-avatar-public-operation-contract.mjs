// Exact public-operation contract for the media/images/avatar service lane.
// These commands prepare, inspect, or validate media; they are not persisted
// PowerPoint style fields and therefore intentionally use the host-command
// capability status rather than a slide-package authoring status.

const HOST_COMMAND = 'host-command-not-persistent-style'
const NOT_APPLICABLE_RESET = Object.freeze({
	component: 'not-applicable',
	full: 'not-applicable',
	nullBehavior: 'not-applicable',
})

export const MEDIA_AVATAR_PUBLIC_OPERATION_UNIT_ID = 'impl-d-d3f8834a8ff9ad64'

export const MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS = Object.freeze({
	avatarRenderJob: 'cap_22578c3f495637c96022',
	avatarJobStatus: 'cap_451630f65f52295288de',
	generateImage: 'cap_74a8c41ea999a8e1a8df',
	validateAvatarNarration: 'cap_994489606a7f3c0579ef',
	narrationVoices: 'cap_ee5633d7ddff8a40192c',
	narrationCreateVoice: 'cap_4d735509f8e46bcf0d86',
	narrationRemoveVoice: 'cap_04b19ae38356bdb32975',
})

export const MEDIA_AVATAR_PUBLIC_OPERATION_NAMES = Object.freeze([
	'betterpptx.avatar.render_job',
	'betterpptx.avatar.job_status',
	'betterpptx.deck.validate_avatar_narration',
	'betterpptx.narration.voices',
	'betterpptx.narration.create_voice',
	'betterpptx.narration.remove_voice',
])

const NAME_TO_ROW_ID = Object.freeze({
	'betterpptx.avatar.render_job': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.avatarRenderJob,
	'betterpptx.avatar.job_status': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.avatarJobStatus,
	'betterpptx.assets.generate_image': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.generateImage,
	'betterpptx.deck.validate_avatar_narration': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.validateAvatarNarration,
	'betterpptx.narration.voices': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.narrationVoices,
	'betterpptx.narration.create_voice': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.narrationCreateVoice,
	'betterpptx.narration.remove_voice': MEDIA_AVATAR_PUBLIC_OPERATION_ROW_IDS.narrationRemoveVoice,
})

export const MEDIA_AVATAR_PUBLIC_OPERATION_ROW_ID_BY_NAME = NAME_TO_ROW_ID

const opaqueHandle = {
	type: 'string',
	pattern: '^(?:gen|asset|audio|video)://[A-Za-z0-9._~:/-]{4,256}$',
}

const boundedDataUri = {
	type: 'string',
	minLength: 16,
	maxLength: 32 * 1024 * 1024,
	pattern: '^data:[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\\r\\n]+$',
}

const AVATAR_AUDIO_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: {
		data: boundedDataUri,
		ref: opaqueHandle,
		durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 120000 },
		extn: { type: 'string', enum: ['wav', 'mp3', 'm4a', 'aac'] },
	},
	anyOf: [{ required: ['data'] }, { required: ['ref'] }],
})

const AVATAR_IMAGE_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['data'],
	properties: { data: boundedDataUri },
})

export const MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS = Object.freeze({
	'betterpptx.narration.create_voice': Object.freeze({
		type: 'object', additionalProperties: false,
		required: ['name', 'sample', 'language', 'consent', 'idempotencyKey'],
		properties: {
			name: { type: 'string', minLength: 1, maxLength: 80, description: 'Display name for your private voice.' },
			sample: { type: 'string', pattern: '^asset://locked/uploaded-(?:audio|media)/[a-f0-9]{64}\\.wav$', description: 'Your owned opaque WAV handle returned by assets.upload. Provide clean PCM16 speech lasting 3–30 seconds, up to 8 MiB.' },
			language: { type: 'string', minLength: 2, maxLength: 32, pattern: '^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$', description: 'Default language or locale for the voice. The response lists all supported output languages.' },
			gender: { type: 'string', enum: ['female', 'male'], description: 'Optional self-described voice label; omit for no gender label.' },
			consent: { type: 'object', additionalProperties: false, required: ['speakerPermission', 'usageRights'], properties: { speakerPermission: { type: 'boolean', const: true }, usageRights: { type: 'boolean', const: true } }, description: 'Affirm that the speaker permits voice cloning and you hold the required recording and usage rights.' },
			idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' },
		},
	}),
	'betterpptx.narration.remove_voice': Object.freeze({
		type: 'object', additionalProperties: false, required: ['voiceId'],
		properties: { voiceId: { type: 'string', minLength: 1, maxLength: 128 }, idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' } },
	}),

	'betterpptx.narration.voices': Object.freeze({
		type: 'object',
		additionalProperties: false,
		properties: {
			includeCandidates: { type: 'boolean', default: false },
			allowUnreviewedVoices: { type: 'boolean', default: false },
			gender: { type: 'string', enum: ['female', 'male'], description: 'Optional gender filter for the catalog.' },
			language: { type: 'string', minLength: 1, maxLength: 32, description: 'Optional language or locale filter, such as en, en-US, or fr-FR.' },
			lang: { type: 'string', minLength: 1, maxLength: 32, description: 'Alias for language.' },
			query: { type: 'string', minLength: 1, maxLength: 160, description: 'Optional semantic filter across voice id, name, language, and locale.' },
		},
	}),
	'betterpptx.assets.generate_image': Object.freeze({
		type: 'object',
		required: ['prompt'],
		additionalProperties: false,
		properties: {
			prompt: { type: 'string', minLength: 1, maxLength: 16000 },
			capability: { type: 'string', enum: ['auto', 'create', 'edit', 'reference', 'multi-reference'], default: 'auto' },
			referenceHandles: { type: 'array', maxItems: 4, items: { type: 'string', pattern: '^gen://image/[a-f0-9]{8,64}$' } },
			style: { type: 'string', enum: ['photo', 'illustration', 'background', '3d', 'diagram'] },
			aspect: { type: 'string', enum: ['square', 'landscape', 'portrait'], default: 'square' },
			steps: { type: 'integer', minimum: 1, maximum: 8, default: 4 },
			semanticQuality: { type: 'boolean', default: false },
			repair: {
				type: 'object', additionalProperties: false,
				properties: {
					enabled: { type: 'boolean' },
					maxAttempts: { type: 'integer', minimum: 1, maximum: 5 },
					costCeilingUsd: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
				},
			},
			idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' },
		},
	}),
	'betterpptx.avatar.render_job': Object.freeze({
		type: 'object',
		additionalProperties: false,
		required: ['avatar', 'idempotencyKey'],
		anyOf: [{ required: ['script'] }, { required: ['audio'] }],
		properties: {
			deckId: { type: 'string', minLength: 1, maxLength: 256 },
			slideIndex: { type: 'integer', minimum: 0 },
			script: { type: 'string', minLength: 1, maxLength: 16000 },
			audio: AVATAR_AUDIO_SCHEMA,
			avatar: {
				type: 'object', additionalProperties: false, required: ['source', 'image', 'consentAffirmed'],
				properties: {
					source: { const: 'uploaded' },
					image: AVATAR_IMAGE_SCHEMA,
					consentAffirmed: { const: true },
				},
			},
			avatarQuality: { type: 'string', enum: ['fast', 'default', 'quality'], default: 'default' },
			mode: { const: 'videoWithAudio', default: 'videoWithAudio' },
			voice: { type: 'string', minLength: 1, maxLength: 256 },
			lang: { type: 'string', minLength: 1, maxLength: 32 },
			provider: { type: 'string', minLength: 1, maxLength: 128 },
			speaker: { type: 'integer', minimum: 0, maximum: 256 },
			lengthScale: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
			noiseScale: { type: 'number', minimum: 0, maximum: 10 },
			noiseWScale: { type: 'number', minimum: 0, maximum: 10 },
			durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 120000 },
			billingConfirmed: { type: 'boolean' },
			billingOverride: { type: 'boolean' },
			idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' },
		},
	}),
	'betterpptx.avatar.job_status': Object.freeze({
		type: 'object', required: ['jobId'], additionalProperties: false,
		properties: { jobId: { type: 'string', minLength: 1, maxLength: 256 } },
	}),
	'betterpptx.deck.validate_avatar_narration': Object.freeze({
		type: 'object', required: ['deckId'], additionalProperties: false,
		properties: {
			deckId: { type: 'string', minLength: 1, maxLength: 256 },
			compression: { type: 'boolean', default: true },
		},
	}),
})

const OUTPUT_CONTRACTS = Object.freeze({
	'betterpptx.narration.create_voice': Object.freeze({
		allowedKeys: Object.freeze(['voiceId', 'id', 'name', 'language', 'locale', 'languages', 'gender', 'genderSource', 'durationMs', 'scope', 'consentBasis']),
		forbiddenKeys: Object.freeze(['owner', 'ownerHash', 'sample', 'sampleBuffer', 'referenceAudio', 'path', 'filePath', 'provider', 'model', 'runtimePath']),
	}),
	'betterpptx.narration.remove_voice': Object.freeze({
		allowedKeys: Object.freeze(['removed', 'voiceId']),
		forbiddenKeys: Object.freeze(['owner', 'ownerHash', 'path', 'filePath', 'provider', 'referenceAudio']),
	}),

	'betterpptx.narration.voices': Object.freeze({
		allowedKeys: Object.freeze(['catalogAvailable', 'synthesisRuntimeAvailable', 'mode', 'productionReady', 'listedVoiceCount', 'approvedVoiceCount', 'productionApprovedVoiceCount', 'lineageReviewRequiredCount', 'filter', 'readiness', 'genderCoverage', 'failure', 'note', 'voices', 'synthesisRuntimeReason']),
		forbiddenKeys: Object.freeze(['source', 'modelPath', 'configPath', 'provider', 'runtimePath']),
	}),
	'betterpptx.assets.generate_image': Object.freeze({
		allowedKeys: Object.freeze(['ok', 'handle', 'dimensions', 'license', 'qualityGate', 'capability', 'cached', '_billing', 'usage']),
		forbiddenKeys: Object.freeze(['provider', 'model', 'modelRevision', 'gpuSeconds', 'dataUri', 'base64', 'path', 'filePath']),
	}),
	'betterpptx.avatar.render_job': Object.freeze({
		allowedKeys: Object.freeze(['jobId', 'status', 'createdAt', 'startedAt', 'completedAt', 'video', 'error']),
		forbiddenKeys: Object.freeze(['normalizedVideoPath', 'posterPath', 'provider', 'model', 'worker', 'raw']),
	}),
	'betterpptx.avatar.job_status': Object.freeze({
		allowedKeys: Object.freeze(['jobId', 'status', 'createdAt', 'startedAt', 'completedAt', 'video', 'error']),
		forbiddenKeys: Object.freeze(['normalizedVideoPath', 'posterPath', 'provider', 'model', 'worker', 'raw']),
	}),
	'betterpptx.deck.validate_avatar_narration': Object.freeze({
		allowedKeys: Object.freeze(['ok', 'valid', 'temporary', 'issues', 'warnings', 'manifest', 'deckId', 'slideCount', 'mediaInspection']),
		forbiddenKeys: Object.freeze(['filePath', 'videoPath', 'posterPath', 'provider', 'model', 'rawXml']),
	}),
})

export const MEDIA_AVATAR_PUBLIC_OPERATION_OUTPUT_CONTRACTS = OUTPUT_CONTRACTS

function contractFor(name) {
	return Object.freeze({
		id: 'mediaAvatarPublicOperation',
		unitId: MEDIA_AVATAR_PUBLIC_OPERATION_UNIT_ID,
		schemaVersion: 'betterpptx.media-avatar-public-operation.v1',
		capabilityMode: 'discrete',
		capabilityStatus: HOST_COMMAND,
		runtimeReady: true,
		componentOwnership: Object.freeze(['publicOperation']),
		overrideFields: Object.freeze([]),
		resetBehavior: NOT_APPLICABLE_RESET,
		precedence: Object.freeze(['closed public tool schema', 'consent/tenant and entitlement policy', 'opaque product result projection']),
		legalCombinations: Object.freeze([
			'approved narration voices are discoverable without exposing runtime implementation details',
			'generated images use create/reference/edit capabilities with zero to four durable reference handles',
			'avatar render jobs require a per-request uploaded selfie with explicit consent and return opaque video/poster handles',
			'job status is scoped to the creating session and projects only queued/running/succeeded/failed state',
			'avatar narration validation checks the saved package and returns portable issues, warnings, and manifest facts',
		]),
		applicability: Object.freeze([
			'preparation, discovery, asynchronous media processing, and package validation',
			'not a persisted slide-style or native authoring field',
		]),
		limitation: 'This command surface prepares or verifies media artifacts. It does not itself serialize a PowerPoint styling choice; generated artifacts remain subject to provider, consent, license, and package validation gates.',
		publicSchema: MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS[name],
		publicOutput: OUTPUT_CONTRACTS[name],
	})
}

export function mediaAvatarPublicOperationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'public-tool' || entry.family !== 'media-images-avatar') return null
	const name = String(entry.label || '')
	return NAME_TO_ROW_ID[name] ? contractFor(name) : null
}

export function mediaAvatarPublicOperationContractForName(name) {
	return NAME_TO_ROW_ID[String(name || '')] ? contractFor(String(name)) : null
}

export function validateMediaAvatarPublicOperationArgs(name, value = {}, path = String(name || 'operation')) {
	const contract = mediaAvatarPublicOperationContractForName(name)
	if (!contract) return { ...value }
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	const allowed = new Set(Object.keys(contract.publicSchema.properties || {}))
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public ${name} contract.`)
	if (name === 'betterpptx.narration.create_voice') {
		if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error(`${path}.name must contain 1–80 characters.`)
		if (typeof value.sample !== 'string' || !/^asset:\/\/locked\/uploaded-(?:audio|media)\/[a-f0-9]{64}\.wav$/.test(value.sample)) throw new Error(`${path}.sample requires your opaque uploaded WAV handle.`)
		if (typeof value.language !== 'string' || value.language.length > 32 || !/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(value.language)) throw new Error(`${path}.language requires a supported language or locale.`)
		if (value.gender !== undefined && !['male', 'female'].includes(value.gender)) throw new Error(`${path}.gender must be male or female when supplied.`)
		if (!value.consent || Array.isArray(value.consent) || value.consent.speakerPermission !== true || value.consent.usageRights !== true || Object.keys(value.consent).some(key => !['speakerPermission', 'usageRights'].includes(key))) throw new Error(`${path}.consent requires explicit speakerPermission:true and usageRights:true.`)
		if (typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,160}$/.test(value.idempotencyKey)) throw new Error(`${path}.idempotencyKey is required.`)
	}
	if (name === 'betterpptx.narration.remove_voice' && (typeof value.voiceId !== 'string' || !value.voiceId.trim() || value.voiceId.length > 128)) throw new Error(`${path}.voiceId is required.`)
	if (name === 'betterpptx.assets.generate_image') {
		if (typeof value.prompt !== 'string' || !value.prompt.trim()) throw new Error(`${path}.prompt must be a non-empty string.`)
		if (value.steps !== undefined && (!Number.isInteger(value.steps) || value.steps < 1 || value.steps > 8)) throw new Error(`${path}.steps must be an integer between 1 and 8.`)
		if (value.referenceHandles !== undefined && (!Array.isArray(value.referenceHandles) || value.referenceHandles.length > 4)) throw new Error(`${path}.referenceHandles must contain at most four durable handles.`)
	}
	if (name === 'betterpptx.avatar.render_job') {
		if (!value.avatar) throw new Error(`${path}.avatar is required and must be an uploaded image with consentAffirmed:true.`)
		if (value.avatar?.source !== 'uploaded' || value.avatar?.consentAffirmed !== true) throw new Error(`${path}.avatar requires an uploaded image with consentAffirmed:true.`)
		if (value.script !== undefined && (typeof value.script !== 'string' || !value.script.trim())) throw new Error(`${path}.script must be a non-empty string when supplied.`)
		if (value.script === undefined && value.audio === undefined) throw new Error(`${path} requires script or supplied audio.`)
	}
	if (name === 'betterpptx.avatar.job_status' && !String(value.jobId || '').trim()) throw new Error(`${path}.jobId is required.`)
	if (name === 'betterpptx.deck.validate_avatar_narration' && !String(value.deckId || '').trim()) throw new Error(`${path}.deckId is required.`)
	return { ...value }
}

export function assertMediaAvatarPublicOutput(name, value, path = String(name || 'result')) {
	const contract = mediaAvatarPublicOperationContractForName(name)
	if (!contract || value == null || typeof value !== 'object') return true
	const forbidden = new Set(contract.publicOutput?.forbiddenKeys || [])
	const walk = (node, currentPath) => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) return node.forEach((item, index) => walk(item, `${currentPath}[${index}]`))
		for (const [key, child] of Object.entries(node)) {
			if (forbidden.has(key) || /(?:Path$|path$|modelPath$|configPath$)/.test(key)) throw new Error(`${path}.${key} is private and cannot cross the public boundary.`)
			walk(child, `${currentPath}.${key}`)
		}
	}
	walk(value, path)
	return true
}

export const MEDIA_AVATAR_PUBLIC_OPERATION_CONTRACTS = Object.freeze(
	Object.fromEntries(MEDIA_AVATAR_PUBLIC_OPERATION_NAMES.map(name => [name, contractFor(name)])),
)
