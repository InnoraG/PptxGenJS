import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionPreparationProfileDiscovery} from '../motion-preparation-profile-discovery.mjs';
import {withResourceAuthorization,currentResourceOwner,bindNewResourceOwner} from '../auth/resource-authorization.mjs';

const ownerContext={sessionId:'profile-discovery-owner'};
const foreignContext={sessionId:'profile-discovery-foreign'};
const query={source:{kind:'candidate',id:'candidate_'+'a'.repeat(32)},targetModel:'gen://rigged3d/'+'b'.repeat(40),variant:'skeletal-mirrored'};
const profileId='preparation_profile_'+'c'.repeat(32);
const scope=(context,fn)=>withResourceAuthorization(context,fn);
const row=(owner,request)=>({profileId,owner:structuredClone(owner),request:structuredClone(request),capability:request.variant,sourceKind:request.source.kind,targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source'});
const resources=await scope(ownerContext,()=>({
 source:bindNewResourceOwner({identity:'profile-discovery-source'}),
 target:bindNewResourceOwner({identity:'profile-discovery-target'}),
}));
const dependencies=(listEligibleProfiles,{source=resources.source,target=resources.target}={})=>({
 listEligibleProfiles,
 lookupSourceMetadata:async handle=>handle.kind===query.source.kind&&handle.id===query.source.id?source:null,
 lookupTargetMetadata:async handle=>handle===query.targetModel?target:null,
});

test('private registry records are owner/request bound and projected into a closed public-safe result',async()=>{
 let seen;
 const discovery=createMotionPreparationProfileDiscovery(dependencies(async(request,owner)=>{seen={request,owner};return [row(owner,request)];}));
 const result=await scope(ownerContext,()=>discovery(query,ownerContext));
 assert.deepEqual(seen.request,query);
 assert.equal(result.schemaVersion,'betterpptx.motion-preparation-profile-discovery.v1');
 assert.equal(result.state,'eligible-profiles');
 assert.deepEqual(result.request,{sourceKind:'candidate',variant:'skeletal-mirrored'});
 assert.deepEqual(result.profiles,[{profileId,capability:'skeletal-mirrored',sourceKind:'candidate',targetCompatibility:'verified-for-request',sourceClockPolicy:'preserve-source',lifecycle:{selectability:'not-selectable',nativeQualification:'unqualified'}}]);
 const publicText=JSON.stringify(result);assert.equal(publicText.includes(query.source.id),false);assert.equal(publicText.includes(query.targetModel),false);assert.equal(publicText.includes(seen.owner.id),false);
});

test('empty registration is explicit and wrong-owner or malformed registry rows fail closed without private details',async()=>{
 const empty=createMotionPreparationProfileDiscovery(dependencies(async()=>[]));
 assert.deepEqual(await scope(ownerContext,()=>empty(query,ownerContext)),{schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1',state:'none-eligible',request:{sourceKind:'candidate',variant:'skeletal-mirrored'},profiles:[],reasonCode:'NO_QUALIFIED_PREPARATION_PROFILE'});

 let foreignOwner;
 await scope(foreignContext,()=>{foreignOwner=structuredClone(currentResourceOwner());});
 const foreignRows=createMotionPreparationProfileDiscovery(dependencies(async(request)=>[row(foreignOwner,request)]));
 await assert.rejects(scope(ownerContext,()=>foreignRows(query,ownerContext)),e=>e.code==='MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'&&!e.message.includes(foreignOwner.id));

 const privateFields=createMotionPreparationProfileDiscovery(dependencies(async(request,owner)=>[{...row(owner,request),algorithmName:'private-worker-name',producerHash:'d'.repeat(64)}]));
 await assert.rejects(scope(ownerContext,()=>privateFields(query,ownerContext)),e=>e.code==='MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'&&!e.message.includes('private-worker-name'));
});

test('discovery preserves author agency by rejecting variants or targets outside the closed request contract',async()=>{
 const discovery=createMotionPreparationProfileDiscovery(dependencies(async()=>[]));
 await assert.rejects(scope(ownerContext,()=>discovery({...query,contact:{hand:'left'}},ownerContext)),e=>e.code==='MOTION_PREPARATION_INVALID');
 await assert.rejects(scope(ownerContext,()=>discovery({...query,variant:'auto'},ownerContext)),e=>e.code==='MOTION_PREPARATION_INVALID');
 for(const source of [{kind:'review',id:query.source.id},{kind:'candidate',id:query.targetModel},{kind:'model',id:'cap_'+'a'.repeat(20)}])await assert.rejects(scope(ownerContext,()=>discovery({...query,source},ownerContext)),e=>e.code==='MOTION_PREPARATION_INVALID');
});

test('profile availability is never queried for a foreign-owned source or target',async()=>{
 let registryCalls=0;
 const registry=async(request,owner)=>{registryCalls++;return [row(owner,request)];};
 const sourceDiscovery=createMotionPreparationProfileDiscovery(dependencies(registry));
 await assert.rejects(scope(foreignContext,()=>sourceDiscovery(query,foreignContext)),e=>e.code==='MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE');

 const foreignTarget=await scope(foreignContext,()=>bindNewResourceOwner({identity:'foreign-profile-discovery-target'}));
 const targetDiscovery=createMotionPreparationProfileDiscovery(dependencies(registry,{target:foreignTarget}));
 await assert.rejects(scope(ownerContext,()=>targetDiscovery(query,ownerContext)),e=>e.code==='MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE');
 assert.equal(registryCalls,0);
});
