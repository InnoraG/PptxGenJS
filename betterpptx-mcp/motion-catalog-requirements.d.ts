export type SampledTravelConstraint={landmark:'rootJoint'|'chest'|'head'|'leftHand'|'rightHand';frame:'source-world'|'root-translation-removed'}&({min:number;max?:number}|{min?:number;max:number});
export interface MotionRequirements{
 selectable?:boolean;presenterId?:string;owningHand?:'left'|'right'|'both';durationMs?:{min?:number;max?:number};minimumHoldMs?:number;
 maximumRootPathMeters?:number;maximumChestPathMeters?:number;maximumHeadPathMeters?:number;
 maximumRootPathShoulderSpans?:number;maximumChestPathShoulderSpans?:number;maximumHeadPathShoulderSpans?:number;
 sampledTravel?:SampledTravelConstraint[];nativePlaybackQualified?:boolean;targetContactQualified?:boolean;
}
export const MOTION_REQUIREMENTS_SCHEMA:Readonly<Record<string,unknown>>;
export function validateMotionRequirements(requirements:MotionRequirements):MotionRequirements;
export interface MotionRequirementFit{status:'requirements-unmet'|'review-required'|'requirements-satisfied';executionAvailable:boolean;qualificationScope:'requested-properties-only';requirements:Array<{field:string;requested:unknown;status:'unknown'|'satisfied'|'unmet';observed:unknown;evidencePath:string|null;reason:string}>;measurementBasis?:Record<string,unknown>}
export function evaluateMotionRequirements(entry:Record<string,unknown>,requirements:MotionRequirements):MotionRequirementFit;
export function evaluateMotionCatalog(entries:Record<string,unknown>[],requirements:MotionRequirements):{entries:Record<string,unknown>[];motionQuery:Record<string,unknown>};
