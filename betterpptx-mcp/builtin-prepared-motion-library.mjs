import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validatePreparedOutput} from './motion-prepared-output.mjs';
import {validatePreparedNativeAsset} from './motion-preparation-native-asset.mjs';
import {resolvePreparedMotionScene} from './prepared-motion-scene-contract.mjs';

const H64=/^[a-f0-9]{64}$/, H40=/^[a-f0-9]{40}$/;
const MODEL=/^gen:\/\/rigged3d\/[a-f0-9]{40}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code='BUILTIN_PREPARED_MOTION_UNAVAILABLE')=>{throw Object.assign(new Error('The published prepared motion is unavailable.'),{code});};
function closed(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!keys.includes(k)))fail();
 for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if(!d.enumerable||!Object.hasOwn(d,'value'))fail();
}
const tuple=(reviewId,targetModel,variant)=>JSON.stringify([reviewId,targetModel,variant]);
const entryKeys=['reviewId','candidateId','sourceSha256','targetModel','variant','cacheKey','preparedOutput','storage','assetBundle','outputSha256','preparationBundleDigest','targetRigSha256','targetRestSha256'];

/** Trusted startup publication only. loadAsset(storage) verifies the pinned
 * record generation and recordSha256 before returning normalized asset data.
 * Neither publication nor storage is accepted from a public tool request. */
export function createBuiltInPreparedMotionLibrary({publication,loadAsset,bundleBytes,cache}={}){
 if([loadAsset,bundleBytes,cache].some(fn=>typeof fn!=='function'))fail();
 closed(publication,['schemaVersion','catalogId','catalogPayloadSha256','entries']);
 if(publication.schemaVersion!=='betterpptx.builtin-prepared-motion-catalog.v1'||typeof publication.catalogId!=='string'||!publication.catalogId.trim()||publication.catalogId.length>200||!H64.test(publication.catalogPayloadSha256)||!Array.isArray(publication.entries)||publication.entries.length>520)fail();
 const catalogId=publication.catalogId,catalogPayloadSha256=publication.catalogPayloadSha256;
 const byTuple=new Map(),byHandle=new Map();
 for(const input of publication.entries){
  closed(input,entryKeys);
  if(!/^cap_[a-f0-9]{20}$/.test(input.reviewId)||!/^candidate_[a-f0-9]{32}$/.test(input.candidateId)||!MODEL.test(input.targetModel)||!['original','skeletal-mirrored'].includes(input.variant)||!['sourceSha256','cacheKey','outputSha256','preparationBundleDigest','targetRigSha256','targetRestSha256'].every(k=>H64.test(input[k])))fail();
  closed(input.storage,['tenantId','hash','recordGeneration','recordSha256']);
  const s=input.storage;
  if(typeof s.tenantId!=='string'||!s.tenantId||s.tenantId.length>200||!H40.test(s.hash)||typeof s.recordGeneration!=='string'||!/^[1-9][0-9]{0,39}$/.test(s.recordGeneration)||!H64.test(s.recordSha256))fail();
  closed(input.assetBundle,['sha256','bytes']);
  if(!H64.test(input.assetBundle.sha256)||!Number.isSafeInteger(input.assetBundle.bytes)||input.assetBundle.bytes<1||input.assetBundle.bytes>268435456)fail();
  const output=validatePreparedOutput(input.preparedOutput,input.variant);
  if(output.state!=='prepared'||output.modelAsset!==`gen://rigged3d/${s.hash}`)fail();
  const row=structuredClone(input),key=tuple(row.reviewId,row.targetModel,row.variant),prior=byHandle.get(output.modelAsset);
  if(byTuple.has(key))fail();
  // One shared transport handle cannot authorize conflicting bytes or clocks.
  if(prior&&!isDeepStrictEqual({...prior,reviewId:null,candidateId:null,sourceSha256:null,targetModel:null,cacheKey:null,preparationBundleDigest:null,targetRigSha256:null,targetRestSha256:null},{...row,reviewId:null,candidateId:null,sourceSha256:null,targetModel:null,cacheKey:null,preparationBundleDigest:null,targetRigSha256:null,targetRestSha256:null}))fail();
  byTuple.set(key,row);byHandle.set(output.modelAsset,row);
 }
 const hydrated=new Map(),inFlight=new Map();let retainedBytes=0;
 function remember(handle,asset){
  const size=asset.manifest.outputBytes+Math.ceil((asset.previewBase64?.length??0)*3/4);
  hydrated.set(handle,asset);retainedBytes+=size;
  while(hydrated.size>12||retainedBytes>64*1024*1024){
   const oldest=hydrated.keys().next().value,entry=hydrated.get(oldest);
   retainedBytes-=entry.manifest.outputBytes+Math.ceil((entry.previewBase64?.length??0)*3/4);hydrated.delete(oldest);
  }
 }
 function verifiedBundle(row,bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length!==row.assetBundle.bytes||sha(bytes)!==row.assetBundle.sha256)fail('BUILTIN_PREPARED_MOTION_CONTENT_MISMATCH');
  return bytes;
 }
 function verifyEntry(row,asset){
  validatePreparedNativeAsset(asset);
  const expectedClock={...row.preparedOutput.sourceClock};delete expectedClock.retimed;
  const bytes=Buffer.from(asset.glbBase64,'base64'),m=asset.manifest;
  if(m.preparedVariantId!==row.preparedOutput.preparedVariantId||m.variant!==row.variant||!isDeepStrictEqual(m.sourceClock,expectedClock)||sha(bytes)!==row.outputSha256)fail('BUILTIN_PREPARED_MOTION_CONTENT_MISMATCH');
  resolvePreparedMotionScene(asset,{preparedVariantId:m.preparedVariantId});
  verifiedBundle(row,bundleBytes(asset));return asset;
 }
 async function hydrateAsset(hash){
  const handle=`gen://rigged3d/${hash}`,row=byHandle.get(handle);
  if(!row)return null;
  if(hydrated.has(handle))return verifyEntry(row,hydrated.get(handle));
  if(inFlight.has(handle))return inFlight.get(handle);
  const work=(async()=>{
   const asset=await loadAsset(structuredClone(row.storage));
   if(!asset)fail();
   verifyEntry(row,asset);
   const result=cache(hash,asset);
   if(!result)fail();
   verifyEntry(row,result);remember(handle,result);return result;
  })();
  inFlight.set(handle,work);
  try{return await work;}finally{if(inFlight.get(handle)===work)inFlight.delete(handle);}
 }
 function assertAssetBytes(handle,bytes){
  const row=byHandle.get(handle);if(!row)fail();
  const retained=hydrated.get(handle);if(retained)verifyEntry(row,retained);
  return verifiedBundle(row,bytes);
 }
 async function discoverProfiles(input,{assessOutput=true}={}){
  closed(input,['source','targetModel','variant']);closed(input.source,['kind','id']);
  if(input.source.kind!=='review'||!/^cap_[a-f0-9]{20}$/.test(input.source.id)||!MODEL.test(input.targetModel)||!['original','skeletal-mirrored'].includes(input.variant))fail('MOTION_PREPARATION_INVALID');
  const base={schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'review',variant:input.variant},profiles:[]};
  const row=byTuple.get(tuple(input.source.id,input.targetModel,input.variant));
  if(!row)return {...base,reasonCode:'NO_QUALIFIED_PREPARATION_PROFILE'};
  if(assessOutput)await hydrateAsset(row.storage.hash);
  const profileId='preparation_profile_'+sha(JSON.stringify(['builtin-prepared-motion-profile.v1',catalogId,catalogPayloadSha256,row.reviewId,row.targetModel,row.variant,row.cacheKey,row.assetBundle.sha256])).slice(0,32);
  return {...base,state:'eligible-profiles',profiles:[{profileId,capability:row.variant,sourceKind:'review',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source',preparationMode:'reuse-only',lifecycle:{selectability:'not-selectable',nativeQualification:'unqualified'},preparedOutput:assessOutput?structuredClone(row.preparedOutput):{state:'not-assessed'}}]};
 }
 return Object.freeze({isPublishedHandle:handle=>byHandle.has(handle),hasReview:id=>[...byTuple.values()].some(row=>row.reviewId===id),isPublishedTarget:model=>[...byTuple.values()].some(row=>row.targetModel===model),compatibleTargets:id=>[...new Set([...byTuple.values()].filter(row=>row.reviewId===id).map(row=>row.targetModel))],assertAssetBytes,hydrateAsset,discoverProfiles});
}
