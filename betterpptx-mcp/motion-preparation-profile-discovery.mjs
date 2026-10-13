import {isDeepStrictEqual} from 'node:util';
import {attachPreparedOutputs} from './motion-prepared-output.mjs';
import {currentResourceOwner,resourceOwnerForContext,assertResourceAccess,resourceOwnerOf} from './auth/resource-authorization.mjs';

const PROFILE=/^preparation_profile_[a-f0-9]{32}$/;
const MODEL=/^gen:\/\/rigged3d\/[a-f0-9]{40}$/;
const CANDIDATE=/^candidate_[a-f0-9]{32}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=(code='MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE')=>Object.assign(
 new Error(code==='MOTION_PREPARATION_INVALID'?'The motion profile discovery request is unsupported.':'Eligible motion-preparation profiles are unavailable for this request.'),
 {code},
);
function closed(value,names,code='MOTION_PREPARATION_INVALID'){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail(code);
 const keys=Reflect.ownKeys(value);
 if(keys.length!==names.length||keys.some(key=>typeof key!=='string'||!names.includes(key)))throw fail(code);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw fail(code);}
}
function publicQuery(input){
 closed(input,['source','targetModel','variant']);closed(input.source,['kind','id']);
 if(!['candidate','model','review'].includes(input.source.kind)
  ||!(input.source.kind==='candidate'?CANDIDATE:input.source.kind==='review'?/^cap_[a-f0-9]{20}$/:MODEL).test(input.source.id)
  ||!MODEL.test(input.targetModel)||!['original','skeletal-mirrored'].includes(input.variant))throw fail('MOTION_PREPARATION_INVALID');
 return structuredClone({source:input.source,targetModel:input.targetModel,variant:input.variant});
}
function ownerSnapshot(context){
 const owner=Object.freeze(structuredClone(currentResourceOwner()));
 if(!['install','connector','session'].includes(owner?.kind)||!HASH.test(owner?.id||''))throw fail('RESOURCE_IDENTITY_REQUIRED');
 if(!isDeepStrictEqual(owner,resourceOwnerForContext(context||{})))throw fail('RESOURCE_IDENTITY_REQUIRED');
 return owner;
}
function validateRecords(records,query,owner){
 if(!Array.isArray(records)||records.length>64||Object.getPrototypeOf(records)!==Array.prototype)throw fail();
 const ids=new Set(),profiles=[];
 for(let index=0;index<records.length;index++){
  if(!Object.hasOwn(records,index))throw fail();
  const entry=records[index];
  closed(entry,['profileId','owner','request','capability','sourceKind','targetCompatibility','sourceClockPolicy']);
  if(!PROFILE.test(entry.profileId)||ids.has(entry.profileId)||!isDeepStrictEqual(entry.owner,owner)
   ||!isDeepStrictEqual(entry.request,query)||entry.capability!==query.variant
   ||entry.sourceKind!==query.source.kind||entry.targetCompatibility!=='verified-for-request'
   ||entry.sourceClockPolicy!=='preserve-source')throw fail();
  ids.add(entry.profileId);
  profiles.push({profileId:entry.profileId,capability:entry.capability,sourceKind:entry.sourceKind,
   targetCompatibility:entry.targetCompatibility,sourceClockPolicy:entry.sourceClockPolicy,
   lifecycle:{selectability:'not-selectable',nativeQualification:'unqualified'}});
 }
 return {schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:profiles.length?'eligible-profiles':'none-eligible',request:{sourceKind:query.source.kind,variant:query.variant},profiles,...(profiles.length?{}:{reasonCode:'NO_QUALIFIED_PREPARATION_PROFILE'})};
}

// The injected registry is private startup state. It receives the exact
// AI-chosen source/target/variant and authenticated owner; no public tool can
// register a profile or add internal registry fields to its result.
export function createMotionPreparationProfileDiscovery({listEligibleProfiles,listEligibleCatalogProfiles,lookupSourceMetadata,lookupTargetMetadata,lookupPreparedProfile}){
 if(typeof listEligibleProfiles!=='function'||typeof lookupSourceMetadata!=='function'||typeof lookupTargetMetadata!=='function')throw fail();
 return async function discover(input,context){
  const query=publicQuery(input),owner=ownerSnapshot(context);
  try{
   const source=await lookupSourceMetadata(structuredClone(query.source));
   assertResourceAccess(source,{kind:'motion source'});
   if(!isDeepStrictEqual(owner,resourceOwnerOf(source)))throw fail();
   if(query.source.kind==='review'&&source.reviewBindingState==='missing')return {schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'review',variant:query.variant},profiles:[],reasonCode:'SOURCE_REGISTRATION_REQUIRED'};
   const target=await lookupTargetMetadata(query.targetModel);
   assertResourceAccess(target,{kind:'motion target'});
   if(!isDeepStrictEqual(owner,resourceOwnerOf(target)))throw fail();
   // Reuse this request's already authorized review binding. The shared catalog
   // planner still checks current preparation evidence and resource access.
   const records=query.source.kind==='review'&&typeof listEligibleCatalogProfiles==='function'
    ?await listEligibleCatalogProfiles(structuredClone(query),owner,source,target)
    :await listEligibleProfiles(structuredClone(query),owner);
   ownerSnapshot(context);
   const outputLookup=typeof lookupPreparedProfile==='function'?(input,scope,profileId)=>lookupPreparedProfile(input,scope,profileId,{source,target},records.find(record=>record.profileId===profileId)):undefined;
   const result=await attachPreparedOutputs(validateRecords(records,query,owner),query,owner,outputLookup);
   ownerSnapshot(context);
   return result;
  }catch(error){if(['PREPARATION_REVIEW_SOURCE_DRIFT','PREPARATION_REVIEW_SOURCE_AMBIGUOUS','PREPARATION_REVIEW_LOOKUP_UNAVAILABLE'].includes(error?.code))throw fail(error.code);throw fail();}
 };
}

export function createMotionPreparationCatalogDiscovery({listEligibleProfiles,listEligibleCatalogProfiles,listEligibleCatalogProfilesBatch,lookupSourceReviewMetadataBatch,lookupTargetMetadata,lookupPreparedProfile,beginPreparedProfileLookup,withPlanningReads,withVerificationReads}){
 if([listEligibleProfiles,lookupSourceReviewMetadataBatch,lookupTargetMetadata].some(value=>typeof value!=='function'))throw fail();
 return async function discoverCatalog(input,context,displayed){
  closed(input,['reviewIds','targetModel','variant']);if(!Array.isArray(input.reviewIds)||input.reviewIds.length>520||new Set(input.reviewIds).size!==input.reviewIds.length||input.reviewIds.some(id=>!/^cap_[a-f0-9]{20}$/.test(id))||!MODEL.test(input.targetModel)||!['original','skeletal-mirrored'].includes(input.variant))throw fail('MOTION_PREPARATION_INVALID');
  if(displayed!==undefined){closed(displayed,['reviewIds','onPreparedResult']);if(!Array.isArray(displayed.reviewIds)||displayed.reviewIds.length>16||new Set(displayed.reviewIds).size!==displayed.reviewIds.length||displayed.reviewIds.some(id=>!input.reviewIds.includes(id))||typeof displayed.onPreparedResult!=='function')throw fail('MOTION_PREPARATION_INVALID');}
  const discoveryOwner=ownerSnapshot(context),selected=new Set(displayed?.reviewIds||[]),deferred=[];
  const metadata=async()=>{
  const owner=ownerSnapshot(context),target=await lookupTargetMetadata(input.targetModel);assertResourceAccess(target,{kind:'motion target'});if(!isDeepStrictEqual(owner,resourceOwnerOf(target)))throw fail();
  function project(records,source,reviewId,query){
   const result=validateRecords(records,query,owner);
   if(selected.has(reviewId)&&result.state==='eligible-profiles'&&(typeof lookupPreparedProfile==='function'||typeof beginPreparedProfileLookup==='function'))deferred.push(async()=>{
    ownerSnapshot(context);
    if(typeof beginPreparedProfileLookup==='function'){
     const finishers=new Map();
     for(const profile of result.profiles){
      const finish=await beginPreparedProfileLookup(structuredClone(query),structuredClone(owner),profile.profileId,{source,target},records.find(record=>record.profileId===profile.profileId));
      if(typeof finish!=='function')throw fail();finishers.set(profile.profileId,finish);
     }
     ownerSnapshot(context);
     return async()=>{
      ownerSnapshot(context);
      const enriched=await attachPreparedOutputs(result,query,owner,(_query,_owner,profileId)=>finishers.get(profileId)());
      ownerSnapshot(context);return {reviewId,enriched};
     };
    }
    const lookup=typeof lookupPreparedProfile==='function'?(input,scope,profileId)=>lookupPreparedProfile(input,scope,profileId,{source,target},records.find(record=>record.profileId===profileId)):undefined;
    const enriched=await attachPreparedOutputs(result,query,owner,lookup);
    ownerSnapshot(context);await displayed.onPreparedResult(reviewId,enriched);
   });
   return {reviewId,...result};
  }
  const batch=await lookupSourceReviewMetadataBatch(input.reviewIds);if(batch?.lookupComplete!==true||!Array.isArray(batch.results)||batch.results.length!==input.reviewIds.length)throw fail();const results=Array(batch.results.length),pending=[];
  for(let index=0;index<batch.results.length;index++){const source=batch.results[index],reviewId=input.reviewIds[index],query={source:{kind:'review',id:reviewId},targetModel:input.targetModel,variant:input.variant};if(source?.sourceKind!=='review'||source.reviewId!==reviewId||!isDeepStrictEqual(owner,resourceOwnerOf(source)))throw fail();assertResourceAccess(source,{kind:'motion source'});
   if(source.reviewBindingState==='unavailable'){if(!['PREPARATION_REVIEW_SOURCE_DRIFT','PREPARATION_REVIEW_SOURCE_AMBIGUOUS'].includes(source.reasonCode))throw fail();results[index]={reviewId,schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'review-binding-unavailable',request:{sourceKind:'review',variant:input.variant},profiles:[],reasonCode:source.reasonCode};continue;}
   if(source.reviewBindingState==='missing'){results[index]={reviewId,schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'review',variant:input.variant},profiles:[],reasonCode:'SOURCE_REGISTRATION_REQUIRED'};continue;}
   if(source.reviewBindingState!=='unique')throw fail();pending.push({index,source,reviewId,query});
  }
  const width=typeof listEligibleCatalogProfilesBatch==='function'?64:8;
  const stride=typeof listEligibleCatalogProfilesBatch==='function'?width*4:width;
  for(let start=0;start<pending.length;start+=stride){const issued=pending.slice(start,start+width);
   if(typeof listEligibleCatalogProfilesBatch==='function'){
    // Four complete batches overlap; each keeps its 64-row repository limits.
    const groups=Array.from({length:4},(_,n)=>pending.slice(start+n*width,start+(n+1)*width)).filter(rows=>rows.length);
    const settled=await Promise.allSettled(groups.map(async group=>{
     const rows=await listEligibleCatalogProfilesBatch(group.map(row=>row.query),owner,group.map(row=>row.source),target);
     if(!Array.isArray(rows)||rows.length!==group.length)throw fail();return {group,rows};
    }));
    for(const item of settled)if(item.status==='rejected')throw item.reason;
    // Projection and selected-card capture retain input order after all drain.
    for(const item of settled){const {group,rows}=item.value;for(let n=0;n<group.length;n++){const row=group[n];results[row.index]=project(rows[n],row.source,row.reviewId,row.query);}}
   }
   else{const settled=await Promise.allSettled(issued.map(async({source,reviewId,query})=>{const records=typeof listEligibleCatalogProfiles==='function'?await listEligibleCatalogProfiles(query,owner,source,target):await listEligibleProfiles(query,owner);return project(records,source,reviewId,query);}));for(let index=0;index<settled.length;index++){if(settled[index].status==='rejected')throw settled[index].reason;results[issued[index].index]=settled[index].value;}}
  }
  ownerSnapshot(context);return {schemaVersion:'betterpptx.motion-preparation-catalog-discovery.v1',lookupComplete:true,targetAssessment:'authorized-metadata-only',results};
  };
  const result=typeof withPlanningReads==='function'?await withPlanningReads(metadata):await metadata();
  // Output verification must run after the metadata read scope closes, so its
  // final current-source and approval checks cannot reuse planning snapshots.
  const finalizers=[];
  if(typeof beginPreparedProfileLookup==='function'){
   // Keep three hydration slots occupied without waiting for a whole wave.
   const hydrated=Array(deferred.length),failures=[];let next=0,stopped=false;
   await Promise.all(Array.from({length:Math.min(3,deferred.length)},async()=>{
    while(!stopped&&next<deferred.length){const index=next++;
     try{hydrated[index]=await deferred[index]();}
     catch(reason){stopped=true;failures.push({index,reason});}
    }
   }));
   if(failures.length){failures.sort((a,b)=>a.index-b.index);throw failures[0].reason;}
   for(const finish of hydrated){if(typeof finish!=='function')throw fail();finalizers.push(finish);}
  }else{
   for(let start=0;start<deferred.length;start+=3){const settled=await Promise.allSettled(deferred.slice(start,start+3).map(run=>run()));for(const row of settled){if(row.status==='rejected')throw row.reason;if(typeof row.value==='function')finalizers.push(row.value);}}
  }
  // Hydrate at most three cards at once, then let the displayed page share a
  // single in-flight fresh source scan. Profiles within each card stay ordered.
  const verify=async()=>{
   const finalized=await Promise.allSettled(finalizers.map(finish=>finish()));
   for(const row of finalized)if(row.status==='rejected')throw row.reason;
   return finalized.map(row=>row.value);
  };
  const verified=finalizers.length&&typeof withVerificationReads==='function'?await withVerificationReads(verify):await verify();
  // Publish only after the complete current-document fence has succeeded.
  for(const {reviewId,enriched}of verified){
   if(!isDeepStrictEqual(ownerSnapshot(context),discoveryOwner))throw fail('RESOURCE_IDENTITY_REQUIRED');
   await displayed.onPreparedResult(reviewId,enriched);
  }
  if(!isDeepStrictEqual(ownerSnapshot(context),discoveryOwner))throw fail('RESOURCE_IDENTITY_REQUIRED');return result;
 };
}
