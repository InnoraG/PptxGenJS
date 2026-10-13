export type CandidateId = `candidate_${string}`;
export type CandidateCursor = `cursor_${string}`;
export type Unknown = {state:'unknown';value:null};
export interface SourceObservation {
 clock:{durationMs:number;fps:number;frameCount:number;sampleCount:number;temporalCoverage:'every-integer-frame'};
 coordinateSpace:'source-motion-space';units:{state:'unverified';value:null};confidence:'direct-source-measurement';rigBoneCount:number;
 measuredLandmarks:('root'|'head'|'leftHand'|'rightHand'|'leftFoot'|'rightFoot')[];
 geometricBasis:{pelvisVerifiedSamples:number;pelvisUnknownSamples:number;chestVerifiedSamples:number;chestUnknownSamples:number};
}
interface CandidateBase {
 schemaVersion:'betterpptx.owner-motion-candidate.v1';candidateId:CandidateId;targetClock:null;preparationRequired:true;
 semantics:{action:Unknown;actionOwningHand:Unknown;activeStroke:Unknown;absoluteFacing:Unknown;contact:Unknown;support:Unknown;slideDirection:Unknown};
}
type Lifecycle<S>={parseState:S;preparationState:'unprepared';selectability:'not-selectable';semanticQualification:'unqualified'};
export type Candidate = CandidateBase & (
 {lifecycle:Lifecycle<'measured'>;sourceObservation:SourceObservation;limitations:('SOURCE_CLOCK_NOT_PREPARED_TARGET_CLOCK'|'SOURCE_UNITS_UNVERIFIED'|'SOURCE_MEASUREMENT_NOT_SEMANTIC_QUALIFICATION'|'CANDIDATE_NOT_MOTION_SELECTOR')[]}
 | {lifecycle:Lifecycle<'not-measured'>;sourceObservation:null;confidence:'unknown';reasonCode:'MEASUREMENT_NOT_REQUESTED'}
 | {lifecycle:Lifecycle<'failed-or-unknown'>;sourceObservation:null;confidence:'unknown';reasonCode:'MEASUREMENT_UNAVAILABLE'}
);
export interface CandidatePage {schemaVersion:'betterpptx.owner-motion-candidate-discovery.v1';candidates:Candidate[];nextCursor:CandidateCursor|null}
export interface CandidateDetail {schemaVersion:'betterpptx.owner-motion-candidate-detail.v1';candidate:Candidate}
// Public calls never accept owners, evidence hashes, filesystem/provider identities or selection fields.
export interface CandidateDiscovery {
 list(args?:{limit?:number;cursor?:CandidateCursor}):Promise<CandidatePage>;
 get(args:{candidateId:CandidateId}):Promise<Candidate>;
}
// Private only: unknown rig/algorithm/artifact facts must be null, not guessed or sentinel hashes.
export interface PrivateIdentity {sourceSha256:string;algorithmSha256:string|null;rigRestSha256:string|null;measurementArtifactSha256:string|null}
export type PrivateEvidence = {identity:PrivateIdentity;parseState:'measured';observation:SourceObservation}
 | {identity:PrivateIdentity;parseState:'not-measured'|'failed-or-unknown';observation:null};
export interface TrustedResourceOwner {schemaVersion:'betterpptx.resource-owner.v1';kind:'install'|'connector'|'session';id:string}
export interface PrivateEntry {candidateId:CandidateId;ownerKey:string;private:PrivateEvidence}
export interface PrivatePage {token:CandidateCursor;ownerKey:string;ids:CandidateId[];offset:number;limit:number;expiresAt:number;nextToken:CandidateCursor|null}
export interface RegistryState {version:1;entries:PrivateEntry[];pages:PrivatePage[]}
export interface PrivateAdapter {transaction<T>(fn:(state:RegistryState)=>T|Promise<T>):Promise<T>}
export interface CandidateRepository {
 ingest(owner:Readonly<TrustedResourceOwner>,evidence:PrivateEvidence):Promise<PrivateEntry>;
 get(owner:Readonly<TrustedResourceOwner>,id:CandidateId):Promise<PrivateEntry>;
 firstPage(owner:Readonly<TrustedResourceOwner>,args:{limit:number;now:number;ttlMs:number}):Promise<{entries:PrivateEntry[];nextCursor:CandidateCursor|null}>;
 nextPage(owner:Readonly<TrustedResourceOwner>,args:{cursor:CandidateCursor;limit?:number;now:number}):Promise<{entries:PrivateEntry[];nextCursor:CandidateCursor|null}>;
 pruneExpired(owner:Readonly<TrustedResourceOwner>,now:number):Promise<{prunedSnapshots:number;releasedPages?:number;releasedReferences?:number}>;
}
export type RuntimeConfig = ({adapter:PrivateAdapter;repository?:never}|{repository:CandidateRepository;adapter?:never}) & {
 currentResourceOwner:()=>TrustedResourceOwner;
 verifyEvidence:(input:PrivateEvidence, capturedOwner:Readonly<TrustedResourceOwner>)=>Promise<boolean>;now?:()=>number;cursorTtlMs?:number;
 limits?:Partial<{entriesPerOwner:number;entriesGlobal:number;pagesPerOwner:number;pagesGlobal:number;snapshotRefsPerOwner:number;snapshotRefsGlobal:number}>;
}
export interface CandidateRuntime {publicReadOnly:CandidateDiscovery;privateIngest:(input:PrivateEvidence)=>Promise<CandidateId>}
