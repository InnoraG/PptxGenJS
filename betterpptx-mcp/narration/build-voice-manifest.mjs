// Build voices/manifest.json from the authoritative Piper voices.json + each
// voice's live MODEL_CARD. This is the seed data for the §4 license gate.
//
// It NEVER asserts a human "approved" status. It records what the live card
// says (verbatim + normalized) and a machine verdict. A human flips chosen
// candidates to reviewStatus:"approved" before production use.
//
//   node build-voice-manifest.mjs           # fetch (cached) + build
//   node build-voice-manifest.mjs --offline # build from cached cards only

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VOICES_DIR = path.join(__dirname, 'voices')
const CARDS_DIR = path.join(VOICES_DIR, 'modelcards')
const UPSTREAM = path.join(VOICES_DIR, 'voices.upstream.json')
const OUT = path.join(VOICES_DIR, 'manifest.json')
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
	const training = (text.split(/##\s*Training/i)[1] || '').trim().split('\n')[0] || ''
	const finetunedFrom = /finetuned from\s+(.+?)\.?$/i.exec(training)?.[1]?.trim() || null
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
	if (/cc[\s-]?by[\s-]?sa|licenses\/by-sa/.test(s)) return { license: 'CC-BY-SA-4.0', commercialUse: 'attribution', reason: 'ShareAlike binds model adaptations, not program output' }
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
const built = await mapLimit(entries, CONCURRENCY, async ([key, v]) => {
	const fileNames = Object.keys(v.files)
	const onnx = fileNames.find(f => f.endsWith('.onnx'))
	const cfg = fileNames.find(f => f.endsWith('.onnx.json'))
	const cardPath = fileNames.find(f => f.endsWith('MODEL_CARD'))
	const cardText = await fetchCard(key, cardPath)
	const card = parseCard(cardText)
	const cls = classify(card.rawLicense)
	const lineageReview = /lessac|blizzard/i.test(card.finetunedFrom || '')
	const reviewStatus = cls.commercialUse === 'forbidden' ? 'rejected'
		: cls.commercialUse === 'unknown' ? 'unreviewed' : 'candidate'
	const notes = [cls.reason, lineageReview ? 'finetuned from lessac (restricted Blizzard base) — counsel review of weight lineage' : '']
		.filter(Boolean).join('; ')
	return {
		id: key,
		name: v.name,
		language: v.language.family,
		locale: v.language.code,
		localeName: `${v.language.name_english}, ${v.language.country_english}`,
		quality: v.quality,
		numSpeakers: v.num_speakers,
		isDefaultForLocale: false,
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
		lineageReview,
		reviewStatus,
		verifiedFromModelCard: cardText != null,
		reviewedBy: 'automated:build-voice-manifest.mjs',
		notes,
	}
})

// Pick a recommended default per locale: most permissive, then best quality,
// then prefer a voice WITHOUT lessac lineage at the same tier.
const byLocale = {}
for (const v of built) (byLocale[v.locale] ||= []).push(v)
for (const [, list] of Object.entries(byLocale)) {
	const usable = list.filter(v => v.commercialUse === 'allowed' || v.commercialUse === 'attribution')
	if (!usable.length) continue
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

const manifest = {
	schemaVersion: 2,
	generatedAt: new Date().toISOString().slice(0, 10),
	source: 'https://huggingface.co/rhasspy/piper-voices (voices.json + per-voice MODEL_CARD)',
	policy: 'zero-cost voices whose license permits embedding the synthesized audio in a sold, closed-SaaS .pptx. CC0/MIT/permissive=allowed; CC-BY/CC-BY-SA=attribution; NC/research/GPL/unknown=not usable. See plan §4.5.',
	disclaimer: 'Machine-classified from the live MODEL_CARD. NOT legal advice and NOT human-approved. Flip chosen candidates to reviewStatus:"approved" after review. sha256 of each .onnx is computed when the model is downloaded into the image.',
	stats: {
		voices: built.length,
		locales: localesAll.length,
		localesWithUsableVoice: localesClear.length,
		byCommercialUse: byUse,
		mandatory: { fr: langHasClear('fr'), en: langHasClear('en') },
		localesWithoutUsableVoice: localesAll.filter(l => !localesClear.includes(l)),
	},
	voices: built.sort((a, b) => a.locale.localeCompare(b.locale) || a.id.localeCompare(b.id)),
}

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n')
process.stderr.write(`Wrote ${OUT}\n`)
process.stderr.write(`voices=${built.length} locales=${localesAll.length} usable-locales=${localesClear.length} fr=${manifest.stats.mandatory.fr} en=${manifest.stats.mandatory.en}\n`)
process.stderr.write(`byCommercialUse=${JSON.stringify(byUse)}\n`)
