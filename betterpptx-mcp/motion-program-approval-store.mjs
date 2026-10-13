import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner} from './auth/resource-authorization.mjs';
import {capturedOwnerKey} from './storage/motion-candidate-repository.mjs';
import {meteredFirestoreGet} from './billing/firestore-meter.mjs';
import {motionCatalogPlanningRead} from './motion-catalog-planning-reads.mjs';

const PURPOSES=new Set(['resource-custody','evidence-header','measurement-receipt','preparation-evidence']);
const SCHEMA='betterpptx.private-motion-approval.v1';
const fail=()=>{throw Object.assign(new Error('Motion approval is unavailable.'),{code:'MOTION_APPROVAL_UNAVAILABLE'})};
const sha=value=>createHash('sha256').update(value).digest('hex');
function canonical(value,depth=0,seen=new Set()){
 if(depth>32)fail();
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
 if(!value||typeof value!=='object'||seen.has(value))fail();
 const array=Array.isArray(value);if(!array&&Object.getPrototypeOf(value)!==Object.prototype)fail();
 seen.add(value);
 const names=Reflect.ownKeys(value).filter(k=>!array||k!=='length');
 if(array&&(names.length!==value.length||names.some((k,i)=>k!==String(i))))fail();
 const output=array?[]:Object.create(null);
 for(const key of array?names:names.sort()){
  if(typeof key!=='string')fail();const d=Object.getOwnPropertyDescriptor(value,key);
  if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();output[key]=canonical(d.value,depth+1,seen);
 }
 seen.delete(value);return output;
}
// Private complete-decision digest, stable across datastore field ordering.
export function motionProgramApprovalDecisionSha256(decision){
 const encoded=JSON.stringify(canonical(decision));if(Buffer.byteLength(encoded)>4096)fail();return sha(encoded);
}
// Private identity helper; not a grant, approval writer or public tool.
export function motionProgramApprovalIdentity({purpose,subject,owner,maxBytes=65536}){
 if(!PURPOSES.has(purpose)||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>262144)fail();
 const ownerKey=capturedOwnerKey(owner),encoded=JSON.stringify(canonical(subject));
 if(Buffer.byteLength(encoded)>maxBytes)fail();
 const subjectSha256=sha(encoded);
 return {key:'approval-'+sha(JSON.stringify([SCHEMA,ownerKey,purpose,subjectSha256])),subjectSha256};
}

// Read only. The explicit collection is a private trust boundary: only the
// existing privileged review/ingestion service may write approval decisions.
// Custody records, hashes, client arguments and owner consent do not create them.
export function createMotionProgramApprovalStore({client,collection,now=Date.now,maxBytes=65536}={}){
 if(typeof client?.collection!=='function'||typeof collection!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(collection)
  ||typeof now!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>262144)fail();
 const records=client.collection(collection);
 async function verify(purpose,subject,owner){
  try{
   const captured=structuredClone(owner);
   if(!isDeepStrictEqual(captured,currentResourceOwner()))return false;
   const identity=motionProgramApprovalIdentity({purpose,subject,owner:captured,maxBytes});
   const snapshot=await motionCatalogPlanningRead(client,collection+'/'+identity.key,()=>meteredFirestoreGet(records.doc(identity.key)));
   if(!isDeepStrictEqual(captured,currentResourceOwner())||!snapshot?.exists
    ||!isDeepStrictEqual(identity,motionProgramApprovalIdentity({purpose,subject,owner:captured,maxBytes})))return false;
   const record=snapshot.data();
   const keys=['schemaVersion','purpose','subjectSha256','resourceOwner','status','decisionId','issuedAtMs','expiresAtMs'];
   if(!record||Object.getPrototypeOf(record)!==Object.prototype||Reflect.ownKeys(record).length!==keys.length)return false;
   for(const key of Reflect.ownKeys(record)){const d=Object.getOwnPropertyDescriptor(record,key);if(typeof key!=='string'||!keys.includes(key)||!d?.enumerable||!Object.hasOwn(d,'value'))return false;}
   if(Buffer.byteLength(JSON.stringify(canonical(record)))>4096)return false;
   const at=now();
   return Number.isSafeInteger(at)&&record.schemaVersion===SCHEMA&&record.purpose===purpose
    &&record.subjectSha256===identity.subjectSha256&&isDeepStrictEqual(record.resourceOwner,captured)
    &&record.status==='approved'&&typeof record.decisionId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(record.decisionId)
    &&Number.isSafeInteger(record.issuedAtMs)&&record.issuedAtMs>=0&&record.issuedAtMs<=at
    &&Number.isSafeInteger(record.expiresAtMs)&&record.expiresAtMs>at;
  }catch{return false;}
 }
 return Object.freeze({
  authorizeStoredResource:({record,owner})=>verify('resource-custody',{record},owner),
  authorizeEvidenceHeader:({header,owner})=>verify('evidence-header',{header},owner),
  validateMeasurementReceipt:(evidence,metadata,source,owner)=>verify('measurement-receipt',{evidence,metadata,source},owner),
  verifyPreparationEvidence:({facts,owner})=>verify('preparation-evidence',{facts},owner),
 });
}
