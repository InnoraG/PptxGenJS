const PREPARED=/^prepared_variant_[a-f0-9]{32}$/;
export const PREPARED_MOTION_SCENE_SCHEMA=Object.freeze({type:['string','null'],pattern:'^prepared_variant_[a-f0-9]{32}$',description:'Exact owner-prepared variant returned by motion preparation. Selects its single embedded clip for a model preview; does not certify action, physical scale or native playback. Null clears this prepared selection.'});
const fail=(code='PREPARED_SCENE_INVALID')=>{throw Object.assign(new Error('The prepared scene is unavailable for this model asset.'),{code})};
export function resolvePreparedMotionScene(entry,scene){
 if(scene?.preparedVariantId===undefined)return scene;
 if(scene.preparedVariantId===null){const reset={...scene};delete reset.preparedVariantId;return Object.keys(reset).length?reset:null}
 if(!PREPARED.test(scene.preparedVariantId)||scene.animId!=null||scene.motionId!=null)fail();
 const manifest=entry?.manifest;if(manifest?.contract!=='betterpptx.motion-prepared-output.v1'||manifest.preparedVariantId!==scene.preparedVariantId||!['original','skeletal-mirrored'].includes(manifest.variant)||typeof entry.glbBase64!=='string')fail('PREPARED_SCENE_ASSET_MISMATCH');
 const bytes=Buffer.from(entry.glbBase64,'base64');if(bytes.length!==manifest.outputBytes||bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)fail('PREPARED_SCENE_ASSET_MISMATCH');
 const length=bytes.readUInt32LE(12);if(length>bytes.length-20)fail('PREPARED_SCENE_ASSET_MISMATCH');let document;try{document=JSON.parse(bytes.subarray(20,20+length).toString('utf8'))}catch{fail('PREPARED_SCENE_ASSET_MISMATCH')}
 if(!Array.isArray(document.animations)||document.animations.length!==1)fail('PREPARED_SCENE_ASSET_MISMATCH');
 return {...scene,animId:0};
}
