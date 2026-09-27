// ir/synergy-compiler.mjs — Synergy Engine S3: the Timeline Compiler (M4: the authoring surface).
// ─────────────────────────────────────────────────────────────────────────────
// The AI authors INTERACTIONS, not geometry:
//
//   spec.presenters: { cast: [{ id:'joe', model:'gen://…' }, …] }
//   slides[].interactions: [ { actor:'joe', verb:'touch'|'point-at'|'press'|'push'|'carry'|'knock-over',
//                              target:'kpiCard' (an objectName on the same slide), hand?, distIn?, startMs? } ]
//
// This pass lowers each interaction to solved geometry + native animations:
//   • contact verbs (touch/point-at/press) → solveBestEmpirical placement + a paired emphasis on the target
//     at the REAL rendered contact time;
//   • push / knock-over → an impulse hand moment; the target flies along the MEASURED hand-velocity vector
//     (or teeters and falls), launched at the measured instant;
//   • carry → the presenter's hand comes to the target; the target rides the hand's RENDERED path
//     (multi-point custom pathData) from grab plateau to drop plateau.
// Everything requires the actor's EMPIRICAL clip-timeline manifest (rendered truth; produced by the
// calibration probe today, by the Baker at bake time going forward) carried in the gen cache like
// clipMap/contacts. No manifest → the interaction is skipped with an INTERACTION_NO_TIMELINES verdict
// (never guess timing).
// ─────────────────────────────────────────────────────────────────────────────
import { meshRestBBox, DEFAULT_CALIBRATION } from './synergy-geometry.mjs';
import { solveBestEmpirical } from './synergy-solver.mjs';
import { impulseCandidates, carrySegments, synthesizeEffect, impactAccentBlock } from './synergy-effects.mjs';
import { narrationBudgetMs } from './timeline-ir.mjs';
import { normalizeDecisions } from './decisions.mjs';

const DEFAULT_SLIDE_W = 13.333; // T24: defaults only — expandInteractions honors options.slideSize
const DEFAULT_SLIDE_H = 7.5;
export const SUPPORTED_INTERACTION_VERBS = Object.freeze(['touch', 'point-at', 'press', 'push', 'knock-over', 'carry']);
const CONTACT_VERBS = new Set(['touch', 'point-at', 'press']);
const IMPULSE_VERBS = new Set(['push', 'knock-over']);

// Public Authoring Excellence contract. Keep this in the IR layer so the MCP
// schema, compiler and the Director validator cannot drift apart.
export const INTERACTION_CONTRACT_VERSION = 'betterpptx.interactions.v1';
export function publicInteractionContract() {
  return {
    contract: INTERACTION_CONTRACT_VERSION,
    field: 'slides[].interactions',
    supportedVerbs: [...SUPPORTED_INTERACTION_VERBS],
    interaction: {
      actor: 'stable presenter/cast id (or "presenter" for the top-level presenter)',
      verb: 'one of supportedVerbs',
      target: 'stable content objectName or name on the same slide, including a named editable group descendant such as an animated-table row or cell; geometry-only and numeric targets are rejected',
      optional: ['hand', 'distIn', 'startMs'],
    },
    targetNaming: {
      required: true,
      source: 'slides[].content[].objectName | slides[].content[].name | named descendants under slides[].content[].children[]',
      stable: true,
      rule: 'Never target a slide index, array index, generated shape id, or ad-hoc coordinates.',
    },
    solvedPlan: {
      field: '_synergyPlan',
      requiredForInteractionSlides: true,
      solvedFields: ['slideId', 'actor', 'verb', 'target', 'clip', 'framePos'],
      timingFields: ['startMs', 'contactMs', 'grabMs', 'dropMs'],
      rule: 'The compiler creates this plan from empirical clipTimelines; the AI may inspect it but may not hand-author it.',
    },
  };
}

function interactionKey(item = {}) {
  return [item.slideId ?? item.slide, item.actor, item.verb, item.target].map(value => String(value ?? '')).join('|');
}

// Validate the post-expansion result. This is deliberately fail-closed: an
// interaction with only a refusal/verdict is not an Authoring Excellence
// output and must never silently degrade into hand-timed playScene blocks.
export function interactionPlanIssues(spec = {}) {
  if (!isObj(spec) || !Array.isArray(spec.slides)) return [];
  const issues = [];
  const interactions = [];
  spec.slides.forEach((slide, slideIndex) => {
    for (const beat of Array.isArray(slide.interactions) ? slide.interactions : []) {
      interactions.push({ slide, slideIndex, beat });
      const verb = String(beat?.verb || '');
      if (!SUPPORTED_INTERACTION_VERBS.includes(verb)) issues.push({ code: 'INTERACTION_UNSUPPORTED_VERB', message: `Unsupported interaction verb "${verb}".`, path: `slides[${slideIndex}].interactions` });
      if (!String(beat?.actor || '').trim()) issues.push({ code: 'INTERACTION_ACTOR_REQUIRED', message: 'Every interaction requires a stable actor id.', path: `slides[${slideIndex}].interactions` });
      const target = String(beat?.target || '').trim();
      if (!target || /^\d+$/.test(target)) issues.push({ code: 'INTERACTION_TARGET_NAME_REQUIRED', message: 'Every interaction target must be a stable content objectName/name, not an index or coordinate.', path: `slides[${slideIndex}].interactions` });
      if (beat?.startMs !== undefined && (!Number.isInteger(Number(beat.startMs)) || Number(beat.startMs) < 0 || Number(beat.startMs) > 120000)) issues.push({ code: 'INTERACTION_START_INVALID', message: 'Interaction startMs must be an integer from 0 through 120000 milliseconds.', path: `slides[${slideIndex}].interactions` });
    }
  });
  if (!interactions.length) return issues;
  const plan = Array.isArray(spec._synergyPlan) ? spec._synergyPlan : null;
  if (!plan) {
    issues.push({ code: 'INTERACTION_PLAN_REQUIRED', message: 'Interaction-heavy slides require a compiler-produced _synergyPlan; hand-authored choreography is not accepted.', path: '_synergyPlan' });
    return issues;
  }
  const byKey = new Map(plan.map(item => [interactionKey(item), item]));
  for (const { slide, slideIndex, beat } of interactions) {
    const rec = byKey.get(interactionKey({ slideId: slide.id, actor: beat.actor, verb: beat.verb, target: beat.target }));
    if (!rec) {
      issues.push({ code: 'INTERACTION_PLAN_MISSING_BEAT', message: `No solved _synergyPlan record exists for ${beat.actor}/${beat.verb}/${beat.target}.`, path: `slides[${slideIndex}].interactions` });
      continue;
    }
    const solved = rec.clip != null && !!rec.framePos;
    const timing = rec.contactMs != null || (rec.grabMs != null && rec.dropMs != null) || rec.verb === 'push' || rec.verb === 'knock-over';
    const blocking = (rec.verdicts || []).filter(v => ['error', 'fatal', 'block'].includes(String(v?.severity || '').toLowerCase()) || String(v?.code || '').startsWith('INTERACTION_'));
    if (!solved || !timing || blocking.length) issues.push({ code: 'INTERACTION_PLAN_UNSOLVED', message: `Interaction ${beat.actor}/${beat.verb}/${beat.target} is not solved from empirical clip timelines.`, path: `_synergyPlan:${interactionKey(rec)}`, evidence: { verdicts: rec.verdicts || [], clip: rec.clip ?? null, framePos: rec.framePos || null } });
  }
  return issues;
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

function nestedContentTarget(nodes, targetName, parentAbsolute = null, parentTransform = null) {
  for (const node of nodes || []) {
    if (!isObj(node)) continue;
    let absolute = null;
    const own = node.bbox || node.rect || ([node.x, node.y, node.w, node.h].every(value => Number.isFinite(Number(value)))
      ? { x: Number(node.x), y: Number(node.y), w: Number(node.w), h: Number(node.h) }
      : null);
    if (parentAbsolute && own) {
      const extent = parentTransform?.chExt || { x: 0, y: 0, w: parentAbsolute.w, h: parentAbsolute.h };
      const offset = parentTransform?.chOff || { x: 0, y: 0 };
      const sx = parentAbsolute.w / Math.max(0.000001, Number(extent.w) || parentAbsolute.w);
      const sy = parentAbsolute.h / Math.max(0.000001, Number(extent.h) || parentAbsolute.h);
      absolute = {
        x: parentAbsolute.x + (Number(own.x) - Number(offset.x || 0)) * sx,
        y: parentAbsolute.y + (Number(own.y) - Number(offset.y || 0)) * sy,
        w: Number(own.w) * sx,
        h: Number(own.h) * sy,
      };
    } else if (own && !parentAbsolute) absolute = own;
    if (node.objectName === targetName || node.name === targetName) return { node, absoluteBBox: absolute };
    const nested = nestedContentTarget(node.children, targetName, absolute, node);
    if (nested) return nested;
  }
  return null;
}

export function resolveInteractionTargetGeometry(content, targetName) {
  const match = nestedContentTarget(content, String(targetName || ''));
  return match ? { target: match.node, bbox: match.absoluteBBox } : null;
}

function replaceNestedContentTarget(nodes, targetNode, replacement) {
  let changed = false;
  const next = (nodes || []).map(node => {
    if (node === targetNode) { changed = true; return replacement; }
    if (!isObj(node) || !Array.isArray(node.children)) return node;
    const nested = replaceNestedContentTarget(node.children, targetNode, replacement);
    if (!nested.changed) return node;
    changed = true;
    return { ...node, children: nested.nodes };
  });
  return { nodes: next, changed };
}

export function replaceInteractionTargetContent(content, targetNode, replacement) {
  return replaceNestedContentTarget(content, targetNode, replacement);
}

// affine helpers over the calibrated projection (probe window ↔ model ↔ any window)
function probeToModel(manifest, rest, calib) {
  const p = manifest.probe;
  const s = p.h / (p.m || 1) / rest.h * (calib.kS || 1);
  return (x, y) => [
    (x - (p.x + p.w / 2) - (calib.kX || 0)) / s + rest.center[0],
    -(y - (p.y + p.h / 2) - (calib.kY || 0)) / s + rest.center[1],
    rest.center[2]];
}
function windowFor(modelPt, tx, ty, H, m, rest, calib, dims = {}) {
  const SW = Number(dims.slideW) || DEFAULT_SLIDE_W, SH = Number(dims.slideH) || DEFAULT_SLIDE_H; // T24
  const s = H / m / rest.h * (calib.kS || 1);
  const fx = tx - H / 2 - (calib.kX || 0) - (modelPt[0] - rest.center[0]) * s;
  const fy = ty - H / 2 - (calib.kY || 0) + (modelPt[1] - rest.center[1]) * s;
  const cx = Math.max(0.1, Math.min(SW - H - 0.1, fx));
  const cy = Math.max(0.1, Math.min(SH - H - 0.1, fy));
  const proj = (mp) => ({ x: cx + H / 2 + (calib.kX || 0) + (mp[0] - rest.center[0]) * s,
    y: cy + H / 2 + (calib.kY || 0) - (mp[1] - rest.center[1]) * s });
  return { framePos: { x: +cx.toFixed(3), y: +cy.toFixed(3) }, clampedIn: +Math.hypot(cx - fx, cy - fy).toFixed(3), proj, s };
}

/** Resolve one interaction beat to solved geometry + blocks. Returns { presenterBlock, targetAnimation, plan }. */
function solveInteraction(beat, target, actor, slideDwellMs, dims = {}) {
  const SW = Number(dims.slideW) || DEFAULT_SLIDE_W, SH = Number(dims.slideH) || DEFAULT_SLIDE_H; // T24
  const { glbBuf, timelines, clipDurations } = actor;
  const rest = actor.rest || meshRestBBox(glbBuf);
  const calib = actor.calib || DEFAULT_CALIBRATION;
  const toModel = probeToModel(timelines, rest, calib);
  // Keep empirically solved interactions inside the same author-controlled
  // presenter scale/viewport contract as ordinary Director appearances.
  // A fixed five-inch frame made restrained presenters cover titles and charts
  // as soon as a semantic interaction was added.
  const H = 5.0 * Math.max(0.5, Math.min(2.2, Number(actor.scale) || 1));
  const MARGIN = Math.max(1, Math.min(3, Number(actor.viewportMargin) || 1));
  const verdicts = [];
  const startMs = Number.isInteger(Number(beat.startMs)) && Number(beat.startMs) >= 0 ? Number(beat.startMs) : 0;
  const availableDwellMs = Math.max(0, slideDwellMs - startMs);
  const tBox = target.bbox;
  const clipList = Object.keys(timelines.timelines).map(Number);

  const presenterBlock = (framePos, animId, dur) => ({
    kind: 'model3d', name: `${actor.id}_ix`, objectName: `${actor.id}_ix_${beat._n}`, morphName: actor.id,
    modelAsset: actor.model, scene: { animId, loop: false },
    bbox: { x: framePos.x, y: framePos.y, w: H, h: H },
    objViewport: Math.round(H * 1454545 / MARGIN),
	    trans: { rot: { ay: Math.round(Number(actor.faceRotationY ?? 0) * 60000) } },
    ...(actor.poster ? { posterAsset: actor.poster, nativeOnly: false } : {}),
    altText: `3D actor ${actor.id} (${beat.verb} ${target.name})`,
    animation: { type: 'emphasis', effect: 'playScene', animId, loop: false,
      trigger: 'withPrevious', delay: startMs, duration: Math.min(dur ?? 4500, 4500) },
    _synergy: { verb: beat.verb, target: target.name },
  });

  if (CONTACT_VERBS.has(beat.verb)) {
    const sol = solveBestEmpirical({ glbBuf, verb: beat.verb, targetBbox: tBox, rest, calib,
      viewportMargin: MARGIN, clipDurations, slideW: SW, slideH: SH }, timelines, { clips: clipList, maxContactMs: availableDwellMs - 800 });
    if (!sol) return { verdicts: [{ code: 'INTERACTION_UNSOLVED', msg: `no ${beat.verb} candidate` }] };
    verdicts.push(...sol.verdicts);
    const pair = beat.verb === 'press'
      ? { type: 'emphasis', effect: 'growShrink', trigger: 'withPrevious', delay: startMs + sol.contactMs, duration: 600 }
      : { type: 'emphasis', effect: 'pulse', trigger: 'withPrevious', delay: startMs + sol.contactMs, duration: 600 };
    const presenterDurationMs = Math.max(Number(sol.clipDurationMs) || 0, sol.contactMs + pair.duration);
    return { presenterBlock: { ...presenterBlock(sol.framePos, sol.animId, presenterDurationMs), bbox: { x: sol.framePos.x, y: sol.framePos.y, w: sol.frame.w, h: sol.frame.h }, objViewport: Math.round(sol.frame.h * 1454545 / sol.viewportMargin) },
      targetAnimation: [pair],
      plan: { verb: beat.verb, clip: sol.animId, startMs, contactMs: startMs + sol.contactMs, window: sol.contactWindowMs,
        framePos: sol.framePos, effectorSlide: sol.effectorSlide, residualIn: sol.residualIn, verdicts } };
  }

  if (IMPULSE_VERBS.has(beat.verb)) {
    let best = null;
    for (const id of clipList) {
      for (const c of impulseCandidates(timelines.timelines[String(id)] || [], { maxContactMs: availableDwellMs - 1200 })) {
        if (!best || c.speedInPerS > best.c.speedInPerS) best = { id, c };
      }
    }
    if (!best) return { verdicts: [{ code: 'INTERACTION_UNSOLVED', msg: 'no impulse moment in the clip library' }] };
    // the hand strikes the target's nearest edge midpoint (approach from the side with room)
    const fromRight = (SW - (tBox.x + tBox.w)) >= tBox.x;
    const contact = { x: fromRight ? tBox.x + tBox.w : tBox.x, y: tBox.y + tBox.h / 2 };
    const mp = toModel(best.c.xIn, best.c.yIn);
    const w = windowFor(mp, contact.x, contact.y, H, MARGIN, rest, calib, { slideW: SW, slideH: SH });
    if (w.clampedIn > 0.25) verdicts.push({ code: 'UNREACHABLE', msg: `impulse contact off by ${w.clampedIn}in after clamping` });
    const eff = synthesizeEffect(beat.verb === 'push' ? 'push' : 'knock-over',
      { dir: best.c.dir, tMs: startMs + best.c.tMs, distIn: beat.distIn, slideW: SW, slideH: SH });
    // D3: a native impact accent flashes at the strike point (world-styled; stripped by D5 reduced/static)
    const accentBlock = impactAccentBlock(contact, { tMs: startMs + best.c.tMs, name: `${actor.id}_impact_${beat._n}`, accentColor: actor.accentColor });
    const presenterDurationMs = Math.max(Number(clipDurations?.[best.id]) || 0, best.c.tMs + 1050);
    return { presenterBlock: presenterBlock(w.framePos, best.id, presenterDurationMs),
      targetAnimation: eff, accentBlock,
      plan: { verb: beat.verb, clip: best.id, startMs, contactMs: startMs + best.c.tMs, dir: { x: +best.c.dir.x.toFixed(3), y: +best.c.dir.y.toFixed(3) },
        speedInPerS: best.c.speedInPerS, framePos: w.framePos, clampedIn: w.clampedIn, accent: true, verdicts } };
  }

  if (beat.verb === 'carry') {
    let best = null;
    for (const id of clipList) {
      for (const seg of carrySegments(timelines.timelines[String(id)] || [], { maxStartMs: slideDwellMs - 1500 })) {
        if (!best || seg.travelIn > best.seg.travelIn) best = { id, seg };
      }
    }
    if (!best) return { verdicts: [{ code: 'INTERACTION_UNSOLVED', msg: 'no grab→travel→drop segment in the clip library' }] };
    // the presenter comes TO the target: hand-at-grab lands on the target's center
    const tc = { x: tBox.x + tBox.w / 2, y: tBox.y + tBox.h / 2 };
    const mpGrab = toModel(best.seg.grab.x, best.seg.grab.y);
    const w = windowFor(mpGrab, tc.x, tc.y, H, MARGIN, rest, calib, { slideW: SW, slideH: SH });
    if (w.clampedIn > 0.25) verdicts.push({ code: 'UNREACHABLE', msg: `grab point off by ${w.clampedIn}in after clamping` });
    const samples = best.seg.samples.map(([t, x, y]) => { const q = w.proj(toModel(x, y)); return [startMs + t, q.x, q.y]; });
    const eff = synthesizeEffect('carry', { segment: { ...best.seg, grabMs: startMs + best.seg.grabMs, dropMs: startMs + best.seg.dropMs, samples }, slideW: SW, slideH: SH });
    const dropQ = w.proj(toModel(best.seg.drop.x, best.seg.drop.y));
    const presenterDurationMs = Math.max(Number(clipDurations?.[best.id]) || 0, best.seg.dropMs);
    return { presenterBlock: presenterBlock(w.framePos, best.id, presenterDurationMs),
      targetAnimation: eff,
      plan: { verb: 'carry', clip: best.id, startMs, grabMs: startMs + best.seg.grabMs, dropMs: startMs + best.seg.dropMs,
        travelIn: best.seg.travelIn, framePos: w.framePos, clampedIn: w.clampedIn,
        dropAt: { x: +dropQ.x.toFixed(2), y: +dropQ.y.toFixed(2) }, verdicts } };
  }

  return { verdicts: [{ code: 'INTERACTION_UNKNOWN_VERB', msg: beat.verb }] };
}

/**
 * EXPAND slides[].interactions → injected presenter instances + rewritten target animations.
 * options.castAssets = { [actorId]: { glbBuf, model, poster, clipDurations, clipTimelines, faceRotationY } }
 * (the compiler builds this from the gen cache — clipTimelines is the empirical manifest).
 * Idempotent + fail-safe: unchanged when no slide has interactions; unsolved beats are dropped with verdicts
 * recorded on spec._synergyPlan (never a broken deck).
 */
export function expandInteractions(spec, options = {}) {
  if (!isObj(spec) || !Array.isArray(spec.slides)) return spec;
  if (!spec.slides.some(s => Array.isArray(s.interactions) && s.interactions.length)) return spec;
  const assets = options.castAssets || {};
  // T24: every stage/solver/effect fraction derives from the ACTUAL slide size when provided.
  const dims = options.slideSize && Number(options.slideSize.w) > 0
    ? { slideW: Number(options.slideSize.w), slideH: Number(options.slideSize.h) } : {};
  const out = { ...spec, slides: spec.slides.map(s => ({ ...s, content: [...(s.content || [])] })) };
  const plan = [];
  out.slides.forEach((slide, si) => {
    const beats = Array.isArray(slide.interactions) ? slide.interactions : [];
    if (!beats.length) return;
    // A2a master clock: the interaction budget comes from the slide's NARRATION (authored timing →
    // measured duration → segment sum → text estimate), floored at the old 5000 ms constant so
    // narration-less slides behave exactly as before. Text is the master clock (owner doctrine).
    const dwellMs = narrationBudgetMs(slide);
    beats.forEach((beat, bi) => {
      const actor = assets[String(beat.actor)];
      const rec = { slide: si, slideId: slide.id, actor: beat.actor, verb: beat.verb, target: beat.target };
      if (!actor || !actor.glbBuf) { plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_NO_ACTOR', msg: `no cast asset for ${beat.actor}` }] }); return; }
      if (!actor.clipTimelines) { plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_NO_TIMELINES', msg: 'actor has no empirical clip-timeline manifest — bake or probe it first' }] }); return; }
      // T31: only the zero-degree front-facing roster basis is CALIBRATED — the projection math ignores
      // other yaws, so solving under one would be guessing. Refuse actionably instead.
      const yaw = actor.faceRotationY;
      if (yaw != null && Number(yaw) !== 0) {
        plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_UNSUPPORTED_YAW', msg: `faceRotationY ${yaw} is outside the measured envelope (only 0° front-facing roster yaw is calibrated) — set 0, or probe/calibrate this yaw first` }] });
        return;
      }
      // A2a (§2.6 step 5): target geometry comes from PRELIMINARY LAYOUT (options.targetBoxes,
      // keyed slideId → block name); an authored bbox is an OVERRIDE, never a prerequisite.
      const targetMatch = nestedContentTarget(slide.content || [], beat.target);
      const target = targetMatch?.node;
      const layoutBox = options.targetBoxes?.[slide.id]?.[beat.target] || null;
      const bbox = targetMatch?.absoluteBBox || layoutBox;
      if (!target || !bbox) { plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_NO_TARGET', msg: `no object "${beat.target}" with a resolvable bbox (authored or preliminary layout) on slide` }] }); return; }
      if (target.animation) { plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_TARGET_AUTHORED', msg: 'target already carries authored animation — respected, not overwritten' }] }); return; }
      rec.bboxFrom = targetMatch?.absoluteBBox ? 'authored-or-composite' : 'layout';
      const solved = solveInteraction({ ...beat, _n: bi }, { name: beat.target, bbox },
        { ...actor, id: String(beat.actor), timelines: actor.clipTimelines }, dwellMs, dims);
      if (!solved.presenterBlock) { plan.push({ ...rec, verdicts: solved.verdicts }); return; }
      const replaced = replaceNestedContentTarget(slide.content, target, { ...target, animation: solved.targetAnimation });
      if (!replaced.changed) { plan.push({ ...rec, verdicts: [{ code: 'INTERACTION_NO_TARGET', msg: `object "${beat.target}" disappeared before interaction lowering` }] }); return; }
      slide.content = replaced.nodes; // clone; never mutate the input spec
      slide.content.push(solved.presenterBlock);
      if (solved.accentBlock) slide.content.push(solved.accentBlock); // D3 impact accent
      plan.push({ ...rec, ...solved.plan });
    });
  });
  // E2: normalize every verdict to the canonical actionable shape {code,severity,reason,fix,evidence}
  // at the plan boundary — a bare {code,msg} can never reach the AI surface.
  for (const rec of plan) if (Array.isArray(rec.verdicts)) rec.verdicts = normalizeDecisions(rec.verdicts);
  out._synergyPlan = plan; // the AI-visible calculation (surfaced by the compiler's response builder)
  return out;
}

/** PLAN (report, no mutation): what each interaction WILL do — same solver, pure function of the raw spec. */
export function planInteractions(spec, options = {}) {
  const expanded = expandInteractions(spec, options);
  return expanded._synergyPlan || null;
}

// ── C2: PROPOSED interactions (teamwork doctrine — PROPOSALS the AI confirms, never verdicts) ──
// Scans each slide's narration for interaction-suggesting phrases and proposes {verb, target,
// confidence, reason} — NEVER injects. The AI copies an accepted proposal into slides[].interactions
// to make it real. Pure function of the raw spec; deterministic (no randomness).
const INTERACTION_CUES = [
  // [verb, confidence, phrase regex, preferred target kinds]
  ['point-at', 0.8, /\b(look at|take a look at|notice|as you can see|see (here|this)|over here|point(ing)? to)\b/i, ['chart', 'chart-panel', 'metric', 'kpi', 'stat', 'image', 'image-feature']],
  ['point-at', 0.7, /\bthis (chart|graph|figure|number|metric|image|diagram) (shows|tells|means|illustrates|proves)\b/i, ['chart', 'chart-panel', 'metric', 'kpi', 'stat', 'image']],
  ['touch',    0.7, /\b(here('s| is)|introducing|let me show you|say hello to|meet the)\b/i, ['image', 'image-feature', 'metric', 'kpi', 'stat', 'chart']],
  ['press',    0.6, /\b(press|tap|click|hit|select|activate) (the|this)?\b/i, ['shape', 'kpi', 'stat', 'metric']],
  ['knock-over', 0.7, /\b(remove|removed|removing|cut|cutting|eliminate|eliminated|get rid of|do away with|scrap|kill|delete)\b/i, ['shape', 'metric', 'kpi', 'stat', 'chart', 'table-panel']],
  ['push',     0.6, /\b(push|shove|move (aside|away)|clear (out|away)|set aside)\b/i, ['shape', 'metric', 'kpi', 'image']],
  ['carry',    0.7, /\b(move|bring|take|carry|drag|hand (over|off)) .{0,20}\b(to|over|across|into)\b/i, ['shape', 'image', 'kpi', 'stat', 'metric', 'badge']],
];
function slideNarrationText(slide) {
  const n = (slide && (slide.narration || slide.voiceover)) || null;
  if (!n) return String(slide?.message || '');
  const parts = [n.script, n.text, slide?.message];
  if (Array.isArray(n.segments)) for (const s of n.segments) parts.push(s?.script, s?.text);
  return parts.filter(Boolean).join(' ');
}
function proposeTarget(slide, kinds) {
  const objs = (Array.isArray(slide.content) ? slide.content : []).filter(o => isObj(o) && (o.objectName || o.name) && String(o.kind || '').toLowerCase() !== 'title');
  // prefer a named interactive kind in priority order; else the first salient non-title object
  for (const kind of kinds) {
    const t = objs.find(o => String(o.kind || '').toLowerCase() === kind);
    if (t) return t.objectName || t.name;
  }
  const salient = objs.find(o => !['textbox', 'text', 'narration', 'model3d'].includes(String(o.kind || '').toLowerCase()));
  return salient ? (salient.objectName || salient.name) : null;
}

/** C2: propose interactions from narration — NEVER injected. Returns [{slide, slideId, verb, target,
 * confidence, reason}]. A slide that already authored interactions is skipped (respect the author). */
export function proposeInteractions(spec) {
  if (!isObj(spec) || !Array.isArray(spec.slides)) return [];
  const out = [];
  spec.slides.forEach((slide, si) => {
    if (Array.isArray(slide.interactions) && slide.interactions.length) return; // author already decided
    const text = slideNarrationText(slide);
    if (!text.trim()) return;
    const seen = new Set();
    for (const [verb, confidence, re, kinds] of INTERACTION_CUES) {
      const m = text.match(re);
      if (!m) continue;
      const target = proposeTarget(slide, kinds);
      if (!target) continue;
      const key = `${verb}:${target}`;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ slide: si, slideId: slide.id, verb, target, confidence, reason: `narration phrase "${m[0].trim()}"`,
        accept: `add { actor:<yourActor>, verb:"${verb}", target:"${target}" } to slides[${si}].interactions` });
    }
  });
  // highest-confidence first, at most 1 per slide (the clearest opportunity) so the AI isn't spammed
  const bySlide = new Map();
  for (const p of out.sort((a, b) => b.confidence - a.confidence)) if (!bySlide.has(p.slide)) bySlide.set(p.slide, p);
  return [...bySlide.values()].sort((a, b) => a.slide - b.slide);
}
