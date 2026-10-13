import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const HASH=/^[a-f0-9]{64}$/;
const AXIS=new Set(['x','y','z']);
const fail=(code='PREPARATION_NORMALIZATION_UNAVAILABLE')=>{throw Object.assign(new Error('Motion preparation is unavailable for this request.'),{code});};
const copy=structuredClone;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sha=value=>createHash('sha256').update(value).digest('hex');
export const motionSourceClockSha256=clock=>sha(JSON.stringify(canonical(clock)));
export const motionNormalizationContractSha256=contract=>sha(JSON.stringify(canonical(contract)));

function closed(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype
  ||Reflect.ownKeys(value).length!==keys.length||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key)))fail('PREPARATION_NORMALIZATION_UNAVAILABLE');
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('PREPARATION_NORMALIZATION_UNAVAILABLE');}
}
function identityAxes(value){
 closed(value,['verticalAxis','horizontalAxes']);
 if(!AXIS.has(value.verticalAxis)||!Array.isArray(value.horizontalAxes)||value.horizontalAxes.length!==2
  ||new Set(value.horizontalAxes).size!==2||value.horizontalAxes.some(axis=>!AXIS.has(axis)||axis===value.verticalAxis)
  ||!isDeepStrictEqual([...value.horizontalAxes].sort(),['x','y','z'].filter(axis=>axis!==value.verticalAxis).sort()))fail();
}
function metric(value,{kind,expected,clock}){
 const sourceKeys=['quantity','basisId','value','unit','unitMeaning','sourceSha256','measurementSha256','producerSha256','sampleCount','clockSha256','frameId','axes','poseBasis','restBasis','calibrationId','calibrationState'];
 const targetKeys=['quantity','basisId','value','unit','unitMeaning','targetRigSha256','targetRestSha256','measurementSha256','producerSha256','sampleCount','clockSha256','frameId','axes','poseBasis','restBasis','calibrationId','calibrationState'];
 closed(value,kind==='source'?sourceKeys:targetKeys);
 if(typeof value.quantity!=='string'||!value.quantity.trim()||value.quantity.length>120
  ||typeof value.basisId!=='string'||!value.basisId.trim()||value.basisId.length>120
  ||!Number.isFinite(value.value)||value.value<=0||value.value>1e12
  ||typeof value.unit!=='string'||!value.unit.trim()||value.unit.length>80
  ||typeof value.unitMeaning!=='string'||!value.unitMeaning.trim()||value.unitMeaning.length>200
  ||typeof value.frameId!=='string'||!value.frameId.trim()||value.frameId.length>120
  ||typeof value.poseBasis!=='string'||!value.poseBasis.trim()||value.poseBasis.length>120
  ||typeof value.restBasis!=='string'||!value.restBasis.trim()||value.restBasis.length>120
  ||typeof value.calibrationId!=='string'||!value.calibrationId.trim()||value.calibrationId.length>120
  ||value.calibrationState!=='verified'||!Number.isSafeInteger(value.sampleCount)||value.sampleCount!==clock.frameCount
  ||value.clockSha256!==motionSourceClockSha256(clock)||!HASH.test(value.measurementSha256||'')||!HASH.test(value.producerSha256||''))fail();
 identityAxes(value.axes);
 if(kind==='source'&&(!HASH.test(value.sourceSha256||'')||value.sourceSha256!==expected.sourceSha256))fail('PREPARATION_INPUT_DRIFT');
 if(kind==='target'&&(!HASH.test(value.targetRigSha256||'')||!HASH.test(value.targetRestSha256||'')
  ||value.targetRigSha256!==expected.targetRigSha256||value.targetRestSha256!==expected.targetRestSha256))fail('PREPARATION_INPUT_DRIFT');
 return copy(value);
}

/** Validate exact source/target metric evidence and derive the only allowed root-motion scale. */
export function validateMotionNormalizationContract(contract,{expected,sourceClock}={}){
 closed(contract,['schemaVersion','sourceMetric','targetMetric','transfer']);
 if(contract.schemaVersion!=='betterpptx.motion-compatible-normalization.v1')fail();
 if(!sourceClock||typeof sourceClock!=='object'||Array.isArray(sourceClock))fail();
 closed(sourceClock,['startFrame','endFrame','frameCount','fps','durationMs']);
 if(!Number.isSafeInteger(sourceClock.startFrame)||!Number.isSafeInteger(sourceClock.endFrame)||!Number.isSafeInteger(sourceClock.frameCount)
  ||sourceClock.frameCount<2||sourceClock.endFrame-sourceClock.startFrame+1!==sourceClock.frameCount
  ||!Number.isFinite(sourceClock.fps)||sourceClock.fps<=0||sourceClock.fps>1000
  ||!Number.isFinite(sourceClock.durationMs)||Math.abs(sourceClock.durationMs-(sourceClock.frameCount-1)*1000/sourceClock.fps)>1e-5
  ||!expected||typeof expected!=='object'||!HASH.test(expected.sourceSha256||'')||!HASH.test(expected.targetRigSha256||'')||!HASH.test(expected.targetRestSha256||''))fail();
 const clockSha256=motionSourceClockSha256(sourceClock);
 const source=metric(contract.sourceMetric,{kind:'source',expected,clock:sourceClock});
 const target=metric(contract.targetMetric,{kind:'target',expected,clock:sourceClock});
 if(source.quantity!==target.quantity||source.basisId!==target.basisId)fail('PREPARATION_NORMALIZATION_INCOMPATIBLE');
 closed(contract.transfer,['formula','rootMotionScale','unit','space','axes','anchor','travelPolicy','fallback']);
 const derived=target.value/source.value;
 if(contract.transfer.formula!=='target.value/source.value'||!Number.isFinite(contract.transfer.rootMotionScale)
  ||contract.transfer.rootMotionScale<1e-6||contract.transfer.rootMotionScale>1e6
  ||Math.abs(contract.transfer.rootMotionScale-derived)>Math.max(1,Math.abs(derived))*1e-12
  ||contract.transfer.unit!==`${target.unit} per ${source.unit}`||contract.transfer.space!=='world'
  ||contract.transfer.axes!=='all'||contract.transfer.anchor!=='start'
  ||contract.transfer.travelPolicy!=='preserve-source-trajectory'||contract.transfer.fallback!=='reject-if-unknown')fail('PREPARATION_NORMALIZATION_INCOMPATIBLE');
 return Object.freeze({schemaVersion:contract.schemaVersion,contractSha256:motionNormalizationContractSha256(contract),sourceMetric:source,targetMetric:target,sourceClockSha256:clockSha256,rootMotionScale:derived,rootMotionScaleUnit:contract.transfer.unit,rootMotionSpace:'world',rootMotionAxes:'all',rootMotionAnchor:'start',travelPolicy:'preserve-source-trajectory',fallback:'reject-if-unknown'});
}
