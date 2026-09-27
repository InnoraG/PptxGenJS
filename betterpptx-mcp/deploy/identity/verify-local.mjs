// Read-only live import verification. Never prints tokens, passwords, or raw admin responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatgptClientId, chatgptJwksUrl } from './provision.mjs';
import { identityPublicOrigin } from './public-origin.mjs';

const base = 'http://127.0.0.1:8180/identity';
const { issuer, origin, hostname } = identityPublicOrigin();
const headers = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': hostname, 'X-Forwarded-Port': '443' };
let token;
let phase = 'discovery';
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`Local verification request failed: HTTP ${response.status}`);
  return response.json();
}
async function admin(path) {
  return request('/admin/realms/betterpptx' + path, { headers: { Authorization: `Bearer ${token}` } });
}
try {
  const discovery = await request('/realms/betterpptx/.well-known/openid-configuration');
  assert.equal(discovery.issuer, issuer);
  assert.equal(discovery.authorization_response_iss_parameter_supported, true);
  assert.ok(discovery.code_challenge_methods_supported.includes('S256'));
  // Keycloak's realm-wide discovery omits `none` even for public clients;
  // verify the concrete client representation below instead.
  phase = 'local bootstrap administration';
  const password = readFileSync(fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url)), 'utf8').trim();
  const response = await request('/realms/master/protocol/openid-connect/token', {
    method: 'POST', body: new URLSearchParams({ client_id: 'admin-cli', username: 'bootstrap-owner', password, grant_type: 'password' }),
  });
  token = response.access_token;
  assert.ok(token);
  phase = 'imported realm, flow, action and client checks';
  const [realm, executions, actions, clients, users, registration, profile, clientScopes, applicationUsers] = await Promise.all([
    admin(''), admin('/authentication/flows/betterpptx-passkey-only/executions'),
    admin('/authentication/required-actions'), admin('/clients?clientId=' + encodeURIComponent(chatgptClientId)), admin('/users/count'),
    admin('/authentication/flows/registration/executions'),
    admin('/users/profile'), admin('/client-scopes'), admin('/users?first=0&max=100'),
  ]);
  assert.equal(realm.browserFlow, 'betterpptx-passkey-only');
  assert.equal(realm.registrationAllowed, true);
  assert.equal(realm.registrationFlow, 'registration');
  assert.equal(realm.accessTokenLifespan, 300);
  assert.equal(realm.ssoSessionIdleTimeout, 604800);
  assert.equal(realm.ssoSessionMaxLifespan, 2592000);
  assert.equal(realm.revokeRefreshToken, true);
  assert.equal(realm.refreshTokenMaxReuse, 0);
  assert.equal(realm.webAuthnPolicyPasswordlessUserVerificationRequirement, 'required');
  assert.equal(realm.webAuthnPolicyPasswordlessRequireResidentKey, 'Yes');
  assert.equal(executions.length, 1);
  assert.equal(executions[0].providerId, 'webauthn-authenticator-passwordless');
  assert.equal(executions[0].requirement, 'REQUIRED');
  const enrollment = actions.find(action => action.alias === 'webauthn-register-passwordless');
  assert.equal(enrollment?.enabled, true);
  assert.equal(enrollment?.defaultAction, true);
  assert.equal(registration.find(entry => entry.providerId === 'registration-password-action')?.requirement, 'DISABLED');
  assert.equal(registration.find(entry => entry.providerId === 'registration-user-creation')?.requirement, 'REQUIRED');
  assert.deepEqual(
    profile.attributes.filter(attribute => attribute.permissions?.edit?.includes('user')).map(attribute => attribute.name),
    ['username'],
  );
  assert.equal(Number.isInteger(users) && users >= 0, true);
  assert.equal(Array.isArray(applicationUsers), true);
  const credentialCounts = await Promise.all(applicationUsers.map(async user => {
    const credentials = await admin(`/users/${encodeURIComponent(user.id)}/credentials`);
    return credentials.filter(item => item.type === 'webauthn-passwordless').length;
  }));
  assert.equal(clients.length, 1);
  const client = clients[0];
	assert.equal(client.clientAuthenticatorType, 'client-jwt');
	assert.equal(client.publicClient, false);
	assert.equal(client.attributes['use.jwks.url'], 'true');
	assert.equal(client.attributes['jwks.url'], chatgptJwksUrl);
	assert.equal(client.attributes['token.endpoint.auth.signing.alg'], 'RS256');
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.deepEqual(client.redirectUris, ['https://chatgpt.com/connector_platform_oauth_redirect']);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.implicitFlowEnabled, false);
  const resourceScope = clientScopes.find(scope => scope.name === 'betterpptx');
  assert.ok(resourceScope?.id);
  const resourceMappers = await admin(`/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models`);
  assert.equal(resourceMappers.find(mapper => mapper.name === 'betterpptx-resource-audience')?.config?.['included.custom.audience'], origin);
  const subjectMapper = resourceMappers.find(mapper => mapper.name === 'betterpptx-subject');
  assert.equal(subjectMapper?.protocolMapper, 'oidc-sub-mapper');
  assert.equal(subjectMapper?.config?.['access.token.claim'], 'true');
  phase = 'partial realm export';
  // This export contains no credentials/users; inspect in memory and print only evidence.
  const snapshot = await request('/admin/realms/betterpptx/partial-export?exportClients=true&exportGroupsAndRoles=false', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(snapshot.browserFlow, 'betterpptx-passkey-only');
  assert.ok(snapshot.authenticationFlows.some(flow => flow.alias === 'betterpptx-passkey-only'));
	console.log(JSON.stringify({ status: 'passed', issuer, browserFlow: realm.browserFlow, requiredAuthenticator: executions[0].providerId, enrollmentAction: enrollment.alias, applicationUserCount: users, sampledUserCount: applicationUsers.length, usersWithEmail: applicationUsers.filter(user => Boolean(user.email)).length, passwordlessCredentialCount: credentialCounts.reduce((sum, count) => sum + count, 0), smtpConfigured: Boolean(realm.smtpServer?.host), clientAuthentication: 'private_key_jwt+S256-PKCE', accessTokenSeconds: realm.accessTokenLifespan, sessionIdleDays: realm.ssoSessionIdleTimeout / 86400, sessionMaxDays: realm.ssoSessionMaxLifespan / 86400, refreshTokenRotation: 'strict', accessTokenSubjectMapper: 'verified', partialExportVerified: true, secretValuesPrinted: false }, null, 2));
} catch {
  console.error(`Local identity verification failed during ${phase}; inspect health and configuration privately. No sensitive response was printed.`);
  process.exitCode = 1;
}
