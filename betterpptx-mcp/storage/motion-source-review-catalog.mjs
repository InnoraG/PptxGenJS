import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {currentResourceOwner,resourceOwnerOf,resourceAuthorizationActive} from '../auth/resource-authorization.mjs'
import {validateMotionSourceReviewInputs,SOURCE_REVIEW_CATALOG_RECORD_LIMIT} from '../motion-source-authoring-reviews.mjs'

const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const key=value=>digest(JSON.stringify(value))
const fail=()=>{throw Object.assign(new Error('Source review catalog is unavailable.'),{code:'SOURCE_REVIEW_STORE_UNAVAILABLE'})}
const ownerOf=value=>{const owner=resourceOwnerOf(value);if(!owner||owner.kind==='local')fail();return owner}
const indexId=owner=>key(['betterpptx.source-review-owner.v1',owner])
const versionId=(owner,sha)=>key(['betterpptx.source-review-version.v1',owner,sha])
const builtInIndexId=id=>key(['betterpptx.builtin-source-review-index.v1',id])
const data=snapshot=>snapshot?.exists?snapshot.data():null
const storedLimit=900000,decodedLimit=4000000
const chunkBytes=600000,aggregateLimit=64000000,maxChunks=128,transactionBytesLimit=8000000
const chunkId=(owner,payloadSha256,index,sha)=>key(['betterpptx.source-review-chunk.v1',owner,payloadSha256,index,sha])
const sameOwner=(record,owner)=>JSON.stringify(ownerOf(record))===JSON.stringify(owner)
const hashValue=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
export const DEFAULT_MOTION_SOURCE_REVIEW_COLLECTION='betterpptx_motion_source_review_catalogs'
function unpack(encoded,bytes,limit){
 if(typeof encoded!=='string'||Buffer.byteLength(encoded)>storedLimit||!Number.isSafeInteger(bytes)||bytes<1||bytes>limit)fail()
 try{const packed=Buffer.from(encoded,'base64');if(packed.toString('base64')!==encoded)fail();const raw=gunzipSync(packed,{maxOutputLength:bytes});if(raw.length!==bytes)fail();return raw}catch{fail()}
}
function chunkDescriptors(record,owner,sha){
 if(record.payloadEncoding!=='chunked-gzip-base64'||!Number.isSafeInteger(record.recordsJsonBytes)||record.recordsJsonBytes<2||record.recordsJsonBytes>aggregateLimit||!Array.isArray(record.chunks)||record.chunks.length<1||record.chunks.length>maxChunks)fail()
 let total=0
 for(const [index,row]of record.chunks.entries()){
  if(!row||row.index!==index||!hashValue(row.contentSha256)||!Number.isSafeInteger(row.decodedBytes)||row.decodedBytes<1||row.decodedBytes>chunkBytes||row.chunkId!==chunkId(owner,sha,index,row.contentSha256))fail()
  total+=row.decodedBytes
 }
 if(total!==record.recordsJsonBytes)fail()
 return record.chunks
}
function decodeChunk(row,record,owner,sha){
 if(!record||record.schemaVersion!=='betterpptx.private-source-review-chunk.v1'||record.recordKind!=='source-review-catalog-chunk'||!sameOwner(record,owner)||record.payloadSha256!==sha||record.index!==row.index||record.contentSha256!==row.contentSha256||record.decodedBytes!==row.decodedBytes||record.payloadEncoding!=='gzip-base64')fail()
 const raw=unpack(record.contentGzipBase64,row.decodedBytes,chunkBytes)
 if(digest(raw)!==row.contentSha256)fail()
 return raw
}

// Private storage encoding only. The decoded digest and owner-bound version
// identity remain the same; public review records are never compressed results.
export function decodeStoredMotionSourceReviewCatalogVersion(record,{resourceOwner,expectedPayloadSha256,chunks=[]}={}){
 const owner=ownerOf({resourceOwner})
 if(!record||record.recordKind!=='source-review-catalog-version'||JSON.stringify(ownerOf(record))!==JSON.stringify(owner)||record.payloadSha256!==expectedPayloadSha256||!/^[a-f0-9]{64}$/.test(expectedPayloadSha256||''))fail()
 let recordsJson
 if(record.schemaVersion==='betterpptx.private-source-review-version.v1'){
  if(typeof record.recordsJson!=='string'||Buffer.byteLength(record.recordsJson)>storedLimit)fail()
  recordsJson=record.recordsJson
 }else if(record.schemaVersion==='betterpptx.private-source-review-version.v2'){
  if(record.payloadEncoding!=='gzip-base64'||typeof record.recordsGzipBase64!=='string'||Buffer.byteLength(record.recordsGzipBase64)>storedLimit||!Number.isSafeInteger(record.recordsJsonBytes)||record.recordsJsonBytes<2||record.recordsJsonBytes>decodedLimit)fail()
  recordsJson=unpack(record.recordsGzipBase64,record.recordsJsonBytes,decodedLimit).toString('utf8')
 }else if(record.schemaVersion==='betterpptx.private-source-review-version.v3'){
  const rows=chunkDescriptors(record,owner,expectedPayloadSha256)
  if(!Array.isArray(chunks)||chunks.length!==rows.length)fail()
  const raw=Buffer.concat(rows.map((row,index)=>{const chunk=chunks[index];if(chunk?.id!==row.chunkId)fail();return decodeChunk(row,chunk.record,owner,expectedPayloadSha256)}),record.recordsJsonBytes)
  if(digest(raw)!==expectedPayloadSha256)fail()
  recordsJson=raw.toString('utf8')
  if(Buffer.byteLength(recordsJson)!==record.recordsJsonBytes)fail()
 }else fail()
 if(digest(recordsJson)!==expectedPayloadSha256)fail()
 let raw;try{raw=JSON.parse(recordsJson)}catch{fail()}
 const records=validateMotionSourceReviewInputs(raw)
 if(records.length!==record.recordCount)fail()
 return records
}

// A durable authored-metadata catalog. These records confer no source-use,
// asset, candidate, target, preparation, billing or native qualification grant.
export function createStoredMotionSourceReviewCatalog({client,collection=DEFAULT_MOTION_SOURCE_REVIEW_COLLECTION,now=()=>new Date().toISOString()}={}) {
 if(typeof client?.collection!=='function'||typeof client?.runTransaction!=='function'||typeof collection!=='string'||!collection)fail()
 const store=client.collection(collection)
 async function checkVersion(record,owner,expectedSha,get){
  const chunks=record?.schemaVersion==='betterpptx.private-source-review-version.v3'?await Promise.all(chunkDescriptors(record,owner,expectedSha).map(async row=>({id:row.chunkId,record:data(await get(store.doc(row.chunkId)))}))):[]
  return decodeStoredMotionSourceReviewCatalogVersion(record,{resourceOwner:owner,expectedPayloadSha256:expectedSha,chunks})
 }
 return Object.freeze({
  // Maintainer publication references an already verified immutable version.
  // No records are copied and no source owner, asset grant or private index changes.
  async publishBuiltInCatalogReference({catalogId,resourceOwner,versionId:sourceVersionId,payloadSha256}={}){
   if(resourceAuthorizationActive())throw Object.assign(new Error('Built-in catalogs publish only outside client requests.'),{code:'SOURCE_REVIEW_BOOTSTRAP_REQUIRED'})
   if(typeof catalogId!=='string'||!/^[a-z][a-z0-9-]{0,99}$/.test(catalogId)||!hashValue(payloadSha256))fail()
   const owner=ownerOf({resourceOwner});if(sourceVersionId!==versionId(owner,payloadSha256))fail()
   const publication=store.doc(builtInIndexId(catalogId)),version=store.doc(sourceVersionId)
   return client.runTransaction(async tx=>{
    const previous=data(await tx.get(publication)),saved=data(await tx.get(version))
    const records=await checkVersion(saved,owner,payloadSha256,ref=>tx.get(ref))
    const index={schemaVersion:'betterpptx.builtin-source-review-index.v1',recordKind:'builtin-source-review-catalog',catalogId,resourceOwner:owner,versionId:sourceVersionId,payloadSha256,recordCount:records.length}
    if(previous){
     if(previous.schemaVersion!==index.schemaVersion||previous.recordKind!==index.recordKind||previous.catalogId!==catalogId)fail()
     if(previous.versionId===sourceVersionId){
      for(const name of Object.keys(index))if(JSON.stringify(previous[name])!==JSON.stringify(index[name]))fail()
      return {recordCount:records.length,payloadSha256,reused:true,writes:0}
     }
    }
    tx.set(publication,{...index,updatedAt:now()})
    return {recordCount:records.length,payloadSha256,reused:false,writes:1}
   })
  },
  async loadBuiltInCatalogs(){
   if(resourceAuthorizationActive())throw Object.assign(new Error('Source catalogs load only at trusted startup.'),{code:'SOURCE_REVIEW_BOOTSTRAP_REQUIRED'})
   if(typeof store.where!=='function')fail()
   const snapshot=await store.where('recordKind','==','builtin-source-review-catalog').get()
   if(!Array.isArray(snapshot?.docs)||snapshot.docs.length>1000)fail()
   return Promise.all(snapshot.docs.map(async doc=>{
    const index=doc.data(),owner=ownerOf(index)
    if(index.schemaVersion!=='betterpptx.builtin-source-review-index.v1'||index.recordKind!=='builtin-source-review-catalog'||typeof index.catalogId!=='string'||!/^[a-z][a-z0-9-]{0,99}$/.test(index.catalogId)||doc.id!==builtInIndexId(index.catalogId)||!hashValue(index.payloadSha256)||index.versionId!==versionId(owner,index.payloadSha256))fail()
    const records=await checkVersion(data(await store.doc(index.versionId).get()),owner,index.payloadSha256,ref=>ref.get())
    if(records.length!==index.recordCount)fail()
    return {resourceOwner:owner,records,catalogScope:'built-in'}
   }))
  },
  async publishForCurrentOwner(input){
   if(!resourceAuthorizationActive())fail()
   const owner=ownerOf({resourceOwner:currentResourceOwner()}),records=validateMotionSourceReviewInputs(input).sort((a,b)=>a.sourceSha256.localeCompare(b.sourceSha256))
   const recordsJson=JSON.stringify(records),payloadSha256=digest(recordsJson)
   const recordsJsonBytes=Buffer.byteLength(recordsJson)
   if(recordsJsonBytes>aggregateLimit)fail()
   const raw=Buffer.from(recordsJson),packed=recordsJsonBytes<=decodedLimit&&recordsJsonBytes>storedLimit?gzipSync(raw).toString('base64'):null
   const chunkRecords=[]
   let encoded
   if(recordsJsonBytes<=storedLimit)encoded={schemaVersion:'betterpptx.private-source-review-version.v1',recordsJson}
   else if(packed&&Buffer.byteLength(packed)<=storedLimit)encoded={schemaVersion:'betterpptx.private-source-review-version.v2',payloadEncoding:'gzip-base64',recordsJsonBytes,recordsGzipBase64:packed}
   else{
    const chunks=[]
    for(let offset=0;offset<raw.length;offset+=chunkBytes){
     const index=chunks.length,bytes=raw.subarray(offset,offset+chunkBytes),contentSha256=digest(bytes),id=chunkId(owner,payloadSha256,index,contentSha256),contentGzipBase64=gzipSync(bytes).toString('base64')
     if(Buffer.byteLength(contentGzipBase64)>storedLimit)fail()
     chunks.push({chunkId:id,index,contentSha256,decodedBytes:bytes.length})
     chunkRecords.push({id,record:{schemaVersion:'betterpptx.private-source-review-chunk.v1',recordKind:'source-review-catalog-chunk',resourceOwner:owner,payloadSha256,index,contentSha256,decodedBytes:bytes.length,payloadEncoding:'gzip-base64',contentGzipBase64}})
    }
    if(chunks.length>maxChunks)fail()
    encoded={schemaVersion:'betterpptx.private-source-review-version.v3',payloadEncoding:'chunked-gzip-base64',recordsJsonBytes,chunks}
    if(Buffer.byteLength(JSON.stringify(chunkRecords))+Buffer.byteLength(JSON.stringify(encoded))>transactionBytesLimit)fail()
   }
   const id=versionId(owner,payloadSha256),index=store.doc(indexId(owner)),version=store.doc(id)
   return client.runTransaction(async tx=>{
    const previous=data(await tx.get(index)),retained=data(await tx.get(version))
    if(previous&&(previous.schemaVersion!=='betterpptx.private-source-review-index.v1'||previous.recordKind!=='active-source-review-catalog'||JSON.stringify(ownerOf(previous))!==JSON.stringify(owner)||!/^[a-f0-9]{64}$/.test(previous.payloadSha256)||previous.versionId!==versionId(owner,previous.payloadSha256)||!Number.isSafeInteger(previous.recordCount)||previous.recordCount<0||previous.recordCount>SOURCE_REVIEW_CATALOG_RECORD_LIMIT))fail()
    if(retained)await checkVersion(retained,owner,payloadSha256,ref=>tx.get(ref))
    if(previous?.versionId===id){if(!retained||previous.recordCount!==records.length)fail();return{recordCount:records.length,payloadSha256,reused:true,writes:0}}
    const missing=[]
    if(!retained)for(const chunk of chunkRecords){const ref=store.doc(chunk.id),saved=data(await tx.get(ref));if(saved)decodeChunk(encoded.chunks[chunk.record.index],saved,owner,payloadSha256);else missing.push({ref,record:chunk.record})}
    const timestamp=now()
    for(const chunk of missing)tx.set(chunk.ref,{...chunk.record,createdAt:timestamp})
    if(!retained)tx.set(version,{...encoded,recordKind:'source-review-catalog-version',resourceOwner:owner,payloadSha256,recordCount:records.length,createdAt:timestamp})
    tx.set(index,{schemaVersion:'betterpptx.private-source-review-index.v1',recordKind:'active-source-review-catalog',resourceOwner:owner,versionId:id,payloadSha256,recordCount:records.length,updatedAt:timestamp})
    return{recordCount:records.length,payloadSha256,reused:false,writes:retained?1:2+missing.length}
   })
  },
  async loadActiveCatalogs(){
   if(resourceAuthorizationActive())throw Object.assign(new Error('Source catalogs load only at trusted startup.'),{code:'SOURCE_REVIEW_BOOTSTRAP_REQUIRED'})
   if(typeof store.where!=='function')fail()
   const snapshot=await store.where('recordKind','==','active-source-review-catalog').get()
   if(!Array.isArray(snapshot?.docs)||snapshot.docs.length>1000)fail()
   return Promise.all(snapshot.docs.map(async doc=>{
    const index=doc.data(),owner=ownerOf(index)
    if(index.schemaVersion!=='betterpptx.private-source-review-index.v1'||index.recordKind!=='active-source-review-catalog'||doc.id!==indexId(owner)||!/^[a-f0-9]{64}$/.test(index.payloadSha256)||index.versionId!==versionId(owner,index.payloadSha256))fail()
    const records=await checkVersion(data(await store.doc(index.versionId).get()),owner,index.payloadSha256,ref=>ref.get())
    if(records.length!==index.recordCount)fail()
    return{resourceOwner:owner,records}
   }))
  },
 })
}
