import {isDeepStrictEqual} from 'node:util';
import {digestOperationPayload} from './storage/operation-store.mjs';
import {currentResourceOwner,assertResourceAccess,resourceOwnerOf,resourceOwnerForContext} from './auth/resource-authorization.mjs';
import {validateMotionPreparedFile} from './motion-preparation-delivery.mjs';

const OP=/^op_[a-f0-9]{32}$/,PREP=/^prepared_variant_[a-f0-9]{32}$/,HASH=/^[a-f0-9]{64}$/;
const TOOL='betterpptx.motion.prepare_variant';
const error=(code='MOTION_PREPARATION_UNAVAILABLE')=>Object.assign(new Error(code==='MOTION_PREPARATION_PROFILE_UNAVAILABLE'?'The requested motion-preparation profile is not eligible for this source, target, or variant.':'Motion preparation is unavailable for this request.'),{code});
function closed(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k))||Reflect.ownKeys(value).length!==keys.length||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!Object.hasOwn(d,'value')))throw error();}
function capturedOwner(){const owner=Object.freeze(structuredClone(currentResourceOwner()));if(!['install','connector','session'].includes(owner.kind)||!HASH.test(owner.id))throw error('RESOURCE_IDENTITY_REQUIRED');return owner;}
function validateSourceClock(clock){
 closed(clock,['startFrame','endFrame','frameCount','fps','durationMs']);
 if(!Number.isSafeInteger(clock.startFrame)||!Number.isSafeInteger(clock.endFrame)||!Number.isSafeInteger(clock.frameCount)||clock.frameCount<2||clock.frameCount>10000000||clock.endFrame-clock.startFrame+1!==clock.frameCount||!Number.isFinite(clock.fps)||clock.fps<=0||clock.fps>1000||!Number.isFinite(clock.durationMs)||clock.durationMs<0||clock.durationMs>2678400000||Math.abs(clock.durationMs-(clock.frameCount-1)*1000/clock.fps)>0.00001)throw error('MOTION_PREPARATION_INVALID');
 return structuredClone(clock);
}
function validateArgs(args){
 closed(args,['source','targetModel','profileId','variant','idempotencyKey']);
 if(!['original','skeletal-mirrored'].includes(args.variant)||typeof args.idempotencyKey!=='string'||!/^[a-zA-Z0-9._:-]{1,200}$/.test(args.idempotencyKey))throw error('MOTION_PREPARATION_INVALID');
 closed(args.source,['kind','id']);
 if(args.source.kind==='candidate'){if(!/^candidate_[a-f0-9]{32}$/.test(args.source.id))throw error('MOTION_PREPARATION_INVALID');}
 else if(args.source.kind==='model'){if(!/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(args.source.id))throw error('MOTION_PREPARATION_INVALID');}
 else if(args.source.kind==='review'){if(!/^cap_[a-f0-9]{20}$/.test(args.source.id))throw error('MOTION_PREPARATION_INVALID');}
 else throw error('MOTION_PREPARATION_INVALID');
 if(!/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(args.targetModel)||!/^preparation_profile_[a-f0-9]{32}$/.test(args.profileId))throw error('MOTION_PREPARATION_INVALID');
 return structuredClone(args);
}
function publicPrepared(prepared,plan){
 closed(prepared,['preparedVariantId','cacheKey','outputSha256','outputBytes','sourceClock','variant']);
 if(!PREP.test(prepared.preparedVariantId)||prepared.cacheKey!==plan.cacheKey||!HASH.test(prepared.outputSha256)||!Number.isSafeInteger(prepared.outputBytes)||prepared.outputBytes<1||!isDeepStrictEqual(validateSourceClock(prepared.sourceClock),plan.sourceClock)||prepared.variant!==plan.variant)throw error();
 return {
  schemaVersion:'betterpptx.motion-prepared-variant.v1',preparedVariantId:prepared.preparedVariantId,variant:prepared.variant,
  sourceClock:{...plan.sourceClock,retimed:false},
  lifecycle:{preparationState:'prepared',selectability:'not-selectable',nativeQualification:'unqualified'},
  semantics:{contact:{state:'unknown',value:null},slideDirection:{state:'unknown',value:null}},
 };
}

// Private composition only. Reuse the existing durable ledger/dispatcher and
// fenced worker execution. No SDK, credential/environment defaults, new job
// store, source scan, automatic flip, asset grants or public promotion here.
export function createMotionPreparationOperation({store,dispatcher,lookupSourceMetadata,lookupTargetMetadata,planSource,authorizeBudget,prepareCached,verifyPreparedArtifact,deliverPreparedArtifact,resolvePreparedModelAsset,captureRequestContinuation}){
 for(const method of ['createOrGetOperation','getOperation'])if(typeof store?.[method]!=='function'||store.disabled)throw error();
 if(typeof dispatcher?.dispatchOperation!=='function'||dispatcher.disabled)throw error();
 for(const fn of [lookupSourceMetadata,lookupTargetMetadata,planSource,authorizeBudget,prepareCached,verifyPreparedArtifact])if(typeof fn!=='function')throw error();
 async function resolve(args,owner){
  const source=await lookupSourceMetadata(args.source);
  assertResourceAccess(source,{kind:'motion source'});
  if(!isDeepStrictEqual(owner,resourceOwnerOf(source)))throw error();
  const target=await lookupTargetMetadata(args.targetModel);
  assertResourceAccess(target,{kind:'motion target'});
  if(!isDeepStrictEqual(owner,resourceOwnerOf(target)))throw error();
  const plan=structuredClone(await planSource(structuredClone(source),structuredClone(target),args.variant,args.profileId,owner));
  closed(plan,['cacheKey','variant','sourceClock','privatePlan']);
  if(!HASH.test(plan.cacheKey)||plan.variant!==args.variant)throw error();
  plan.sourceClock=validateSourceClock(plan.sourceClock);
  if(Buffer.byteLength(JSON.stringify(plan))>32768)throw error();
  if(await authorizeBudget(plan,owner)!==true)throw error('MOTION_PREPARATION_LIMIT');
  return plan;
 }
 async function request(input,context={}){
  const args=validateArgs(input),owner=capturedOwner();
  // Trusted context identity follows the existing operation ledger/status path;
  // no identity can be supplied through the public preparation arguments.
  const installHash=String(context.installHash||context.resourceIdentityHash||context.sessionId||'');
  const requestContext={installHash:context.installHash||'',billingCustomerHash:context.billingCustomerHash||'',connectorHash:context.connectorHash||'',resourceIdentityHash:context.resourceIdentityHash||'',sessionId:context.sessionId||''};
  if(!installHash||!isDeepStrictEqual(owner,resourceOwnerForContext(context)))throw error('RESOURCE_IDENTITY_REQUIRED');
  const plan=await resolve(args,owner);
  const inputDigest=digestOperationPayload({args,plan});
  const continuation=captureRequestContinuation===undefined?{context:requestContext}:await captureRequestContinuation(context,inputDigest,args);
  if(!continuation||!isDeepStrictEqual(owner,resourceOwnerForContext(continuation.context)))throw error('RESOURCE_IDENTITY_REQUIRED');
  const created=await store.createOrGetOperation({
   installHash,toolName:TOOL,idempotencyKey:args.idempotencyKey,
   inputDigest,queueClass:'heavy',
   metadata:{resourceOwner:owner,motionPreparation:{owner,plan}},
   request:{args,...continuation},
  });
  const operation=created.operation;if(!operation||!OP.test(operation.operationId)||operation.installHash!==installHash)throw error();
  const binding=operation.metadata?.motionPreparation;
  if(!binding||!isDeepStrictEqual(binding.owner,owner)||!isDeepStrictEqual(binding.plan,plan)||!isDeepStrictEqual(resourceOwnerOf(operation),owner))throw error('MOTION_PREPARATION_IDENTITY_CHANGED');
  if(operation.state==='queued'||operation.state==='retry'){const dispatched=await dispatcher.dispatchOperation({operationId:operation.operationId,queueClass:'heavy'});if(dispatched?.accepted!==true)throw error();}
  return {schemaVersion:'betterpptx.motion-preparation-request.v1',operationId:operation.operationId,state:operation.state,variant:args.variant,statusTool:'betterpptx.operation.status',next:{recommendedTool:'betterpptx.operation.status',request:{operationId:operation.operationId},reason:'Recover the result of this exact preparation operation. A queued request does not establish a prepared asset.'}};
 }
 async function execute(input,claimed){
  const args=validateArgs(input),owner=capturedOwner(),operation=claimed?.operation,binding=operation?.metadata?.motionPreparation;
  if(!claimed?.lease?.leaseToken||!OP.test(operation?.operationId)||operation.toolName!==TOOL||operation.state!=='running'||!binding||!isDeepStrictEqual(binding.owner,owner)||!isDeepStrictEqual(operation.request?.args,args))throw error();
  const currentLease=async()=>{
   const latest=await store.getOperation(operation.operationId);
   if(!latest||latest.state!=='running'||claimed.lease.leaseToken!==latest.operationId+':'+latest.fencingToken||Date.parse(latest.leaseExpiresAt)<=Date.now()||!isDeepStrictEqual(latest.metadata?.motionPreparation,binding))throw error('OPERATION_LEASE_STALE');
  };
  await currentLease();
  const plan=await resolve(args,owner);
  if(!isDeepStrictEqual(plan,binding.plan))throw error('MOTION_PREPARATION_IDENTITY_CHANGED');
  const prepared=await prepareCached({plan:structuredClone(plan),owner,lease:structuredClone(claimed.lease),operation:structuredClone(operation),assertLease:currentLease});
  const result=publicPrepared(prepared,plan);
  if(await verifyPreparedArtifact(prepared,plan,owner)!==true)throw error('MOTION_PREPARATION_OUTPUT_INVALID');
  await currentLease();
  if(resolvePreparedModelAsset!==undefined){
   if(typeof resolvePreparedModelAsset!=='function')throw error('MOTION_PREPARATION_OUTPUT_INVALID');
   const modelAsset=await resolvePreparedModelAsset({prepared,plan,owner,assertLease:currentLease});
   if(typeof modelAsset!=='string'||!/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(modelAsset))throw error('MOTION_PREPARATION_OUTPUT_INVALID');
   await currentLease();
   result.modelAsset=modelAsset;
  }
  if(deliverPreparedArtifact!==undefined){
   if(typeof deliverPreparedArtifact!=='function')throw error('MOTION_PREPARATION_OUTPUT_INVALID');
   result.delivery=validateMotionPreparedFile(await deliverPreparedArtifact({prepared,plan,owner,assertLease:currentLease}),prepared);
   await currentLease();
  }
  return result;
 }
 const safe=new Set(['MOTION_PREPARATION_UNAVAILABLE','MOTION_PREPARATION_INVALID','MOTION_PREPARATION_LIMIT','MOTION_PREPARATION_PROFILE_UNAVAILABLE','MOTION_PREPARATION_IDENTITY_CHANGED','MOTION_PREPARATION_OUTPUT_INVALID','RESOURCE_IDENTITY_REQUIRED','RESOURCE_NOT_FOUND','OPERATION_IDEMPOTENCY_CONFLICT','OPERATION_LEASE_STALE','PREPARATION_REVIEW_SOURCE_DRIFT','PREPARATION_REVIEW_SOURCE_AMBIGUOUS','PREPARATION_REVIEW_LOOKUP_UNAVAILABLE']);
 const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(e){const code=e.code==='PREPARATION_PROFILE_UNAVAILABLE'||e.code==='PREPARATION_DOMAIN_UNSUPPORTED'?'MOTION_PREPARATION_PROFILE_UNAVAILABLE':e.code;throw error(safe.has(code)?code:'MOTION_PREPARATION_UNAVAILABLE');}};
 return Object.freeze({request:guarded(request),execute:guarded(execute)});
}
