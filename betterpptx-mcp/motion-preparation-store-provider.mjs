import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner, resourceOwnerOf, assertResourceAccess} from './auth/resource-authorization.mjs';
import {runMeteredFirestoreTransaction} from './billing/firestore-meter.mjs';
import {capturedOwnerKey} from './storage/motion-candidate-repository.mjs';
import {projectCandidate} from './motion-candidate-runtime.mjs';
import {assertMotionCandidateStartupConfiguration} from './motion-candidate-private-provider.mjs';
import {ownerBindingKey, validateTrustedRecord} from './motion-preparation-planner.mjs';
import {validateMotionNormalizationContract} from './motion-preparation-normalization.mjs';
import {TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION, isMotionPreparationEligibilityRefusal, motionPreparationTargetResourceId} from './motion-preparation-repository-contract.mjs';
import {createMotionPreparationObjectCustody} from './motion-preparation-object-custody.mjs';
import {ownedMotionSourceReview} from './motion-source-authoring-reviews.mjs';

const HASH = /^[a-f0-9]{64}$/;
const CANDIDATE = /^candidate_[a-f0-9]{32}$/;
const TARGET = /^gen:\/\/rigged3d\/[a-f0-9]{40}$/;
const BINDING_SCHEMA = 'betterpptx.private-preparation-binding.v1';
const HEAD_SCHEMA = 'betterpptx.private-preparation-binding-head.v1';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const byteDigest = bytes => createHash('sha256').update(bytes).digest('hex');
// Real durable-object composition reuses the same registry, verifier and bundle
// resolver. Explicit clients/collections and actual records remain prerequisites.
export function createObjectStoredMotionPreparationProvider({client,collection,resourceCollection,bucket,
 candidateStartup,authorizeStoredResource,verifyPreparationEvidence,maxBundleBytes,maxVersionsPerBinding,
 maxRecordBytes,maxResourceBytes,catalogMetadataConcurrency}={}) {
 if(catalogMetadataConcurrency!==undefined&&(!Number.isSafeInteger(catalogMetadataConcurrency)||catalogMetadataConcurrency<1||catalogMetadataConcurrency>64||(typeof client?.getAll!=='function'&&catalogMetadataConcurrency>8)))fail();
 const resourceCustody=createMotionPreparationObjectCustody({client,collection:resourceCollection,bucket,
  authorizeStoredResource,maxRecordBytes,maxResourceBytes});
 return createStoredMotionPreparationProvider({client,collection,candidateStartup,resourceCustody,
  verifyPreparationEvidence,maxBundleBytes,maxVersionsPerBinding,catalogMetadataConcurrency});
}
const fail = (code = 'MOTION_PREPARATION_REGISTRY_UNAVAILABLE') => {
  throw Object.assign(new Error('Motion preparation is unavailable for this request.'), {code});
};
function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== keys.length
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !keys.includes(key))) fail();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail();
  }
}
function capture(owner) {
  ownerBindingKey(owner);
  if (!isDeepStrictEqual(owner, currentResourceOwner())) fail('RESOURCE_IDENTITY_REQUIRED');
  return structuredClone(owner);
}
function stillOwned(owner) {
  if (!isDeepStrictEqual(owner, currentResourceOwner())) fail('RESOURCE_IDENTITY_REQUIRED');
}
function selection(input) {
  closed(input, ['candidateId', 'targetModel', 'variant', 'owner']);
  if (!CANDIDATE.test(input.candidateId) || !TARGET.test(input.targetModel)
    || !['original', 'skeletal-mirrored'].includes(input.variant)) fail('MOTION_PREPARATION_INVALID');
  return {...structuredClone(input), owner: capture(input.owner)};
}
function resource(input, owner) {
  closed(input, ['resourceId', 'contentSha256', 'resourceOwner']);
  if (typeof input.resourceId !== 'string' || !input.resourceId.length || input.resourceId.length > 2048
    || /[\\\x00-\x1f\x7f]/.test(input.resourceId) || /^(?:\/|[a-z]:|file:|https?:)/i.test(input.resourceId)
    || /(^|\/)\.\.(\/|$)/.test(input.resourceId) || !HASH.test(input.contentSha256)
    || !isDeepStrictEqual(resourceOwnerOf(input), owner)) fail('PREPARATION_RESOURCE_UNAVAILABLE');
  assertResourceAccess(input, {kind: 'motion resource'});
  return structuredClone(input);
}

/**
 * Private composition over the existing P233 registry, trusted evidence custody,
 * and an explicitly supplied durable client. No SDK, credentials, default
 * collection, source import, eligibility assumption or public writer is created.
 */
export function createStoredMotionPreparationProvider({client, collection, candidateStartup, resourceCustody,
  verifyPreparationEvidence, maxBundleBytes = 32768, maxVersionsPerBinding = 64, catalogMetadataConcurrency} = {}) {
  if(catalogMetadataConcurrency!==undefined&&(!Number.isSafeInteger(catalogMetadataConcurrency)||catalogMetadataConcurrency<1||catalogMetadataConcurrency>64||(typeof client?.getAll!=='function'&&catalogMetadataConcurrency>8)))fail();
  if (typeof client?.collection !== 'function' || typeof client?.runTransaction !== 'function'
    || typeof collection !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(collection)
    || !Number.isSafeInteger(maxBundleBytes) || maxBundleBytes < 1024 || maxBundleBytes > 65536
    || !Number.isSafeInteger(maxVersionsPerBinding) || maxVersionsPerBinding < 1 || maxVersionsPerBinding > 256
    || typeof verifyPreparationEvidence !== 'function') fail();
  const startup = assertMotionCandidateStartupConfiguration(candidateStartup);
  for (const method of ['lookupMetadata', 'lookupTarget', 'authorizeResource', 'readBytes']) {
    if (typeof resourceCustody?.[method] !== 'function') fail();
  }
  const bindings = client.collection(collection);
  // Catalog metadata may overlap thirty-two rows when transport batches are available.
  // Singular resolution, transaction fallback and writer concurrency stay unchanged.
  const catalogMetadataWidth = catalogMetadataConcurrency===undefined?(typeof client.getAll === 'function' ? 32 : 8):catalogMetadataConcurrency;
  const key = request => digest([BINDING_SCHEMA, capturedOwnerKey(request.owner), request.candidateId,
    request.targetModel, request.variant]);
  function head(value, request) {
    closed(value, ['schemaVersion', 'key', 'digest', 'version']);
    if (value.schemaVersion !== HEAD_SCHEMA || value.key !== key(request) || !HASH.test(value.digest)
      || !Number.isSafeInteger(value.version) || value.version < 1 || value.version > maxVersionsPerBinding) fail('PREPARATION_INPUT_DRIFT');
    return value;
  }
  async function candidate(request, suppliedEntry) {
    const entry = suppliedEntry === undefined ? await startup.registryRepository.get(request.owner, request.candidateId) : suppliedEntry;
    stillOwned(request.owner);
    projectCandidate(entry);
    if (entry.candidateId !== request.candidateId || entry.ownerKey !== capturedOwnerKey(request.owner)
      || typeof entry.private.sourceResourceId !== 'string') fail('PREPARATION_RESOURCE_UNAVAILABLE');
    return structuredClone(entry);
  }
  async function authorize(input, owner) {
    const snapshot = resource(input, owner);
    const metadata = await resourceCustody.lookupMetadata({resourceId: snapshot.resourceId, owner: structuredClone(owner)});
    stillOwned(owner);
    if (!metadata || metadata.resourceId !== snapshot.resourceId || metadata.contentSha256 !== snapshot.contentSha256
      || !isDeepStrictEqual(resourceOwnerOf(metadata), owner)) fail('PREPARATION_INPUT_DRIFT');
    assertResourceAccess(metadata, {kind: 'motion resource'});
    if (await resourceCustody.authorizeResource({resource: structuredClone(snapshot), owner: structuredClone(owner)}) !== true)
      fail('PREPARATION_RESOURCE_UNAVAILABLE');
    stillOwned(owner);
    return snapshot;
  }
  async function target(targetModel, owner) {
    if (!TARGET.test(targetModel)) fail('MOTION_PREPARATION_INVALID');
    const metadata = await resourceCustody.lookupTarget({targetModel, owner: structuredClone(owner)});
    stillOwned(owner);
    if (!metadata || !isDeepStrictEqual(resourceOwnerOf(metadata), owner)) fail('PREPARATION_RESOURCE_UNAVAILABLE');
    return authorize(resource({resourceId: metadata.resourceId, contentSha256: metadata.contentSha256,
      resourceOwner: resourceOwnerOf(metadata)}, owner), owner);
  }
  async function validateBundle(input, request, suppliedEntry) {
    closed(input, ['schemaVersion', 'record', 'sourceOriginal', 'sourceMotion', 'targetModel',
      'targetConstructionRest', 'normalizationContract', 'normalizationReceipt']);
    if (input.schemaVersion !== 'private-motion-preparation-resources.v1') fail();
    const bundle = structuredClone(input), record = validateTrustedRecord(bundle.record);
    if (record.candidateId !== request.candidateId || record.ownerBindingKey !== ownerBindingKey(request.owner)
      || record.sourceDomain !== 'normalized-skinless-source-motion' || record.approval !== 'approved-private-preparation'
      || record.parseState !== 'measured' || !record.sourceClock || !record.identities.sourceApprovalSha256) fail('PREPARATION_SOURCE_NOT_APPROVED');
    if (record.targetResourceId !== motionPreparationTargetResourceId(request.targetModel, request.owner))
      fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
    const entry = await candidate(request, suppliedEntry);
    if (entry.private.parseState !== 'measured' || entry.private.sourceResourceId !== bundle.sourceOriginal.resourceId
      || entry.private.identity.sourceSha256 !== record.identities.sourceSha256
      || entry.private.identity.measurementArtifactSha256 !== record.identities.measurementSha256) fail('PREPARATION_INPUT_DRIFT');
    const clock = entry.private.observation.clock;
    if (['durationMs', 'fps', 'frameCount'].some(field => clock[field] !== record.sourceClock[field])) fail('PREPARATION_INPUT_DRIFT');
    const identities = ['sourceSha256', 'sourceMotionSha256', 'targetRigSha256', 'targetRestSha256'];
    const names = ['sourceOriginal', 'sourceMotion', 'targetModel', 'targetConstructionRest'];
    for (let i = 0; i < names.length; i++) {
      if (bundle[names[i]].contentSha256 !== record.identities[identities[i]]) fail('PREPARATION_INPUT_DRIFT');
    }
    const authorizationResults=await Promise.allSettled(names.map(name=>authorize(bundle[name],request.owner)));
    for(const result of authorizationResults)if(result.status==='rejected')throw result.reason;
    const actualTarget = await target(request.targetModel, request.owner);
    if (!isDeepStrictEqual(actualTarget, bundle.targetModel)) fail('PREPARATION_INPUT_DRIFT');
    closed(bundle.normalizationReceipt, ['sourceSha256', 'sourceMotionSha256', 'producerSha256', 'contractSha256']);
    const normalized = validateMotionNormalizationContract(bundle.normalizationContract,
      {expected: record.identities, sourceClock: record.sourceClock});
    if (bundle.normalizationReceipt.sourceSha256 !== record.identities.sourceSha256
      || bundle.normalizationReceipt.sourceMotionSha256 !== record.identities.sourceMotionSha256
      || !HASH.test(bundle.normalizationReceipt.producerSha256)
      || bundle.normalizationReceipt.contractSha256 !== normalized.contractSha256) fail('PREPARATION_INPUT_DRIFT');
    const {schemaVersion, ...facts} = bundle;
    facts.normalizationContract = normalized;
    if (await verifyPreparationEvidence({facts: structuredClone(facts), owner: structuredClone(request.owner),
      variant: request.variant, targetModel: request.targetModel}) !== true) fail('PREPARATION_EVIDENCE_UNAVAILABLE');
    stillOwned(request.owner);
    return bundle;
  }
  function unpack(envelope, request) {
    closed(envelope, ['schemaVersion', 'ownerKey', 'candidateId', 'targetModel', 'variant', 'bundle', 'digest']);
    const {digest: actual, ...body} = envelope;
    if (body.schemaVersion !== BINDING_SCHEMA || body.ownerKey !== capturedOwnerKey(request.owner)
      || body.candidateId !== request.candidateId || body.targetModel !== request.targetModel || body.variant !== request.variant
      || !HASH.test(actual) || digest(body) !== actual || Buffer.byteLength(JSON.stringify(envelope)) > maxBundleBytes) fail('PREPARATION_INPUT_DRIFT');
    return structuredClone(envelope.bundle);
  }
  async function candidates(requests, owner) {
    const ids=requests.map(request=>request.candidateId);
    if(ids.length<1||ids.length>64||new Set(ids).size!==ids.length)fail('MOTION_PREPARATION_INVALID');
    let entries;
    if(typeof startup.registryRepository.getMany==='function')entries=await startup.registryRepository.getMany(owner,ids);
    else {entries=[];for(let start=0;start<requests.length;start+=8){const settled=await Promise.allSettled(requests.slice(start,start+8).map(request=>candidate(request)));for(const item of settled){if(item.status==='rejected')throw item.reason;entries.push(item.value);}}}
    if(!Array.isArray(entries)||entries.length!==requests.length)fail('PREPARATION_INPUT_DRIFT');
    stillOwned(owner);return Promise.all(entries.map((entry,n)=>candidate(requests[n],entry)));
  }
  async function readOrdered(tx,refs){
    if(typeof tx.getAll==='function'){
      const rows=await tx.getAll(...refs);if(!Array.isArray(rows)||rows.length!==refs.length)fail('PREPARATION_INPUT_DRIFT');
      for(let n=0;n<rows.length;n++){const expected=refs[n].path??refs[n].name,actual=rows[n]?.ref?.path??rows[n]?.ref?.name;if(typeof expected!=='string'||expected!==actual||typeof rows[n].exists!=='boolean')fail('PREPARATION_INPUT_DRIFT');}
      return rows;
    }
    const rows=[];for(let start=0;start<refs.length;start+=8){const settled=await Promise.allSettled(refs.slice(start,start+8).map(ref=>tx.get(ref)));for(const item of settled){if(item.status==='rejected')throw item.reason;if(typeof item.value?.exists!=='boolean')fail('PREPARATION_INPUT_DRIFT');rows.push(item.value);}}return rows;
  }
  const repository = Object.freeze({
    schemaVersion: TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION,
    async lookupSourceReviewBindings({reviewIds,owner}) {
      const captured=capture(owner);if(!Array.isArray(reviewIds)||reviewIds.length>520||new Set(reviewIds).size!==reviewIds.length||typeof startup.registryRepository.findBySourceObservations!=='function')fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
      const reviews=reviewIds.map(reviewId=>{const review=ownedMotionSourceReview(reviewId);if(!isDeepStrictEqual(review.resourceOwner,captured))fail('RESOURCE_IDENTITY_REQUIRED');return review;});
      const found=await startup.registryRepository.findBySourceObservations(captured,reviews.map(review=>({reviewId:review.reviewId,sourceSha256:review.sourceSha256,sourceObservation:review.sourceObservation})));stillOwned(captured);
      if(found.lookupComplete!==true||found.results.length!==reviews.length)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
      const results=found.results.map((result,index)=>{const review=reviews[index];if(result.reviewId!==review.reviewId)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');const exactArtifact=review.measurementArtifactSha256;const selected=exactArtifact===null||exactArtifact===undefined?result.matches:result.matches.filter(entry=>entry.private.identity.measurementArtifactSha256===exactArtifact);const identityDrift=exactArtifact===null||exactArtifact===undefined?result.sourceIdentityCount!==result.matches.length:result.sourceIdentityCount>0&&selected.length===0;if(identityDrift||selected.length>1)return {resourceOwner:captured,reviewId:review.reviewId,candidateId:null,reviewBinding:null,lookupError:identityDrift?'PREPARATION_REVIEW_SOURCE_DRIFT':'PREPARATION_REVIEW_SOURCE_AMBIGUOUS'};
       if(!selected.length)return {resourceOwner:captured,reviewId:review.reviewId,candidateId:null,reviewBinding:null};const entry=selected[0];projectCandidate(entry);if(entry.ownerKey!==capturedOwnerKey(captured)||typeof entry.private.sourceResourceId!=='string')fail('PREPARATION_RESOURCE_UNAVAILABLE');return {resourceOwner:captured,reviewId:review.reviewId,candidateId:entry.candidateId,reviewBinding:{reviewId:review.reviewId,candidateId:entry.candidateId,sourceSha256:review.sourceSha256,observationSha256:digest(review.sourceObservation),candidateIdentitySha256:digest(entry.private.identity),...(exactArtifact?{measurementArtifactSha256:exactArtifact}:{})}};
      });return {lookupComplete:true,results};
    },
    async lookupSourceReviewBinding({reviewId,owner}) {
      const captured=capture(owner),review=ownedMotionSourceReview(reviewId);
      if(!isDeepStrictEqual(review.resourceOwner,captured))fail('RESOURCE_IDENTITY_REQUIRED');
      if(typeof startup.registryRepository.findBySourceObservation!=='function')fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
      const result=await startup.registryRepository.findBySourceObservation(captured,{sourceSha256:review.sourceSha256,sourceObservation:review.sourceObservation});stillOwned(captured);
      if(result.lookupComplete!==true)fail('PREPARATION_REVIEW_LOOKUP_UNAVAILABLE');
      const exactArtifact=review.measurementArtifactSha256;const selected=exactArtifact===null||exactArtifact===undefined?result.matches:result.matches.filter(entry=>entry.private.identity.measurementArtifactSha256===exactArtifact);const identityDrift=exactArtifact===null||exactArtifact===undefined?result.sourceIdentityCount!==result.matches.length:result.sourceIdentityCount>0&&selected.length===0;if(identityDrift)fail('PREPARATION_REVIEW_SOURCE_DRIFT');if(selected.length>1)fail('PREPARATION_REVIEW_SOURCE_AMBIGUOUS');if(!selected.length)return {resourceOwner:captured,reviewId,candidateId:null,reviewBinding:null};const entry=selected[0];await candidate({candidateId:entry.candidateId,owner:captured});
      return {resourceOwner:captured,reviewId,candidateId:entry.candidateId,reviewBinding:{reviewId,candidateId:entry.candidateId,sourceSha256:review.sourceSha256,observationSha256:digest(review.sourceObservation),candidateIdentitySha256:digest(entry.private.identity),...(exactArtifact?{measurementArtifactSha256:exactArtifact}:{})}};
    },
    async lookupCandidate({candidateId, owner}) {
      const captured = capture(owner);
      const entry = await candidate({candidateId, owner: captured});
      await authorize({resourceId: entry.private.sourceResourceId, contentSha256: entry.private.identity.sourceSha256,
        resourceOwner: captured}, captured);
      return {candidateId, resourceOwner: captured};
    },
    async lookupCandidates({candidateIds,owner}){
      const captured=capture(owner);if(!Array.isArray(candidateIds)||candidateIds.some(id=>!CANDIDATE.test(id)))fail('MOTION_PREPARATION_INVALID');
      const requests=candidateIds.map(candidateId=>({candidateId,owner:captured})),entries=await candidates(requests,captured),results=[];
      for(let start=0;start<entries.length;start+=catalogMetadataWidth){const settled=await Promise.allSettled(entries.slice(start,start+catalogMetadataWidth).map(async entry=>{await authorize({resourceId:entry.private.sourceResourceId,contentSha256:entry.private.identity.sourceSha256,resourceOwner:captured},captured);return {candidateId:entry.candidateId,resourceOwner:structuredClone(captured)};}));for(const item of settled){if(item.status==='rejected')throw item.reason;results.push(item.value);}}
      stillOwned(captured);return results;
    },
    async lookupTarget({targetModel, owner}) { return target(targetModel, capture(owner)); },
    async resolvePreparationInput({candidateId, targetModel, targetResourceId, variant, owner}) {
      const request = selection({candidateId, targetModel, variant, owner});
      const envelope = await runMeteredFirestoreTransaction(client, async tx => {
        const snapshot = await tx.get(bindings.doc('head-' + key(request)));
        if (!snapshot.exists) fail('PREPARATION_PROFILE_UNAVAILABLE');
        const selected = head(snapshot.data(), request);
        const stored = await tx.get(bindings.doc('bundle-' + selected.digest));
        if (!stored.exists || stored.data().digest !== selected.digest) fail('PREPARATION_INPUT_DRIFT');
        return stored.data();
      });
      stillOwned(request.owner);
      const bundle = await validateBundle(unpack(envelope, request), request);
      if (bundle.record.targetResourceId !== targetResourceId) fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');
      return bundle;
    },
    async resolvePreparationInputs({requests:inputs,owner}){
      const captured=capture(owner);if(!Array.isArray(inputs)||inputs.length<1||inputs.length>64)fail('MOTION_PREPARATION_INVALID');
      const requests=inputs.map(input=>{closed(input,['candidateId','targetModel','targetResourceId','variant']);const request=selection({candidateId:input.candidateId,targetModel:input.targetModel,variant:input.variant,owner:captured});if(input.targetResourceId!==motionPreparationTargetResourceId(request.targetModel,captured))fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');return {...request,targetResourceId:input.targetResourceId};});
      if(new Set(requests.map(key)).size!==requests.length)fail('MOTION_PREPARATION_INVALID');
      const uniqueIds=[...new Set(requests.map(request=>request.candidateId))],entries=await candidates(uniqueIds.map(candidateId=>({candidateId,owner:captured})),captured),byId=new Map(entries.map(entry=>[entry.candidateId,entry]));
      const envelopes=await runMeteredFirestoreTransaction(client,async tx=>{
        stillOwned(captured);let bytes=0;
        const count=snapshot=>{if(snapshot.exists){const size=Buffer.byteLength(JSON.stringify(snapshot.data()));if(size>maxBundleBytes||(bytes+=size)>64*(maxBundleBytes+1024))fail('PREPARATION_REGISTRY_CAPACITY');}};
        const heads=await readOrdered(tx,requests.map(request=>bindings.doc('head-'+key(request))));heads.forEach(count);
        const selected=heads.map((snapshot,n)=>snapshot.exists?head(snapshot.data(),requests[n]):null),digests=[...new Set(selected.filter(Boolean).map(value=>value.digest))];
        const rows=digests.length?await readOrdered(tx,digests.map(value=>bindings.doc('bundle-'+value))):[];rows.forEach(count);const records=new Map();
        for(let n=0;n<rows.length;n++){if(!rows[n].exists||rows[n].data().digest!==digests[n])fail('PREPARATION_INPUT_DRIFT');records.set(digests[n],rows[n].data());}
        stillOwned(captured);return selected.map(value=>value?records.get(value.digest):null);
      });
      const results=[];for(let start=0;start<requests.length;start+=catalogMetadataWidth){const issued=requests.slice(start,start+catalogMetadataWidth),settled=await Promise.allSettled(issued.map(async(request,n)=>{const envelope=envelopes[start+n];if(envelope===null)return {...inputs[start+n],bundle:null,reasonCode:'PREPARATION_PROFILE_UNAVAILABLE'};const input=unpack(envelope,request);try{const bundle=await validateBundle(input,request,byId.get(request.candidateId));if(bundle.record.targetResourceId!==request.targetResourceId)fail('PREPARATION_OWNER_OR_RESOURCE_MISMATCH');return {...inputs[start+n],bundle};}catch(error){if(isMotionPreparationEligibilityRefusal(error))return {...inputs[start+n],bundle:null,reasonCode:error.code};throw error;}}));for(const item of settled){if(item.status==='rejected')throw item.reason;results.push(item.value);}}
      stillOwned(captured);return results;
    },
    async verifyPreparationEvidence({facts, owner}) {
      const captured = capture(owner);
      const verified = await verifyPreparationEvidence({facts: structuredClone(facts), owner: captured});
      stillOwned(captured);
      return verified === true;
    },
    async authorizeResource({resource: input, owner}) { await authorize(input, capture(owner)); return true; },
    async readResourceBytes({resource: input, owner, maxBytes}) {
      const captured = capture(owner);
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024 * 1024) fail('PREPARATION_RESOURCE_UNAVAILABLE');
      const snapshot = await authorize(input, captured);
      const bytes = await resourceCustody.readBytes({resource: structuredClone(snapshot), owner: structuredClone(captured), maxBytes});
      if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maxBytes
        || byteDigest(bytes) !== snapshot.contentSha256) fail('PREPARATION_INPUT_DRIFT');
      const result = Buffer.from(bytes);
      await authorize(snapshot, captured);
      if (byteDigest(result) !== snapshot.contentSha256) fail('PREPARATION_INPUT_DRIFT');
      return result;
    },
  });
  return Object.freeze({trustedMotionPreparationRepository: repository, trustedMotionCandidateStartup: startup,
    // Private ingestion only. P233 allocates the candidate beforehand; the
    // independent evidence verifier must approve the exact tuple before storage.
    async registerApprovedBundle({candidateId, targetModel, variant, owner, bundle, expectedPreviousDigest = null}) {
      if (expectedPreviousDigest !== null && !HASH.test(expectedPreviousDigest)) fail('MOTION_PREPARATION_INVALID');
      const request = selection({candidateId, targetModel, variant, owner});
      const validated = await validateBundle(bundle, request);
      const body = {schemaVersion: BINDING_SCHEMA, ownerKey: capturedOwnerKey(request.owner), candidateId,
        targetModel, variant, bundle: validated};
      const envelope = {...body, digest: digest(body)};
      if (Buffer.byteLength(JSON.stringify(envelope)) > maxBundleBytes) fail('PREPARATION_REGISTRY_CAPACITY');
      const version = await runMeteredFirestoreTransaction(client, async tx => {
        stillOwned(request.owner);
        const reference = bindings.doc('head-' + key(request)), snapshot = await tx.get(reference);
        const immutableReference = bindings.doc('bundle-' + envelope.digest);
        const existingBundle = await tx.get(immutableReference);
        if (existingBundle.exists) {
          unpack(existingBundle.data(), request);
          if (!isDeepStrictEqual(existingBundle.data(), envelope)) fail('PREPARATION_IMMUTABLE_CONFLICT');
        }
        let nextVersion = 1;
        if (snapshot.exists) {
          const prior = head(snapshot.data(), request);
          if (prior.digest === envelope.digest) {
            if (!existingBundle.exists) fail('PREPARATION_INPUT_DRIFT');
            return prior.version;
          }
          if (expectedPreviousDigest !== prior.digest) fail('PREPARATION_IMMUTABLE_CONFLICT');
          nextVersion = prior.version + 1;
          if (nextVersion > maxVersionsPerBinding) fail('PREPARATION_REGISTRY_CAPACITY');
        } else if (expectedPreviousDigest !== null) fail('PREPARATION_IMMUTABLE_CONFLICT');
        if (!existingBundle.exists) tx.set(immutableReference, envelope, {merge: false});
        tx.set(reference, {schemaVersion: HEAD_SCHEMA, key: key(request), digest: envelope.digest, version: nextVersion}, {merge: false});
        return nextVersion;
      });
      stillOwned(request.owner);
      return {stored: true, candidateId, variant, bindingDigest: envelope.digest, version};
    },
  });
}
