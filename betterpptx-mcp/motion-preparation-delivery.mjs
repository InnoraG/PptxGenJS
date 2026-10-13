import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const fail=()=>{throw Object.assign(new Error('The prepared motion file is unavailable for this request.'),{code:'MOTION_PREPARATION_OUTPUT_INVALID'});};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const keys=['schemaVersion','downloadUrl','downloadName','contentType','sha256','bytes','expiresAt','downloadLinkExpiresAt'];

export function validateMotionPreparedFile(file,prepared){
 if(!file||Object.getPrototypeOf(file)!==Object.prototype||Reflect.ownKeys(file).length!==keys.length
  ||Reflect.ownKeys(file).some(k=>typeof k!=='string'||!keys.includes(k))
  ||keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(file,k)||{},'value')))fail();
 let url;try{url=new URL(file.downloadUrl);}catch{fail();}
 const expiry=Date.parse(file.expiresAt),linkExpiry=Date.parse(file.downloadLinkExpiresAt);
 if(file.schemaVersion!=='betterpptx.motion-prepared-file.v1'||url.protocol!=='https:'||url.username||url.password
  ||file.downloadName!==prepared.preparedVariantId+'.glb'||file.contentType!=='model/gltf-binary'
  ||!/^[a-f0-9]{64}$/.test(file.sha256)||file.sha256!==prepared.outputSha256||file.bytes!==prepared.outputBytes
  ||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>128*1024*1024
  ||!Number.isFinite(expiry)||!Number.isFinite(linkExpiry)||expiry<=Date.now()||linkExpiry<=Date.now()||linkExpiry>expiry)fail();
 return structuredClone(file);
}

/** Private composition of the existing verified cache and owner-bound artifact store. */
export function createMotionPreparedFileDelivery({cache,artifactStore,currentResourceOwner,writeBytes}={}){
 if(typeof cache?.readVerifiedBytes!=='function'||typeof currentResourceOwner!=='function'||typeof writeBytes!=='function'
  ||['prepareArtifactTarget','finalizeSaveTarget'].some(k=>typeof artifactStore?.[k]!=='function'))fail();
 return async({prepared,plan,owner,assertLease})=>{
  if(typeof assertLease!=='function'||!isDeepStrictEqual(owner,currentResourceOwner()))fail();
  await assertLease();const bytes=await cache.readVerifiedBytes({prepared,plan,owner});
  if(!Buffer.isBuffer(bytes)||bytes.length!==prepared.outputBytes||sha(bytes)!==prepared.outputSha256)fail();
  await assertLease();
  const target=await artifactStore.prepareArtifactTarget({fileName:prepared.preparedVariantId+'.glb',kind:'prepared-motion',extension:'.glb',contentType:'model/gltf-binary'});
  if(!target||typeof target.target!=='string'||!isDeepStrictEqual(owner,currentResourceOwner()))fail();
  await writeBytes(target.target,bytes);await assertLease();
  const finalized=await artifactStore.finalizeSaveTarget(target,{expectedSha256:prepared.outputSha256,expectedBytes:prepared.outputBytes});
  if(!isDeepStrictEqual(owner,currentResourceOwner()))fail();await assertLease();
  return validateMotionPreparedFile({schemaVersion:'betterpptx.motion-prepared-file.v1',downloadUrl:finalized.downloadUrl,
   downloadName:finalized.downloadName,contentType:'model/gltf-binary',sha256:prepared.outputSha256,bytes:prepared.outputBytes,
   expiresAt:finalized.expiresAt,downloadLinkExpiresAt:finalized.downloadLinkExpiresAt},prepared);
 };
}
