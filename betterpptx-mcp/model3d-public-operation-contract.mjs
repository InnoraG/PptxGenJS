// Public-operation contract for model selection/import and personalized 3-D
// generation. These commands prepare an opaque asset handle; they do not
// themselves serialize a PowerPoint model/style carrier.

const HOST_COMMAND = 'host-command-not-persistent-style'
const NOT_APPLICABLE_RESET = Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' })

export const MODEL3D_PUBLIC_OPERATION_UNIT_ID = 'impl-d-4a61e2621d57fdd4'
export const MODEL3D_PUBLIC_OPERATION_ROW_IDS = Object.freeze({
	generateModel3d: 'cap_51950b662c17afdbc3e4',
	generateRigged3d: 'cap_5ca058cf8e14122233ca',
})
export const MODEL3D_PUBLIC_OPERATION_NAMES = Object.freeze([
	'betterpptx.assets.generate_model3d',
	'betterpptx.assets.generate_rigged3d',
])

const NAME_TO_ROW_ID = Object.freeze({
	'betterpptx.assets.generate_model3d': MODEL3D_PUBLIC_OPERATION_ROW_IDS.generateModel3d,
	'betterpptx.assets.generate_rigged3d': MODEL3D_PUBLIC_OPERATION_ROW_IDS.generateRigged3d,
})

const MODEL_KINDS = Object.freeze(['auto', 'aircraft', 'ship', 'building', 'person', 'team', 'robot', 'device', 'package', 'product', 'scene', 'vehicle', 'trophy', 'arrow', 'interface', 'user', 'toggle', 'bell', 'cloud', 'prism', 'shield', 'stack', 'beacon', 'spark'])
const POSES = Object.freeze(['front', 'threeQuarterRight', 'threeQuarterLeft', 'sideRight', 'sideLeft', 'topDown', 'heroTilt', 'dramatic'])
const TEXT = { type: 'string', minLength: 1, maxLength: 16000 }
const HANDLE = { type: 'string', minLength: 4, maxLength: 256, pattern: '^(?:gen|asset|model3d|sketchfab)://[^\\s]+$' }
const ARRAY_HANDLES = { type: 'array', minItems: 1, maxItems: 4, items: HANDLE }

export const MODEL3D_PUBLIC_OPERATION_SCHEMAS = Object.freeze({
	'betterpptx.assets.generate_model3d': Object.freeze({
		type: 'object', additionalProperties: false,
		properties: {
			context: TEXT, prompt: TEXT, narration: TEXT, query: TEXT,
			kind: { type: 'string', enum: [...MODEL_KINDS], default: 'auto' },
			generationMode: { type: 'string', enum: ['auto', 'catalog', 'import'], default: 'auto' },
			assetSource: { type: 'string', enum: ['auto', 'catalog', 'sketchfab'], default: 'auto' },
			qualityTarget: { type: 'string', enum: ['slides', 'premium', 'hero'], default: 'slides' },
			sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard' },
			maxModelSizeMb: { type: 'number', exclusiveMinimum: 0, maximum: 4096 },
			searchLimit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
			licensePolicy: { type: 'string', enum: ['commercial-safe', 'cc0-only'], default: 'commercial-safe' },
			allowedLicenseSlugs: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 64 } },
			optimizeFor: { type: 'string', enum: ['slides', 'navigation', 'quality'], default: 'slides' },
			pose: { type: 'string', enum: [...POSES], default: 'heroTilt' },
			nativeOnly: { type: 'boolean', default: true },
			w: { type: 'number', exclusiveMinimum: 0, maximum: 56 }, h: { type: 'number', exclusiveMinimum: 0, maximum: 56 },
			idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' },
		},
	}),
	'betterpptx.assets.generate_rigged3d': Object.freeze({
		type: 'object', additionalProperties: false, required: ['experimentalConfirmed', 'idempotencyKey'],
		properties: {
			experimentalConfirmed: { type: 'boolean', const: true, description: 'Required explicit opt-in for the experimental rigged-persona route. This does not grant production approval or bypass identity, asset, cost, or release gates.' },
			prompt: TEXT, imageHandle: HANDLE, imageUrl: { type: 'string', pattern: '^https://[^\\s]+$', maxLength: 4096 }, imageBase64: { type: 'string', minLength: 16, maxLength: 32 * 1024 * 1024 },
			imageHandles: ARRAY_HANDLES, imageUrls: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', pattern: '^https://[^\\s]+$', maxLength: 4096 } }, imageBase64s: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', minLength: 16, maxLength: 32 * 1024 * 1024 } },
			heightMeters: { type: 'number', minimum: 0.1, maximum: 10, default: 1.7 }, targetPolycount: { type: 'integer', minimum: 100, maximum: 300000, default: 220000 }, hdTexture: { type: 'boolean', default: true },
			style: { type: 'string', enum: ['photo', 'illustration', '3d'] }, rig: { type: 'boolean', default: true }, perform: { type: 'boolean', default: false }, quality: { type: 'string', enum: ['ppt-lite', 'standard'], default: 'ppt-lite' }, force: { type: 'boolean' }, production: { type: 'boolean', default: false },
			idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$' },
		},
	}),
})

const COMMON_OUTPUT_KEYS = ['ok', 'status', 'code', 'handle', 'kind', 'context', 'selection', 'modelAsset', 'source', 'sourceImage', 'sourceImages', 'bytes', 'geometry', 'generation', 'optimization', 'suggestedModel3DOptions', 'suggestedAnimation', 'suggestedAnimations', 'reuseVariants', 'rationale', 'attempts', 'message', 'recommendation', 'compatibilityNotice', 'pipeline', 'rigged', 'performed', 'glbBytes', 'meshResolution', 'clipMap', 'tier', 'confidence', 'imageCount', 'license', 'cached', 'usage', '_billing', 'schemaVersion', 'warnings', 'artifacts', 'next']
const FORBIDDEN_OUTPUT_KEYS = ['path', 'filePath', 'modelPath', 'glbFile', 'posterAsset', 'provider', 'modelRevision', 'runtimePath', 'raw']
const OUTPUT_CONTRACTS = Object.freeze(Object.fromEntries(MODEL3D_PUBLIC_OPERATION_NAMES.map(name => [name, Object.freeze({ allowedKeys: Object.freeze([...COMMON_OUTPUT_KEYS]), forbiddenKeys: Object.freeze([...FORBIDDEN_OUTPUT_KEYS]) })])))

function contractFor(name) {
	return Object.freeze({
		id: 'model3dPublicOperation', unitId: MODEL3D_PUBLIC_OPERATION_UNIT_ID, schemaVersion: 'betterpptx.model3d-public-operation.v1',
		capabilityMode: 'discrete', capabilityStatus: HOST_COMMAND, runtimeReady: true,
		componentOwnership: Object.freeze(['publicOperation']), overrideFields: Object.freeze([]), resetBehavior: NOT_APPLICABLE_RESET,
		precedence: Object.freeze(['closed public tool schema', 'license/entitlement and source policy', 'opaque asset-handle result']),
		legalCombinations: Object.freeze([
			'catalog selection precedes optional rights-filtered import fallback',
			'personalized generation accepts one prompt/source lane or one ordered one-to-four image lane',
			'generated handles are later consumed by semantic model3d or presenter authoring',
		]),
		applicability: Object.freeze(['model discovery, compatible import, and personalized native-3D preparation', 'not a persisted slide style or model3d carrier']),
		limitation: 'This command prepares an opaque asset handle. Native model placement, camera, lighting, and package serialization remain owned by the semantic model3d authoring contract.',
		publicSchema: MODEL3D_PUBLIC_OPERATION_SCHEMAS[name], publicOutput: OUTPUT_CONTRACTS[name],
	})
}

export const MODEL3D_PUBLIC_OPERATION_CONTRACTS = Object.freeze(Object.fromEntries(MODEL3D_PUBLIC_OPERATION_NAMES.map(name => [name, contractFor(name)])))

export function model3dPublicOperationCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'public-tool' || entry.family !== 'model3d') return null
	const name = String(entry.label || '')
	return NAME_TO_ROW_ID[name] ? contractFor(name) : null
}

export function model3dPublicOperationContractForName(name) {
	return NAME_TO_ROW_ID[String(name || '')] ? contractFor(String(name)) : null
}

export function validateModel3dPublicOperationArgs(name, value = {}, path = String(name || 'operation')) {
	const contract = model3dPublicOperationContractForName(name)
	if (!contract) return { ...value }
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	const allowed = new Set(Object.keys(contract.publicSchema.properties || {}))
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public ${name} contract.`)
	if (name === 'betterpptx.assets.generate_model3d') {
		if (value.searchLimit !== undefined && (!Number.isInteger(value.searchLimit) || value.searchLimit < 1 || value.searchLimit > 50)) throw new Error(`${path}.searchLimit must be an integer between 1 and 50.`)
		if (value.maxModelSizeMb !== undefined && (!(value.maxModelSizeMb > 0) || value.maxModelSizeMb > 4096)) throw new Error(`${path}.maxModelSizeMb must be greater than 0 and no more than 4096.`)
		if (value.w !== undefined && (!(value.w > 0) || value.w > 56) || value.h !== undefined && (!(value.h > 0) || value.h > 56)) throw new Error(`${path}.w/h must be positive and no more than 56.`)
	} else {
		if (value.experimentalConfirmed !== true) throw new Error(`${path}.experimentalConfirmed must be true for the experimental rigged-persona route.`)
		const lanes = ['imageHandle', 'imageUrl', 'imageBase64', 'imageHandles', 'imageUrls', 'imageBase64s'].filter(key => value[key] !== undefined)
		if (lanes.length > 1) throw new Error(`${path} must use exactly one image source lane.`)
		for (const key of ['imageHandles', 'imageUrls', 'imageBase64s']) if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length < 1 || value[key].length > 4)) throw new Error(`${path}.${key} must contain between one and four ordered images.`)
		if (!lanes.length && !(typeof value.prompt === 'string' && value.prompt.trim())) throw new Error(`${path} requires prompt or one image source lane.`)
		if (value.targetPolycount !== undefined && (!Number.isInteger(value.targetPolycount) || value.targetPolycount < 100 || value.targetPolycount > 300000)) throw new Error(`${path}.targetPolycount must be an integer between 100 and 300000.`)
	}
	return { ...value }
}

export function assertModel3dPublicOutput(name, value, path = String(name || 'result')) {
	const contract = model3dPublicOperationContractForName(name)
	if (!contract || value == null || typeof value !== 'object') return true
	const allowed = new Set(contract.publicOutput.allowedKeys)
	const forbidden = new Set(contract.publicOutput.forbiddenKeys)
	const walk = (node, currentPath, top = false) => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) return node.forEach((item, index) => walk(item, `${currentPath}[${index}]`))
		for (const [key, child] of Object.entries(node)) {
			if (forbidden.has(key) || /(?:Path$|path$|modelPath$|configPath$)/.test(key)) throw new Error(`${path}.${key} is private and cannot cross the public boundary.`)
			if (top && !allowed.has(key)) throw new Error(`${path}.${key} is not part of the public ${name} output contract.`)
			walk(child, `${currentPath}.${key}`)
		}
	}
	walk(value, path, true)
	return true
}
