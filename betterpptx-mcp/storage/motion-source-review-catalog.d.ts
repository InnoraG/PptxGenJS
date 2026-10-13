import type {MotionSourceReviewInput} from '../motion-source-authoring-reviews.mjs'
import type {TrustedMotionSourceReviewCatalog} from '../motion-source-review-startup.mjs'
type Snapshot={id?:string;exists:boolean;data():Record<string,unknown>}
type Document={id?:string;get():Promise<Snapshot>}
type Transaction={get(document:Document):Promise<Snapshot>;set(document:Document,value:Record<string,unknown>):void}
type Client={collection(name:string):{doc(id:string):Document;where(field:string,operator:'==',value:string):{get():Promise<{docs:Array<Snapshot&{id:string}>}>}};runTransaction<T>(callback:(transaction:Transaction)=>Promise<T>):Promise<T>}
export type BuiltInMotionSourceReviewReference={catalogId:string;resourceOwner:TrustedMotionSourceReviewCatalog['resourceOwner'];versionId:string;payloadSha256:string}
type PublicationResult={recordCount:number;payloadSha256:string;reused:boolean;writes:number}
export function createStoredMotionSourceReviewCatalog(options:{client:Client;collection?:string;now?:()=>string}):{publishForCurrentOwner(records:MotionSourceReviewInput[]):Promise<PublicationResult>;publishBuiltInCatalogReference(reference:BuiltInMotionSourceReviewReference):Promise<PublicationResult>;loadActiveCatalogs():Promise<TrustedMotionSourceReviewCatalog[]>;loadBuiltInCatalogs():Promise<TrustedMotionSourceReviewCatalog[]>}
export function decodeStoredMotionSourceReviewCatalogVersion(record:unknown,input:{resourceOwner:TrustedMotionSourceReviewCatalog['resourceOwner'];expectedPayloadSha256:string;chunks?:Array<{id:string;record:unknown}>}):MotionSourceReviewInput[]
