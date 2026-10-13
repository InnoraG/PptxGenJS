import type {MotionPreparationProfileQuery,MotionPreparationProfileDiscovery,MotionPreparedOutput,MotionVariant} from './motion-preparation-contract.mjs';
export interface BuiltInPreparedMotionStorage {
 tenantId:string;hash:string;recordGeneration:string;recordSha256:string;
}
export interface BuiltInPreparedMotionEntry {
 reviewId:`cap_${string}`;candidateId:`candidate_${string}`;sourceSha256:string;
 targetModel:`gen://rigged3d/${string}`;variant:MotionVariant;cacheKey:string;
 preparedOutput:Extract<MotionPreparedOutput,{state:'prepared'}>;
 storage:BuiltInPreparedMotionStorage;assetBundle:{sha256:string;bytes:number};
 outputSha256:string;preparationBundleDigest:string;targetRigSha256:string;targetRestSha256:string;
}
export interface BuiltInPreparedMotionPublication {
 schemaVersion:'betterpptx.builtin-prepared-motion-catalog.v1';
 catalogId:string;catalogPayloadSha256:string;entries:BuiltInPreparedMotionEntry[];
}
export interface BuiltInPreparedMotionAsset {
 glbBase64:string;previewBase64?:string|null;
 manifest:{contract:'betterpptx.motion-prepared-output.v1';preparedVariantId:string;variant:MotionVariant;outputBytes:number;sourceClock:{startFrame:number;endFrame:number;frameCount:number;fps:number;durationMs:number}};
 [key:string]:unknown;
}
export interface TrustedBuiltInPreparedMotionRuntime {
 publication:BuiltInPreparedMotionPublication;
 loadAsset(storage:BuiltInPreparedMotionStorage):Promise<BuiltInPreparedMotionAsset>;
}
export function createBuiltInPreparedMotionLibrary(input:TrustedBuiltInPreparedMotionRuntime & {
 bundleBytes(asset:BuiltInPreparedMotionAsset):Buffer;
 cache(hash:string,asset:BuiltInPreparedMotionAsset):BuiltInPreparedMotionAsset;
}):Readonly<{
 isPublishedHandle(handle:string):boolean;hasReview(id:string):boolean;isPublishedTarget(model:string):boolean;
 compatibleTargets(id:string):string[];assertAssetBytes(handle:string,bytes:Buffer):Buffer;
 hydrateAsset(hash:string):Promise<BuiltInPreparedMotionAsset|null>;
 discoverProfiles(query:MotionPreparationProfileQuery,options?:{assessOutput?:boolean}):Promise<MotionPreparationProfileDiscovery>;
}>;
