// Compact public evidence cards keep the AI's comparison context useful while
// preserving an exact route to the complete owner-filtered candidate record.
export function motionComparisonPage(catalog){
 if(catalog.entries.some(e=>e.family!=='presenter-motion'))throw Object.assign(new Error('Motion comparisons require family presenter-motion.'),{code:'MOTION_REQUIREMENT_FAMILY_REQUIRED'})
 const candidates=catalog.entries.map(entry=>{
  const geometry=entry.measurements?.sourceKinematics,clock=entry.measurements?.timing,fit=entry.requirementFit
  return {catalogId:entry.id,label:entry.label,sourceKind:entry.sourceKind,descriptionBasis:entry.sourceReview?.descriptionBasis||'published-motion-description',executionAvailable:entry.selectable===true,
   ...(entry.selection?.executableValue?{motionId:entry.selection.executableValue}:{}),
   sourceClock:clock?{durationMs:clock.durationMs,fps:clock.fps,frameCount:clock.frameCount,scope:entry.sourceKind==='observed-motion-review'?'source-only':'published-measured-clock'}:null,
   sampledBodyTravel:geometry?{unit:geometry.basis.unit,rootJoint:geometry.landmarks.rootJoint.sampledPathShoulderSpans,chest:geometry.landmarks.chest.sampledPathShoulderSpans,head:geometry.landmarks.head.sampledPathShoulderSpans,evidenceId:geometry.evidenceId,continuousPath:'not-established'}:null,
   sampledHandTravel:geometry?.landmarks?.leftHand&&geometry?.landmarks?.rightHand?{unit:geometry.basis.unit,evidenceId:geometry.evidenceId,leftHand:structuredClone(geometry.landmarks.leftHand),rightHand:structuredClone(geometry.landmarks.rightHand),scope:'whole-clip-source-sampled-geometry',rootRelativeFrame:'Root translation removed; body rotation remains.',owningHandQualification:'unqualified',holdPhaseQualification:'unqualified'}:null,
   requestedFit:fit?{status:fit.status,fields:fit.requirements.map(r=>({field:r.field,status:r.status,requested:r.requested,observed:r.observed,...(r.evidencePath?{detailEvidencePath:r.evidencePath}:{}),...(r.status!=='satisfied'?{reason:r.reason}:{})}))}:null,
   ...(entry.sourceReview?{unknowns:[...new Set([...entry.sourceReview.unqualified,'posture'])]}:{qualification:entry.measurements?.qualification||entry.qualification||{state:'not-published'}}),
   preparationRequired:entry.route?.preparationRequired===true,
  }
 })
 const query=catalog.motionQuery
 return {schemaVersion:'betterpptx.motion-comparison-page.v1',catalogFingerprint:catalog.catalogFingerprint,pagination:catalog.pagination,candidates,
  ...(query?{motionQuery:{schemaVersion:query.schemaVersion,status:query.status,requirements:query.requirements,counts:query.counts,provenMatchReferences:query.provenMatchReferences,provenMatchReferencesTruncated:query.provenMatchReferencesTruncated,selectionAuthority:'ai',automaticSelection:false,qualificationScope:'requested-properties-only'}}:{}),
  detailRoute:{tool:'betterpptx.authoring.catalog',request:{view:'controls',family:'presenter-motion'},catalogIdArgument:'controlId',note:'Copy one candidate catalogId into controlId for complete evidence, constraints and authoring guidance. detailEvidencePath refers to that full control record.'},
  preparationRoute:{tool:'betterpptx.motion.preparation_profiles.list',sourceKind:'review',sourceId:'candidate.catalogId',requires:['targetModel','variant'],doesNotSelect:true,note:'Only observed review candidates use this source kind; preparation and execution availability remain separate.'},
  interpretation:{sampledTravel:'Cumulative sampled polyline divided by the same source’s median shoulder-origin span; dimensionless, not meters or body height.',sampledHandTravel:'Compare configured left/right landmarks using cumulative source-world travel, root-translation-removed travel and source-world endpoint displacement. Translation removal retains body rotation. A larger path does not identify the action’s owning hand; endpoint displacement does not replace cumulative travel.',sourceClock:'Source timing does not establish prepared target clock, hold or looping.',labels:'Authored review labels remain hypotheses; geometric fit does not certify the named action or owning hand.',availability:'Execution availability and requested-property fit do not prove semantic action, owning hand, hold, contact or native playback.',selection:'The AI owns the story and explicit choice. These cards do not rank aesthetic suitability or silently substitute a motion.'},
  ...(catalog.emptyReason?{emptyReason:catalog.emptyReason}:{}),...(catalog.degradations?{degradations:catalog.degradations}:{}),
 }
}
