import { timingSafeEqual } from 'node:crypto'

import { BETTERPPTX_BRAND, BETTERPPTX_PRODUCT } from './branding.mjs'
import { isPublicBlackBoxMode } from './blackbox.mjs'
import { getTelemetrySnapshot } from './telemetry.mjs'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

function enabledEnv(name) {
	return ENABLED_VALUES.has(String(process.env[name] || '').trim().toLowerCase())
}

function valueStatus(ok, text) {
	return { status: ok ? 'ok' : 'warn', text }
}

function stableNumber(value, fallback = 0) {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

function pct(part, whole) {
	if (!whole) return 0
	return Math.round((part / whole) * 1000) / 10
}

function sameSecret(a, b) {
	const left = Buffer.from(String(a || ''))
	const right = Buffer.from(String(b || ''))
	if (!left.length || left.length !== right.length) return false
	return timingSafeEqual(left, right)
}

function bearerToken(req) {
	const auth = String(req.headers.authorization || '')
	return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function isLoopbackRequest(req) {
	const remote = String(req.socket?.remoteAddress || req.ip || '')
	const host = String(req.headers.host || '').split(':')[0].toLowerCase()
	return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' ||
		remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

export function isMissionControlEnabled() {
	return enabledEnv('BETTERPPTX_MISSION_CONTROL') || enabledEnv('BETTERPPTX_ENABLE_MISSION_CONTROL')
}

export function missionControlAccess(req) {
	if (!isMissionControlEnabled()) {
		return { allowed: false, status: 404, code: 'NOT_FOUND', message: 'not found' }
	}
	const token = String(process.env.BETTERPPTX_MISSION_CONTROL_TOKEN || '').trim()
	if (token) {
		const supplied = String(req.headers['x-betterpptx-mission-control-token'] || '').trim() || bearerToken(req)
		if (sameSecret(supplied, token)) return { allowed: true, mode: 'app-token' }
		return { allowed: false, status: 403, code: 'FORBIDDEN', message: 'mission control authentication required' }
	}
	if (enabledEnv('BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM')) {
		return { allowed: true, mode: 'private-iam' }
	}
	if (isLoopbackRequest(req)) {
		return { allowed: true, mode: 'loopback' }
	}
	return { allowed: false, status: 404, code: 'NOT_FOUND', message: 'not found' }
}

export function missionControlAdminAccess(req) {
	const access = missionControlAccess(req)
	if (!access.allowed) return access
	const token = String(process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN || '').trim()
	if (!token) {
		return { allowed: false, status: 403, code: 'MC_ADMIN_DISABLED', message: 'Mission Control admin token is not configured.' }
	}
	const supplied = String(req.headers['x-betterpptx-mission-control-admin-token'] || '').trim()
	if (sameSecret(supplied, token)) return { ...access, admin: true, adminMode: 'owner-token' }
	return { allowed: false, status: 403, code: 'MC_ADMIN_REQUIRED', message: 'Mission Control owner admin token required.' }
}

export function sendMissionControlDenied(res, access) {
	res.setHeader('Cache-Control', 'no-store')
	return res.status(access.status || 404).json({ error: { code: access.code || 'NOT_FOUND', message: access.message || 'not found' } })
}

function topToolStats(byTool, limit = 8) {
	return Object.entries(byTool || {})
		.map(([name, stat]) => ({
			name,
			calls: stableNumber(stat.calls),
			successes: stableNumber(stat.successes),
			errors: stableNumber(stat.errors),
			replays: stableNumber(stat.replays),
			avgDurationMs: stableNumber(stat.avgDurationMs),
			maxDurationMs: stableNumber(stat.maxDurationMs),
		}))
		.sort((a, b) => b.calls - a.calls || b.errors - a.errors || a.name.localeCompare(b.name))
		.slice(0, limit)
}

function objectEntries(obj, limit = 12) {
	return Object.entries(obj || {})
		.map(([name, count]) => ({ name, count: stableNumber(count) }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
		.slice(0, limit)
}

function buildGates({ telemetry }) {
	const blackBox = isPublicBlackBoxMode()
	const genericFetchBlocked = process.env.BETTERPPTX_ENABLE_GENERIC_HTTP_FETCH !== '1'
	const sharedStoresRequired = process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1'
	const gcsArtifacts = process.env.BETTERPPTX_ARTIFACT_STORE === 'gcs'
	const firestoreEntitlements = process.env.BETTERPPTX_ENTITLEMENT_STORE === 'firestore'
	const firestoreBilling = process.env.BETTERPPTX_BILLING_LEDGER_STORE === 'firestore'
	const dodoTest = process.env.BETTERPPTX_DODO_ENVIRONMENT === 'test'
	const ownerSecretControls = Boolean(String(process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN || '').trim())
	return [
		{ id: 'private-staging', name: 'Private staging access', status: 'ok', detail: 'Protected before the app by the private operator access layer.' },
		{ id: 'black-box', name: 'Public black-box contract', status: blackBox ? 'ok' : 'warn', detail: blackBox ? 'Public responses stay product-facing.' : 'Black-box mode is not enabled on this runtime.' },
		{ id: 'safe-fetch', name: 'Fetch policy', status: genericFetchBlocked ? 'ok' : 'warn', detail: genericFetchBlocked ? 'Generic fetch is blocked; media/image fetch uses safe URL validation.' : 'Generic HTTP fetch is enabled.' },
		{ id: 'shared-artifacts', name: 'Shared artifact delivery', status: sharedStoresRequired && gcsArtifacts ? 'ok' : 'warn', detail: sharedStoresRequired && gcsArtifacts ? 'Shared artifact store required and active.' : 'Shared artifact enforcement is incomplete.' },
		{ id: 'entitlements', name: 'Shared entitlements', status: sharedStoresRequired && firestoreEntitlements ? 'ok' : 'warn', detail: sharedStoresRequired && firestoreEntitlements ? 'Entitlement state uses shared storage.' : 'Entitlement state is not fully shared.' },
		{ id: 'billing-ledger', name: 'Billing ledger', status: firestoreBilling && dodoTest ? 'ok' : 'warn', detail: firestoreBilling && dodoTest ? 'Dodo test-mode ledger is backed by shared storage.' : 'Billing ledger/provider state needs review.' },
		{ id: 'owner-secret-controls', name: 'Owner secret controls', status: ownerSecretControls ? 'ok' : 'warn', detail: ownerSecretControls ? 'MC2 reveal, update, rotate, and test controls are installed behind owner admin auth.' : 'MC2 routes are installed, but the owner admin token is not configured.' },
		{ id: 'telemetry', name: 'Privacy-safe telemetry', status: 'ok', detail: `${telemetry.toolCalls} tool calls, ${telemetry.downloads} downloads, no raw deck payloads exposed here.` },
		{ id: 'cross-instance-state', name: 'Cross-instance edit state', status: 'pending', detail: 'Keep max instances at 1 until deck/session/idempotency state is shared or proven unnecessary.' },
		{ id: 'public-domain', name: 'Public endpoint and domain', status: 'deferred', detail: 'Wait for deployed staging stress approval before domain/public rollout.' },
		{ id: 'live-billing', name: 'Live billing switch', status: 'deferred', detail: 'Keep live Dodo product/pricing switch behind owner approval after test-mode validation.' },
	]
}

function buildDecisions() {
	const genericFetchBlocked = process.env.BETTERPPTX_ENABLE_GENERIC_HTTP_FETCH !== '1'
	return [
		{
			id: 'mc2',
			severity: 'info',
			title: 'MC2 owner controls are private',
			detail: 'Billing-critical secrets have allowlisted reveal, update, rotate, and test routes behind owner admin auth.',
			nextAction: 'Keep public/live launch gated until owner approval.',
		},
		{
			id: 'stress',
			severity: 'warn',
			title: 'Stress while max instances stays 1',
			detail: 'The current process owns live deck/session objects, so horizontal scaling must wait.',
			nextAction: 'Run the deployed stress harness and decide A7.1 afterward.',
		},
		{
			id: 'fetch',
			severity: genericFetchBlocked ? 'info' : 'warn',
			title: 'Fetch surface',
			detail: genericFetchBlocked ? 'Generic fetch is blocked; only safe media/image fetches are expected.' : 'Generic fetch is enabled and should be disabled before public exposure.',
			nextAction: genericFetchBlocked ? 'Keep current policy for public staging.' : 'Disable generic fetch.',
		},
	]
}

export function buildMissionControlSnapshot({ sessions, visibleTools = [], authMode = 'unknown', mcpPath = '/mcp', accessMode = 'unknown' } = {}) {
	const telemetry = getTelemetrySnapshot()
	const toolCalls = stableNumber(telemetry.toolCalls)
	const toolSuccesses = stableNumber(telemetry.toolSuccesses)
	const downloads = stableNumber(telemetry.downloads)
	const downloadErrors = stableNumber(telemetry.downloadErrors)
	const uptimeSeconds = Math.max(0, Math.round((Date.now() - Date.parse(telemetry.startedAt)) / 1000))
	const billing = telemetry.billing || {}
	const mcTokenConfigured = Boolean(String(process.env.BETTERPPTX_MISSION_CONTROL_TOKEN || '').trim())
	const mcAdminTokenConfigured = Boolean(String(process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN || '').trim())
	return {
		ok: true,
		mode: 'MC2_OWNER_SECRET_CONTROLS',
		generatedAt: new Date().toISOString(),
		product: {
			brand: BETTERPPTX_BRAND,
			name: BETTERPPTX_PRODUCT,
			stage: process.env.BETTERPPTX_DEPLOYMENT_STAGE || process.env.BETTERPPTX_ENV || 'staging',
			revision: process.env.K_REVISION || process.env.BETTERPPTX_BUILD_MARKER || 'local',
		},
		service: {
			status: 'ok',
			uptimeSeconds,
			authMode,
			mcpPath,
			activeSessions: sessions?.size || 0,
			visibleToolCount: Array.isArray(visibleTools) ? visibleTools.length : 0,
			blackBoxMode: isPublicBlackBoxMode(),
			missionControlAccess: mcTokenConfigured ? 'app-token' : accessMode,
		},
		metrics: {
			toolCalls,
			toolSuccesses,
			toolErrors: stableNumber(telemetry.toolErrors),
			toolSuccessRatePct: pct(toolSuccesses, toolCalls),
			idempotentReplays: stableNumber(telemetry.idempotentReplays),
			idempotencyConflicts: stableNumber(telemetry.idempotencyConflicts),
			artifactsSaved: stableNumber(telemetry.artifactsSaved),
			downloads,
			downloadErrors,
			downloadSuccessRatePct: pct(downloads, downloads + downloadErrors),
			authActivations: stableNumber(telemetry.auth?.activations),
			authActivationFailures: stableNumber(telemetry.auth?.activationFailures),
			dryRunBillingOps: stableNumber(billing.operations),
			dryRunEstimatedCredits: stableNumber(billing.estimatedCredits),
		},
		breakdowns: {
			topTools: topToolStats(telemetry.byTool),
			errorCodes: objectEntries(telemetry.byErrorCode),
			artifactBytes: objectEntries(telemetry.artifactBytes),
			billingByCategory: objectEntries(billing.byCategory),
		},
		security: {
			blackBoxMode: valueStatus(isPublicBlackBoxMode(), isPublicBlackBoxMode() ? 'enabled' : 'disabled'),
			genericFetch: valueStatus(process.env.BETTERPPTX_ENABLE_GENERIC_HTTP_FETCH !== '1', process.env.BETTERPPTX_ENABLE_GENERIC_HTTP_FETCH === '1' ? 'enabled' : 'blocked'),
			payloadLogging: valueStatus(process.env.BETTERPPTX_LOG_PAYLOADS !== '1', process.env.BETTERPPTX_LOG_PAYLOADS === '1' ? 'enabled' : 'disabled'),
			pathLogging: valueStatus(process.env.BETTERPPTX_LOG_PATHS !== '1', process.env.BETTERPPTX_LOG_PATHS === '1' ? 'enabled' : 'disabled'),
			secretOwnerControls: valueStatus(mcAdminTokenConfigured, mcAdminTokenConfigured ? 'owner-admin actions enabled' : 'routes installed; owner admin token missing'),
		},
		gates: buildGates({ telemetry }),
		decisions: buildDecisions(),
	}
}

export function renderMissionControlPage() {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${BETTERPPTX_BRAND} Mission Control</title>
<style>
:root{--bg:#0b1020;--panel:#111827;--panel2:#151f33;--line:#263247;--text:#e5eefc;--muted:#95a3b8;--ok:#2dd4bf;--warn:#fbbf24;--bad:#fb7185;--info:#60a5fa}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Inter,Segoe UI,Arial,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;border-bottom:1px solid var(--line);background:#0f172a}
.brand{font-weight:800;font-size:18px}.brand small{display:block;color:var(--muted);font-weight:500;font-size:12px}
button{border:1px solid var(--line);background:#172033;color:var(--text);border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer}
main{padding:20px;max-width:1400px;margin:0 auto}.topline{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.pill{border:1px solid var(--line);border-radius:999px;padding:6px 10px;color:var(--muted);background:#0f172a}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.wide{grid-column:span 2}.full{grid-column:1/-1}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;min-width:0}
h1,h2{margin:0}h2{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.metric{font-size:26px;font-weight:800}.label{color:var(--muted);font-size:12px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.info{color:var(--info)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:12px;font-weight:700}td small{color:var(--muted)}
.gate,.decision,.secrow{display:grid;grid-template-columns:160px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.gate:last-child,.decision:last-child,.secrow:last-child{border-bottom:0}
.status{font-weight:800}.empty{color:var(--muted);padding:12px 0}
.secretbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.secretbar input{min-width:280px;flex:1;border:1px solid var(--line);background:#0b1220;color:var(--text);border-radius:8px;padding:9px 10px}
.secretrow{display:grid;grid-template-columns:210px 1fr 250px;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.secretrow:last-child{border-bottom:0}.secretmeta{color:var(--muted);font-size:12px}.secret-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.secret-actions button{padding:7px 9px}.secret-output{grid-column:1/-1}.reveal{white-space:pre-wrap;word-break:break-all;background:#060b16;border:1px solid var(--line);border-radius:8px;padding:10px;margin:6px 0 0;color:var(--text)}
@media (max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wide{grid-column:1/-1}}@media (max-width:620px){header{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.gate,.decision,.secrow{grid-template-columns:1fr}}
@media (max-width:760px){.secretrow{grid-template-columns:1fr}.secret-actions{justify-content:flex-start}.secretbar input{min-width:0}}
</style>
</head>
<body>
<header>
  <div class="brand">${BETTERPPTX_BRAND}<small>Mission Control - MC2 private</small></div>
  <button id="refresh" type="button">Refresh</button>
</header>
<main>
  <div class="topline" id="topline"></div>
  <div class="grid">
    <section><h2>Tool Calls</h2><div class="metric" id="toolCalls">-</div><div class="label" id="toolRate">-</div></section>
    <section><h2>Artifacts</h2><div class="metric" id="artifacts">-</div><div class="label" id="downloads">-</div></section>
    <section><h2>Sessions</h2><div class="metric" id="sessions">-</div><div class="label" id="uptime">-</div></section>
    <section><h2>Billing Dry Run</h2><div class="metric" id="billing">-</div><div class="label" id="credits">-</div></section>
    <section class="wide"><h2>Launch Gates</h2><div id="gates"></div></section>
    <section class="wide"><h2>Current Decisions</h2><div id="decisions"></div></section>
    <section class="wide"><h2>Top Tools</h2><div id="topTools"></div></section>
    <section class="wide"><h2>Security</h2><div id="security"></div></section>
    <section class="full"><h2>Owner Secrets</h2><div class="secretbar"><input id="adminToken" type="password" autocomplete="off" placeholder="Owner admin token"><button id="reloadSecrets" type="button">Reload</button></div><div id="ownerSecrets"></div></section>
    <section class="wide"><h2>Error Codes</h2><div id="errors"></div></section>
    <section class="wide"><h2>Artifact Sizes</h2><div id="sizes"></div></section>
  </div>
</main>
<script>
const cls=s=>s==='ok'?'ok':s==='pending'||s==='deferred'?'warn':s==='warn'?'warn':s==='bad'?'bad':'info';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSecs=s=>{s=Number(s)||0;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?(h+'h '+m+'m'):(m+'m');};
function table(rows,cols){if(!rows||!rows.length)return '<div class="empty">No data yet.</div>';return '<table><thead><tr>'+cols.map(c=>'<th>'+c.label+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+String(c.value(r)??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function render(data){
 document.getElementById('topline').innerHTML=[
  ['Stage',data.product.stage],['Revision',data.product.revision],['Mode',data.mode],['Generated',new Date(data.generatedAt).toLocaleString()],['MC Access',data.service.missionControlAccess],['Tools',data.service.visibleToolCount]
 ].map(x=>'<span class="pill"><b>'+x[0]+':</b> '+x[1]+'</span>').join('');
 document.getElementById('toolCalls').textContent=data.metrics.toolCalls;
 document.getElementById('toolRate').textContent=data.metrics.toolSuccessRatePct+'% success · '+data.metrics.toolErrors+' errors · '+data.metrics.idempotentReplays+' replays';
 document.getElementById('artifacts').textContent=data.metrics.artifactsSaved;
 document.getElementById('downloads').textContent=data.metrics.downloads+' downloads · '+data.metrics.downloadSuccessRatePct+'% success';
 document.getElementById('sessions').textContent=data.service.activeSessions;
 document.getElementById('uptime').textContent='uptime '+fmtSecs(data.service.uptimeSeconds)+' · '+(data.service.blackBoxMode?'black-box':'diagnostic');
 document.getElementById('billing').textContent=data.metrics.dryRunBillingOps;
 document.getElementById('credits').textContent=data.metrics.dryRunEstimatedCredits+' estimated credits';
 document.getElementById('gates').innerHTML=data.gates.map(g=>'<div class="gate"><div class="status '+cls(g.status)+'">'+g.status.toUpperCase()+'</div><div><b>'+g.name+'</b><br><small>'+g.detail+'</small></div></div>').join('');
 document.getElementById('decisions').innerHTML=data.decisions.map(d=>'<div class="decision"><div class="'+cls(d.severity)+'">'+d.severity.toUpperCase()+'</div><div><b>'+d.title+'</b><br><small>'+d.detail+' Next: '+d.nextAction+'</small></div></div>').join('');
 document.getElementById('topTools').innerHTML=table(data.breakdowns.topTools,[{label:'Tool',value:r=>r.name},{label:'Calls',value:r=>r.calls},{label:'Errors',value:r=>r.errors},{label:'Avg ms',value:r=>r.avgDurationMs}]);
 document.getElementById('errors').innerHTML=table(data.breakdowns.errorCodes,[{label:'Code',value:r=>r.name},{label:'Count',value:r=>r.count}]);
 document.getElementById('sizes').innerHTML=table(data.breakdowns.artifactBytes,[{label:'Bucket',value:r=>r.name},{label:'Count',value:r=>r.count}]);
 document.getElementById('security').innerHTML=Object.entries(data.security).map(([k,v])=>'<div class="secrow"><div class="status '+cls(v.status)+'">'+k+'</div><div>'+v.text+'</div></div>').join('');
}
function renderSecrets(data){
 const box=document.getElementById('ownerSecrets');
 const secrets=(data&&data.secrets)||[];
 if(!secrets.length){box.innerHTML='<div class="empty">No owner secrets reported.</div>';return;}
 box.innerHTML=secrets.map(s=>{
  const actions=s.actions||{};
  const buttons=[
   actions.test?'<button type="button" data-action="test" data-secret="'+esc(s.id)+'">Test</button>':'',
   actions.reveal?'<button type="button" data-action="reveal" data-secret="'+esc(s.id)+'">Reveal</button>':'',
   actions.update?'<button type="button" data-action="update" data-secret="'+esc(s.id)+'">Update</button>':'',
   actions.rotate?'<button type="button" data-action="rotate" data-secret="'+esc(s.id)+'">Rotate</button>':''
  ].join('');
  const version=s.activeVersion?('v'+esc(s.activeVersion)):'no active version';
  const rotated=s.lastRotationTime?new Date(s.lastRotationTime).toLocaleString():'unknown rotation time';
  const source=s.source?(esc(s.source.type)+': '+esc(s.source.secretName||s.source.envName||'')):'unknown source';
  const error=s.error?('<br><span class="bad">'+esc(s.error.code)+': '+esc(s.error.message)+'</span>'):'';
  return '<div class="secretrow"><div><div class="status '+cls(s.status)+'">'+esc(s.status).toUpperCase()+'</div><div class="secretmeta">'+esc(s.kind)+'</div></div><div><b>'+esc(s.displayName)+'</b><br><span class="secretmeta">'+source+' · '+version+' · '+rotated+' · '+esc(s.fingerprint||'no fingerprint')+'</span>'+error+'</div><div class="secret-actions">'+buttons+'</div><div class="secret-output" data-output="'+esc(s.id)+'"></div></div>';
 }).join('');
}
function secretHeaders(){
 const token=document.getElementById('adminToken').value||'';
 const headers={'Content-Type':'application/json'};
 if(token)headers['x-betterpptx-mission-control-admin-token']=token;
 return headers;
}
async function secretPost(id,action,body){
 const r=await fetch('/ops/mission-control/secrets/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:secretHeaders(),body:JSON.stringify(body||{}),cache:'no-store'});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error((data.error&&data.error.code)||('HTTP '+r.status));
 return data;
}
async function loadSecrets(){
 const r=await fetch('/ops/mission-control/secrets',{cache:'no-store'});
 if(!r.ok)throw new Error('Owner secrets failed: '+r.status);
 renderSecrets(await r.json());
}
async function refresh(){const r=await fetch('/ops/mission-control/data',{cache:'no-store'});if(!r.ok)throw new Error('Mission Control data failed: '+r.status);render(await r.json());await loadSecrets().catch(e=>{document.getElementById('ownerSecrets').innerHTML='<div class="bad">'+esc(e.message)+'</div>'})}
document.getElementById('refresh').addEventListener('click',refresh);
document.getElementById('reloadSecrets').addEventListener('click',()=>loadSecrets().catch(e=>{document.getElementById('ownerSecrets').innerHTML='<div class="bad">'+esc(e.message)+'</div>'}));
document.getElementById('ownerSecrets').addEventListener('click',async e=>{
 const btn=e.target.closest('button[data-action][data-secret]'); if(!btn)return;
 const id=btn.getAttribute('data-secret'), action=btn.getAttribute('data-action'), out=document.querySelector('[data-output="'+CSS.escape(id)+'"]');
 try{
  if(action==='test'){const j=await secretPost(id,'test',{});out.innerHTML='<pre class="reveal">'+esc(JSON.stringify(j.test,null,2))+'</pre>';return;}
  if(action==='reveal'){const confirmText=prompt('Type REVEAL '+id);if(confirmText===null)return;const j=await secretPost(id,'reveal',{confirm:confirmText});out.innerHTML='<pre class="reveal">'+esc(j.value||'')+'</pre>';return;}
  if(action==='update'){const value=prompt('New value for '+id);if(value===null)return;const confirmText=prompt('Type UPDATE '+id);if(confirmText===null)return;await secretPost(id,'update',{value,confirm:confirmText});await loadSecrets();return;}
  if(action==='rotate'){const confirmText=prompt('Type ROTATE '+id);if(confirmText===null)return;await secretPost(id,'rotate',{confirm:confirmText});await loadSecrets();return;}
 }catch(err){out.innerHTML='<pre class="reveal bad">'+esc(err.message||err)+'</pre>';}
});
refresh().catch(e=>{document.querySelector('main').innerHTML='<section><h2>Error</h2><div class="bad">'+e.message+'</div></section>'});
setInterval(()=>refresh().catch(()=>{}),10000);
</script>
</body>
</html>`
}
