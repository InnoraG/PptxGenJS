import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertResourceAccess,currentResourceOwner,resourceOwnerOf} from './auth/resource-authorization.mjs';
import {createPreparationPlanner,ownerBindingKey,validateTrustedRecord} from './motion-preparation-planner.mjs';
import {validateMotionNormalizationContract} from './motion-preparation-normalization.mjs';
import {inspectNormalizedMotionGlb,preparationProducerSha256,prepareNormalizedMotionVariant} from './motion-preparation-worker.mjs';
import {assertTrustedMotionPreparationRepository,isMotionPreparationEligibilityRefusal,motionPreparationTargetResourceId as targetResourceId} from './motion-preparation-repository-contract.mjs';
import {MOTION_PREPARATION_RESOURCE_BUNDLE_SCHEMA_VERSION} from './motion-preparation-private-input-contract.mjs';

const PROFILE_SLUG='skinless-motion-x-sr-v1';
const HASH=/^[a-f0-9]{64}$/;
const CANDIDATE=/^candidate_[a-f0-9]{32}$/;
const TARGET=/^gen:\/\/rigged3d\/[a-f0-9]{40}$/;
const fail=(code='MOTION_PREPARATION_UNAVAILABLE')=>{throw Object.assign(new Error('Motion preparation is unavailable for this request.'),{code});};
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>sha(JSON.stringify(canonical(value)));
const copy=value=>structuredClone(value);

function ownValue(record,key){
 const descriptor=record&&Object.getOwnPropertyDescriptor(record,key);
 if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('MOTION_PREPARATION_INPUT_INVALID');
 return descriptor.value;
}
function closedRecord(record,keys){
 if(!record||typeof record!=='object'||Array.isArray(record)||Object.getPrototypeOf(record)!==Object.prototype
  ||Reflect.ownKeys(record).length!==keys.length||Reflect.ownKeys(record).some(key=>typeof key!=='string'||!keys.includes(key)))fail('MOTION_PREPARATION_INPUT_INVALID');
 for(const key of keys)ownValue(record,key);
 return record;
}
function ownerSnapshot(owner=currentResourceOwner()){
 const captured=Object.freeze(copy(owner));
 if(!['install','connector','session'].includes(captured?.kind)||!HASH.test(captured?.id||'')||!isDeepStrictEqual(captured,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
 return captured;
}
function resourceSnapshot(input,owner){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('PREPARATION_RESOURCE_UNAVAILABLE');
 const resourceId=ownValue(input,'resourceId'),contentSha256=ownValue(input,'contentSha256');
 const actualOwner=resourceOwnerOf(input);
 if(typeof resourceId!=='string'||resourceId.length<1||resourceId.length>2048||/[\\\x00-\x1f\x7f]/.test(resourceId)||resourceId.startsWith('/')||/^[a-z]:/i.test(resourceId)||/^(?:file|https?):/i.test(resourceId)||/(^|\/)\.\.(?:\/|$)/.test(resourceId)||!HASH.test(contentSha256)||!isDeepStrictEqual(actualOwner,owner))fail('PREPARATION_RESOURCE_UNAVAILABLE');
 assertResourceAccess(input,{kind:'motion resource'});
 return Object.freeze({resourceId,contentSha256,resourceOwner:Object.freeze(copy(actualOwner))});
}
function publicProfileId(query,owner,cacheKey){
 return `preparation_profile_${sha(`motion-preparation-profile.v1\0${ownerBindingKey(owner)}\0${JSON.stringify(query)}\0${cacheKey}\0${PROFILE_SLUG}`).slice(0,32)}`;
}
function sameDigest(actual,expected){return typeof expected==='string'&&HASH.test(expected)&&actual===expected;}
function sourceClockEqual(left,right){return isDeepStrictEqual(left,right);}
function normalizeBundle(bundle,request,owner){
 if(!bundle||typeof bundle!=='object'||Array.isArray(bundle)||bundle.schemaVersion!=='private-motion-preparation-resources.v1')fail('PREPARATION_RESOURCE_UNAVAILABLE');
 const record=validateTrustedRecord(bundle.record);
 if(record.candidateId!==request.candidateId||record.targetResourceId!==request.targetResourceId||record.ownerBindingKey!==ownerBindingKey(owner))fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
 const sourceOriginal=resourceSnapshot(bundle.sourceOriginal,owner),sourceMotion=resourceSnapshot(bundle.sourceMotion,owner),targetModel=resourceSnapshot(bundle.targetModel,owner),targetRest=resourceSnapshot(bundle.targetConstructionRest,owner);
 const normalization=closedRecord(ownValue(bundle,'normalizationReceipt'),['sourceSha256','sourceMotionSha256','producerSha256','contractSha256']);
 const normalizationContract=validateMotionNormalizationContract(ownValue(bundle,'normalizationContract'),{expected:{sourceSha256:record.identities.sourceSha256,targetRigSha256:record.identities.targetRigSha256,targetRestSha256:record.identities.targetRestSha256},sourceClock:record.sourceClock});
 if(!normalization||typeof normalization!=='object'||Array.isArray(normalization)
  ||!sameDigest(normalization.sourceSha256,record.identities.sourceSha256)
  ||!sameDigest(normalization.sourceMotionSha256,record.identities.sourceMotionSha256)
  ||!HASH.test(normalization.producerSha256||'')||!sameDigest(normalization.contractSha256,normalizationContract.contractSha256))fail('PREPARATION_EVIDENCE_UNAVAILABLE');
 if(!sameDigest(sourceOriginal.contentSha256,record.identities.sourceSha256)
  ||!sameDigest(sourceMotion.contentSha256,record.identities.sourceMotionSha256)
  ||!sameDigest(targetModel.contentSha256,record.identities.targetRigSha256)
  ||!sameDigest(targetRest.contentSha256,record.identities.targetRestSha256))fail('PREPARATION_INPUT_DRIFT');
 return Object.freeze({schemaVersion:MOTION_PREPARATION_RESOURCE_BUNDLE_SCHEMA_VERSION,record,sourceOriginal,sourceMotion,targetModel,targetConstructionRest:targetRest,normalizationReceipt:Object.freeze({sourceSha256:normalization.sourceSha256,sourceMotionSha256:normalization.sourceMotionSha256,producerSha256:normalization.producerSha256,contractSha256:normalization.contractSha256}),normalizationContract:Object.freeze({...normalizationContract}),workerNormalizationContract:Object.freeze(copy(ownValue(bundle,'normalizationContract')))});
}

/**
 * Compose the reviewed planner with trusted resource records, a bounded worker,
 * the existing fenced operation lifecycle, and the engine's owner-authorized cache.
 * `trustedRepository` is a server-only capability; it is never exposed in tools.
 */
export function createMotionPreparationRuntime({trustedRepository,cache,currentOwner=currentResourceOwner,catalogMetadataConcurrency}={}){
 if(catalogMetadataConcurrency!==undefined&&(!Number.isSafeInteger(catalogMetadataConcurrency)||catalogMetadataConcurrency<1||catalogMetadataConcurrency>64||(typeof trustedRepository?.resolvePreparationInputs!=='function'&&catalogMetadataConcurrency>8)))fail('MOTION_PREPARATION_REGISTRY_UNAVAILABLE');
 const catalogMetadataWidth=catalogMetadataConcurrency===undefined?32:catalogMetadataConcurrency;
 assertTrustedMotionPreparationRepository(trustedRepository);
 for(const method of ['getVerified','storeProduced','verifyReadback'])if(typeof cache?.[method]!=='function')fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
 if(typeof currentOwner!=='function')fail('MOTION_PREPARATION_REGISTRY_UNAVAILABLE');
 const targetByAlias=new Map(),profileFacts=new WeakMap(),eligibleProfilePlans=new WeakMap();
 function rememberTarget(owner,resourceId,targetModel){
  const key=indexKey(owner,resourceId),prior=targetByAlias.get(key);
  if(prior!==undefined&&prior.targetModel!==targetModel)fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
  if(prior){prior.references++;return ()=>releaseTarget(key);}
  if(targetByAlias.size>=128)fail('PREPARATION_REGISTRY_CAPACITY');
  targetByAlias.set(key,{targetModel,references:1});
  return ()=>releaseTarget(key);
 }
 function releaseTarget(key){const entry=targetByAlias.get(key);if(!entry)return;if(entry.references<=1)targetByAlias.delete(key);else entry.references--;}
 const captured=()=>ownerSnapshot(currentOwner());
 const indexKey=(owner,resourceId)=>`${ownerBindingKey(owner)}\0${resourceId}`;
 async function lookupCandidate(candidateId,owner){
  if(!CANDIDATE.test(candidateId))fail('MOTION_PREPARATION_INVALID');
  const item=await trustedRepository.lookupCandidate({candidateId,owner:copy(owner)});
  if(!item||item.candidateId!==candidateId||!isDeepStrictEqual(resourceOwnerOf(item),owner))fail('MOTION_PREPARATION_PROFILE_UNAVAILABLE');
  assertResourceAccess(item,{kind:'motion source'});
  return Object.freeze({candidateId,sourceKind:'candidate',resourceOwner:Object.freeze(copy(owner))});
 }
 async function lookupTarget(targetModel,owner){
  if(!TARGET.test(targetModel))fail('MOTION_PREPARATION_INVALID');
  const item=await trustedRepository.lookupTarget({targetModel,owner:copy(owner)});
  if(!item||!isDeepStrictEqual(resourceOwnerOf(item),owner))fail('MOTION_PREPARATION_PROFILE_UNAVAILABLE');
  assertResourceAccess(item,{kind:'motion target'});
  const id=targetResourceId(targetModel,owner);
  return Object.freeze({targetModelHandle:targetModel,targetResourceId:id,resourceOwner:Object.freeze(copy(owner))});
 }
 async function resolveBundleMetadata(request,owner,suppliedResponse){
  const response=suppliedResponse===undefined?await trustedRepository.resolvePreparationInput({candidateId:request.candidateId,targetModel:request.targetModel,variant:request.variant,owner:copy(owner),targetResourceId:request.targetResourceId}):suppliedResponse;
  const bundle=normalizeBundle(response,request,owner);
  const facts={record:bundle.record,sourceOriginal:bundle.sourceOriginal,sourceMotion:bundle.sourceMotion,targetModel:bundle.targetModel,targetConstructionRest:bundle.targetConstructionRest,normalizationReceipt:bundle.normalizationReceipt,normalizationContract:bundle.normalizationContract};
  if(await trustedRepository.verifyPreparationEvidence({facts:copy(facts),owner:copy(owner)})!==true)fail('PREPARATION_EVIDENCE_UNAVAILABLE');
  return {bundle,facts};
 }
 async function resolveBundle(request,owner){
  const {bundle,facts}=await resolveBundleMetadata(request,owner);
  const read=async(resource,maxBytes)=>{
   const access=await trustedRepository.authorizeResource({resource:copy(resource),owner:copy(owner)});
   if(access!==true||!isDeepStrictEqual(owner,currentResourceOwner()))fail('PREPARATION_RESOURCE_UNAVAILABLE');
   const bytes=await trustedRepository.readResourceBytes({resource:copy(resource),owner:copy(owner),maxBytes});
   if(!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>maxBytes||!isDeepStrictEqual(owner,currentResourceOwner())||!sameDigest(sha(bytes),resource.contentSha256))fail('PREPARATION_INPUT_DRIFT');
   return Buffer.from(bytes);
  };
  // Hash the exact original source, then release those bytes before reading the
  // three bounded GLB resources retained for this worker invocation.
  const original=await read(bundle.sourceOriginal,128*1024*1024);
  if(!sameDigest(sha(original),bundle.record.identities.sourceSha256))fail('PREPARATION_INPUT_DRIFT');
  const glbReadResults=await Promise.allSettled([
   read(bundle.sourceMotion,32*1024*1024),read(bundle.targetModel,64*1024*1024),read(bundle.targetConstructionRest,64*1024*1024),
  ]);
  for(const result of glbReadResults)if(result.status==='rejected')throw result.reason;
  const [sourceMotionBytes,targetGlbBytes,targetConstructionRestBytes]=glbReadResults.map(result=>result.value);
  const inspected=inspectNormalizedMotionGlb(sourceMotionBytes,bundle.record.sourceClock);
  if(!isDeepStrictEqual(inspected.animationProfile,bundle.record.animationProfile)
   ||!sameDigest(inspected.sha256,bundle.record.identities.sourceMotionSha256)
   ||!sourceClockEqual(inspected.clock,bundle.record.sourceClock))fail('PREPARATION_DOMAIN_UNSUPPORTED');
  if(!sameDigest(sha(targetGlbBytes),bundle.record.identities.targetRigSha256)||!sameDigest(sha(targetConstructionRestBytes),bundle.record.identities.targetRestSha256))fail('PREPARATION_INPUT_DRIFT');
  if(await trustedRepository.verifyPreparationEvidence({facts:copy(facts),owner:copy(owner)})!==true)fail('PREPARATION_EVIDENCE_UNAVAILABLE');
  const current=normalizeBundle(await trustedRepository.resolvePreparationInput({candidateId:request.candidateId,targetModel:request.targetModel,variant:request.variant,owner:copy(owner),targetResourceId:request.targetResourceId}),request,owner);
  if(!isDeepStrictEqual(bundle,current))fail('PREPARATION_INPUT_DRIFT');
  return Object.freeze({record:bundle.record,sourceMotionBytes,targetGlbBytes,targetConstructionRestBytes,sourceClock:copy(bundle.record.sourceClock),normalizationContract:bundle.workerNormalizationContract,expected:Object.freeze({sourceSha256:bundle.record.identities.sourceSha256,sourceMotionSha256:bundle.record.identities.sourceMotionSha256,targetRigSha256:bundle.record.identities.targetRigSha256,targetRestSha256:bundle.record.identities.targetRestSha256,normalizationContractSha256:bundle.normalizationContract.contractSha256}),normalizationProducerSha256:bundle.normalizationReceipt.producerSha256});
 }
 const createPlanner=(resolveMetadata=resolveBundleMetadata)=>createPreparationPlanner({
  currentResourceOwner:captured,
  resolveTrustedInput:async(command,owner)=>{
   const targetModel=targetByAlias.get(indexKey(owner,command.targetResourceId))?.targetModel;
   if(!targetModel)fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
   const request={candidateId:command.candidateId,targetResourceId:command.targetResourceId,targetModel,variant:command.variant};
   const {bundle}=await resolveMetadata(request,owner);
   for(const resource of [bundle.sourceOriginal,bundle.sourceMotion,bundle.targetModel,bundle.targetConstructionRest]){
    if(await trustedRepository.authorizeResource({resource:copy(resource),owner:copy(owner)})!==true||!isDeepStrictEqual(owner,currentResourceOwner()))fail('PREPARATION_RESOURCE_UNAVAILABLE');
   }
   profileFacts.set(owner,Object.freeze({normalizationProducerSha256:bundle.normalizationReceipt.producerSha256,normalizationContractSha256:bundle.normalizationContract.contractSha256,variant:command.variant}));
   return bundle.record;
  },
  resolveProfile:async(profileId,owner)=>{
   const facts=profileFacts.get(owner);
   if(profileId!==PROFILE_SLUG||!facts||facts.variant===undefined)fail('PREPARATION_PROFILE_UNAVAILABLE');
   const fs=await import('node:fs/promises');
   const mirrorProducerSha256=sha(await fs.readFile(new URL('./ir/animation-mirror.mjs',import.meta.url)));
   const retargetProducerSha256=sha(await fs.readFile(new URL('./ir/kinetic-transplant.mjs',import.meta.url)));
   return {
    id:PROFILE_SLUG,availability:'registered-private-worker',route:'source-first-motion-glb-then-rest-transfer',
    algorithm:'skeletal-bilateral-reflection',version:'motion-x-world-delta-v1',
    normalizationProducerSha256:facts.normalizationProducerSha256,mirrorProducerSha256,retargetProducerSha256,
    workerProducerSha256:preparationProducerSha256(),
    policy:{axis:'X',staticRest:'preserved',destinationLabels:'retained-anatomical',rotations:'S-R-S',translation:'reflect-X',retarget:'world-delta-construction-rest',rootMotion:'world-all-start',clock:'preserve-source-no-resampling',inputDomain:'normalized-skinless-source-motion',normalizationContractSha256:facts.normalizationContractSha256},
   };
  },
 });
 const planner=createPlanner();
 async function lookupSourceMetadata(input){
  const owner=captured();
  if(input?.kind==='candidate')return lookupCandidate(input.id,owner);
  if(input?.kind==='review')return lookupReview(input.id,owner);
  if(input?.kind==='model'){
   const model=await lookupTarget(input.id,owner);
   return Object.freeze({sourceKind:'model',targetModelHandle:model.targetModelHandle,resourceOwner:model.resourceOwner});
  }
  fail('MOTION_PREPARATION_INVALID');
 }
 async function lookupSourceReviewMetadataBatch(reviewIds){
  const owner=captured();if(!Array.isArray(reviewIds)||reviewIds.length>520||new Set(reviewIds).size!==reviewIds.length||reviewIds.some(id=>!/^cap_[a-f0-9]{20}$/.test(id))||typeof trustedRepository.lookupSourceReviewBindings!=='function')fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  const batch=await trustedRepository.lookupSourceReviewBindings({reviewIds:copy(reviewIds),owner:copy(owner)});if(batch?.lookupComplete!==true||!Array.isArray(batch.results)||batch.results.length!==reviewIds.length)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');const results=Array(reviewIds.length),pending=[];
  for(let index=0;index<reviewIds.length;index++){const resolved=batch.results[index],reviewId=reviewIds[index];if(resolved?.reviewId!==reviewId||!isDeepStrictEqual(resourceOwnerOf(resolved),owner))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');assertResourceAccess(resolved,{kind:'source review'});
   if(Object.hasOwn(resolved,'lookupError')){if(!['PREPARATION_REVIEW_SOURCE_DRIFT','PREPARATION_REVIEW_SOURCE_AMBIGUOUS'].includes(resolved.lookupError)||resolved.candidateId!==null||resolved.reviewBinding!==null)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');results[index]=Object.freeze({sourceKind:'review',reviewId,candidateId:null,reviewBindingState:'unavailable',reasonCode:resolved.lookupError,resourceOwner:copy(owner)});continue;}
   if(resolved.candidateId===null&&resolved.reviewBinding===null){results[index]=Object.freeze({sourceKind:'review',reviewId,candidateId:null,reviewBindingState:'missing',resourceOwner:copy(owner)});continue;}
   if(resolved.reviewBinding?.reviewId!==reviewId||resolved.reviewBinding?.candidateId!==resolved.candidateId||!['sourceSha256','observationSha256','candidateIdentitySha256'].every(key=>HASH.test(resolved.reviewBinding[key]||'')))fail('PREPARATION_REVIEW_SOURCE_DRIFT');pending.push({index,resolved,reviewId});
  }
  const width=typeof trustedRepository.lookupCandidates==='function'?64:8;
  for(let start=0;start<pending.length;start+=width){const issued=pending.slice(start,start+width);
   if(typeof trustedRepository.lookupCandidates==='function'){const ids=issued.map(row=>row.resolved.candidateId),rows=await trustedRepository.lookupCandidates({candidateIds:[...new Set(ids)],owner:copy(owner)});if(!Array.isArray(rows)||rows.length!==new Set(ids).size)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');const unique=[...new Set(ids)];for(let n=0;n<rows.length;n++){if(rows[n]?.candidateId!==unique[n]||!isDeepStrictEqual(resourceOwnerOf(rows[n]),owner))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');assertResourceAccess(rows[n],{kind:'motion source'});}for(const row of issued)results[row.index]=Object.freeze({sourceKind:'review',reviewId:row.reviewId,candidateId:row.resolved.candidateId,reviewBindingState:'unique',reviewBinding:copy(row.resolved.reviewBinding),resourceOwner:copy(owner)});}
   else{const settled=await Promise.allSettled(issued.map(async({resolved,reviewId})=>{await lookupCandidate(resolved.candidateId,owner);return Object.freeze({sourceKind:'review',reviewId,candidateId:resolved.candidateId,reviewBindingState:'unique',reviewBinding:copy(resolved.reviewBinding),resourceOwner:copy(owner)});}));for(let index=0;index<settled.length;index++){if(settled[index].status==='rejected')throw settled[index].reason;results[issued[index].index]=settled[index].value;}}
  }
  return {lookupComplete:true,results};
 }
 async function lookupTargetMetadata(handle){return lookupTarget(handle,captured());}
 async function lookupReview(reviewId,owner){
  if(!/^cap_[a-f0-9]{20}$/.test(reviewId)||typeof trustedRepository.lookupSourceReviewBinding!=='function')fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  const resolved=await trustedRepository.lookupSourceReviewBinding({reviewId,owner:copy(owner)});
  if(!resolved||resolved.reviewId!==reviewId||!isDeepStrictEqual(resourceOwnerOf(resolved),owner))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  assertResourceAccess(resolved,{kind:'source review'});
  if(resolved.candidateId===null&&resolved.reviewBinding===null)return Object.freeze({sourceKind:'review',reviewId,candidateId:null,reviewBindingState:'missing',resourceOwner:copy(owner)});
  await lookupCandidate(resolved.candidateId,owner);
  if(resolved.reviewBinding?.reviewId!==reviewId||resolved.reviewBinding?.candidateId!==resolved.candidateId||!['sourceSha256','observationSha256','candidateIdentitySha256'].every(key=>HASH.test(resolved.reviewBinding[key]||'')))fail('PREPARATION_REVIEW_SOURCE_DRIFT');
  return Object.freeze({sourceKind:'review',reviewId,candidateId:resolved.candidateId,reviewBindingState:'unique',reviewBinding:copy(resolved.reviewBinding),resourceOwner:copy(owner)});
 }
 async function planRequest({candidateId,targetModel,variant,profileId,owner,reviewBinding,requestPlanner=planner}){
  const capturedOwner=ownerSnapshot(owner),request={source:{kind:'candidate',id:candidateId},targetModel,variant};
  if(!['original','skeletal-mirrored'].includes(variant)||!TARGET.test(targetModel))fail('MOTION_PREPARATION_INVALID');
  const alias=targetResourceId(targetModel,capturedOwner),releaseTargetAlias=rememberTarget(capturedOwner,alias,targetModel);
  let plan;
  try{plan=await requestPlanner.plan({candidateId,targetResourceId:alias,variant,outputProfileId:PROFILE_SLUG});}
  finally{releaseTargetAlias();}
  const derivedId=publicProfileId(reviewBinding?{...request,source:{kind:'review',id:reviewBinding.reviewId}}:request,capturedOwner,plan.cacheKey);
  if(profileId!==undefined&&profileId!==derivedId)fail('MOTION_PREPARATION_PROFILE_UNAVAILABLE');
  return {plan,profileId:derivedId,privatePlan:{schemaVersion:'private-motion-preparation-bound-plan.v1',candidateId,targetResourceId:alias,targetModel,variant,profileId:derivedId,ownerBindingKey:ownerBindingKey(capturedOwner),plannerPlan:plan,...(reviewBinding?{reviewBinding:copy(reviewBinding)}:{})}};
 }
 async function planSource(source,target,variant,profileId,owner){
  if(!['candidate','review'].includes(source?.sourceKind)||!CANDIDATE.test(source.candidateId||'')||target?.targetModelHandle===undefined)fail('PREPARATION_DOMAIN_UNSUPPORTED');
  const planned=await planRequest({candidateId:source.candidateId,targetModel:target.targetModelHandle,variant,profileId,owner,reviewBinding:source.reviewBinding});
  return {cacheKey:planned.plan.cacheKey,variant:planned.plan.command.variant,sourceClock:planned.plan.sourceClock,privatePlan:planned.privatePlan};
 }
 function rememberEligibleProfile(planned,query,owner){
  const row={profileId:planned.profileId,owner:copy(owner),request:copy(query),capability:query.variant,sourceKind:query.source.kind,targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source'};
  eligibleProfilePlans.set(row,{row:copy(row),plan:{cacheKey:planned.plan.cacheKey,variant:planned.plan.command.variant,sourceClock:copy(planned.plan.sourceClock),privatePlan:copy(planned.privatePlan)}});
  return row;
 }
 async function listEligibleProfiles(query,owner){
  if(!['candidate','review'].includes(query?.source?.kind))return [];
  try{
   const candidate=query.source.kind==='review'?await lookupReview(query.source.id,owner):await lookupCandidate(query.source.id,owner);if(!candidate.candidateId)return [];
   const target=await lookupTarget(query.targetModel,owner);
   const planned=await planRequest({candidateId:candidate.candidateId,targetModel:target.targetModelHandle,variant:query.variant,owner,reviewBinding:candidate.reviewBinding});
   return [rememberEligibleProfile(planned,query,owner)];
  }catch(error){
   if(isMotionPreparationEligibilityRefusal(error))return [];
   throw error;
  }
 }
 function validateCatalogProfileRequest(query,owner,source,target){
  ownerSnapshot(owner);if(query?.source?.kind!=='review'||source?.sourceKind!=='review'||source.reviewBindingState!=='unique'||source.reviewId!==query.source.id||!CANDIDATE.test(source.candidateId||'')||source.reviewBinding?.reviewId!==source.reviewId||source.reviewBinding?.candidateId!==source.candidateId||!isDeepStrictEqual(resourceOwnerOf(source),owner)||target?.targetModelHandle!==query.targetModel||!isDeepStrictEqual(resourceOwnerOf(target),owner))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  assertResourceAccess(source,{kind:'source review'});assertResourceAccess(target,{kind:'motion target'});
 }
 async function listEligibleCatalogProfiles(query,owner,source,target,requestPlanner=planner){
  validateCatalogProfileRequest(query,owner,source,target);
  try{const planned=await planRequest({candidateId:source.candidateId,targetModel:target.targetModelHandle,variant:query.variant,owner,reviewBinding:source.reviewBinding,requestPlanner});
   return [rememberEligibleProfile(planned,query,owner)];
  }catch(error){
   if(isMotionPreparationEligibilityRefusal(error))return [];
   throw error;
  }
 }
 async function listEligibleCatalogProfilesBatch(queries,owner,sources,target){
  ownerSnapshot(owner);if(!Array.isArray(queries)||queries.length<1||queries.length>64||!Array.isArray(sources)||sources.length!==queries.length)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  if(typeof trustedRepository.resolvePreparationInputs!=='function'){const results=[];for(let start=0;start<queries.length;start+=8){const settled=await Promise.allSettled(queries.slice(start,start+8).map((query,n)=>listEligibleCatalogProfiles(query,copy(owner),sources[start+n],target)));for(const item of settled){if(item.status==='rejected')throw item.reason;results.push(item.value);}}return results;}
  const requests=queries.map((query,n)=>{const source=sources[n];validateCatalogProfileRequest(query,owner,source,target);return {candidateId:source.candidateId,targetModel:query.targetModel,targetResourceId:targetResourceId(query.targetModel,owner),variant:query.variant};});
  const rows=await trustedRepository.resolvePreparationInputs({requests:copy(requests),owner:copy(owner)});if(!Array.isArray(rows)||rows.length!==requests.length)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
  const results=[];for(let start=0;start<queries.length;start+=catalogMetadataWidth){const settled=await Promise.allSettled(queries.slice(start,start+catalogMetadataWidth).map(async(query,n)=>{const index=start+n,row=rows[index],request=requests[index];if(!row||['candidateId','targetModel','targetResourceId','variant'].some(key=>row[key]!==request[key]))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');if(row.bundle===null){if(!isMotionPreparationEligibilityRefusal({code:row.reasonCode}))fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');return [];}
    const local=createPlanner((inner,scope)=>resolveBundleMetadata(inner,scope,row.bundle));return listEligibleCatalogProfiles(query,copy(owner),sources[index],target,local);
   }));for(const item of settled){if(item.status==='rejected')throw item.reason;results.push(item.value);}}
  ownerSnapshot(owner);return results;
 }
 async function readWorkerInputs(privatePlan,owner){
  if(!privatePlan||privatePlan.schemaVersion!=='private-motion-preparation-bound-plan.v1'||privatePlan.ownerBindingKey!==ownerBindingKey(owner)||privatePlan.plannerPlan?.ownerBindingKey!==privatePlan.ownerBindingKey)fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
  const request={candidateId:privatePlan.candidateId,targetResourceId:privatePlan.targetResourceId,targetModel:privatePlan.targetModel,variant:privatePlan.variant};
  if(privatePlan.reviewBinding){const current=await lookupReview(privatePlan.reviewBinding.reviewId,owner);if(!isDeepStrictEqual(current.reviewBinding,privatePlan.reviewBinding))fail('PREPARATION_REVIEW_SOURCE_DRIFT');}
  const resolved=await resolveBundle(request,owner);
  const releaseTargetAlias=rememberTarget(owner,privatePlan.targetResourceId,privatePlan.targetModel);
  let rebuilt;
  try{rebuilt=await planner.revalidate(privatePlan.plannerPlan);}
  finally{releaseTargetAlias();}
  if(rebuilt.planDigest!==privatePlan.plannerPlan.planDigest)fail('PREPARATION_INPUT_DRIFT');
  return resolved;
 }
 async function beginPreparedProfileLookup(query,owner,profileId,authorizedContext,eligibleProfile){
  query=copy(query);
  const capturedOwner=ownerSnapshot(owner);
  const resolve=async()=>planSource(await lookupSourceMetadata(query.source),await lookupTargetMetadata(query.targetModel),query.variant,profileId,capturedOwner);
  // Direct discovery already resolved these resources in this request. Reuse
  // that starting point; the fresh resolve below still checks current bindings.
  if(authorizedContext!==undefined){
   closedRecord(authorizedContext,['source','target']);
   const {source,target}=authorizedContext;
   if(!isDeepStrictEqual(resourceOwnerOf(source),capturedOwner)||!isDeepStrictEqual(resourceOwnerOf(target),capturedOwner)
    ||target?.targetModelHandle!==query.targetModel||source?.sourceKind!==query.source.kind
    ||(query.source.kind==='candidate'?source.candidateId!==query.source.id:
      query.source.kind!=='review'||source.reviewId!==query.source.id||source.reviewBindingState!=='unique'
      ||source.reviewBinding?.reviewId!==query.source.id||source.reviewBinding?.candidateId!==source.candidateId))fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
   assertResourceAccess(source,{kind:'motion source'});assertResourceAccess(target,{kind:'motion target'});
  }
  let retained;
  if(eligibleProfile!==undefined){
   retained=eligibleProfilePlans.get(eligibleProfile);eligibleProfilePlans.delete(eligibleProfile);
   if(!retained||!isDeepStrictEqual(retained.row,eligibleProfile)||retained.row.profileId!==profileId
    ||!isDeepStrictEqual(retained.row.owner,capturedOwner)||!isDeepStrictEqual(retained.row.request,query))fail('PREPARATION_PROFILE_UNAVAILABLE');
  }
  const plan=retained?copy(retained.plan):authorizedContext===undefined?await resolve():await planSource(authorizedContext.source,authorizedContext.target,query.variant,profileId,capturedOwner);
  const output=await cache.getVerifiedOutput({plan:copy(plan),owner:copy(capturedOwner)});
  ownerSnapshot(capturedOwner);
  let consumed=false;
  return async()=>{
  if(consumed)fail('PREPARATION_PROFILE_UNAVAILABLE');consumed=true;ownerSnapshot(capturedOwner);
  const current=await resolve();
  if(!isDeepStrictEqual(current,plan))fail('PREPARATION_INPUT_DRIFT');
  if(!output)return {state:'not-prepared'};
  if(await cache.verifyReadback({prepared:output.prepared,plan:copy(current),owner:copy(capturedOwner)})!==true)fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
  ownerSnapshot(capturedOwner);
  return {state:'prepared',modelAsset:output.modelAsset,preparedVariantId:output.prepared.preparedVariantId,variant:plan.variant,sourceClock:{...plan.sourceClock,retimed:false},nativeQualification:'unqualified'};
  };
 }
 async function lookupPreparedProfile(query,owner,profileId,authorizedContext,eligibleProfile){
  const finish=await beginPreparedProfileLookup(query,owner,profileId,authorizedContext,eligibleProfile);return finish();
 }
 const dependencies={
  lookupSourceMetadata,lookupTargetMetadata,lookupSourceReviewMetadataBatch,
  ...(typeof cache.getVerifiedOutput==='function'?{lookupPreparedProfile,beginPreparedProfileLookup}:{}),
  planSource:async(source,target,variant,profileId,owner)=>planSource(source,target,variant,profileId,owner),
  listEligibleProfiles,listEligibleCatalogProfiles,listEligibleCatalogProfilesBatch,
  authorizeBudget:async()=>true,
  prepareCached:async({plan,owner,lease,operation,assertLease})=>{
   if(!lease?.leaseToken||!operation||operation.state!=='running'||!isDeepStrictEqual(resourceOwnerOf(operation),owner)||typeof assertLease!=='function')fail('OPERATION_LEASE_STALE');
   await assertLease();
   const inputs=await readWorkerInputs(plan.privatePlan,owner);
   const cached=await cache.getVerified({plan:copy(plan),owner:copy(owner)});
   if(cached){await readWorkerInputs(plan.privatePlan,owner);await assertLease();return cached;}
   const output=prepareNormalizedMotionVariant({sourceMotionBytes:inputs.sourceMotionBytes,targetGlbBytes:inputs.targetGlbBytes,targetConstructionRestBytes:inputs.targetConstructionRestBytes,sourceClock:inputs.sourceClock,variant:plan.variant,expected:inputs.expected,normalizationContract:inputs.normalizationContract});
   const current=await readWorkerInputs(plan.privatePlan,owner);
   if(!isDeepStrictEqual(current.record,inputs.record))fail('PREPARATION_INPUT_DRIFT');
   await assertLease();
   return cache.storeProduced({plan:copy(plan),owner:copy(owner),operation:copy(operation),output});
  },
  verifyPreparedArtifact:(prepared,plan,owner)=>cache.verifyReadback({prepared:copy(prepared),plan:copy(plan),owner:copy(owner)}),
 };
 return Object.freeze({dependencies:Object.freeze(dependencies),planner,readWorkerInputs,profileIdFor:publicProfileId,targetResourceIdFor:targetResourceId});
}
