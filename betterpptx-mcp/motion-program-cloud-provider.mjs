import {createStoredMotionProgramProvider} from './motion-program-store-provider.mjs';
import {createMotionProgramApprovalStore} from './motion-program-approval-store.mjs';
import {DEFAULT_MOTION_SOURCE_REVIEW_COLLECTION} from './storage/motion-source-review-catalog.mjs';
import {createHash} from 'node:crypto';
import {createBuiltInPreparedAssetLoader} from './storage/builtin-prepared-asset-store.mjs';
import {decodeBuiltInPreparedPublication} from './storage/builtin-prepared-publication-codec.mjs';
const unavailable=()=>Object.assign(new Error('The motion program provider could not be initialized.'),{code:'MOTION_PROGRAM_PROVIDER_UNAVAILABLE'});
const collectionKeys={candidateCollection:'CANDIDATE',evidenceCollection:'EVIDENCE',resourceCollection:'RESOURCE',preparationCollection:'PREPARATION',approvalCollection:'APPROVAL'};
export const DEFAULT_MOTION_PROGRAM_COLLECTIONS=Object.freeze({candidateCollection:'betterpptx_motion_candidates',evidenceCollection:'betterpptx_motion_evidence',resourceCollection:'betterpptx_motion_resources',preparationCollection:'betterpptx_motion_preparations',approvalCollection:'betterpptx_motion_approvals'});

export function motionProgramCloudConfiguration(env=process.env){
 const projectId=env.BETTERPPTX_GCP_PROJECT,bucketName=env.BETTERPPTX_GCS_BUCKET,databaseId=env.BETTERPPTX_FIRESTORE_DATABASE;
 if(typeof projectId!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)
  ||typeof bucketName!=='string'||!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucketName)
  ||typeof databaseId!=='string'||!(/^[A-Za-z0-9_-]{1,100}$/.test(databaseId)||databaseId==='(default)'))throw unavailable();
 const result={projectId,bucketName,databaseId};
 const catalogWidth=env.BETTERPPTX_MOTION_CATALOG_METADATA_CONCURRENCY;
 if(catalogWidth!==undefined){if(typeof catalogWidth!=='string'||!/^([1-9]|[1-5][0-9]|6[0-4])$/.test(catalogWidth))throw unavailable();result.catalogMetadataConcurrency=Number(catalogWidth);}
 for(const [key,suffix] of Object.entries(collectionKeys)){
  const configured=env['BETTERPPTX_MOTION_'+suffix+'_COLLECTION'];
  const value=configured===undefined?DEFAULT_MOTION_PROGRAM_COLLECTIONS[key]:configured;
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw unavailable();result[key]=value;
 }
 const configuredSourceReviewCollection=env.BETTERPPTX_MOTION_SOURCE_REVIEW_COLLECTION;
 const sourceReviewCollection=configuredSourceReviewCollection===undefined?DEFAULT_MOTION_SOURCE_REVIEW_COLLECTION:configuredSourceReviewCollection;
 if(typeof sourceReviewCollection!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(sourceReviewCollection))throw unavailable();
 result.sourceReviewCollection=sourceReviewCollection;
 const collections=Object.keys(collectionKeys).map(k=>result[k]);
 collections.push(sourceReviewCollection);
 if(new Set(collections).size!==collections.length)throw unavailable();
 return Object.freeze(result);
}
// Uses the product's already declared SDKs and existing workload/ADC identity.
// No credential file, token bridge, source acquisition, record writer, approval
// or target is created by startup. The established source-review collection is
// read at startup; deployments may select another distinct collection explicitly.
export async function createCloudMotionProgramProvider(configuration,{loadFirestore=()=>import('@google-cloud/firestore'),loadStorage=()=>import('@google-cloud/storage')}={}){
 try{
  const c=motionProgramCloudConfiguration({BETTERPPTX_GCP_PROJECT:configuration?.projectId,BETTERPPTX_GCS_BUCKET:configuration?.bucketName,BETTERPPTX_FIRESTORE_DATABASE:configuration?.databaseId,
   ...Object.fromEntries(Object.entries(collectionKeys).map(([key,suffix])=>['BETTERPPTX_MOTION_'+suffix+'_COLLECTION',configuration?.[key]])),
   BETTERPPTX_MOTION_SOURCE_REVIEW_COLLECTION:configuration?.sourceReviewCollection,
   BETTERPPTX_MOTION_CATALOG_METADATA_CONCURRENCY:configuration?.catalogMetadataConcurrency===undefined?undefined:(Number.isSafeInteger(configuration.catalogMetadataConcurrency)?String(configuration.catalogMetadataConcurrency):'invalid')});
  const [{Firestore},{Storage}]=await Promise.all([loadFirestore(),loadStorage()]);
  const client=new Firestore({projectId:c.projectId,databaseId:c.databaseId}),bucket=new Storage({projectId:c.projectId}).bucket(c.bucketName);
  const trust=createMotionProgramApprovalStore({client,collection:c.approvalCollection});
  const configured=createStoredMotionProgramProvider({...c,client,bucket,...trust});
  return Object.freeze({...configured,async createTrustedBuiltInPreparedMotionPublication(){
   const catalogId='presenter-motion',key=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
   const collection=client.collection(c.sourceReviewCollection);
   const publication=await collection.doc(key(['betterpptx.builtin-prepared-motion-catalog.v1',catalogId])).get();
   if(!publication.exists)return undefined;
   const source=await collection.doc(key(['betterpptx.builtin-source-review-index.v1',catalogId])).get();
   const value=decodeBuiltInPreparedPublication(publication.data()),index=source.exists?source.data():null;
   if(index?.schemaVersion!=='betterpptx.builtin-source-review-index.v1'||value?.schemaVersion!=='betterpptx.builtin-prepared-motion-catalog.v1'||value.catalogId!==catalogId||value.catalogPayloadSha256!==index.payloadSha256||!Array.isArray(value.entries)||value.entries.length!==index.recordCount)throw unavailable();
   return {publication:value,loadAsset:createBuiltInPreparedAssetLoader({bucket,prefix:process.env.BETTERPPTX_GEN_ASSET_GCS_PREFIX||'betterpptx-gen-assets'})};
  }});
 }catch{throw unavailable();}
}
let provider;
function getProvider(){
 if(!provider)provider=createCloudMotionProgramProvider(motionProgramCloudConfiguration()).catch(error=>{provider=undefined;throw error});
 return provider;
}
export async function createTrustedMotionCandidateStartup(){return (await getProvider()).createTrustedMotionCandidateStartup()}
export async function createTrustedMotionPreparationRepository(){return (await getProvider()).createTrustedMotionPreparationRepository()}
export async function createTrustedMotionSourceReviewCatalogs(){
 const configured=await getProvider();
 return configured.createTrustedMotionSourceReviewCatalogs?.();
}
export async function createTrustedBuiltInPreparedMotionPublication(){return(await getProvider()).createTrustedBuiltInPreparedMotionPublication()}
