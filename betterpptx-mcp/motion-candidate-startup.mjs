import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {assertResourceAccess,resourceOwnerOf} from './auth/resource-authorization.mjs';
import {configureMotionCandidateService} from './motion-candidate-service.mjs';

const HASH=/^[a-f0-9]{64}$/;
const unavailable=()=>Object.assign(new Error('Candidate discovery is unavailable.'),{code:'CANDIDATE_UNAVAILABLE'});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

// Private startup composition for the existing owner-source/measurement pipeline.
// Repository methods return private metadata and bytes, never public paths. No
// environment fallback, raw folder importer, owner override or cloud call here.
export function initializeMotionCandidateDiscovery({registryAdapter,registryRepository,evidenceRepository,validateMeasurementReceipt,limits,cursorTtlMs,now,maxEvidenceBytes=32768}){
 if(typeof evidenceRepository?.lookupMetadata!=='function'||typeof evidenceRepository?.lookupSourceMetadata!=='function'||typeof evidenceRepository?.readBytes!=='function'||typeof validateMeasurementReceipt!=='function'||!Number.isSafeInteger(maxEvidenceBytes)||maxEvidenceBytes<256||maxEvidenceBytes>1048576)throw unavailable();
 const authorizedSources=new WeakMap();
 return configureMotionCandidateService({adapter:registryAdapter,repository:registryRepository,limits,cursorTtlMs,now,requireSourceResourceId:true,
  lookupEvidenceMetadata:async id=>{
   const metadata=await evidenceRepository.lookupMetadata(id);
   assertResourceAccess(metadata,{kind:'motion evidence'});
   if(metadata.schemaVersion!=='betterpptx.private-motion-evidence.v1'||!HASH.test(metadata.payloadSha256)||!HASH.test(metadata.sourceSha256)||!Number.isSafeInteger(metadata.payloadBytes)||metadata.payloadBytes<1||metadata.payloadBytes>maxEvidenceBytes||typeof metadata.sourceResourceId!=='string'||!metadata.sourceResourceId)throw unavailable();
   const source=await evidenceRepository.lookupSourceMetadata(metadata.sourceResourceId);
   // Check source custody as well as observation custody before reading bytes.
   assertResourceAccess(source,{kind:'motion source'});
   if(!isDeepStrictEqual(resourceOwnerOf(source),resourceOwnerOf(metadata))||source.contentSha256!==metadata.sourceSha256)throw unavailable();
   // Each ingestion gets its own immutable header: a repository reusing a
   // mutable cached object cannot overwrite another in-flight authorization.
   const snapshot=structuredClone(metadata);
   snapshot.resourceOwner=Object.freeze({...resourceOwnerOf(metadata)});Object.freeze(snapshot);
   const captured=Object.freeze({payloadSha256:snapshot.payloadSha256,payloadBytes:snapshot.payloadBytes,sourceSha256:snapshot.sourceSha256,sourceResourceId:snapshot.sourceResourceId,sourceOwner:resourceOwnerOf(source)});
   authorizedSources.set(snapshot,captured);return snapshot;
  },
  readEvidence:async metadata=>{
   const captured=authorizedSources.get(metadata);if(!captured)throw unavailable();
   const bytes=await evidenceRepository.readBytes(metadata,{maxBytes:maxEvidenceBytes});
   if(!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)||bytes.length!==captured.payloadBytes||bytes.length>maxEvidenceBytes||digest(bytes)!==captured.payloadSha256)throw unavailable();
   let evidence;try{evidence=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw unavailable();}
   if(evidence?.identity?.sourceSha256!==captured.sourceSha256)throw unavailable();
   return evidence;
  },
  verifyRetainedEvidence:async(evidence,metadata,capturedOwner)=>{
   const captured=authorizedSources.get(metadata);if(!captured||metadata.payloadSha256!==captured.payloadSha256||metadata.sourceSha256!==captured.sourceSha256||metadata.sourceResourceId!==captured.sourceResourceId||!isDeepStrictEqual(capturedOwner,captured.sourceOwner))return false;
   // Recheck current authoritative source metadata after awaits, before commit.
   const source=await evidenceRepository.lookupSourceMetadata(captured.sourceResourceId);
   assertResourceAccess(source,{kind:'motion source'});
   if(source.contentSha256!==captured.sourceSha256||!isDeepStrictEqual(resourceOwnerOf(source),captured.sourceOwner))return false;
   return await validateMeasurementReceipt(evidence,metadata,source,capturedOwner)===true;
  }});
}
