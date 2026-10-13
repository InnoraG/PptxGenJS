import {createHash} from 'node:crypto';

const SCHEMA='betterpptx.private-queued-mcp-continuation.v2',LEGACY='betterpptx.private-queued-mcp-continuation.v1';
const keys=['installHash','sessionId','resourceIdentityHash','quotaIdentityHash','authenticated','authenticationBasis'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hash=/^[a-f0-9]{64}$/;
const snapshot=context=>({installHash:context.installHash||'',sessionId:context.sessionId||'',resourceIdentityHash:context.resourceIdentityHash||'',quotaIdentityHash:context.quotaIdentityHash||'',authenticated:context.authenticated===true,authenticationBasis:context.authenticationBasis||''});
function validContext(c){
 if(!c||Object.getPrototypeOf(c)!==Object.prototype||Reflect.ownKeys(c).length!==keys.length)return false;
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(c,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return false;}
 return keys.filter(k=>k!=='authenticated').every(k=>typeof c[k]==='string'&&c[k].length<=512&&!/[\x00-\x1f\x7f]/.test(c[k]))&&typeof c.authenticated==='boolean';
}

// Called only by the engine after its module-private transport capability check.
// No access token, request header, client assertion or authoring flag is stored.
export function captureQueuedMcpContinuation(context,inputDigest,executionDigest=inputDigest){
 const captured=snapshot(context);if(!validContext(captured)||typeof inputDigest!=='string'||!hash.test(inputDigest)||typeof executionDigest!=='string'||!hash.test(executionDigest))throw Object.assign(new Error('Queued MCP context could not be captured.'),{code:'OPERATION_REQUEST_INVALID'});
 return {context:captured,mcpContinuation:{schemaVersion:SCHEMA,inputDigest,executionDigest,contextDigest:digest(captured)}};
}

// The server-owned operation record and fenced claim are the trust boundary.
// A client argument cannot create this envelope or its private capability.
export function isQueuedMcpContinuation(request,operation,inputDigest){
 try{
  const c=request?.context,m=request?.mcpContinuation;
  if(!validContext(c)||!m||Object.getPrototypeOf(m)!==Object.prototype)return false;
  const d=Object.getOwnPropertyDescriptor(m,'schemaVersion');if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return false;
  const fields=d.value===SCHEMA?['schemaVersion','inputDigest','executionDigest','contextDigest']:d.value===LEGACY?['schemaVersion','inputDigest','contextDigest']:null;
  if(!fields||Reflect.ownKeys(m).length!==fields.length)return false;
  for(const key of fields){const d=Object.getOwnPropertyDescriptor(m,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return false;}
  // Durable map field order is not part of the captured context identity.
  // Validate the exact closed context first, then hash its capture order.
  const execution=m.schemaVersion===SCHEMA?m.executionDigest:m.inputDigest;
  return typeof m.inputDigest==='string'&&hash.test(m.inputDigest)&&typeof m.contextDigest==='string'&&hash.test(m.contextDigest)&&typeof execution==='string'&&hash.test(execution)&&execution===inputDigest&&m.inputDigest===operation.inputDigest&&m.contextDigest===digest(snapshot(c))
   &&operation.installHash===String(c.installHash||c.resourceIdentityHash||c.sessionId||'anonymous');
 }catch{return false;}
}
