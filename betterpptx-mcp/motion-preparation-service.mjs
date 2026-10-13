import {withMotionCatalogPlanningReads,withMotionCatalogVerificationReads} from './motion-catalog-planning-reads.mjs';
import {createMotionPreparationOperation} from './motion-preparation-operation.mjs';
import {createMotionPreparationProfileDiscovery,createMotionPreparationCatalogDiscovery} from './motion-preparation-profile-discovery.mjs';
import {builtInPreparedMotionLibrary} from './builtin-prepared-motion-service.mjs';
import {currentResourceOwner,resourceOwnerForContext} from './auth/resource-authorization.mjs';
import {isDeepStrictEqual} from 'node:util';
let configured=null;
function caller(context){const owner=currentResourceOwner();if(!['install','connector','session'].includes(owner.kind)||!isDeepStrictEqual(owner,resourceOwnerForContext(context??{})))throw Object.assign(new Error('A resource identity is required.'),{code:'RESOURCE_IDENTITY_REQUIRED'});return owner;}
// Private owner-controlled startup only; no public configuration, worker/cache
// defaults, source-selection fallback or profile registration through tool args.
export function configureMotionPreparationService(dependencies){
 const operation=dependencies.store&&!dependencies.store.disabled&&typeof dependencies.store.createOrGetOperation==='function'&&dependencies.dispatcher&&!dependencies.dispatcher.disabled&&typeof dependencies.dispatcher.dispatchOperation==='function'
  ?createMotionPreparationOperation(dependencies):null;
 const discover=typeof dependencies.listEligibleProfiles==='function'
  ?createMotionPreparationProfileDiscovery({
   listEligibleProfiles:dependencies.listEligibleProfiles,
   lookupPreparedProfile:dependencies.lookupPreparedProfile,
   listEligibleCatalogProfiles:dependencies.listEligibleCatalogProfiles,
   lookupSourceMetadata:dependencies.lookupSourceMetadata,
   lookupTargetMetadata:dependencies.lookupTargetMetadata,
  })
  :null;
 if(!operation&&!discover)throw Object.assign(new Error('Motion preparation is unavailable for this request.'),{code:'MOTION_PREPARATION_UNAVAILABLE'});
 const discoverCatalog=typeof dependencies.lookupSourceReviewMetadataBatch==='function'&&typeof dependencies.listEligibleProfiles==='function'?createMotionPreparationCatalogDiscovery({lookupPreparedProfile:dependencies.lookupPreparedProfile,beginPreparedProfileLookup:dependencies.beginPreparedProfileLookup,withPlanningReads:withMotionCatalogPlanningReads,withVerificationReads:withMotionCatalogVerificationReads,listEligibleProfiles:dependencies.listEligibleProfiles,listEligibleCatalogProfiles:dependencies.listEligibleCatalogProfiles,listEligibleCatalogProfilesBatch:dependencies.listEligibleCatalogProfilesBatch,lookupSourceReviewMetadataBatch:dependencies.lookupSourceReviewMetadataBatch,lookupTargetMetadata:dependencies.lookupTargetMetadata}):null;
 configured={operation,discover,discoverCatalog};
}
export async function dispatchMotionPreparation(args,context){
 if(!configured?.operation)throw Object.assign(new Error('Motion preparation is unavailable for this request.'),{code:'MOTION_PREPARATION_UNAVAILABLE'});
 return context.__claimedDurableOperation
  ?configured.operation.execute(args,context.__claimedDurableOperation)
  :configured.operation.request(args,context);
}
export async function dispatchMotionPreparationProfileList(args,context){
 const published=builtInPreparedMotionLibrary();
 if(args?.source?.kind==='review'&&published?.hasReview(args.source.id)){
  const owner=caller(context),result=await published.discoverProfiles(args);
  if(!isDeepStrictEqual(owner,caller(context)))throw Object.assign(new Error('A resource identity is required.'),{code:'RESOURCE_IDENTITY_REQUIRED'});return result;
 }
 if(typeof configured?.discover!=='function')throw Object.assign(new Error('Eligible motion-preparation profiles are unavailable for this request.'),{code:'MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'});
 return configured.discover(args,context);
}

export async function dispatchMotionPreparationProfileCatalog(args,context,displayed){
 const published=builtInPreparedMotionLibrary();
 if(Array.isArray(args?.reviewIds)&&args.reviewIds.some(id=>published?.hasReview(id))){
  const owner=caller(context);
  if(Object.keys(args).some(key=>!['reviewIds','targetModel','variant'].includes(key))||args.reviewIds.length>520||new Set(args.reviewIds).size!==args.reviewIds.length||args.reviewIds.some(id=>!/^cap_[a-f0-9]{20}$/.test(id))||!/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(args.targetModel??'')||!['original','skeletal-mirrored'].includes(args.variant))throw Object.assign(new Error('The motion profile discovery request is unsupported.'),{code:'MOTION_PREPARATION_INVALID'});
  if(displayed!==undefined&&(!displayed||Object.keys(displayed).some(key=>!['reviewIds','onPreparedResult'].includes(key))||!Array.isArray(displayed.reviewIds)||displayed.reviewIds.length>16||new Set(displayed.reviewIds).size!==displayed.reviewIds.length||displayed.reviewIds.some(id=>!args.reviewIds.includes(id))||typeof displayed.onPreparedResult!=='function'))throw Object.assign(new Error('The motion profile discovery request is unsupported.'),{code:'MOTION_PREPARATION_INVALID'});
  const privateIds=args.reviewIds.filter(id=>!published.hasReview(id)),privateResults=new Map();
  if(privateIds.length&&!published.isPublishedTarget(args.targetModel)){
   if(!configured?.discoverCatalog)throw Object.assign(new Error('Catalog preparation eligibility is unavailable for this request.'),{code:'MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'});
   const privateDisplayed=displayed?{reviewIds:displayed.reviewIds.filter(id=>privateIds.includes(id)),onPreparedResult:displayed.onPreparedResult}:undefined;
   const result=await configured.discoverCatalog({...args,reviewIds:privateIds},context,privateDisplayed);
   for(const row of result.results)privateResults.set(row.reviewId,row);
  }
  const results=[];
  for(const reviewId of args.reviewIds){
   const row=published.hasReview(reviewId)?await published.discoverProfiles({source:{kind:'review',id:reviewId},targetModel:args.targetModel,variant:args.variant},{assessOutput:false}):privateResults.get(reviewId)??{schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'review',variant:args.variant},profiles:[],reasonCode:'NO_QUALIFIED_PREPARATION_PROFILE'};
   results.push({reviewId,...row});
  }
  const selected=displayed?.reviewIds?.filter(id=>published.hasReview(id))??[];
  for(let start=0;start<selected.length;start+=3){
   const enriched=await Promise.all(selected.slice(start,start+3).map(reviewId=>published.discoverProfiles({source:{kind:'review',id:reviewId},targetModel:args.targetModel,variant:args.variant}).then(result=>({reviewId,result}))));
   for(const row of enriched)await displayed.onPreparedResult(row.reviewId,row.result);
  }
  if(!isDeepStrictEqual(owner,caller(context)))throw Object.assign(new Error('A resource identity is required.'),{code:'RESOURCE_IDENTITY_REQUIRED'});
  return {schemaVersion:'betterpptx.motion-preparation-catalog-discovery.v1',lookupComplete:true,targetAssessment:'authorized-metadata-only',results};
 }
 if(typeof configured?.discoverCatalog!=='function')throw Object.assign(new Error('Catalog preparation eligibility is unavailable for this request.'),{code:'MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'});
 return configured.discoverCatalog(args,context,displayed);
}
