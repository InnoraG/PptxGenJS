// Build voices/manifest.json from the authoritative Piper voices.json + each
// voice's live MODEL_CARD. This is the seed data for the §4 license gate.
//
// It NEVER creates a human "approved" status. It records what the live card
// says (verbatim + normalized) and a machine verdict, while preserving an
// existing human approval only when the refreshed machine license verdict is
// still usable. A human flips chosen candidates to reviewStatus:"approved".
//
//   node build-voice-manifest.mjs           # fetch (cached) + build
//   node build-voice-manifest.mjs --offline # build from cached cards only

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enrichVoiceWithProfile, genderCoverage, loadVoiceProfiles } from './voiceProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VOICES_DIR = path.join(__dirname, 'voices')
const CARDS_DIR = path.join(VOICES_DIR, 'modelcards')
const UPSTREAM = path.join(VOICES_DIR, 'voices.upstream.json')
const OUT = path.join(VOICES_DIR, 'manifest.json')
const VOICE_PROFILES = loadVoiceProfiles()
const PRIOR_MANIFEST = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null
const PRIOR_BY_ID = new Map((PRIOR_MANIFEST?.voices || []).map(voice => [voice.id, voice]))
const BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
const OFFLINE = process.argv.includes('--offline')
const CONCURRENCY = 8

fs.mkdirSync(CARDS_DIR, { recursive: true })
const voices = JSON.parse(fs.readFileSync(UPSTREAM, 'utf8'))

async function fetchCard(key, cardPath) {
	const cacheFile = path.join(CARDS_DIR, key + '.MODEL_CARD')
	if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) return fs.readFileSync(cacheFile, 'utf8')
	if (OFFLINE) return null
	const res = await fetch(`${BASE}/${cardPath}`)
	if (!res.ok) { process.stderr.write(`WARN ${key}: HTTP ${res.status}\n`); return null }
	const text = await res.text()
	fs.writeFileSync(cacheFile, text)
	return text
}

function parseCard(text) {
	if (!text) return { rawLicense: '', datasetUrl: '', training: '', finetunedFrom: null }
	const rawLicense = (text.match(/License:\s*(.+)/i) || [])[1]?.trim() || ''
	const datasetUrl = (text.match(/Dataset[\s\S]*?URL:\s*(\S+)/i) || [])[1]?.trim() || ''
	const trainingSection = (text.split(/##\s*Training/i)[1] || '').trim()
	const training = trainingSection.split('\n')[0] || ''
	// The lineage line is not always first (e.g. "Trained by: …" then "Finetuned from …").
	const finetunedFrom = /fine-?tuned from\s+(.+?)\.?\s*$/im.exec(trainingSection)?.[1]?.trim() || null
	return { rawLicense, datasetUrl, training, finetunedFrom }
}

// Normalize the free-text License line into (spdx, commercialUse) for OUR use:
// "may the synthesized audio be embedded in and SOLD inside a closed-SaaS .pptx?"
// Normalize the free-text License line (which may be an SPDX tag, prose, or a
// raw creativecommons.org URL) into (spdx, commercialUse) for OUR specific test:
// "may the synthesized audio be embedded in and SOLD inside a closed-SaaS .pptx?"
function classify(raw) {
	const s = (raw || '').toLowerCase()
	if (!s) return { license: 'MISSING', commercialUse: 'unknown', reason: 'no License line in MODEL_CARD' }
	// NC (incl. by-nc / by-nc-sa / by-nc-nd, as text OR cc URL) must come first.
	if (/by[\s-]?nc|non[\s-]?commercial|\bnc\b/.test(s)) {
		const sub = /by[\s-]?nc[\s-]?sa/.test(s) ? 'CC-BY-NC-SA-4.0' : /by[\s-]?nc[\s-]?nd/.test(s) ? 'CC-BY-NC-ND-4.0' : 'CC-BY-NC-4.0'
		return { license: sub, commercialUse: 'forbidden', reason: 'non-commercial' }
	}
	// GPL/AGPL/LGPL on a *model* is copyleft on software — complex for embedded output; block pending counsel.
	if (/gpl/.test(s)) return { license: raw, commercialUse: 'forbidden', reason: 'copyleft software license on model — treat as not-usable pending counsel' }
	if (/cc0|public[\s-]?domain|unlicense/.test(s)) return { license: 'CC0-1.0', commercialUse: 'allowed' }
	// CC-BY-SA as text ("cc-by-sa") or URL ("licenses/by-sa/").
	if (/cc[\s-]?by[\s-]?sa|licenses\/by-sa|attribution[\s-]?sharealike/.test(s)) return { license: 'CC-BY-SA-4.0', commercialUse: 'attribution', reason: 'ShareAlike binds model adaptations, not program output' }
	// CC-BY as text ("cc by") or URL ("licenses/by/").
	if (/cc[\s-]?by|licenses\/by(?:[\s/-]|$)/.test(s)) return { license: 'CC-BY-4.0', commercialUse: 'attribution' }
	if (/\bmit\b/.test(s)) return { license: 'MIT', commercialUse: 'allowed' }
	if (/apache/.test(s)) return { license: 'Apache-2.0', commercialUse: 'allowed' }
	if (/\bbsd\b/.test(s)) return { license: 'BSD', commercialUse: 'allowed' }
	// "See URL", "See LICENSE file", Blizzard/lessac license page, etc. → must read source.
	return { license: raw, commercialUse: 'unknown', reason: 'license not machine-clear; read dataset URL' }
}

const RANK = { allowed: 0, attribution: 1, unknown: 2, forbidden: 3 }
const QUAL = { high: 0, medium: 1, low: 2, x_low: 3 }

async function mapLimit(items, limit, fn) {
	const out = []
	let i = 0
	const workers = Array.from({ length: limit }, async () => {
		while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
	})
	await Promise.all(workers)
	return out
}

const entries = Object.entries(voices)
const built = (await mapLimit(entries, CONCURRENCY, async ([key, v]) => {
	const fileNames = Object.keys(v.files)
	const onnx = fileNames.find(f => f.endsWith('.onnx'))
	const cfg = fileNames.find(f => f.endsWith('.onnx.json'))
	const cardPath = fileNames.find(f => f.endsWith('MODEL_CARD'))
	const cardText = await fetchCard(key, cardPath)
	const card = parseCard(cardText)
	const machineCls = classify(card.rawLicense)
	const priorReview = PRIOR_BY_ID.get(key)
	// A human licence-chain review that resolved a "See URL" card (e.g. the M-AILABS
	// licence read from the dataset page) outranks the machine verdict on the card text.
	const cls = priorReview?.licenseChain?.licenseResolved && machineCls.commercialUse === 'unknown'
		? { license: priorReview.license, commercialUse: priorReview.commercialUse }
		: machineCls
	// Fine-tuned weights inherit their base checkpoint's terms: lessac (Blizzard 2013,
	// research-only) and Ryan (RyanSpeech, CC-BY-NC-SA) are both non-commercial bases.
	const lineageReview = /lessac|blizzard|ryan/i.test(card.finetunedFrom || '')
	const machineReviewStatus = cls.commercialUse === 'forbidden' ? 'rejected'
		: cls.commercialUse === 'unknown' ? 'unreviewed' : 'candidate'
	const prior = PRIOR_BY_ID.get(key)
	const reviewStatus = prior?.reviewStatus === 'approved' && ['allowed', 'attribution'].includes(cls.commercialUse) ? 'approved' : machineReviewStatus
	const lineageNote = /ryan/i.test(card.finetunedFrom || '')
		? 'finetuned from Ryan (CC-BY-NC-SA base) — non-commercial weight lineage'
		: 'finetuned from lessac (restricted Blizzard base) — counsel review of weight lineage'
	const notes = [cls.reason, lineageReview ? lineageNote : '']
		.filter(Boolean).join('; ')
	return enrichVoiceWithProfile({
		id: key,
		name: v.name,
		language: v.language.family,
		locale: v.language.code,
		localeName: `${v.language.name_english}, ${v.language.country_english}`,
		quality: v.quality,
		numSpeakers: v.num_speakers,
		isDefaultForLocale: Boolean(prior?.isDefaultForLocale),
		modelUrl: onnx ? `${BASE}/${onnx}` : null,
		configUrl: cfg ? `${BASE}/${cfg}` : null,
		modelCardUrl: cardPath ? `${BASE}/${cardPath}` : null,
		modelMd5: onnx ? v.files[onnx].md5_digest : null,   // upstream integrity; sha256 computed when onnx is downloaded into the image
		configMd5: cfg ? v.files[cfg].md5_digest : null,
		rawLicense: card.rawLicense || null,
		license: cls.license,
		commercialUse: cls.commercialUse,
		datasetUrl: card.datasetUrl || null,
		finetunedFrom: card.finetunedFrom,
		// A reviewed chain can establish lineage the card's free text hides (e.g. "Base model: …").
		lineageReview: lineageReview || priorReview?.licenseChain?.verdict === 'lineage-encumbered',
		reviewStatus,
		verifiedFromModelCard: cardText != null,
		reviewedBy: reviewStatus === 'approved' ? (prior?.reviewedBy || 'human-approved') : 'automated:build-voice-manifest.mjs',
		...(reviewStatus === 'approved' && prior?.reviewedAt ? { reviewedAt: prior.reviewedAt } : {}),
		notes: reviewStatus === 'approved' && prior?.notes ? prior.notes : notes,
		// Human licence-chain review (model card + dataset + lineage) survives rebuilds.
		...(prior?.licenseChain ? { licenseChain: prior.licenseChain } : {}),
		...(prior?.attributionText ? { attributionText: prior.attributionText } : {}),
		...(prior?.isDefaultForLanguage ? { isDefaultForLanguage: true } : {}),
	}, VOICE_PROFILES)
}))

// Lineage is transitive: a fine-tune of a catalogue voice ("fa_IR Amir voice",
// "Spanish davefx voice", the cross-language "LibriTTS-R base model") inherits that voice's flag.
const namePattern = name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[_-]/g, '[\\s_-]?')}\\b`, 'i')
for (let changed = true; changed;) {
	changed = false
	for (const voice of built) {
		if (voice.lineageReview || !voice.finetunedFrom) continue
		const flagged = built.filter(candidate => candidate.lineageReview && namePattern(candidate.name).test(voice.finetunedFrom))
		const parent = flagged.find(candidate => candidate.language === voice.language) || flagged[0]
		if (!parent) continue
		voice.lineageReview = true
		if (voice.reviewStatus !== 'approved') voice.notes = [voice.notes, `finetuned from ${parent.id}, which carries a non-commercial weight lineage`].filter(Boolean).join('; ')
		changed = true
	}
}

// Pick a recommended default per locale: most permissive, then best quality,
// then prefer a voice WITHOUT lessac lineage at the same tier.
const byLocale = {}
for (const v of built) (byLocale[v.locale] ||= []).push(v)
for (const [, list] of Object.entries(byLocale)) {
	const usable = list.filter(v => v.commercialUse === 'allowed' || v.commercialUse === 'attribution')
	if (!usable.length) continue
	const preserved = usable.find(v => v.isDefaultForLocale && v.reviewStatus === 'approved') || usable.find(v => v.isDefaultForLocale)
	if (preserved) {
		for (const candidate of list) candidate.isDefaultForLocale = candidate.id === preserved.id
		continue
	}
	usable.sort((a, b) =>
		RANK[a.commercialUse] - RANK[b.commercialUse] ||
		(a.lineageReview ? 1 : 0) - (b.lineageReview ? 1 : 0) ||
		(QUAL[a.quality] ?? 9) - (QUAL[b.quality] ?? 9))
	usable[0].isDefaultForLocale = true
}

const localesAll = [...new Set(built.map(v => v.locale))].sort()
const localesClear = localesAll.filter(loc => byLocale[loc].some(v => v.isDefaultForLocale))
const byUse = built.reduce((m, v) => (m[v.commercialUse] = (m[v.commercialUse] || 0) + 1, m), {})
const langHasClear = fam => built.some(v => v.language === fam && v.isDefaultForLocale)
const genderPairs = genderCoverage(built, ['female', 'male'], VOICE_PROFILES)

const manifest = {
	...(PRIOR_MANIFEST || {}),
	schemaVersion: 2,
	generatedAt: new Date().toISOString().slice(0, 10),
	source: 'https://huggingface.co/rhasspy/piper-voices (voices.json + per-voice MODEL_CARD)',
	voiceProfiles: 'voices/voice-profiles.json',
	policy: 'zero-cost voices whose license permits embedding the synthesized audio in a sold, closed-SaaS .pptx. CC0/MIT/permissive=allowed; CC-BY/CC-BY-SA=attribution; NC/research/GPL/unknown=not usable. See plan §4.5.',
	disclaimer: 'Machine-classified from the live MODEL_CARD. NOT legal advice and NOT human-approved. Flip chosen candidates to reviewStatus:"approved" after review. sha256 of each .onnx is computed when the model is downloaded into the image.',
	stats: {
		voices: built.length,
		locales: localesAll.length,
		localesWithUsableVoice: localesClear.length,
		byCommercialUse: byUse,
		mandatory: { fr: langHasClear('fr'), en: langHasClear('en') },
		localesWithoutUsableVoice: localesAll.filter(l => !localesClear.includes(l)),
		genderPairCoverage: {
			requiredGenders: genderPairs.requiredGenders,
			localesWithPair: genderPairs.localesWithPair,
			localesMissingPair: genderPairs.localesMissingPair.map(row => ({ locale: row.locale, availableGenders: row.availableGenders, missingGenders: row.missingGenders })),
		},
	},
	voices: built.sort((a, b) => a.locale.localeCompare(b.locale) || a.id.localeCompare(b.id)),
}

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n')
process.stderr.write(`Wrote ${OUT}\n`)
process.stderr.write(`voices=${built.length} locales=${localesAll.length} usable-locales=${localesClear.length} fr=${manifest.stats.mandatory.fr} en=${manifest.stats.mandatory.en}\n`)
process.stderr.write(`byCommercialUse=${JSON.stringify(byUse)}\n`)
