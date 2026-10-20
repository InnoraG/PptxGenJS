// Idempotently create/align Claude's pre-registered CIMD clients (hosted apps
// and Claude Code) as PKCE-S256 public clients. Additive: never reads or writes
// the ChatGPT client or the shared resource scope. Never prints credentials/tokens.
// Optional env for a disposable test realm: IDENTITY_ADMIN_BASE,
// IDENTITY_ADMIN_USER, IDENTITY_ADMIN_PASSWORD_FILE.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  chatgptClientId, claudeCodeClientId, claudeHostedClientId, defaultRedirects,
  fetchClientMetadata, makeClient, validateClaudeMetadata,
} from './provision.mjs';
import { identityPublicOrigin } from './public-origin.mjs';

const base = process.env.IDENTITY_ADMIN_BASE || 'http://127.0.0.1:8180/identity';
const { hostname } = identityPublicOrigin();
const headers = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': hostname,
  'X-Forwarded-Port': '443',
};

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok && response.status !== 204 && response.status !== 201) {
    throw new Error(`Identity administration failed with HTTP ${response.status}.`);
  }
  if (response.status === 204 || response.status === 201) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

const passwordFile = process.env.IDENTITY_ADMIN_PASSWORD_FILE
  || fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url));
const password = readFileSync(passwordFile, 'utf8').trim();
const login = await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: 'admin-cli',
    username: process.env.IDENTITY_ADMIN_USER || 'bootstrap-owner',
    password,
    grant_type: 'password',
  }),
});
assert.ok(login.access_token);
const adminHeaders = { Authorization: `Bearer ${login.access_token}` };
const jsonHeaders = { ...adminHeaders, 'Content-Type': 'application/json' };
const realmPath = '/admin/realms/betterpptx';
const findClient = async clientId => request(
  `${realmPath}/clients?clientId=${encodeURIComponent(clientId)}`, { headers: adminHeaders });

const clientScopes = await request(`${realmPath}/client-scopes`, { headers: adminHeaders });
const resourceScope = clientScopes.find(scope => scope.name === 'betterpptx');
assert.ok(resourceScope?.id, 'Expected the BetterPPTX resource scope.');
const chatgptBefore = JSON.stringify(await findClient(chatgptClientId));

const results = [];
for (const clientId of [claudeHostedClientId, claudeCodeClientId]) {
  const redirects = defaultRedirects(clientId);
  // Pin against the live official document before any write.
  validateClaudeMetadata(await fetchClientMetadata(clientId), clientId, redirects);
  const desired = makeClient(clientId, redirects);
  const existing = await findClient(clientId);
  assert.ok(existing.length <= 1, 'Expected at most one client per CIMD URL.');
  if (existing.length) {
    const current = existing[0];
    await request(`${realmPath}/clients/${encodeURIComponent(current.id)}`, {
      method: 'PUT', headers: jsonHeaders,
      body: JSON.stringify({ ...current, ...desired, id: current.id,
        attributes: { ...(current.attributes ?? {}), ...desired.attributes } }),
    });
  } else {
    await request(`${realmPath}/clients`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(desired) });
  }
  const [client] = await findClient(clientId);
  assert.ok(client?.id);
  // Exactly the BetterPPTX resource scope: no realm-default or optional extras.
  const scopePath = kind => `${realmPath}/clients/${encodeURIComponent(client.id)}/${kind}-client-scopes`;
  for (const kind of ['default', 'optional']) {
    for (const scope of await request(scopePath(kind), { headers: adminHeaders })) {
      if (kind === 'optional' || scope.name !== 'betterpptx') {
        await request(`${scopePath(kind)}/${encodeURIComponent(scope.id)}`, { method: 'DELETE', headers: adminHeaders });
      }
    }
  }
  if (!(await request(scopePath('default'), { headers: adminHeaders })).some(scope => scope.name === 'betterpptx')) {
    await request(`${scopePath('default')}/${encodeURIComponent(resourceScope.id)}`, { method: 'PUT', headers: adminHeaders });
  }
  const [updated] = await findClient(clientId);
  assert.equal(updated.publicClient, true);
  assert.equal(updated.standardFlowEnabled, true);
  assert.equal(updated.implicitFlowEnabled, false);
  assert.equal(updated.directAccessGrantsEnabled, false);
  assert.equal(updated.serviceAccountsEnabled, false);
  assert.equal(updated.fullScopeAllowed, false);
  assert.equal(updated.consentRequired, true);
  assert.equal(updated.attributes['pkce.code.challenge.method'], 'S256');
  assert.deepEqual([...updated.redirectUris].sort(), [...redirects].sort());
  assert.deepEqual((await request(scopePath('default'), { headers: adminHeaders })).map(scope => scope.name), ['betterpptx']);
  assert.deepEqual(await request(scopePath('optional'), { headers: adminHeaders }), []);
  results.push({ clientId, created: !existing.length, redirects: redirects.length });
}
assert.equal(JSON.stringify(await findClient(chatgptClientId)), chatgptBefore, 'The ChatGPT client must be untouched.');
const realm = await request(realmPath, { headers: adminHeaders });
assert.equal(realm.revokeRefreshToken, true, 'Refresh-token rotation must stay on.');
assert.equal(realm.refreshTokenMaxReuse, 0);
console.log(JSON.stringify({
  status: 'activated',
  clients: results,
  tokenEndpointAuthentication: 'none',
  proofKey: 'S256',
  refreshTokenRotation: 'strict',
  chatgptClientUnchanged: true,
  secretPrinted: false,
}, null, 2));
