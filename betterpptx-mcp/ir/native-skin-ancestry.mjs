// Native skin palettes require included ancestors across each internal bone path.
// External armature wrappers and independent palette roots remain supported.
const fail=()=>{throw Object.assign(new Error('The native skin contains an unsupported intermediate joint frame.'),{code:'NATIVE_SKIN_ANCESTRY_UNSUPPORTED'})}
export function assertNativeSkinAncestry({nodes,jointIndices,rootIndex}={}){
 if(!Array.isArray(nodes)||!Array.isArray(jointIndices)||!jointIndices.length||jointIndices.some(i=>!Number.isInteger(i)||i<0||i>=nodes.length)||new Set(jointIndices).size!==jointIndices.length)fail()
 const palette=new Set(jointIndices),parents=new Map()
 if(rootIndex!==undefined&&!palette.has(rootIndex))fail()
 nodes.forEach((node,index)=>{if(!node||typeof node!=='object'||node.children!==undefined&&!Array.isArray(node.children))fail();for(const child of node.children??[]){if(!Number.isInteger(child)||child<0||child>=nodes.length||parents.has(child)||child===index)fail();parents.set(child,index)}})
 for(const joint of jointIndices){
  const seen=new Set([joint]);let current=parents.get(joint),gap=false,nearestFound=false,reachedRoot=joint===rootIndex
  while(current!==undefined){
   if(seen.has(current))fail();seen.add(current)
   if(current===rootIndex)reachedRoot=true
   if(!nearestFound){if(palette.has(current)){if(gap)fail();nearestFound=true}else gap=true}
   current=parents.get(current)
  }
  if(rootIndex!==undefined&&!reachedRoot)fail()
 }
 return{ancestorClosure:true,checkedJointCount:jointIndices.length}
}
