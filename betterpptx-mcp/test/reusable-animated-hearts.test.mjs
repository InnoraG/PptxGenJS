import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {reusableAnimatedModelCatalogEntries,resolveReusableAnimatedModelDefaults} from '../assets/reusable-animated-model-library.mjs'

test('physical left and right finger hearts remain distinct, source-bound native selections',()=>{
 const entries=reusableAnimatedModelCatalogEntries()
 for(const [side,hash] of [['left','9429c45f730b2811dc5c3ef4cf98c86211579394f28d66f57aa1dcfdee559ffe'],['right','c3b6977299bc25eba61f80b94ba1785c1eedf358908823d6940c184bc33074a0']]){
  const handle='model3d://betterpptx-emoji-motions/finger-heart-'+side
  const entry=entries.find(e=>e.handle===handle)
  assert.ok(entry.tags.includes(side+'-hand'))
  assert.equal(entry.sha256,hash)
  assert.equal(createHash('sha256').update(readFileSync(entry.modelAsset)).digest('hex'),hash)
  assert.equal(entry.reusableMotion.nativeQualification,'qualified')
  assert.equal(entry.reusableMotion.approval,'previously-validated')
  const options=resolveReusableAnimatedModelDefaults(handle)
  assert.equal(options.animation.duration,4000)
  assert.equal(options.scene.length,4000)
  assert.deepEqual(options.posterFrame,{animId:0,progress:0})
  const other='model3d://betterpptx-emoji-motions/finger-heart-'+(side==='left'?'right':'left')
  assert.throws(()=>resolveReusableAnimatedModelDefaults(handle,{modelAsset:other}),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
 }
 assert.equal(entries.filter(e=>e.source==='betterpptx-face-motions').length,70)
 assert.equal(entries.find(e=>e.handle==='model3d://betterpptx-emoji-motions/handshake-approved').sha256,'9704e1a8c11eba95a8bf76fa7c243673e525136f091282042e7653cf31f3ef11')
})

test('paired heart preserves its corrected source, stopped hero and complete native clock',()=>{
 const handle='model3d://betterpptx-emoji-motions/heart-hands'
 const entry=reusableAnimatedModelCatalogEntries().find(e=>e.handle===handle)
 assert.ok(entry)
 assert.equal(entry.sha256,'1d11af20700a47f86e19d4db23dfdf4fc9951424b9efee242cfe6361020f0d07')
 assert.equal(createHash('sha256').update(readFileSync(entry.modelAsset)).digest('hex'),entry.sha256)
 assert.equal(entry.reusableMotion.nativeQualification,'qualified')
 assert.equal(entry.reusableMotion.approval,'previously-validated')
 const options=resolveReusableAnimatedModelDefaults(handle)
 assert.equal(options.scene.length,6400)
 assert.equal(options.animation.duration,6400)
 assert.deepEqual(options.posterFrame,{animId:0,progress:0})
 assert.deepEqual(options.animation.sceneProgress,{start:0,end:1})
 for(const conflict of [{animation:{effect:'playScene',duration:4000}},{handArticulation:{gesture:'fist'}},{modelAsset:'model3d://betterpptx-emoji-motions/handshake-approved'}]){
  assert.throws(()=>resolveReusableAnimatedModelDefaults(handle,conflict),{code:'REUSABLE_ANIMATED_MODEL_SELECTION_CONFLICT'})
 }
})
