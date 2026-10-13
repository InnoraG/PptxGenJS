import {createHash} from 'node:crypto'
import {recordResourceUsage} from '../billing/resource-meter.mjs'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const unavailable=()=>Object.assign(new Error('The published prepared model is unavailable.'),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})

// Read only the exact object generation referenced by a trusted product
// publication. This does not use or change a customer's private asset tenant.
export function createBuiltInPreparedAssetLoader({bucket,prefix='betterpptx-gen-assets'}={}){
 if(typeof bucket?.file!=='function'||typeof prefix!=='string'||!/^[-A-Za-z0-9_./]{1,200}$/.test(prefix)||prefix.split('/').some(part=>!part||part==='.'||part==='..'))throw unavailable()
 async function bytes(file,{expectedSha256,expectedBytes,maxBytes,generation}={}){
  let metadata
  try{[metadata]=await file.getMetadata()}catch{throw unavailable()}finally{recordResourceUsage({gcsClassBOps:1,externalCalls:1})}
  const length=Number(metadata?.size)
  if(!Number.isSafeInteger(length)||length<1||length>maxBytes||expectedBytes!==undefined&&length!==expectedBytes||generation!==undefined&&String(metadata.generation)!==generation)throw unavailable()
  let raw
  try{[raw]=await file.download({start:0,end:length-1,decompress:false,validation:false})}catch{throw unavailable()}finally{recordResourceUsage({gcsClassBOps:1,externalCalls:1,storageReadBytes:raw instanceof Uint8Array?raw.byteLength:0})}
  if(!(raw instanceof Uint8Array)||raw.byteLength!==length||sha(raw)!==expectedSha256)throw unavailable()
  return Buffer.from(raw)
 }
 return async storage=>{
  if(!storage||!/^[-a-z0-9_]{1,64}$/.test(storage.tenantId??'')||!/^[a-f0-9]{40}$/.test(storage.hash??'')||!/^[a-f0-9]{64}$/.test(storage.recordSha256??'')||!/^[1-9][0-9]{0,39}$/.test(storage.recordGeneration??''))throw unavailable()
  const root=`${prefix}/tenants/${storage.tenantId}`
  const raw=await bytes(bucket.file(`${root}/records/${storage.hash}.json`,{generation:storage.recordGeneration}),{expectedSha256:storage.recordSha256,maxBytes:262144,generation:storage.recordGeneration})
  let record;try{record=JSON.parse(raw)}catch{throw unavailable()}
  if(record._schema!=='betterpptx.gen-asset.v1'||record.kind!=='rigged3d'||record.hash!==storage.hash||!record.meta||!record._blobs?.glb||Object.keys(record._blobs).some(name=>!['glb','poster'].includes(name)))throw unavailable()
  const blobs={}
  for(const [name,ref]of Object.entries(record._blobs)){
   if(!ref||!/^[a-f0-9]{64}$/.test(ref.digest??'')||!/^[a-z0-9]{0,8}$/.test(ref.ext??'')||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>128*1024*1024)throw unavailable()
   blobs[name]=await bytes(bucket.file(`${root}/blobs/${ref.digest}${ref.ext?'.'+ref.ext:''}`),{expectedSha256:ref.digest,expectedBytes:ref.bytes,maxBytes:128*1024*1024})
  }
  return {...record.meta,glbBase64:blobs.glb.toString('base64'),previewBase64:blobs.poster?blobs.poster.toString('base64'):null}
 }
}
