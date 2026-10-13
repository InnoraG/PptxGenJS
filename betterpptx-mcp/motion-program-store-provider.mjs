import {createDurableCandidateRepository} from './storage/motion-candidate-repository.mjs';
import {rememberMotionCatalogCandidates,readMotionCatalogCandidates} from './motion-catalog-planning-reads.mjs';
import {projectCandidate} from './motion-candidate-runtime.mjs';
import {assertMotionCandidateStartupConfiguration} from './motion-candidate-private-provider.mjs';
import {createMotionPreparationObjectCustody} from './motion-preparation-object-custody.mjs';
import {createMotionCandidateObjectCustody} from './motion-candidate-object-custody.mjs';
import {createStoredMotionPreparationProvider} from './motion-preparation-store-provider.mjs';
import {createStoredMotionSourceReviewCatalog} from './storage/motion-source-review-catalog.mjs';

// One explicit document/object composition for both private startup loaders.
// Trust validators remain mandatory, distinct from storage/hash checks. Nothing
// scans files, installs clients, creates owners/resources or assumes approval.
export function createStoredMotionProgramProvider({client,bucket,candidateCollection,evidenceCollection,resourceCollection,
 preparationCollection,authorizeStoredResource,authorizeEvidenceHeader,validateMeasurementReceipt,
 verifyPreparationEvidence,storageLimits,maxEvidenceBytes,cursorTtlMs,maxRecordBytes,maxResourceBytes,
 maxBundleBytes,maxVersionsPerBinding,sourceReviewCollection,catalogMetadataConcurrency}={}){
 const resourceCustody=createMotionPreparationObjectCustody({client,collection:resourceCollection,bucket,authorizeStoredResource,maxRecordBytes,maxResourceBytes});
 const evidenceRepository=createMotionCandidateObjectCustody({client,collection:evidenceCollection,resourceCustody,authorizeEvidenceHeader,maxEvidenceBytes});
 const registryRepository=createDurableCandidateRepository({client,collection:candidateCollection,validateEntry:projectCandidate,limits:storageLimits,candidatePlanningEntries:{remember:rememberMotionCatalogCandidates,read:readMotionCatalogCandidates}});
 const candidateStartup=assertMotionCandidateStartupConfiguration({registryRepository,evidenceRepository,validateMeasurementReceipt,
  ...(maxEvidenceBytes===undefined?{}:{maxEvidenceBytes}),...(cursorTtlMs===undefined?{}:{cursorTtlMs})});
 const provider=createStoredMotionPreparationProvider({client,collection:preparationCollection,candidateStartup,resourceCustody,
  verifyPreparationEvidence,maxBundleBytes,maxVersionsPerBinding,catalogMetadataConcurrency});
 const sourceReviews=sourceReviewCollection===undefined?null:createStoredMotionSourceReviewCatalog({client,collection:sourceReviewCollection});
 return Object.freeze({...provider,
  async createTrustedMotionCandidateStartup(){return provider.trustedMotionCandidateStartup},
  async createTrustedMotionPreparationRepository(){return provider.trustedMotionPreparationRepository},
  ...(sourceReviews?{
   async createTrustedMotionSourceReviewCatalogs(){
    const [privateCatalogs,builtInCatalogs]=await Promise.all([sourceReviews.loadActiveCatalogs(),sourceReviews.loadBuiltInCatalogs()]);return [...privateCatalogs,...builtInCatalogs];
   },
   publishMotionSourceReviewsForCurrentOwner:records=>sourceReviews.publishForCurrentOwner(records),
   publishBuiltInMotionSourceReviewCatalog:reference=>sourceReviews.publishBuiltInCatalogReference(reference),
  }:{}),
 });
}
