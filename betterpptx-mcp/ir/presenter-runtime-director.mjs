// Provider-neutral lowering audit for the PresenterIdentity representation plan.
// The contract chooses a lane; this module proves that the compiled operation plan
// contains the PowerPoint-native operation needed to execute that choice. It never
// exposes worker/model topology and deliberately fails closed for an active lane
// that has no executable operation.

const ACTIVE_MODES = new Set(['3d', 'talkingHead', 'hybrid'])

function slideKey(value, index = 0) {
	return String(value || `slide-${Number(index) + 1}`)
}

function operationSlideKey(operation = {}) {
	return slideKey(operation.slideId, operation.slideIndex)
}

function operationOptions(operation = {}) {
	return operation.args?.options && typeof operation.args.options === 'object'
		? operation.args.options
		: operation.args && typeof operation.args === 'object' ? operation.args : {}
}

function hasTalkingHeadOperation(operations = [], key) {
	return operations.some(operation => operationSlideKey(operation) === key
		&& ((operation.tool === 'betterpptx.slide.add_avatar_narration'
			&& (operation.args?.avatarAsset || operation.args?.avatar || operation.args?.audio || operation.args?.script))
			|| (operation.tool === 'betterpptx.slide.update_media'
				&& operation.args?.avatarFrameContract === 'ellipse-centered-cover-v1')))
}

function hasNative3dOperation(operations = [], key) {
	return operations.some(operation => {
		if (operationSlideKey(operation) !== key || operation.tool !== 'betterpptx.slide.add_model3d') return false
		const options = operationOptions(operation)
		return Boolean(options.modelAsset || options.glbFile || options.model || options.query || options.intent || options.useCase || options.aiContext)
	})
}

function hasNarrationOperation(operations = [], key) {
	return operations.some(operation => operationSlideKey(operation) === key
		&& (operation.tool === 'betterpptx.slide.add_narration' || operation.tool === 'betterpptx.slide.add_avatar_narration'))
}

export function lowerPresenterRuntime({ contract = {}, operations = [] } = {}) {
	const execution = contract.executionPlan && typeof contract.executionPlan === 'object'
		? contract.executionPlan
		: { schemaVersion: 'betterpptx.presenter-execution-plan.v1', motionPolicy: 'full', entries: [] }
	const entries = Array.isArray(execution.entries) ? execution.entries : []
	const issues = []
	const lowered = entries.map(entry => {
		const key = slideKey(entry.slideId, entry.slide)
		const talkingHead = hasTalkingHeadOperation(operations, key)
		const native3d = hasNative3dOperation(operations, key)
		const narration = hasNarrationOperation(operations, key)
		const required = ACTIVE_MODES.has(entry.mode) ? entry.mode : null
		const operationRefs = operations
			.map((operation, operationIndex) => ({ operation, operationIndex }))
			.filter(({ operation }) => operationSlideKey(operation) === key)
			.filter(({ operation }) => {
				if (entry.mode === 'talkingHead') return operation.tool === 'betterpptx.slide.add_avatar_narration' || operation.tool === 'betterpptx.slide.update_media'
				if (entry.mode === '3d') return operation.tool === 'betterpptx.slide.add_model3d'
				if (entry.mode === 'hybrid') return operation.tool === 'betterpptx.slide.add_avatar_narration' || operation.tool === 'betterpptx.slide.add_model3d'
				return operation.tool === 'betterpptx.slide.add_narration' || operation.tool === 'betterpptx.slide.add_avatar_narration'
			})
			.map(({ operationIndex, operation }) => ({ operationIndex, tool: operation.tool, objectName: operation.objectName || null }))
		const missing = []
		if (entry.mode === 'talkingHead' && !talkingHead) missing.push('talkingHead')
		if (entry.mode === '3d' && !native3d) missing.push('3d')
		if (entry.mode === 'hybrid' && !talkingHead) missing.push('talkingHead')
		if (entry.mode === 'hybrid' && !native3d) missing.push('3d')
		if (entry.active && !required && entry.mode !== 'absent') missing.push(entry.mode || 'unknown')
		if (entry.active && entry.mode === 'audioOnly' && !narration) missing.push('audioOnly')
		if (missing.length) {
			issues.push({
				code: 'PRESENTER_RUNTIME_LANE_NOT_LOWERED',
				severity: 'error',
				slide: entry.slide,
				slideId: key,
				mode: entry.mode,
				missing,
				message: `Presenter runtime lane ${entry.mode} has no matching executable operation on ${key}.`,
			})
		}
		return {
			slide: entry.slide,
			slideId: key,
			mode: entry.mode,
			active: entry.active === true,
			status: missing.length ? 'blocked' : entry.active ? 'lowered' : 'fallback-planned',
			missing,
			operationRefs,
			timingAuthority: entry.timingAuthority || 'media',
			expectedDurationMs: entry.expectedDurationMs ?? null,
		}
	})
	return {
		schemaVersion: 'betterpptx.presenter-runtime-director.v1',
		status: issues.length ? 'blocked' : 'ready',
		motionPolicy: execution.motionPolicy || 'full',
		entries: lowered,
		issues,
		ready: issues.length === 0,
	}
}
