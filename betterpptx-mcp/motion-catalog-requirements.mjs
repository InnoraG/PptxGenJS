import {SOURCE_KINEMATICS_SCHEMA} from './motion-source-kinematics.mjs'
const travelLandmarks=['rootJoint','chest','head','leftHand','rightHand']
const travelFrames=['source-world','root-translation-removed']
// Evaluate only published motion evidence. Descriptive tags never certify a
// hand, a phase, contact, physical scale, or native playback.
export const MOTION_REQUIREMENTS_SCHEMA = {
  type: 'object', additionalProperties: false,
  description: 'Factual motion requirements. Unknown properties remain review candidates; no motion is selected automatically. Meter limits refer to measured motion space, not slide placement or universal actor scale.',
  properties: {
    selectable: { type: 'boolean', description: 'Require current execution availability, independently of semantic/native qualification.' },
    presenterId: { type: 'string', minLength: 1, maxLength: 128, description: 'Require the exact presenter binding published with the measurements.' },
    owningHand: { type: 'string', enum: ['left', 'right', 'both'], description: 'Requires qualified owning-hand evidence; labels and larger hand paths do not qualify it.' },
    durationMs: { type: 'object', additionalProperties: false, minProperties: 1, properties: { min: { type: 'number', minimum: 0 }, max: { type: 'number', minimum: 0 } }, description: 'Bounds on measured source duration, in milliseconds.' },
    minimumHoldMs: { type: 'number', minimum: 0, description: 'Requires a qualified continuous hold window; heuristic phase candidates do not qualify it.' },
    maximumRootPathMeters: { type: 'number', minimum: 0, description: 'Maximum cumulative root travel in measured motion space; returning to the start does not erase travel.' },
    maximumChestPathMeters: { type: 'number', minimum: 0, description: 'Maximum cumulative chest travel in measured motion space.' },
    maximumHeadPathMeters: { type: 'number', minimum: 0, description: 'Maximum cumulative head travel in measured motion space.' },
    maximumRootPathShoulderSpans: { type: 'number', minimum: 0, description: 'Maximum cumulative sampled root travel divided by the source’s median measured shoulder span. Dimensionless source geometry; no meters, continuous path bound or target/slide-scale claim.' },
    maximumChestPathShoulderSpans: { type: 'number', minimum: 0, description: 'Maximum cumulative sampled chest travel divided by the source’s median measured shoulder span. Dimensionless source geometry; no meters, continuous path bound or target/slide-scale claim.' },
    maximumHeadPathShoulderSpans: { type: 'number', minimum: 0, description: 'Maximum cumulative sampled head travel divided by the source’s median measured shoulder span. Dimensionless source geometry; no meters, continuous path bound or target/slide-scale claim.' },
    sampledTravel: {type:'array',minItems:1,maxItems:10,description:'Conjunctive whole-clip sampled landmark travel bounds in measured shoulder spans. Select the source frame explicitly. Root translation removed still retains body rotation; relative rootJoint travel is zero by definition. Hand travel does not qualify owning hand, action, hold, preparation or playback.',items:{type:'object',additionalProperties:false,required:['landmark','frame'],anyOf:[{required:['min']},{required:['max']}],properties:{landmark:{type:'string',enum:travelLandmarks},frame:{type:'string',enum:travelFrames},min:{type:'number',minimum:0},max:{type:'number',minimum:0}}}},
    nativePlaybackQualified: { type: 'boolean', description: 'Requires an explicit published native playback qualification; selectable does not imply this.' },
    targetContactQualified: { type: 'boolean', description: 'Requires an explicit published contact/target-binding qualification; a point sample is insufficient.' },
  },
}

const invalid = field => { throw Object.assign(new Error(`Invalid motion requirement: ${field}.`), { code: 'MOTION_REQUIREMENT_INVALID', field }) }
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
function validateSampledTravel(value){
  if(!Array.isArray(value)||value.length<1||value.length>10||Reflect.ownKeys(value).length!==value.length+1)invalid('sampledTravel')
  const seen=new Set()
  for(let i=0;i<value.length;i++){
    if(!Object.hasOwn(value,i))invalid('sampledTravel')
    const check=value[i]
    if(!check||typeof check!=='object'||Array.isArray(check)||Reflect.ownKeys(check).some(k=>!['landmark','frame','min','max'].includes(k)))invalid('sampledTravel')
    for(const key of Reflect.ownKeys(check)){const descriptor=Object.getOwnPropertyDescriptor(check,key);if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))invalid('sampledTravel')}
    if(!travelLandmarks.includes(check.landmark)||!travelFrames.includes(check.frame)||!Object.hasOwn(check,'landmark')||!Object.hasOwn(check,'frame')||!['min','max'].some(k=>Object.hasOwn(check,k)))invalid('sampledTravel')
    for(const key of ['min','max'])if(Object.hasOwn(check,key)&&!finite(check[key]))invalid('sampledTravel')
    if(check.min!==undefined&&check.max!==undefined&&check.min>check.max)invalid('sampledTravel')
    const key=check.landmark+'\0'+check.frame;if(seen.has(key))invalid('sampledTravel');seen.add(key)
  }
}

export function validateMotionRequirements(requirements) {
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements) || !Object.keys(requirements).length) invalid('motionRequirements')
  for (const [key, value] of Object.entries(requirements)) {
    if (!Object.hasOwn(MOTION_REQUIREMENTS_SCHEMA.properties, key)) invalid('motionRequirements')
    if (key === 'sampledTravel') {
      validateSampledTravel(value)
    } else if (key === 'durationMs') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length || Object.keys(value).some(k => !['min', 'max'].includes(k)) || Object.values(value).some(v => !finite(v)) || value.min !== undefined && value.max !== undefined && value.min > value.max) invalid(key)
    } else if (key === 'owningHand') {
      if (!['left', 'right', 'both'].includes(value)) invalid(key)
    } else if (key === 'presenterId') {
      if (typeof value !== 'string' || !value.trim() || value.length > 128) invalid(key)
    } else if (MOTION_REQUIREMENTS_SCHEMA.properties[key].type === 'boolean') {
      if (typeof value !== 'boolean') invalid(key)
    } else if (!finite(value)) invalid(key)
  }
  return requirements
}

export function evaluateMotionRequirements(entry, requirements) {
  validateMotionRequirements(requirements)
  const m = entry.measurements
  // Only this closed projection has a source clock and coordinate contract.
  const measured = m?.schemaVersion === 'betterpptx.public-motion-measurements.v1'
  const sourceClockRecognized = measured || m?.schemaVersion === 'betterpptx.public-source-review-measurements.v1'
  const metricSpace = measured && m.trajectory?.units === 'meters' && m.trajectory?.coordinateSpace === 'measured-motion-space'
  const requirementsResults = Object.entries(requirements).flatMap(([field, requested]) => {
    let observed = null, evidencePath = null, reason = 'Required evidence is not published.'
    let matches = null
    switch (field) {
      case 'sampledTravel':
        return requested.map((check,index)=>{
          const evidence=m?.sourceKinematics,metric=check.frame==='source-world'?'sampledPathShoulderSpans':'rootRelativeSampledPathShoulderSpans',value=evidence?.landmarks?.[check.landmark]?.[metric]
          const recognized=evidence?.schemaVersion===SOURCE_KINEMATICS_SCHEMA&&evidence.basis?.unit==='measured-shoulder-spans'&&evidence.basis.coordinateSpace==='source-motion-space'&&finite(value)
          const satisfied=recognized&&(check.min===undefined||value>=check.min)&&(check.max===undefined||value<=check.max)
          return {field:`sampledTravel[${index}]`,requested:check,status:!recognized?'unknown':satisfied?'satisfied':'unmet',observed:recognized?value:null,evidencePath:recognized?`measurements.sourceKinematics.landmarks.${check.landmark}.${metric}`:null,reason:!recognized?'Source sampled landmark travel in the requested frame has not been published.':check.frame==='root-translation-removed'&&check.landmark==='rootJoint'?'Relative rootJoint travel is zero by definition; it does not establish source immobility, an action or a hold.':'Whole-clip cumulative sampled travel in the explicitly requested source frame, normalized by the same source’s median shoulder span. Root-relative travel removes translation but retains rotation. Not speed, continuous movement, owning hand, action, hold or execution qualification.'}
        })
      case 'selectable':
        if (typeof entry.selectable === 'boolean') { observed = entry.selectable; matches = observed === requested; evidencePath = 'selectable'; reason = 'Execution availability is independent of semantic and native qualification.' }
        break
      case 'presenterId':
        if (measured && typeof m.presenterId === 'string') { observed = m.presenterId; matches = observed === requested; evidencePath = 'measurements.presenterId'; reason = 'Exact measured presenter binding; not universal compatibility.' }
        break
      case 'durationMs':
        if (sourceClockRecognized && finite(m.timing?.durationMs)) { observed = m.timing.durationMs; matches = (requested.min === undefined || observed >= requested.min) && (requested.max === undefined || observed <= requested.max); evidencePath = 'measurements.timing.durationMs'; reason = 'Measured source clock, in milliseconds; source review matches do not establish target preparation or execution availability.' }
        break
      case 'owningHand':
        reason = 'Owning hand is unqualified. Motion names, tags, and relative hand movement do not establish it.'
        break
      case 'minimumHoldMs':
        reason = 'No qualified continuous hold window is published. Candidate phases and isolated apex samples do not establish a hold.'
        break
      case 'maximumRootPathMeters':
      case 'maximumChestPathMeters':
      case 'maximumHeadPathMeters': {
        const joint = { maximumRootPathMeters: 'root', maximumChestPathMeters: 'chest', maximumHeadPathMeters: 'head' }[field]
        const value = joint === 'root' ? (m?.rootJoint??m?.root)?.pathLengthMeters : m?.trajectory?.landmarks?.[joint]?.pathLengthMeters
        if (metricSpace && finite(value)) { observed = value; matches = value <= requested; evidencePath = joint === 'root' ? (m.rootJoint?'measurements.rootJoint.pathLengthMeters':'measurements.root.pathLengthMeters') : `measurements.trajectory.landmarks.${joint}.pathLengthMeters`; reason = 'Cumulative path in measured motion space; not net displacement, slide motion, or a universal physical-scale guarantee.' }
        break
      }
      case 'maximumRootPathShoulderSpans':
      case 'maximumChestPathShoulderSpans':
      case 'maximumHeadPathShoulderSpans': {
        const joint={maximumRootPathShoulderSpans:'rootJoint',maximumChestPathShoulderSpans:'chest',maximumHeadPathShoulderSpans:'head'}[field]
        const evidence=m?.sourceKinematics,value=evidence?.landmarks?.[joint]?.sampledPathShoulderSpans
        reason='No qualified source shoulder-span comparison is published. Physical-unit and semantic claims remain separate.'
        if(evidence?.schemaVersion===SOURCE_KINEMATICS_SCHEMA&&evidence.basis?.unit==='measured-shoulder-spans'&&evidence.basis.coordinateSpace==='source-motion-space'&&finite(value)){observed=value;matches=value<=requested;evidencePath=`measurements.sourceKinematics.landmarks.${joint}.sampledPathShoulderSpans`;reason='Cumulative sampled polyline divided by median per-frame shoulder distance in the same source. Source geometry only; not continuous path, meters, action ownership, hold or slide travel.'}
        break
      }
      case 'nativePlaybackQualified':
        if (measured && m.qualification?.nativePlayback === 'qualified') { observed = true; matches = observed === requested; evidencePath = 'measurements.qualification.nativePlayback' }
        else reason = 'Native playback qualification is pending or absent; execution availability does not prove playback.'
        break
      case 'targetContactQualified':
        if (measured && typeof m.contact?.targetBindingQualified === 'boolean') { observed = m.contact.targetBindingQualified; matches = observed === requested; evidencePath = 'measurements.contact.targetBindingQualified'; reason = 'Exact published target-binding qualification; contact candidates do not qualify it.' }
        break
    }
    return { field, requested, status: matches === null ? 'unknown' : matches ? 'satisfied' : 'unmet', observed, evidencePath, reason }
  })
  const unmet = requirementsResults.some(r => r.status === 'unmet')
  const unknown = requirementsResults.some(r => r.status === 'unknown')
  return {
    status: unmet ? 'requirements-unmet' : unknown ? 'review-required' : 'requirements-satisfied',
    executionAvailable: entry.selectable === true,
    qualificationScope: 'requested-properties-only',
    requirements: requirementsResults,
    ...(metricSpace ? { measurementBasis: { coordinateSpace: m.trajectory.coordinateSpace, units: m.trajectory.units, verticalAxis: m.trajectory.verticalAxis, presenterId: m.presenterId } } : {}),
  }
}

export function evaluateMotionCatalog(entries, requirements) {
  validateMotionRequirements(requirements)
  const annotated = entries.map(entry => entry.family === 'presenter-motion' ? { ...entry, requirementFit: evaluateMotionRequirements(entry, requirements) } : entry)
  const motions = annotated.filter(entry => entry.requirementFit)
  const count = status => motions.filter(entry => entry.requirementFit.status === status).length
  return { entries: annotated, motionQuery: {
    schemaVersion: 'betterpptx.motion-requirement-query.v1',
    status: count('requirements-satisfied') ? 'proven-matches' : 'no-proven-match',
    requirements,
    counts: { considered: motions.length, satisfied: count('requirements-satisfied'), reviewRequired: count('review-required'), unmet: count('requirements-unmet') },
    provenMatchReferences: motions.filter(entry=>entry.requirementFit.status==='requirements-satisfied').slice(0,20).map(entry=>({catalogId:entry.id,catalogOffset:annotated.findIndex(row=>row.id===entry.id),executionAvailable:entry.selectable===true,qualificationScope:'requested-properties-only'})),
    provenMatchReferencesTruncated: count('requirements-satisfied')>20,
    selectionAuthority: 'ai', automaticSelection: false,
    explanation: 'Fit covers only requested properties. Unknown evidence remains unknown, and availability, semantic qualification, and native playback are independent. Review candidates are retained without implicit substitution.',
  } }
}
