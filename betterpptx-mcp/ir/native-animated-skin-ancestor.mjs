// Exact delivery normalization: give an animated instance ancestor the real
// positive skin influence of a static descendant, preserving world-space LBS.
import {Matrix4,Quaternion,Vector3} from 'three'
import {parseGlb,serializeGlb} from './kinetic-transplant.mjs'
import {assertNativeSkinAncestry} from './native-skin-ancestry.mjs'
const fail=()=>{throw Object.assign(new Error('The animated skin ancestor cannot be normalized without changing its motion.'),{code:'NATIVE_ANIMATED_SKIN_ANCESTOR_UNSUPPORTED'})}
export function liftNativeAnimatedSkinAncestors({glbBytes}){
 const source=Buffer.from(glbBytes),parsed=parseGlb(source),json=structuredClone(parsed.json),parents=new Map(),animated=new Set((json.animations??[]).flatMap(a=>a.channels.map(c=>c.target.node))),worlds=new Map(),rows=[]
 json.nodes.forEach((n,i)=>{for(const child of n.children??[]){if(parents.has(child))fail();parents.set(child,i)}})
 const chain=i=>{const out=[],seen=new Set();for(let n=i;n!==undefined;n=parents.get(n)){if(seen.has(n))fail();seen.add(n);out.push(n)}return out}
 const world=i=>{if(worlds.has(i))return worlds.get(i).clone();const n=json.nodes[i];if(!n)fail();const m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));if(parents.has(i))m.premultiply(world(parents.get(i)));if(!m.elements.every(Number.isFinite)||Math.abs(m.determinant())<1e-15)fail();worlds.set(i,m);return m.clone()}
 let bin=Buffer.from(parsed.bin)
 for(const [skinIndex,skin]of (json.skins??[]).entries()){
  const roots=skin.joints.filter(n=>skin.joints.every(m=>chain(m).includes(n)));if(roots.length!==1)fail()
  const root=roots[0],ancestors=chain(root),external=ancestors.slice(1).filter(n=>animated.has(n)&&!skin.joints.includes(n));if(!external.length)continue
  const ancestor=external.at(-1),path=ancestors.slice(0,ancestors.indexOf(ancestor));if(path.some(n=>animated.has(n)))fail()
  const a=json.accessors[skin.inverseBindMatrices],v=json.bufferViews[a?.bufferView];if(!a||a.type!=='MAT4'||a.componentType!==5126||a.sparse||a.count!==skin.joints.length||!v||v.buffer!==0)fail()
  const old=Buffer.alloc(a.count*64);for(let i=0;i<a.count;i++)for(let k=0;k<16;k++)old.writeFloatLE(bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??64)+k*4),i*64+k*4)
  const slot=skin.joints.indexOf(root),C=world(ancestor).invert().multiply(world(root)),IBM=new Matrix4().fromArray(Array.from({length:16},(_,k)=>old.readFloatLE(slot*64+k*4))),lifted=C.clone().multiply(IBM)
  lifted.elements.forEach((x,k)=>old.writeFloatLE(x,slot*64+k*4));skin.joints[slot]=ancestor
  const added=[];for(const n of path)if(!skin.joints.includes(n)){skin.joints.push(n);added.push(n)}
  const extra=Buffer.alloc(added.length*64);added.forEach((n,i)=>world(n).invert().elements.forEach((x,k)=>extra.writeFloatLE(x,i*64+k*4)))
  const bytes=Buffer.concat([old,extra]),padding=(4-bin.length%4)%4,offset=bin.length+padding;bin=Buffer.concat([bin,Buffer.alloc(padding),bytes]);json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});json.accessors.push({...a,bufferView:json.bufferViews.length-1,byteOffset:0,count:skin.joints.length});skin.inverseBindMatrices=json.accessors.length-1;skin.skeleton=ancestor
  assertNativeSkinAncestry({nodes:json.nodes,jointIndices:skin.joints,rootIndex:ancestor})
  rows.push({skinIndex,originalWeightedRoot:root,animatedWeightedRoot:ancestor,reusedPositiveInfluenceSlot:slot,staticPath:path,addedUnusedAncestorJoints:added.length})
 }
 if(!rows.length)return{glbBytes:source,report:{normalized:false,liftedSkins:[]}}
 json.buffers[0].byteLength=bin.length
 return{glbBytes:serializeGlb(json,bin),report:{normalized:true,liftedSkins:rows,geometryAndWeightsUnchanged:true,animationTracksUnchanged:true,method:'J_ancestor(t) × C × originalInverseBind; all static ancestor joints retained'}}
}
