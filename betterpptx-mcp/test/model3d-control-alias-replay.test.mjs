import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeModel3dControlsInSpec} from '../model3d-authoring-family-contract.mjs';
import {buildSpecOperationPlan} from '../ir/spec-compiler.mjs';
const controls={nativeOnly:true,scene:{animId:0,length:1042,loop:false}};
const block={kind:'model3d',name:'unit-prepared-model',rect:{x:1,y:1,w:3,h:4},modelAsset:'gen://rigged3d/'+'1'.repeat(40),altText:'Synthetic unit model'};
test('both declared aliases normalize into portable model controls without changing the input',()=>{
 for(const alias of ['modelOptions','model3dOptions']){const input={slides:[{content:[{...block,[alias]:controls}]}]},before=structuredClone(input),normalized=normalizeModel3dControlsInSpec(input),model=normalized.slides[0].content[0];assert.deepEqual(input,before);assert.deepEqual(model.scene,controls.scene);assert.equal(model.nativeOnly,true);assert.equal(model[alias],undefined);assert.deepEqual(normalizeModel3dControlsInSpec(normalized),normalized)}
});
test('the compiler preserves native scene controls from the declared model3dOptions alias',()=>{
 const plan=buildSpecOperationPlan({schemaVersion:'betterpptx.deck-spec.v1',title:'Unit carrier',layout:'LAYOUT_WIDE',slides:[{id:'unit',content:[{...block,model3dOptions:controls}]}]});const operation=plan.operations.find(row=>row.tool==='betterpptx.slide.add_model3d'||row.method==='add_model3d'||row.toolName==='betterpptx.slide.add_model3d');assert.ok(operation);assert.deepEqual(operation.args.options.scene,controls.scene);
});
test('conflicting aliases and private noncontract options refuse instead of silently dropping controls',()=>{
 assert.throws(()=>normalizeModel3dControlsInSpec({slides:[{content:[{...block,scene:{...controls.scene,loop:true},model3dOptions:controls}]}]}));
 assert.throws(()=>normalizeModel3dControlsInSpec({slides:[{content:[{...block,modelOptions:{glbFile:'private-path'}}]}]}));
});

test('prepared selection produces embedded playback through trusted resolution while retaining its portable scene',()=>{
 const scene={preparedVariantId:'prepared_variant_'+'a'.repeat(32),length:1042,loop:false};
 const spec={schemaVersion:'betterpptx.deck-spec.v1',title:'Prepared clip',layout:'LAYOUT_WIDE',slides:[{id:'unit',content:[{...block,model3dOptions:{nativeOnly:true,scene}}]}]};
 let validated=0;const plan=buildSpecOperationPlan(spec,{validatePreparedScene:(asset,input)=>{assert.equal(asset,block.modelAsset);assert.deepEqual(input,scene);validated++;return {...input,animId:0}}});
 const playback=plan.operations.find(row=>JSON.stringify(row).includes('playScene'));assert.ok(playback,'compiler must emit selected clip playback instead of a default rotation');assert.ok(validated>0);assert.equal(JSON.stringify(playback).includes('1042'),true);assert.equal(spec.slides[0].content[0].model3dOptions.scene.animId,undefined);
 assert.throws(()=>buildSpecOperationPlan(spec),/Prepared scene validation/);
 assert.throws(()=>buildSpecOperationPlan(spec,{validatePreparedScene:()=>scene}),/playable clip/);
});

test('prepared playback supports named asset references with the same trusted handle',()=>{
 const model={...block,assetRef:'prepared',scene:{preparedVariantId:'prepared_variant_'+'a'.repeat(32),length:1042,loop:false}};delete model.modelAsset;
 const spec={schemaVersion:'betterpptx.deck-spec.v1',title:'Asset reference',layout:'LAYOUT_WIDE',assets:[{name:'prepared',handle:block.modelAsset}],slides:[{id:'unit',content:[model]}]};
 const plan=buildSpecOperationPlan(spec,{validatePreparedScene:(asset,scene)=>{assert.equal(asset,block.modelAsset);return {...scene,animId:0}}});assert.ok(plan.operations.some(row=>JSON.stringify(row).includes('playScene')));
});
