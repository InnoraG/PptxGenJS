import {validateAuthoredSourcePostureReview,publicAuthoredSourcePostureReview} from './motion-authored-source-posture-review.mjs'
import {validateSourceReviewKinematics,publicSourceReviewKinematics} from './motion-source-kinematics.mjs'
import {validateSourceMovementTimeline,publicSourceMovementTimeline} from './motion-source-movement-timeline.mjs'
import {validateAuthoredVisualReview,publicAuthoredVisualReview} from './motion-authored-visual-review.mjs'
import { createHash } from 'node:crypto'
import { resourceAuthorizationActive, resourceOwnerOf, canAccessResource } from './auth/resource-authorization.mjs'
import { validateObservation } from './motion-candidate-runtime.mjs'
import {builtInPreparedMotionLibrary} from './builtin-prepared-motion-service.mjs'

export const SOURCE_REVIEW_MEASUREMENT_SCHEMA = 'betterpptx.public-source-review-measurements.v1'
export const SOURCE_REVIEW_CATALOG_RECORD_LIMIT = 520
let reviews = new Map()
const invalid = () => { throw Object.assign(new Error('Source review metadata is unavailable.'), { code: 'SOURCE_REVIEW_INVALID' }) }
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000

function normalize(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(key => !['sourceSha256','sourceObservation','authoredDescription','authoredSearchTerms','suggestedChecks','sourceKinematics','sourceMovementTimeline','authoredVisualReview','authoredSourcePostureReview'].includes(key))) invalid()
  if (!/^[a-f0-9]{64}$/.test(record.sourceSha256) || !text(record.authoredDescription) || !Array.isArray(record.suggestedChecks) || record.suggestedChecks.length > 16 || record.suggestedChecks.some(value => !text(value))) invalid()
  const terms=record.authoredSearchTerms||[]
  if (!Array.isArray(terms) || terms.length>64 || terms.some(term=>typeof term!=='string'||!term.trim()||term.length>100)) invalid()
  return { sourceSha256:record.sourceSha256, sourceObservation:validateObservation(record.sourceObservation), authoredDescription:record.authoredDescription.trim(), authoredSearchTerms:[...new Set(terms.map(term=>term.trim()))],suggestedChecks:[...record.suggestedChecks],...(record.sourceKinematics===undefined?{}:{sourceKinematics:validateSourceReviewKinematics(record.sourceKinematics,record.sourceSha256,record.sourceObservation)}),...(record.sourceMovementTimeline===undefined?{}:{sourceMovementTimeline:validateSourceMovementTimeline(record.sourceMovementTimeline,record.sourceSha256,record.sourceObservation,record.sourceKinematics)}),...(record.authoredVisualReview===undefined?{}:{authoredVisualReview:validateAuthoredVisualReview(record.authoredVisualReview,record.sourceObservation)}),...(record.authoredSourcePostureReview===undefined?{}:{authoredSourcePostureReview:validateAuthoredSourcePostureReview(record.authoredSourcePostureReview,record.sourceObservation,record.sourceMovementTimeline)}) }
}

// Trusted startup composition only. This owns newly authored review metadata,
// not source assets, source-use grants, candidate identities or target bindings.
export function validateMotionSourceReviewInputs(records) {
  if (!Array.isArray(records) || records.length>SOURCE_REVIEW_CATALOG_RECORD_LIMIT) invalid()
  const result=records.map(normalize)
  if(new Set(result.map(r=>r.sourceSha256)).size!==result.length) invalid()
  return result
}

function configureReviews({ resourceOwner, records }, catalogScope) {
  if (resourceAuthorizationActive()) throw Object.assign(new Error('Source reviews must be configured outside a request.'), {code:'SOURCE_REVIEW_BOOTSTRAP_REQUIRED'})
  const owner = resourceOwnerOf({resourceOwner})
  if (!owner || owner.kind === 'local' || !Array.isArray(records) || records.length > SOURCE_REVIEW_CATALOG_RECORD_LIMIT) invalid()
  const additions = validateMotionSourceReviewInputs(records), next = new Map(reviews)
  for (const record of additions) {
    const key = sha([catalogScope,owner,record.sourceSha256])
    const existing = next.get(key)
    if (existing && JSON.stringify(existing.record) !== JSON.stringify(record)) invalid()
    next.set(key,{resourceOwner:{...owner},record,catalogScope})
  }
  reviews = next
  return { configuredRecords:additions.length }
}

export function configureMotionSourceReviews(input) {
  return configureReviews(input, 'private')
}

// Explicit product publication at trusted startup. The publisher remains
// provenance; this does not grant access to any source asset or customer data.
export function configureBuiltInMotionSourceReviews(input) {
  return configureReviews(input, 'built-in')
}

const reviewId = item => 'cap_'+sha([
  item.catalogScope === 'built-in' ? 'builtin-source-review-v1' : 'source-review-v1',
  item.resourceOwner,item.record.sourceSha256,
]).slice(0,20)
const reviewVisible = item => item.catalogScope === 'built-in'
  || resourceAuthorizationActive() && canAccessResource(item)

export function publicMotionSourceReviews() {
  // Shared product descriptions support discovery. Private descriptions stay
  // filtered before projection, search, counts and fingerprints.
  return [...reviews.values()].filter(reviewVisible).map(item => {
    const r=item.record, observation=structuredClone(r.sourceObservation)
    const id=reviewId(item)
    return {
      id,
      family:'presenter-motion', label:r.authoredDescription.split('. ')[0],
      description:r.authoredDescription, sourceKind:'observed-motion-review',source:'observed-catalog',
      aliases:[...r.authoredSearchTerms],
      status:'unprepared-review', implemented:false,mvp:false,requiredForCompletion:false,
      availability:'OBSERVED_NOT_BOUND',selectable:false,coverageMode:'source-review',nativeModes:[],fallbackModes:[],
      measurements:{schemaVersion:SOURCE_REVIEW_MEASUREMENT_SCHEMA,timing:{...observation.clock},coordinateSpace:observation.coordinateSpace,units:{...observation.units},confidence:observation.confidence,...(r.sourceKinematics?{sourceKinematics:publicSourceReviewKinematics(r.sourceKinematics)}:{}),...(r.sourceMovementTimeline?{sourceMovementTimeline:publicSourceMovementTimeline(r.sourceMovementTimeline)}:{})},
      sourceReview:{schemaVersion:'betterpptx.source-authoring-review.v1',descriptionBasis:r.authoredSourcePostureReview?'ai-source-joint-posture-review':r.authoredVisualReview?'ai-rendered-preparation-review':'authored-nominal-hypothesis',...(r.authoredSourcePostureReview?{descriptionEvidence:publicAuthoredSourcePostureReview(r.authoredSourcePostureReview)}:r.authoredVisualReview?{descriptionEvidence:publicAuthoredVisualReview(r.authoredVisualReview)}:{}),descriptionMeasured:false,sourceObservation:observation,
        unqualified:['semantic-action','owning-hand','hold-phase','facing','contact','support','slide-direction','physical-scale','target-compatibility','prepared-target-clock','native-playback'],
        suggestedChecks:[...r.suggestedChecks],preparation:{state:'not-bound',candidateId:null,motionId:null,targetResource:null,executionAvailable:false},
        limitation:'This opaque catalog ID identifies review metadata. It is not a motion selector, prepared asset, source-use grant or universal target-compatibility claim.'},
      selection:{semanticKind:'presenter-motion',executionAvailable:false},
      route:{status:'review-required',discovery:['betterpptx.authoring.catalog'],composition:[],preparationRequired:true,
        preparationDiscovery:{tool:'betterpptx.motion.preparation_profiles.list',source:{kind:'review',id},requires:['targetModel','variant'],doesNotSelect:true,...(item.catalogScope==='built-in'&&builtInPreparedMotionLibrary()?.hasReview(id)?{compatibleTargetModels:builtInPreparedMotionLibrary().compatibleTargets(id)}:{})}},
    }
  })
}

// Private startup/publication lookup, restricted to product metadata. No
// customer review or asset grant can be obtained through this lookup.
export function builtInMotionSourceReview(id){
 const item=[...reviews.values()].find(item=>item.catalogScope==='built-in'&&reviewId(item)===id)
 return item?{reviewId:id,sourceSha256:item.record.sourceSha256,resourceOwner:structuredClone(item.resourceOwner)}:null
}

// Private exact-identity lookup; source hashes/observations never enter public
// preparation requests. The caller supplies only its own opaque review ID.
export function ownedMotionSourceReview(id) {
  if (!resourceAuthorizationActive() || !/^cap_[a-f0-9]{20}$/.test(id || '')) invalid()
  const item=[...reviews.values()].find(item=>reviewVisible(item)&&reviewId(item)===id)
  if(!item)throw Object.assign(new Error('The source review is unavailable.'),{code:'RESOURCE_NOT_FOUND'})
  return {reviewId:id,resourceOwner:structuredClone(item.resourceOwner),sourceSha256:item.record.sourceSha256,sourceObservation:structuredClone(item.record.sourceObservation),measurementArtifactSha256:item.record.sourceKinematics?.measurementArtifactSha256??null,...(item.catalogScope==='built-in'?{catalogScope:'built-in'}:{})}
}
