import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner,resourceOwnerOf,assertResourceAccess} from './auth/resource-authorization.mjs';
import {capturedOwnerKey} from './storage/motion-candidate-repository.mjs';
import {meteredFirestoreGet} from './billing/firestore-meter.mjs';
import {motionCatalogPlanningRead} from './motion-catalog-planning-reads.mjs';
import {recordResourceUsage} from './billing/resource-meter.mjs';

const HASH=/^[a-f0-9]{64}$/;
const TARGET=/^gen:\/\/rigged3d\/[a-f0-9]{40}$/;
const RESOURCE_SCHEMA='betterpptx.private-motion-resource-object.v1';
const TARGET_SCHEMA='betterpptx.private-motion-target-binding.v1';
const fail=()=>{throw Object.assign(new Error('The motion resource is unavailable.'),{code:'PREPARATION_RESOURCE_UNAVAILABLE'});};
const digest=b=>createHash('sha256').update(b).digest('hex');
const closed=(v,keys)=>{
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();
 for(const key of Reflect.ownKeys(v)){if(typeof key!=='string'||!keys.includes(key))fail();const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
};
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=2048&&id.trim()===id
 &&!/[\\\x00-\x1f\x7f]/.test(id)&&! /^(?:\/|[a-z]:|file:|https?:)/i.test(id)&&!/(^|\/)\.\.(\/|$)/.test(id);
const captured=owner=>{capturedOwnerKey(owner);if(!isDeepStrictEqual(owner,currentResourceOwner()))fail();return structuredClone(owner);};
const recheck=owner=>{if(!isDeepStrictEqual(owner,currentResourceOwner()))fail();};

// Private, read-only custody over explicitly injected existing durable clients.
// Metadata/target records must already exist. This adapter allocates no resource,
// owner, approval, target or credential and exposes no writer or filesystem path.
export function createMotionPreparationObjectCustody({client,collection,bucket,authorizeStoredResource,maxRecordBytes=16384,maxResourceBytes=128*1024*1024}={}){
 if(typeof client?.collection!=='function'||typeof collection!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(collection)
  ||typeof bucket?.file!=='function'||typeof authorizeStoredResource!=='function'
  ||!Number.isSafeInteger(maxRecordBytes)||maxRecordBytes<512||maxRecordBytes>65536
  ||!Number.isSafeInteger(maxResourceBytes)||maxResourceBytes<1||maxResourceBytes>128*1024*1024)fail();
 const records=client.collection(collection);
 const key=(kind,owner,id)=>kind+'-'+digest(JSON.stringify([capturedOwnerKey(owner),id]));
 async function document(kind,id,owner){
  let snapshot;try{snapshot=await motionCatalogPlanningRead(client,collection+'/'+key(kind,owner,id),()=>meteredFirestoreGet(records.doc(key(kind,owner,id))));}catch{fail();}recheck(owner);
  if(!snapshot?.exists)fail();let value;try{value=snapshot.data();}catch{fail();}
  closed(value,kind==='resource'?['schemaVersion','resourceId','contentSha256','bytes','kind','object','resourceOwner']:['schemaVersion','targetModel','resourceId','resourceOwner']);
  closed(value.resourceOwner,['schemaVersion','kind','id']);
  if(kind==='resource')closed(value.object,['key','generation']);
  if(Buffer.byteLength(JSON.stringify(value))>maxRecordBytes)fail();
  assertResourceAccess(value,{kind:'motion resource'});if(!isDeepStrictEqual(resourceOwnerOf(value),owner))fail();return structuredClone(value);
 }
 async function resolve(resourceId,owner){
  if(!validId(resourceId))fail();const record=await document('resource',resourceId,owner);
  closed(record,['schemaVersion','resourceId','contentSha256','bytes','kind','object','resourceOwner']);
  if(record.schemaVersion!==RESOURCE_SCHEMA||record.resourceId!==resourceId||!HASH.test(record.contentSha256)
   ||!Number.isSafeInteger(record.bytes)||record.bytes<1||record.bytes>maxResourceBytes
   ||!['original-source','normalized-motion','target-rig','construction-rest','evidence'].includes(record.kind))fail();
  closed(record.object,['key','generation']);
  if(typeof record.object.key!=='string'||record.object.key.length<1||record.object.key.length>2048
   ||/[\\\x00-\x1f\x7f]/.test(record.object.key)||record.object.key.startsWith('/')
   ||record.object.key.split('/').some(x=>!x||x==='.'||x==='..')
   ||typeof record.object.generation!=='string'||! /^[1-9][0-9]{0,24}$/.test(record.object.generation))fail();
  let authorized;try{authorized=await authorizeStoredResource({record:structuredClone(record),owner:structuredClone(owner)});}catch{fail();}
  if(authorized!==true)fail();recheck(owner);return record;
 }
 const project=r=>({resourceId:r.resourceId,contentSha256:r.contentSha256,resourceOwner:structuredClone(resourceOwnerOf(r))});
 const matches=(a,b)=>a.resourceId===b.resourceId&&a.contentSha256===b.contentSha256&&isDeepStrictEqual(resourceOwnerOf(a),resourceOwnerOf(b));
 return Object.freeze({
  async lookupMetadata({resourceId,owner,expectedKind}){
   if(expectedKind!==undefined&&!['original-source','normalized-motion','target-rig','construction-rest','evidence'].includes(expectedKind))fail();
   const record=await resolve(resourceId,captured(owner));if(expectedKind!==undefined&&record.kind!==expectedKind)fail();return project(record);
  },
  async lookupTarget({targetModel,owner}){
   const own=captured(owner);if(!TARGET.test(targetModel))fail();const binding=await document('target',targetModel,own);
   closed(binding,['schemaVersion','targetModel','resourceId','resourceOwner']);
   if(binding.schemaVersion!==TARGET_SCHEMA||binding.targetModel!==targetModel||!validId(binding.resourceId))fail();
   const resource=await resolve(binding.resourceId,own);if(resource.kind!=='target-rig')fail();return project(resource);
  },
  async authorizeResource({resource,owner}){
   const own=captured(owner);closed(resource,['resourceId','contentSha256','resourceOwner']);
   const record=await resolve(resource.resourceId,own);if(!matches(resource,record))fail();return true;
  },
  async readBytes({resource,owner,maxBytes}){
   const own=captured(owner);closed(resource,['resourceId','contentSha256','resourceOwner']);
   if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>maxResourceBytes)fail();
   const record=await resolve(resource.resourceId,own);if(!matches(resource,record)||record.bytes>maxBytes)fail();
   let file;try{file=bucket.file(record.object.key,{generation:record.object.generation});}catch{fail();}
   if(typeof file?.getMetadata!=='function'||typeof file?.download!=='function')fail();
   let metadata;try{[metadata]=await file.getMetadata();}catch{fail();}finally{recordResourceUsage({gcsClassBOps:1,externalCalls:1});}recheck(own);
   if(String(metadata?.generation)!==record.object.generation||String(metadata?.size)!==String(record.bytes))fail();
   let raw;try{[raw]=await file.download({start:0,end:record.bytes-1,decompress:false,validation:false});}catch{fail();}
   finally{recordResourceUsage({gcsClassBOps:1,externalCalls:1,storageReadBytes:raw instanceof Uint8Array?raw.byteLength:0});}recheck(own);
   if(!(raw instanceof Uint8Array)||raw.byteLength!==record.bytes||raw.byteLength>maxBytes||digest(raw)!==record.contentSha256)fail();
   const bytes=Buffer.from(raw),again=await resolve(resource.resourceId,own);
   if(!isDeepStrictEqual(again,record)||digest(bytes)!==record.contentSha256)fail();return bytes;
  }
 });
}
