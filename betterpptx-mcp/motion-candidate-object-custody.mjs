import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner,resourceOwnerOf,assertResourceAccess} from './auth/resource-authorization.mjs';
import {capturedOwnerKey} from './storage/motion-candidate-repository.mjs';
import {meteredFirestoreGet} from './billing/firestore-meter.mjs';
const HASH=/^[a-f0-9]{64}$/;
const fail=()=>{throw Object.assign(new Error('Candidate evidence is unavailable.'),{code:'CANDIDATE_UNAVAILABLE'})};
const sha=b=>createHash('sha256').update(b).digest('hex');
const id=v=>typeof v==='string'&&v.length>0&&v.length<=512&&v.trim()===v&&!/[\\\x00-\x1f\x7f]/.test(v)&&! /^(?:\/|[a-z]:|file:|https?:)/i.test(v)&&!/(^|\/)\.\.(\/|$)/.test(v);
const keys=['schemaVersion','evidenceId','payloadSha256','payloadBytes','sourceSha256','sourceResourceId','resourceOwner'];
function header(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();
 for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!keys.includes(k)||!d?.enumerable||!Object.hasOwn(d,'value'))fail();}
 if(v.schemaVersion!=='betterpptx.private-motion-evidence.v1'||!id(v.evidenceId)||!id(v.sourceResourceId)
  ||!HASH.test(v.payloadSha256)||!HASH.test(v.sourceSha256)||!Number.isSafeInteger(v.payloadBytes)||v.payloadBytes<1)fail();
 capturedOwnerKey(v.resourceOwner);return v;
}
function owner(){const o=structuredClone(currentResourceOwner());capturedOwnerKey(o);return o;}
function recheck(o){if(!isDeepStrictEqual(currentResourceOwner(),o))fail();}
// Read-only adapter for the existing P233 measurement ingestion contract. Headers
// and objects must already have trusted custody; this module grants nothing.
export function createMotionCandidateObjectCustody({client,collection,resourceCustody,authorizeEvidenceHeader,maxEvidenceBytes=32768}={}){
 if(typeof client?.collection!=='function'||typeof collection!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(collection)
  ||typeof resourceCustody?.lookupMetadata!=='function'||typeof resourceCustody?.readBytes!=='function'
  ||typeof authorizeEvidenceHeader!=='function'||!Number.isSafeInteger(maxEvidenceBytes)||maxEvidenceBytes<256||maxEvidenceBytes>1048576)fail();
 const records=client.collection(collection);
 async function lookup(evidenceId,o){
  if(!id(evidenceId))fail();let s;
  try{s=await meteredFirestoreGet(records.doc('evidence-'+sha(JSON.stringify([capturedOwnerKey(o),evidenceId]))));}catch{fail()}recheck(o);
  if(!s?.exists)fail();let h;try{h=header(s.data())}catch{fail()}
  if(Buffer.byteLength(JSON.stringify(h))>16384||h.evidenceId!==evidenceId||h.payloadBytes>maxEvidenceBytes||!isDeepStrictEqual(resourceOwnerOf(h),o))fail();
  assertResourceAccess(h,{kind:'motion evidence'});let granted;
  try{granted=await authorizeEvidenceHeader({header:structuredClone(h),owner:structuredClone(o)})}catch{fail()}recheck(o);if(granted!==true)fail();
  const evidence=await resourceCustody.lookupMetadata({resourceId:evidenceId,owner:o,expectedKind:'evidence'});recheck(o);
  const source=await resourceCustody.lookupMetadata({resourceId:h.sourceResourceId,owner:o,expectedKind:'original-source'});recheck(o);
  if(evidence.contentSha256!==h.payloadSha256||source.contentSha256!==h.sourceSha256
   ||!isDeepStrictEqual(resourceOwnerOf(evidence),o)||!isDeepStrictEqual(resourceOwnerOf(source),o))fail();
  return structuredClone(h);
 }
 return Object.freeze({
  async lookupMetadata(evidenceId){const o=owner();return lookup(evidenceId,o)},
  async lookupSourceMetadata(resourceId){const o=owner();if(!id(resourceId))fail();const result=await resourceCustody.lookupMetadata({resourceId,owner:o,expectedKind:'original-source'});recheck(o);return result},
  async readBytes(metadata,{maxBytes}){
   const o=owner();header(metadata);if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>maxEvidenceBytes)fail();
   const retained=structuredClone(metadata),h=await lookup(retained.evidenceId,o);
   if(!isDeepStrictEqual(h,retained)||h.payloadBytes>maxBytes)fail();
   const bytes=await resourceCustody.readBytes({resource:{resourceId:h.evidenceId,contentSha256:h.payloadSha256,resourceOwner:o},owner:o,maxBytes});recheck(o);
   if(!(bytes instanceof Uint8Array)||bytes.byteLength!==h.payloadBytes||sha(bytes)!==h.payloadSha256)fail();
   const captured=Buffer.from(bytes),again=await lookup(h.evidenceId,o);if(!isDeepStrictEqual(again,h)||sha(captured)!==h.payloadSha256)fail();return captured;
  },
 });
}
