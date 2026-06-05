import assert from 'node:assert/strict'

const saved = new Map()
for (const key of [
	'BETTERPPTX_EDIT_STATE_MODE',
	'BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED',
	'BETTERPPTX_MCP_MAX_INSTANCES',
]) saved.set(key, process.env[key])

function restore() {
	for (const [key, value] of saved) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

function gate(snapshot) {
	return snapshot.gates.find(item => item.id === 'cross-instance-state')
}

try {
	const { buildMissionControlSnapshot } = await import('./mission-control.mjs')

	process.env.BETTERPPTX_EDIT_STATE_MODE = 'process-local'
	process.env.BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED = '1'
	process.env.BETTERPPTX_MCP_MAX_INSTANCES = '1'
	const single = gate(buildMissionControlSnapshot())
	assert.equal(single.status, 'ok')
	assert.match(single.detail, /max instances is pinned to 1/i)

	process.env.BETTERPPTX_MCP_MAX_INSTANCES = '2'
	const unsafeScale = gate(buildMissionControlSnapshot())
	assert.equal(unsafeScale.status, 'warn')
	assert.match(unsafeScale.detail, /not safe/i)

	process.env.BETTERPPTX_EDIT_STATE_MODE = 'shared'
	process.env.BETTERPPTX_MCP_MAX_INSTANCES = '10'
	const shared = gate(buildMissionControlSnapshot())
	assert.equal(shared.status, 'ok')
	assert.match(shared.detail, /configured as shared/i)

	console.log('SINGLE-INSTANCE EDIT-STATE GUARD: PASS')
} finally {
	restore()
}
