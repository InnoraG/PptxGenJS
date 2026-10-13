// Shared MCP result contract. Tool-specific payload schemas stay closed inside
// the standard BetterPPTX { ok, data, error } envelope.
export const ERROR_FINDING_SCHEMA = {
	type: 'object',
	description: 'Typed semantic correction finding; change the named semantic input and rerun the governed dry-run.',
	properties: {
		code: { type: 'string' },
		severity: { type: 'string', enum: ['info', 'warning', 'error'] },
		message: { type: 'string' },
		reason: { type: 'string' },
		fix: { type: 'string' },
		evidence: { type: 'object' },
		suggestions: { type: 'array' },
		next: { type: ['object', 'string', 'null'] },
	},
	additionalProperties: true,
}

export const ERROR_SCHEMA = {
	type: 'object',
	description: 'Public error info and recovery contract (present when ok=false).',
	properties: {
		code: { type: 'string', description: 'Stable public error code.' },
		message: { type: 'string', description: 'Human-readable error message.' },
		recoverable: { type: 'boolean', description: 'Whether a corrected request or later retry can recover without discarding valid work.' },
		next_actions: { type: 'array', description: 'Concrete public actions for the AI or user.', items: { type: 'object', properties: { type: { type: 'string' }, tool: { type: 'string' }, description: { type: 'string' } }, additionalProperties: true } },
		retry_safe: { type: 'boolean', description: 'Whether retrying the same arguments is safe.' },
		retryable: { type: 'boolean', description: 'Alias of retry_safe for connector-file upload errors.' },
		requestId: { type: 'string', description: 'Request identifier for this failed call.' },
		acceptedInputFields: { type: 'array', items: { type: 'string' }, description: 'Upload fields the runtime accepts, typically file, data, and url.' },
		artifact_state: { type: 'string', description: 'What happened to the deck/artifact after the failed call.' },
		details: { type: 'object', description: 'Bounded evidence and typed findings for semantic correction.', properties: { errors: { type: 'array', items: ERROR_FINDING_SCHEMA }, warnings: { type: 'array', items: ERROR_FINDING_SCHEMA }, issues: { type: 'array', items: ERROR_FINDING_SCHEMA } }, additionalProperties: true },
	},
	required: ['code', 'message'],
	additionalProperties: true,
}

export const RESULT_OUTPUT_SCHEMA = {
	type: 'object',
	description: 'Standard BetterPPTX result envelope.',
	properties: {
		ok: { type: 'boolean', description: 'True on success; false if the call failed.' },
		data: { type: 'object', description: 'Tool-specific result payload (present when ok=true).', additionalProperties: true },
		error: ERROR_SCHEMA,
	},
	required: ['ok'],
	additionalProperties: true,
}

export function createResultOutputSchema(dataSchema) {
	if (!dataSchema || typeof dataSchema !== 'object' || Array.isArray(dataSchema)) {
		throw new TypeError('A tool result data schema must be an object schema.')
	}
	return {
		...RESULT_OUTPUT_SCHEMA,
		properties: { ...RESULT_OUTPUT_SCHEMA.properties, data: dataSchema },
	}
}
