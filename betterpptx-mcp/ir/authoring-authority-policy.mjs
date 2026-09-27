// Public authoring-authority contracts. Creative authority is separate from
// compilation and verification authority: an AI-sovereign spec may disable the
// Director's planning/defaulting role without bypassing schema, package, safety,
// accessibility, or current-version validation gates.

export const DIRECTOR_WORKFLOW = 'authoring-excellence-director-v1'
export const AI_SOVEREIGN_WORKFLOW = 'ai-sovereign-v1'

export const DIRECTOR_MODE_ASSISTED = 'assisted'
export const DIRECTOR_MODE_OFF = 'off'
export const COMPLETE_VERIFICATION_MODE = 'complete'

export function isAiSovereignWorkflow(contract = {}) {
	return String(contract?.workflow || '').trim().toLowerCase() === AI_SOVEREIGN_WORKFLOW
}

export function isAiSovereignContract(contract = {}) {
	if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return false
	return isAiSovereignWorkflow(contract)
		&& String(contract.creativeAuthority || '').trim().toLowerCase() === 'ai'
		&& String(contract.directorMode || '').trim().toLowerCase() === DIRECTOR_MODE_OFF
		&& String(contract.verificationMode || '').trim().toLowerCase() === COMPLETE_VERIFICATION_MODE
}

export function isAiSovereignSpec(spec = {}) {
	return isAiSovereignContract(spec?.authoringContract)
}

export function isDirectorWorkflow(contract = {}) {
	return String(contract?.workflow || '').trim().toLowerCase() === DIRECTOR_WORKFLOW
}

export function publicCreativeAuthorityModes() {
	return [
		{
			id: AI_SOVEREIGN_WORKFLOW,
			creativeAuthority: 'ai',
			directorMode: DIRECTOR_MODE_OFF,
			verificationMode: COMPLETE_VERIFICATION_MODE,
			purpose: 'The AI owns every creative decision; BetterPPTX compiles, measures, reports, and verifies without creative rewriting.',
			aiOwns: ['story', 'composition', 'geometry', 'styling', 'hierarchy', 'native object selection', 'motion', 'timing intent', 'release judgment'],
			engineMay: ['validate typed inputs', 'measure fit and collisions', 'report findings', 'serialize native PowerPoint', 'verify package integrity, accessibility, selections, media, and timing'],
			engineMustNot: ['invent or rewrite the story', 'move AI-authored geometry', 'replace explicit catalog choices', 'apply Director planning requirements', 'silently substitute unsupported behavior'],
		},
		{
			id: DIRECTOR_WORKFLOW,
			creativeAuthority: 'ai-with-director-assistance',
			directorMode: DIRECTOR_MODE_ASSISTED,
			verificationMode: COMPLETE_VERIFICATION_MODE,
			purpose: 'Optional structured assistance through story, design, semantic layout, and motion domains.',
		},
	]
}
