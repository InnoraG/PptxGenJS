import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeBuiltInPreparedPublication,decodeBuiltInPreparedPublication} from '../storage/builtin-prepared-publication-codec.mjs'
test('prepared product index stores compactly and preserves all520 source tuples',()=>{
 const publication={schemaVersion:'betterpptx.builtin-prepared-motion-catalog.v1',catalogId:'presenter-motion',catalogPayloadSha256:'a'.repeat(64),entries:Array.from({length:520},(_,n)=>({reviewId:String(n),metadata:'prepared-descriptor '.repeat(80)}))}
 const stored=encodeBuiltInPreparedPublication(publication)
 assert.ok(Buffer.byteLength(JSON.stringify(stored))<Buffer.byteLength(JSON.stringify(publication))/10)
 assert.deepEqual(decodeBuiltInPreparedPublication(stored),publication)
 assert.throws(()=>decodeBuiltInPreparedPublication({...stored,payloadSha256:'b'.repeat(64)}),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
 assert.throws(()=>decodeBuiltInPreparedPublication({...stored,decodedBytes:stored.decodedBytes-1}),{code:'BUILTIN_PREPARED_MOTION_UNAVAILABLE'})
})
