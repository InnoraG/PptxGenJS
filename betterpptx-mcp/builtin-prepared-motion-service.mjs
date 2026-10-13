import {resourceAuthorizationActive} from './auth/resource-authorization.mjs'
let library=null
export function configureBuiltInPreparedMotionLibrary(value){
 if(resourceAuthorizationActive()||!value||['isPublishedHandle','hasReview','isPublishedTarget','compatibleTargets','assertAssetBytes','hydrateAsset','discoverProfiles'].some(name=>typeof value[name]!=='function'))throw Object.assign(new Error('Built-in prepared motions must be configured at startup.'),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
 library=value
}
export function builtInPreparedMotionLibrary(){return library}
export function isPublishedBuiltInMotionHandle(handle){return library?.isPublishedHandle(handle)===true}
export function assertPublishedBuiltInMotionBytes(handle,bytes){
 if(!library)throw Object.assign(new Error('The published prepared motion is unavailable.'),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
 return library.assertAssetBytes(handle,bytes)
}
export function hydratePublishedBuiltInMotion(hash){return library?.hydrateAsset(hash)??Promise.resolve(null)}
