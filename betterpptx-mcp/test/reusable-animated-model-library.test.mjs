import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {loadReusableAnimatedModelRegistry,reusableAnimatedModelCatalogEntries,resolveReusableAnimatedModelSelection,resolveReusableAnimatedModelDefaults} from '../assets/reusable-animated-model-library.mjs'
import {buildSpecOperationPlan} from '../ir/spec-compiler.mjs'

const hand='model3d://betterpptx-emoji-motions/handshake-approved'
const specFor=model=>({schemaVersion:'betterpptx.deck-spec.v1',title:'Reusable source-bound model proof',authoringContract:{workflow:'authoring-excellence-director-v1',level:'deterministic'},contentStory:{audience:'reviewers',outcome:'reuse approved source identity',remember:'named catalogue models preserve their own expression and motion'},visualDesign:{world:'blueprint',framing:'one native model'},motionTime:{masterClock:'scene',timingSource:'registered source motion',syncPolicy:'preserve source clock'},slides:[{id:'s',title:'Reusable model',message:'Approved motion selected by named catalogue model.',layoutIntent:'title-only',content:[{kind:'model3d',name:'hero',region:'hero',model,animation:{type:'emphasis',effect:'playScene',trigger:'withPrevious'}}]}]})
test('approved handshake catalogue selection reuses exact owner-approved source and clock',()=>{
 const e=reusableAnimatedModelCatalogEntries().find(r=>r.handle===hand);assert.ok(e)
 assert.equal(e.sha256,'9704e1a8c11eba95a8bf76fa7c243673e525136f091282042e7653cf31f3ef11')
 assert.equal(createHash('sha256').update(readFileSync(e.modelAsset)).digest('hex'),e.sha256)
 assert.equal(e.reusableMotion.approval,'owner-approved');assert.equal(e.reusableMotion.retargetable,false)
 const o=resolveReusableAnimatedModelDefaults(hand,{x:1,w:5,animation:{effect:'playScene',trigger:'afterPrevious',delay:180}})
 assert.equal(o.x,1);assert.equal(o.animation.delay,180);assert.equal(o.animation.trigger,'afterPrevious')
 assert.equal(o.animation.duration,3600);assert.equal(o.scene.length,3600);assert.deepEqual(o.animation.sceneProgress,{start:0,end:1})
 assert.deepEqual(resolveReusableAnimatedModelDefaults(hand,o),o)
})
test('contrasting face identities share one asset but retain their own expression window and stopped pose',()=>{
 const faces=reusableAnimatedModelCatalogEntries().filter(r=>r.source==='betterpptx-face-motions');assert.equal(faces.length,70)
 const a=resolveReusableAnimatedModelSelection(faces[0].handle),b=resolveReusableAnimatedModelSelection(faces.at(-1).handle)
 assert.equal(a.modelAsset,b.modelAsset);assert.notDeepEqual(a.sceneProgress,b.sceneProgress)
 assert.equal(a.posterFrame.progress,a.sceneProgress.start);assert.equal(b.posterFrame.progress,b.sceneProgress.start)
 assert.equal(a.scene.length,297450);assert.equal(b.scene.length,297450);assert.equal(a.durationMs,4000)
 assert.throws(()=>resolveReusableAnimatedModelSelection(a.modelAsset),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_AMBIGUOUS'})
 assert.equal(resolveReusableAnimatedModelDefaults('model3d://unrelated/model'),null)
})
test('source-bound selection rejects replacement clocks, clips, windows and rig articulation',()=>{
 for(const options of[{scene:{animId:1}},{scene:{length:2200}},{animation:{effect:'playScene',duration:2200}},{animation:{effect:'playScene',sceneProgress:{start:.1,end:.9}}},{handArticulation:{gesture:'fist'}},{staticPose:{motionId:'other'}},{retarget:{model:'other'}}])assert.throws(()=>resolveReusableAnimatedModelDefaults(hand,options),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
})
test('registered identity rejects conflicting source aliases, inline bytes and ambiguous shared-bank references',()=>{
 const face='model3d://betterpptx-face-motions/ceramic-angry-face',otherFace='model3d://betterpptx-face-motions/ceramic-upside-down-face'
 for(const selected of[hand,face])for(const alias of['modelAsset','model3DAsset','model','glbFile']){
  assert.throws(()=>resolveReusableAnimatedModelDefaults(selected,{modelAsset:selected,[alias]:'asset://locked/rigged3d/'+'b'.repeat(64)+'.glb'}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
  assert.doesNotThrow(()=>resolveReusableAnimatedModelDefaults(selected,{modelAsset:selected,[alias]:selected}))
 }
 assert.throws(()=>resolveReusableAnimatedModelDefaults(face,{modelAsset:face,glbFile:otherFace}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'},'Different expression handles cannot be authorized by identical source bytes')
 const shared=resolveReusableAnimatedModelSelection(face).modelAsset
 assert.equal(shared,resolveReusableAnimatedModelSelection(otherFace).modelAsset)
 assert.throws(()=>resolveReusableAnimatedModelDefaults(face,{modelAsset:face,glbFile:shared}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
 assert.throws(()=>resolveReusableAnimatedModelDefaults(hand,{modelAsset:hand,glbData:'Z2xURg=='}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
})
test('every initialized face begins its registered scene invisibly before its first visible expression',()=>{
 const faces=reusableAnimatedModelCatalogEntries().filter(r=>r.source==='betterpptx-face-motions');assert.equal(faces.length,70)
 for(const face of faces){
  const o=resolveReusableAnimatedModelDefaults(face.handle),[entrance,play]=o.animation
  assert.equal(entrance.type,'entrance');assert.equal(entrance.effect,'appear');assert.equal(entrance.delay,200);assert.equal(entrance.duration,1);assert.equal(entrance.usesVisibility,true);assert.equal(entrance.order,0)
  assert.equal(play.effect,'playScene');assert.equal(play.trigger,'withPrevious');assert.equal(play.delay,0);assert.equal(play.duration,4000);assert.equal(play.order,1)
  assert.deepEqual(resolveReusableAnimatedModelDefaults(face.handle,o),o)
 }
 assert.equal(Array.isArray(resolveReusableAnimatedModelDefaults(hand).animation),false,'The handshake has no visibility initialization requirement')
})
test('initialized faces preserve compatible entrances and reject unproven delayed or click-start scene playback',()=>{
 const face='model3d://betterpptx-face-motions/ceramic-angry-face'
 const options={animation:[{type:'entrance',effect:'fade',trigger:'withPrevious',delay:350,duration:100},{type:'emphasis',effect:'playScene',trigger:'withPrevious',delay:0}]}
 const result=resolveReusableAnimatedModelDefaults(face,options)
 assert.equal(result.animation[0].effect,'fade');assert.equal(result.animation[0].delay,350);assert.equal(result.animation[0].duration,100);assert.equal(result.animation[0].usesVisibility,true)
 for(const animation of[{effect:'playScene',delay:50},{effect:'playScene',trigger:'onClick'},{effect:'playScene',trigger:'afterPrevious'},{type:'entrance',effect:'appear',delay:199},{type:'entrance',effect:'appear',delay:200,trigger:'onClick'},{type:'entrance',effect:'appear',delay:200,usesVisibility:false}])assert.throws(()=>resolveReusableAnimatedModelDefaults(face,{animation}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
 const kept=resolveReusableAnimatedModelDefaults(face,{animation:{type:'emphasis',effect:'turntable',duration:3000,trigger:'withPrevious'}})
 assert.ok(kept.animation.some(a=>a.effect==='turntable'),'An authored separate effect must remain explicit')
})
test('normal specification compiler resolves semantic catalogue models without authored private clip indexes',()=>{
 const faces=reusableAnimatedModelCatalogEntries().filter(r=>r.source==='betterpptx-face-motions')
 for(const handle of[hand,faces[0].handle,faces.at(-1).handle]){
  const plan=buildSpecOperationPlan(specFor(handle),{dryRun:true,resolveReusableAnimatedModelDefaults})
  const op=plan.operations.find(x=>x.tool==='betterpptx.slide.add_model3d'),expected=resolveReusableAnimatedModelDefaults(handle)
  assert.equal(op.args.options.modelAsset,handle)
  assert.deepEqual(op.args.options.scene,expected.scene);assert.deepEqual(op.args.options.posterFrame,expected.posterFrame)
  assert.deepEqual(op.args.options.animation,expected.animation)
 }
})
test('catalogue model selection alone uses intrinsic motion instead of the theme turntable',()=>{
 const faces=reusableAnimatedModelCatalogEntries().filter(r=>r.source==='betterpptx-face-motions')
 for(const handle of[hand,faces[0].handle,faces.at(-1).handle]){
  const spec=specFor(handle);delete spec.slides[0].content[0].animation
  const plan=buildSpecOperationPlan(spec,{dryRun:true,resolveReusableAnimatedModelDefaults}),op=plan.operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
  assert.deepEqual(op.args.options.animation,resolveReusableAnimatedModelDefaults(handle).animation)
  assert.ok(!(Array.isArray(op.args.options.animation)?op.args.options.animation:[op.args.options.animation]).some(a=>a.effect==='turntable'))
 }
})
test('asset aliases and late semantic selection replace only implicit world dynamics with registered motion',()=>{
 const face='model3d://betterpptx-face-motions/ceramic-upside-down-face'
 for(const handle of[hand,face])for(const lane of['assetRef','query']){
  const spec=specFor(handle),block=spec.slides[0].content[0];delete block.animation;delete block.model
  if(lane==='assetRef'){spec.assets=[{name:'selected-motion',kind:'model3d',handle}];block.assetRef='selected-motion'}else block.query='approved reusable motion'
  const options={dryRun:true,resolveReusableAnimatedModelDefaults,resolveModel3d:()=>({handle,title:'Reusable motion',source:'registered'})}
  let op=buildSpecOperationPlan(spec,options).operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
  assert.equal(op.args.options.modelAsset,handle)
  assert.deepEqual(op.args.options.animation,resolveReusableAnimatedModelDefaults(handle).animation,`${lane} must preserve registered identity and initialization`)
  block.animation={type:'emphasis',effect:'turntable',duration:900,trigger:'withPrevious'}
  op=buildSpecOperationPlan(spec,options).operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
  assert.deepEqual(op.args.options.animation.find(a=>a.effect==='turntable'),block.animation,`${lane} must preserve authored effects`)
 }
 const spec=specFor('model3d://unrelated/ordinary');delete spec.slides[0].content[0].animation
 const ordinary=buildSpecOperationPlan(spec,{dryRun:true,resolveReusableAnimatedModelDefaults}).operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
 // World motion never becomes automatic model playback; only registered motion is intrinsic.
 assert.equal(ordinary.args.options.animation,undefined,'Unregistered ordinary models gain no implicit playback')
})
test('explicit authored model effects survive catalogue default selection',()=>{
 const spec=specFor(hand);spec.slides[0].content[0].animation={type:'emphasis',effect:'turntable',duration:900,trigger:'withPrevious'}
 const op=buildSpecOperationPlan(spec,{dryRun:true,resolveReusableAnimatedModelDefaults}).operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
 const animations=op.args.options.animation
 assert.ok(Array.isArray(animations));assert.deepEqual(animations.find(a=>a.effect==='turntable'),spec.slides[0].content[0].animation)
 assert.equal(animations.filter(a=>a.effect==='playScene').length,1)
})
test('explicit stopped playback is rejected for registered motion instead of silently becoming autoplay',()=>{
 for(const handle of[hand,'model3d://betterpptx-face-motions/ceramic-angry-face']){
  const spec=specFor(handle);spec.slides[0].content[0].animation=false
  assert.throws(()=>buildSpecOperationPlan(spec,{dryRun:true,resolveReusableAnimatedModelDefaults}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
 }
 const ordinary=specFor('model3d://unrelated/ordinary');ordinary.slides[0].content[0].animation=false
 const op=buildSpecOperationPlan(ordinary,{dryRun:true,resolveReusableAnimatedModelDefaults}).operations.find(x=>x.tool==='betterpptx.slide.add_model3d')
 assert.equal(op.args.options.animation,undefined,'Ordinary unregistered stopped models remain stopped')
})
test('trusted publication rejects changed asset pins and out-of-range clip windows without changing originals',()=>{
 const dir=mkdtempSync(fileURLToPath(new URL('../assets/reusable-model-test-',import.meta.url)))
 try{
  const originalFile=fileURLToPath(new URL('../assets/approved-hand-motions/catalog.json',import.meta.url)),catalog=JSON.parse(readFileSync(originalFile))
  catalog.entries=[catalog.entries.find(entry=>entry.id==='handshake-approved')]
  catalog.entries[0].glbFile=path.relative(dir,path.join(path.dirname(originalFile),catalog.entries[0].glbFile))
  const file=path.join(dir,'catalog.json'),check=()=>loadReusableAnimatedModelRegistry([pathToFileURL(file)])
  writeFileSync(file,JSON.stringify(catalog));assert.equal(check().rows.length,1)
  catalog.entries[0].sourceSha256='0'.repeat(64);writeFileSync(file,JSON.stringify(catalog));assert.throws(check,{code:'REUSABLE_ANIMATED_MODEL_UNAVAILABLE'})
  catalog.entries[0].sourceSha256='9704e1a8c11eba95a8bf76fa7c243673e525136f091282042e7653cf31f3ef11';catalog.entries[0].clip.sourceWindow={start:.5,end:1.1};writeFileSync(file,JSON.stringify(catalog));assert.throws(check,{code:'REUSABLE_ANIMATED_MODEL_UNAVAILABLE'})
 }finally{rmSync(dir,{recursive:true,force:true})}
})

