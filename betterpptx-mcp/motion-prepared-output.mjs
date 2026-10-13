const fail=()=>{throw Object.assign(new Error('Prepared motion availability could not be verified.'),{code:'MOTION_PREPARATION_PROFILE_DISCOVERY_UNAVAILABLE'})};
function closed(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
  ||Reflect.ownKeys(value).length!==keys.length||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key))
  ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!d.enumerable||!Object.hasOwn(d,'value')))fail();
}
export function validatePreparedOutput(value,variant){
 if(value?.state==='not-prepared'||value?.state==='not-assessed'){closed(value,['state']);return structuredClone(value);}
 closed(value,['state','modelAsset','preparedVariantId','variant','sourceClock','nativeQualification']);
 if(value.state!=='prepared'||!/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(value.modelAsset)||!/^prepared_variant_[a-f0-9]{32}$/.test(value.preparedVariantId)
  ||value.variant!==variant||!['original','skeletal-mirrored'].includes(variant)||value.nativeQualification!=='unqualified')fail();
 const c=value.sourceClock;closed(c,['startFrame','endFrame','frameCount','fps','durationMs','retimed']);
 if(c.retimed!==false||!Number.isSafeInteger(c.startFrame)||!Number.isSafeInteger(c.endFrame)||!Number.isSafeInteger(c.frameCount)
  ||c.frameCount<2||c.frameCount>10000000||c.endFrame-c.startFrame+1!==c.frameCount||!Number.isFinite(c.fps)||c.fps<=0||c.fps>1000
  ||!Number.isFinite(c.durationMs)||c.durationMs<0||c.durationMs>2678400000||Math.abs(c.durationMs-(c.frameCount-1)*1000/c.fps)>0.00001)fail();
 return structuredClone(value);
}
export async function attachPreparedOutputs(result,query,owner,lookup){
 if(typeof lookup!=='function')return result;
 const next=structuredClone(result);
 for(const profile of next.profiles)profile.preparedOutput=validatePreparedOutput(await lookup(structuredClone(query),structuredClone(owner),profile.profileId),query.variant);
 return next;
}
