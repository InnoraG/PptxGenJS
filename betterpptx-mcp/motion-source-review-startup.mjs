import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {motionProgramProviderSpecifier} from './motion-program-default-provider.mjs'
import {resourceOwnerOf,resourceAuthorizationActive} from './auth/resource-authorization.mjs'
import {configureMotionSourceReviews,configureBuiltInMotionSourceReviews,validateMotionSourceReviewInputs} from './motion-source-authoring-reviews.mjs'

const invalid=()=>{throw Object.assign(new Error('Source review startup is unavailable.'),{code:'SOURCE_REVIEW_STARTUP_UNAVAILABLE'})}
export function initializeMotionSourceReviewCatalogs(catalogs){
 if(resourceAuthorizationActive()||!Array.isArray(catalogs)||catalogs.length>1000)invalid()
 const validated=catalogs.map(catalog=>{
  if(!catalog||Object.keys(catalog).some(k=>!['resourceOwner','records','catalogScope'].includes(k)))invalid()
  const catalogScope=catalog.catalogScope??'private';if(!['private','built-in'].includes(catalogScope))invalid()
  const resourceOwner=resourceOwnerOf(catalog);if(!resourceOwner||resourceOwner.kind==='local')invalid()
  return{resourceOwner,records:validateMotionSourceReviewInputs(catalog.records),catalogScope}
 })
 for(const catalog of validated){
  const {catalogScope,...input}=catalog
  if(catalogScope==='built-in')configureBuiltInMotionSourceReviews(input)
  else configureMotionSourceReviews(input)
 }
}

// Optional capability of the existing private provider. Neither configuration
// paths nor owner records are public tool arguments or public server results.
export async function loadTrustedMotionSourceReviewCatalogs(specifier=process.env.BETTERPPTX_MOTION_SOURCE_REVIEW_PROVIDER_MODULE||process.env.BETTERPPTX_MOTION_PREPARATION_PROVIDER_MODULE){
 specifier=motionProgramProviderSpecifier(specifier)
 if(specifier===undefined||specifier===null||specifier==='')return undefined
 if(typeof specifier!=='string'||specifier.length>4096||/[\x00-\x1f\x7f]/.test(specifier))invalid()
 try{
  const url=specifier.startsWith('file:')?new URL(specifier):pathToFileURL(path.resolve(specifier));if(url.protocol!=='file:')invalid()
  const provider=await import(url.href)
  if(provider.createTrustedMotionSourceReviewCatalogs===undefined)return undefined
  if(typeof provider.createTrustedMotionSourceReviewCatalogs!=='function')invalid()
  return await provider.createTrustedMotionSourceReviewCatalogs()
 }catch{invalid()}
}
