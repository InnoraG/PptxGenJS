import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chatgptClientId, chatgptJwksUrl, claudeCodeClientId, claudeCodeRedirects, claudeHostedClientId, claudeHostedRedirect,
  makeClient, parseArgs, provision, validateChatgptMetadata, validateClaudeMetadata, validateRedirect,
} from './provision.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
const metadata = {
  client_id: chatgptClientId, jwks_uri: chatgptJwksUrl,
  token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_signing_alg: 'RS256', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
  grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], redirect_uris: [redirect],
};

test('redirect and metadata validation rejects unsafe or unsupported enrollment', () => {
  assert.equal(validateRedirect(redirect), redirect);
  for (const value of ['https://chatgpt.com/*', 'https://chatgpt.com/%2a', 'http://chatgpt.com/callback', '/callback', 'https://x.test/#fragment', 'https://u:p@x.test/cb', 'https://x.test/\\evil', 'https://x.test/#']) {
    assert.throws(() => validateRedirect(value));
  }
  validateChatgptMetadata(metadata, [redirect]);
  for (const invalid of [
    { ...metadata, jwks_uri: 'https://elsewhere.test/jwks' },
	{ ...metadata, token_endpoint_auth_method: 'none' },
	{ ...metadata, token_endpoint_auth_methods_supported: ['none'] },
    { ...metadata, redirect_uris: [] },
  ]) assert.throws(() => validateChatgptMetadata(invalid, [redirect]));
  assert.throws(() => parseArgs(['configure-client']));
  assert.throws(() => parseArgs(['init', '--client-id', 'unverified-client', '--redirect', redirect]));
  assert.throws(() => parseArgs(['stage-secret', '--name', '../../outside']));
  assert.throws(() => parseArgs(['init', '--unknown', 'value']));
});

test('signed ChatGPT CIMD profile requires exact redirects, pinned JWKS and S256 PKCE', () => {
  const client = makeClient(chatgptClientId, [redirect]);
  assert.equal(client.clientAuthenticatorType, 'client-jwt');
  assert.equal(client.publicClient, false);
  assert.equal(client.secret, undefined);
  assert.equal(client.attributes['use.jwks.url'], 'true');
  assert.equal(client.attributes['jwks.url'], chatgptJwksUrl);
  assert.equal(client.attributes['token.endpoint.auth.signing.alg'], 'RS256');
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.attributes['exclude.issuer.from.auth.response'], 'false');
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.implicitFlowEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  assert.deepEqual(client.redirectUris, [redirect]);
});

const claudeMetadata = {
  [claudeHostedClientId]: { client_id: claudeHostedClientId, client_name: 'Claude', redirect_uris: [claudeHostedRedirect],
    grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'], response_types: ['code'], token_endpoint_auth_method: 'none' },
  [claudeCodeClientId]: { client_id: claudeCodeClientId, client_name: 'Claude Code', redirect_uris: [...claudeCodeRedirects],
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
};

test('Claude CIMD clients are PKCE-S256 public clients with exactly the declared redirects', () => {
  for (const [clientId, redirects] of [[claudeHostedClientId, [claudeHostedRedirect]], [claudeCodeClientId, [...claudeCodeRedirects]]]) {
    validateClaudeMetadata(claudeMetadata[clientId], clientId, redirects);
    const client = makeClient(clientId, redirects);
    assert.equal(client.publicClient, true);
    assert.equal(client.clientAuthenticatorType, undefined);
    assert.equal(client.secret, undefined);
    assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
    assert.equal(client.attributes['jwks.url'], undefined);
    assert.equal(client.attributes['use.refresh.tokens'], 'true');
    assert.equal(client.consentRequired, true);
    assert.equal(client.fullScopeAllowed, false);
    assert.equal(client.directAccessGrantsEnabled, false);
    assert.equal(client.implicitFlowEnabled, false);
    assert.equal(client.serviceAccountsEnabled, false);
    assert.deepEqual(client.defaultClientScopes, ['betterpptx']);
    assert.deepEqual(client.redirectUris, redirects);
    for (const invalid of [
      { ...claudeMetadata[clientId], client_id: 'https://claude.ai/oauth/other' },
      { ...claudeMetadata[clientId], token_endpoint_auth_method: 'client_secret_post' },
      { ...claudeMetadata[clientId], grant_types: ['authorization_code'] },
      { ...claudeMetadata[clientId], redirect_uris: [] },
    ]) assert.throws(() => validateClaudeMetadata(invalid, clientId, redirects));
  }
  // Loopback is only for Claude Code and only in its declared port-less form; Keycloak
  // matches it with the port ignored. Wildcards, other paths and other clients are refused.
  assert.equal(validateRedirect('http://localhost/callback', claudeCodeClientId), 'http://localhost/callback');
  for (const [value, clientId] of [
    ['http://localhost/callback', chatgptClientId], ['http://127.0.0.1/callback', claudeHostedClientId],
    ['http://localhost:*', claudeCodeClientId], ['http://localhost/other', claudeCodeClientId],
  ]) assert.throws(() => validateRedirect(value, clientId));
  assert.throws(() => makeClient(claudeHostedClientId, ['https://claude.ai/elsewhere']));
  assert.throws(() => makeClient(claudeCodeClientId, [claudeHostedRedirect]));
  assert.throws(() => parseArgs(['init', '--client-id', 'https://claude.ai/oauth/unknown', '--redirect', claudeHostedRedirect]));
  assert.deepEqual(parseArgs(['configure-client', '--client-id', claudeCodeClientId, '--redirect', 'http://127.0.0.1/callback']).redirects,
    ['http://127.0.0.1/callback']);
  // The ChatGPT signed-client profile cannot be downgraded to a public client.
  assert.equal(makeClient(chatgptClientId, [redirect]).publicClient, false);
});

test('provisioning preserves credentials, stages rotations, and supports no-client bootstrap', () => {
  const temp = mkdtempSync(join(here, '.test-private-'));
  const root = join(temp, 'private');
  try {
    const first = provision(parseArgs(['init']), root);
    assert.deepEqual(first.clients, []);
    const passwordPath = join(root, 'secrets', 'postgres-password');
    const password = readFileSync(passwordPath, 'utf8').trim();
    assert.match(password, /^[A-Za-z0-9_-]{64}$/);
    assert.notEqual(password, readFileSync(join(root, 'secrets', 'bootstrap-admin-password'), 'utf8').trim());
    assert.throws(() => provision(parseArgs(['init']), root));
    provision(parseArgs(['configure-client', '--redirect', redirect]), root);
    const realm = JSON.parse(readFileSync(join(root, 'import', 'betterpptx-realm.json'), 'utf8'));
    assert.equal(realm.registrationAllowed, true);
    assert.equal(realm.registrationFlow, 'registration');
    assert.equal(realm.accessTokenLifespan, 300);
    assert.equal(realm.ssoSessionIdleTimeout, 604800);
    assert.equal(realm.ssoSessionMaxLifespan, 2592000);
    assert.equal(realm.revokeRefreshToken, true);
    assert.equal(realm.refreshTokenMaxReuse, 0);
    assert.equal(realm.browserFlow, 'betterpptx-passkey-only');
    const executions = realm.authenticationFlows.find(f => f.alias === realm.browserFlow).authenticationExecutions;
    assert.equal(executions.length, 1);
    assert.equal(executions[0].authenticator, 'webauthn-authenticator-passwordless');
    assert.equal(executions[0].requirement, 'REQUIRED');
    assert.equal(realm.requiredActions[0].providerId, 'webauthn-register-passwordless');
    assert.equal(realm.requiredActions[0].defaultAction, true);
    assert.equal(realm.webAuthnPolicyPasswordlessUserVerificationRequirement, 'required');
    assert.equal(realm.webAuthnPolicyPasswordlessRequireResidentKey, 'Yes');
    const installSecret = readFileSync(join(root, 'secrets', 'install-hmac-secret'), 'utf8').trim();
    assert.notEqual(installSecret, password);
    assert.equal(existsSync(join(root, 'main-server.env')), false);
    assert.equal(realm.clients[0].clientId, chatgptClientId);
    assert.equal(realm.clientScopes[0].protocolMappers[0].config['included.custom.audience'], 'https://betterpptx.tail070c3a.ts.net');
    const subjectMapper = realm.clientScopes[0].protocolMappers.find(mapper => mapper.name === 'betterpptx-subject');
    assert.equal(subjectMapper.protocolMapper, 'oidc-sub-mapper');
    assert.equal(subjectMapper.config['access.token.claim'], 'true');
    assert.throws(() => provision(parseArgs(['configure-client', '--redirect', redirect]), root));
    provision(parseArgs(['configure-client', '--client-id', claudeHostedClientId, '--redirect', claudeHostedRedirect]), root);
    const withClaude = JSON.parse(readFileSync(join(root, 'import', 'betterpptx-realm.json'), 'utf8'));
    assert.deepEqual(withClaude.clients.map(client => [client.clientId, client.publicClient]),
      [[chatgptClientId, false], [claudeHostedClientId, true]]);
    assert.throws(() => provision(parseArgs(['configure-client', '--client-id', claudeHostedClientId, '--redirect', claudeHostedRedirect]), root));
    const rotation = provision(parseArgs(['stage-secret', '--name', 'postgres-password']), root);
    assert.equal(rotation.activationRequired, true);
    assert.equal(readFileSync(passwordPath, 'utf8').trim(), password);
    assert.ok(!JSON.stringify(rotation).includes(password));
    assert.ok(!JSON.stringify(provision(parseArgs(['status']), root)).includes(password));
    const hmacRotation = provision(parseArgs(['stage-secret', '--name', 'install-hmac-secret']), root);
    assert.equal(hmacRotation.principalMigrationRequired, true);
    assert.equal(readFileSync(join(root, 'secrets', 'install-hmac-secret'), 'utf8').trim(), installSecret);
    assert.equal(existsSync(join(root, 'secrets', 'oauth-client-secret')), false);
  } finally {
    // Only the freshly allocated directory beneath this test's owned directory.
    rmSync(temp, { recursive: true, force: true });
  }
});
