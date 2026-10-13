export type MotionVariant = 'original' | 'skeletal-mirrored';
export type MotionPreparedOutput =
 | {state:'not-prepared'|'not-assessed'}
 | {state:'prepared';modelAsset:`gen://rigged3d/${string}`;preparedVariantId:`prepared_variant_${string}`;variant:MotionVariant;sourceClock:{startFrame:number;endFrame:number;frameCount:number;fps:number;durationMs:number;retimed:false};nativeQualification:'unqualified'};
export type PreparationProfileId = `preparation_profile_${string}`;
export type MotionSource =
 | {kind:'candidate';id:`candidate_${string}`}
 | {kind:'model';id:`gen://rigged3d/${string}`}
 | {kind:'review';id:`cap_${string}`};
export interface TrustedResourceOwner {
 schemaVersion:'betterpptx.resource-owner.v1';
 kind:'install'|'connector'|'session';
 id:string;
}

// Public discovery is bound to the AI's explicit source, target and variant.
// It does not accept timing, geometry, contact, facing, or owner overrides.
export interface MotionPreparationProfileQuery {
 source:MotionSource;
 targetModel:`gen://rigged3d/${string}`;
 variant:MotionVariant;
}
export interface MotionPreparationProfileDescriptor {
 profileId:PreparationProfileId;
 capability:MotionVariant;
 sourceKind:MotionSource['kind'];
 targetCompatibility:'verified-for-request';
 sourceClockPolicy:'preserve-source';
 lifecycle:{selectability:'not-selectable';nativeQualification:'unqualified'};
 preparedOutput?:MotionPreparedOutput;
 preparationMode?:'reuse-only';
}
export interface MotionPreparationProfileDiscovery {
 schemaVersion:'betterpptx.motion-preparation-profile-discovery.v1';
 state:'eligible-profiles'|'none-eligible';
 request:{sourceKind:MotionSource['kind'];variant:MotionVariant};
 profiles:MotionPreparationProfileDescriptor[];
 reasonCode?:'SOURCE_REGISTRATION_REQUIRED'|'NO_QUALIFIED_PREPARATION_PROFILE';
}
export interface PrivateEligiblePreparationProfile {
 profileId:PreparationProfileId;
 owner:Readonly<TrustedResourceOwner>;
 request:MotionPreparationProfileQuery;
 capability:MotionVariant;
 sourceKind:MotionSource['kind'];
 targetCompatibility:'verified-for-request';
 sourceClockPolicy:'preserve-source';
}
// Private startup adapter. Each row must be owner-bound and matched to the
// exact request before the public-safe descriptor projection is returned.
export interface MotionPreparationProfileRegistry {
 listEligibleProfiles(
  query:Readonly<MotionPreparationProfileQuery>,
  owner:Readonly<TrustedResourceOwner>,
 ):Promise<PrivateEligiblePreparationProfile[]>;
}
export interface MotionPreparationProfileDiscoveryDependencies {
 lookupPreparedProfile?(query:Readonly<MotionPreparationProfileQuery>,owner:Readonly<TrustedResourceOwner>,profileId:PreparationProfileId,authorizedContext?:Readonly<{source:unknown;target:unknown}>,eligibleProfile?:PrivateEligiblePreparationProfile):Promise<MotionPreparedOutput>;
 beginPreparedProfileLookup?(query:Readonly<MotionPreparationProfileQuery>,owner:Readonly<TrustedResourceOwner>,profileId:PreparationProfileId,authorizedContext?:Readonly<{source:unknown;target:unknown}>,eligibleProfile?:PrivateEligiblePreparationProfile):Promise<() => Promise<MotionPreparedOutput>>;
 lookupSourceMetadata(source:Readonly<MotionSource>):Promise<unknown>;
 lookupTargetMetadata(targetModel:string):Promise<unknown>;
 listEligibleProfiles:MotionPreparationProfileRegistry['listEligibleProfiles'];
 // Optional request-scoped reuse of the already authorized review and target.
 listEligibleCatalogProfiles?(
  query:Readonly<MotionPreparationProfileQuery>,
  owner:Readonly<TrustedResourceOwner>,
  source:unknown,
  target:unknown,
 ):Promise<PrivateEligiblePreparationProfile[]>;
}
