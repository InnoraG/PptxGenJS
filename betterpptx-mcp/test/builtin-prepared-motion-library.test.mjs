import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBuiltInPreparedMotionLibrary} from '../builtin-prepared-motion-library.mjs';
import {withResourceAuthorization,currentResourceOwner} from '../auth/resource-authorization.mjs';
import {configureBuiltInPreparedMotionLibrary} from '../builtin-prepared-motion-service.mjs';
import {dispatchMotionPreparationProfileList,dispatchMotionPreparationProfileCatalog} from '../motion-preparation-service.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),hex=(n,c='a')=>c.repeat(n);
function fixture(){
 const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},animations:[{name:'one'}]}));
 const padding=(4-json.length%4)%4,bytes=Buffer.alloc(20+json.length+padding,32);
 bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length+padding,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
 const clock={startFrame:0,endFrame:29,frameCount:30,fps:30,durationMs:29*1000/30},hash=hex(40),model=`gen://rigged3d/${hash}`,id=`prepared_variant_${hex(32)}`;
 const asset={glbBase64:bytes.toString('base64'),manifest:{contract:'betterpptx.motion-prepared-output.v1',preparedVariantId:id,variant:'original',sourceClock:clock,outputBytes:bytes.length}};
 const bundleBytes=e=>Buffer.from(JSON.stringify({glb:e.glbBase64,manifest:e.manifest,poster:e.previewBase64??null}));
 const row={reviewId:`cap_${hex(20)}`,candidateId:`candidate_${hex(32)}`,sourceSha256:hex(64),targetModel:`gen://rigged3d/${hex(40,'b')}`,variant:'original',cacheKey:hex(64,'c'),preparedOutput:{state:'prepared',modelAsset:model,preparedVariantId:id,variant:'original',sourceClock:{...clock,retimed:false},nativeQualification:'unqualified'},storage:{tenantId:'motion-preparation-publisher',hash,recordGeneration:'123',recordSha256:hex(64,'d')},assetBundle:{sha256:sha(bundleBytes(asset)),bytes:bundleBytes(asset).length},outputSha256:sha(bytes),preparationBundleDigest:hex(64,'e'),targetRigSha256:hex(64,'f'),targetRestSha256:hex(64,'1')};
 const publication={schemaVersion:'betterpptx.builtin-prepared-motion-catalog.v1',catalogId:'presenter-built-in',catalogPayloadSha256:hex(64,'2'),entries:[row]},query={source:{kind:'review',id:row.reviewId},targetModel:row.targetModel,variant:'original'};
 let loads=0;const lib=createBuiltInPreparedMotionLibrary({publication,loadAsset:async s=>{assert.deepEqual(s,row.storage);loads++;return asset;},bundleBytes,cache:(_hash,e)=>e});
 return {asset,row,publication,query,lib,bundleBytes,loads:()=>loads};
}
test('two customer contexts discover the same actual published output without changing identity',async()=>{
 const f=fixture(),owners=[];
 const run=sessionId=>withResourceAuthorization({sessionId},async()=>{const before=currentResourceOwner();owners.push(before);const result=await f.lib.discoverProfiles(f.query);assert.deepEqual(currentResourceOwner(),before);return result;});
 const [a,b]=await Promise.all([run('customer-a'),run('customer-b')]);
 assert.notDeepEqual(owners[0],owners[1]);assert.deepEqual(a,b);assert.deepEqual(a.profiles[0].preparedOutput,f.row.preparedOutput);assert.equal(f.loads(),1);
 assert.equal(JSON.stringify(a).includes('tenantId'),false);assert.equal(JSON.stringify(a).includes('sourceSha256'),false);
});
test('unsupported target never loads or substitutes a presenter',async()=>{const f=fixture();const r=await f.lib.discoverProfiles({...f.query,targetModel:`gen://rigged3d/${hex(40,'c')}`});assert.equal(r.reasonCode,'NO_QUALIFIED_PREPARATION_PROFILE');assert.deepEqual(r.profiles,[]);assert.equal(f.loads(),0);});
test('shared service dispatch agrees on unsupported targets and variants without requiring a private registry',async()=>{
 const f=fixture();configureBuiltInPreparedMotionLibrary(f.lib);
 for(const request of [{...f.query,targetModel:`gen://rigged3d/${hex(40,'c')}`},{...f.query,variant:'skeletal-mirrored'}]){
  const context={sessionId:'ordinary-shared-dispatch'};
  await withResourceAuthorization(context,async()=>{
   const single=await dispatchMotionPreparationProfileList(request,context);
   const bulk=await dispatchMotionPreparationProfileCatalog({reviewIds:[request.source.id],targetModel:request.targetModel,variant:request.variant},context);
   assert.equal(single.reasonCode,'NO_QUALIFIED_PREPARATION_PROFILE');
   assert.deepEqual(bulk.results,[{reviewId:request.source.id,...single}]);
  });
 }
 assert.equal(f.loads(),0);
});
test('shared service dispatch verifies displayed output and preserves the caller identity',async()=>{
 const f=fixture();configureBuiltInPreparedMotionLibrary(f.lib);const context={sessionId:'ordinary-shared-displayed'};
 await withResourceAuthorization(context,async()=>{
  const before=currentResourceOwner(),displayed=[];
  const result=await dispatchMotionPreparationProfileCatalog({reviewIds:[f.query.source.id],targetModel:f.query.targetModel,variant:f.query.variant},context,{reviewIds:[f.query.source.id],onPreparedResult:(id,value)=>displayed.push({id,value})});
  assert.deepEqual(result.results[0].profiles[0].preparedOutput,{state:'not-assessed'});
  assert.equal(displayed[0].value.profiles[0].preparedOutput.state,'prepared');
  assert.equal(displayed[0].value.profiles[0].preparationMode,'reuse-only');
  assert.deepEqual(before,currentResourceOwner());
  await assert.rejects(dispatchMotionPreparationProfileList(f.query,{sessionId:'different-caller'}),{code:'RESOURCE_IDENTITY_REQUIRED'});
 });
 assert.equal(f.loads(),1);
});
test('unpublished handles neither hydrate nor receive an authority assertion',async()=>{const f=fixture(),hash=hex(40,'f');assert.equal(f.lib.isPublishedHandle(`gen://rigged3d/${hash}`),false);assert.equal(await f.lib.hydrateAsset(hash),null);assert.throws(()=>f.lib.assertAssetBytes(`gen://rigged3d/${hash}`,Buffer.alloc(1)));});
test('altered raw bytes rejected before caching',async()=>{const f=fixture();f.asset.glbBase64=Buffer.from('altered').toString('base64');await assert.rejects(f.lib.discoverProfiles(f.query));});
test('altered manifest rejected before caching',async()=>{const f=fixture();f.asset.manifest.preparedVariantId=`prepared_variant_${hex(32,'b')}`;await assert.rejects(f.lib.discoverProfiles(f.query));});
test('warm altered metadata and supplied bundles rejected',async()=>{const f=fixture();await f.lib.discoverProfiles(f.query);assert.throws(()=>f.lib.assertAssetBytes(f.row.preparedOutput.modelAsset,Buffer.from('changed')));f.asset.manifest.sourceClock.durationMs++;assert.throws(()=>f.lib.assertAssetBytes(f.row.preparedOutput.modelAsset,f.bundleBytes(f.asset)));await assert.rejects(f.lib.hydrateAsset(f.row.storage.hash));});
test('publication input mutations cannot broaden published authority',async()=>{const f=fixture();f.publication.entries[0].targetModel=`gen://rigged3d/${hex(40,'c')}`;const result=await f.lib.discoverProfiles(f.query);assert.equal(result.state,'eligible-profiles');});
test('cache readback must preserve the verified publication bundle',async()=>{
 const f=fixture();
 const lib=createBuiltInPreparedMotionLibrary({publication:f.publication,loadAsset:async()=>f.asset,bundleBytes:f.bundleBytes,cache:(_hash,e)=>({...e,previewBase64:Buffer.from('unexpected poster').toString('base64')})});
 await assert.rejects(lib.discoverProfiles(f.query),{code:'BUILTIN_PREPARED_MOTION_CONTENT_MISMATCH'});
});
test('duplicate exact source-target-variant tuples rejected at startup',()=>{
 const f=fixture();f.publication.entries.push(structuredClone(f.row));
 assert.throws(()=>createBuiltInPreparedMotionLibrary({publication:f.publication,loadAsset:async()=>f.asset,bundleBytes:f.bundleBytes,cache:(_hash,e)=>e}));
});

test('catalog planning does not hydrate model payloads before a displayed output is assessed',async()=>{
 const f=fixture(),metadata=await f.lib.discoverProfiles(f.query,{assessOutput:false});
 assert.equal(metadata.state,'eligible-profiles');assert.deepEqual(metadata.profiles[0].preparedOutput,{state:'not-assessed'});assert.equal(f.loads(),0);
 const assessed=await f.lib.discoverProfiles(f.query);assert.equal(assessed.profiles[0].preparedOutput.state,'prepared');assert.equal(f.loads(),1);
});
