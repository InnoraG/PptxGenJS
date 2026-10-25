import test from 'node:test'
import assert from 'node:assert/strict'
import {applyReusableAnimatedModelPreferredView,resolveReusableAnimatedModelDefaults,resolveReusableAnimatedModelSelection} from '../assets/reusable-animated-model-library.mjs'
import {buildSpecOperationPlan} from '../ir/spec-compiler.mjs'
import {MODEL3D_VIEW_PRESETS} from '../model3d-view-presets.mjs'
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import {loadReusableAnimatedModelRegistry} from '../assets/reusable-animated-model-library.mjs'

const views=[
 {camera:{pos:{x:0,y:0,z:360000000},fov:10},trans:{rot:{x:0,y:-15,z:0},scale:{sx:1,sy:1,sz:1}},viewportPerInch:2000000},
 {camera:{pos:{x:0,y:0,z:90000000},fov:35},trans:{rot:{x:0,y:35,z:0},scale:{sx:1.6,sy:1.6,sz:1.6}},viewportPerInch:1100000},
]
test('source-relative preferred views preserve contrasting lenses and scale with authored frame height',()=>{
 for(const view of views){
  const a=applyReusableAnimatedModelPreferredView(view,{h:4}),b=applyReusableAnimatedModelPreferredView(view,{h:2})
  assert.deepEqual(a.camera,view.camera);assert.deepEqual(a.trans,view.trans)
  assert.equal(a.objViewport,view.viewportPerInch*4);assert.equal(b.objViewport,a.objViewport/2)
  assert.deepEqual(applyReusableAnimatedModelPreferredView(view,a),a)
 }
 assert.notDeepEqual(views[0].camera,views[1].camera)
})
test('trusted catalogue accepts preferred views while rejecting untyped fields and invalid coordinates',()=>{
 const original=fileURLToPath(new URL('../assets/approved-hand-motions/catalog.json',import.meta.url)),catalog=JSON.parse(readFileSync(original))
 const dir=mkdtempSync(fileURLToPath(new URL('../assets/reusable-view-test-',import.meta.url))),file=path.join(dir,'catalog.json')
 try{
  const entry=catalog.entries.find(row=>row.id==='handshake-approved');catalog.entries=[entry]
  entry.glbFile=path.relative(dir,path.resolve(path.dirname(original),entry.glbFile))
  for(const view of views){entry.preferredView=view;writeFileSync(file,JSON.stringify(catalog));assert.deepEqual(loadReusableAnimatedModelRegistry([pathToFileURL(file)]).rows[0].row.preferredView,view)}
  for(const invalid of[{modelAsset:'other'},{camera:{fov:0}},{camera:{pos:{z:Infinity}}},{viewportPerInch:-1},{trans:{untyped:true}}]){entry.preferredView=invalid;writeFileSync(file,JSON.stringify(catalog));assert.throws(()=>loadReusableAnimatedModelRegistry([pathToFileURL(file)]),{code:'REUSABLE_ANIMATED_MODEL_UNAVAILABLE'})}
 }finally{unlinkSync(file);rmdirSync(dir)}
})
test('authored view components override individually and null resets restore registered components',()=>{
 for(const view of views){
  const options={h:4,camera:{fov:25},trans:{rot:{y:45}},objViewport:54321}
  const result=applyReusableAnimatedModelPreferredView(view,options)
  assert.deepEqual(result.camera,{...view.camera,fov:25});assert.equal(result.trans.rot.y,45)
  assert.deepEqual(result.trans.scale,view.trans.scale);assert.equal(result.objViewport,54321)
  const reset=applyReusableAnimatedModelPreferredView(view,{h:4,camera:null,trans:null,objViewport:null})
  assert.deepEqual(reset.camera,view.camera);assert.deepEqual(reset.trans,view.trans);assert.equal(reset.objViewport,view.viewportPerInch*4)
  assert.equal(applyReusableAnimatedModelPreferredView(view,{camera:{fov:null}}).camera.fov,view.camera.fov)
  for(const explicit of[{motionFraming:{mode:'selected-animation'}},{model3dViewPresetId:MODEL3D_VIEW_PRESETS[0].id}])assert.deepEqual(applyReusableAnimatedModelPreferredView(view,explicit),explicit)
 }
 const ordinary={camera:{fov:28},h:4};assert.deepEqual(applyReusableAnimatedModelPreferredView(undefined,ordinary),ordinary)
 assert.throws(()=>applyReusableAnimatedModelPreferredView({camera:{fov:NaN}},{}),{code:'REUSABLE_ANIMATED_MODEL_UNAVAILABLE'})
})

const specFor=handle=>({schemaVersion:'betterpptx.deck-spec.v1',title:'Source-relative views',authoringContract:{workflow:'authoring-excellence-director-v1',level:'deterministic'},contentStory:{audience:'reviewers',outcome:'preserve selected view',remember:'each source keeps its lens'},visualDesign:{world:'blueprint',framing:'one native model'},motionTime:{masterClock:'scene',timingSource:'registered source motion',syncPolicy:'preserve source clock'},slides:[{id:'s',title:'Reusable view',message:'Source-bound view with editable manual camera.',layoutIntent:'title-only',content:[{kind:'model3d',name:'hero',model:handle,rect:{x:1,y:1,w:7,h:4}}]}]})
test('normal compiler uses preferred views instead of implicit world staging, retaining authored overrides and source clock',()=>{
 const handles=['model3d://betterpptx-emoji-motions/handshake-approved','model3d://betterpptx-face-motions/ceramic-angry-face']
 for(const[i,handle]of handles.entries()){
  const resolver=(selected,options)=>{
   const defaults=resolveReusableAnimatedModelDefaults(selected,options);if(!defaults)return null
   // This fixture supplies its own trusted metadata, independent of live catalogue views.
   for(const k of ['camera','trans','objViewport'])delete defaults[k]
   return applyReusableAnimatedModelPreferredView(views[i],{...defaults,...Object.fromEntries(Object.entries(options).filter(([k])=>['camera','trans','objViewport'].includes(k)))})
  }
  const spec=specFor(handle),compile=()=>buildSpecOperationPlan(spec,{dryRun:true,resolveReusableAnimatedModelDefaults:resolver}).operations.find(op=>op.tool==='betterpptx.slide.add_model3d').args.options
  let options=compile();assert.deepEqual(options.camera,views[i].camera);assert.deepEqual(options.trans,views[i].trans);assert.equal(options.objViewport,views[i].viewportPerInch*4)
  assert.deepEqual(options.scene,resolveReusableAnimatedModelSelection(handle).scene)
  spec.slides[0].content[0].camera={fov:24};options=compile();assert.equal(options.camera.fov,24);assert.deepEqual(options.camera.pos,views[i].camera.pos)
  spec.slides[0].content[0].camera=null;options=compile();assert.deepEqual(options.camera,views[i].camera)
  delete spec.slides[0].content[0].camera;spec.slides[0].content[0].model3dViewPresetId=MODEL3D_VIEW_PRESETS[0].id;options=compile();assert.equal(options.camera,undefined);assert.equal(options.objViewport,undefined)
 }
})
