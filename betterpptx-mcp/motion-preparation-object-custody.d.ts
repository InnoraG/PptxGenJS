export interface MotionResourceOwner {schemaVersion:'betterpptx.resource-owner.v1';kind:'install'|'connector'|'session';id:string;}
export interface MotionResourceReference {resourceId:string;contentSha256:string;resourceOwner:MotionResourceOwner;}
export interface StoredMotionResourceObject extends MotionResourceReference {
 schemaVersion:'betterpptx.private-motion-resource-object.v1';bytes:number;
 kind:'original-source'|'normalized-motion'|'target-rig'|'construction-rest'|'evidence';
 object:{key:string;generation:string};
}
export interface MotionPreparationObjectCustodyOptions {
 client:{collection(name:string):{doc(id:string):{get():Promise<{exists:boolean;data():unknown}>}}};
 collection:string;
 bucket:{file(key:string,options:{generation:string}):{getMetadata():Promise<[unknown]>;download(options:{start:number;end:number;decompress:false;validation:false}):Promise<[Uint8Array]>}};
 authorizeStoredResource(input:{record:StoredMotionResourceObject;owner:MotionResourceOwner}):Promise<boolean>;
 maxRecordBytes?:number;maxResourceBytes?:number;
}
export function createMotionPreparationObjectCustody(options:MotionPreparationObjectCustodyOptions):Readonly<{
 lookupMetadata(input:{resourceId:string;owner:MotionResourceOwner;expectedKind?:StoredMotionResourceObject['kind']}):Promise<MotionResourceReference>;
 lookupTarget(input:{targetModel:string;owner:MotionResourceOwner}):Promise<MotionResourceReference>;
 authorizeResource(input:{resource:MotionResourceReference;owner:MotionResourceOwner}):Promise<true>;
 readBytes(input:{resource:MotionResourceReference;owner:MotionResourceOwner;maxBytes:number}):Promise<Buffer>;
}>;
