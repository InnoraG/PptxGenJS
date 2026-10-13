import {AsyncLocalStorage} from 'node:async_hooks';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner,assertResourceAccess,resourceOwnerOf} from './auth/resource-authorization.mjs';
import {createCandidateRuntime} from './motion-candidate-runtime.mjs';
import {createCandidateReadOnlyDispatch} from './motion-candidate-contract.mjs';

const verifiedReads=new AsyncLocalStorage();
let configuredDispatch=null;
const unavailable=()=>Object.assign(new Error('Candidate discovery is unavailable.'),{code:'CANDIDATE_UNAVAILABLE'});

// Private server composition only. No tool argument, owner override, filesystem
// fallback or public ingestion route can configure or populate this service.
export function configureMotionCandidateService({adapter,repository,lookupEvidenceMetadata,readEvidence,verifyRetainedEvidence,limits,cursorTtlMs,now,requireSourceResourceId=true}){
 if(typeof lookupEvidenceMetadata!=='function'||typeof readEvidence!=='function'||typeof verifyRetainedEvidence!=='function')throw unavailable();
 const runtime=createCandidateRuntime({adapter,repository,currentResourceOwner,limits,cursorTtlMs,now,requireSourceResourceId,
  verifyEvidence:async(input,capturedOwner,sourceResourceId)=>{
   const proof=verifiedReads.getStore();
   if(!proof||!isDeepStrictEqual(input,proof.evidence)||!isDeepStrictEqual(capturedOwner,resourceOwnerOf(proof.metadata))||sourceResourceId!==proof.sourceResourceId||sourceResourceId!==proof.metadata.sourceResourceId)return false;
   assertResourceAccess(proof.metadata,{kind:'motion evidence'});
   return await verifyRetainedEvidence(input,proof.metadata,capturedOwner)===true;
  }});
 configuredDispatch=createCandidateReadOnlyDispatch(runtime.publicReadOnly);
 return Object.freeze({async ingestEvidenceResource(resourceId){
  // Metadata lookup must not read source payloads. Authorize before evidence read.
  const capturedOwner=Object.freeze(structuredClone(currentResourceOwner()));
  if(capturedOwner.kind==='local')throw unavailable();
  const metadata=await lookupEvidenceMetadata(resourceId);
  assertResourceAccess(metadata,{kind:'motion evidence'});
  if(!isDeepStrictEqual(capturedOwner,resourceOwnerOf(metadata)))throw unavailable();
  const evidence=await readEvidence(metadata);
  assertResourceAccess(metadata,{kind:'motion evidence'});
  const sourceResourceId=metadata.sourceResourceId;
  return verifiedReads.run({metadata,evidence:structuredClone(evidence),sourceResourceId},()=>runtime.privateIngest(evidence,{sourceResourceId}));
 }});
}

export async function dispatchMotionCandidateTool(name,args){
 // Ordinary engine authorization runs first; no anonymous metadata fallback.
 const owner=currentResourceOwner();
 if(owner.kind==='local'||!configuredDispatch)throw unavailable();
 return configuredDispatch(name,args);
}
