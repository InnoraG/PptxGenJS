// BLACKBOX VOCABULARY FIREWALL (owner doctrine 2026-07-03: prevent reverse-engineering).
import zlib from 'node:zlib'
//
// The internal animation and transition vocabulary must NEVER appear as visible content
// text in a produced package — a distinctive token like "colorWave" or "flashOnce" sitting
// in a slide's body would expose the engine's private motion vocabulary to anyone who opens
// the deck. This module is the deterministic guard: at the package boundary we scrub those
// tokens out of visible text runs, and assert none remain.
//
// TWO KINDS of vocabulary, handled differently ON PURPOSE:
//   • DISTINCTIVE tokens (colorWave, flashOnce, arcUp, jumpAndTurn, growShrink, …) are coined
//     / camelCase / digit-bearing names that CANNOT occur in natural prose. They are exactly
//     the tokens that reveal the engine, and blanking them is always safe → FORBIDDEN.
//   • ENGLISH HOMOGRAPHS (fade, up, cover, morph, reveal, spin, box, wave, …) are identical
//     to everyday words. They appear in every English deck regardless of engine and reveal
//     nothing about ours, and blanking them would delete audience text ("Revenue is up" →
//     "Revenue is  "). They carry zero reverse-engineering signal, so they are NOT scrubbed.
//
// The distinctive set below is the complete engine-identifying vocabulary (animation effects,
// motion paths, emphasis effects, and transition presets that are coined/compound). It never
// touches the motion FIELDS of a spec (animation/timeline/transition), where the names
// legitimately live — only the visible text runs of the produced package. The format-mandated
// OOXML transition elements (<p:fade/>, <p159:morph/>) and numeric animation preset IDs are
// PowerPoint's own structural vocabulary, present in any deck, and are out of scope.

// Coined / compound / digit-bearing tokens (lowercased, matched case-insensitively). A token
// belongs here only if it cannot plausibly be a word in ordinary slide prose.
const DISTINCTIVE_TOKENS = [
	// motion paths + directional arcs
	'arcup', 'arcdown', 'arcleft', 'arcright',
	'turnright', 'turnup', 'turndown', 'turnupright',
	'diagonaldownright', 'diagonalupright',
	'spiralleft', 'spiralright', 'bounceleft', 'bounceright',
	'curvyleft', 'curvyright', 'curvystar', 'pointystar', 'curvedx', 'curvedsquare',
	'scurve1', 'scurve2', 'sinewave', 'decayingwave', 'wavepath',
	'squarepath', 'circlepath', 'diamondpath', 'pluspath',
	'crescentmoon', 'stairsdown', 'buzzsaw', 'loopdeloop', 'lightspeed',
	'figure8four', 'verticalfigure8', 'horizontalfigure8',
	'4pointstar', '5pointstar', '6pointstar', '8pointstar',
	'righttriangle', 'equaltriangle', 'invertedtriangle', 'invertedsquare',
	'centerrevolve',
	// emphasis / entrance / exit coined names
	'colorwave', 'colorblend', 'flashonce', 'boldflash', 'boldreveal',
	'growshrink', 'growandturn', 'growwithcolor', 'jumpandturn', 'verticalgrow',
	'fadedzoom', 'fadedswivel', 'floatin', 'floatout', 'floatinexit', 'floatoutentrance',
	'changefillcolor', 'changefontcolor', 'changefontsize', 'changefontstyle',
	'changelinecolor', 'changefont', 'complementarycolor', 'complementarycolor2',
	'contrastingcolor', 'objectcolor', 'brushcolor', 'brushonunderline',
	'styleemphasis', 'randombars', 'randomeffects', 'randombar', 'thinline',
	// transition presets that are coined/compound
	'peeloff', 'pagecurl', 'pagecurldouble', 'pagecurlsingle',
	'fallover', 'ferriswheel', 'flythrough',
]

// Deterministic, deduped, longest-first so an alternation blanks the whole compound (not a
// prefix). Frozen so the set is a stable contract.
export const DISTINCTIVE_MOTION_VOCABULARY = Object.freeze(
	[...new Set(DISTINCTIVE_TOKENS)].sort((a, b) => b.length - a.length),
)

// SCOPE (owner doctrine 2026-07-04): the ONLY protected asset is the animation/transition
// ID↔name MAPPING — the registry that pairs each effect NAME with its OOXML preset ID and the
// exact XML that realizes it (built + verified over time). A produced deck must carry the numeric
// preset IDs (the file format requires it), but an ID is worthless without our NAME for it, so the
// single defense is: our names never appear readable next to those IDs. The design TAXONOMY
// (world codenames, layout intents, regions, shape names) is DELIBERATELY NOT protected — it is
// not IP and its openness aids adoption (people referencing "the aurora world" is free marketing).
// So this firewall scrubs ONLY the motion vocabulary from content; nothing else.

function escapeForRegex(token) {
	return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// One case-insensitive, word-bounded alternation over the motion vocabulary.
const DISTINCTIVE_RE = new RegExp(
	`\\b(?:${DISTINCTIVE_MOTION_VOCABULARY.map(escapeForRegex).join('|')})\\b`,
	'gi',
)

// Blank every distinctive token in a plain string (replace with a space, tidy the result).
// Returns { text, hits } where hits are the tokens that were removed (lowercased).
export function scrubDistinctiveVocabulary(text) {
	const value = String(text ?? '')
	if (!value) return { text: value, hits: [] }
	const hits = []
	const scrubbed = value.replace(DISTINCTIVE_RE, m => { hits.push(m.toLowerCase()); return ' ' })
	if (!hits.length) return { text: value, hits }
	// Only tidy runs we actually changed, so legitimate spacing elsewhere is untouched.
	return { text: scrubbed.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1'), hits }
}

export function findDistinctiveVocabulary(text) {
	const value = String(text ?? '')
	if (!value) return []
	return [...new Set((value.match(DISTINCTIVE_RE) || []).map(m => m.toLowerCase()))]
}

// Parts of a produced package whose text runs are AUDIENCE-VISIBLE content (slides, speaker
// notes, SmartArt diagram text, chart text). The private edition sidecar, docProps metadata,
// and structural rels are deliberately NOT here — the rule is about visible content.
const CONTENT_PART_RE = /^ppt\/(slides\/slide\d+\.xml|notesSlides\/notesSlide\d+\.xml|diagrams\/data\d+\.xml|charts\/(chart|chartEx)\d+\.xml)$/
const TEXT_PACKAGE_PART_RE = /\.(?:xml|rels|json|txt|vml)$/i

// Visible-text carriers inside those parts: drawing text runs <a:t> and cached chart values <c:v>.
const VISIBLE_TEXT_RE = /(<a:t>)([\s\S]*?)(<\/a:t>)|(<c:v>)([\s\S]*?)(<\/c:v>)/g

export function isVisibleContentPart(partName) {
	return CONTENT_PART_RE.test(String(partName || ''))
}

// Scrub distinctive vocabulary from the visible text runs of one content part's XML.
// Returns { xml, hits, changed }. Structural markup is untouched — only run/value text.
export function scrubVisibleTextRunsXml(xml) {
	const hits = []
	let changed = false
	const out = String(xml ?? '').replace(VISIBLE_TEXT_RE, (match, aOpen, aInner, aClose, vOpen, vInner, vClose) => {
		const open = aOpen ?? vOpen
		const inner = aInner ?? vInner
		const close = aClose ?? vClose
		const res = scrubDistinctiveVocabulary(inner)
		if (!res.hits.length) return match
		changed = true
		hits.push(...res.hits)
		return `${open}${res.text}${close}`
	})
	return { xml: out, hits: [...new Set(hits)], changed }
}

// Find distinctive vocabulary in the visible text runs of one content part's XML (validator).
export function findVocabularyInVisibleTextXml(xml) {
	const hits = []
	let m
	VISIBLE_TEXT_RE.lastIndex = 0
	while ((m = VISIBLE_TEXT_RE.exec(String(xml ?? '')))) {
		const inner = m[2] ?? m[5]
		hits.push(...findDistinctiveVocabulary(inner))
	}
	return [...new Set(hits)]
}

// Scrub every visible content part of a loaded JSZip in place. Returns the aggregate hits.
export async function scrubProducedPackageVocabulary(zip) {
	const hitsByPart = {}
	for (const partName of Object.keys(zip.files)) {
		const file = zip.files[partName]
		if (file.dir || !isVisibleContentPart(partName)) continue
		const xml = await file.async('string')
		const { xml: scrubbed, hits, changed } = scrubVisibleTextRunsXml(xml)
		if (changed) {
			zip.file(partName, scrubbed)
			hitsByPart[partName] = hits
		}
	}
	return hitsByPart
}

// Public-delivery firewall for avatar worker diagnostics. These labels are useful in
// owner/development evidence, but are implementation details in a delivered deck. Keep
// this separate from the general tech-stack validator: authored owner-review decks may
// discuss the technologies locally, while public black-box saves must not expose them.
const PUBLIC_AVATAR_DIAGNOSTIC_REPLACEMENTS = Object.freeze([
	[/\bX-(?:Pipeline|Enhancement|RestoreFormer-(?:Seconds|Segments))\b/gi, 'internal processing header'],
	[/\b(?:provider[\s_-]*)?execution[\s_-]*id\b(?:\s*[:=]\s*[A-Za-z0-9._:/-]+)?/gi, 'internal processing reference'],
	[/\bliveportrait[-+ ]musetalk(?:[-+ ]commercial)?(?:[-+ ]restoreformer[-+ ]?pp)?\b/gi, 'avatar rendering service'],
	[/\bLivePortrait\b/gi, 'avatar animation service'],
	[/\bMuseTalk\b/gi, 'lip-sync service'],
	[/\bRestoreFormer\+\+/gi, 'avatar quality enhancement'],
])

export function scrubPublicAvatarDiagnosticsText(text) {
	let value = String(text ?? '')
	let hits = []
	for (const [pattern, replacement] of PUBLIC_AVATAR_DIAGNOSTIC_REPLACEMENTS) {
		const before = value
		value = value.replace(pattern, match => {
			hits.push(match.toLowerCase())
			return replacement
		})
		if (value === before) continue
	}
	return { text: value, hits: [...new Set(hits)] }
}

// Download names are part of the public delivery surface. If a caller supplies
// a basename that contains private avatar vocabulary, use a generic safe name
// rather than publishing a cosmetically scrubbed implementation label.
export function sanitizePublicArtifactName(name) {
	const raw = String(name ?? '')
	const result = scrubPublicAvatarDiagnosticsText(raw)
	if (!result.hits.length) return raw
	const extension = /\.(potx|thmx|pptm|pptx)$/i.exec(raw)?.[1]?.toLowerCase() || 'pptx'
	return `presentation.${extension}`
}

// Scrub avatar provider/enhancement diagnostics from audience-visible XML text.
// Structural relationships, media payloads, and private owner/development evidence are
// intentionally untouched. The caller enables this only at the public black-box boundary.
export async function scrubPublicAvatarDiagnostics(zip) {
	const hitsByPart = {}
	for (const partName of Object.keys(zip.files)) {
		const file = zip.files[partName]
		if (file.dir || !isVisibleContentPart(partName)) continue
		const xml = await file.async('string')
		const hits = []
		const scrubbed = xml.replace(VISIBLE_TEXT_RE, (match, aOpen, aInner, aClose, vOpen, vInner, vClose) => {
			const open = aOpen ?? vOpen
			const inner = aInner ?? vInner
			const close = aClose ?? vClose
			const result = scrubPublicAvatarDiagnosticsText(inner)
			if (!result.hits.length) return match
			hits.push(...result.hits)
			return `${open}${result.text}${close}`
		})
		if (hits.length) {
			zip.file(partName, scrubbed)
			hitsByPart[partName] = [...new Set(hits)]
		}
	}
	return hitsByPart
}

export async function validatePublicAvatarDiagnosticsFromZip(zip) {
	const issues = []
	const inspectedParts = []
	for (const partName of Object.keys(zip.files).sort()) {
		const file = zip.files[partName]
		if (file.dir || !TEXT_PACKAGE_PART_RE.test(partName)) continue
		inspectedParts.push(partName)
		const xml = await file.async('string')
		const scanTargets = []
		if (isVisibleContentPart(partName)) {
			xml.replace(VISIBLE_TEXT_RE, (match, _aOpen, aInner, _aClose, _vOpen, vInner) => {
			const result = scrubPublicAvatarDiagnosticsText(aInner ?? vInner)
			if (result.hits.length) scanTargets.push({ scope: 'visible content', hits: result.hits })
			return match
		})
		} else {
			const result = scrubPublicAvatarDiagnosticsText(xml)
			if (result.hits.length) scanTargets.push({ scope: 'package text', hits: result.hits })
			if (/betterpptx-edition\.xml$/i.test(partName)) {
				try {
					for (const payload of decodeEditionSidecarPayloads(xml)) {
						const decoded = scrubPublicAvatarDiagnosticsText(payload)
						if (decoded.hits.length) scanTargets.push({ scope: 'decoded sidecar payload', hits: decoded.hits })
					}
				} catch (err) {
					issues.push({
						code: 'PUBLIC_PACKAGE_AVATAR_SIDECAR_UNDECODABLE',
						part: partName,
						scope: 'decoded sidecar payload',
						message: `Edition sidecar payload could not be decoded for avatar-diagnostic scanning (${err?.message || err}).`,
					})
				}
			}
		}
		for (const target of scanTargets) for (const token of [...new Set(target.hits)]) {
			issues.push({
				code: 'PUBLIC_CONTENT_AVATAR_DIAGNOSTIC',
				part: partName,
				scope: target.scope,
				token,
				message: `Saved package ${target.scope} contains private avatar processing diagnostic "${token}".`,
			})
		}
	}
	return { ok: issues.length === 0, issueCount: issues.length, inspectedParts, issues }
}

// ── TECH-STACK / MODEL / PROVIDER VOCABULARY (owner rule #1, 2026-07-03) ─────────────
// The names of the engine's private tech stack — the ML models (Piper voices, LivePortrait,
// MuseTalk), the imaging engine (libvips), the GPU class (A10G), the packaging library — are
// the crown jewels of "how it's built" and must not leak from the engine's own metadata. They
// are enforced on ENGINE-CONTROLLED structural parts (rels / content-types / the encoded
// sidecar) — NOT on user content, so a deck that legitimately discusses these technologies is
// never blocked (see validateTechStackVocabularyFromZip; product integrity over anti-RE).
//
// Only NON-WORD, engine-identifying tokens are listed, so scanning every part is false-positive
// free — a deck about video editing may legitimately say "ffmpeg" or "sharp" in its content, so
// those genuinely-ambiguous words are deliberately EXCLUDED; the tokens here (ljspeech, libvips,
// liveportrait, musetalk, a10g, pptxgenjs, piper-tts) never occur in real prose. The Piper voice
// id FORMAT (xx_XX-name-quality) is matched structurally so every voice is covered without naming
// each one.
const TECH_STACK_PATTERNS = [
	{ code: 'TTS_VOICE_MODEL', label: 'TTS voice model name', re: /\b(?:ljspeech|thorsten)\b/i },
	{ code: 'TTS_VOICE_ID', label: 'TTS voice identifier', re: /\b[a-z]{2}_[A-Z]{2}-[a-z0-9]+-(?:x_low|low|medium|high)\b/ },
	{ code: 'TTS_ENGINE_NAME', label: 'TTS engine name', re: /\bpiper[-\s]?tts\b/i },
	{ code: 'AVATAR_MODEL_NAME', label: 'avatar model name', re: /\b(?:liveportrait|musetalk)\b/i },
	{ code: 'IMAGING_ENGINE_NAME', label: 'imaging engine name', re: /\blibvips\b/i },
	{ code: 'GPU_CLASS_NAME', label: 'GPU class name', re: /\b(?:a10g|l40s)\b/i },
	{ code: 'PACKAGING_LIBRARY_NAME', label: 'packaging library name', re: /\bpptxgenjs\b/i },
	// 3D/image GENERATION stack (G1, 2026-07-14). Anchored so ordinary prose can never match:
	// "trellis"/"flux"/"modal" are real words, so they are only flagged in unambiguous forms —
	// versioned/compound names, the legacy provider-bearing handle scheme, or as JSON provenance
	// field values (the decoded edition sidecar is JSON; these field shapes never occur in prose).
	{ code: 'MODEL3D_GENERATOR_NAME', label: '3D generator name', re: /\btrellis[-.]?2\b|\bunirig\b|gen:\/\/trellis\/|"(?:provider|generator)"\s*:\s*"trellis(?:-2)?"/i },
	{ code: 'IMAGE_GENERATOR_NAME', label: 'image generator name', re: /\bflux[-.]?[12]\b|\bflux[-\s]?schnell\b|\bflux[-.\s]?2[^\r\n]{0,24}\bklein\b|\bklein[-\s]?(?:4b|9b)\b|black-forest-labs|gen:\/\/flux\/|"(?:provider|generator)"\s*:\s*"flux(?:-schnell|-klein-4b)?"/i },
	{ code: 'GEN_HOST_NAME', label: 'generation host name', re: /\bhuggingface\b|\bworkers\s+ai\b|"host"\s*:\s*"(?:modal|cloudflare)"|"provider"\s*:\s*"modal"/i },
]

export function findTechStackInText(text) {
	const value = String(text ?? '')
	const hits = []
	if (!value) return hits
	for (const p of TECH_STACK_PATTERNS) {
		const m = value.match(p.re)
		if (m) hits.push({ code: p.code, label: p.label, sample: m[0] })
	}
	return hits
}

// PRODUCT INTEGRITY OVER ANTI-RE (owner doctrine 2026-07-04): a firewall must NEVER degrade a
// legitimate deck. Tech-stack names are enforced ONLY on ENGINE-CONTROLLED structural parts —
// relationship files, [Content_Types].xml, and the (encoded, opaque) edition sidecar — never on
// user content. So a deck that legitimately DISCUSSES these technologies ("we benchmark
// LivePortrait on A10G with libvips") saves perfectly: those tokens in a slide/notes/chart are
// the author's own words, not an engine leak, and are left untouched. A token in a structural
// part has no author explanation and is a genuine leak → enforced.
const ENGINE_CONTROLLED_PART_RE = /(?:\.rels$|^\[Content_Types\]\.xml$|betterpptx-edition\.xml$)/

// G1 (2026-07-14): encoding is NEVER a privacy boundary. The edition sidecar stores its payload
// as an opaque raw-deflate+base64 blob — scanning only the raw part text would let any vocabulary
// inside the blob "pass". So the scanner DECODES the blob and scans the inflated JSON too. Decode
// failures are surfaced as their own issue (a sidecar we cannot decode cannot be certified clean).
function decodeEditionSidecarPayloads(xmlText) {
	const decoded = []
	const re = /<betterpptxEdition\b([^>]*)>([\s\S]*?)<\/betterpptxEdition>/g
	let m
	while ((m = re.exec(String(xmlText || ''))) !== null) {
		const attrs = m[1] || ''
		const inner = (m[2] || '').trim()
		if (!/\benc="dfl\.b64"/.test(attrs) || !inner) continue
		decoded.push(zlib.inflateRawSync(Buffer.from(inner, 'base64')).toString('utf8'))
	}
	return decoded
}

// Assert no tech-stack vocabulary appears in any ENGINE-CONTROLLED structural part (validator).
export async function validateTechStackVocabularyFromZip(zip) {
	const issues = []
	const inspectedParts = []
	for (const partName of Object.keys(zip.files).sort()) {
		const file = zip.files[partName]
		if (file.dir || !ENGINE_CONTROLLED_PART_RE.test(partName)) continue
		inspectedParts.push(partName)
		const text = await file.async('string')
		const scanTargets = [{ scope: 'package part', text }]
		if (/betterpptx-edition\.xml$/.test(partName)) {
			try {
				for (const payload of decodeEditionSidecarPayloads(text)) scanTargets.push({ scope: 'decoded sidecar payload', text: payload })
			} catch (err) {
				issues.push({
					code: 'PUBLIC_PACKAGE_SIDECAR_UNDECODABLE',
					part: partName,
					scope: 'decoded sidecar payload',
					message: `Edition sidecar payload could not be decoded for scanning (${err?.message || err}) — an unscannable payload cannot be certified clean.`,
				})
			}
		}
		for (const target of scanTargets) {
			for (const hit of findTechStackInText(target.text)) {
				issues.push({
					code: `PUBLIC_PACKAGE_${hit.code}`,
					part: partName,
					scope: target.scope,
					sample: hit.sample,
					message: `Saved package ${target.scope} contains ${hit.label} ("${hit.sample}").`,
				})
			}
		}
	}
	return { ok: issues.length === 0, issueCount: issues.length, inspectedParts, issues }
}

// Assert no distinctive vocabulary remains in any visible content part (validator).
export async function validateContentVocabularyFromZip(zip) {
	const issues = []
	const inspectedParts = []
	for (const partName of Object.keys(zip.files).sort()) {
		const file = zip.files[partName]
		if (file.dir || !isVisibleContentPart(partName)) continue
		inspectedParts.push(partName)
		const hits = findVocabularyInVisibleTextXml(await file.async('string'))
		for (const token of hits) {
			issues.push({
				code: 'PUBLIC_CONTENT_MOTION_VOCABULARY',
				part: partName,
				scope: 'visible content',
				token,
				message: `Saved package visible content contains internal motion vocabulary "${token}".`,
			})
		}
	}
	return { ok: issues.length === 0, issueCount: issues.length, inspectedParts, issues }
}
