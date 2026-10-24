// Private finite-surface kernels shared by paired-hand surface fitting and the
// paired-hand contact audit. Scene units are hand height H. Float64 throughout.
export const CELL=.025;
export function triBox(P,t,i){const a=t[i*3]*3,b=t[i*3+1]*3,c=t[i*3+2]*3;return [Math.min(P[a],P[b],P[c]),Math.min(P[a+1],P[b+1],P[c+1]),Math.min(P[a+2],P[b+2],P[c+2]),Math.max(P[a],P[b],P[c]),Math.max(P[a+1],P[b+1],P[c+1]),Math.max(P[a+2],P[b+2],P[c+2])];}
export const key=(x,y,z)=>((x+2048)*4096+(y+2048))*4096+(z+2048);
export function buildTriGrid(m){const g=new Map();const n=m.tris.length/3;for(let i=0;i<n;i++){const b=triBox(m.P,m.tris,i);for(let x=Math.floor(b[0]/CELL);x<=Math.floor(b[3]/CELL);x++)for(let y=Math.floor(b[1]/CELL);y<=Math.floor(b[4]/CELL);y++)for(let z=Math.floor(b[2]/CELL);z<=Math.floor(b[5]/CELL);z++){const k=key(x,y,z);let l=g.get(k);if(!l)g.set(k,l=[]);l.push(i);}}return g;}
export function meshBox(P){const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(let i=0;i<P.length;i+=3)for(let k=0;k<3;k++){b[k]=Math.min(b[k],P[i+k]);b[k+3]=Math.max(b[k+3],P[i+k]);}return b;}
export function v3(P,i){return [P[i*3],P[i*3+1],P[i*3+2]];}
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(a[0],a[1],a[2]);
export function triVerts(m,i){return [v3(m.P,m.tris[i*3]),v3(m.P,m.tris[i*3+1]),v3(m.P,m.tris[i*3+2])];}
export function triNormal(T){const n=cross(sub(T[1],T[0]),sub(T[2],T[0])),l=norm(n);return l>0?[n[0]/l,n[1]/l,n[2]/l]:[0,0,0];}

// Non-coplanar triangle/triangle intersection (interval overlap on the plane
// intersection line). Coplanar pairs are counted separately, not as crossings.
export function triTri(A,B){
 const nB=cross(sub(B[1],B[0]),sub(B[2],B[0])),dA=A.map(p=>dot(nB,sub(p,B[0])));
 const sB=Math.max(norm(nB),1e-30),eps=1e-12*sB;
 if((dA[0]>eps&&dA[1]>eps&&dA[2]>eps)||(dA[0]<-eps&&dA[1]<-eps&&dA[2]<-eps))return 0;
 const nA=cross(sub(A[1],A[0]),sub(A[2],A[0])),dB=B.map(p=>dot(nA,sub(p,A[0])));const eA=1e-12*Math.max(norm(nA),1e-30);
 if((dB[0]>eA&&dB[1]>eA&&dB[2]>eA)||(dB[0]<-eA&&dB[1]<-eA&&dB[2]<-eA))return 0;
 const D=cross(nA,nB);if(norm(D)<1e-14*norm(nA)*norm(nB))return 2;
 const interval=(T,d)=>{const p=T.map(x=>dot(D,x)),pts=[];for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(d[i])<=0)pts.push(p[i]);if((d[i]>0&&d[j]<0)||(d[i]<0&&d[j]>0))pts.push(p[i]+(p[j]-p[i])*d[i]/(d[i]-d[j]));}return pts.length?[Math.min(...pts),Math.max(...pts)]:null;};
 const ia=interval(A,dA),ib=interval(B,dB);if(!ia||!ib)return 0;
 return ia[0]<=ib[1]&&ib[0]<=ia[1]?1:0;
}
export function closestOnTri(p,T){
 const [a,b,c]=T,ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return [a[0]+ab[0]*v,a[1]+ab[1]*v,a[2]+ab[2]*v];}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return [a[0]+ac[0]*w,a[1]+ac[1]*w,a[2]+ac[2]*w];}
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return [b[0]+(c[0]-b[0])*w,b[1]+(c[1]-b[1])*w,b[2]+(c[2]-b[2])*w];}
 const den=1/(va+vb+vc),v=vb*den,w=vc*den;return [a[0]+ab[0]*v+ac[0]*w,a[1]+ab[1]*v+ac[1]*w,a[2]+ab[2]*v+ac[2]*w];
}
// Generalized winding number (sum of signed solid angles / 4pi). Robust to the
// open sleeve end and overlapping nail shells; >0.5 means inside the surface.
export function winding(p,m){let s=0;const n=m.tris.length/3,P=m.P,t=m.tris;for(let i=0;i<n;i++){const a0=t[i*3]*3,b0=t[i*3+1]*3,c0=t[i*3+2]*3;const ax=P[a0]-p[0],ay=P[a0+1]-p[1],az=P[a0+2]-p[2],bx=P[b0]-p[0],by=P[b0+1]-p[1],bz=P[b0+2]-p[2],cx=P[c0]-p[0],cy=P[c0+1]-p[1],cz=P[c0+2]-p[2];const la=Math.hypot(ax,ay,az),lb=Math.hypot(bx,by,bz),lc=Math.hypot(cx,cy,cz);const det=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);const den=la*lb*lc+(ax*bx+ay*by+az*bz)*lc+(bx*cx+by*cy+bz*cz)*la+(cx*ax+cy*ay+cz*az)*lb;s+=2*Math.atan2(det,den);}return s/(4*Math.PI);}
export function exactSolid(p,P,t,i){const a0=t[i*3]*3,b0=t[i*3+1]*3,c0=t[i*3+2]*3;const ax=P[a0]-p[0],ay=P[a0+1]-p[1],az=P[a0+2]-p[2],bx=P[b0]-p[0],by=P[b0+1]-p[1],bz=P[b0+2]-p[2],cx=P[c0]-p[0],cy=P[c0+1]-p[1],cz=P[c0+2]-p[2];const la=Math.hypot(ax,ay,az),lb=Math.hypot(bx,by,bz),lc=Math.hypot(cx,cy,cz);const det=ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);const den=la*lb*lc+(ax*bx+ay*by+az*bz)*lc+(bx*cx+by*cy+bz*cz)*la+(cx*ax+cy*ay+cz*az)*lb;return 2*Math.atan2(det,den);}
// Two-level far-field (dipole) approximation of the winding number, exact
// triangle solid angles within 3 cluster radii (Barill et al. style).
export function buildWindingTree(m,leafSize=.04,parentSize=.16){
 const P=m.P,t=m.tris,n=t.length/3,leaves=new Map();
 for(let i=0;i<n;i++){const a=t[i*3]*3,b=t[i*3+1]*3,c=t[i*3+2]*3,cx=(P[a]+P[b]+P[c])/3,cy=(P[a+1]+P[b+1]+P[c+1])/3,cz=(P[a+2]+P[b+2]+P[c+2])/3,k=key(Math.floor(cx/leafSize),Math.floor(cy/leafSize),Math.floor(cz/leafSize));let l=leaves.get(k);if(!l)leaves.set(k,l={tris:[],pk:key(Math.floor(cx/parentSize),Math.floor(cy/parentSize),Math.floor(cz/parentSize))});l.tris.push(i);}
 const summarize=(tris)=>{let N=[0,0,0],C=[0,0,0],A=0;for(const i of tris){const T=triVerts(m,i),av=cross(sub(T[1],T[0]),sub(T[2],T[0])).map(x=>x/2),ar=norm(av)||1e-30;N=[N[0]+av[0],N[1]+av[1],N[2]+av[2]];for(let k=0;k<3;k++)C[k]+=ar*(T[0][k]+T[1][k]+T[2][k])/3;A+=ar;}C=C.map(x=>x/A);let r=0;for(const i of tris)for(const q of triVerts(m,i))r=Math.max(r,norm(sub(q,C)));return {N,C,r,tris};};
 const parents=new Map();for(const l of leaves.values()){let p=parents.get(l.pk);if(!p)parents.set(l.pk,p={leaves:[]});p.leaves.push(summarize(l.tris));}
 return [...parents.values()].map(p=>({...summarize(p.leaves.flatMap(l=>l.tris)),leaves:p.leaves}));
}
export function fastWinding(p,tree,m,beta=3){let s=0;const dip=c=>{const d=sub(c.C,p),l=norm(d);return dot(c.N,d)/(l*l*l);};
 for(const q of tree){const d=norm(sub(q.C,p));if(d>beta*q.r){s+=dip(q);continue;}for(const l of q.leaves){const e=norm(sub(l.C,p));if(e>beta*l.r){s+=dip(l);continue;}for(const i of l.tris)s+=exactSolid(p,m.P,m.tris,i);}}
 return s/(4*Math.PI);}
export function nearestTri(p,m,grid,maxR){
 let best=maxR,bestTri=-1,bestPoint=null;const cx=Math.floor(p[0]/CELL),cy=Math.floor(p[1]/CELL),cz=Math.floor(p[2]/CELL),R=Math.ceil(maxR/CELL),seen=new Set();
 for(let r=0;r<=R;r++){if((r-1)*CELL>best)break;for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++)for(let z=cz-r;z<=cz+r;z++){if(Math.max(Math.abs(x-cx),Math.abs(y-cy),Math.abs(z-cz))!==r)continue;const l=grid.get(key(x,y,z));if(!l)continue;for(const i of l){if(seen.has(i))continue;seen.add(i);const q=closestOnTri(p,triVerts(m,i)),d=norm(sub(p,q));if(d<best){best=d;bestTri=i;bestPoint=q;}}}}
 return {distance:best,tri:bestTri,point:bestPoint};
}

/** Self-clearance of one part of a single mesh: proper non-coplanar crossings
 * between triangles touching the part's vertices and triangles not touching
 * them, excluding pairs that share a vertex. partMask is a Uint8Array per vertex. */
// excludeCoincident skips pairs joined by coincident split vertices (source seams),
// so the count is the nonadjacent crossings the self-clearance audit reports.
export function partSelfCrossings(m,partMask,{excludeCoincident=0}={}){const n=m.tris.length/3,grid=buildTriGrid(m),inPart=i=>partMask[m.tris[i*3]]||partMask[m.tris[i*3+1]]||partMask[m.tris[i*3+2]],P=m.P,near=(u,v)=>Math.abs(P[u*3]-P[v*3])<excludeCoincident&&Math.abs(P[u*3+1]-P[v*3+1])<excludeCoincident&&Math.abs(P[u*3+2]-P[v*3+2])<excludeCoincident;let count=0;
 for(let i=0;i<n;i++){if(!inPart(i))continue;const bx=triBox(m.P,m.tris,i),cand=new Set();for(let x=Math.floor(bx[0]/CELL);x<=Math.floor(bx[3]/CELL);x++)for(let y=Math.floor(bx[1]/CELL);y<=Math.floor(bx[4]/CELL);y++)for(let z=Math.floor(bx[2]/CELL);z<=Math.floor(bx[5]/CELL);z++){const l=grid.get(key(x,y,z));if(l)for(const j of l)cand.add(j);}
  const A=triVerts(m,i),ia=[m.tris[i*3],m.tris[i*3+1],m.tris[i*3+2]];
  for(const j of cand){if(inPart(j))continue;if(ia.includes(m.tris[j*3])||ia.includes(m.tris[j*3+1])||ia.includes(m.tris[j*3+2]))continue;if(excludeCoincident&&ia.some(u=>[0,1,2].some(k=>near(u,m.tris[j*3+k]))))continue;const by=triBox(m.P,m.tris,j);if(by[0]>bx[3]||by[3]<bx[0]||by[1]>bx[4]||by[4]<bx[1]||by[2]>bx[5]||by[5]<bx[2])continue;if(triTri(A,triVerts(m,j))===1)count++;}}
 return count;}
/** Signed finite-surface relation between two triangle meshes {P,tris}:
 * proper non-coplanar triangle crossings, vertices of either mesh inside the
 * other (generalized winding number > 0.5) with depth to the nearest finite
 * triangle, and otherwise the minimum vertex-to-triangle clearance (<= radius). */
export function surfaceSeparation(a,b,{radius=.05,depthRadius=.12,countCrossings=true}={}){
 const gA=buildTriGrid(a),gB=buildTriGrid(b);let crossings=0;
 if(countCrossings){const nA=a.tris.length/3;for(let i=0;i<nA;i++){const bx=triBox(a.P,a.tris,i),cand=new Set();for(let x=Math.floor(bx[0]/CELL);x<=Math.floor(bx[3]/CELL);x++)for(let y=Math.floor(bx[1]/CELL);y<=Math.floor(bx[4]/CELL);y++)for(let z=Math.floor(bx[2]/CELL);z<=Math.floor(bx[5]/CELL);z++){const l=gB.get(key(x,y,z));if(l)for(const j of l)cand.add(j);}if(!cand.size)continue;const A=triVerts(a,i);for(const j of cand){const by=triBox(b.P,b.tris,j);if(by[0]>bx[3]||by[3]<bx[0]||by[1]>bx[4]||by[4]<bx[1]||by[2]>bx[5]||by[5]<bx[2])continue;if(triTri(A,triVerts(b,j))===1)crossings++;}}}
 const one=(m,o,go)=>{const box=meshBox(o.P),tree=buildWindingTree(o);let count=0,depth=0,clearance=Infinity,closestVertex=-1;const n=m.P.length/3;
  for(let v=0;v<n;v++){const p=v3(m.P,v);if(p[0]<box[0]-radius||p[0]>box[3]+radius||p[1]<box[1]-radius||p[1]>box[4]+radius||p[2]<box[2]-radius||p[2]>box[5]+radius)continue;
   const inBox=p[0]>=box[0]&&p[0]<=box[3]&&p[1]>=box[1]&&p[1]<=box[4]&&p[2]>=box[2]&&p[2]<=box[5],inside=inBox&&fastWinding(p,tree,o)>.5,near=nearestTri(p,o,go,inside?depthRadius:radius);
   if(inside){count++;depth=Math.max(depth,near.tri<0?depthRadius:near.distance);}else if(near.tri>=0&&near.distance<clearance){clearance=near.distance;closestVertex=v;}}
  return {count,depth,clearance,closestVertex};};
 const ab=one(a,b,gB),ba=one(b,a,gA),interior=ab.count+ba.count,depth=Math.max(ab.depth,ba.depth);
 return {crossings,interiorVertices:interior,depth,penetrating:interior>0||crossings>0,clearance:interior||crossings?0:Math.min(ab.clearance,ba.clearance),signedClearance:interior||crossings?-Math.max(depth,1e-6):Math.min(ab.clearance,ba.clearance)};
}
