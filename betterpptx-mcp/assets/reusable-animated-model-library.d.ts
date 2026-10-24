export interface ReusableAnimatedModelRecord {
 id:string; title:string; description:string; tags:string[]; glbFile:string;
 sourceSha256:string; bytes:number; license:string;
 clip:{id:string;label:string;index:number;durationMs:number;sourceWindow?:{start:number;end:number};idleProgress?:number};
 posterFrame?:{progress:number};
 initialization?:{visibilityDelayMs:number};
 approval:{status:'owner-approved'|'previously-validated';approvedOn:string};
 nativeQualification:{status:'pending-native'|'qualified'};
}
export interface ReusableAnimatedModelRegistry {
 schemaVersion:'betterpptx.reusable-animated-model-library.v1';
 source:string;sourceLabel:string;entries:ReusableAnimatedModelRecord[];
}
export interface ReusableAnimatedModelSelection {
 modelAsset:string;handle:string;sourceSha256:string;motionId:string;durationMs:number;
 scene:{animId:number;length:number;loop:false};sceneProgress:{start:number;end:number};
 posterFrame:{animId:number;progress:number};sourceBound:true;
 initialization?:{visibilityDelayMs:number};
 defaultScene:ReusableAnimatedModelSelection['scene'];
 defaultPosterFrame:ReusableAnimatedModelSelection['posterFrame'];
 defaultPlayScene:{effect:'playScene';animId:number;duration:number;loop:false;sceneProgress:{start:number;end:number}};
}
export function loadReusableAnimatedModelRegistry(catalogFiles?:URL[]):{rows:Array<{row:ReusableAnimatedModelRecord;handle:string;sourcePath:string;sourceDurationMs:number;source:string;sourceLabel:string}>;fingerprint:string};
export function reusableAnimatedModelLibraryFingerprint():string;
export function reusableAnimatedModelCatalogEntries():Array<Record<string,unknown>>;
export function resolveReusableAnimatedModelSelection(handle:string):ReusableAnimatedModelSelection|null;
export function resolveReusableAnimatedModelDefaults(handle:string,options?:Record<string,unknown>):Record<string,unknown>|null;
export function getReusableAnimatedModelNativeTransport(handle:string):{glbBytes:Buffer;sourceSha256:string;transportSha256:string;report:Record<string,unknown>}|null;
