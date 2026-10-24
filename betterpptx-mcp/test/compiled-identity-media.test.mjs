import assert from 'node:assert/strict'
import test from 'node:test'

for (const name of Object.keys(process.env)) {
	if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
}
Object.assign(process.env, {
	BETTERPPTX_ENV: 'production',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_AUTH: 'oauth',
	BETTERPPTX_BILLING_PROVIDER: 'none',
	BETTERPPTX_BILLING_MODEL: 'free_publication',
	BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
})

const { advertisedPublicTools } = await import('../public-manifest.mjs')
const { canonicalToolName } = await import('../tools.mjs')
const { isPublicToolAllowed } = await import('../blackbox.mjs')
const { presenterPersonaResolutionRequirement } = await import('../ir/spec-compiler.mjs')

const FOLDED_MEDIA_TOOLS = [
	'betterpptx.avatar.render_job',
	'betterpptx.avatar.job_status',
	'betterpptx.avatar.attach_result',
	'betterpptx.assets.generate_model3d',
	'betterpptx.assets.generate_rigged3d',
]

test('narration timing is listed under its new name and the old name still resolves', () => {
	const names = new Set(advertisedPublicTools().map(tool => tool.name))
	assert.ok(names.has('betterpptx.narration.get_voice_timing'))
	assert.ok(!names.has('betterpptx.narration.synthesize'))
	assert.equal(canonicalToolName('betterpptx.narration.synthesize'), 'betterpptx.narration.get_voice_timing')
	assert.equal(canonicalToolName('betterpptx_narration_synthesize'), 'betterpptx.narration.get_voice_timing')
	assert.ok(isPublicToolAllowed('betterpptx.narration.synthesize'))
})

test('talking-head, persona and stock 3D media are compiled by the spec, not listed as tools', () => {
	const tools = advertisedPublicTools()
	const names = new Set(tools.map(tool => tool.name))
	for (const name of FOLDED_MEDIA_TOOLS) {
		assert.ok(!names.has(name), `${name} must not be listed`)
		assert.ok(!isPublicToolAllowed(name), `${name} must not be callable publicly`)
	}
	const spec = tools.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	assert.match(spec.description, /avatarNarration/)
	assert.match(spec.description, /presenter\.persona/)
	assert.doesNotMatch(spec.description, /avatar\.render_job|avatar\.attach_result/)
})

test('a custom persona needs phase resolve until its model is locked', () => {
	assert.equal(presenterPersonaResolutionRequirement({ presenter: { identity: 'joe' } }), null)
	assert.equal(presenterPersonaResolutionRequirement({ presenter: { persona: { fromImages: [] } } }), null)
	assert.deepEqual(
		presenterPersonaResolutionRequirement({ presenter: { persona: { fromImages: ['asset://image/front', 'asset://image/side'], experimentalConfirmed: true } } }),
		{ kind: 'presenterPersona', field: 'presenter.persona', imageCount: 2 },
	)
	assert.equal(presenterPersonaResolutionRequirement({
		presenter: { model: 'gen://rigged3d/abc', persona: { fromImages: ['asset://image/front', 'asset://image/side'] } },
	}), null)
})
