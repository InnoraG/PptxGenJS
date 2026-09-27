#!/usr/bin/env node

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'

const [
	{ TOOLS, canonicalToolName, codexSafeToolName, rewriteToolNamesForProfile },
	{ publicToolList },
	{ callBetterPptxTool },
] = await Promise.all([
	import('./tools.mjs'),
	import('./blackbox.mjs'),
	import('./engine.mjs'),
])

function fail(message, detail = {}) {
	console.error('CODEX TOOL NAME PROFILE VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

const canonicalTools = publicToolList(TOOLS, { toolNameProfile: 'canonical' })
const aliasTools = publicToolList(TOOLS, { toolNameProfile: 'codex' })
const dualTools = publicToolList(TOOLS, { toolNameProfile: 'both' })
const canonicalNames = canonicalTools.map(tool => tool.name)
const aliasNames = aliasTools.map(tool => tool.name)

if (!canonicalNames.includes('betterpptx.deck.new')) fail('Canonical public profile is missing betterpptx.deck.new.', { canonicalNames })
if (!aliasNames.includes('betterpptx_deck_new')) fail('Codex-safe profile is missing betterpptx_deck_new.', { aliasNames })
if (aliasNames.some(name => name.includes('.'))) fail('Codex-safe profile exposed dotted tool names.', { aliasNames: aliasNames.filter(name => name.includes('.')) })
if (aliasTools.length !== canonicalTools.length) fail('Codex-safe profile changed public tool count.', { canonical: canonicalTools.length, alias: aliasTools.length })
if (dualTools.length !== canonicalTools.length + aliasTools.length) fail('Dual profile did not advertise canonical and alias tools.', { canonical: canonicalTools.length, alias: aliasTools.length, dual: dualTools.length })

const forbiddenAliases = [
	'betterpptx.deck.open_existing',
	'betterpptx.io.read_file',
	'betterpptx.http.fetch',
].map(codexSafeToolName).filter(name => aliasNames.includes(name))
if (forbiddenAliases.length) fail('Codex-safe public profile exposed blocked tools.', { forbiddenAliases })
if (!aliasNames.includes('betterpptx_deck_generate_from_spec')) fail('Codex-safe profile is missing betterpptx_deck_generate_from_spec.', { aliasNames })

if (canonicalToolName('betterpptx_deck_new') !== 'betterpptx.deck.new') fail('Alias did not canonicalize to dotted tool name.')
if (canonicalToolName('betterpptx.deck.new') !== 'betterpptx.deck.new') fail('Canonical tool name was not preserved.')

const rewritten = rewriteToolNamesForProfile({
	next: { recommendedTool: 'betterpptx.deck.define_message_architecture' },
	message: 'Call betterpptx.slide.add after planning.',
}, 'codex')
if (rewritten.next.recommendedTool !== 'betterpptx_deck_define_message_architecture') fail('Result tool name rewrite missed recommendedTool.', rewritten)
if (!rewritten.message.includes('betterpptx_slide_add')) fail('Result tool name rewrite missed string guidance.', rewritten)

const context = { sessionId: `verify-codex-tool-profile-${Date.now()}`, clientInfo: { name: 'codex-tool-profile-verifier', version: '1' } }
const auth = okResult('alias auth.status', await callBetterPptxTool('betterpptx_auth_status', {}, context))
if (!auth.plan) fail('Alias auth.status did not return a plan.', auth)
const deck = okResult('alias deck.new', await callBetterPptxTool('betterpptx_deck_new', {
	title: 'Codex Alias Profile Verification',
}, context))
if (!deck.deckId) fail('Alias deck.new did not return deckId.', deck)
okResult('alias director_status', await callBetterPptxTool('betterpptx_deck_director_status', {
	deckId: deck.deckId,
}, context))

console.log('CODEX TOOL NAME PROFILE VERIFY: PASS')
console.log(JSON.stringify({
	canonicalToolCount: canonicalTools.length,
	aliasToolCount: aliasTools.length,
	sampleAliases: aliasNames.filter(name => [
		'betterpptx_auth_status',
		'betterpptx_help_capabilities',
		'betterpptx_deck_new',
		'betterpptx_deck_save',
		'betterpptx_slide_add_text',
	].includes(name)),
	deckId: deck.deckId,
}, null, 2))
