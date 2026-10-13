import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {mirrorAnimationGlb} from './ir/animation-mirror.mjs';
import {extractRetargetRestProfile,parseGlb,serializeGlb,transplantMotionSet} from './ir/kinetic-transplant.mjs';
import {validateMotionNormalizationContract} from './motion-preparation-normalization.mjs';

const MAX_SOURCE_BYTES=32*1024*1024;
const MAX_TARGET_BYTES=64*1024*1024;
const MAX_OUTPUT_BYTES=96*1024*1024;
const MAX_CHANNELS=512;
const MAX_KEYS=100000;
const HASH=/^[a-f0-9]{64}$/;
const fail=(code='PREPARATION_DOMAIN_UNSUPPORTED')=>{throw Object.assign(new Error('The requested motion preparation is unavailable for this input.'),{code});};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;

function asBytes(value,max,label){
 if(!(Buffer.isBuffer(value)||value instanceof Uint8Array)||value.byteLength<20||value.byteLength>max)fail('PREPARATION_INPUT_INVALID');
 return Buffer.from(value);
}
function parseContainedGlb(value,max,label){
 const bytes=asBytes(value,max,label);
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)fail('PREPARATION_INPUT_INVALID');
 let offset=12,json=null,bin=null,index=0;
 while(offset<bytes.length){
  if(offset+8>bytes.length)fail('PREPARATION_INPUT_INVALID');
  const length=bytes.readUInt32LE(offset),kind=bytes.readUInt32LE(offset+4),start=offset+8,end=start+length;
  if(end>bytes.length||length%4!==0)fail('PREPARATION_INPUT_INVALID');
  if(index===0&&kind!==0x4e4f534a)fail('PREPARATION_INPUT_INVALID');
  if(kind===0x4e4f534a){if(json!==null||index!==0)fail('PREPARATION_INPUT_INVALID');try{json=JSON.parse(bytes.subarray(start,end).toString('utf8'));}catch{fail('PREPARATION_INPUT_INVALID');}}
  else if(kind===0x004e4942){if(bin!==null||json===null)fail('PREPARATION_INPUT_INVALID');bin=bytes.subarray(start,end);}
  else fail('PREPARATION_INPUT_INVALID');
  offset=end;index++;
 }
 if(offset!==bytes.length||json===null||!json.asset||json.asset.version!=='2.0')fail('PREPARATION_INPUT_INVALID');
 if(!Array.isArray(json.buffers)||json.buffers.length!==1||Object.hasOwn(json.buffers[0]||{},'uri')||!bin)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 for(const image of json.images||[])if(Object.hasOwn(image,'uri'))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const declared=json.buffers[0].byteLength;
 if(!Number.isSafeInteger(declared)||declared<1||declared>bin.length||bin.length-declared>3)fail('PREPARATION_INPUT_INVALID');
 return {bytes,json,bin};
}
function closedClock(clock){
 const keys=['startFrame','endFrame','frameCount','fps','durationMs'];
 if(!clock||Object.getPrototypeOf(clock)!==Object.prototype||Reflect.ownKeys(clock).length!==keys.length||keys.some(k=>!Object.hasOwn(clock,k)))fail('PREPARATION_INPUT_INVALID');
 if(!Number.isSafeInteger(clock.startFrame)||!Number.isSafeInteger(clock.endFrame)||!Number.isSafeInteger(clock.frameCount)||clock.frameCount<2||clock.frameCount>MAX_KEYS||clock.endFrame-clock.startFrame+1!==clock.frameCount||!Number.isFinite(clock.fps)||clock.fps<=0||clock.fps>1000||!Number.isFinite(clock.durationMs)||clock.durationMs<0||Math.abs(clock.durationMs-(clock.frameCount-1)*1000/clock.fps)>0.00001)fail('PREPARATION_INPUT_INVALID');
 return structuredClone(clock);
}
function readScalarTimes(parsed,accessorIndex){
 const {json,bin}=parsed,a=json.accessors?.[accessorIndex],view=a&&json.bufferViews?.[a.bufferView];
 if(!a||!view||a.sparse||a.componentType!==5126||a.type!=='SCALAR'||!Number.isSafeInteger(a.count)||a.count<1||a.count>MAX_KEYS)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const stride=view.byteStride||4,base=(view.byteOffset||0)+(a.byteOffset||0),end=base+(a.count-1)*stride+4;
 if(stride<4||base<0||end>bin.length)fail('PREPARATION_INPUT_INVALID');
 const times=[];for(let i=0;i<a.count;i++){const t=bin.readFloatLE(base+i*stride);if(!Number.isFinite(t)||(i&&t<=times[i-1]))fail('PREPARATION_DOMAIN_UNSUPPORTED');times.push(t);}
 return times;
}
function validateAnimation(parsed,clock,{requireRootTranslation=true}={}){
 const {json}=parsed;
 if((json.skins?.length||0)>0||Object.values(json.nodes||[]).some(node=>Object.hasOwn(node||{},'skin'))||['meshes','images','textures','materials'].some(k=>(json[k]?.length||0)>0))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 if((json.animations||[]).length!==1)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 for(const buffer of json.buffers||[])if(Object.hasOwn(buffer,'uri'))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 for(const image of json.images||[])if(Object.hasOwn(image,'uri'))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const animations=json.animations[0],channels=animations.channels,samplers=animations.samplers;
 if(!Array.isArray(channels)||channels.length<1||channels.length>MAX_CHANNELS||!Array.isArray(samplers)||!samplers.length)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const paths=new Set(),timesBySampler=new Map(),channelKinds=new Set(),rootTranslations=[];
 let interpolation=null;
 for(const channel of channels){
  const target=channel?.target,sampler=samplers[channel?.sampler],node=target?.node,path=target?.path;
  if(!Number.isSafeInteger(node)||node<0||node>=json.nodes.length||!sampler||!['rotation','translation'].includes(path))fail('PREPARATION_DOMAIN_UNSUPPORTED');
  const accessor=json.accessors?.[sampler.output];
  if(!accessor||accessor.sparse||accessor.componentType!==5126||accessor.type!==(path==='rotation'?'VEC4':'VEC3'))fail('PREPARATION_DOMAIN_UNSUPPORTED');
  const key=`${node}:${path}`;if(paths.has(key))fail('PREPARATION_DOMAIN_UNSUPPORTED');paths.add(key);
  const mode=sampler.interpolation||'LINEAR';if(!['LINEAR','STEP'].includes(mode)||(interpolation!==null&&interpolation!==mode))fail('PREPARATION_DOMAIN_UNSUPPORTED');interpolation=mode;
  const times=timesBySampler.get(channel.sampler)||readScalarTimes(parsed,sampler.input);
  timesBySampler.set(channel.sampler,times);
  if(accessor.count!==times.length)fail('PREPARATION_DOMAIN_UNSUPPORTED');
  const outView=json.bufferViews?.[accessor.bufferView];if(!outView)fail('PREPARATION_INPUT_INVALID');
  const components=path==='rotation'?4:3,stride=outView.byteStride||components*4,base=(outView.byteOffset||0)+(accessor.byteOffset||0),end=base+(accessor.count-1)*stride+components*4;
  if(stride<components*4||base<0||end>parsed.bin.length)fail('PREPARATION_INPUT_INVALID');
  for(let i=0;i<accessor.count;i++)for(let j=0;j<components;j++)if(!Number.isFinite(parsed.bin.readFloatLE(base+i*stride+j*4)))fail('PREPARATION_DOMAIN_UNSUPPORTED');
  channelKinds.add(path);
  if(path==='translation')rootTranslations.push({node,name:String(json.nodes[node]?.name||'')});
 }
 if(requireRootTranslation&&rootTranslations.length!==1)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const root=rootTranslations[0];
 if(root){
  if(!root.name)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 }
 const allTimes=[...timesBySampler.values()];if(!allTimes.length)fail('PREPARATION_DOMAIN_UNSUPPORTED');
 const expected=Array.from({length:clock.frameCount},(_,i)=>i/clock.fps),unique=new Set();
 for(const times of allTimes)for(const t of times){unique.add(t);if(unique.size>MAX_KEYS)fail('PREPARATION_DOMAIN_UNSUPPORTED');}
 const union=[...unique].sort((a,b)=>a-b);
 const coversFrames=times=>{
  // FLOAT accessors preserve the exact Float32 representation of source keys.
  // Keep the existing nominal tolerance; do not widen it for arbitrary keys.
  if(times[0]<-1e-6||(times.at(-1)>expected.at(-1)+1e-6&&times.at(-1)!==Math.fround(expected.at(-1))))return false;
  let index=0;
  for(const frame of expected){const encodedFrame=Math.fround(frame);while(index<times.length&&times[index]<frame-1e-6&&times[index]!==encodedFrame)index++;if(index===times.length||(Math.abs(times[index]-frame)>1e-6&&times[index]!==encodedFrame))return false;}
  return true;
 };
 for(const times of allTimes){
  if(times.length===1){if(Math.abs(times[0])>1e-6)fail('PREPARATION_DOMAIN_UNSUPPORTED');}
  // Retain genuine subframe keys (for example, source Euler-to-quaternion
  // conversion) rather than resampling them away. Every declared integer
  // source frame remains mandatory, and existing clock/byte/key limits hold.
  else if(!coversFrames(times))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 }
 if(!coversFrames(union))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 return {animationName:String(animations.name||'motion'),channelCount:channels.length,channelKinds:[...channelKinds].sort(),interpolation,rootBoneName:root?.name||null,times:union};
}
function animationClock(parsed,animation){
 const {json}=parsed,times=new Set();
 for(const channel of animation.channels||[]){
  const sampler=animation.samplers[channel.sampler];
  for(const value of readScalarTimes(parsed,sampler.input))times.add(value);
 }
 return [...times].sort((a,b)=>a-b);
}
function nodesNamed(json){return new Set((json.nodes||[]).map(node=>node?.name).filter(name=>typeof name==='string'&&name));}

export function inspectNormalizedMotionGlb(sourceMotionBytes,sourceClock){
 const clock=closedClock(sourceClock),parsed=parseContainedGlb(sourceMotionBytes,MAX_SOURCE_BYTES,'source');
 const profile=validateAnimation(parsed,clock);
 return Object.freeze({
  sha256:sha256(parsed.bytes),bytes:parsed.bytes.length,clock,
  animationProfile:Object.freeze({channelKinds:Object.freeze(profile.channelKinds),interpolation:profile.interpolation,componentType:'FLOAT',externalResources:false,skinState:'skinless',selectedAnimationCount:1}),
  rootBoneName:profile.rootBoneName,channelCount:profile.channelCount,
 });
}

function assertSingletonOutputCadence(source, result) {
 const sourceBindings = new Map(), outputBindings = new Map();
 const bindings = (parsed, map) => {
  for (const channel of parsed.json.animations[0].channels) {
   const name = parsed.json.nodes[channel.target.node]?.name;
   const key = JSON.stringify([name, channel.target.path]);
   if (!name || map.has(key)) fail('PREPARATION_OUTPUT_INVALID');
   map.set(key, parsed.json.animations[0].samplers[channel.sampler]);
  }
 };
 bindings(source, sourceBindings); bindings(result, outputBindings);
 for (const [key, sampler] of sourceBindings) {
  const sourceTimes = readScalarTimes(source, sampler.input);
  if (sourceTimes.length !== 1) continue;
  const output = outputBindings.get(key);
  if (!output) fail('PREPARATION_OUTPUT_INVALID');
  const outputTimes = readScalarTimes(result, output.input);
  if (outputTimes.length !== 1 || !Object.is(outputTimes[0], sourceTimes[0])
   || (output.interpolation || 'LINEAR') !== (sampler.interpolation || 'LINEAR')) fail('PREPARATION_OUTPUT_INVALID');
 }
}

export function prepareNormalizedMotionVariant({sourceMotionBytes,targetGlbBytes,targetConstructionRestBytes,sourceClock,variant,expected,normalizationContract,outputSlug='prepared-motion'}={}){
 if(!['original','skeletal-mirrored'].includes(variant)||!expected||Object.getPrototypeOf(expected)!==Object.prototype)fail('PREPARATION_INPUT_INVALID');
 const clock=closedClock(sourceClock),source=parseContainedGlb(sourceMotionBytes,MAX_SOURCE_BYTES,'source'),target=parseContainedGlb(targetGlbBytes,MAX_TARGET_BYTES,'target'),rest=parseContainedGlb(targetConstructionRestBytes,MAX_TARGET_BYTES,'construction rest');
 const sourceShape=validateAnimation(source,clock),sourceSha256=sha256(source.bytes),targetSha256=sha256(target.bytes),restSha256=sha256(rest.bytes);
 if(expected.sourceMotionSha256!==sourceSha256||expected.targetRigSha256!==targetSha256||expected.targetRestSha256!==restSha256||![expected.sourceSha256,expected.sourceMotionSha256,expected.targetRigSha256,expected.targetRestSha256,expected.normalizationContractSha256].every(x=>typeof x==='string'&&HASH.test(x)))fail('PREPARATION_INPUT_DRIFT');
 const normalization=validateMotionNormalizationContract(normalizationContract,{expected,sourceClock:clock});
 if(normalization.contractSha256!==expected.normalizationContractSha256)fail('PREPARATION_INPUT_DRIFT');
 const targetNames=nodesNamed(target.json),restProfile=extractRetargetRestProfile(rest.bytes),restNames=new Set(Object.keys(restProfile.nodes||{}));
 if(!targetNames.size||targetNames.size!==restNames.size||[...targetNames].some(name=>!restNames.has(name))||!targetNames.has(sourceShape.rootBoneName))fail('PREPARATION_DOMAIN_UNSUPPORTED');
 for(const channel of source.json.animations[0].channels){const name=source.json.nodes[channel.target.node]?.name;if(!name||!targetNames.has(name))fail('PREPARATION_DOMAIN_UNSUPPORTED');}
 const selected=variant==='skeletal-mirrored'
  ?mirrorAnimationGlb(source.bytes,{animationIndex:0,axis:0,strict:true,mirrorStaticNodes:false,nameSuffix:'.skeletal-mirrored'}).glb
  :source.bytes;
 const selectedParsed=parseContainedGlb(selected,MAX_SOURCE_BYTES,'mirrored source');
 const selectedShape=validateAnimation(selectedParsed,clock);
 if(selectedShape.channelCount!==sourceShape.channelCount||selectedShape.rootBoneName!==sourceShape.rootBoneName)fail('PREPARATION_OUTPUT_INVALID');
 const transplanted=transplantMotionSet(target.bytes,[{
  motionId:'private-preparation',sourceSlug:selectedParsed.json.animations[0].name,outputSlug,
  library:selected,libraryKey:sha256(selected),channelPolicy:'root-motion',rootBoneName:sourceShape.rootBoneName,
  rotationRetargetSpace:'world-delta',rotationReference:'rest',rootMotionSpace:'world',rootMotionAnchor:normalization.rootMotionAnchor,rootMotionAxes:normalization.rootMotionAxes,
  rootMotionScale:normalization.rootMotionScale,rootMotionScaleSource:'compatible-normalization-contract',
  rootMotionMaxStatures:null,rootMotionMaxHorizontalStatures:null,
 }],{strict:true,targetRestProfile:restProfile,channelPolicy:'root-motion',rootBoneName:sourceShape.rootBoneName,rotationRetargetSpace:'world-delta',rotationReference:'rest'});
 const output=Buffer.from(transplanted.glb);
 if(output.length>MAX_OUTPUT_BYTES)fail('PREPARATION_OUTPUT_INVALID');
 const result=parseContainedGlb(output,MAX_OUTPUT_BYTES,'output'),newAnimations=result.json.animations||[];
 const replaceable=new Set(['buffers','bufferViews','accessors','animations']);
 const stable=(json)=>Object.fromEntries(Object.keys(json).filter(k=>!replaceable.has(k)).map(k=>[k,json[k]]));
 if(newAnimations.length!==1||!isDeepStrictEqual(stable(result.json),stable(target.json)))fail('PREPARATION_OUTPUT_INVALID');
 const newAnimation=newAnimations.at(-1);
 if(!newAnimation?.name?.endsWith(`_${outputSlug}`)||newAnimation.channels?.length!==sourceShape.channelCount)fail('PREPARATION_OUTPUT_INVALID');
 assertSingletonOutputCadence(selectedParsed,result);
 const outClock=animationClock(result,newAnimation),sourceClockValues=sourceShape.times;
 if(!isDeepStrictEqual(outClock.map(t=>Number(t.toPrecision(9))),sourceClockValues.map(t=>Number(t.toPrecision(9)))))fail('PREPARATION_OUTPUT_INVALID');
 const outputSha256=sha256(output);
 return Object.freeze({glb:output,outputSha256,outputBytes:output.length,sourceClock:clock,variant,report:Object.freeze({targetAnimationPolicy:'prepared-clip-replaces-target-clips',sourceChannelCount:sourceShape.channelCount,outputChannelCount:newAnimation.channels.length,normalizationContractSha256:normalization.contractSha256,rootMotionScale:normalization.rootMotionScale,rootMotionScaleUnit:normalization.rootMotionScaleUnit,rootMotionTravelPolicy:normalization.travelPolicy,retargetReport:transplanted.report,retargetValidation:transplanted.retargetValidation||[],sourceMotionSha256:sourceSha256,targetRigSha256:targetSha256,targetRestSha256:restSha256})});
}

export function preparationProducerSha256(){
 // Pin the direct execution dependencies, including the root retargeter and
 // mirror implementation. Changing either must invalidate cached output even
 // when the wrapper and normalization contract are unchanged.
 const worker=readFileSync(fileURLToPath(import.meta.url));
 const normalization=readFileSync(fileURLToPath(new URL('./motion-preparation-normalization.mjs',import.meta.url)));
 const retargeter=readFileSync(fileURLToPath(new URL('./ir/kinetic-transplant.mjs',import.meta.url)));
 const mirror=readFileSync(fileURLToPath(new URL('./ir/animation-mirror.mjs',import.meta.url)));
 return createHash('sha256')
  .update('betterpptx.motion-preparation-execution-closure.v2\0')
  .update(worker)
  .update('\0normalization-validator\0')
  .update(normalization)
  .update('\0root-retargeter\0').update(retargeter)
  .update('\0skeletal-mirror\0').update(mirror)
  .digest('hex');
}
