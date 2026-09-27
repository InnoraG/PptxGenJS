// Smart native-timing remap engine (pure, deck-free, string-based).
//
// Implements plan `plans/betterpptx-timing-smart-remap-plan-2026-06-13.md` (v4):
//   §6  remapTimingXmlSpids   — token-preserving one-pass numeric-span rewrite
//   §4.1 decomposeTimingComponents — connected timing components over the reference graph
//   §4.4-4.5 matchTimingTargets / gateComponent — multi-signal matching + per-component safety gate
//   §4 planSlideRemap — orchestrator: decompose → match → gate → (remap | prune)
//
// Every function here is pure: it takes timing XML + plain descriptors and returns
// new XML + a report. It NEVER reads a deck, allocates ids, or touches serialization.
// The engine that calls it (engine.mjs) owns id finalization and supplies the
// already-frozen current-object spids.

export const TIMING_REMAP_ENGINE_VERSION = 'betterpptx.timing-remap.v1'

// Server-owned matching policy. Thresholds are NOT caller-settable (plan §7).
export const DEFAULT_REMAP_POLICY = Object.freeze({
	confidenceFloor: 0.8,
	// Geometry/text fingerprint matching is reserved at 0.6 but DISABLED in v1 (plan §4.4).
	allowGeometryMatch: false,
	signals: Object.freeze({ semanticId: 1.0, objectName: 0.95, roleKindOrdinal: 0.8, geometry: 0.6 }),
})

const EFFECT_NODE_TYPES = new Set(['clickEffect', 'withEffect', 'afterEffect'])
const SCAFFOLD_NODE_TYPES = new Set(['tmRoot', 'mainSeq'])

// ---------------------------------------------------------------------------
// §6  remapTimingXmlSpids — one-pass numeric-attribute-span reconstruction
// ---------------------------------------------------------------------------

// Matches `spid = "123"` / `spid='123'` tolerating whitespace around `=`,
// capturing the numeric value span so only that span is rewritten.
const SPID_ATTR_RE = /\bspid\s*=\s*(["'])(\d+)\1/g

/**
 * Rewrite spid attribute values in timing XML using `spidMap` (oldSpid -> newSpid).
 * Collision-safe for swaps (5↔7) because every replacement value is read from the
 * ORIGINAL string and the result is reconstructed once. Only the numeric value span
 * of each spid attribute changes; quoting, whitespace and all other bytes are identical.
 * Throws if a destination id is not a positive integer (never writes a non-numeric spid).
 *
 * @param {string} xml
 * @param {Record<string,string|number>} spidMap
 * @returns {{ xml: string, rewrites: number }}
 */
export function remapTimingXmlSpids(xml, spidMap = {}) {
	const src = String(xml || '')
	if (!src || !spidMap || typeof spidMap !== 'object') return { xml: src, rewrites: 0 }
	const normalized = new Map()
	for (const [from, to] of Object.entries(spidMap)) {
		if (to === undefined || to === null) continue
		const toStr = String(to)
		if (!/^\d+$/.test(toStr)) {
			throw new Error(`remapTimingXmlSpids: destination spid for ${from} must be a positive integer, got ${JSON.stringify(to)}`)
		}
		normalized.set(String(from), toStr)
	}
	if (!normalized.size) return { xml: src, rewrites: 0 }

	let out = ''
	let cursor = 0
	let rewrites = 0
	SPID_ATTR_RE.lastIndex = 0
	let m
	while ((m = SPID_ATTR_RE.exec(src)) !== null) {
		const oldVal = m[2]
		const replacement = normalized.get(oldVal)
		if (replacement === undefined || replacement === oldVal) continue
		// Offsets of just the numeric value within the match.
		const valueStart = m.index + m[0].length - m[1].length - oldVal.length
		const valueEnd = valueStart + oldVal.length
		out += src.slice(cursor, valueStart) + replacement
		cursor = valueEnd
		rewrites++
	}
	out += src.slice(cursor)
	return { xml: out, rewrites }
}

// ---------------------------------------------------------------------------
// Lightweight XML tree (timing subset: no CDATA, simple attributes)
// ---------------------------------------------------------------------------

const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function parseAttrs(attrText) {
	const attrs = {}
	if (!attrText) return attrs
	ATTR_RE.lastIndex = 0
	let a
	while ((a = ATTR_RE.exec(attrText)) !== null) {
		attrs[a[1]] = a[2] !== undefined ? a[2] : a[3]
	}
	return attrs
}

/**
 * Parse an XML fragment into a node tree.
 * Node: { tag, attrs, start, end, openEnd, children[], parent }
 * `start`/`end` are byte offsets of the full element in the source string.
 */
function parseXmlTree(xml) {
	const src = String(xml || '')
	const root = { tag: '#root', attrs: {}, start: 0, end: src.length, openEnd: 0, children: [], parent: null }
	const stack = [root]
	TAG_RE.lastIndex = 0
	let m
	while ((m = TAG_RE.exec(src)) !== null) {
		const [full, closing, tag, attrText, selfClose] = m
		const top = stack[stack.length - 1]
		if (closing) {
			// Close the nearest matching open node.
			for (let i = stack.length - 1; i >= 1; i--) {
				if (stack[i].tag === tag) {
					stack[i].end = m.index + full.length
					stack.length = i
					break
				}
			}
		} else if (selfClose) {
			top.children.push({ tag, attrs: parseAttrs(attrText), start: m.index, end: m.index + full.length, openEnd: m.index + full.length, children: [], parent: top })
		} else {
			const node = { tag, attrs: parseAttrs(attrText), start: m.index, end: -1, openEnd: m.index + full.length, children: [], parent: top }
			top.children.push(node)
			stack.push(node)
		}
	}
	// Any unclosed nodes end at string end.
	for (const node of stack) if (node.end < 0) node.end = src.length
	return { src, root }
}

function* walk(node) {
	yield node
	for (const child of node.children) yield* walk(child)
}

function localName(tag) {
	const i = tag.indexOf(':')
	return i >= 0 ? tag.slice(i + 1) : tag
}

// Union-find for component merging.
function makeUF() {
	const parent = new Map()
	const find = x => {
		if (!parent.has(x)) parent.set(x, x)
		let r = x
		while (parent.get(r) !== r) r = parent.get(r)
		while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n }
		return r
	}
	const union = (a, b) => { parent.set(find(a), find(b)) }
	return { find, union, parent }
}

// ---------------------------------------------------------------------------
// §4.1 decomposeTimingComponents
// ---------------------------------------------------------------------------

/**
 * Decompose a `p:timing` (or any wrapper containing it) into connected timing
 * components. Edges: shared shape target spid, build-list grpId binding, and
 * tn@val → cTn@id interactive cross-references. The tmRoot/mainSeq scaffold is
 * NOT treated as a connecting edge (plan §4.1), so independent effects stay
 * independent components.
 *
 * @returns {{
 *   components: Array<{ id, seedCTnIds:string[], spids:string[], cTnIds:string[], tnRefs:string[], rootRanges:Array<{start,end}> }>,
 *   spidToComponents: Record<string,string[]>,
 *   cTnIdToComponent: Record<string,string>,
 *   scaffoldCTnIds: string[],
 *   allSpids: string[],
 * }}
 */
export function decomposeTimingComponents(xml) {
	const { root } = parseXmlTree(xml)
	const nodes = [...walk(root)]

	// Index cTn ids and identify scaffold + effect seeds.
	const cTnById = new Map()
	const scaffoldCTnIds = []
	const seeds = [] // effect-root cTn nodes
	for (const node of nodes) {
		if (localName(node.tag) !== 'cTn') continue
		const id = node.attrs.id
		if (id !== undefined) cTnById.set(String(id), node)
		const nodeType = node.attrs.nodeType
		if (nodeType && SCAFFOLD_NODE_TYPES.has(nodeType)) scaffoldCTnIds.push(String(id))
		else if (nodeType && EFFECT_NODE_TYPES.has(nodeType)) seeds.push(node)
	}

	// Fallback when a deck uses no explicit effect nodeTypes: treat each cTn that
	// directly targets a shape and is not scaffold as its own seed.
	if (!seeds.length) {
		for (const node of nodes) {
			if (localName(node.tag) !== 'cTn') continue
			if (node.attrs.nodeType && SCAFFOLD_NODE_TYPES.has(node.attrs.nodeType)) continue
			const hasTarget = [...walk(node)].some(n => localName(n.tag) === 'spTgt' && n.attrs.spid !== undefined)
			if (hasTarget) seeds.push(node)
		}
	}

	const subtreeFacts = node => {
		const spids = new Set()
		const cTnIds = new Set()
		const tnRefs = new Set()
		for (const n of walk(node)) {
			const ln = localName(n.tag)
			if (ln === 'spTgt' && n.attrs.spid !== undefined) spids.add(String(n.attrs.spid))
			else if (ln === 'cTn' && n.attrs.id !== undefined) cTnIds.add(String(n.attrs.id))
			else if (ln === 'tn' && n.attrs.val !== undefined) tnRefs.add(String(n.attrs.val))
		}
		return { spids, cTnIds, tnRefs }
	}

	const seedInfos = seeds.map((node, i) => {
		const id = `c${i}`
		const facts = subtreeFacts(node)
		return { id, node, ...facts }
	})

	const uf = makeUF()
	seedInfos.forEach(s => uf.find(s.id))

	// Union seeds sharing a shape target spid.
	const spidToSeeds = new Map()
	for (const s of seedInfos) {
		for (const spid of s.spids) {
			if (!spidToSeeds.has(spid)) spidToSeeds.set(spid, [])
			spidToSeeds.get(spid).push(s.id)
		}
	}
	for (const ids of spidToSeeds.values()) {
		for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i])
	}

	// Union via interactive cross-reference: a seed's tn@val pointing at a cTn id
	// owned by another seed links the two effects.
	const cTnIdToSeed = new Map()
	for (const s of seedInfos) for (const cid of s.cTnIds) cTnIdToSeed.set(cid, s.id)
	for (const s of seedInfos) {
		for (const ref of s.tnRefs) {
			const owner = cTnIdToSeed.get(ref)
			if (owner && owner !== s.id) uf.union(s.id, owner)
		}
	}

	// Collapse seeds into components.
	const byRoot = new Map()
	for (const s of seedInfos) {
		const r = uf.find(s.id)
		if (!byRoot.has(r)) byRoot.set(r, { id: r, seeds: [], spids: new Set(), cTnIds: new Set(), tnRefs: new Set(), rootRanges: [] })
		const comp = byRoot.get(r)
		comp.seeds.push(s)
		s.spids.forEach(v => comp.spids.add(v))
		s.cTnIds.forEach(v => comp.cTnIds.add(v))
		s.tnRefs.forEach(v => comp.tnRefs.add(v))
		comp.rootRanges.push({ start: s.node.start, end: s.node.end })
	}

	const components = [...byRoot.values()].map((comp, i) => ({
		id: `comp${i}`,
		seedCTnIds: comp.seeds.map(s => s.node.attrs.id).filter(v => v !== undefined).map(String),
		spids: [...comp.spids],
		cTnIds: [...comp.cTnIds],
		tnRefs: [...comp.tnRefs],
		// rootRanges are the top-level effect element ranges (the enclosing p:par/p:seq if present).
		rootRanges: comp.rootRanges.map(r => enclosingEffectRange(xml, r) || r),
	}))

	const spidToComponents = {}
	const cTnIdToComponent = {}
	const allSpids = new Set()
	for (const comp of components) {
		for (const spid of comp.spids) {
			allSpids.add(spid)
			;(spidToComponents[spid] ||= []).push(comp.id)
		}
		for (const cid of comp.cTnIds) cTnIdToComponent[cid] = comp.id
	}

	return {
		components,
		spidToComponents,
		cTnIdToComponent,
		scaffoldCTnIds,
		allSpids: [...allSpids],
	}
}

// Find the enclosing <p:par> or <p:seq> element range for an effect cTn range,
// so pruning removes the whole effect node, not just its inner cTn.
function enclosingEffectRange(xml, innerRange) {
	const { root } = parseXmlTree(xml)
	let best = null
	for (const node of walk(root)) {
		const ln = localName(node.tag)
		if ((ln === 'par' || ln === 'seq') && node.start <= innerRange.start && node.end >= innerRange.end) {
			if (!best || (node.start >= best.start && node.end <= best.end)) best = { start: node.start, end: node.end }
		}
	}
	return best
}

// ---------------------------------------------------------------------------
// §4.4-4.5 matchTimingTargets + gateComponent
// ---------------------------------------------------------------------------

/**
 * For each source target (spid -> source identity from the manifest), find the
 * best current object using ordered signals. Returns per-target candidate match
 * with confidence + signal. Does NOT apply the per-component gate (see gateComponent).
 *
 * @param {Array<{spid:string, semanticId?:string, objectName?:string, role?:string, kind?:string}>} sourceTargets
 * @param {Array<{semanticId?:string, objectName?:string, role?:string, kind?:string, ordinal?:number, emittedSpid:string|number}>} currentObjects
 * @param {object} policy
 * @returns {{ matches: Record<string,{newSpid:string,confidence:number,signal:string,kind?:string}>, unmatched: string[] }}
 */
export function matchTimingTargets(sourceTargets = [], currentObjects = [], policy = DEFAULT_REMAP_POLICY) {
	const pol = { ...DEFAULT_REMAP_POLICY, ...policy, signals: { ...DEFAULT_REMAP_POLICY.signals, ...(policy?.signals || {}) } }
	const matches = {}
	const unmatched = []

	const bySemanticId = new Map()
	const byObjectName = new Map()
	const byRoleKind = new Map()
	for (const obj of currentObjects) {
		if (obj.semanticId != null) pushMap(bySemanticId, String(obj.semanticId), obj)
		if (obj.objectName != null) pushMap(byObjectName, String(obj.objectName), obj)
		if (obj.role != null && obj.kind != null) pushMap(byRoleKind, `${obj.role}::${obj.kind}`, obj)
	}

	for (const tgt of sourceTargets) {
		const oldSpid = String(tgt.spid)
		let chosen = null

		// Signal 1: immutable semanticId (unique).
		if (tgt.semanticId != null) {
			const c = bySemanticId.get(String(tgt.semanticId))
			if (c && c.length === 1) chosen = { obj: c[0], confidence: pol.signals.semanticId, signal: 'semanticId' }
		}
		// Signal 2: unique objectName.
		if (!chosen && tgt.objectName != null) {
			const c = byObjectName.get(String(tgt.objectName))
			if (c && c.length === 1) chosen = { obj: c[0], confidence: pol.signals.objectName, signal: 'objectName' }
		}
		// Signal 3: role+kind+ordinal.
		if (!chosen && tgt.role != null && tgt.kind != null) {
			const c = byRoleKind.get(`${tgt.role}::${tgt.kind}`)
			if (c && c.length) {
				const byOrdinal = c.filter(o => tgt.ordinal != null && Number(o.ordinal) === Number(tgt.ordinal))
				const pick = byOrdinal.length === 1 ? byOrdinal[0] : (c.length === 1 ? c[0] : null)
				if (pick) chosen = { obj: pick, confidence: pol.signals.roleKindOrdinal, signal: 'roleKindOrdinal' }
			}
		}
		// Signal 4: geometry/text fingerprint — DISABLED in v1.
		// (intentionally not implemented; reserved confidence pol.signals.geometry)

		if (chosen && chosen.confidence >= pol.confidenceFloor) {
			// Kind compatibility: never retarget across incompatible kinds.
			if (tgt.kind != null && chosen.obj.kind != null && !kindsCompatible(tgt.kind, chosen.obj.kind)) {
				unmatched.push(oldSpid)
				continue
			}
			matches[oldSpid] = {
				newSpid: String(chosen.obj.emittedSpid),
				confidence: chosen.confidence,
				signal: chosen.signal,
				kind: chosen.obj.kind,
				objectName: chosen.obj.objectName,
			}
		} else {
			unmatched.push(oldSpid)
		}
	}
	return { matches, unmatched }
}

function pushMap(map, key, value) {
	if (!map.has(key)) map.set(key, [])
	map.get(key).push(value)
}

function kindsCompatible(a, b) {
	if (a === b) return true
	// Text-bearing kinds are interchangeable as animation targets; media/picture/model are not.
	const textual = new Set(['text', 'textBox', 'textShape', 'title', 'body', 'shape'])
	return textual.has(a) && textual.has(b)
}

/**
 * Per-component safety gate (plan §4.5). A component is REMAPPED only if every one
 * of its source spids matched exactly one current object (injective, no collision),
 * kinds compatible, confidence ≥ floor. Otherwise the whole component is PRUNED.
 * Source spids that already resolve to a live object unchanged need no rewrite.
 *
 * @returns {{ decision:'preserve'|'remap'|'prune', spidMap:Record<string,string>, reasons:string[] }}
 */
export function gateComponent(component, matches, liveSpids = new Set(), policy = DEFAULT_REMAP_POLICY) {
	const reasons = []
	const spidMap = {}
	const live = liveSpids instanceof Set ? liveSpids : new Set([...(liveSpids || [])].map(String))

	let needsRewrite = false
	const usedTargets = new Set()
	for (const spid of component.spids) {
		const old = String(spid)
		if (live.has(old)) {
			// Stable target — preserve as-is.
			continue
		}
		const match = matches[old]
		if (!match) {
			reasons.push(`unmatched:${old}`)
			return { decision: 'prune', spidMap: {}, reasons }
		}
		if (usedTargets.has(match.newSpid)) {
			reasons.push(`collision:${match.newSpid}`)
			return { decision: 'prune', spidMap: {}, reasons }
		}
		usedTargets.add(match.newSpid)
		spidMap[old] = match.newSpid
		needsRewrite = true
	}
	return { decision: needsRewrite ? 'remap' : 'preserve', spidMap, reasons }
}

// ---------------------------------------------------------------------------
// §4 planSlideRemap — orchestrator
// ---------------------------------------------------------------------------

/**
 * Plan and apply smart remap for one slide's preserved timing XML.
 *
 * @param {object} args
 * @param {string} args.timingXml          preserved native p:timing XML
 * @param {Record<string,object>} args.manifestTargets  importSpid -> {semanticId,objectName,role,kind,ordinal}
 * @param {Array<object>} args.currentObjects           current objects with emittedSpid (post id-finalization)
 * @param {object} [args.policy]
 * @returns {{ xml: string|null, report: object }}
 */
export function planSlideRemap({ timingXml, manifestTargets = {}, currentObjects = [], policy = DEFAULT_REMAP_POLICY } = {}) {
	const src = String(timingXml || '')
	const report = { engine: TIMING_REMAP_ENGINE_VERSION, remapped: [], preservedComponents: 0, prunedComponents: [], stale: [] }
	if (!src.trim()) return { xml: src || null, report }

	const decomposition = decomposeTimingComponents(src)
	const liveSpids = new Set(currentObjects.map(o => String(o.emittedSpid)))

	// Build source-target identities per spid from the manifest.
	const sourceTargetsBySpid = {}
	for (const spid of decomposition.allSpids) {
		const ident = manifestTargets[spid] || manifestTargets[String(spid)] || {}
		sourceTargetsBySpid[spid] = { spid: String(spid), ...ident }
	}
	const { matches } = matchTimingTargets(Object.values(sourceTargetsBySpid), currentObjects, policy)

	const globalSpidMap = {}
	const pruneRanges = []
	for (const comp of decomposition.components) {
		const gate = gateComponent(comp, matches, liveSpids, policy)
		if (gate.decision === 'preserve') {
			report.preservedComponents++
		} else if (gate.decision === 'remap') {
			Object.assign(globalSpidMap, gate.spidMap)
			for (const [from, to] of Object.entries(gate.spidMap)) {
				report.remapped.push({ from, to, objectName: matches[from]?.objectName, confidence: matches[from]?.confidence, signal: matches[from]?.signal })
			}
		} else {
			report.prunedComponents.push({ component: comp.id, spids: comp.spids })
			for (const spid of comp.spids) {
				if (!liveSpids.has(String(spid))) {
					const ident = sourceTargetsBySpid[spid] || {}
					report.stale.push({ objectName: ident.objectName, role: ident.role, sourceSpid: String(spid) })
				}
			}
			comp.rootRanges.forEach(r => pruneRanges.push(r))
		}
	}

	// Apply: prune removed components first (descending offset so ranges stay valid), then rewrite spids.
	let xml = src
	if (pruneRanges.length) {
		const sorted = [...pruneRanges].sort((a, b) => b.start - a.start)
		for (const r of sorted) xml = xml.slice(0, r.start) + xml.slice(r.end)
		xml = pruneOrphanBuildEntries(xml)
	}
	if (Object.keys(globalSpidMap).length) {
		xml = remapTimingXmlSpids(xml, globalSpidMap).xml
	}

	// If nothing meaningful remains targeting a live shape, signal empty timing.
	const remaining = decomposeTimingComponents(xml)
	const hasLiveTarget = remaining.allSpids.some(s => liveSpids.has(String(s)))
	return { xml: hasLiveTarget ? xml : null, report }
}

// Remove <p:bldP> entries whose spid no longer appears as an animation target,
// then drop an empty <p:bldLst>. Conservative: only touches build entries.
function pruneOrphanBuildEntries(xml) {
	const { root } = parseXmlTree(xml)
	const targetSpids = new Set()
	for (const n of walk(root)) {
		if (localName(n.tag) === 'spTgt' && n.attrs.spid !== undefined) targetSpids.add(String(n.attrs.spid))
	}
	const ranges = []
	for (const n of walk(root)) {
		if (localName(n.tag) === 'bldP' && n.attrs.spid !== undefined && !targetSpids.has(String(n.attrs.spid))) {
			ranges.push({ start: n.start, end: n.end })
		}
	}
	let out = xml
	for (const r of ranges.sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + out.slice(r.end)
	// Drop now-empty <p:bldLst></p:bldLst> (and self-closing variants).
	out = out.replace(/<p:bldLst>\s*<\/p:bldLst>/g, '').replace(/<p:bldLst\s*\/>/g, '')
	return out
}
