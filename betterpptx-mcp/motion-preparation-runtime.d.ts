import type {MotionPreparationResourceBundleSchemaVersion} from './motion-preparation-private-input-contract.mjs';

export type MotionHash = string;

export type MotionOwner = Readonly<{
  schemaVersion: 'betterpptx.resource-owner.v1';
  kind: 'install' | 'connector' | 'session';
  id: MotionHash;
}>;

export type SourceClock = Readonly<{
  startFrame: number;
  endFrame: number;
  frameCount: number;
  fps: number;
  durationMs: number;
}>;

export type PrivatePreparationIdentity = Readonly<{
  sourceSha256: MotionHash | null;
  sourceMotionSha256: MotionHash | null;
  sourceRigSha256: MotionHash | null;
  sourceRestSha256: MotionHash | null;
  targetRigSha256: MotionHash | null;
  targetRestSha256: MotionHash | null;
  calibrationSha256: MotionHash | null;
  correspondenceSha256: MotionHash | null;
  sourceApprovalSha256: MotionHash | null;
  measurementSha256: MotionHash | null;
}>;

export type PrivatePreparationRecord = Readonly<{
  schemaVersion: 'private-preparation-resolver-record.v1';
  candidateId: string;
  targetResourceId: string;
  ownerBindingKey: MotionHash;
  identities: PrivatePreparationIdentity;
  sourceDomain: 'normalized-skinless-source-motion' | 'direct-skinned-target-glb' | 'unknown';
  approval: 'approved-private-preparation' | 'unverified' | 'rejected';
  parseState: 'measured' | 'unknown' | 'failed';
  sourceClock: SourceClock | null;
  animationProfile: Readonly<{
    channelKinds: readonly ('rotation' | 'translation' | 'scale' | 'weights' | 'unknown')[];
    interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE' | 'unknown';
    componentType: 'FLOAT' | 'unknown';
    externalResources: boolean;
    skinState: 'skinless' | 'skinned' | 'unknown';
    selectedAnimationCount: number;
  }>;
  rigCompatibility: Readonly<{
    sourceRest: 'verified' | 'unknown' | 'incompatible';
    targetRest: 'verified-unreflected' | 'unknown' | 'incompatible';
    retarget: 'verified-exact-source-target' | 'unknown' | 'incompatible';
  }>;
  calibration: Readonly<{
    state: 'independently-calibrated' | 'unknown';
    sourceRestSha256: MotionHash | null;
    targetRestSha256: MotionHash | null;
    anatomicalFrontSign: -1 | 1 | null;
  }>;
  correspondence: Readonly<{
    state: 'complete-verified' | 'unknown' | 'missing';
    policy: 'destination-anatomical-labels-source-side-swap';
    evidenceSha256: MotionHash | null;
  }>;
  asymmetry: Readonly<{
    state: 'asymmetric-observed' | 'symmetric-verified' | 'unknown';
    evidenceSha256: MotionHash | null;
    sourceSha256: MotionHash | null;
  }>;
}>;

export type PrivateMotionResource = Readonly<{
  resourceId: string;
  contentSha256: MotionHash;
  resourceOwner: MotionOwner;
}>;

export type MotionNormalizationMetric = Readonly<{
  quantity: string;
  basisId: string;
  value: number;
  unit: string;
  unitMeaning: string;
  measurementSha256: MotionHash;
  producerSha256: MotionHash;
  sampleCount: number;
  clockSha256: MotionHash;
  frameId: string;
  axes: Readonly<{ verticalAxis: 'x' | 'y' | 'z'; horizontalAxes: readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z'] }>;
  poseBasis: string;
  restBasis: string;
  calibrationId: string;
  calibrationState: 'verified';
}>;

export type MotionNormalizationContract = Readonly<{
  schemaVersion: 'betterpptx.motion-compatible-normalization.v1';
  sourceMetric: MotionNormalizationMetric & Readonly<{ sourceSha256: MotionHash }>;
  targetMetric: MotionNormalizationMetric & Readonly<{ targetRigSha256: MotionHash; targetRestSha256: MotionHash }>;
  transfer: Readonly<{
    formula: 'target.value/source.value';
    rootMotionScale: number;
    unit: string;
    space: 'world';
    axes: 'all';
    anchor: 'start';
    travelPolicy: 'preserve-source-trajectory';
    fallback: 'reject-if-unknown';
  }>;
}>;

export type MotionPreparationResourceBundle = Readonly<{
  schemaVersion: MotionPreparationResourceBundleSchemaVersion;
  record: PrivatePreparationRecord;
  sourceOriginal: PrivateMotionResource;
  sourceMotion: PrivateMotionResource;
  targetModel: PrivateMotionResource;
  targetConstructionRest: PrivateMotionResource;
  normalizationContract: MotionNormalizationContract;
  normalizationReceipt: Readonly<{
    sourceSha256: MotionHash;
    sourceMotionSha256: MotionHash;
    producerSha256: MotionHash;
    contractSha256: MotionHash;
  }>;
}>;

export interface TrustedMotionPreparationRepository {
  schemaVersion: 'betterpptx.trusted-motion-preparation-repository.v1';
  lookupCandidate(input: { candidateId: string; owner: MotionOwner }): Promise<{ candidateId: string; resourceOwner: MotionOwner } | null>;
  lookupCandidates?(input: { candidateIds: readonly string[]; owner: MotionOwner }): Promise<Array<{ candidateId: string; resourceOwner: MotionOwner }>>;
  lookupTarget(input: { targetModel: string; owner: MotionOwner }): Promise<{ resourceOwner: MotionOwner } | null>;
  resolvePreparationInput(input: {
    candidateId: string;
    targetModel: string;
    targetResourceId: string;
    variant: 'original' | 'skeletal-mirrored';
    owner: MotionOwner;
  }): Promise<MotionPreparationResourceBundle>;
  resolvePreparationInputs?(input: { requests: ReadonlyArray<{ candidateId: string; targetModel: string; targetResourceId: string; variant: 'original' | 'skeletal-mirrored' }>;owner: MotionOwner }): Promise<Array<{ candidateId: string; targetModel: string; targetResourceId: string; variant: 'original' | 'skeletal-mirrored'; bundle: MotionPreparationResourceBundle | null; reasonCode?: 'PREPARATION_SOURCE_NOT_APPROVED' | 'PREPARATION_DOMAIN_UNSUPPORTED' | 'PREPARATION_SOURCE_CLOCK_UNKNOWN' | 'PREPARATION_ANIMATION_PROFILE_UNSUPPORTED' | 'PREPARATION_RIG_REST_COMPATIBILITY_UNKNOWN' | 'PREPARATION_CALIBRATION_UNKNOWN' | 'PREPARATION_CORRESPONDENCE_UNKNOWN' | 'PREPARATION_NO_DISTINCT_MIRROR' | 'PREPARATION_MIRROR_DISTINCTNESS_UNKNOWN' | 'PREPARATION_PROFILE_UNAVAILABLE' | 'PREPARATION_INPUT_DRIFT' | 'PREPARATION_OWNER_OR_RESOURCE_MISMATCH' }>>;
  verifyPreparationEvidence(input: { facts: Readonly<Record<string, unknown>>; owner: MotionOwner }): Promise<boolean>;
  authorizeResource(input: { resource: PrivateMotionResource; owner: MotionOwner }): Promise<boolean>;
  readResourceBytes(input: { resource: PrivateMotionResource; owner: MotionOwner; maxBytes: number }): Promise<Uint8Array>;
}

export interface PreparedMotionCache {
  getVerifiedOutput?(input: { plan: unknown; owner: MotionOwner }): Promise<{prepared:PreparedMotionEntry;modelAsset:string} | null>;
  getVerified(input: { plan: unknown; owner: MotionOwner }): Promise<PreparedMotionEntry | null>;
  storeProduced(input: { plan: unknown; owner: MotionOwner; operation: unknown; output: unknown }): Promise<PreparedMotionEntry>;
  verifyReadback(input: { prepared: unknown; plan: unknown; owner: MotionOwner }): Promise<boolean>;
}

export type PreparedMotionEntry = Readonly<{
  preparedVariantId: string;
  cacheKey: MotionHash;
  outputSha256: MotionHash;
  outputBytes: number;
  sourceClock: SourceClock;
  variant: 'original' | 'skeletal-mirrored';
}>;

export function createMotionPreparationRuntime(input: {
  trustedRepository: TrustedMotionPreparationRepository;
  cache: PreparedMotionCache;
  currentOwner?: () => MotionOwner;
  /** Private supplied-bundle planning width; defaults32, singular fallback8. */
  catalogMetadataConcurrency?: number;
}): Readonly<{
  dependencies: Readonly<Record<string, (...args: any[]) => unknown>>;
  readWorkerInputs(privatePlan: unknown, owner: MotionOwner): Promise<unknown>;
  profileIdFor(query: unknown, owner: MotionOwner, cacheKey: MotionHash): string;
  targetResourceIdFor(targetModel: string, owner: MotionOwner): string;
}>;
