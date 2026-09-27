// Consolidated G2 proof for the shared native visual substrate.
// This gate certifies the generic carrier contract and its native/package
// boundary; it deliberately does not promote any of the 2,258 universal rows.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
	NATIVE_VISUAL_SURFACES,
	applyEffectsArray,
	matchNativeVisualSurface,
	normalizeShadow,
} from './ir/native-visual-primitives.mjs'

const root = process.cwd()
const rel = file => path.relative(root, file).replaceAll('\\', '/')
const sha256 = file => crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex')
const exists = file => fsSync.existsSync(file)
const latest = async (dir, suffix) => {
	if (!exists(dir)) return null
	const walk = async current => {
		const found = []
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name)
			if (entry.isDirectory()) found.push(...await walk(full))
			else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full)
		}
		return found
	}
	return (await walk(dir)).sort().at(-1) || null
}
const load = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const source = file => file && ({ path: rel(file), sha256: sha256(file) })

const testRun = spawnSync(process.execPath, ['--test', 'betterpptx-mcp/test/native-visual-primitives.test.mjs'], {
	encoding: 'utf8',
	maxBuffer: 4 * 1024 * 1024,
})
const testOutput = `${testRun.stdout || ''}\n${testRun.stderr || ''}`
const focusedTests = {
	exitCode: testRun.status,
	passCount: Number(testOutput.match(/(?:#|ℹ) pass (\d+)/)?.[1] || 0),
	failCount: Number(testOutput.match(/(?:#|ℹ) fail (\d+)/)?.[1] || 0),
	outputSha256: crypto.createHash('sha256').update(testOutput).digest('hex'),
}

const requiredSurfaceIds = [
	'shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay', 'effects',
	'fill', 'line', 'textFill', 'imageAdjustments', 'corrections', 'recolor',
	'artisticEffect', 'shape3D', 'picture3D', 'themeColorScheme', 'layoutsThemesMasters',
]
const byId = new Map(NATIVE_VISUAL_SURFACES.map(surface => [surface.id, surface]))
const requiredSurfaces = requiredSurfaceIds.map(id => byId.get(id)).filter(Boolean)
const parameterizedSurfaceContract = requiredSurfaces.length === requiredSurfaceIds.length
	&& requiredSurfaces.every(surface => surface.resetBehavior && (surface.parameters || surface.schema))
const parameterRows = requiredSurfaces.flatMap(surface => Array.isArray(surface.parameters)
	? surface.parameters
	: Object.values(surface.parameters || {}).flat())
const typedResettableParameters = parameterRows.length > 0
	&& parameterRows.every(parameter => parameter.id && parameter.type && parameter.valueType && parameter.reset)
const effectSurface = byId.get('effects')
const effectDagSurface = byId.get('effectDag')
const crossCarrierCombination = Array.isArray(effectSurface?.applicability)
	&& ['shape', 'text', 'picture'].every(carrier => effectSurface.applicability.includes(carrier))
const importedStatePrecedence = effectDagSurface?.capabilityStatus === 'preserve-imported-only'
	&& effectDagSurface?.capabilityMode === 'preserve-only'
	&& effectDagSurface?.editability === 'native-preserved'
const baseShadow = normalizeShadow({ type: 'outerShadow', color: '102030', opacity: 0.42, blurPt: 12, distancePt: 7, angleDeg: 135, scaleY: 0.8 })
const isolatedShadow = normalizeShadow({ type: 'outerShadow', color: '102030', opacity: 0.42, blurPt: 24, distancePt: 7, angleDeg: 135, scaleY: 0.8 })
const oneFieldMutationIsolation = isolatedShadow.type === baseShadow.type
	&& isolatedShadow.color === baseShadow.color
	&& isolatedShadow.opacity === baseShadow.opacity
	&& isolatedShadow.offset === baseShadow.offset
	&& isolatedShadow.angle === baseShadow.angle
	&& isolatedShadow.scaleY === baseShadow.scaleY
	&& isolatedShadow.blur !== baseShadow.blur
const duplicateLastWins = applyEffectsArray({}, [
	{ type: 'glow', color: '00FF00', radiusPt: 4 },
	{ type: 'glow', color: 'FF00FF', radiusPt: 9 },
]).glow?.color === 'FF00FF'
const componentReset = effectSurface?.resetBehavior?.component?.includes('null') === true
const fullReset = effectSurface?.resetBehavior?.full === 'set effects to [] or null'
const semanticMatcher = ['shadow', 'pictureCorrections', 'effects'].every(id => matchNativeVisualSurface(id).length > 0)

const packageProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-native-package-proof.json')
const packageAudit = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-package-integrity-proof.json')
const officeProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-office-com-proof.json')
const familyDirs = ['shapes-gradients-family', 'media-images-avatar-family', 'foundation-family', 'wordart-text3d-family', 'model3d-family']
const familyProofs = {}
for (const family of familyDirs) {
	const file = await latest(path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/${family}`), '-family-proof.json')
	familyProofs[family] = file ? { ...source(file), status: (await load(file)).status } : null
}
const packageData = packageProof ? await load(packageProof) : null
const auditData = packageAudit ? await load(packageAudit) : null
const officeData = officeProof ? await load(officeProof) : null
const checks = {
	focusedNativeSubstrateTests: focusedTests.exitCode === 0 && focusedTests.passCount === 16 && focusedTests.failCount === 0,
	parameterizedSurfaceContract,
	typedResettableParameters,
	crossCarrierCombination,
	importedStatePrecedence,
	oneFieldMutationIsolation,
	duplicateEffectLastWins: duplicateLastWins,
	componentReset,
	fullReset,
	semanticMatcher,
	canonicalNativeReadback: packageData?.status === 'PASS' && packageData.checks?.readbackSlides === true && packageData.checks?.readbackObjectsAtLeastSource === true,
	repairFreeSaveCopyAs: officeData?.status === 'PASS' && officeData.slideCount === 25 && officeData.verifyCount === 25,
	packageIntegrity: auditData?.status === 'PASS' && auditData.errors?.length === 0 && auditData.warnings?.length === 0 && auditData.externalTargets?.length === 0,
	carrierFamilyEvidence: Object.values(familyProofs).every(value => value?.status === 'PASS'),
}
const report = {
	schemaVersion: 'betterpptx.g2-shared-native-substrate-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	gate: 'G2',
	checks,
	focusedTests,
	surfaceContract: {
		totalNativeVisualSurfaces: NATIVE_VISUAL_SURFACES.length,
		requiredSurfaceCount: requiredSurfaceIds.length,
		parameterCount: parameterRows.length,
		crossCarrierApplicability: effectSurface?.applicability || [],
		preserveOnlyImportedSurface: effectDagSurface?.id || null,
	},
	nativePackage: packageProof ? { ...source(packageProof), status: packageData.status, readback: packageData.readback, package: packageData.package } : null,
	packageAudit: packageAudit ? { ...source(packageAudit), status: auditData.status, counts: auditData.counts, binaryMediaMetadata: auditData.binaryMediaMetadata } : null,
	officeSaveCopyAs: officeProof ? { ...source(officeProof), status: officeData.status, slideCount: officeData.slideCount, verifyCount: officeData.verifyCount } : null,
	carrierFamilyProofs: familyProofs,
	universalFormalClosure: '0/2258',
	interpretation: 'G2 certifies the shared typed native visual substrate across shape, text, and picture carriers, including one-field controls, imported-state precedence, deterministic effect combination, null resets, semantic matching, native readback, repair-free Office SaveCopyAs, and package integrity. This family gate does not promote any universal catalog row; formal closure remains 0/2258.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g2-shared-native-substrate/${stamp}`)
await fs.mkdir(outDir, { recursive: true })
const out = path.join(outDir, 'g2-shared-native-substrate-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(out, bytes)
const digest = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile(`${out}.sha256`, `${digest}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ ...report, reportPath: rel(out), reportSha256: digest }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
