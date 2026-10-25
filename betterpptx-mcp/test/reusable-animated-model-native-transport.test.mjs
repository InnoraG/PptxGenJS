import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseGlb} from '../ir/kinetic-transplant.mjs'
import {createSceneEvaluator} from '../tools/audit-paired-hand-surface-contact.mjs'
import {getReusableAnimatedModelNativeTransport,resolveReusableAnimatedModelSelection} from '../assets/reusable-animated-model-library.mjs'

const hand='model3d://betterpptx-emoji-motions/handshake-approved',sha=b=>createHash('sha256').update(b).digest('hex')
function readAccessor(p,index){
 const a=p.json.accessors[index],v=p.json.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],spec={5121:[1,'readUInt8'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']}[a.componentType]
 assert.ok(spec&&size);assert.equal(a.sparse,undefined)
 return Array.from({length:a.count},(_,i)=>Array.from({length:size},(_,k)=>p.bin[spec[1]]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*spec[0])+k*spec[0])))
}
function animationSignature(p){return p.json.animations.map(a=>({name:a.name,channels:a.channels.map(c=>{const s=a.samplers[c.sampler];return{target:c.target,interpolation:s.interpolation,input:readAccessor(p,s.input),output:readAccessor(p,s.output)}})}))}
function sourceTriangleSignatures(p,jointAliases=new Map()){
 const signatures=[]
 for(const node of p.json.nodes.filter(n=>n.mesh!==undefined)){
  const skin=p.json.skins[node.skin],ib=readAccessor(p,skin.inverseBindMatrices)
  for(const primitive of p.json.meshes[node.mesh].primitives){
   const attributes=Object.fromEntries(Object.entries(primitive.attributes).map(([k,v])=>[k,readAccessor(p,v)])),indices=readAccessor(p,primitive.indices).flat()
   const rows=attributes.POSITION.map((_,i)=>{const attrs=Object.fromEntries(Object.keys(attributes).sort().filter(k=>k!=='JOINTS_0').map(k=>[k,attributes[k][i]])),weights=attributes.WEIGHTS_0[i],ids=attributes.JOINTS_0[i];return{attrs,influences:ids.flatMap((id,k)=>weights[k]>0?[{joint:jointAliases.get(skin.joints[id])??skin.joints[id],weight:weights[k]}]:[])}})
   for(let i=0;i<indices.length;i+=3)signatures.push(JSON.stringify({material:primitive.material,mode:primitive.mode??4,vertices:indices.slice(i,i+3).map(v=>rows[v])}))
  }
 }
 return signatures
}
function posedTriangles(hand){
 const out=[]
 for(let i=0;i<hand.tris.length;i+=3){const points=[];for(let k=0;k<3;k++){const v=hand.tris[i+k]*3;points.push(Array.from(hand.P.subarray(v,v+3)).map(x=>Math.round(x*1e10)))}out.push(JSON.stringify([hand.triMaterial[i/3],points]))}
 return out.sort()
}
test('native handshake transport preserves surface attributes, weights, materials and animation while lifting its weighted root',()=>{
 const selected=resolveReusableAnimatedModelSelection(hand),source=readFileSync(selected.modelAsset),before=sha(source),transport=getReusableAnimatedModelNativeTransport(hand),a=parseGlb(source),b=parseGlb(transport.glbBytes)
 assert.equal(before,selected.sourceSha256);assert.equal(transport.sourceSha256,before)
 assert.equal(transport.report.partitioned,true);assert.equal(transport.report.maxJointsPerSkin,20);assert.ok(b.json.skins.every(s=>s.joints.length<=20));assert.equal(b.json.skins.length,242)
 const images=p=>(p.json.images??[]).map(({bufferView,...image})=>{const v=p.json.bufferViews[bufferView];return{...image,sha256:sha(p.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength))}})
 assert.deepEqual(a.json.materials,b.json.materials);assert.deepEqual(images(a),images(b));assert.deepEqual(a.json.textures,b.json.textures)
 const lifts=transport.report.ancestorNormalization.liftedSkins,aliases=new Map(lifts.map(r=>[r.animatedWeightedRoot,r.originalWeightedRoot]))
 assert.equal(lifts.length,2);assert.ok(lifts.every(r=>r.addedUnusedAncestorJoints===4))
 assert.deepEqual(animationSignature(a),animationSignature(b));assert.deepEqual(sourceTriangleSignatures(a).sort(),sourceTriangleSignatures(b,aliases).sort())
 assert.equal(sha(readFileSync(selected.modelAsset)),before)
})
test('actual native transport deformed triangles match approved source at every key, midpoint and dense video sample',()=>{
 const selected=resolveReusableAnimatedModelSelection(hand),source=readFileSync(selected.modelAsset),transport=getReusableAnimatedModelNativeTransport(hand),a=createSceneEvaluator(source),b=createSceneEvaluator(transport.glbBytes)
 assert.equal(a.keyTimes.length,15);assert.deepEqual(a.keyTimes,b.keyTimes)
 const required=[...a.keyTimes,...a.keyTimes.slice(1).map((t,i)=>(t+a.keyTimes[i])/2)];assert.equal(required.length,29)
 const times=[...new Set([...required,...Array.from({length:Math.ceil(a.duration*24)+1},(_,i)=>Math.min(a.duration,i/24))])].sort((x,y)=>x-y)
 assert.ok(times.length>=88)
 const aliases=new Map(transport.report.ancestorNormalization.liftedSkins.map(r=>[r.animatedWeightedRoot,r.originalWeightedRoot])),ka=sourceTriangleSignatures(parseGlb(source)),kb=sourceTriangleSignatures(parseGlb(transport.glbBytes),aliases),byKey=new Map(ka.map((key,i)=>[key,i]))
 assert.equal(byKey.size,ka.length,'Approved triangle attributes identify every retained triangle uniquely')
 const mapping=kb.map(key=>byKey.get(key));assert.ok(mapping.every(Number.isInteger))
 let maximumError=0
 for(const t of times){const x=a.evaluate(t),y=b.evaluate(t);assert.equal(x.length,2);assert.equal(y.length,2);const flat=hands=>hands.flatMap(h=>Array.from({length:h.tris.length/3},(_,i)=>Array.from({length:3},(_,k)=>{const v=h.tris[i*3+k]*3;return Array.from(h.P.subarray(v,v+3))}))),X=flat(x),Y=flat(y);for(let i=0;i<Y.length;i++)for(let v=0;v<3;v++)for(let d=0;d<3;d++)maximumError=Math.max(maximumError,Math.abs(Y[i][v][d]-X[mapping[i]][v][d]))}
 assert.ok(maximumError<1e-7,`Source geometry mismatch: ${maximumError} hand-height units`)
})
test('already-supported face palette is byte-identical and cached buffers cannot be mutated by a caller',()=>{
 const face='model3d://betterpptx-face-motions/ceramic-angry-face',selected=resolveReusableAnimatedModelSelection(face),original=readFileSync(selected.modelAsset),result=getReusableAnimatedModelNativeTransport(face)
 assert.equal(result.report.partitioned,false);assert.equal(result.sourceSha256,result.transportSha256);assert.deepEqual(result.glbBytes,original)
 result.glbBytes[0]=0;assert.equal(getReusableAnimatedModelNativeTransport(face).glbBytes.readUInt32LE(0),original.readUInt32LE(0))
})
