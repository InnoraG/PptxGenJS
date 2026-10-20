import { randomBytes, createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyIdentityOriginToRealm, identityPublicOrigin } from './public-origin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const chatgptClientId = 'https://chatgpt.com/oauth/client.json';
export const chatgptJwksUrl = 'https://chatgpt.com/oauth/jwks.json';
// Claude's Anthropic-hosted CIMD documents. Hosted apps (claude.ai, Desktop,
// mobile, Cowork) share one fixed callback; Claude Code uses RFC 8252 loopback
// redirects on an ephemeral port. Keycloak 26.7 already matches the registered
// loopback URIs (127.0.0.1 AND localhost) with the port ignored and the path
// exact, so the CIMD's own redirect_uris are registered verbatim (no wildcard).
export const claudeHostedClientId = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
export const claudeCodeClientId = 'https://claude.ai/oauth/claude-code-client-metadata';
export const claudeHostedRedirect = 'https://claude.ai/api/mcp/auth_callback';
export const claudeCodeRedirects = Object.freeze(['http://localhost/callback', 'http://127.0.0.1/callback']);
const claudeClients = {
  [claudeHostedClientId]: { name: 'Claude', redirects: [claudeHostedRedirect] },
  [claudeCodeClientId]: { name: 'Claude Code', redirects: [...claudeCodeRedirects] },
};
export const supportedClientIds = Object.freeze([chatgptClientId, ...Object.keys(claudeClients)]);
export const isClaudeClient = clientId => Object.hasOwn(claudeClients, clientId);
export const defaultRedirects = clientId => isClaudeClient(clientId) ? [...claudeClients[clientId].redirects] : [];
const secretNames = ['postgres-password', 'bootstrap-admin-password', 'install-hmac-secret'];
const dependents = {
  'postgres-password': ['postgres', 'keycloak'],
  'bootstrap-admin-password': ['keycloak bootstrap (initial creation only)'],
  'install-hmac-secret': ['main MCP install identity signing; owner must install separately'],
};
const fail = message => { throw new Error(message); };
const json = value => JSON.stringify(value, null, 2) + '\n';

export function parseArgs(args) {
  const [command, ...rest] = args;
  if (!['init', 'configure-client', 'stage-secret', 'status', 'grant-docker-reader'].includes(command)) {
    fail('Use init [--redirect URI ...], configure-client --redirect URI ..., stage-secret --name NAME [--from-file FILE], or status.');
  }
  const result = { command, redirects: [], clientId: chatgptClientId };
  const seen = new Set();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i], value = rest[i + 1];
    if (!['--redirect', '--client-id', '--name', '--from-file', '--sid'].includes(flag) || !value || value.startsWith('--')) fail('Invalid option or missing option value.');
    if (flag !== '--redirect' && seen.has(flag)) fail('Duplicate option.');
    seen.add(flag);
    if (flag === '--redirect') result.redirects.push(value);
    if (flag === '--client-id') result.clientId = value;
    if (flag === '--name') result.name = value;
    if (flag === '--from-file') result.fromFile = resolve(value);
    if (flag === '--sid') result.sid = value;
  }
  if (!supportedClientIds.includes(result.clientId)) fail('Unsupported client ID; use the official ChatGPT or Claude CIMD URL.');
  result.redirects = result.redirects.map(uri => validateRedirect(uri, result.clientId));
  if (command === 'status' && rest.length) fail('status accepts no options.');
  if (command === 'grant-docker-reader') {
    if (rest.length !== 2 || !/^S-1-5-21-[0-9-]+$/.test(result.sid ?? '')) fail('grant-docker-reader requires the verified Docker Desktop owner --sid.');
  } else if (result.sid) fail('--sid applies only to grant-docker-reader.');
  if (command === 'stage-secret') {
    if (!secretNames.includes(result.name) || seen.has('--client-id') || result.redirects.length) fail('stage-secret requires one supported --name.');
  } else if (result.name || result.fromFile) fail('Secret options apply only to stage-secret.');
  if ((command === 'configure-client' || seen.has('--client-id')) && !result.redirects.length) fail('At least one exact --redirect URI is required.');
  result.redirects = [...new Set(result.redirects)];
  return result;
}

export function validateRedirect(value, clientId = chatgptClientId) {
  // Loopback redirects exist only for Claude Code and only as its CIMD declares.
  if (clientId === claudeCodeClientId && claudeCodeRedirects.includes(value)) return value;
  let uri;
  try { uri = new URL(value); } catch { fail('Redirect must be an absolute HTTPS URI.'); }
  // Reject ambiguous forms; keep the exact URI supplied by the app management UI.
  if (uri.protocol !== 'https:' || uri.username || uri.password || uri.hash ||
      /[\s*\\#]/.test(value) || /%2a/i.test(value) || uri.href !== value) {
    fail('Redirect must be an exact canonical HTTPS URI without credentials, fragments or wildcards.');
  }
  return value;
}

export function makeClient(clientId, redirects) {
  if (!redirects.length) fail('An OAuth client requires exact redirect URIs.');
  if (isClaudeClient(clientId)) return makeClaudeClient(clientId, redirects);
  if (clientId !== chatgptClientId) fail('This client profile requires the fixed official ChatGPT client ID.');
  return {
    clientId, name: 'BetterPPTX ChatGPT', protocol: 'openid-connect', enabled: true,
    // CIMD lets ChatGPT authenticate the stable URL client with a short-lived
    // signed assertion. The server fetches ChatGPT's pinned public JWKS; no
    // operator- or browser-held reusable secret exists.
    publicClient: false, clientAuthenticatorType: 'client-jwt',
    standardFlowEnabled: true, implicitFlowEnabled: false,
    directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
    authorizationServicesEnabled: false, fullScopeAllowed: false,
    consentRequired: true, redirectUris: redirects.map(validateRedirect), webOrigins: [],
    defaultClientScopes: ['betterpptx'], optionalClientScopes: [],
    attributes: {
      'pkce.code.challenge.method': 'S256',
	  'use.jwks.url': 'true',
	  'jwks.url': chatgptJwksUrl,
	  'token.endpoint.auth.signing.alg': 'RS256',
      'exclude.issuer.from.auth.response': 'false',
      'access.token.header.type.rfc9068': 'false',
      'access.token.signed.response.alg': 'RS256',
      'access.token.lifespan': '300',
      'use.refresh.tokens': 'true',
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
      'standard.token.exchange.enabled': 'false',
      'oauth2.jwt.authorization.grant.enabled': 'false',
    },
  };
}

// Claude's CIMD clients authenticate as public clients (token_endpoint_auth_method
// "none"): PKCE S256 is mandatory, there is no secret, and refresh tokens rotate
// under the realm's revokeRefreshToken/refreshTokenMaxReuse=0 policy (a replayed
// or revoked refresh token fails with invalid_grant).
function makeClaudeClient(clientId, redirects) {
  const allowed = claudeClients[clientId].redirects;
  for (const uri of redirects) {
    validateRedirect(uri, clientId);
    if (!allowed.includes(uri)) fail('Claude redirects must be exactly those its official metadata declares.');
  }
  return {
    clientId, name: claudeClients[clientId].name, protocol: 'openid-connect', enabled: true,
    publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false,
    directAccessGrantsEnabled: false, serviceAccountsEnabled: false,
    authorizationServicesEnabled: false, fullScopeAllowed: false,
    consentRequired: true, redirectUris: [...redirects], webOrigins: [],
    defaultClientScopes: ['betterpptx'], optionalClientScopes: [],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'exclude.issuer.from.auth.response': 'false',
      'access.token.header.type.rfc9068': 'false',
      'access.token.signed.response.alg': 'RS256',
      'access.token.lifespan': '300',
      'use.refresh.tokens': 'true',
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
      'standard.token.exchange.enabled': 'false',
      'oauth2.jwt.authorization.grant.enabled': 'false',
    },
  };
}

export function validateClaudeMetadata(metadata, clientId, redirects) {
  if (!isClaudeClient(clientId) || metadata?.client_id !== clientId ||
      metadata.token_endpoint_auth_method !== 'none' ||
      !metadata.grant_types?.includes('authorization_code') || !metadata.grant_types?.includes('refresh_token') ||
      !metadata.response_types?.includes('code') || !Array.isArray(metadata.redirect_uris) ||
      !redirects.length || !redirects.every(uri => metadata.redirect_uris.includes(uri))) {
    fail('Official Claude metadata does not match the pinned public CIMD profile or requested redirects; review it before provisioning.');
  }
}

export async function fetchClientMetadata(clientId) {
  const response = await fetch(clientId, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) fail('Official client metadata is unavailable; no client was written.');
  return response.json();
}

export function validateChatgptMetadata(metadata, redirects) {
  if (metadata.client_id !== chatgptClientId || metadata.jwks_uri !== chatgptJwksUrl ||
	  metadata.token_endpoint_auth_method !== 'private_key_jwt' ||
	  !(metadata.token_endpoint_auth_methods_supported ?? []).includes('private_key_jwt') ||
	  metadata.token_endpoint_auth_signing_alg !== 'RS256' ||
      !metadata.grant_types?.includes('authorization_code') || !metadata.response_types?.includes('code') ||
      !Array.isArray(metadata.redirect_uris) ||
      !redirects.every(uri => metadata.redirect_uris.includes(uri))) {
	  fail('Official ChatGPT metadata does not match the pinned CIMD signed-client profile or requested redirects; review it before provisioning.');
  }
}

async function verifyOfficialClient(clientId, redirects) {
  const metadata = await fetchClientMetadata(clientId);
  if (isClaudeClient(clientId)) validateClaudeMetadata(metadata, clientId, redirects);
  else validateChatgptMetadata(metadata, redirects);
}

function protectRoot(root) {
  mkdirSync(root, { mode: 0o700 });
  if (process.platform === 'win32') {
    const who = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = who.stdout?.match(/S-1-5-[0-9-]+/)?.[0];
    if (who.status !== 0 || !sid) fail('Unable to identify owner for private directory ACL.');
    const acl = spawnSync('icacls.exe', [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'], { encoding: 'utf8', windowsHide: true });
    if (acl.status !== 0) fail('Unable to restrict private directory ACL; no secrets were generated.');
  } else chmodSync(root, 0o700);
}

function assertRoot(root) {
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) fail('Private directory missing or unsafe; run init first.');
}

function writeNew(path, content, mode = 0o600) {
  writeFileSync(path, content, { flag: 'wx', mode });
}

function secretMetadata(name, value, source = 'provisioner randomBytes(48)') {
  return {
    name, status: 'staged-not-activated', fingerprint: createHash('sha256').update(value).digest('hex').slice(0, 16),
    source, version: randomBytes(8).toString('hex'), createdAt: new Date().toISOString(),
    activatedAt: null, lastRotatedAt: null, dependentServices: dependents[name],
  };
}

export function provision(options, root = join(here, '.private')) {
  if (options.command === 'init') {
    if (existsSync(root)) fail('Private state already exists; init never overwrites credentials.');
    const realm = applyIdentityOriginToRealm(
      JSON.parse(readFileSync(join(here, 'realm.json'), 'utf8')),
      identityPublicOrigin().origin,
    );
    if (options.redirects.length) realm.clients.push(makeClient(options.clientId, options.redirects));
    protectRoot(root);
    mkdirSync(join(root, 'secrets'), { mode: 0o700 });
    // Docker bind-mounts this directory; non-root Keycloak needs traversal inside it.
    mkdirSync(join(root, 'import'), { mode: 0o755 });
    const metadata = [];
    for (const name of secretNames) {
      const value = randomBytes(48).toString('base64url');
      // Parent is owner-only. A single-file Compose secret mount must be readable by UID 1000.
      writeNew(join(root, 'secrets', name), value + '\n', 0o444);
      metadata.push(secretMetadata(name, value));
    }
    writeNew(join(root, 'import', 'betterpptx-realm.json'), json(realm), 0o444);
    writeNew(join(root, 'credential-status.json'), json(metadata));
    return { status: 'prepared-not-deployed', clients: realm.clients.map(c => c.clientId), secretValuesPrinted: false };
  }
  assertRoot(root);
  if (options.command === 'grant-docker-reader') {
    if (process.platform !== 'win32') fail('Docker Desktop reader ACL applies only on Windows.');
    for (const [path, rights] of [
      [root, 'RX'], [join(root, 'secrets'), 'RX'],
      [join(root, 'import'), '(OI)(CI)RX'],
      [join(root, 'secrets', 'postgres-password'), 'R'],
      [join(root, 'secrets', 'bootstrap-admin-password'), 'R'],
    ]) {
      if (lstatSync(path).isSymbolicLink()) fail('Unsafe private mount path.');
      const acl = spawnSync('icacls.exe', [path, '/grant:r', `*${options.sid}:${rights}`], { encoding: 'utf8', windowsHide: true });
      if (acl.status !== 0) fail('Unable to grant the verified Docker Desktop identity access to mount inputs.');
    }
    return { status: 'docker-reader-granted', sid: options.sid, installHmacShared: false };
  }
  if (options.command === 'status') return JSON.parse(readFileSync(join(root, 'credential-status.json'), 'utf8'));
  if (options.command === 'configure-client') {
    const path = join(root, 'import', 'betterpptx-realm.json');
    if (lstatSync(path).isSymbolicLink()) fail('Unsafe realm import file.');
    const realm = JSON.parse(readFileSync(path, 'utf8'));
    if (realm.clients.some(client => client.clientId === options.clientId)) fail('This application client is already staged; update a deployed client through private administration.');
    realm.clients.push(makeClient(options.clientId, options.redirects));
    chmodSync(path, 0o600);
    writeFileSync(path, json(realm), { mode: 0o600 });
    chmodSync(path, 0o444);
    return { status: 'import-updated-not-live', clientId: options.clientId, existingRealmsSkipImport: true };
  }
  if (options.command === 'stage-secret') {
    const value = options.fromFile ? readFileSync(options.fromFile, 'utf8').trim() : randomBytes(48).toString('base64url');
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) fail('Secret file must contain 32-256 base64url characters.');
    const staging = join(root, 'rotations');
    if (!existsSync(staging)) mkdirSync(staging, { mode: 0o700 });
    if (lstatSync(staging).isSymbolicLink()) fail('Unsafe rotation directory.');
    const metadata = secretMetadata(options.name, value, options.fromFile ? 'owner-supplied private file' : undefined);
    const destination = join(staging, `${options.name}-${metadata.version}`);
    writeNew(destination, value + '\n');
    writeNew(destination + '.json', json(metadata));
    return { ...metadata, activationRequired: true,
      ...(options.name === 'install-hmac-secret' ? { principalMigrationRequired: true, warning: 'Do not activate blindly: migrate issuer/subject-derived principals and identity-bound records, or preserve the existing key.' } : {}),
    };
  }
  fail('Unsupported provisioning operation.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.redirects.length) await verifyOfficialClient(options.clientId, options.redirects);
    console.log(json(provision(options)));
  } catch (error) {
    // Filesystem errors can contain owner-selected paths: do not dump stacks or input contents.
    console.error(error.code ? `Provisioning failed (${error.code}); check private file permissions and runbook.` : error.message);
    process.exitCode = 1;
  }
}
