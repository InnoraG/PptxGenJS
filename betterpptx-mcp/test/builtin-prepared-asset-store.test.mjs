import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createBuiltInPreparedAssetLoader} from '../storage/builtin-prepared-asset-store.mjs'
const sha=b=>createHash('sha256').update(b).digest('hex')
function fixture(){
 const hash='a'.repeat(40),tenantId='product-input',glb=Buffer.from('verified model fixture')
 const record={_schema:'betterpptx.gen-asset.v1',kind:'rigged3d',hash,meta:{manifest:{fixture:true}},_blobs:{glb:{digest:sha(glb),bytes:glb.length,ext:'glb'}}}
 const raw=Buffer.from(JSON.stringify(record)),root='betterpptx-gen-assets/tenants/'+tenantId
 const objects=new Map([[root+'/records/'+hash+'.json',{bytes:raw,generation:'17'}],[root+'/blobs/'+sha(glb)+'.glb',{bytes:glb,generation:'19'}]])
 let blobReads=0
 const bucket={file(name,options){return {getMetadata:async()=>{const item=objects.get(name);if(!item)throw Error('Missing');return[{size:String(item.bytes.length),generation:item.generation}]},download:async()=>{const item=objects.get(name);if(options?.generation&&options.generation!==item.generation)throw Error('Wrong generation');if(name.includes('/blobs/'))blobReads++;return[item.bytes]}}}}
 return {objects,glb,root,load:createBuiltInPreparedAssetLoader({bucket}),storage:{tenantId,hash,recordGeneration:'17',recordSha256:sha(raw)},blobReads:()=>blobReads}
}
test('published asset loader verifies pinned metadata and actual blob bytes before returning model data',async()=>{
 const f=fixture(),asset=await f.load(f.storage)
 assert.deepEqual(Buffer.from(asset.glbBase64,'base64'),f.glb);assert.equal(f.blobReads(),1);assert.equal(asset.previewBase64,null)
})
test('record substitution or generation drift rejects before model payload read',async()=>{
 const f=fixture();f.objects.get(f.root+'/records/'+f.storage.hash+'.json').generation='18'
 await assert.rejects(f.load(f.storage),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'});assert.equal(f.blobReads(),0)
 const other=fixture();other.objects.get(other.root+'/records/'+other.storage.hash+'.json').bytes=Buffer.from('{}')
 await assert.rejects(other.load(other.storage),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'});assert.equal(other.blobReads(),0)
})
test('changed blob and a supplied tenant path never become a published model',async()=>{
 const f=fixture();f.objects.get(f.root+'/blobs/'+sha(f.glb)+'.glb').bytes=Buffer.alloc(f.glb.length,1)
 await assert.rejects(f.load(f.storage),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
 await assert.rejects(f.load({...f.storage,tenantId:'../private'}),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
})
