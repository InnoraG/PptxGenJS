import test from 'node:test';import assert from 'node:assert/strict';import {validateMotionComparisonTarget,motionComparisonTargetReadiness} from '../motion-comparison-readiness.mjs';
const target={targetModel:'gen://rigged3d/'+'a'.repeat(40),variant:'original'},page={pagination:{limit:3},candidates:[{catalogId:'cap_'+'a'.repeat(20),sourceKind:'observed-motion-review',executionAvailable:false},{catalogId:'cap_'+'b'.repeat(20),sourceKind:'observed-motion-review',executionAvailable:false},{catalogId:'motion.unit',sourceKind:'semantic-presenter-motion',executionAvailable:true}]};
test('target readiness forwards exact public discovery queries without selecting or claiming cached/native readiness',async()=>{const context={unit:true},calls=[],before=structuredClone(page),discover=async(query,ctx)=>{assert.equal(ctx,context);calls.push(query);return {schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:calls.length===1?'eligible-profiles':'none-eligible',request:{sourceKind:'review',variant:'original'},profiles:calls.length===1?[{profileId:'preparation_profile_'+'c'.repeat(32),capability:'original',sourceKind:'review',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source'}]:[],...(calls.length===1?{}:{reasonCode:'SOURCE_REGISTRATION_REQUIRED'})}};const result=await motionComparisonTargetReadiness(page,target,context,discover);assert.deepEqual(page,before);assert.deepEqual(calls[0],{source:{kind:'review',id:page.candidates[0].catalogId},...target});assert.equal(calls.length,2);assert.equal(result.preparationQuery.eligible,1);assert.equal(result.preparationQuery.sourceRegistrationRequired,1);assert.equal(result.candidates[0].executionAvailable,false);assert.equal(result.candidates[0].preparationReadiness.targetAssessment,'verified-for-request');assert.equal(result.candidates[1].preparationReadiness.targetAssessment,'not-performed');assert.equal(result.candidates[1].preparationReadiness.qualificationScope,'owner-source-registration-only');assert.equal(result.candidates[0].preparationReadiness.bindingReservation,false);assert.equal(result.candidates[0].preparationReadiness.cachedAssetAvailability,'not-assessed');assert.equal(result.candidates[2].preparationReadiness.state,'not-assessed-for-this-target');assert.equal(result.preparationQuery.automaticSelection,false)});
test('explicit target/variant and bounded pages are required; discovery failures never become invented ineligibility',async()=>{for(const [value,limit]of [[{targetModel:target.targetModel},3],[{...target,variant:'auto'},3],[{...target,extra:true},3],[target,17],[{...target,targetModel:'private-server-path'},3]])assert.throws(()=>validateMotionComparisonTarget(value,limit),{code:'MOTION_COMPARISON_TARGET_INVALID'});await assert.rejects(()=>motionComparisonTargetReadiness(page,target,{},async()=>{throw Object.assign(new Error('unavailable'),{code:'UNIT_UNAVAILABLE'})}),{code:'UNIT_UNAVAILABLE'})});

const comparisonPage=count=>({pagination:{limit:count},candidates:Array.from({length:count},(_,i)=>({catalogId:'cap_'+String(i).padStart(20,'0'),sourceKind:'observed-motion-review',executionAvailable:false}))});
const missingProfile=()=>({schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'review',variant:'original'},profiles:[],reasonCode:'SOURCE_REGISTRATION_REQUIRED'});

test('published profiles lead to inspection or reuse without an unsupported private preparation request',async()=>{
 const profile={profileId:'preparation_profile_'+'3'.repeat(32),capability:'original',sourceKind:'review',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source',preparationMode:'reuse-only'};
 const prepared={state:'prepared',modelAsset:'gen://rigged3d/'+'4'.repeat(40),preparedVariantId:'prepared_variant_'+'5'.repeat(32),variant:'original',sourceClock:{startFrame:0,endFrame:30,frameCount:31,fps:30,durationMs:1000,retimed:false},nativeQualification:'unqualified'};
 for(const output of [{state:'not-assessed'},prepared]){
  const result=await motionComparisonTargetReadiness(comparisonPage(1),target,{},async()=>({schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'eligible-profiles',request:{sourceKind:'review',variant:'original'},profiles:[{...profile,preparedOutput:output}]}));
  const workflow=result.candidates[0].preparationReadiness.preparationWorkflow;
  assert.equal(workflow.state,output.state==='prepared'?'reuse-prepared':'inspect-prepared');
  assert.deepEqual(workflow.choices,[]);
  assert.equal(workflow.inspectPreparedOutputs.tool,'betterpptx.motion.preparation_profiles.list');
  if(output.state==='prepared')assert.equal(workflow.preparedChoices[0].modelAsset,prepared.modelAsset);
  else assert.equal(workflow.preparedChoices,undefined);
 }
});
test('three lookups overlap, preserve candidate order, and finish a batch before issuing the next',async()=>{
 const input=comparisonPage(5),context={session:'same'},pending=[],calls=[];let active=0,maxActive=0;
 const run=motionComparisonTargetReadiness(input,target,context,(query,ctx)=>{
  assert.equal(ctx,context);calls.push(query.source.id);active++;maxActive=Math.max(maxActive,active);
  return new Promise(resolve=>pending.push(()=>{active--;resolve(missingProfile())}));
 });
 assert.equal(pending.length,3);pending[2]();pending[1]();await new Promise(setImmediate);assert.equal(calls.length,3);
 pending[0]();await new Promise(setImmediate);assert.equal(calls.length,5);pending[4]();pending[3]();
 const result=await run;assert.equal(maxActive,3);assert.equal(active,0);assert.deepEqual(calls,input.candidates.map(c=>c.catalogId));assert.deepEqual(result.candidates.map(c=>c.catalogId),calls);assert.equal(result.preparationQuery.checked,5);assert.equal(result.preparationQuery.sourceRegistrationRequired,5);
});
test('all issued lookups settle and the first error in catalog order wins; later batches remain unissued',async()=>{
 const pending=[],calls=[],first=Object.assign(new Error('first'),{code:'FIRST'}),second=Object.assign(new Error('second'),{code:'SECOND'});let terminal=false;
 const run=motionComparisonTargetReadiness(comparisonPage(5),target,{},query=>{calls.push(query.source.id);return new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 const outcome=run.then(()=>{terminal=true;return null},error=>{terminal=true;return error});
 assert.equal(pending.length,3);pending[1].reject(second);await new Promise(setImmediate);assert.equal(terminal,false);
 pending[0].reject(first);await new Promise(setImmediate);assert.equal(terminal,false);pending[2].resolve(missingProfile());
 assert.equal(await outcome,first);assert.equal(calls.length,3);
});
test('a page cannot exceed its limit and discovery cannot claim eligibility with an empty or different-variant profile',async()=>{
 let calls=0;const oversized=comparisonPage(5);oversized.pagination.limit=1;
 await assert.rejects(()=>motionComparisonTargetReadiness(oversized,target,{},async()=>{calls++;return missingProfile()}),{code:'MOTION_COMPARISON_TARGET_INVALID'});assert.equal(calls,0);
 for(const result of [{...missingProfile(),state:'eligible-profiles'}, {...missingProfile(),state:'eligible-profiles',profiles:[{capability:'skeletal-mirrored',sourceKind:'review',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source'}]}])await assert.rejects(()=>motionComparisonTargetReadiness(comparisonPage(1),target,{},async()=>result),{code:'MOTION_COMPARISON_TARGET_INVALID'});
});

test('preparation instructions preserve each eligible profile choice and blocked requests without guessed assets',async()=>{
 const profile=profileId=>({profileId,capability:'original',sourceKind:'review',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source'}),profiles=[profile('preparation_profile_'+'1'.repeat(32)),profile('preparation_profile_'+'2'.repeat(32))];
 const result=await motionComparisonTargetReadiness(comparisonPage(1),target,{},async()=>({schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'eligible-profiles',request:{sourceKind:'review',variant:'original'},profiles})),readiness=result.candidates[0].preparationReadiness,workflow=readiness.preparationWorkflow;
 assert.equal(workflow.state,'choose-profile');assert.equal(workflow.choices.length,2);assert.equal(workflow.automaticSelection,false);assert.deepEqual(workflow.choices.map(c=>c.profileId),profiles.map(p=>p.profileId));
 for(const choice of workflow.choices){assert.equal(choice.tool,'betterpptx.motion.prepare_variant');assert.deepEqual(choice.requestTemplate,{source:{kind:'review',id:comparisonPage(1).candidates[0].catalogId},...target,profileId:choice.profileId});assert.deepEqual(choice.requires,['idempotencyKey']);assert.equal(Object.hasOwn(choice.requestTemplate,'modelAsset'),false);}
 assert.equal(workflow.operationRecovery.tool,'betterpptx.operation.status');assert.equal(workflow.operationRecovery.waitFor,'succeeded');assert.deepEqual(workflow.successfulResult.requiredForScene,['modelAsset','preparedVariantId']);assert.equal(readiness.cachedAssetAvailability,'not-assessed');assert.equal(readiness.assetPreparationPerformed,false);
 for(const reasonCode of ['SOURCE_REGISTRATION_REQUIRED','NO_QUALIFIED_PREPARATION_PROFILE']){const blocked=await motionComparisonTargetReadiness(comparisonPage(1),target,{},async()=>({...missingProfile(),reasonCode})),guide=blocked.candidates[0].preparationReadiness.preparationWorkflow;assert.equal(guide.state,'blocked');assert.equal(guide.reasonCode,reasonCode);assert.equal(Object.hasOwn(guide,'choices'),false);assert.deepEqual(guide.retry.request,{source:{kind:'review',id:comparisonPage(1).candidates[0].catalogId},...target});}
 await assert.rejects(()=>motionComparisonTargetReadiness(comparisonPage(1),target,{},async()=>({schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'eligible-profiles',request:{sourceKind:'review',variant:'original'},profiles:[{...profiles[0],profileId:undefined}]})),{code:'MOTION_COMPARISON_TARGET_INVALID'});
});
