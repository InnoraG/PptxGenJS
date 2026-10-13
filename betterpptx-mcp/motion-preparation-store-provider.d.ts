import type {MotionOwner, PrivateMotionResource, MotionPreparationResourceBundle,
  TrustedMotionPreparationRepository} from './motion-preparation-runtime.mjs';
import type {MotionPreparationObjectCustodyOptions} from './motion-preparation-object-custody.mjs';

export interface MotionResourceCustody {
  lookupMetadata(input: {resourceId: string; owner: MotionOwner}): Promise<PrivateMotionResource | null>;
  lookupTarget(input: {targetModel: string; owner: MotionOwner}): Promise<PrivateMotionResource | null>;
  authorizeResource(input: {resource: PrivateMotionResource; owner: MotionOwner}): Promise<boolean>;
  readBytes(input: {resource: PrivateMotionResource; owner: MotionOwner; maxBytes: number}): Promise<Uint8Array>;
}

export interface MotionCandidateStartup {
  registryRepository: {
    ingest(owner: MotionOwner, evidence: unknown): Promise<unknown>;
    get(owner: MotionOwner, candidateId: string): Promise<unknown>;
    firstPage(owner: MotionOwner, options: unknown): Promise<unknown>;
    nextPage(owner: MotionOwner, options: unknown): Promise<unknown>;
    pruneExpired(owner: MotionOwner, now: number): Promise<unknown>;
  };
  evidenceRepository: {
    lookupMetadata(resourceId: string): Promise<unknown>;
    lookupSourceMetadata(resourceId: string): Promise<unknown>;
    readBytes(metadata: unknown, options: {maxBytes: number}): Promise<Uint8Array>;
  };
  validateMeasurementReceipt: (...args: unknown[]) => Promise<boolean>;
  maxEvidenceBytes?: number;
  cursorTtlMs?: number;
}

export function createStoredMotionPreparationProvider(input: {
  client: {
    collection(name: string): {doc(id: string): unknown};
    getAll?(...references: unknown[]): Promise<unknown[]>;
    runTransaction<T>(callback: (transaction: {
      get(reference: unknown): Promise<{exists: boolean; data(): unknown}>;
      set(reference: unknown, data: unknown, options: {merge: false}): void;
    }) => Promise<T>): Promise<T>;
  };
  collection: string;
  candidateStartup: MotionCandidateStartup;
  resourceCustody: MotionResourceCustody;
  verifyPreparationEvidence(input: {facts: Readonly<Record<string, unknown>>; owner: MotionOwner;
    variant?: 'original' | 'skeletal-mirrored'; targetModel?: string}): Promise<boolean>;
  maxBundleBytes?: number;
  maxVersionsPerBinding?: number;
  /** Private metadata row scheduling only; defaults bulk32/fallback8. */
  catalogMetadataConcurrency?: number;
}): Readonly<{
  trustedMotionPreparationRepository: TrustedMotionPreparationRepository;
  trustedMotionCandidateStartup: MotionCandidateStartup;
  registerApprovedBundle(input: {
    candidateId: string;
    targetModel: string;
    variant: 'original' | 'skeletal-mirrored';
    owner: MotionOwner;
    bundle: MotionPreparationResourceBundle;
    expectedPreviousDigest?: string | null;
  }): Promise<{stored: true; candidateId: string; variant: 'original' | 'skeletal-mirrored'; bindingDigest: string; version: number}>;
}>;

export function createObjectStoredMotionPreparationProvider(input:
 Omit<Parameters<typeof createStoredMotionPreparationProvider>[0], 'resourceCustody'>
 & Pick<MotionPreparationObjectCustodyOptions,'bucket'|'authorizeStoredResource'|'maxRecordBytes'|'maxResourceBytes'>
 & {resourceCollection:string;client:MotionPreparationObjectCustodyOptions['client']}
): ReturnType<typeof createStoredMotionPreparationProvider>;
