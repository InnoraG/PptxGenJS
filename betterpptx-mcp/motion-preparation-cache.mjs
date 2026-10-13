import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {ownerBindingKey} from './motion-preparation-planner.mjs';

const HASH=/^[a-f0-9]{64}$/;
const PREPARED=/^prepared_variant_[a-f0-9]{32}$/;
const fail=(code='MOTION_PREPARATION_CACHE_UNAVAILABLE')=>{throw Object.assign(new Error('Motion preparation is unavailable for this request.'),{code});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownerTenant=owner=>`motion-preparation-${ownerBindingKey(owner)}`;

function preparedId(owner,cacheKey){return `prepared_variant_${sha(`betterpptx.prepared-motion.v1\0${ownerBindingKey(owner)}\0${cacheKey}`).slice(0,32)}`;}
function outputBasis(owner,cacheKey){return `betterpptx.private-motion-preparation.v1:${ownerBindingKey(owner)}:${cacheKey}`;}
function expectedHash(owner,cacheKey){return sha(`local:${outputBasis(owner,cacheKey)}`).slice(0,40);}
function isPreparedManifest(manifest){
 const keys=['contract','preparedVariantId','variant','sourceClock','outputBytes'];
 return Boolean(manifest&&typeof manifest==='object'&&!Array.isArray(manifest)&&Object.getPrototypeOf(manifest)===Object.prototype
  &&Reflect.ownKeys(manifest).length===keys.length&&Reflect.ownKeys(manifest).every(key=>typeof key==='string'&&keys.includes(key))
  &&keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(manifest,key);return descriptor&&Object.hasOwn(descriptor,'value')}));
}
function manifestFor(plan,owner,output){
 const p=plan?.privatePlan?.plannerPlan;
 if(!p||p.cacheKey!==plan.cacheKey||plan.variant!==p.command.variant||!HASH.test(plan.cacheKey)||!['original','skeletal-mirrored'].includes(plan.variant))fail('MOTION_PREPARATION_CACHE_IDENTITY_INVALID');
 if(!Buffer.isBuffer(output?.glb)||output.glb.length<1||output.glb.length!==output.outputBytes||sha(output.glb)!==output.outputSha256||!isDeepStrictEqual(output.sourceClock,p.sourceClock)||output.variant!==plan.variant)fail('MOTION_PREPARATION_OUTPUT_INVALID');
 const id=preparedId(owner,plan.cacheKey);
 return {preparedVariantId:id,outputSha256:output.outputSha256,outputBytes:output.outputBytes,manifest:{
  contract:'betterpptx.motion-prepared-output.v1',preparedVariantId:id,variant:plan.variant,
  sourceClock:p.sourceClock,outputBytes:output.outputBytes,
 }};
}

/**
 * Adapter for the engine's existing generated-GLB cache, durable tenant store,
 * and asset-grant protocol. The generated cache is content storage only; a
 * read is returned only after the current owner grant and actual bytes verify.
 */
export function createGeneratedMotionPreparationCache({currentResourceOwner,assetGrants,getCached,getStaged,hydrate,registerLocal,persist,bundleBytes,produceOutput}={}){
 for(const fn of [currentResourceOwner,getCached,getStaged,hydrate,registerLocal,persist,bundleBytes,produceOutput])if(typeof fn!=='function')fail();
 for(const method of ['assertAccess','assertBytesSync'])if(typeof assetGrants?.[method]!=='function')fail();
 const persistedThisProcess=new Set();
 function rememberPersisted(hash){
  persistedThisProcess.delete(hash);persistedThisProcess.add(hash);
  while(persistedThisProcess.size>512)persistedThisProcess.delete(persistedThisProcess.values().next().value);
 }
 const handleFor=(owner,cacheKey)=>`gen://rigged3d/${expectedHash(owner,cacheKey)}`;
 function project(entry,owner,plan){
  const actual=Buffer.from(entry?.glbBase64||'','base64');
  const manifest=entry?.manifest;
  const id=preparedId(owner,plan.cacheKey),p=plan.privatePlan?.plannerPlan;
  if(!p||p.cacheKey!==plan.cacheKey||plan.variant!==p.command.variant||!isPreparedManifest(manifest)
   ||manifest.contract!=='betterpptx.motion-prepared-output.v1'||manifest.preparedVariantId!==id
   ||manifest.variant!==plan.variant||!isDeepStrictEqual(manifest.sourceClock,plan.sourceClock)
   ||!Number.isSafeInteger(manifest.outputBytes)||manifest.outputBytes<1||actual.length!==manifest.outputBytes)return null;
  return {preparedVariantId:id,cacheKey:plan.cacheKey,outputSha256:sha(actual),outputBytes:actual.length,sourceClock:manifest.sourceClock,variant:manifest.variant};
 }
 async function verifiedEntry(plan,owner){
  const hash=expectedHash(owner,plan.cacheKey),handle=handleFor(owner,plan.cacheKey),tenant=ownerTenant(owner);
  try{await assetGrants.assertAccess(handle);}
  catch(error){if(error?.code==='ASSET_NOT_FOUND')return null;throw error;}
  let entry=getCached(hash);
  if(!entry||!persistedThisProcess.has(hash)){
   entry=await hydrate(hash,tenant);
   if(!entry)return null;
   rememberPersisted(hash);
  }
  const prepared=project(entry,owner,plan);if(!prepared)return null;
  assetGrants.assertBytesSync(handle,bundleBytes(entry));
  const actual=Buffer.from(entry.glbBase64,'base64');
  if(actual.length!==prepared.outputBytes||sha(actual)!==prepared.outputSha256)return null;
  return {prepared,entry,handle,bytes:actual};
 }
 return Object.freeze({
  async getVerifiedOutput({plan,owner}){
   if(!isDeepStrictEqual(owner,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
   const found=await verifiedEntry(plan,owner);
   if(!isDeepStrictEqual(owner,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
   return found?{prepared:found.prepared,modelAsset:found.handle}:null;
  },
  async getVerified({plan,owner}){
   if(!isDeepStrictEqual(owner,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
   const found=await verifiedEntry(plan,owner);return found?.prepared||null;
  },
  async storeProduced({plan,owner,operation,output}){
   if(!isDeepStrictEqual(owner,currentResourceOwner())||!operation||operation.state!=='running'
    ||!isDeepStrictEqual(operation.metadata?.resourceOwner,owner))fail('OPERATION_LEASE_STALE');
   const evidence=manifestFor(plan,owner,output),basisKey=outputBasis(owner,plan.cacheKey);
   const registered=registerLocal({glbBase64:output.glb.toString('base64'),glbBytes:output.outputBytes,manifest:evidence.manifest,basisKey});
   const hash=registered?.hash,handle=registered?.handle;
   if(hash!==expectedHash(owner,plan.cacheKey)||handle!==handleFor(owner,plan.cacheKey))fail('MOTION_PREPARATION_CACHE_IDENTITY_INVALID');
  const entry=getStaged(hash);if(!entry)fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
   const grantResult=await produceOutput({operation,handle,bytes:bundleBytes(entry)});
   if(grantResult!==true)fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
   const saved=await persist(hash,ownerTenant(owner));
   if(saved?.ok!==true)fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
   rememberPersisted(hash);
   const found=await verifiedEntry(plan,owner);
   if(!found||!isDeepStrictEqual(found.bytes,output.glb))fail('MOTION_PREPARATION_OUTPUT_INVALID');
   return found.prepared;
  },
  async verifyReadback({prepared,plan,owner}){
   if(!isDeepStrictEqual(owner,currentResourceOwner()))return false;
   const found=await verifiedEntry(plan,owner);
   return Boolean(found&&isDeepStrictEqual(found.prepared,prepared)&&PREPARED.test(found.prepared.preparedVariantId)
    &&found.bytes.length===prepared.outputBytes&&sha(found.bytes)===prepared.outputSha256);
  },
  async readVerifiedBytes({prepared,plan,owner}){
   if(!isDeepStrictEqual(owner,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
   const found=await verifiedEntry(plan,owner);
   if(!found||!isDeepStrictEqual(found.prepared,prepared))fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
   return Buffer.from(found.bytes);
  },
  async readVerifiedModelAsset({prepared,plan,owner}){
   if(!isDeepStrictEqual(owner,currentResourceOwner()))fail('RESOURCE_IDENTITY_REQUIRED');
   const found=await verifiedEntry(plan,owner);
   if(!found||!isDeepStrictEqual(found.prepared,prepared))fail('MOTION_PREPARATION_CACHE_UNAVAILABLE');
   return found.handle;
  },
 });
}
