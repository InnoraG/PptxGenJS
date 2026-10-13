// A factual comparison aid. It gives the AI author consequences and next steps;
// it does not rank creative treatments, certify unknowns or choose a motion.
export function motionAuthoringGuidance(entry){
 const review=entry.sourceKind==='observed-motion-review',m=entry.measurements,fit=entry.requirementFit,sourcePosture=entry.sourceReview?.descriptionEvidence?.scope==='retained-source-joint-geometry'
 const requirements=fit?.requirements||[],unknown=requirements.filter(r=>r.status==='unknown'),unmet=requirements.filter(r=>r.status==='unmet')
 return {
  schemaVersion:'betterpptx.motion-authoring-guidance.v1',catalogId:entry.id,
  descriptionBasis:review?sourcePosture?'ai-source-joint-posture-review':entry.sourceReview.descriptionEvidence?'ai-rendered-preparation-review':'authored-hypothesis':'published-motion-description',
  ...(entry.sourceReview?.descriptionEvidence?{descriptionEvidence:structuredClone(entry.sourceReview.descriptionEvidence)}:{}),
  executionAvailable:entry.selectable===true,
  requestedFit:fit?{status:fit.status,satisfied:requirements.filter(r=>r.status==='satisfied').map(r=>r.field),unknown:unknown.map(r=>({field:r.field,reason:r.reason})),unmet:unmet.map(r=>({field:r.field,requested:r.requested,observed:r.observed,reason:r.reason}))}:null,
  sourceTiming:m?.timing?{...m.timing,scope:review?'source-only':'published-measured-clock',preparedClockEquivalence:'not-inferred'}:null,
  movement:m?.sourceKinematics?{evidenceId:m.sourceKinematics.evidenceId,basis:m.sourceKinematics.basis,landmarks:m.sourceKinematics.landmarks}:null,
  composition:{
   role:review?'Review motion as a supplemental visual until its action is verified.':'Use the exact executable selector when available; retain the scene message independently of the motion.',
   placement:'Author slide geometry and travel explicitly. Source coordinates do not determine slide direction or framing.',
   timing:'Use the returned prepared clip clock for playback. Source duration alone does not establish target duration, looping or a hold.',
   semanticCaution:unknown.length?'Do not claim the unknown requested properties are satisfied.':review?sourcePosture?'This is an AI interpretation of retained source joint geometry at discrete keys. It does not qualify semantic action, owning hand, continuous hold, prepared-target timing or native playback.':entry.sourceReview.descriptionEvidence?'This is an AI interpretation of sampled frames of one prepared output. It does not qualify semantic action, owning hand, hold or native playback.':'Descriptions and search aliases are hypotheses, not measured action labels.':'Fit establishes only the requested properties; other semantic and native claims require their own evidence.',
  },
  nextStep:entry.selectable===true?{tool:'betterpptx.deck.generate_from_spec',selection:entry.selection,route:entry.route}:review?{...entry.route?.preparationDiscovery,afterPreparation:'Use the actual returned preparedVariantId and modelAsset for the chosen target; preparation does not certify action, hand or hold.'}:{status:'unavailable',reason:entry.availability||'Execution is not currently available.'},
  reviewChecks:review?[...entry.sourceReview.suggestedChecks]:unknown.map(r=>r.reason),
  automaticSelection:false,
 }
}

export function motionCandidateComparisons(entries){
 return entries.filter(entry=>entry.family==='presenter-motion').map(entry=>({id:entry.id,label:entry.label,...motionAuthoringGuidance(entry)}))
}
