import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
const fail=()=>{throw Object.assign(new Error('The built-in prepared catalog is unavailable.'),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})}
export function encodeBuiltInPreparedPublication(publication){
 if(publication?.schemaVersion!=='betterpptx.builtin-prepared-motion-catalog.v1'||!Array.isArray(publication.entries)||publication.entries.length>520)fail()
 const raw=Buffer.from(JSON.stringify(canonical(publication)))
 if(raw.length>4*1024*1024)fail()
 return {schemaVersion:'betterpptx.builtin-prepared-motion-storage.v1',catalogId:publication.catalogId,catalogPayloadSha256:publication.catalogPayloadSha256,payloadEncoding:'gzip-base64',decodedBytes:raw.length,payloadSha256:sha(raw),payloadGzipBase64:gzipSync(raw).toString('base64')}
}
export function decodeBuiltInPreparedPublication(record){
 if(record?.schemaVersion==='betterpptx.builtin-prepared-motion-catalog.v1')return structuredClone(record)
 if(record?.schemaVersion!=='betterpptx.builtin-prepared-motion-storage.v1'||record.payloadEncoding!=='gzip-base64'||!Number.isSafeInteger(record.decodedBytes)||record.decodedBytes<1||record.decodedBytes>4*1024*1024||typeof record.payloadGzipBase64!=='string'||record.payloadGzipBase64.length>1200000||!/^[a-f0-9]{64}$/.test(record.payloadSha256??''))fail()
 let raw,publication
 try{
  const packed=Buffer.from(record.payloadGzipBase64,'base64');if(packed.toString('base64')!==record.payloadGzipBase64)fail()
  raw=gunzipSync(packed,{maxOutputLength:record.decodedBytes})
  if(raw.length!==record.decodedBytes||sha(raw)!==record.payloadSha256||!Buffer.from(raw.toString('utf8'),'utf8').equals(raw))fail()
  publication=JSON.parse(raw)
 }catch{fail()}
 if(publication.schemaVersion!=='betterpptx.builtin-prepared-motion-catalog.v1'||publication.catalogId!==record.catalogId||publication.catalogPayloadSha256!==record.catalogPayloadSha256||!Array.isArray(publication.entries)||publication.entries.length>520)fail()
 return publication
}
