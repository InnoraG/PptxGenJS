// Public composition-mode identifiers shared by the contract gate, layout
// planner, compiler, and capability readback.  These values describe who owns
// placement; they never grant access to raw PowerPoint XML or private package
// preservation payloads.

export const SEMANTIC_LAYOUT_PLACEMENT_POLICY = 'semantic-layout-only'
export const AI_AUTHORED_GEOMETRY_PLACEMENT_POLICY = 'ai-authored-geometry-v1'
export const VISUAL_REFERENCE_PLACEMENT_POLICY = 'visual-reference-pixels-v1'

export function isAiAuthoredGeometryContract(contract = {}) {
	if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return false
	return String(contract.geometryAuthority || '').trim().toLowerCase() === 'ai'
		&& String(contract.placementPolicy || '').trim().toLowerCase() === AI_AUTHORED_GEOMETRY_PLACEMENT_POLICY
}

export function isAiAuthoredGeometrySpec(spec = {}) {
	return isAiAuthoredGeometryContract(spec?.authoringContract)
}

export function publicCompositionModes() {
	return [
		{
			id: AI_AUTHORED_GEOMETRY_PLACEMENT_POLICY,
			geometryAuthority: 'ai',
			placementPolicy: AI_AUTHORED_GEOMETRY_PLACEMENT_POLICY,
			coordinateSystem: 'inches',
			purpose: 'AI-authored exact composition with native editable objects and deterministic geometry validation.',
			acceptedPlacementInputs: ['content[].rect', 'content[].bbox', 'content[].x/y/w/h', 'content[].options.x/y/w/h', 'slides[].regionPlan named rectangles'],
			engineResponsibilities: ['validate finite positive rectangles', 'preserve authored precision', 'report overlap, fit, and off-slide findings', 'serialize and package-verify the native result'],
			forbiddenInputs: ['raw-native-preservation', 'opaqueNative', 'private motion maps', 'raw PowerPoint XML'],
		},
		{
			id: VISUAL_REFERENCE_PLACEMENT_POLICY,
			geometryAuthority: 'ai',
			placementPolicy: VISUAL_REFERENCE_PLACEMENT_POLICY,
			coordinateSystem: 'source-pixels',
			purpose: 'AI-observed reference reconstruction whose authored pixel geometry is converted without creative repositioning.',
			acceptedPlacementInputs: ['content[].pixelFrame', 'content[].pixelPoints', 'content[].pixelPaths'],
			engineResponsibilities: ['convert declared viewport pixels to slide units', 'validate bounds', 'serialize and package-verify'],
			forbiddenInputs: ['engine-selected placement', 'raw PowerPoint XML'],
		},
	]
}
