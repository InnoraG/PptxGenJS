import type {MotionCandidateObjectCustodyOptions} from './motion-candidate-object-custody.mjs';
import type {MotionPreparationObjectCustodyOptions} from './motion-preparation-object-custody.mjs';
import type {MotionCandidateStartupConfiguration} from './motion-candidate-private-provider.mjs';
import {createStoredMotionPreparationProvider} from './motion-preparation-store-provider.mjs';
import type {BuiltInMotionSourceReviewReference} from './storage/motion-source-review-catalog.mjs';
import type {TrustedMotionSourceReviewCatalog} from './motion-source-review-startup.mjs';
type PreparationOptions=Parameters<typeof createStoredMotionPreparationProvider>[0];
export interface StoredMotionProgramProviderOptions {
 client:PreparationOptions['client'] & MotionPreparationObjectCustodyOptions['client'];
 bucket:MotionPreparationObjectCustodyOptions['bucket'];
 candidateCollection:string;evidenceCollection:string;resourceCollection:string;preparationCollection:string;
 sourceReviewCollection?:string;
 authorizeStoredResource:MotionPreparationObjectCustodyOptions['authorizeStoredResource'];
 authorizeEvidenceHeader:MotionCandidateObjectCustodyOptions['authorizeEvidenceHeader'];
 validateMeasurementReceipt:MotionCandidateStartupConfiguration['validateMeasurementReceipt'];
 verifyPreparationEvidence:PreparationOptions['verifyPreparationEvidence'];
 storageLimits?:Partial<Record<'entriesPerOwner'|'entriesGlobal'|'pagesPerOwner'|'pagesGlobal'|'snapshotRefsPerOwner'|'snapshotRefsGlobal'|'chunkSize'|'maxEntryBytes'|'maxDocumentBytes'|'maxReads'|'maxWrites'|'maxTransactionBytes',number>>;
 maxEvidenceBytes?:number;cursorTtlMs?:number;maxRecordBytes?:number;maxResourceBytes?:number;
 maxBundleBytes?:number;maxVersionsPerBinding?:number;
 /** Private catalog metadata scheduling; default bulk32/fallback8. */
 catalogMetadataConcurrency?:number;
}
export function createStoredMotionProgramProvider(options:StoredMotionProgramProviderOptions):Readonly<ReturnType<typeof createStoredMotionPreparationProvider> & {
 createTrustedMotionCandidateStartup():Promise<MotionCandidateStartupConfiguration>;
 createTrustedMotionPreparationRepository():Promise<ReturnType<typeof createStoredMotionPreparationProvider>['trustedMotionPreparationRepository']>;
 createTrustedMotionSourceReviewCatalogs?():Promise<TrustedMotionSourceReviewCatalog[]>;
 publishBuiltInMotionSourceReviewCatalog?(reference:BuiltInMotionSourceReviewReference):Promise<{recordCount:number;payloadSha256:string;reused:boolean;writes:number}>;
}>;
