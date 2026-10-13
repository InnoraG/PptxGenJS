import type {StoredMotionProgramProviderOptions} from './motion-program-store-provider.mjs';
import type {MotionResourceOwner as ResourceOwner} from './motion-preparation-object-custody.mjs';
export type MotionApprovalPurpose='resource-custody'|'evidence-header'|'measurement-receipt'|'preparation-evidence';
export interface PrivateMotionApproval {
 schemaVersion:'betterpptx.private-motion-approval.v1';purpose:MotionApprovalPurpose;subjectSha256:string;resourceOwner:ResourceOwner;
 status:'approved'|'revoked';decisionId:string;issuedAtMs:number;expiresAtMs:number;
}
export function motionProgramApprovalIdentity(input:{purpose:MotionApprovalPurpose;subject:unknown;owner:ResourceOwner;maxBytes?:number}):{key:string;subjectSha256:string};
export function createMotionProgramApprovalStore(options:{client:StoredMotionProgramProviderOptions['client'];collection:string;now?:()=>number;maxBytes?:number}):Readonly<Pick<StoredMotionProgramProviderOptions,'authorizeStoredResource'|'authorizeEvidenceHeader'|'validateMeasurementReceipt'|'verifyPreparationEvidence'>>;
