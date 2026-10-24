import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Quaternion} from 'three';

const directory='betterpptx-mcp/assets/approved-face-motions/';
const registry=JSON.parse(fs.readFileSync(directory+'catalog.json'));
const bytes=fs.readFileSync(directory+'face-expressions.glb');
const sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex');
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
const binStart=20+bytes.readUInt32LE(12)+8,bin=bytes.subarray(binStart);
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(index){
 const a=json.accessors[index],v=json.bufferViews[a.bufferView],n=sizes[a.type];
 assert.equal(a.componentType,5126);assert.ok(!a.sparse);assert.ok(n);
 const stride=v.byteStride??n*4,base=(v.byteOffset??0)+(a.byteOffset??0);
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>bin.readFloatLE(base+i*stride+k*4)));
}
const animation=json.animations[0];assert.equal(json.animations.length,1);
const tracks=animation.channels.map(c=>{const s=animation.samplers[c.sampler];assert.ok(['LINEAR','STEP'].includes(s.interpolation??'LINEAR'));return{path:c.target.path,node:c.target.node,interpolation:s.interpolation??'LINEAR',times:accessor(s.input).map(v=>v[0]),values:accessor(s.output)}});
const duration=Math.max(...tracks.map(t=>t.times.at(-1)));
function sample(t,time){
 let low=0,high=t.times.length-1;
 while(low+1<high){const mid=(low+high)>>1;if(t.times[mid]<=time)low=mid;else high=mid;}
 if(time<=t.times[0])return t.values[0];if(time>=t.times.at(-1))return t.values.at(-1);
 if(t.interpolation==='STEP')return t.values[low];
 const f=(time-t.times[low])/(t.times[high]-t.times[low]);
 if(t.path==='rotation')return new Quaternion(...t.values[low]).slerp(new Quaternion(...t.values[high]),f).toArray();
 return t.values[low].map((v,k)=>v+(t.values[high][k]-v)*f);
}
assert.equal(registry.entries.length,70);
const ids=new Set(),selectors=new Set(),titles=new Set(),windows=[];
for(const row of registry.entries){
 assert.equal(row.sourceSha256,sourceSha256);assert.equal(row.bytes,bytes.length);assert.ok(!ids.has(row.id));ids.add(row.id);
 assert.equal(row.initialization?.visibilityDelayMs,200);assert.ok(!titles.has(row.title.toLowerCase()));titles.add(row.title.toLowerCase());
 assert.ok(!selectors.has(row.clip.id));selectors.add(row.clip.id);assert.equal(row.clip.index,0);assert.equal(row.clip.durationMs,4000);
 const w=row.clip.sourceWindow;assert.ok(w.start>=0&&w.end>w.start&&w.end<=1);assert.equal(row.posterFrame.progress,w.start);
 const start=Math.round(w.start*100000)/100000*duration,end=Math.round(w.end*100000)/100000*duration;
 let endpointDelta=0,peakDelta=0;
 for(const t of tracks){
  const a=sample(t,start),b=sample(t,end),mid=sample(t,(start+end)/2);
  endpointDelta=Math.max(endpointDelta,...a.map((v,k)=>Math.abs(v-b[k])));
  peakDelta=Math.max(peakDelta,...a.map((v,k)=>Math.abs(v-mid[k])));
 }
 assert.ok(endpointDelta<1e-5,`${row.id}: endpoint drift ${endpointDelta}`);
 windows.push({id:row.id,motionId:row.clip.id,startSeconds:start,endSeconds:end,endpointDelta,midpointMotionDelta:peakDelta});
}
for(let i=1;i<windows.length;i++)assert.ok(windows[i].startSeconds>windows[i-1].endSeconds);
const report={schemaVersion:'reusable-face-catalog-current-audit.v1',status:'PASS_CATALOG_SOURCE_BINDING_AND_IDENTITY_ENDPOINTS',sourceSha256,bytes:bytes.length,entries:windows.length,uniqueDiscoveryTitles:titles.size,initializationVisibilityDelayMs:200,uniqueEmbeddedAssets:1,physicalAnimations:1,weightedRigJoints:json.skins.map(s=>s.joints.length),durationSeconds:duration,sourceBufferModified:false,endpointSampling:'Actual bank at 100000-step native normalized seek precision; all channels compared independently.',maximumEndpointDelta:Math.max(...windows.map(w=>w.endpointDelta)),nativePlaybackQualification:'NOT_EVALUATED_BY_SOURCE_AUDIT',windows};
const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,windows:undefined}));
