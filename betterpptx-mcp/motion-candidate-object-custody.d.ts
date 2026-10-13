import type {MotionResourceOwner,MotionResourceReference} from './motion-preparation-object-custody.mjs';
export interface StoredMotionEvidenceHeader {
 schemaVersion:'betterpptx.private-motion-evidence.v1';evidenceId:string;payloadSha256:string;payloadBytes:number;
 sourceSha256:string;sourceResourceId:string;resourceOwner:MotionResourceOwner;
}
export interface MotionCandidateObjectCustodyOptions {
 client:{collection(name:string):{doc(id:string):{get():Promise<{exists:boolean;data():unknown}>}}};collection:string;
 resourceCustody:{
  lookupMetadata(input:{resourceId:string;owner:MotionResourceOwner;expectedKind:'evidence'|'original-source'}):Promise<MotionResourceReference>;
  readBytes(input:{resource:MotionResourceReference;owner:MotionResourceOwner;maxBytes:number}):Promise<Uint8Array>;
 };
 authorizeEvidenceHeader(input:{header:StoredMotionEvidenceHeader;owner:MotionResourceOwner}):Promise<boolean>;
 maxEvidenceBytes?:number;
}
export function createMotionCandidateObjectCustody(options:MotionCandidateObjectCustodyOptions):Readonly<{
 lookupMetadata(evidenceId:string):Promise<StoredMotionEvidenceHeader>;
 lookupSourceMetadata(resourceId:string):Promise<MotionResourceReference>;
 readBytes(metadata:StoredMotionEvidenceHeader,bounds:{maxBytes:number}):Promise<Buffer>;
}>;
