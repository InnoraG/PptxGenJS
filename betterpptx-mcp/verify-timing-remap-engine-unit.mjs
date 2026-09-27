#!/usr/bin/env node
// Pure unit tests for ir/timing-remap.mjs (no deck, no serializer).
import {
	remapTimingXmlSpids,
	decomposeTimingComponents,
	matchTimingTargets,
	gateComponent,
	planSlideRemap,
} from './ir/timing-remap.mjs'

let failures = 0
function check(label, cond, detail) {
	if (cond) { console.log(`  ok  ${label}`); return }
	failures++
	console.error(`  FAIL ${label}`)
	if (detail !== undefined) console.error('       ' + JSON.stringify(detail))
}

// --- timing fixtures ---
const TWO_EFFECTS = `<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst><p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst>` +
	`<p:par><p:cTn id="5" nodeType="clickEffect" grpId="0"><p:childTnLst><p:set><p:cBhvr><p:cTn id="6"/><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>` +
	`<p:par><p:cTn id="7" nodeType="clickEffect" grpId="1"><p:childTnLst><p:set><p:cBhvr><p:cTn id="8"/><p:tgtEl><p:spTgt spid="6"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>` +
	`</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>` +
	`<p:bldLst><p:bldP spid="4" grpId="0"/><p:bldP spid="6" grpId="1"/></p:bldLst></p:timing>`

console.log('TEST 1: remapTimingXmlSpids — byte-preserving swap')
{
	const input = `<p:spTgt spid = "5"/><p:bldP spid="7" grpId="0"/>`
	const { xml, rewrites } = remapTimingXmlSpids(input, { 5: 7, 7: 5 })
	check('swap 5<->7 rewrites both', rewrites === 2, { rewrites })
	check('whitespace + other bytes preserved', xml === `<p:spTgt spid = "7"/><p:bldP spid="5" grpId="0"/>`, { xml })
	const noop = remapTimingXmlSpids(input, {})
	check('empty map is identity', noop.xml === input && noop.rewrites === 0)
	let threw = false
	try { remapTimingXmlSpids(input, { 5: 'abc' }) } catch { threw = true }
	check('non-numeric destination throws', threw)
}

console.log('TEST 2: decomposeTimingComponents')
{
	const d = decomposeTimingComponents(TWO_EFFECTS)
	check('two independent components', d.components.length === 2, d.components.map(c => c.spids))
	const spidSets = d.components.map(c => c.spids.sort().join(',')).sort()
	check('component spids are [4] and [6]', spidSets.join('|') === '4|6', spidSets)
	check('scaffold cTns excluded (tmRoot,mainSeq)', d.scaffoldCTnIds.sort().join(',') === '1,2', d.scaffoldCTnIds)
	check('allSpids = 4,6', d.allSpids.sort().join(',') === '4,6', d.allSpids)
}

console.log('TEST 3: decompose — interactive cross-ref unions effects')
{
	// Effect A (cTn id=5) targets spid 4; Effect B (cTn id=9) targets spid 6 but its
	// condition references A via <p:tn val="5"/> -> should union into ONE component.
	const xml = `<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst><p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst>` +
		`<p:par><p:cTn id="5" nodeType="clickEffect"><p:childTnLst><p:set><p:cBhvr><p:cTn id="6"/><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>` +
		`<p:par><p:cTn id="9" nodeType="withEffect"><p:stCondLst><p:cond><p:tn val="5"/></p:cond></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="10"/><p:tgtEl><p:spTgt spid="6"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>` +
		`</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
	const d = decomposeTimingComponents(xml)
	check('cross-ref merged into one component', d.components.length === 1, d.components.map(c => c.spids))
	check('merged component has spids 4 and 6', d.components[0].spids.sort().join(',') === '4,6', d.components[0].spids)
}

console.log('TEST 4: matchTimingTargets — signals + ambiguity + kind')
{
	const current = [
		{ objectName: 'title', kind: 'text', emittedSpid: 40 },
		{ objectName: 'body', kind: 'text', emittedSpid: 41 },
		{ objectName: 'dup', kind: 'text', emittedSpid: 50 },
		{ objectName: 'dup', kind: 'text', emittedSpid: 51 },
		{ objectName: 'pic', kind: 'picture', emittedSpid: 60 },
	]
	const src = [
		{ spid: '4', objectName: 'title', kind: 'text' },
		{ spid: '6', objectName: 'body', kind: 'text' },
		{ spid: '8', objectName: 'dup', kind: 'text' },          // ambiguous
		{ spid: '9', objectName: 'pic', kind: 'text' },          // kind mismatch (text -> picture)
	]
	const { matches, unmatched } = matchTimingTargets(src, current)
	check('title -> 40 via objectName', matches['4']?.newSpid === '40' && matches['4'].signal === 'objectName', matches['4'])
	check('body -> 41', matches['6']?.newSpid === '41', matches['6'])
	check('ambiguous objectName unmatched', unmatched.includes('8') && !matches['8'])
	check('kind mismatch unmatched', unmatched.includes('9') && !matches['9'])

	// semanticId beats objectName.
	const m2 = matchTimingTargets([{ spid: '4', semanticId: 'sem-1', objectName: 'title', kind: 'text' }],
		[{ semanticId: 'sem-1', objectName: 'renamed', kind: 'text', emittedSpid: 70 }])
	check('semanticId match (1.0) survives rename', m2.matches['4']?.newSpid === '70' && m2.matches['4'].signal === 'semanticId', m2.matches['4'])
}

console.log('TEST 5: gateComponent — remap / prune / preserve')
{
	const matches = { '4': { newSpid: '40', confidence: 0.95 }, '6': { newSpid: '41', confidence: 0.95 } }
	const remap = gateComponent({ id: 'c', spids: ['4'] }, matches, new Set())
	check('matched -> remap', remap.decision === 'remap' && remap.spidMap['4'] === '40', remap)
	const prune = gateComponent({ id: 'c', spids: ['99'] }, matches, new Set())
	check('unmatched -> prune', prune.decision === 'prune', prune)
	const preserve = gateComponent({ id: 'c', spids: ['4'] }, matches, new Set(['4']))
	check('already-live -> preserve (no rewrite)', preserve.decision === 'preserve' && Object.keys(preserve.spidMap).length === 0, preserve)
	// collision: two source spids map to same target
	const collide = gateComponent({ id: 'c', spids: ['4', '6'] }, { '4': { newSpid: '40' }, '6': { newSpid: '40' } }, new Set())
	check('target collision -> prune', collide.decision === 'prune', collide)
}

console.log('TEST 6: planSlideRemap — full remap rewrites spTgt + bldP')
{
	const manifest = { '4': { objectName: 'title', kind: 'text' }, '6': { objectName: 'body', kind: 'text' } }
	const current = [{ objectName: 'title', kind: 'text', emittedSpid: 40 }, { objectName: 'body', kind: 'text', emittedSpid: 41 }]
	const { xml, report } = planSlideRemap({ timingXml: TWO_EFFECTS, manifestTargets: manifest, currentObjects: current })
	check('two components remapped', report.remapped.length === 2, report.remapped)
	check('spTgt 4->40 applied', xml.includes('spid="40"') && !xml.includes('spid="4"'), { has40: xml.includes('spid="40"') })
	check('bldP 6->41 applied', xml.includes('<p:bldP spid="41"'), { snippet: xml.match(/<p:bldLst>.*<\/p:bldLst>/)?.[0] })
	check('no stale, no prune', report.stale.length === 0 && report.prunedComponents.length === 0, report)
}

console.log('TEST 7: planSlideRemap — mixed remap + prune + orphan bldP cleanup')
{
	const manifest = { '4': { objectName: 'title', kind: 'text' }, '6': { objectName: 'body', kind: 'text' } }
	const current = [{ objectName: 'title', kind: 'text', emittedSpid: 40 }] // body deleted
	const { xml, report } = planSlideRemap({ timingXml: TWO_EFFECTS, manifestTargets: manifest, currentObjects: current })
	check('one component remapped (title)', report.remapped.some(r => r.to === '40'), report.remapped)
	check('one component pruned (body)', report.prunedComponents.length === 1, report.prunedComponents)
	check('stale reports body', report.stale.some(s => s.objectName === 'body'), report.stale)
	check('orphan bldP spid=6 removed', !xml.includes('spid="6"') && !/<p:bldP spid="41"/.test(xml), { snippet: xml.match(/<p:bldLst>[\s\S]*?<\/p:bldLst>/)?.[0] })
	check('remapped target 40 present', xml.includes('spid="40"'))
}

console.log('TEST 8: planSlideRemap — preserve when targets already live (no-op)')
{
	const manifest = { '4': { objectName: 'title', kind: 'text' }, '6': { objectName: 'body', kind: 'text' } }
	// Current objects still carry the original spids 4 and 6 (rename/reorder only).
	const current = [{ objectName: 'x', kind: 'text', emittedSpid: 4 }, { objectName: 'y', kind: 'text', emittedSpid: 6 }]
	const { xml, report } = planSlideRemap({ timingXml: TWO_EFFECTS, manifestTargets: manifest, currentObjects: current })
	check('no remaps (preserve)', report.remapped.length === 0 && report.prunedComponents.length === 0, report)
	check('xml unchanged', xml === TWO_EFFECTS)
}

console.log('TEST 9: planSlideRemap — all targets gone -> null timing')
{
	const manifest = { '4': { objectName: 'title', kind: 'text' }, '6': { objectName: 'body', kind: 'text' } }
	const { xml, report } = planSlideRemap({ timingXml: TWO_EFFECTS, manifestTargets: manifest, currentObjects: [] })
	check('both pruned', report.prunedComponents.length === 2, report.prunedComponents)
	check('xml is null (no live target)', xml === null, { xml })
}

if (failures) {
	console.error(`\nTIMING REMAP ENGINE UNIT: FAIL (${failures})`)
	process.exit(1)
}
console.log('\nTIMING REMAP ENGINE UNIT: PASS')
