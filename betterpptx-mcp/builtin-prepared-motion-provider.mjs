import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {motionProgramProviderSpecifier} from './motion-program-default-provider.mjs'
export async function loadTrustedBuiltInPreparedMotionPublication(specifier=process.env.BETTERPPTX_MOTION_PREPARATION_PROVIDER_MODULE){
 specifier=motionProgramProviderSpecifier(specifier)
 if(specifier===undefined||specifier===null||specifier==='')return undefined
 const fail=()=>{throw Object.assign(new Error('The built-in motion library could not be initialized.'),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})}
 if(typeof specifier!=='string'||specifier.length>4096||/[\x00-\x1f\x7f]/.test(specifier))fail()
 try{
  const url=specifier.startsWith('file:')?new URL(specifier):pathToFileURL(path.resolve(specifier));if(url.protocol!=='file:')fail()
  const provider=await import(url.href)
  if(provider.createTrustedBuiltInPreparedMotionPublication===undefined)return undefined
  if(typeof provider.createTrustedBuiltInPreparedMotionPublication!=='function')fail()
  const result=await provider.createTrustedBuiltInPreparedMotionPublication();if(result===undefined)return undefined
  if(!result||Object.getPrototypeOf(result)!==Object.prototype||Object.keys(result).length!==2||!Object.hasOwn(result,'publication')||typeof result.loadAsset!=='function')fail()
  return result
 }catch{fail()}
}
