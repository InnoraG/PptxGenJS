import {isDeepStrictEqual} from 'node:util';
import {ownerBindingKey} from './motion-preparation-planner.mjs';

const HASH=/^[a-f0-9]{40}$/,OWNER=/^[a-f0-9]{64}$/,PREP=/^prepared_variant_[a-f0-9]{32}$/;
const fail=()=>{throw Object.assign(new Error('The prepared model asset is unavailable for this request.'),{code:'MOTION_PREPARATION_OUTPUT_INVALID'});};
function plainClosed(value,keys){return Boolean(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d&&Object.hasOwn(d,'value');}));}
export function validatePreparedNativeAsset(entry){
 const m=entry?.manifest,c=m?.sourceClock;
 if(!plainClosed(m,['contract','preparedVariantId','variant','sourceClock','outputBytes'])||m.contract!=='betterpptx.motion-prepared-output.v1'||!PREP.test(m.preparedVariantId)||!['original','skeletal-mirrored'].includes(m.variant)
  ||!plainClosed(c,['startFrame','endFrame','frameCount','fps','durationMs'])||!Number.isSafeInteger(c.startFrame)||!Number.isSafeInteger(c.endFrame)||!Number.isSafeInteger(c.frameCount)||c.frameCount<2||c.frameCount>10000000||c.endFrame-c.startFrame+1!==c.frameCount||!Number.isFinite(c.fps)||c.fps<=0||c.fps>1000||!Number.isFinite(c.durationMs)||c.durationMs<0||c.durationMs>2678400000||Math.abs(c.durationMs-(c.frameCount-1)*1000/c.fps)>0.00001
  ||!Number.isSafeInteger(m.outputBytes)||m.outputBytes<1||typeof entry.glbBase64!=='string'||Buffer.from(entry.glbBase64,'base64').length!==m.outputBytes)fail();
 return entry;
}
// Private owner-granted asset hydration. Does not prepare, grant, select,
// retime, qualify, or acquire any source. The existing full asset bundle
// authorization remains the byte oracle before anything enters native cache.
export async function hydratePreparedNativeAsset({hash,owner,currentOwner,assetGrants,load,bundleBytes,cache}={}){
 if(!HASH.test(hash)||!['install','connector','session'].includes(owner?.kind)||!OWNER.test(owner.id)||typeof currentOwner!=='function'||!isDeepStrictEqual(owner,currentOwner())||typeof load!=='function'||typeof bundleBytes!=='function'||typeof cache!=='function'||typeof assetGrants?.assertAccess!=='function'||typeof assetGrants?.assertBytesSync!=='function')fail();
 const handle='gen://rigged3d/'+hash;
 await assetGrants.assertAccess(handle);
 const entry=await load(hash,'motion-preparation-'+ownerBindingKey(owner));
 if(!isDeepStrictEqual(owner,currentOwner()))fail();
 if(!entry)return null;
 validatePreparedNativeAsset(entry);
 assetGrants.assertBytesSync(handle,bundleBytes(entry));
 const cached=cache(hash,entry);
 if(!cached)fail();
 validatePreparedNativeAsset(cached);
 assetGrants.assertBytesSync(handle,bundleBytes(cached));
 return cached;
}
