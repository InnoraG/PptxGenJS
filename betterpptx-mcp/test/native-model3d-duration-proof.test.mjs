import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectNative3dDurationXml, native3dDurationCases } from '../verify-native-model3d-duration-powerpoint-v1.mjs'

function fixture(item, { duration = item.expectedDurationMs, marker = item.startMs + item.expectedDurationMs + item.markerGapMs, hidden = Math.max(0, item.expectedDurationMs - 1) } = {}) {
	return `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d"><p:cSld><p:cNvPr id="2" name="${item.modelName}"/><p:cNvPr id="3" name="${item.markerName}"/><am3d:model3d/></p:cSld><p:timing><p:cTn id="1" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="2" presetID="${item.presetId}" presetClass="${item.presetClass}"><p:stCondLst><p:cond delay="${item.startMs}"/></p:stCondLst><p:childTnLst><p:anim><p:cBhvr><p:cTn id="3" dur="${duration}"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl><p:attrNameLst><p:attrName>3d.object.rotation.y</p:attrName></p:attrNameLst></p:cBhvr></p:anim>${item.effect === 'leave' ? `<p:set><p:cBhvr><p:cTn id="4" dur="1"><p:stCondLst><p:cond delay="${hidden}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>` : ''}</p:childTnLst></p:cTn></p:par><p:par><p:cTn id="5" presetID="1" presetClass="entr"><p:stCondLst><p:cond delay="${marker}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="6" dur="1"/><p:tgtEl><p:spTgt spid="3"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:timing></p:sld>`
}

test('independent proof matrix includes all five native effects, short/long/default/reset and zero/one boundaries', () => {
	const cases = native3dDurationCases(), boundary = native3dDurationCases({ boundary: true })
	assert.equal(cases.length, 20); assert.equal(boundary.length, 10)
	assert.deepEqual(cases.filter(item => item.mode === 'default').map(item => item.expectedDurationMs), [1000, 2000, 1000, 1000, 1000])
	for (const effect of ['arrive', 'turntable', 'swing', 'jumpandturn', 'leave']) {
		assert.deepEqual(cases.filter(item => item.effect === effect).map(item => item.mode), ['short', 'long', 'default', 'null-reset'])
		assert.deepEqual(boundary.filter(item => item.effect === effect).map(item => item.expectedDurationMs), [0, 1])
	}
})

test('proof detects the original fixed-child-duration defect despite a correct afterPrevious schedule', () => {
	for (const item of native3dDurationCases().filter(item => item.mode === 'long')) {
		const correct = inspectNative3dDurationXml(fixture(item), item)
		assert.ok(Object.values(correct.checks).every(Boolean), item.id)
		const defect = inspectNative3dDurationXml(fixture(item, { duration: item.nativeDefaultMs }), item)
		assert.equal(defect.checks.movementMatchesAuthoredClock, false)
		assert.equal(defect.checks.afterPreviousMatchesActualEnd, true)
	}
})

test('proof independently detects stale Leave visibility and a wrongly scheduled successor', () => {
	const item = native3dDurationCases().find(item => item.id === 'leave-long')
	assert.equal(inspectNative3dDurationXml(fixture(item, { hidden: 999 }), item).checks.hideMatchesAuthoredEnd, false)
	assert.equal(inspectNative3dDurationXml(fixture(item, { marker: 1400 }), item).checks.afterPreviousMatchesActualEnd, false)
})

test('native shape identity accounts for compatibility fallback without accepting real duplicate IDs', () => {
	const item = native3dDurationCases()[0]
	const fallback = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="am3d"><am3d:model3d/></mc:Choice><mc:Fallback><p:cNvPr id="2" name="${item.modelName}"/></mc:Fallback></mc:AlternateContent>`
	assert.ok(Object.values(inspectNative3dDurationXml(fixture(item).replace('<am3d:model3d/>', fallback), item).checks).every(Boolean))
	assert.throws(() => inspectNative3dDurationXml(fixture(item).replace('<am3d:model3d/>', '<am3d:model3d/><p:cNvPr id="2" name="duplicate"/>'), item), /active native shape IDs must be unique/)
})

test('zero-duration boundary allows a 1 ms setter but no movement or 500 ms scheduling fallback', () => {
	for (const item of native3dDurationCases({ boundary: true }).filter(item => item.mode === 'zero')) {
		const row = inspectNative3dDurationXml(fixture(item, { marker: item.startMs + item.markerGapMs + 1 }), item)
		assert.ok(Object.values(row.checks).every(Boolean), item.id)
		assert.equal(inspectNative3dDurationXml(fixture(item, { marker: item.startMs + item.markerGapMs + 500 }), item).checks.afterPreviousMatchesActualEnd, false)
	}
})
