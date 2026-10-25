import {createHash} from 'node:crypto'
import {readFileSync,statSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseGlb} from '../ir/kinetic-transplant.mjs'
import {partitionNativeSkinPalettes} from '../ir/native-skin-palette.mjs'
import {liftNativeAnimatedSkinAncestors} from '../ir/native-animated-skin-ancestor.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url))
const catalogs=['approved-hand-motions','approved-face-motions'].map(name=>new URL(`./${name}/catalog.json`,import.meta.url))
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const fail=()=>{throw Object.assign(new Error('The reusable animated model is unavailable.'),{code:'REUSABLE_ANIMATED_MODEL_UNAVAILABLE'})}
const closed=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).every(k=>keys.includes(k))
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n
const id=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,95}$/.test(v)
const parsedSources=new Map()
const nativeTransports=new Map()
let defaultRegistryCache
const stamp=file=>{const s=statSync(file,{bigint:true});return[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':')}
function validatePreferredView(v){
 if(!closed(v,['camera','trans','viewportPerInch'])||!Object.keys(v).length)fail()
 const scalar=(n,min,max,integer=false)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))fail()}
 const vector=(o,keys,min,max,integer=false)=>{if(!closed(o,keys)||!Object.keys(o).length)fail();for(const n of Object.values(o))scalar(n,min,max,integer)}
 if(v.camera!==undefined){if(!closed(v.camera,['pos','fov']))fail();if(v.camera.pos!==undefined)vector(v.camera.pos,['x','y','z'],-2147483648,2147483647,true);if(v.camera.fov!==undefined)scalar(v.camera.fov,.01,21600000)}
 if(v.trans!==undefined){const t=v.trans;if(!closed(t,['meterPerModelUnit','preTrans','scale','rot','postTrans']))fail();if(t.meterPerModelUnit!==undefined)vector(t.meterPerModelUnit,['n','d'],1,2147483647,true);for(const k of ['preTrans','postTrans'])if(t[k]!==undefined)vector(t[k],['dx','dy','dz'],-2147483648,2147483647,true);if(t.scale!==undefined)vector(t.scale,['x','y','z','sx','sy','sz'],0,100000000);if(t.rot!==undefined)vector(t.rot,['x','y','z','ax','ay','az'],-21600000,21600000)}
 if(v.viewportPerInch!==undefined)scalar(v.viewportPerInch,1,2147483647)
}
const mergeViewComponent=(base,override)=>{
 if(override==null)return structuredClone(base)
 if(!base||typeof override!=='object'||Array.isArray(override))return structuredClone(override)
 const merged=structuredClone(base)
 for(const[k,v]of Object.entries(override))merged[k]=v===null?structuredClone(base[k]):v&&typeof v==='object'&&!Array.isArray(v)?mergeViewComponent(base[k],v):structuredClone(v)
 return merged
}
/** Trusted source-relative view, independent of slide geometry or motion identity. */
export function applyReusableAnimatedModelPreferredView(preferredView,options={}){
 if(!preferredView||options.model3dViewPresetId||options.motionFraming)return options
 validatePreferredView(preferredView)
 const view={}
 for(const k of ['camera','trans'])if(preferredView[k]!==undefined)view[k]=mergeViewComponent(preferredView[k],options[k])
 if(preferredView.viewportPerInch!==undefined&&Number.isFinite(options.h)&&options.h>0){const viewport=Math.round(preferredView.viewportPerInch*options.h);if(viewport<1||viewport>2147483647)fail();view.objViewport=options.objViewport??viewport}
 return{...options,...view}
}
function clipDuration(parsed,index){
 const a=parsed.json.animations?.[index];if(!a?.channels?.length||!a.samplers?.length)fail()
 let maximum=0
 for(const s of a.samplers){const x=parsed.json.accessors?.[s.input],v=parsed.json.bufferViews?.[x?.bufferView];if(!x||x.componentType!==5126||x.type!=='SCALAR'||x.sparse||x.normalized||!v||v.buffer!==0||!Number.isSafeInteger(x.count)||x.count<1)fail();const stride=v.byteStride??4,offset=(v.byteOffset??0)+(x.byteOffset??0);let previous=-1;for(let k=0;k<x.count;k++){const time=parsed.bin.readFloatLE(offset+k*stride);if(!Number.isFinite(time)||time<0||time<previous)fail();previous=time;maximum=Math.max(maximum,time)}}
 if(maximum<=0)fail();return maximum*1000
}

/** Trusted, source-bound catalogue data. No source path, clip index, or rig
 * identity is accepted from the public authoring request. */
export function loadReusableAnimatedModelRegistry(catalogFiles=catalogs){
 try{
  // Catalogue and source stamps are checked before every cache hit. New bytes
  // are hashed and parsed once when any pinned input changes.
  const signature=()=>catalogFiles.flatMap(url=>{const file=fileURLToPath(url),c=JSON.parse(readFileSync(file));return[stamp(file),...new Set((c.entries??[]).map(r=>path.resolve(path.dirname(file),r.glbFile)))].map((f,i)=>i===0?f:stamp(f))}).join('|')
  const cacheKey=catalogFiles===catalogs?signature():null
  if(cacheKey&&defaultRegistryCache?.key===cacheKey)return structuredClone(defaultRegistryCache.value)
  const rows=[],handles=new Set(),sources=new Map(),fingerprint=createHash('sha256')
  for(const catalogFile of catalogFiles){
   const file=fileURLToPath(catalogFile),bytes=readFileSync(file);if(bytes.length>1024*1024)fail();fingerprint.update(bytes)
   const catalog=JSON.parse(bytes);if(!closed(catalog,['schemaVersion','source','sourceLabel','entries'])||catalog.schemaVersion!=='betterpptx.reusable-animated-model-library.v1'||!id(catalog.source)||!text(catalog.sourceLabel,160)||!Array.isArray(catalog.entries)||catalog.entries.length>160)fail()
   for(const row of catalog.entries){
    if(!closed(row,['id','title','description','tags','glbFile','sourceSha256','bytes','clip','posterFrame','initialization','preferredView','approval','nativeQualification','license'])||!id(row.id)||!text(row.title,160)||!text(row.description,1000)||!text(row.glbFile,4096)||!text(row.license,512)||!Array.isArray(row.tags)||row.tags.length>32||row.tags.some(t=>!text(t,64))||!(/^[a-f0-9]{64}$/).test(row.sourceSha256)||!Number.isSafeInteger(row.bytes)||row.bytes<20||row.bytes>32*1024*1024)fail()
    const sourcePath=path.resolve(path.dirname(file),row.glbFile),relative=path.relative(root,sourcePath);if(relative.startsWith('..')||path.isAbsolute(relative))fail()
    let source=sources.get(sourcePath);if(!source){const b=readFileSync(sourcePath),digest=sha(b);let parsed=parsedSources.get(digest);if(!parsed){parsed=parseGlb(b);parsedSources.set(digest,parsed);while(parsedSources.size>4)parsedSources.delete(parsedSources.keys().next().value)}source={bytes:b.length,sha256:digest,parsed,durations:new Map()};sources.set(sourcePath,source);fingerprint.update(source.sha256)}
    if(source.bytes!==row.bytes||source.sha256!==row.sourceSha256)fail()
    const c=row.clip;if(!closed(c,['id','label','index','durationMs','sourceWindow','idleProgress'])||!(/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/).test(c.id)||!text(c.label,160)||!Number.isInteger(c.index)||c.index<0||!Number.isInteger(c.durationMs)||c.durationMs<100||c.durationMs>300000)fail()
    const p=c.sourceWindow??{start:0,end:1};if(!closed(p,['start','end'])||!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end>1||p.start>=p.end||c.idleProgress!==undefined&&(!Number.isFinite(c.idleProgress)||c.idleProgress<0||c.idleProgress>1))fail()
    if(!source.durations.has(c.index))source.durations.set(c.index,clipDuration(source.parsed,c.index))
    if(Math.abs(source.durations.get(c.index)*(p.end-p.start)-c.durationMs)>2)fail()
    if(!closed(row.approval,['status','approvedOn'])||!['owner-approved','previously-validated'].includes(row.approval.status)||!/^\d{4}-\d{2}-\d{2}$/.test(row.approval.approvedOn)||!closed(row.nativeQualification,['status'])||!['pending-native','qualified'].includes(row.nativeQualification.status))fail()
    if(row.posterFrame!==undefined&&(!closed(row.posterFrame,['progress'])||!Number.isFinite(row.posterFrame.progress)||row.posterFrame.progress<0||row.posterFrame.progress>1))fail()
    if(row.initialization!==undefined&&(!closed(row.initialization,['visibilityDelayMs'])||!Number.isInteger(row.initialization.visibilityDelayMs)||row.initialization.visibilityDelayMs<1||row.initialization.visibilityDelayMs>2000))fail()
    if(row.preferredView!==undefined)validatePreferredView(row.preferredView)
    const handle=`model3d://${catalog.source}/${row.id}`;if(handles.has(handle))fail();handles.add(handle)
    rows.push({row:structuredClone(row),handle,sourcePath,sourceDurationMs:source.durations.get(c.index),source:catalog.source,sourceLabel:catalog.sourceLabel})
   }
  }
  const result={rows,fingerprint:fingerprint.digest('hex')}
  if(cacheKey)defaultRegistryCache={key:cacheKey,value:structuredClone(result)}
  return result
 }catch{fail()}
}
export function reusableAnimatedModelLibraryFingerprint(){return loadReusableAnimatedModelRegistry().fingerprint}
export function reusableAnimatedModelCatalogEntries(){return loadReusableAnimatedModelRegistry().rows.map(({row:r,handle,sourcePath,source,sourceLabel})=>({kind:'model3d',role:'Source-bound animated emoji',source,sourceKey:source,sourceLabel,sourcePriority:140,handle,title:r.title,name:r.title,tags:['emoji','animated','reusable',...r.tags],usage:'Use this maintained animated model in the normal deck specification. Its named motion preserves the approved source identity and timing.',license:r.license,officeUseOnly:false,path:sourcePath,modelAsset:sourcePath,addModel3DOptions:{modelAsset:handle,nativeOnly:true},sha256:r.sourceSha256,bytes:r.bytes,animated:true,reusableMotion:{id:r.clip.id,label:r.clip.label,durationMs:r.clip.durationMs,sourceBound:true,retargetable:false,approval:r.approval.status,nativeQualification:r.nativeQualification.status}}))}
/** Engine-only selection defaults, resolved from the same verified registry. */
export function resolveReusableAnimatedModelSelection(handle){
 const {rows}=loadReusableAnimatedModelRegistry();let found=rows.find(r=>r.handle===handle)
 if(!found){const paths=rows.filter(r=>r.sourcePath===handle);if(paths.length>1)throw Object.assign(new Error('Select a named reusable motion rather than a shared source model.'),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_AMBIGUOUS'});found=paths[0]}if(!found)return null
 const {row:r}=found,c=r.clip
 const scene={animId:c.index,length:Math.round(found.sourceDurationMs),loop:false},sceneProgress=structuredClone(c.sourceWindow??{start:0,end:1}),posterFrame={animId:c.index,progress:r.posterFrame?.progress??c.idleProgress??c.sourceWindow?.start??0}
 return{...(r.preferredView?{preferredView:structuredClone(r.preferredView)}:{}),modelAsset:found.sourcePath,handle:found.handle,sourceSha256:r.sourceSha256,motionId:c.id,durationMs:c.durationMs,scene,sceneProgress,posterFrame,...(r.initialization?{initialization:structuredClone(r.initialization)}:{}),defaultScene:scene,defaultPosterFrame:posterFrame,defaultPlayScene:{effect:'playScene',animId:c.index,duration:c.durationMs,loop:false,sceneProgress},sourceBound:true}
}
/** Merge source-bound defaults without changing the authored layout or cue.
 * A caller may not silently substitute a different source clip or expression. */
export function resolveReusableAnimatedModelDefaults(handle,options={}){
 const selected=resolveReusableAnimatedModelSelection(handle);if(!selected)return null
 const conflict=()=>{throw Object.assign(new Error('The selected reusable motion requires its registered source, expression and timing.'),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})}
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
 if(!options||typeof options!=='object'||Array.isArray(options))conflict()
 // Several authoring lanes accept source aliases. Resolve every supplied
 // reference to the same semantic entry, not merely the same shared bank.
 // Inline replacement bytes have no catalogue identity and cannot override it.
 for(const field of ['modelAsset','model3DAsset','model','glbFile'])if(options[field]!=null){
  if(typeof options[field]!=='string'||!options[field].trim())conflict()
  let alias;try{alias=resolveReusableAnimatedModelSelection(options[field])}catch{conflict()}
  if(!alias||alias.handle!==selected.handle)conflict()
 }
 if(options.glbData!=null)conflict()
 for(const field of ['handArticulation','staticPose','motionProgram','retarget','skeletalMirror'])if(options[field]!=null)conflict()
 if(options.scene!=null){if(!closed(options.scene,['animId','length','loop']))conflict();for(const[k,v]of Object.entries(options.scene))if(v!==selected.scene[k])conflict()}
 if(options.posterFrame!=null&&!equal(options.posterFrame,selected.posterFrame))conflict()
 const bind=animation=>{
  if(!animation||typeof animation!=='object'||Array.isArray(animation))conflict()
  if(animation.effect!=='playScene')return structuredClone(animation)
  for(const[k,v]of Object.entries({animId:selected.scene.animId,duration:selected.durationMs,loop:false}))if(animation[k]!==undefined&&animation[k]!==v)conflict()
  if(animation.sceneProgress!==undefined&&!equal(animation.sceneProgress,selected.sceneProgress))conflict()
  if(selected.initialization&&((animation.delay??0)!==0||(animation.trigger??'withPrevious')!=='withPrevious'||animation.type!==undefined&&animation.type!=='emphasis'))conflict()
  return{...animation,...selected.defaultPlayScene}
 }
 const authored=options.animation??options.animations,base={type:'emphasis',trigger:'withPrevious',...selected.defaultPlayScene}
 let animation
 if(authored==null)animation=base
 else{const sequence=(Array.isArray(authored)?authored:[authored]).map(bind);if(!sequence.some(a=>a.effect==='playScene'))sequence.push(base);animation=Array.isArray(authored)||sequence.length>1?sequence:sequence[0]}
 if(selected.initialization){
  const sequence=Array.isArray(animation)?animation:[animation],plays=sequence.filter(a=>a.effect==='playScene'),entrances=sequence.filter(a=>a.type==='entrance')
  if(plays.length!==1)conflict()
  for(const entrance of entrances)if((entrance.delay??0)<selected.initialization.visibilityDelayMs||(entrance.trigger??'withPrevious')!=='withPrevious'||entrance.usesVisibility===false)conflict()
  const gate=entrances.length?entrances.map(a=>({...a,trigger:'withPrevious',usesVisibility:true})):[{type:'entrance',effect:'appear',trigger:'withPrevious',delay:selected.initialization.visibilityDelayMs,duration:1,usesVisibility:true,order:0}]
  // Match the native-proven ordering: visibility initialization first in the
  // timing tree, scene playback concurrently at zero; reveal only afterward.
  const play={...plays[0],trigger:'withPrevious',delay:0,...(plays[0].order===undefined?{order:1}:{})}
  animation=[...gate,play,...sequence.filter(a=>a.effect!=='playScene'&&a.type!=='entrance')]
 }
 const merged={...applyReusableAnimatedModelPreferredView(selected.preferredView,options),scene:structuredClone(selected.scene),posterFrame:structuredClone(selected.posterFrame),animation};delete merged.animations
 return merged
}
/** Lossless delivery preparation for the registered source only. Proven small
 * native palettes remain byte-identical; canonical source assets are immutable. */
export function getReusableAnimatedModelNativeTransport(handle){
 const selected=resolveReusableAnimatedModelSelection(handle);if(!selected)return null
 const source=readFileSync(selected.modelAsset);if(sha(source)!==selected.sourceSha256)fail()
 let result=nativeTransports.get(selected.sourceSha256)
 if(!result){
  const parsed=parseGlb(source),maximum=Math.max(0,...(parsed.json.skins??[]).map(s=>s.joints.length)),lifted=maximum>128?liftNativeAnimatedSkinAncestors({glbBytes:source}):null,prepared=maximum>128?partitionNativeSkinPalettes({glbBytes:lifted.glbBytes}):{glbBytes:source,report:{partitioned:false,maxJointsPerSkin:128,inputSkinCount:parsed.json.skins?.length??0,outputSkinCount:parsed.json.skins?.length??0,bytes:source.length}}
  const after=parseGlb(prepared.glbBytes);if(after.json.skins?.some(s=>s.joints.length>128))fail()
  result={glbBytes:Buffer.from(prepared.glbBytes),sourceSha256:selected.sourceSha256,transportSha256:sha(prepared.glbBytes),report:{...prepared.report,...(lifted?{ancestorNormalization:lifted.report}:{}),sourceBytes:source.length,sourceBytesUnchanged:true,preparation:'lossless-native-skin-palette-partition',qualification:'pending-native-playback'}}
  nativeTransports.set(selected.sourceSha256,result);while(nativeTransports.size>4)nativeTransports.delete(nativeTransports.keys().next().value)
 }
 // Callers must not be able to corrupt the cached canonical delivery buffer.
 return{...result,glbBytes:Buffer.from(result.glbBytes),report:structuredClone(result.report)}
}
