// Public product calls only. Verify the complete built-in cohort without
// fetching model buffers, consuming publications, or writing evidence copies.
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const origin=new URL(option('--url')),expected=Number(option('--expected-source-count'));
if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||!Number.isSafeInteger(expected)||expected<1||expected>10000)throw new Error('An HTTPS product origin and explicit expected source count are required.');
const endpoint=new URL('/mcp',origin);let id=0;
async function call(arguments_){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:'betterpptx.authoring.catalog',arguments:arguments_}}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Public catalog request failed (${response.status}).`);
 const raw=await response.text();if(Buffer.byteLength(raw)>1024*1024)throw new Error('The catalog response exceeds the verification budget.');
 let message;try{message=JSON.parse(raw);}catch{
  const messages=raw.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5).trim()));
  message=messages.find(row=>row.id===id);
 }
 const result=message?.result,payload=result?.structuredContent??JSON.parse(result?.content?.find(item=>item.type==='text')?.text??'null');
 if(result?.isError||payload?.ok!==true)throw new Error('The routed catalog tool did not return a successful product result.');
 return payload.data;
}
const reviews=new Set();let offset=0,fingerprint,pages=0,total;
for(;;){
 if(++pages>128)throw new Error('The catalog exceeds the bounded verification page count.');
 const page=await call({view:'motion-comparisons',family:'presenter-motion',offset,limit:16});
 if(page.schemaVersion!=='betterpptx.motion-comparison-page.v1'||!Array.isArray(page.candidates)||page.pagination?.offset!==offset)throw new Error('The routed service does not expose the current motion comparison contract.');
 if(fingerprint===undefined){fingerprint=page.catalogFingerprint;total=page.pagination.total;}
 if(typeof fingerprint!=='string'||page.catalogFingerprint!==fingerprint||page.pagination.total!==total)throw new Error('The routed catalog changed while its cohort was verified.');
 for(const row of page.candidates)if(row.sourceKind==='observed-motion-review'){
  if(!/^cap_[a-f0-9]{20}$/.test(row.catalogId)||reviews.has(row.catalogId))throw new Error('Duplicate or invalid built-in source identity.');
  reviews.add(row.catalogId);
 }
 const next=page.pagination.nextOffset;if(next===null)break;
 if(!Number.isSafeInteger(next)||next<=offset)throw new Error('Invalid public catalog continuation.');offset=next;
}
if(reviews.size!==expected)throw new Error(`The routed catalog exposes ${reviews.size} built-in reviews; expected ${expected}.`);
console.log(JSON.stringify({origin:origin.origin,sourceReviewCount:reviews.size,totalPresenterEntries:total,pages,catalogFingerprint:fingerprint,sourceIdsSha256:createHash('sha256').update([...reviews].sort().join('\n')).digest('hex'),modelBytesRead:0,publicationsConsumed:0}));
