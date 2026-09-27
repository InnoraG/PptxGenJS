// Corpus-wide semantic fixture contract gate.
//
// The live MCP lab exercises selected fixtures through the full public boundary,
// but a stale checked-in spec can otherwise sit unnoticed until that fixture is
// selected. Keep this cheap deterministic gate in the release aggregate: every
// Authoring Excellence fixture must be structurally complete, use the advertised
// semantic vocabulary, and compile without blocking layout findings.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { planDeckLayout } from './ir/layout-engine.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const fixtureRoot = path.join(root, 'tools', 'fixtures')
const blockingCodes = new Set(['UNKNOWN_LAYOUT_INTENT', 'UNKNOWN_REGION', 'REGION_PLAN_INVALID', 'UNVERIFIED_DATA'])
// These are deliberately informational and already have a documented public
// correction path. Keep the set explicit: a newly introduced compiler warning
// must be reviewed here instead of disappearing into a green corpus gate.
const allowedCompilerInfoCodes = new Set(['NARRATION_TOO_SHORT_FOR_CONTENT', 'SPEC_FIELD_NOT_COMPILED', 'LAYOUT_INTENT_ALIAS_NORMALIZED'])
const allowedSpatialDiagnostics = new Set(['OBJECT_OVERLAP', 'PRESENTER_PERFORMANCE_CONTACT_OVERLAP', 'PRESENTER_PERFORMANCE_CONTACT_VISIBILITY_UNRESOLVED'])
const requiredTopLevel = ['schemaVersion', 'title', 'authoringContract', 'contentStory', 'visualDesign', 'motionTime', 'slides']
const findings = []
let fixtureCount = 0
let slideCount = 0

for (const entry of fs.readdirSync(fixtureRoot, { withFileTypes: true }).filter(item => item.isDirectory() && item.name.startsWith('authoring-excellence-')).sort((a, b) => a.name.localeCompare(b.name))) {
	const specPath = path.join(fixtureRoot, entry.name, 'spec.json')
	if (!fs.existsSync(specPath)) continue
	fixtureCount++
	let spec
	try {
		spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
	} catch (error) {
		findings.push({ fixture: entry.name, code: 'INVALID_JSON', message: error.message })
		continue
	}
	for (const field of requiredTopLevel) {
		if (spec[field] == null) findings.push({ fixture: entry.name, code: 'MISSING_TOP_LEVEL_FIELD', field })
	}
	if (spec.schemaVersion !== 'betterpptx.deck-spec.v1') findings.push({ fixture: entry.name, code: 'SCHEMA_VERSION', received: spec.schemaVersion })
	if (spec.authoringContract?.workflow !== 'authoring-excellence-director-v1') findings.push({ fixture: entry.name, code: 'AUTHORING_WORKFLOW', received: spec.authoringContract?.workflow })
	if (!Array.isArray(spec.slides) || spec.slides.length === 0) continue
	slideCount += spec.slides.length
	let plan
	try {
		plan = planDeckLayout(spec)
	} catch (error) {
		findings.push({ fixture: entry.name, code: 'PLAN_THROW', message: error.message })
		continue
	}
	for (const slide of plan?.slides || []) {
		for (const issue of [...(slide.errors || []), ...(slide.warnings || [])]) {
			if (blockingCodes.has(issue.code)) findings.push({ fixture: entry.name, slide: slide.id, code: issue.code, message: issue.message })
		}
	}
	let compiled
	try {
		// Premium dry-run removes the free-preview upgrade advisory from this
		// corpus contract; the gate is checking semantic compiler vocabulary, not
		// account entitlement. No provider or package work occurs in dry-run.
		compiled = buildSpecOperationPlan(spec, { mode: 'research', dryRun: true, plan: 'premium' })
	} catch (error) {
		findings.push({ fixture: entry.name, code: 'COMPILER_THROW', message: error.message })
		continue
	}
	for (const warning of compiled?.warnings || []) {
		if (blockingCodes.has(warning.code)) {
			findings.push({ fixture: entry.name, slide: warning.slideId || null, code: warning.code, message: warning.message })
		} else if (!allowedCompilerInfoCodes.has(warning.code) && !allowedSpatialDiagnostics.has(warning.code) || (!allowedSpatialDiagnostics.has(warning.code) && warning.severity !== 'info')) {
			findings.push({ fixture: entry.name, slide: warning.slideId || null, code: 'UNEXPECTED_COMPILER_WARNING', warningCode: warning.code || null, severity: warning.severity || null, message: warning.message || null })
		}
	}
}

const report = {
	schemaVersion: 'betterpptx.authoring-excellence.fixture-contract.v1',
	status: findings.length ? 'FAIL' : 'PASS',
	fixtures: fixtureCount,
	slides: slideCount,
	blockingFindings: findings,
}
console.log(JSON.stringify(report, null, 2))
if (findings.length) process.exit(1)
console.log(`AUTHORING FIXTURE CONTRACT: PASS fixtures=${fixtureCount} slides=${slideCount}`)
