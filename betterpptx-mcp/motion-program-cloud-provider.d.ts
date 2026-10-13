import {createStoredMotionProgramProvider} from './motion-program-store-provider.mjs';
import type {TrustedBuiltInPreparedMotionRuntime} from './builtin-prepared-motion-library.mjs';
export type CloudMotionProgramProvider=ReturnType<typeof createStoredMotionProgramProvider>&{
 createTrustedBuiltInPreparedMotionPublication():Promise<TrustedBuiltInPreparedMotionRuntime|undefined>;
};
export interface MotionProgramCloudConfiguration {
 projectId:string;bucketName:string;databaseId:string;candidateCollection:string;evidenceCollection:string;
 resourceCollection:string;preparationCollection:string;approvalCollection:string;sourceReviewCollection?:string;
 /** Optional private catalog metadata scheduling, integer1..64. */
 catalogMetadataConcurrency?:number;
}
export const DEFAULT_MOTION_PROGRAM_COLLECTIONS:Readonly<Pick<MotionProgramCloudConfiguration,'candidateCollection'|'evidenceCollection'|'resourceCollection'|'preparationCollection'|'approvalCollection'>>;
export function motionProgramCloudConfiguration(env?:Record<string,string|undefined>):Readonly<MotionProgramCloudConfiguration>;
export function createCloudMotionProgramProvider(configuration:MotionProgramCloudConfiguration,loaders?:{
 loadFirestore?:()=>Promise<{Firestore:new(options:{projectId:string;databaseId:string})=>Parameters<typeof createStoredMotionProgramProvider>[0]['client']}>;
 loadStorage?:()=>Promise<{Storage:new(options:{projectId:string})=>{bucket(name:string):Parameters<typeof createStoredMotionProgramProvider>[0]['bucket']}}>;
}):Promise<CloudMotionProgramProvider>;
export function createTrustedMotionCandidateStartup():ReturnType<ReturnType<typeof createStoredMotionProgramProvider>['createTrustedMotionCandidateStartup']>;
export function createTrustedMotionPreparationRepository():ReturnType<ReturnType<typeof createStoredMotionProgramProvider>['createTrustedMotionPreparationRepository']>;
export function createTrustedMotionSourceReviewCatalogs():Promise<import('./motion-source-review-startup.mjs').TrustedMotionSourceReviewCatalog[]|undefined>;
export function createTrustedBuiltInPreparedMotionPublication():Promise<TrustedBuiltInPreparedMotionRuntime|undefined>;
