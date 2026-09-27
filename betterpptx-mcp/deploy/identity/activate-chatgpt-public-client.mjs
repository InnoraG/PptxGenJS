// Idempotently align the deployed ChatGPT CIMD client with signed assertions
// and mandatory S256 PKCE. Never prints credentials/tokens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chatgptClientId, makeClient } from './provision.mjs';
import { identityPublicOrigin } from './public-origin.mjs';

const base = 'http://127.0.0.1:8180/identity';
const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
const { origin: resourceAudience, hostname } = identityPublicOrigin();
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
  if (!response.ok && response.status !== 204) {
    throw new Error(`Identity administration failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

const password = readFileSync(
  fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url)),
  'utf8',
).trim();
const login = await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: 'admin-cli',
    username: 'bootstrap-owner',
    password,
    grant_type: 'password',
  }),
});
assert.ok(login.access_token);
const adminHeaders = { Authorization: `Bearer ${login.access_token}` };
const clients = await request(
  '/admin/realms/betterpptx/clients?clientId=' + encodeURIComponent(chatgptClientId),
  { headers: adminHeaders },
);
assert.equal(clients.length, 1, 'Expected exactly one pinned ChatGPT client.');
const current = clients[0];
const desired = makeClient(chatgptClientId, [redirect]);
const merged = {
  ...current,
  ...desired,
  id: current.id,
  attributes: { ...(current.attributes ?? {}), ...desired.attributes },
};
await request(`/admin/realms/betterpptx/clients/${encodeURIComponent(current.id)}`, {
  method: 'PUT',
  headers: { ...adminHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify(merged),
});
const [updated] = await request(
  '/admin/realms/betterpptx/clients?clientId=' + encodeURIComponent(chatgptClientId),
  { headers: adminHeaders },
);
assert.equal(updated.publicClient, false);
assert.equal(updated.clientAuthenticatorType, 'client-jwt');
assert.equal(updated.attributes['use.jwks.url'], 'true');
assert.equal(updated.attributes['jwks.url'], 'https://chatgpt.com/oauth/jwks.json');
assert.equal(updated.attributes['token.endpoint.auth.signing.alg'], 'RS256');
assert.equal(updated.attributes['pkce.code.challenge.method'], 'S256');
assert.deepEqual(updated.redirectUris, [redirect]);
assert.equal(updated.directAccessGrantsEnabled, false);
assert.equal(updated.implicitFlowEnabled, false);

const clientScopes = await request('/admin/realms/betterpptx/client-scopes', { headers: adminHeaders });
const resourceScope = clientScopes.find(scope => scope.name === 'betterpptx');
assert.ok(resourceScope?.id, 'Expected the BetterPPTX resource scope.');
const mappers = await request(
  `/admin/realms/betterpptx/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models`,
  { headers: adminHeaders },
);
const audienceMapper = mappers.find(mapper => mapper.name === 'betterpptx-resource-audience');
assert.ok(audienceMapper?.id, 'Expected the BetterPPTX audience mapper.');
await request(
  `/admin/realms/betterpptx/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models/${encodeURIComponent(audienceMapper.id)}`,
  {
    method: 'PUT',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...audienceMapper,
      config: { ...(audienceMapper.config ?? {}), 'included.custom.audience': resourceAudience },
    }),
  },
);
const subjectMapper = mappers.find(mapper => mapper.name === 'betterpptx-subject');
const subjectDefinition = {
  ...(subjectMapper ?? {}),
  name: 'betterpptx-subject',
  protocol: 'openid-connect',
  protocolMapper: 'oidc-sub-mapper',
  consentRequired: false,
  config: {
    ...(subjectMapper?.config ?? {}),
    'access.token.claim': 'true',
    'introspection.token.claim': 'true',
  },
};
await request(
  subjectMapper?.id
    ? `/admin/realms/betterpptx/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models/${encodeURIComponent(subjectMapper.id)}`
    : `/admin/realms/betterpptx/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models`,
  {
    method: subjectMapper?.id ? 'PUT' : 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(subjectDefinition),
  },
);
const verifiedMappers = await request(
  `/admin/realms/betterpptx/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models`,
  { headers: adminHeaders },
);
assert.equal(
  verifiedMappers.find(mapper => mapper.name === 'betterpptx-resource-audience')?.config?.['included.custom.audience'],
  resourceAudience,
);
const verifiedSubjectMapper = verifiedMappers.find(mapper => mapper.name === 'betterpptx-subject');
assert.equal(verifiedSubjectMapper?.protocolMapper, 'oidc-sub-mapper');
assert.equal(verifiedSubjectMapper?.config?.['access.token.claim'], 'true');
console.log(JSON.stringify({
  status: 'activated',
  clientId: chatgptClientId,
  tokenEndpointAuthentication: 'private_key_jwt',
  proofKey: 'S256',
  resourceAudience,
  subjectClaim: 'required',
  redirects: 1,
  secretPrinted: false,
}, null, 2));
