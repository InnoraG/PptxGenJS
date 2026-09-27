// IMG1/decisioning evidence: 200 varied, frozen policy intents.
// This is a deterministic source-policy fixture, not fabricated perceptual
// human labeling. It proves that the router never silently raster-generates
// factual/identity-critical requests and keeps low-rights cases fail-closed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { routeVisualNeed } from './ir/visual-source-router.mjs'
import { buildVisualGenerationPlan } from './ir/visual-director.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const worlds = ['aurora', 'editorial', 'blueprint', 'luxe', 'mist', 'meridian', 'playbook', 'horizon', 'mono', 'botanical']
const aspects = ['landscape', 'square', 'portrait', 'landscape', 'square']
const records = []
const add = (family, expectedDecision, count, make) => {
	for (let i = 0; i < count; i++) {
		const index = records.length + 1
		const spec = { title: `Frozen router intent ${index}`, objective: `Explain decision ${index}`, styleIntent: { artDirection: worlds[i % worlds.length] } }
		const slide = { id: `s${index}`, title: `Slide ${index}`, message: `Message ${index}`, role: i % 2 ? 'supporting' : 'opener', layoutIntent: i % 3 ? 'copy-left-image-right' : 'image-left-copy-right' }
		const block = { kind: 'image', name: `visual-${index}`, rect: { x: 1, y: 1, w: i % 4 === 0 ? 4 : 7, h: i % 3 === 0 ? 5 : 3 }, visualIntent: { mode: 'auto', aspect: aspects[i % aspects.length], ...make(i, index) } }
		const actual = routeVisualNeed({ spec, slide, block })
		records.push({ id: `route-fixture-${String(index).padStart(3, '0')}`, family, expectedDecision, actualDecision: actual.decision, confidence: actual.confidence, factuality: actual.factuality, safeToGenerate: actual.safeToGenerate, sourceRoute: actual })
	}
}

add('factual-chart-table', 'native-chart-table', 20, (i) => ({ factual: true, concept: `quarterly revenue trend chart ${i}` }))
add('factual-process', 'native-shapes-text', 20, (i) => ({ concept: `editable workflow architecture timeline ${i}`, requiredText: true }))
add('required-text', 'native-shapes-text', 20, (i) => ({ concept: `readable headline and caption ${i}`, requiredText: true }))
add('brand-ui', 'owned-asset', 20, (i) => ({ concept: `authorized product interface ${i}`, ui: true }))
add('identity-critical', 'consented-presenter', 20, (i) => ({ concept: `specific presenter portrait ${i}`, identityCritical: true }))
add('stock-first', 'licensed-stock', 20, (i) => ({ concept: `generic real-world workplace photograph ${i}`, genericRealWorld: true, sourcePreference: 'stock-first' }))
add('conceptual-generation', 'generated', 20, (i) => ({ mode: 'generate', concept: `conceptual metaphor of resilient systems ${i}` }))
add('generated-series', 'generated-series', 20, (i) => ({ mode: 'auto', concept: `fictional editorial visual for strategic change ${i}`, consistencyGroup: `series-${i % 4}` }))
add('rights-abstain', 'abstain', 20, (i) => ({ concept: `reference-derived visual ${i}`, rightsClass: 'unknown-unverified' }))
add('explicit-unclear', 'abstain', 20, (i) => ({ mode: 'unclear', concept: `unclear visual request ${i}` }))

const failures = records.filter(record => record.expectedDecision !== record.actualDecision)
const factualRasterViolations = records.filter(record => ['factual-chart-table', 'factual-process', 'required-text'].includes(record.family) && record.safeToGenerate)
const identityViolations = records.filter(record => record.family === 'identity-critical' && record.safeToGenerate)
const rightsViolations = records.filter(record => record.family === 'rights-abstain' && record.safeToGenerate)
const integrationNative = buildVisualGenerationPlan({
	spec: { title: 'Facts' }, slide: { title: 'Revenue chart' }, rect: { x: 1, y: 1, w: 6, h: 3 },
	block: { kind: 'image', visualIntent: { mode: 'generate', factual: true, concept: 'quarterly revenue trend chart' } },
}) === null
const integrationGenerated = Boolean(buildVisualGenerationPlan({
	spec: { title: 'Concept' }, slide: { title: 'Operating model' }, rect: { x: 1, y: 1, w: 6, h: 3 },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'fictional conceptual pathways converging into one calm system' } },
}))
const integrationExactText = routeVisualNeed({
	spec: { title: 'Carbon cycle lesson' }, slide: { title: 'Carbon cycle', message: 'Show exact text in the image' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'carbon cycle illustration', exactText: 'ATMOSPHERE, PLANTS, SOIL, OCEAN' } },
}).decision === 'native-shapes-text'
const integrationNegatedText = routeVisualNeed({
	spec: { title: 'Parking pitch' }, slide: { title: 'Find the next open spot', message: 'A conceptual route visual' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'cinematic city parking scene, no readable text, no logos', consistencyGroup: 'parking-series' } },
}).decision === 'generated-series'
const integrationLongNegatedSafetyList = routeVisualNeed({
	spec: { title: 'Below the Blue' }, slide: { title: 'A living world', message: 'A cinematic documentary visual proof surface' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'bioluminescent deep-sea ecosystem with delicate organisms in open water; blank unmarked surfaces only; no signs, labels, lettering, numbers, captions, logos, watermarks, interface elements, or readable text anywhere', consistencyGroup: 'below-blue-series' } },
}).decision === 'generated-series'
const integrationPhysicalTable = routeVisualNeed({
	spec: { title: 'Book club' }, slide: { title: 'A curious closing image', message: 'Leave the audience with a warm question' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'warm illustrated reading-room table with a blank notebook, no words, no labels, no logos', consistencyGroup: 'book-club-series' } },
}).decision === 'generated-series'
const integrationNaturalLanguageRow = routeVisualNeed({
	spec: { title: 'Community theater fundraiser' },
	slide: { title: 'Let every story be heard', message: 'A clearer sound system should reach the back row.' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'warm empty theater stage with no readable text', consistencyGroup: 'theater-series' } },
}).decision === 'generated-series'
const integrationRoadmapStoryImage = routeVisualNeed({
	spec: { title: 'A roadmap customers can trust' },
	slide: { title: 'A roadmap customers can trust', message: 'The next horizon is earned by evidence.' },
	block: { kind: 'image', visualIntent: { mode: 'generate', purpose: 'roadmap north-star visual', concept: 'cinematic coastal horizon at first light, a quiet path leading toward distant mountains, no readable text', consistencyGroup: 'roadmap-horizon' } },
}).decision === 'generated-series'
const integrationFactualTable = routeVisualNeed({
	spec: { title: 'Quarterly report' }, slide: { title: 'Data table', message: 'Show the comparison table' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'comparison table of quarterly revenue', factual: true } },
}).decision === 'native-chart-table'
const integrationMalformedAnnotations = routeVisualNeed({
	spec: { title: 'Carbon cycle lesson' }, slide: { title: 'Carbon cycle' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'carbon cycle illustration', nativeAnnotations: { labels: [{}], arrows: [null] } } },
}).decision === 'abstain'
const integrationOutOfBoundsAnnotations = routeVisualNeed({
	spec: { title: 'Carbon cycle lesson' }, slide: { title: 'Carbon cycle' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'carbon cycle illustration', nativeAnnotations: { labels: [{ text: 'ATMOSPHERE', x: 0.9, y: 0.1, w: 0.3, h: 0.1 }], arrows: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.1 }] } } },
}).decision === 'abstain'
const integrationPartialInvalidAnnotations = routeVisualNeed({
	spec: { title: 'Carbon cycle lesson' }, slide: { title: 'Carbon cycle' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'carbon cycle illustration', nativeAnnotations: { labels: [{ text: 'ATMOSPHERE', x: 0.2, y: 0.1, w: 0.2, h: 0.1 }, { text: 'PLANTS', x: Number.NaN, y: 0.2, w: 0.2, h: 0.1 }], arrows: [{ x: 0.1, y: 0.2, w: 0.2, h: 0.1 }] } } },
}).decision === 'abstain'
const decisionMix = Object.fromEntries([...new Set(records.map(record => record.actualDecision))].sort().map(decision => [decision, records.filter(record => record.actualDecision === decision).length]))
const report = {
	schemaVersion: 'betterpptx.visual-source-router-corpus.v1',
	status: failures.length === 0 && factualRasterViolations.length === 0 && identityViolations.length === 0 && rightsViolations.length === 0 && integrationNative && integrationGenerated && integrationExactText && integrationNegatedText && integrationLongNegatedSafetyList && integrationPhysicalTable && integrationNaturalLanguageRow && integrationRoadmapStoryImage && integrationFactualTable && integrationMalformedAnnotations && integrationOutOfBoundsAnnotations && integrationPartialInvalidAnnotations ? 'research-policy-fixture-pass' : 'research-policy-fixture-fail',
	recordCount: records.length,
	agreement: (records.length - failures.length) / records.length,
	threshold: 0.95,
	decisionMix,
	factualRasterViolations: factualRasterViolations.map(record => record.id),
	identityViolations: identityViolations.map(record => record.id),
	rightsViolations: rightsViolations.map(record => record.id),
	failures: failures.map(record => ({ id: record.id, family: record.family, expected: record.expectedDecision, actual: record.actualDecision })),
	lowConfidenceRiskCases: records.filter(record => record.family === 'rights-abstain' && record.confidence < 0.9).map(record => record.id),
	integration: { factualPlanSuppressed: integrationNative, conceptualPlanRetained: integrationGenerated, exactTextPlanNative: integrationExactText, negatedTextRemainsConceptual: integrationNegatedText, longNegatedSafetyListRemainsConceptual: integrationLongNegatedSafetyList, physicalTableRemainsConceptual: integrationPhysicalTable, naturalLanguageRowRemainsConceptual: integrationNaturalLanguageRow, roadmapStoryImageRemainsConceptual: integrationRoadmapStoryImage, factualTableRemainsNative: integrationFactualTable, malformedAnnotationRequestAbstains: integrationMalformedAnnotations, outOfBoundsAnnotationRequestAbstains: integrationOutOfBoundsAnnotations, partialInvalidAnnotationRequestAbstains: integrationPartialInvalidAnnotations },
	fixtureProvenance: 'frozen-policy-answer; no customer or consented-human images; no AI calls',
	records,
}
const outputPath = path.join(root, 'visual-source-router-corpus-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`  ${report.status === 'research-policy-fixture-pass' ? 'ok  ' : 'FAIL'} source-router decisions (${records.length}/${records.length - failures.length})`)
console.log(`  ${factualRasterViolations.length === 0 ? 'ok  ' : 'FAIL'} factual/text requests avoid generation`)
console.log(`  ${identityViolations.length === 0 ? 'ok  ' : 'FAIL'} identity-critical requests fail safe`)
console.log(`  ${rightsViolations.length === 0 ? 'ok  ' : 'FAIL'} unclear-rights requests abstain`)
console.log(`  ${integrationNative && integrationGenerated && integrationExactText && integrationNegatedText && integrationLongNegatedSafetyList && integrationPhysicalTable && integrationNaturalLanguageRow && integrationRoadmapStoryImage && integrationFactualTable && integrationMalformedAnnotations && integrationOutOfBoundsAnnotations && integrationPartialInvalidAnnotations ? 'ok  ' : 'FAIL'} Visual Director honors semantic route decisions and annotation safety`)
console.log(`\n${report.status}: ${outputPath}`)
process.exit(report.status === 'research-policy-fixture-pass' ? 0 : 1)
