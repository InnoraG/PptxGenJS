// Operator-only, idempotent update of the live Keycloak session limits.
// Never prints credentials, tokens, user identifiers or raw admin responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = 'http://127.0.0.1:8180/identity';
const headers = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': 'betterpptx.xmcpx.com',
  'X-Forwarded-Port': '443',
};
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) throw new Error(`Identity policy operation failed: HTTP ${response.status}.`);
  if (response.status === 204) return null;
  return response.json();
}

const password = readFileSync(fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url)), 'utf8').trim();
const login = await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST',
  body: new URLSearchParams({ client_id: 'admin-cli', username: 'bootstrap-owner', password, grant_type: 'password' }),
});
assert.ok(login?.access_token);
const auth = { Authorization: `Bearer ${login.access_token}` };
const realmPath = '/admin/realms/betterpptx';
const readRealm = () => request(realmPath, { headers: auth });
const before = await readRealm();
assert.equal(before.accessTokenLifespan, 300);
assert.equal(before.revokeRefreshToken, true);
assert.equal(before.refreshTokenMaxReuse, 0);
assert.equal(before.browserFlow, 'betterpptx-passkey-only');
assert.ok([1800, 604800].includes(before.ssoSessionIdleTimeout));
assert.ok([28800, 2592000].includes(before.ssoSessionMaxLifespan));
if (before.ssoSessionIdleTimeout !== 604800 || before.ssoSessionMaxLifespan !== 2592000) {
  await request(realmPath, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...before, ssoSessionIdleTimeout: 604800, ssoSessionMaxLifespan: 2592000 }),
  });
}
const after = await readRealm();
assert.equal(after.accessTokenLifespan, 300);
assert.equal(after.ssoSessionIdleTimeout, 604800);
assert.equal(after.ssoSessionMaxLifespan, 2592000);
assert.equal(after.revokeRefreshToken, true);
assert.equal(after.refreshTokenMaxReuse, 0);
assert.equal(after.browserFlow, 'betterpptx-passkey-only');
console.log(JSON.stringify({ status: 'verified', changed: before.ssoSessionIdleTimeout !== after.ssoSessionIdleTimeout || before.ssoSessionMaxLifespan !== after.ssoSessionMaxLifespan, accessTokenSeconds: after.accessTokenLifespan, sessionIdleDays: 7, sessionMaxDays: 30, refreshTokenRotation: 'strict' }));
