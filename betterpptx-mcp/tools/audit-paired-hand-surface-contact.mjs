// Private review audit: paired-hand finite surface contact measured on the
// actual emitted deck bytes. Reads each slide's embedded model and the exact
// Float32 animation keys that PowerPoint plays, skins every indexed triangle in
// the common composed scene frame (hand-height units, H=1) and measures
// inter-hand triangle crossings, volumetric penetration depth, clearance and
// named contact-region witnesses at sampled times. Sampled, not continuous.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {Matrix4,Quaternion,Vector3} from 'three';
import {parseGlb} from '../ir/kinetic-transplant.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const WIDTH={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const READ={5120:['readInt8',1],5121:['readUInt8',1],5122:['readInt16LE',2],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]};
const NORM={5120:127,5121:255,5122:32767,5123:65535};

function accessor(json,bin,id){
 const a=json.accessors[id],v=json.bufferViews[a.bufferView],n=WIDTH[a.type],[method,size]=READ[a.componentType];
 if(a.sparse)throw Error('Sparse accessors unsupported');
 const stride=v.byteStride??n*size,start=(v.byteOffset??0)+(a.byteOffset??0),scale=a.normalized?NORM[a.componentType]:1;
 const out=new Float64Array(a.count*n);
 for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out[i*n+k]=bin[method](start+i*stride+k*size)/scale;
 return {count:a.count,n,data:out};
}

// Material and joint names map to coarse review regions; names are only
// labels for attribution, never inputs to the geometry measurement itself.
function materialTag(name=''){const s=name.toLowerCase();if(s.includes('blue'))return 'sleeve';if(s.includes('chemise')||s.includes('cuff'))return 'cuff';if(s.includes('wrist'))return 'wrist';if(s.includes('yellow')||s.includes('skin'))return 'skin';return 'nail';}
const DIGITS=['thumb','index','middle','ring','little'];
function jointRegion(names){
 for(const raw of names){
  const s=raw.toLowerCase();
  const digit=DIGITS.find(d=>s.includes(d));
  if(digit){
   const curve=s.match(/curve_(\d+)/);
   let seg='proximal';
   if(curve)seg=Number(curve[1])>=11?'distal':Number(curve[1])>=5?'middle':'proximal';
   else if(s.endsWith('_dip')||s.endsWith('thumb_ip')||s.includes('thumb_ip'))seg='distal';
   else if(s.endsWith('_pip')||s.endsWith('thumb_mcp'))seg='middle';
   return digit+'-'+seg;
  }
  if(s.endsWith('hand_wrist'))return 'palm';
 }
 return null;
}

/** Load each model slide of a built deck: notes JSON, embedded GLB, animation index. */
export async function loadDeckScenes(pptxBytes){
 const zip=await JSZip.loadAsync(pptxBytes),media=new Map();
 for(const name of Object.keys(zip.files).filter(n=>n.startsWith('ppt/media/')&&n.endsWith('.glb'))){const b=Buffer.from(await zip.file(name).async('nodebuffer'));media.set(sha(b),{name,bytes:b});}
 const out=[];
 const notes=Object.keys(zip.files).filter(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
 for(const n of notes){
  const xml=await zip.file(n).async('string');
  let meta;
  for(const para of xml.split('</a:p>')){
   const text=[...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]).join('').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
   if(!text.startsWith('{'))continue;
   try{meta=JSON.parse(text);break;}catch{}
  }
  if(!meta?.motionId||!meta.sharedNativeBankSha256)continue;
  const m=media.get(meta.sharedNativeBankSha256);if(!m)throw Error('Embedded bank missing for '+meta.motionId);
  out.push({motionId:meta.motionId,animationIndex:meta.animationIndex,bankSha256:meta.sharedNativeBankSha256,mediaName:m.name,glbBytes:m.bytes,nativeTiming:meta.nativeTiming,durationMs:meta.canonicalRecipe?.durationMs,notesSlide:n});
 }
 return out;
}

/** Prepare a skinned evaluator for one embedded animation of a GLB. */
export function createSceneEvaluator(glbBytes,animationIndex=0,{includeUV=false}={}){
 const {json,bin}=parseGlb(glbBytes),parents=new Int32Array(json.nodes.length).fill(-1);
 json.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>{parents[c]=i;}));
 const anim=json.animations[animationIndex];
 const tracks=anim.channels.map(c=>{const s=anim.samplers[c.sampler],input=accessor(json,bin,s.input),output=accessor(json,bin,s.output);if(!['LINEAR','STEP',undefined].includes(s.interpolation))throw Error('Unsupported interpolation '+s.interpolation);return {node:c.target.node,path:c.target.path,step:s.interpolation==='STEP',times:input.data,values:output.data,n:output.n};});
 const keyTimes=[...new Set(tracks.flatMap(t=>[...t.times]))].sort((a,b)=>a-b);
 const stageOf=i=>{for(let k=i;k>=0;k=parents[k]){const name=json.nodes[k].name??'';if(name.endsWith('_stage'))return name.slice(0,-6);}return null;};
 const nameChain=i=>{const out=[];for(let k=i;k>=0;k=parents[k])out.push(json.nodes[k].name??'');return out;};
 // Participants: stage ancestor of each skin's joints.
 const hands=new Map();
 json.nodes.forEach((owner,ni)=>{
  if(owner.mesh===undefined)return;
  const skin=json.skins[owner.skin],ib=accessor(json,bin,skin.inverseBindMatrices),stage=stageOf(skin.joints[0]);
  if(!stage)throw Error('Mesh without participant stage');
  const inverse=skin.joints.map((_,i)=>new Matrix4().fromArray(Array.from(ib.data.subarray(i*16,i*16+16))));
  const jointRegions=skin.joints.map(j=>jointRegion(nameChain(j)));
  for(const p of json.meshes[owner.mesh].primitives){
   const pos=accessor(json,bin,p.attributes.POSITION),ids=accessor(json,bin,p.attributes.JOINTS_0),w=accessor(json,bin,p.attributes.WEIGHTS_0),ix=accessor(json,bin,p.indices),mat=materialTag(json.materials?.[p.material]?.name);
   const used=[...new Set(ix.data)].sort((a,b)=>a-b),remap=new Map(used.map((v,i)=>[v,i]));
   const h=hands.get(stage)??{id:stage,parts:[]};hands.set(stage,h);
   const region=used.map(v=>{let best=-1,bw=-1;for(let k=0;k<4;k++){const ww=w.data[v*4+k];if(ww>bw){bw=ww;best=ids.data[v*4+k];}}return jointRegions[best]??'palm';});
   const uv=includeUV&&p.attributes.TEXCOORD_0!==undefined?accessor(json,bin,p.attributes.TEXCOORD_0):null;
   h.parts.push({joints:skin.joints,inverse,material:mat,rows:used,pos,ids,w,uv,tris:Uint32Array.from(ix.data,v=>remap.get(v)),region});
  }
 });
 const participants=[...hands.values()];
 for(const h of participants){
  h.vertexCount=h.parts.reduce((s,p)=>s+p.rows.length,0);
  h.triCount=h.parts.reduce((s,p)=>s+p.tris.length/3,0);
  h.tris=new Uint32Array(h.triCount*3);h.triMaterial=[];h.vertexRegion=[];h.vertexMaterial=[];
  if(includeUV){h.vertexUV=new Float32Array(h.vertexCount*2);let offset=0;for(const part of h.parts)for(const row of part.rows){h.vertexUV[offset++]=part.uv?.data[row*2]??0;h.vertexUV[offset++]=part.uv?.data[row*2+1]??0;}}
  let vo=0,to=0;for(const p of h.parts){for(let i=0;i<p.tris.length;i++)h.tris[to*3+i]=p.tris[i]+vo;for(let i=0;i<p.tris.length/3;i++)h.triMaterial.push(p.material);for(let i=0;i<p.rows.length;i++){h.vertexRegion.push(p.region[i]);h.vertexMaterial.push(p.material);}vo+=p.rows.length;to+=p.tris.length/3;}
 }
 function trsAt(t){
  const tr=json.nodes.map(n=>({translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1],matrix:n.matrix}));
  for(const k of tracks){const T=k.times,N=T.length,n=k.n;let v;
   if(t<=T[0])v=Array.from(k.values.subarray(0,n));else if(t>=T[N-1])v=Array.from(k.values.subarray((N-1)*n,N*n));
   else{let lo=0,hi=N-1;while(hi-lo>1){const m=(lo+hi)>>1;if(T[m]<=t)lo=m;else hi=m;}const a=Array.from(k.values.subarray(lo*n,lo*n+n)),b=Array.from(k.values.subarray(hi*n,hi*n+n));if(k.step)v=a;else{const f=(t-T[lo])/(T[hi]-T[lo]);v=k.path==='rotation'?new Quaternion(...a).slerp(new Quaternion(...b),f).toArray():a.map((x,i)=>x+(b[i]-x)*f);}}
   tr[k.node][k.path]=v;}
  return tr;
 }
 function evaluate(timeSeconds){
  const tr=trsAt(timeSeconds),cache=new Array(json.nodes.length);
  const world=i=>{if(cache[i])return cache[i];const v=tr[i],m=v.matrix?new Matrix4().fromArray(v.matrix):new Matrix4().compose(new Vector3(...v.translation),new Quaternion(...v.rotation),new Vector3(...v.scale));if(parents[i]>=0)m.premultiply(world(parents[i]));cache[i]=m;return m;};
  return participants.map(h=>{
   const P=new Float64Array(h.vertexCount*3);let o=0;
   for(const p of h.parts){const M=p.joints.map((j,i)=>world(j).clone().multiply(p.inverse[i]).elements);
    for(const r of p.rows){const x=p.pos.data[r*3],y=p.pos.data[r*3+1],z=p.pos.data[r*3+2];let X=0,Y=0,Z=0;
     for(let k=0;k<4;k++){const ww=p.w.data[r*4+k];if(!ww)continue;const e=M[p.ids.data[r*4+k]];X+=ww*(e[0]*x+e[4]*y+e[8]*z+e[12]);Y+=ww*(e[1]*x+e[5]*y+e[9]*z+e[13]);Z+=ww*(e[2]*x+e[6]*y+e[10]*z+e[14]);}
     P[o++]=X;P[o++]=Y;P[o++]=Z;}}
   return {id:h.id,P,tris:h.tris,triMaterial:h.triMaterial,vertexRegion:h.vertexRegion,vertexMaterial:h.vertexMaterial,...(includeUV?{vertexUV:h.vertexUV}:{})};
  });
 }
 return {participants:participants.map(h=>({id:h.id,vertexCount:h.vertexCount,triCount:h.triCount})),keyTimes,duration:keyTimes.at(-1),evaluate,animationName:anim.name};
}

import {CELL,triBox,key,buildTriGrid,meshBox,v3,sub,dot,cross,norm,triVerts,triNormal,triTri,closestOnTri,winding,buildWindingTree,fastWinding,nearestTri} from './paired-hand-surface-geometry.mjs';

/** Measure one sampled instant between two participants. */
export function measurePair(a,b,{witnesses=[],touchToleranceH=.0025,clearanceRadiusH=.12}={}){
 const gA=buildTriGrid(a),gB=buildTriGrid(b);
 // 1) Proper finite triangle crossings.
 let crossings=0,coplanar=0;const crossingRegions=new Map();
 const nA=a.tris.length/3;
 for(let i=0;i<nA;i++){const bx=triBox(a.P,a.tris,i),cand=new Set();for(let x=Math.floor(bx[0]/CELL);x<=Math.floor(bx[3]/CELL);x++)for(let y=Math.floor(bx[1]/CELL);y<=Math.floor(bx[4]/CELL);y++)for(let z=Math.floor(bx[2]/CELL);z<=Math.floor(bx[5]/CELL);z++){const l=gB.get(key(x,y,z));if(l)for(const j of l)cand.add(j);}
  if(!cand.size)continue;const A=triVerts(a,i);
  for(const j of cand){const by=triBox(b.P,b.tris,j);if(by[0]>bx[3]||by[3]<bx[0]||by[1]>bx[4]||by[4]<bx[1]||by[2]>bx[5]||by[5]<bx[2])continue;const r=triTri(A,triVerts(b,j));if(r===1){crossings++;const k=a.vertexRegion[a.tris[i*3]]+'/'+a.triMaterial[i]+' x '+b.vertexRegion[b.tris[j*3]]+'/'+b.triMaterial[j];crossingRegions.set(k,(crossingRegions.get(k)??0)+1);}else if(r===2)coplanar++;}}
 // 2) Volumetric penetration: vertices of one participant inside the other.
 const inside=(m,o,go)=>{const box=meshBox(o.P),tree=buildWindingTree(o),res={count:0,maxDepth:0,deepest:null,regions:new Map(),minClearance:Infinity,closest:null};const n=m.P.length/3,pad=.05;
  for(let v=0;v<n;v++){const p=v3(m.P,v);if(p[0]<box[0]-pad||p[0]>box[3]+pad||p[1]<box[1]-pad||p[1]>box[4]+pad||p[2]<box[2]-pad||p[2]>box[5]+pad)continue;
   const inBox=p[0]>=box[0]&&p[0]<=box[3]&&p[1]>=box[1]&&p[1]<=box[4]&&p[2]>=box[2]&&p[2]<=box[5];
   const isInside=inBox&&fastWinding(p,tree,o)>.5;
   const near=nearestTri(p,o,go,isInside?clearanceRadiusH:pad);if(near.tri<0){if(isInside){res.count++;res.maxDepth=Math.max(res.maxDepth,clearanceRadiusH);}continue;}
   if(isInside){res.count++;const k=m.vertexRegion[v]+'/'+m.vertexMaterial[v]+' in '+o.vertexRegion[o.tris[near.tri*3]]+'/'+o.triMaterial[near.tri];res.regions.set(k,Math.max(res.regions.get(k)??0,near.distance));if(near.distance>res.maxDepth){res.maxDepth=near.distance;res.deepest={vertex:v,region:m.vertexRegion[v],material:m.vertexMaterial[v],otherRegion:o.vertexRegion[o.tris[near.tri*3]],otherMaterial:o.triMaterial[near.tri],point:p};}}
   else if(near.distance<res.minClearance){res.minClearance=near.distance;res.closest={region:m.vertexRegion[v],material:m.vertexMaterial[v],otherRegion:o.vertexRegion[o.tris[near.tri*3]],otherMaterial:o.triMaterial[near.tri]};}}
  return res;};
 const ab=inside(a,b,gB),ba=inside(b,a,gA);
 // 3) Named contact-region witnesses: closest surface pair and normals.
 const witness=witnesses.map(w=>{
  // Region-filtered vertex pair search (skin/nail surfaces only), then exact
  // point-to-triangle refinement from the closest few vertices both ways.
  const va=[],vb=[];for(let v=0;v<a.P.length/3;v++)if(w.a.includes(a.vertexRegion[v])&&['skin','nail'].includes(a.vertexMaterial[v]))va.push(v);for(let v=0;v<b.P.length/3;v++)if(w.b.includes(b.vertexRegion[v])&&['skin','nail'].includes(b.vertexMaterial[v]))vb.push(v);
  if(!va.length||!vb.length)return {name:w.name,distanceH:null};
  const pairs=[];for(const i of va){const p=v3(a.P,i);let bd=Infinity,bj=-1;for(const j of vb){const q=b.P,dx=q[j*3]-p[0],dy=q[j*3+1]-p[1],dz=q[j*3+2]-p[2],d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;bj=j;}}pairs.push([bd,i,bj]);}pairs.sort((x,y)=>x[0]-y[0]);
  let best={distance:Infinity};for(const [d2,i,j] of pairs.slice(0,6)){const p=v3(a.P,i),near=nearestTri(p,b,gB,Math.sqrt(d2)+.002);if(near.tri>=0&&near.distance<best.distance)best={distance:near.distance,vertex:i,tri:near.tri,point:p,other:near.point};const q=v3(b.P,j),n2=nearestTri(q,a,gA,Math.sqrt(d2)+.002);if(n2.tri>=0&&n2.distance<best.distance)best={distance:n2.distance,reverse:true,vertex:j,tri:n2.tri,point:q,other:n2.point};}
  if(!Number.isFinite(best.distance))return {name:w.name,distanceH:Math.sqrt(pairs[0][0])};
  // Surface normals at the witness: area-weighted vertex normal of the vertex side, face normal of the other side.
  const vn=(m,v)=>{const s=[0,0,0];const n=m.tris.length/3;for(let i=0;i<n;i++){if(m.tris[i*3]!==v&&m.tris[i*3+1]!==v&&m.tris[i*3+2]!==v)continue;const T=triVerts(m,i),c=cross(sub(T[1],T[0]),sub(T[2],T[0]));s[0]+=c[0];s[1]+=c[1];s[2]+=c[2];}const l=norm(s)||1;return s.map(x=>x/l);};
  const [mv,mo]=best.reverse?[b,a]:[a,b],n1=vn(mv,best.vertex),n2=triNormal(triVerts(mo,best.tri));
  return {name:w.name,distanceH:best.distance,normalDot:dot(n1,n2),pointA:best.reverse?best.other:best.point,pointB:best.reverse?best.point:best.other};});
 const maxDepth=Math.max(ab.maxDepth,ba.maxDepth),interior=ab.count+ba.count,clearance=Math.min(ab.minClearance,ba.minClearance);
 const status=crossings===0&&interior===0?'CLEAR':maxDepth<=touchToleranceH?'TANGENTIAL_CONTACT':'PENETRATION';
 return {status,crossings,coplanarPairs:coplanar,interiorVertices:interior,maxPenetrationDepthH:maxDepth,clearanceH:interior||crossings?0:clearance,
  crossingRegions:Object.fromEntries([...crossingRegions].sort((x,y)=>y[1]-x[1]).slice(0,8)),
  penetratingRegions:Object.fromEntries([...ab.regions,...ba.regions].sort((x,y)=>y[1]-x[1]).slice(0,8).map(([k,v])=>[k,+v.toFixed(5)])),
  deepest:ab.maxDepth>=ba.maxDepth?ab.deepest:ba.deepest,closestRegions:ab.minClearance<=ba.minClearance?ab.closest:ba.closest,witness};
}

// ---------- CPU orthographic review rasterizer (diagnostic, not native proof) ----------
const COLORS={skin:[246,200,40],nail:[255,236,190],cuff:[245,245,245],wrist:[240,210,90],sleeve:[50,100,200]};
export function renderViews(hands,{views,size=240,highlight=[]}={}){
 const W=size*views.length,H=size,img=Buffer.alloc(W*H*3,0);for(let i=0;i<W*H;i++){img[i*3]=23;img[i*3+1]=32;img[i*3+2]=51;}
 // Common bounds across all hands.
 const all=hands.map(h=>meshBox(h.P)),c=[0,1,2].map(k=>(Math.min(...all.map(b=>b[k]))+Math.max(...all.map(b=>b[k+3])))/2),ext=Math.max(...[0,1,2].map(k=>Math.max(...all.map(b=>b[k+3]))-Math.min(...all.map(b=>b[k]))))*.62;
 views.forEach((view,vi)=>{
  const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const project=p=>{let x=p[0]-c[0],y=p[1]-c[1],z=p[2]-c[2];const x1=cy*x+sy*z,z1=-sy*x+cy*z;const y2=cp*y-sp*z1,z2=sp*y+cp*z1;return [x1,y2,z2];};
  const zb=new Float64Array(size*size).fill(-Infinity),light=[.3,.5,.81];
  hands.forEach((h,hi)=>{const P=h.P,n=h.tris.length/3,Q=new Float64Array(P.length);for(let v=0;v<P.length/3;v++){const q=project(v3(P,v));Q[v*3]=(q[0]/ext*.5+.5)*size;Q[v*3+1]=(.5-q[1]/ext*.5)*size;Q[v*3+2]=q[2];}
   const hl=new Set(highlight[hi]??[]);
   for(let i=0;i<n;i++){const ia=h.tris[i*3],ib=h.tris[i*3+1],ic=h.tris[i*3+2];const A=[Q[ia*3],Q[ia*3+1],Q[ia*3+2]],B=[Q[ib*3],Q[ib*3+1],Q[ib*3+2]],C=[Q[ic*3],Q[ic*3+1],Q[ic*3+2]];
    const nrm=triNormal([project(v3(P,ia)),project(v3(P,ib)),project(v3(P,ic))]),shade=.35+.65*Math.abs(dot(nrm,light));
    let col=COLORS[h.triMaterial[i]]??[200,200,200];if(hi===1&&h.triMaterial[i]==='skin')col=[236,160,30];if(hl.has(ia)||hl.has(ib)||hl.has(ic))col=[230,30,30];
    const minX=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),maxX=Math.min(size-1,Math.ceil(Math.max(A[0],B[0],C[0]))),minY=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),maxY=Math.min(size-1,Math.ceil(Math.max(A[1],B[1],C[1])));
    const area=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);if(Math.abs(area)<1e-12)continue;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x+.5,py=y+.5,w0=((B[0]-px)*(C[1]-py)-(B[1]-py)*(C[0]-px))/area,w1=((C[0]-px)*(A[1]-py)-(C[1]-py)*(A[0]-px))/area,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;const z=w0*A[2]+w1*B[2]+w2*C[2];if(z<=zb[y*size+x])continue;zb[y*size+x]=z;const o=(y*W+vi*size+x)*3;img[o]=col[0]*shade;img[o+1]=col[1]*shade;img[o+2]=col[2]*shade;}}});
 });
 return {width:W,height:H,rgb:img};
}
export function stackImages(rows){const W=Math.max(...rows.map(r=>r.width)),H=rows.reduce((s,r)=>s+r.height,0),rgb=Buffer.alloc(W*H*3);let y0=0;for(const r of rows){for(let y=0;y<r.height;y++)r.rgb.copy(rgb,((y0+y)*W)*3,y*r.width*3,(y+1)*r.width*3);y0+=r.height;}return {width:W,height:H,rgb};}
export function encodePng({width,height,rgb}){
 const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]),c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};
 const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;rgb.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
// Front-view enclosed opening (background pixels not connected to the border).
export function enclosedOpeningFraction(hands,size=200){
 const r=renderViews(hands,{views:[{yaw:0,pitch:0}],size}),bg=i=>r.rgb[i*3]===23&&r.rgb[i*3+1]===32&&r.rgb[i*3+2]===51,seen=new Uint8Array(size*size),stack=[];
 for(let x=0;x<size;x++)for(const y of [0,size-1])stack.push(y*size+x);for(let y=0;y<size;y++)for(const x of [0,size-1])stack.push(y*size+x);
 while(stack.length){const i=stack.pop();if(seen[i]||!bg(i))continue;seen[i]=1;const x=i%size,y=(i/size)|0;if(x>0)stack.push(i-1);if(x<size-1)stack.push(i+1);if(y>0)stack.push(i-size);if(y<size-1)stack.push(i+size);}
 let holes=0;for(let i=0;i<size*size;i++)if(bg(i)&&!seen[i])holes++;return holes/(size*size);
}

// ---------- CLI ----------
const WITNESSES={
 'motion.hand.heart-hands':[{name:'index-tips',a:['index-distal'],b:['index-distal']},{name:'thumb-tips',a:['thumb-distal'],b:['thumb-distal']}],
 'motion.hand.handshake':[{name:'palm-palm',a:['palm'],b:['palm']},{name:'A-fingers-on-B',a:['index-distal','middle-distal','ring-distal','little-distal','index-middle','middle-middle','ring-middle','little-middle'],b:['palm','thumb-proximal','thumb-middle','index-proximal','little-proximal']},{name:'B-fingers-on-A',a:['palm','thumb-proximal','thumb-middle','index-proximal','little-proximal'],b:['index-distal','middle-distal','ring-distal','little-distal','index-middle','middle-middle','ring-middle','little-middle']}],
 // Open/palms-up: the whole-surface clearance is the witness (closest regions reported).
};
if(process.argv[1]?.endsWith('audit-paired-hand-surface-contact.mjs')){
 const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
 const pptx=arg('pptx'),only=arg('only')?.split(','),hz=Number(arg('hz')??50),out=arg('out'),renderDir=arg('render'),label=arg('label')??'audit';
 const bytes=fs.readFileSync(pptx),scenes=(await loadDeckScenes(bytes)).filter(s=>!only||only.includes(s.motionId));
 const report={schema:'private-paired-hand-surface-contact-audit.v1',label,pptx:path.basename(pptx),pptxSha256:sha(bytes),pptxBytes:bytes.length,method:{geometry:'all indexed triangles of every embedded primitive (yellow skin, nails, wrist band, white cuff, blue sleeve), linear-blend skinned from embedded inverse binds',animation:'exact embedded Float32 key samplers; LINEAR translation/scale lerp, rotation slerp (glTF semantics)',frame:'composed scene, hand-height units H=1',crossings:'finite non-coplanar triangle/triangle interval test, all candidate pairs from a 0.025H uniform grid',penetration:'generalized winding number >0.5 for every vertex within 0.12H of the other participant; depth = distance to nearest finite triangle',touchToleranceH:.0025,sampling:`uniform ${hz} Hz plus every embedded key time and key-interval midpoints`,continuous:false},gestures:[]};
 for(const s of scenes){
  const ev=createSceneEvaluator(s.glbBytes,s.animationIndex),D=ev.duration,times=new Set(ev.keyTimes.map(t=>+t.toFixed(6)));
  for(let i=0;i<=Math.round(D*hz);i++)times.add(+Math.min(D,i/hz).toFixed(6));
  for(let i=1;i<ev.keyTimes.length;i++)times.add(+((ev.keyTimes[i-1]+ev.keyTimes[i])/2).toFixed(6));
  const sorted=[...times].sort((a,b)=>a-b),samples=[],t0=Date.now();
  if(process.argv.includes('--validate-winding')){const hs=ev.evaluate(0),[m,o]=hs,tree=buildWindingTree(o),box=meshBox(o.P);let checked=0,mismatch=0,maxErr=0;for(let v=0;v<m.P.length/3&&checked<400;v+=7){const p=v3(m.P,v);if(p[0]<box[0]||p[0]>box[3]||p[1]<box[1]||p[1]>box[4]||p[2]<box[2]||p[2]>box[5])continue;checked++;const e=winding(p,o),f=fastWinding(p,tree,o);maxErr=Math.max(maxErr,Math.abs(e-f));if((e>.5)!==(f>.5))mismatch++;}console.log(JSON.stringify({windingValidation:s.motionId,checked,mismatch,maxAbsError:maxErr}));}
  for(const t of sorted){const [A,B]=ev.evaluate(t),m=measurePair(A,B,{witnesses:WITNESSES[s.motionId]??[]});samples.push({timeMs:+(t*1000).toFixed(3),isKey:ev.keyTimes.some(k=>Math.abs(k-t)<1e-6),...m,witness:m.witness.map(w=>({name:w.name,distanceH:w.distanceH==null?null:+w.distanceH.toFixed(5),normalDot:w.normalDot==null?null:+w.normalDot.toFixed(3)}))});}
  const worst=samples.reduce((w,x)=>x.maxPenetrationDepthH>w.maxPenetrationDepthH?x:w,samples[0]);
  const bad=samples.filter(x=>x.status==='PENETRATION'),touch=samples.filter(x=>x.status==='TANGENTIAL_CONTACT');
  const intervals=[];for(const x of bad){const l=intervals.at(-1);if(l&&x.timeMs-l[1]<=1000/hz+1e-6)l[1]=x.timeMs;else intervals.push([x.timeMs,x.timeMs]);}
  const g={motionId:s.motionId,animationIndex:s.animationIndex,bankSha256:s.bankSha256,animationName:ev.animationName,participants:ev.participants,durationMs:D*1000,keyTimesMs:ev.keyTimes.map(t=>+(t*1000).toFixed(3)),sampleCount:samples.length,elapsedMs:Date.now()-t0,
   summary:{penetratingSamples:bad.length,tangentialSamples:touch.length,clearSamples:samples.length-bad.length-touch.length,maxPenetrationDepthH:worst.maxPenetrationDepthH,worstTimeMs:worst.timeMs,maxCrossings:Math.max(...samples.map(x=>x.crossings)),penetrationIntervalsMs:intervals,heroStartStatus:samples[0].status,heroEndStatus:samples.at(-1).status},samples};
  if(s.motionId==='motion.hand.heart-hands'){const [A,B]=ev.evaluate(0);g.summary.heroFrontEnclosedOpeningFraction=enclosedOpeningFraction([A,B]);}
  report.gestures.push(g);
  console.log(JSON.stringify({gesture:s.motionId,...g.summary,samples:samples.length,elapsedMs:g.elapsedMs}));
  if(renderDir){fs.mkdirSync(renderDir,{recursive:true});const views=[{yaw:0,pitch:0},{yaw:50,pitch:15},{yaw:90,pitch:0},{yaw:0,pitch:75}];const phases=[...new Set([0,...ev.keyTimes.slice(1,-1),worst.timeMs/1000])].sort((a,b)=>a-b).slice(0,12);
   const rows=phases.map(t=>renderViews(ev.evaluate(t),{views,size:200}));
   fs.writeFileSync(path.join(renderDir,label+'-'+s.motionId.replace('motion.hand.','')+'.png'),encodePng(stackImages(rows)));
   g.renderPhasesMs=phases.map(t=>+(t*1000).toFixed(1));g.renderViews=views;}
 }
 if(out){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report));}
}
