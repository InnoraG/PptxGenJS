#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const modulePath = fileURLToPath(import.meta.url)
const moduleDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(moduleDir, '..')

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const URL_INITIAL = 'https://example.test/action?a=1&b=<proof>'
const URL_UPDATED = 'https://example.test/action-updated?a=2&b=<proof>'
const URL_REEDITED = 'https://example.test/action-reedited?a=3&b=<proof>'
const TOOLTIP_INITIAL = 'URL A&B <proof>'
const TOOLTIP_REEDITED = 'URL re-edit A&B <proof>'
const SHOW_PRIMARY = Object.freeze({ name: 'Primary A&B <proof>', id: 0 })
const SHOW_SECONDARY = Object.freeze({ name: 'Secondary proof', id: 7 })
const ACTION_OBJECT_NAMES = Object.freeze([
	'url-click', 'hover-next', 'end-show', 'custom-show-both', 'sound-next', 'home-action-button', 'run-hover',
])

export const FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID = 'impl-b-5dc2c48339529baf'
export const FOUNDATION_INTERACTIVE_ACTIONS_ROWS = Object.freeze([
	['cap_5e4628e4208df0355326', 'hover actions'],
	['cap_68d5d40f2215eae2ec27', 'URL action'],
	['cap_a06f420c739065b17b39', 'play sound actions'],
	['cap_ae5619804717cfc5954c', 'click actions'],
	['cap_bf541879e51cde191618', 'custom shows'],
	['cap_e44774790533e94f3b09', 'end show'],
	['cap_f3905ef2e0ad81995a06', 'action buttons'],
	['cap_f9784c48bcfddf63c337', 'jump to custom show'],
])

function sha256(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function relative(file) {
	return path.relative(workspaceRoot, file).replaceAll(path.sep, '/')
}

function timestamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function unwrap(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

function parseXmlStrict(xml, label) {
	const errors = []
	const document = new DOMParser({
		errorHandler: {
			warning: message => errors.push(`warning: ${message}`),
			error: message => errors.push(`error: ${message}`),
			fatalError: message => errors.push(`fatal: ${message}`),
		},
	}).parseFromString(String(xml), 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parse diagnostics: ${errors.join(' | ')}`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

function elements(node, localName) {
	return Array.from(node?.getElementsByTagName('*') || []).filter(item => item.localName === localName)
}

function children(node) {
	return Array.from(node?.childNodes || []).filter(item => item.nodeType === 1)
}

function directChild(node, localName) {
	return children(node).find(item => item.localName === localName) || null
}

function sourcePartForRelationships(relsPart) {
	if (relsPart === '_rels/.rels') return ''
	const match = relsPart.match(/^(.*)\/_rels\/([^/]+)\.rels$/)
	return match ? path.posix.join(match[1], match[2]) : ''
}

function relationshipPartFor(sourcePart) {
	if (!sourcePart) return '_rels/.rels'
	return path.posix.join(path.posix.dirname(sourcePart), '_rels', `${path.posix.basename(sourcePart)}.rels`)
}

function resolveRelationshipTarget(sourcePart, target) {
	const value = String(target || '')
	if (value.startsWith('/')) return value.replace(/^\/+/, '')
	return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePart || ''), value)).replace(/^\/+/, '')
}

function relationshipRecords(document) {
	return elements(document, 'Relationship').map(node => ({
		Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
	}))
}

function relationshipId(node) {
	return node?.getAttributeNS(REL_NS, 'id') || node?.getAttribute('r:id') || ''
}

function embedRelationshipId(node) {
	return node?.getAttributeNS(REL_NS, 'embed') || node?.getAttribute('r:embed') || ''
}

function wavDataUri() {
	const sampleCount = 2205
	const dataSize = sampleCount * 2
	const wav = Buffer.alloc(44 + dataSize)
	wav.write('RIFF', 0)
	wav.writeUInt32LE(36 + dataSize, 4)
	wav.write('WAVE', 8)
	wav.write('fmt ', 12)
	wav.writeUInt32LE(16, 16)
	wav.writeUInt16LE(1, 20)
	wav.writeUInt16LE(1, 22)
	wav.writeUInt32LE(22050, 24)
	wav.writeUInt32LE(44100, 28)
	wav.writeUInt16LE(2, 32)
	wav.writeUInt16LE(16, 34)
	wav.write('data', 36)
	wav.writeUInt32LE(dataSize, 40)
	return `data:audio/wav;base64,${wav.toString('base64')}`
}

const WAV_DATA = wavDataUri()
const WAV_HASH = sha256(Buffer.from(WAV_DATA.split(',')[1], 'base64'))

function bootstrapSpec() {
	const slide = (id, index) => ({
		id, title: `Action atlas ${index}`, role: 'proof', message: `Action atlas ${index}`, layoutIntent: 'title-body',
		content: [{ kind: 'textBox', name: `bootstrap-${index}`, text: `bootstrap ${index}` }],
	})
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Foundation interactive actions package proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'package-integrity reviewers', outcome: 'Freeze Action Settings and custom-show lifecycle behavior.', remember: 'Every action carrier and relationship remains native, closed, and repair-free.' },
		visualDesign: { world: 'editorial', framing: 'interactive action atlas', tone: 'technical' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		theme: { name: 'Interactive actions proof', palette: ['F8FAFC', '0F172A', '2563EB', '059669', 'D97706'], fontFace: 'Aptos' },
		slides: [slide('atlas-a', 1), slide('atlas-b', 2), slide('atlas-c', 3)],
	}
}

function customShows(state = 'initial') {
	if (state === 'reset' || state === 'deleted') return []
	if (state === 'powerpoint-roundtrip') return [
		{ ...SHOW_PRIMARY, slides: ['atlas-b', 'atlas-c'], slideIndexes: [1, 2] },
		{ ...SHOW_SECONDARY, id: 1, slides: ['atlas-c', 'atlas-b'], slideIndexes: [2, 1] },
	]
	if (state === 'updated') return [
		{ ...SHOW_PRIMARY, slides: ['atlas-c', 'atlas-b'], slideIndexes: [2, 1] },
		{ ...SHOW_SECONDARY, slides: ['atlas-b'], slideIndexes: [1] },
	]
	return [
		{ ...SHOW_PRIMARY, slides: ['atlas-b', 'atlas-c'], slideIndexes: [1, 2] },
		{ ...SHOW_SECONDARY, slides: ['atlas-c', 'atlas-b'], slideIndexes: [2, 1] },
	]
}

function sound(name = 'action-proof.wav') {
	return { source: WAV_DATA, format: 'wav', name }
}

function actionStates(state = 'initial') {
	if (state === 'reset') return Object.fromEntries(ACTION_OBJECT_NAMES.map(name => [name, null]))
	if (state === 'deleted') return {
		'hover-next': { hover: { type: 'jump', jump: 'nextSlide', tooltip: 'Hover next A&B <proof>' } },
		'end-show': { click: { type: 'endShow', tooltip: 'End show proof' } },
		'home-action-button': { click: { type: 'jump', jump: 'firstSlide', tooltip: 'Home proof' } },
	}
	if (state === 'updated') return {
		'url-click': { click: { type: 'url', url: URL_UPDATED, tooltip: 'URL updated', history: true, highlightClick: false, endSound: true } },
		'hover-next': { hover: { type: 'jump', jump: 'previousSlide', tooltip: 'Hover previous' } },
		'end-show': { click: { type: 'endShow', tooltip: 'End show updated' } },
		'custom-show-both': {
			click: { type: 'customShow', customShow: SHOW_SECONDARY.name, customShowId: SHOW_SECONDARY.id, showAndReturn: true, tooltip: 'Click secondary' },
			hover: { type: 'customShow', customShow: SHOW_PRIMARY.name, customShowId: SHOW_PRIMARY.id, showAndReturn: true, tooltip: 'Hover primary' },
		},
		'sound-next': { click: { type: 'jump', jump: 'lastSlide', tooltip: 'Sound last', sound: sound('action-updated.wav') } },
		'home-action-button': { click: { type: 'jump', jump: 'lastSlideViewed', tooltip: 'Last viewed proof' } },
		'run-hover': { hover: { type: 'jump', jump: 'previousSlide', tooltip: 'Run previous' } },
	}
	const reedited = state === 'reedited' || state === 'recompiled' || state === 'powerpoint-roundtrip'
	const secondaryShowId = state === 'powerpoint-roundtrip' ? 1 : SHOW_SECONDARY.id
	return {
		'url-click': { click: { type: 'url', url: reedited ? URL_REEDITED : URL_INITIAL, tooltip: reedited ? TOOLTIP_REEDITED : TOOLTIP_INITIAL, history: false, highlightClick: true, endSound: false } },
		'hover-next': { hover: { type: 'jump', jump: 'nextSlide', tooltip: 'Hover next A&B <proof>' } },
		'end-show': { click: { type: 'endShow', tooltip: 'End show proof' } },
		'custom-show-both': {
			click: { type: 'customShow', customShow: SHOW_PRIMARY.name, customShowId: SHOW_PRIMARY.id, showAndReturn: true, tooltip: 'Click primary' },
			hover: { type: 'customShow', customShow: SHOW_SECONDARY.name, customShowId: secondaryShowId, showAndReturn: true, tooltip: 'Hover secondary' },
		},
		'sound-next': { click: { type: 'jump', jump: 'nextSlide', tooltip: 'Sound next proof', sound: sound(reedited ? 'action-reedited.wav' : 'action-proof.wav') } },
		'home-action-button': { click: { type: 'jump', jump: 'firstSlide', tooltip: 'Home proof' } },
		'run-hover': { hover: { type: 'jump', jump: 'nextSlide', tooltip: 'Run hover proof' } },
	}
}

function actionStatesForRuntime(state, runtime) {
	const actions = actionStates(state)
	// Run-level a:hlinkMouseOver remains a separate hyperlink lane. This unit owns
	// object cNvPr Action Settings only, so the inert run is retained as a boundary
	// specimen but never contributes to strict action expectations.
	delete actions['run-hover']
	return actions
}

function endpointAction(endpoint) {
	if (!endpoint || endpoint.type === 'url') return ''
	if (endpoint.type === 'endShow') return 'ppaction://hlinkshowjump?jump=endshow'
	if (endpoint.type === 'customShow') return `ppaction://customshow?id=${endpoint.customShowId}&return=true`
	if (endpoint.type === 'slide') return 'ppaction://hlinksldjump'
	if (endpoint.type === 'none') return 'ppaction://noaction'
	const jump = {
		firstSlide: 'firstslide', lastSlide: 'lastslide', lastSlideViewed: 'lastslideviewed', nextSlide: 'nextslide', previousSlide: 'previousslide',
	}[endpoint.jump]
	return `ppaction://hlinkshowjump?jump=${jump}`
}

function clearBootstrap(pptx) {
	for (const slide of pptx.slides) slide._slideObjects = []
}

function installAtlas(pptx, actions = actionStates('initial')) {
	const slide = pptx.slides[0]
	const add = (name, x, y, text, interactiveActions, shape = 'roundRect') => slide.addText(text, {
		x, y, w: 2.7, h: 0.55, objectName: name, shape,
		fontFace: 'Aptos', fontSize: 12, color: '0F172A', align: 'center',
		accessibilityTitle: `${text} control`, altText: `${text} interactive action control`,
		fill: { color: 'E2E8F0' }, line: { color: '64748B', width: 1 }, interactiveActions,
	})
	add('url-click', 0.35, 0.35, 'URL click', actions['url-click'])
	add('hover-next', 3.2, 0.35, 'Hover next', actions['hover-next'])
	add('end-show', 6.05, 0.35, 'End show', actions['end-show'])
	add('custom-show-both', 8.9, 0.35, 'Custom show click + hover', actions['custom-show-both'])
	add('sound-next', 0.35, 1.15, 'Sound + next', actions['sound-next'])
	slide.addShape('actionButtonHome', {
		x: 3.2, y: 1.15, w: 1.2, h: 0.8, objectName: 'home-action-button',
		accessibilityTitle: 'Home action button', altText: 'Jump to the first slide',
		fill: { color: '2563EB' }, line: { color: '1D4ED8' }, interactiveActions: actions['home-action-button'],
	})
	slide.addText([{ text: 'RUN HOVER PROOF', options: { fontFace: 'Aptos', fontSize: 14, interactiveActions: actions['run-hover'] } }], {
		x: 4.75, y: 1.15, w: 3.2, h: 0.8, objectName: 'run-hover',
		accessibilityTitle: 'Run hover boundary', altText: 'Inert text-run boundary specimen',
		fill: { color: 'DCFCE7' }, line: { color: '16A34A' },
	})
	for (const [index, targetSlide] of pptx.slides.slice(1).entries()) {
		targetSlide.addText(`Custom-show target ${index + 1}`, {
			x: 1, y: 1, w: 8, h: 1, objectName: `custom-show-target-${index + 1}`, fontFace: 'Aptos', fontSize: 24,
			accessibilityTitle: `Custom-show target ${index + 1}`, altText: `Destination slide ${index + 1}`,
		})
	}
	return slide
}

function nativeObject(slide, name) {
	const matches = (slide?._slideObjects || []).filter(object => object?.options?.objectName === name)
	assert.equal(matches.length, 1, `expected one native object named ${name}`)
	return matches[0]
}

function setNativeRunHover(slide, action) {
	const object = nativeObject(slide, 'run-hover')
	const run = Array.isArray(object.text) ? object.text.find(item => item.text === 'RUN HOVER PROOF') : null
	assert.ok(run, 'run-hover text run is missing')
	if (action === null) delete run.options.interactiveActions
	else run.options.interactiveActions = action
}

async function setObjectAction(handleUpdateShape, deckId, name, interactiveActions) {
	await handleUpdateShape({
		deckId, slideIndex: 0, target: { objectName: name }, patch: { interactiveActions },
	})
}

async function setObjectActions(handleUpdateShape, deckId, slide, state, runtime) {
	const actions = actionStatesForRuntime(state, runtime)
	for (const [name, value] of Object.entries(actions)) {
		if (name === 'run-hover') setNativeRunHover(slide, value)
		else await setObjectAction(handleUpdateShape, deckId, name, value)
	}
}

function setCustomShows(entry, state) {
	const value = state === 'reset' ? null : customShows(state)
	entry.pptx.customShows = value === null ? undefined : value.map(show => ({
		name: show.name, id: show.id, slideIndexes: [...show.slideIndexes],
	}))
}

function carrierByName(document, name) {
	const candidates = elements(document, 'cNvPr').filter(node => {
		const actual = node.getAttribute('name')
		return actual === name || actual.endsWith(`.${name}`) || actual.includes(`.${name}.`)
	})
	assert.equal(candidates.length, 1, `expected one cNvPr carrier for ${name}`)
	return candidates[0]
}

function assertHyperlinkAttributes(node, endpoint, label) {
	assert.ok(node, `${label}: hyperlink carrier missing`)
	const officeRoundtrip = label.startsWith('powerpoint-roundtrip/')
	assert.equal(node.hasAttributeNS(REL_NS, 'id') || node.hasAttribute('r:id'), true, `${label}: r:id attribute must be present, including action-only empty ids`)
	assert.equal(node.getAttribute('action'), endpointAction(endpoint), `${label}: action URI`)
	const tooltip = node.getAttribute('tooltip')
	if (officeRoundtrip && endpoint.type === 'endShow') assert.ok(['', endpoint.tooltip || ''].includes(tooltip), `${label}: Office-canonical end-show tooltip`)
	else assert.equal(tooltip, endpoint.tooltip || '', `${label}: tooltip`)
	const assertBoolean = (attribute, value, description) => {
		const actual = node.getAttribute(attribute)
		if (officeRoundtrip && value === false) assert.ok(['', '0'].includes(actual), `${label}: ${description}`)
		else assert.equal(actual, value ? '1' : '0', `${label}: ${description}`)
	}
	if (Object.prototype.hasOwnProperty.call(endpoint, 'history')) assertBoolean('history', endpoint.history, 'history')
	if (Object.prototype.hasOwnProperty.call(endpoint, 'highlightClick')) assertBoolean('highlightClick', endpoint.highlightClick, 'highlightClick')
	if (Object.prototype.hasOwnProperty.call(endpoint, 'endSound')) assertBoolean('endSnd', endpoint.endSound, 'endSnd')
}

function findTextRun(document, text) {
	return elements(document, 'r').find(run => directChild(run, 't')?.textContent === text) || null
}

function assertActionCarriers(slideDocument, slideRels, expected, state) {
	const relationshipMap = new Map(slideRels.map(item => [item.Id, item]))
	const soundTargets = []
	const usedActionRelationshipIds = new Set()
	for (const [name, actions] of Object.entries(expected)) {
		if (name === 'run-hover') {
			const run = findTextRun(slideDocument, 'RUN HOVER PROOF')
			if (actions === null) {
				if (run) assert.equal(elements(run, 'hlinkMouseOver').length, 0, `${state}/${name}: run hover reset`)
				continue
			}
			assert.ok(run, `${state}/${name}: text run missing`)
			const mouseOver = directChild(directChild(run, 'rPr'), 'hlinkMouseOver')
			assertHyperlinkAttributes(mouseOver, actions.hover, `${state}/${name}/hover`)
			assert.equal(relationshipId(mouseOver), '', `${state}/${name}: action-only run hover r:id`)
			continue
		}
		let carrier = null
		try { carrier = carrierByName(slideDocument, name) } catch (error) {
			if (state === 'deleted' && !Object.prototype.hasOwnProperty.call(expected, name)) continue
			throw error
		}
		const actionChildren = children(carrier).filter(item => ['hlinkClick', 'hlinkHover'].includes(item.localName))
		if (actions === null) {
			assert.deepEqual(actionChildren, [], `${state}/${name}: action reset`)
			continue
		}
		const order = children(carrier).map(item => item.localName).filter(item => ['hlinkClick', 'hlinkHover', 'extLst'].includes(item))
		const rank = { hlinkClick: 1, hlinkHover: 2, extLst: 3 }
		assert.deepEqual(order.map(item => rank[item]), [...order.map(item => rank[item])].sort((a, b) => a - b), `${state}/${name}: cNvPr child order`)
		for (const [trigger, endpoint] of Object.entries(actions)) {
			const elementName = trigger === 'click' ? 'hlinkClick' : 'hlinkHover'
			const node = directChild(carrier, elementName)
			assertHyperlinkAttributes(node, endpoint, `${state}/${name}/${trigger}`)
			const rid = relationshipId(node)
			if (endpoint.type === 'url') {
				assert.ok(rid, `${state}/${name}/${trigger}: URL r:id must be nonempty`)
				const rel = relationshipMap.get(rid)
				assert.ok(rel, `${state}/${name}/${trigger}: URL relationship missing`)
				assert.equal(rel.Type, `${REL_TYPE}hyperlink`, `${state}/${name}/${trigger}: URL relationship type`)
				assert.equal(rel.TargetMode, 'External', `${state}/${name}/${trigger}: URL TargetMode`)
				if (state === 'powerpoint-roundtrip') assert.equal(decodeOfficeUrl(rel.Target), endpoint.url, `${state}/${name}/${trigger}: Office-canonical URL target`)
				else assert.equal(rel.Target, endpoint.url, `${state}/${name}/${trigger}: URL target must decode exactly once`)
				usedActionRelationshipIds.add(rid)
			} else {
				assert.equal(rid, '', `${state}/${name}/${trigger}: relationship-free action r:id`)
			}
			const soundNode = directChild(node, 'snd')
			if (endpoint.sound) {
				assert.ok(soundNode, `${state}/${name}/${trigger}: a:snd child`)
				assert.equal(soundNode.getAttribute('name'), endpoint.sound.name, `${state}/${name}/${trigger}: sound name`)
				const soundRid = embedRelationshipId(soundNode)
				assert.ok(soundRid, `${state}/${name}/${trigger}: sound embed relationship`)
				const rel = relationshipMap.get(soundRid)
				assert.ok(rel, `${state}/${name}/${trigger}: audio relationship missing`)
				assert.equal(rel.Type, `${REL_TYPE}audio`, `${state}/${name}/${trigger}: audio relationship type`)
				usedActionRelationshipIds.add(soundRid)
				soundTargets.push(resolveRelationshipTarget('ppt/slides/slide1.xml', rel.Target))
			} else assert.equal(soundNode, null, `${state}/${name}/${trigger}: unexpected a:snd`)
		}
	}
	const home = carrierByName(slideDocument, 'home-action-button')
	const shape = home.parentNode?.parentNode
	assert.equal(elements(shape, 'prstGeom')[0]?.getAttribute('prst'), 'actionButtonHome', `${state}: action button geometry`)
	for (const rel of slideRels.filter(item => [`${REL_TYPE}hyperlink`, `${REL_TYPE}audio`].includes(item.Type))) {
		assert.ok(usedActionRelationshipIds.has(rel.Id), `${state}: stale action relationship ${rel.Id} (${rel.Type})`)
	}
	return { soundTargets, usedActionRelationshipIds: [...usedActionRelationshipIds] }
}

function assertCustomShows(presentationDocument, presentationRels, expected, state) {
	const rootChildren = children(presentationDocument.documentElement).map(item => item.localName)
	const list = directChild(presentationDocument.documentElement, 'custShowLst')
	if (!expected.length) {
		assert.equal(list, null, `${state}: custom-show list must be absent after clear/reset`)
		return
	}
	assert.ok(list, `${state}: p:custShowLst missing`)
	const notesIndex = rootChildren.indexOf('notesSz')
	const showIndex = rootChildren.indexOf('custShowLst')
	const defaultTextIndex = rootChildren.indexOf('defaultTextStyle')
	assert.ok(showIndex > notesIndex, `${state}: custShowLst must follow notesSz`)
	if (defaultTextIndex >= 0) assert.ok(showIndex < defaultTextIndex, `${state}: custShowLst must precede defaultTextStyle`)
	const relMap = new Map(presentationRels.map(item => [item.Id, item]))
	const shows = children(list).filter(item => item.localName === 'custShow')
	assert.equal(shows.length, expected.length, `${state}: custom-show count`)
	assert.equal(new Set(shows.map(item => item.getAttribute('id'))).size, shows.length, `${state}: unique custom-show ids`)
	assert.equal(new Set(shows.map(item => item.getAttribute('name').toLocaleLowerCase())).size, shows.length, `${state}: unique custom-show names`)
	for (const [index, show] of shows.entries()) {
		const wanted = expected[index]
		assert.equal(show.getAttribute('name'), wanted.name, `${state}: custom show ${index} name must decode exactly once`)
		assert.equal(show.getAttribute('id'), String(wanted.id), `${state}: custom show ${index} id`)
		const slideNodes = children(directChild(show, 'sldLst')).filter(item => item.localName === 'sld')
		assert.equal(slideNodes.length, wanted.slideIndexes.length, `${state}: custom show ${wanted.name} nonempty ordered slide list`)
		const targets = slideNodes.map(node => {
			const rel = relMap.get(relationshipId(node))
			assert.ok(rel, `${state}: custom show ${wanted.name} dangling presentation relationship`)
			assert.equal(rel.Type, `${REL_TYPE}slide`, `${state}: custom show ${wanted.name} relationship type`)
			return resolveRelationshipTarget('ppt/presentation.xml', rel.Target)
		})
		assert.deepEqual(targets, wanted.slideIndexes.map(indexValue => `ppt/slides/slide${indexValue + 1}.xml`), `${state}: custom show ${wanted.name} slide order`)
	}
}

async function inspectPackage(buffer, { state, actions = actionStates(state), shows = customShows(state), deletedNames = [] } = {}) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	const nameSet = new Set(names)
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${state}/${name}`))
	}
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const rels = relationshipRecords(document)
		assert.equal(new Set(rels.map(item => item.Id)).size, rels.length, `${state}/${name}: relationship IDs must be unique`)
		const source = sourcePartForRelationships(name)
		for (const rel of rels.filter(item => item.TargetMode !== 'External')) {
			const target = resolveRelationshipTarget(source, rel.Target)
			assert.ok(nameSet.has(target), `${state}/${name}: dangling relationship ${rel.Id} -> ${target}`)
		}
	}

	const contentTypes = documents.get('[Content_Types].xml')
	assert.ok(contentTypes, `${state}: [Content_Types].xml missing`)
	const defaults = new Map(elements(contentTypes, 'Default').map(node => [node.getAttribute('Extension').toLocaleLowerCase(), node.getAttribute('ContentType')]))
	const overrides = new Map(elements(contentTypes, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]))
	for (const [partName] of overrides) assert.ok(nameSet.has(partName), `${state}: content-type override targets missing part ${partName}`)
	for (const name of names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLocaleLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${state}: ${name} has no content type`)
	}

	const slideDocument = documents.get('ppt/slides/slide1.xml')
	const slideRels = relationshipRecords(documents.get(relationshipPartFor('ppt/slides/slide1.xml')))
	const actionRelationships = assertActionCarriers(slideDocument, slideRels, actions, state)
	const soundTargets = actionRelationships.soundTargets
	const presentationDocument = documents.get('ppt/presentation.xml')
	const presentationRels = relationshipRecords(documents.get(relationshipPartFor('ppt/presentation.xml')))
	assertCustomShows(presentationDocument, presentationRels, shows, state)

	const liveShowIds = new Set(shows.map(show => String(show.id)))
	for (const actionNode of [...elements(slideDocument, 'hlinkClick'), ...elements(slideDocument, 'hlinkHover'), ...elements(slideDocument, 'hlinkMouseOver')]) {
		const action = actionNode.getAttribute('action')
		if (!action.startsWith('ppaction://customshow?')) continue
		const match = action.match(/[?&]id=(\d+)(?:&|$)/)
		assert.ok(match && liveShowIds.has(match[1]), `${state}: custom-show action must resolve to a live show id`)
		assert.match(action, /[?&]return=true(?:&|$)/, `${state}: custom-show action must be show-and-return`)
	}

	const mediaParts = names.filter(name => name.startsWith('ppt/media/'))
	const relatedTargets = new Set()
	for (const [name, document] of documents) {
		if (!name.endsWith('.rels')) continue
		const source = sourcePartForRelationships(name)
		for (const rel of relationshipRecords(document).filter(item => item.TargetMode !== 'External')) relatedTargets.add(resolveRelationshipTarget(source, rel.Target))
	}
	for (const mediaPart of mediaParts) assert.ok(relatedTargets.has(mediaPart), `${state}: orphan media part ${mediaPart}`)
	for (const target of soundTargets) {
		assert.ok(nameSet.has(target), `${state}: action sound media target ${target}`)
		assert.equal(path.posix.extname(target).toLocaleLowerCase(), '.wav', `${state}: action sound must remain WAV`)
		const contentType = overrides.get(target) || defaults.get('wav')
		assert.ok(['audio/x-wav', 'audio/wav', 'audio/vnd.wave'].includes(contentType), `${state}: action sound content type ${contentType}`)
		assert.equal(sha256(await zip.file(target).async('nodebuffer')), WAV_HASH, `${state}: action sound payload hash`)
	}
	if (!soundTargets.length) assert.equal(mediaParts.filter(name => name.endsWith('.wav')).length, 0, `${state}: stale WAV media after reset/delete`)
	for (const deletedName of deletedNames) assert.equal(elements(slideDocument, 'cNvPr').some(node => node.getAttribute('name') === deletedName), false, `${state}: deleted carrier ${deletedName}`)
	return {
		state,
		partCount: names.length,
		relationshipParts: names.filter(name => name.endsWith('.rels')).length,
		mediaParts,
		soundTargets,
		actionRelationshipIds: actionRelationships.usedActionRelationshipIds,
		customShows: shows.map(show => ({ name: show.name, id: show.id, slideIndexes: show.slideIndexes })),
	}
}

function assertNoPrivateLeakage(spec) {
	const leaked = []
	const visit = (value, valuePath) => {
		if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${valuePath}[${index}]`))
		if (!value || typeof value !== 'object') return
		for (const [key, item] of Object.entries(value)) {
			const childPath = `${valuePath}.${key}`
			if (key.startsWith('_') || ['rawPackageParts', 'rawPresentationFonts', 'customShowId'].includes(key)) leaked.push(childPath)
			visit(item, childPath)
		}
	}
	visit(spec, 'spec')
	assert.deepEqual(leaked, [], `exported spec leaked private fields: ${leaked.join(', ')}`)
	const serialized = JSON.stringify(spec)
	assert.doesNotMatch(serialized, /(?:[A-Za-z]:\\|\/Users\/|\/home\/|node_modules|pptxgenjs)/i, 'exported spec leaked implementation or filesystem details')
}

function findBlock(spec, name) {
	const matches = spec.slides.flatMap(slide => slide.content || []).filter(block => {
		const actual = block?.name ?? block?.objectName ?? ''
		return actual === name || actual.endsWith(`.${name}`) || actual.includes(`.${name}.`)
	})
	assert.equal(matches.length, 1, `current-spec export expected one block for ${name}`)
	return matches[0]
}

function assertExportReadback(spec, runtime) {
	assertNoPrivateLeakage(spec)
	const expected = actionStatesForRuntime('reedited', runtime)
	for (const [name, actions] of Object.entries(expected)) {
		const block = findBlock(spec, name)
		const publicActions = structuredClone(actions)
		for (const endpoint of Object.values(publicActions || {})) if (endpoint && typeof endpoint === 'object') delete endpoint.customShowId
		assert.deepEqual(block.action, publicActions, `${name}: exported interactive action`)
	}
	assert.deepEqual(spec.customShows, customShows('reedited').map(show => ({
		name: show.name, id: show.id, slides: show.slideIndexes.map(index => spec.slides[index].id),
	})), 'exported semantic custom shows')
}

function portableSpec(spec) {
	return {
		...spec,
		nativePackagePreservation: false,
		slides: spec.slides.map(slide => {
			const { nativeTimingPreservation, ...portableSlide } = slide
			return {
				...portableSlide,
				content: (slide.content || []).filter(block => block.kind !== 'opaqueNative').map(block => {
					const { editHandle, nativePreservation, preservationHandle, ...semanticBlock } = block
					return semanticBlock
				}),
			}
		}),
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeArtifact(outputDir, state, buffer, artifacts) {
	const file = path.join(outputDir, `foundation-interactive-actions-${state}.pptx`)
	await fs.writeFile(file, buffer)
	artifacts[state] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	return file
}

export async function probeFoundationInteractiveActionsRuntime() {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addText('probe', {
		x: 1, y: 1, w: 2, h: 1, objectName: 'probe-object',
		interactiveActions: {
			click: { type: 'jump', jump: 'nextSlide', sound: sound('probe.wav') },
			hover: { type: 'endShow' },
		},
	})
	slide.addText([{ text: 'PROBE RUN', options: { interactiveActions: { hover: { type: 'jump', jump: 'nextSlide' } } } }], {
		x: 1, y: 2, w: 2, h: 1, objectName: 'probe-run',
	})
	const buffer = Buffer.from(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const document = parseXmlStrict(await zip.file('ppt/slides/slide1.xml').async('string'), 'runtime-probe/slide1.xml')
	const relDocument = parseXmlStrict(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'), 'runtime-probe/slide1.xml.rels')
	const carrier = carrierByName(document, 'probe-object')
	const click = directChild(carrier, 'hlinkClick')
	const hover = directChild(carrier, 'hlinkHover')
	const runNode = findTextRun(document, 'PROBE RUN')
	const result = {
		objectClick: click?.getAttribute('action') === 'ppaction://hlinkshowjump?jump=nextslide',
		objectHover: hover?.getAttribute('action') === 'ppaction://hlinkshowjump?jump=endshow',
		actionSound: Boolean(directChild(click, 'snd') && relationshipRecords(relDocument).some(rel => rel.Type === `${REL_TYPE}audio`)),
		runHover: Boolean(runNode && elements(runNode, 'hlinkMouseOver').length === 1),
	}
	return { ...result, ready: result.objectClick && result.objectHover && result.actionSound }
}

function normalizedOfficeSnapshot(snapshot) {
	const normalizedAction = action => ({
		...action,
		...(action?.Action === 7 ? {
			Address: decodeOfficeUrl(action.Address),
			SlideShowName: decodeOfficeUrl(action.SlideShowName),
		} : {}),
	})
	return {
		SlideCount: snapshot.SlideCount,
		Shapes: snapshot.Slides.flatMap(slide => slide.Shapes.map(shape => ({
			SlideIndex: slide.Index, Name: shape.Name, Type: shape.Type, AutoShapeType: shape.AutoShapeType,
			Click: normalizedAction(shape.Click), Hover: normalizedAction(shape.Hover),
			Runs: shape.Runs.map(runItem => ({ ...runItem, Click: normalizedAction(runItem.Click), Hover: normalizedAction(runItem.Hover) })),
		}))),
		NamedSlideShows: snapshot.NamedSlideShows,
	}
}

function decodeOfficeUrl(value) {
	try { return decodeURI(String(value || '')) } catch { return String(value || '') }
}

function assertOfficeSnapshot(snapshot, label) {
	assert.equal(snapshot.SlideCount, 3, `${label}: slide count`)
	const shapes = snapshot.Slides[0].Shapes
	const byName = new Map(shapes.map(shape => [shape.Name, shape]))
	for (const name of ACTION_OBJECT_NAMES) assert.ok(byName.has(name), `${label}: missing ${name}`)
	assert.equal(byName.get('url-click').Click.Action, 7, `${label}: URL click action enum`)
	assert.equal(decodeOfficeUrl(byName.get('url-click').Click.Address), URL_REEDITED, `${label}: URL address`)
	assert.equal(byName.get('url-click').Click.ScreenTip, TOOLTIP_REEDITED, `${label}: URL screen tip`)
	assert.equal(byName.get('hover-next').Hover.Action, 1, `${label}: hover next action enum`)
	assert.equal(byName.get('hover-next').Hover.ScreenTip, 'Hover next A&B <proof>', `${label}: hover screen tip`)
	assert.equal(byName.get('end-show').Click.Action, 6, `${label}: end-show action enum`)
	assert.equal(byName.get('custom-show-both').Click.Action, 10, `${label}: custom-show click enum`)
	assert.equal(byName.get('custom-show-both').Click.SlideShowName, SHOW_PRIMARY.name, `${label}: custom-show click name`)
	assert.equal(byName.get('custom-show-both').Click.ShowAndReturn, true, `${label}: custom-show click return`)
	assert.equal(byName.get('custom-show-both').Click.ScreenTip, 'Click primary', `${label}: custom-show click screen tip`)
	assert.equal(byName.get('custom-show-both').Hover.Action, 10, `${label}: custom-show hover enum`)
	assert.equal(byName.get('custom-show-both').Hover.SlideShowName, SHOW_SECONDARY.name, `${label}: custom-show hover name`)
	assert.equal(byName.get('custom-show-both').Hover.ShowAndReturn, true, `${label}: custom-show hover return`)
	assert.equal(byName.get('custom-show-both').Hover.ScreenTip, 'Hover secondary', `${label}: custom-show hover screen tip`)
	assert.equal(byName.get('sound-next').Click.Action, 1, `${label}: sound-next action enum`)
	assert.match(byName.get('sound-next').Click.SoundName, /action-reedited\.wav$/i, `${label}: sound name`)
	assert.equal(byName.get('sound-next').Click.ScreenTip, 'Sound next proof', `${label}: sound screen tip`)
	assert.equal(byName.get('home-action-button').Click.Action, 3, `${label}: home button first-slide enum`)
	assert.equal(byName.get('home-action-button').AutoShapeType, 126, `${label}: actionButtonHome AutoShapeType`)
	assert.equal(byName.get('home-action-button').Click.ScreenTip, 'Home proof', `${label}: home button screen tip`)
	assert.ok(byName.get('run-hover').Runs.some(runItem => runItem.Text.includes('RUN HOVER PROOF') && runItem.Hover.Action === 0), `${label}: run hover remains outside this unit`)
	const slideIds = snapshot.Slides.map(slide => slide.SlideID)
	assert.deepEqual(snapshot.NamedSlideShows, [
		{ Name: SHOW_PRIMARY.name, SlideIDs: [slideIds[1], slideIds[2]] },
		{ Name: SHOW_SECONDARY.name, SlideIDs: [slideIds[2], slideIds[1]] },
	], `${label}: named slide shows`)
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-foundation-interactive-actions-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
	], { cwd: workspaceRoot, maxBuffer: 30 * 1024 * 1024, timeout: 180000, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS')
	assert.equal(report.method, 'Presentations.Open2007')
	assert.equal(report.openAndRepair, false)
	assert.equal(report.saveCopyAs, true)
	assert.equal(report.reopened, true)
	assertOfficeSnapshot(report.source, 'PowerPoint source open')
	assertOfficeSnapshot(report.roundtrip, 'PowerPoint SaveCopyAs reopen')
	assert.deepEqual(normalizedOfficeSnapshot(report.roundtrip), normalizedOfficeSnapshot(report.source), 'PowerPoint semantic action snapshot changed after SaveCopyAs/reopen')
	return report
}

export async function runFoundationInteractiveActionsUnitProof({ outputDir, office = false, allowDependencyGate = false } = {}) {
	assert.equal(FOUNDATION_INTERACTIVE_ACTIONS_ROWS.length, 8)
	assert.equal(new Set(FOUNDATION_INTERACTIVE_ACTIONS_ROWS.map(([id]) => id)).size, 8)
	const runtime = await probeFoundationInteractiveActionsRuntime()
	const objectRuntimeReady = runtime.objectClick && runtime.objectHover && runtime.actionSound
	if (!objectRuntimeReady) {
		const result = {
			schemaVersion: 'betterpptx.foundation-interactive-actions-unit-proof.v1',
			unitId: FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID,
			status: 'FOUNDATION_INTERACTIVE_ACTIONS_RUNTIME_DEPENDENCY_GATED',
			runtime,
			requiredProductionHooks: [
				'object options.interactiveActions -> cNvPr a:hlinkClick/a:hlinkHover',
				'betterpptx.deck.set_custom_shows -> native presentation custom-show collection with replace/null-reset semantics',
				'update_shape interactiveActions lifecycle plus export_spec semantic readback',
			],
		}
		if (allowDependencyGate) return result
		const error = new Error('dist does not yet serialize the complete object/run Action Settings probe.')
		error.code = result.status
		error.details = result
		throw error
	}

	const resolvedOutput = outputDir || await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-foundation-interactive-actions-'))
	await fs.mkdir(resolvedOutput, { recursive: true })
	const blockers = []
	const { createMcpToolDispatcher, getDeck, handleDeleteShapesForTest, handleUpdateShapeForTest } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-interactive-actions-${Date.now()}`,
		clientInfo: { name: 'foundation-interactive-actions-package-verifier', version: '1' },
		blackBox: false, __skipDurableOperationLedger: true,
	})
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	try {
		const committed = unwrap('bootstrap commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: bootstrapSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(committed.deckId)
		const entry = getDeck(committed.deckId)
		clearBootstrap(entry.pptx)
		const slide = installAtlas(entry.pptx, actionStatesForRuntime('initial', runtime))
		setCustomShows(entry, 'initial')

		const writeState = async (state, expectation = {}) => {
			const buffer = await pptxBuffer(entry)
			const file = await writeArtifact(resolvedOutput, state, buffer, artifacts)
			lifecycle.push(await inspectPackage(buffer, { state, actions: actionStatesForRuntime(state, runtime), ...expectation }))
			return { buffer, file }
		}

		await writeState('initial')
		await setObjectActions(handleUpdateShapeForTest, committed.deckId, slide, 'updated', runtime)
		setCustomShows(entry, 'updated')
		await writeState('updated')
		await setObjectActions(handleUpdateShapeForTest, committed.deckId, slide, 'reset', runtime)
		setCustomShows(entry, 'reset')
		await writeState('reset')
		await setObjectActions(handleUpdateShapeForTest, committed.deckId, slide, 'reedited', runtime)
		setCustomShows(entry, 'reedited')
		const reedited = await writeState('reedited')

		const exported = unwrap('current-spec export', await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
		assertExportReadback(exported.spec, runtime)
		const exportedPath = path.join(resolvedOutput, 'foundation-interactive-actions-exported-spec.json')
		const portable = portableSpec(exported.spec)
		const portablePath = path.join(resolvedOutput, 'foundation-interactive-actions-portable-spec.json')
		await fs.writeFile(exportedPath, `${JSON.stringify(exported.spec, null, 2)}\n`, 'utf8')
		await fs.writeFile(portablePath, `${JSON.stringify(portable, null, 2)}\n`, 'utf8')
		artifacts.currentSpec = { file: relative(exportedPath), sha256: sha256(await fs.readFile(exportedPath)) }
		artifacts.portableSpec = { file: relative(portablePath), sha256: sha256(await fs.readFile(portablePath)) }

		const replay = unwrap('current-spec recompile', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: portable, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		deckIds.push(replay.deckId)
		const replayBuffer = await pptxBuffer(getDeck(replay.deckId))
		await writeArtifact(resolvedOutput, 'recompiled', replayBuffer, artifacts)
		lifecycle.push(await inspectPackage(replayBuffer, { state: 'recompiled', actions: actionStatesForRuntime('recompiled', runtime) }))

		let officeResult = { status: 'dependency-gated', reason: 'Set BETTERPPTX_FOUNDATION_INTERACTIVE_ACTIONS_OFFICE=1 or pass --office.' }
		if (office && blockers.length === 0) {
			const roundtripPath = path.join(resolvedOutput, 'foundation-interactive-actions-reedited-savecopyas.pptx')
			const officeReportPath = path.join(resolvedOutput, 'foundation-interactive-actions-office-com.json')
			officeResult = await runOfficeProof(reedited.file, roundtripPath, officeReportPath)
			const roundtripBuffer = await fs.readFile(roundtripPath)
			officeResult.package = await inspectPackage(roundtripBuffer, {
				state: 'powerpoint-roundtrip', actions: actionStatesForRuntime('powerpoint-roundtrip', runtime),
			})
			officeResult.roundtripFile = relative(roundtripPath)
			officeResult.roundtripSha256 = sha256(roundtripBuffer)
			officeResult.reportFile = relative(officeReportPath)
			artifacts.officeRoundtrip = { file: relative(roundtripPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		for (const name of ['url-click', 'custom-show-both', 'sound-next', 'run-hover']) {
			await handleDeleteShapesForTest({ deckId: committed.deckId, slideIndex: 0, target: { objectName: name } })
		}
		setCustomShows(entry, 'deleted')
		const deletedActions = actionStates('deleted')
		const deleted = await writeState('deleted', {
			actions: deletedActions, shows: [], deletedNames: ['url-click', 'custom-show-both', 'sound-next', 'run-hover'],
		})

		return {
			schemaVersion: 'betterpptx.foundation-interactive-actions-unit-proof.v1',
			unitId: FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID,
			status: blockers.length
				? 'FOUNDATION_INTERACTIVE_ACTIONS_PRODUCTION_BLOCKED'
				: officeResult.status === 'PASS'
				? 'FOUNDATION_INTERACTIVE_ACTIONS_PACKAGE_AND_OFFICE_VERIFIED'
				: 'FOUNDATION_INTERACTIVE_ACTIONS_PACKAGE_VERIFIED_OFFICE_GATED',
			generatedAt: new Date().toISOString(),
			rows: FOUNDATION_INTERACTIVE_ACTIONS_ROWS.map(([id, label]) => ({ id, label })),
			runtime,
			blockers,
			nonApplicableFutureLane: {
				runLevelMouseOver: 'Run options.hyperlink and a:rPr/a:hlinkMouseOver are outside this object Action Settings unit.',
				observedNativeSupport: runtime.runHover,
			},
			checks: {
				xmlParseAndOpcClosure: true,
				objectClickAndHoverCarriers: true,
				exactActionUrisAndUrlRelationships: true,
				actionSoundRelationshipMediaHashAndContentType: true,
				customShowTopologyOrderingAndSlideClosure: true,
				actionButtonGeometryIndependentOfAction: true,
				updateResetReeditDeleteCleanup: true,
				currentSpecExportRecompileAndPrivateLeakage: true,
				powerPointOpen2007SaveCopyAsReopen: officeResult.status === 'PASS',
			},
			lifecycle,
			office: officeResult,
			artifacts,
			deleted: { file: relative(deleted.file), sha256: sha256(deleted.buffer) },
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	if (process.argv.includes('--probe')) {
		const runtime = await probeFoundationInteractiveActionsRuntime()
		console.log(JSON.stringify({
			schemaVersion: 'betterpptx.foundation-interactive-actions-runtime-probe.v1',
			unitId: FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID,
			status: runtime.ready ? 'FOUNDATION_INTERACTIVE_ACTIONS_RUNTIME_READY' : 'FOUNDATION_INTERACTIVE_ACTIONS_RUNTIME_DEPENDENCY_GATED',
			runtime,
		}, null, 2))
		return
	}
	const configured = String(process.env.BETTERPPTX_FOUNDATION_INTERACTIVE_ACTIONS_OUTPUT || '').trim()
	const outputDir = configured ? path.resolve(configured) : await fs.mkdtemp(path.join(os.tmpdir(), `betterpptx-foundation-interactive-actions-${timestamp()}-`))
	await fs.mkdir(outputDir, { recursive: true })
	const office = process.argv.includes('--office') || ['1', 'true', 'yes'].includes(String(process.env.BETTERPPTX_FOUNDATION_INTERACTIVE_ACTIONS_OFFICE || '').trim().toLowerCase())
	const allowDependencyGate = process.argv.includes('--allow-dependency-gate')
	let result
	try {
		result = await runFoundationInteractiveActionsUnitProof({ outputDir, office, allowDependencyGate })
	} catch (error) {
		result = {
			schemaVersion: 'betterpptx.foundation-interactive-actions-unit-proof.v1',
			unitId: FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID,
			status: error.code || 'FOUNDATION_INTERACTIVE_ACTIONS_PROOF_FAILED',
			failure: { message: error.message, stack: error.stack, details: error.details || null },
		}
		const proofPath = path.join(outputDir, 'foundation-interactive-actions-unit-proof.json')
		await fs.writeFile(proofPath, `${JSON.stringify({ ...result, proofPath: relative(proofPath) }, null, 2)}\n`, 'utf8')
		console.error(JSON.stringify({ ...result, proofPath: relative(proofPath) }, null, 2))
		process.exitCode = 1
		return
	}
	const proofPath = path.join(outputDir, 'foundation-interactive-actions-unit-proof.json')
	const proof = { ...result, proofPath: relative(proofPath) }
	await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
	console.log(JSON.stringify(proof, null, 2))
}

if (path.resolve(process.argv[1] || '') === modulePath) await main()
