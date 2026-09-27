// Operator-only, same-user WebAuthn RP migration. Never prints credentials,
// account records, action URLs or raw admin responses. The user completes the
// passkey ceremony in their own browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const command = process.argv[2] || 'status';
const allowed = new Set(['status', 'prepare-mail', 'switch-policy', 'rename-legacy-label', 'issue-action', 'cleanup-mail', 'rollback-policy']);
if (!allowed.has(command)) throw new Error('Unsupported handoff command.');
const targetOrigin = 'https://betterpptx.xmcpx.com';
const targetHost = 'betterpptx.xmcpx.com';
const previousOrigin = 'https://betterpptx.tail070c3a.ts.net';
const previousHost = 'betterpptx.tail070c3a.ts.net';
const mailbox = 'passkey-handoff@xmcpx.invalid';
const publicBase = new URL(process.env.BETTERPPTX_PUBLIC_BASE || previousOrigin);
assert.equal(publicBase.protocol, 'https:');
assert.ok([previousOrigin, targetOrigin].includes(publicBase.origin));
const base = 'http://127.0.0.1:8180/identity';
const proxyHeaders = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': publicBase.hostname,
  'X-Forwarded-Port': '443',
};

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { ...proxyHeaders, ...options.headers },
  });
  if (!response.ok) throw new Error(`Local identity operation failed: HTTP ${response.status}.`);
  if (response.status === 204 || response.status === 201 || response.status === 202) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const password = readFileSync(
  fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url)), 'utf8',
).trim();
const login = await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: 'admin-cli', username: 'bootstrap-owner', password, grant_type: 'password',
  }),
});
assert.ok(login?.access_token);
const adminHeaders = { Authorization: `Bearer ${login.access_token}` };
const jsonHeaders = { ...adminHeaders, 'Content-Type': 'application/json' };
const realmPath = '/admin/realms/betterpptx';
const admin = (path, options = {}) => request(realmPath + path, {
  ...options, headers: { ...adminHeaders, ...options.headers },
});
const put = (path, value) => admin(path, {
  method: 'PUT', headers: jsonHeaders, body: JSON.stringify(value),
});
const [realm, users, clientScopes, actions] = await Promise.all([
  admin(''), admin('/users?first=0&max=2'), admin('/client-scopes'),
  admin('/authentication/required-actions'),
]);
assert.equal(users.length, 1, 'This handoff requires exactly one existing application user.');
const user = users[0];
assert.ok(user.id);
const userPath = `/users/${encodeURIComponent(user.id)}`;
const credentials = await admin(`${userPath}/credentials`);
const passkeys = credentials.filter(item => item.type === 'webauthn-passwordless');
assert.ok(passkeys.length >= 1, 'The original passkey must remain present.');
assert.equal(realm.browserFlow, 'betterpptx-passkey-only');
assert.equal(actions.find(item => item.alias === 'webauthn-register-passwordless')?.enabled, true);
const resourceScope = clientScopes.find(item => item.name === 'betterpptx');
assert.ok(resourceScope?.id);
const mapperPath = `/client-scopes/${encodeURIComponent(resourceScope.id)}/protocol-mappers/models`;
const mappers = await admin(mapperPath);
const mapper = mappers.find(item => item.name === 'betterpptx-resource-audience');
assert.ok(mapper?.id);
const mapperItemPath = `${mapperPath}/${encodeURIComponent(mapper.id)}`;

function state() {
  return {
    status: 'verified',
    command,
    sameUserPreserved: true,
    passkeyCount: passkeys.length,
    defaultPasskeyLabelOccupied: passkeys.some(item => item.userLabel === 'Passkey (Default Label)'),
    betterPptxPasskeyLabelOccupied: passkeys.some(item => item.userLabel === 'Passkey BetterPPTX'),
    currentRp: realm.webAuthnPolicyPasswordlessRpId,
    currentAudience: mapper.config?.['included.custom.audience'],
    temporaryMailboxConfigured: user.email === mailbox && realm.smtpServer?.host === 'handoff-mailbox',
    publicBase: publicBase.origin,
    actionUrlPrinted: false,
  };
}

if (command === 'status') {
  console.log(JSON.stringify(state(), null, 2));
} else if (command === 'prepare-mail') {
  assert.equal(publicBase.origin, previousOrigin, 'Prepare the mailbox before changing the issuer.');
  assert.ok(!user.email, 'Unexpected existing email: preserve it and use a different procedure.');
  assert.ok(!realm.smtpServer?.host, 'Unexpected SMTP configuration: preserve it and use a different procedure.');
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, previousHost);
  assert.equal(mapper.config?.['included.custom.audience'], previousOrigin);
  const smtpServer = {
    host: 'handoff-mailbox', port: '1025', from: mailbox,
    ssl: 'false', starttls: 'false', auth: 'false',
  };
  await put('', { ...realm, smtpServer });
  try {
    await put(userPath, { ...user, email: mailbox, emailVerified: false });
  } catch (error) {
    await put('', { ...realm, smtpServer: {} });
    throw error;
  }
  const [updatedRealm, updatedUser] = await Promise.all([admin(''), admin(userPath)]);
  assert.equal(updatedRealm.smtpServer?.host, 'handoff-mailbox');
  assert.equal(updatedUser.email, mailbox);
  console.log(JSON.stringify({ status: 'mailbox-prepared', sameUserPreserved: updatedUser.id === user.id, publicMailbox: false }));
} else if (command === 'switch-policy') {
  assert.equal(publicBase.origin, targetOrigin, 'Run only after the Keycloak hostname has moved.');
  assert.equal(user.email, mailbox);
  assert.equal(realm.smtpServer?.host, 'handoff-mailbox');
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, previousHost);
  assert.equal(mapper.config?.['included.custom.audience'], previousOrigin);
  const changed = {
    ...realm,
    webAuthnPolicyRpId: targetHost,
    webAuthnPolicyPasswordlessRpId: targetHost,
  };
  await put('', changed);
  try {
    await put(mapperItemPath, {
      ...mapper,
      config: { ...mapper.config, 'included.custom.audience': targetOrigin },
    });
  } catch (error) {
    await put('', realm);
    throw error;
  }
  const [updatedRealm, updatedMapper] = await Promise.all([admin(''), admin(mapperItemPath)]);
  assert.equal(updatedRealm.webAuthnPolicyPasswordlessRpId, targetHost);
  assert.equal(updatedMapper.config?.['included.custom.audience'], targetOrigin);
  console.log(JSON.stringify({ status: 'policy-switched', sameUserPreserved: true, targetRp: targetHost }));
} else if (command === 'issue-action') {
  assert.equal(publicBase.origin, targetOrigin);
  assert.equal(user.email, mailbox);
  assert.equal(realm.smtpServer?.host, 'handoff-mailbox');
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, targetHost);
  assert.equal(mapper.config?.['included.custom.audience'], targetOrigin);
  const discovery = await request('/realms/betterpptx/.well-known/openid-configuration');
  assert.equal(discovery.issuer, `${targetOrigin}/identity/realms/betterpptx`);
  await put(`${userPath}/execute-actions-email?lifespan=300`, ['webauthn-register-passwordless']);
  console.log(JSON.stringify({ status: 'action-issued', userPreserved: true, expiresInSeconds: 300, actionUrlPrinted: false }));
} else if (command === 'rename-legacy-label') {
  assert.equal(publicBase.origin, targetOrigin);
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, targetHost);
  assert.equal(passkeys.length, 1, 'Rename only the sole existing legacy passkey.');
  assert.equal(passkeys[0].userLabel, 'Passkey BetterPPTX');
  await admin(`${userPath}/credentials/${encodeURIComponent(passkeys[0].id)}/userLabel`, {
    method: 'PUT',
    headers: { ...adminHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    body: 'Passkey BetterPPTX (legacy)',
  });
  const after = await admin(`${userPath}/credentials`);
  assert.equal(after.length, credentials.length);
  assert.equal(after.find(item => item.id === passkeys[0].id)?.userLabel, 'Passkey BetterPPTX (legacy)');
  console.log(JSON.stringify({ status: 'legacy-label-renamed', sameCredentialPreserved: true, credentialCountUnchanged: true }));
} else if (command === 'cleanup-mail') {
  assert.equal(publicBase.origin, targetOrigin);
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, targetHost);
  assert.ok(passkeys.length >= 2, 'Do not remove the handoff route before a new passkey exists.');
  assert.equal(user.email, mailbox);
  assert.ok(!realm.smtpServer?.host || realm.smtpServer.host === 'handoff-mailbox');
  // The operator must separately prove a fresh new-origin login before this step.
  assert.equal(process.env.BETTERPPTX_HANDOFF_LOGIN_VERIFIED, '1');
  // Keycloak ignores a null email in a user representation update. An empty
  // string explicitly clears the temporary handoff address.
  await put(userPath, { ...user, email: '', emailVerified: false });
  if (realm.smtpServer?.host) await put('', { ...realm, smtpServer: {} });
  const [updatedRealm, updatedUser] = await Promise.all([admin(''), admin(userPath)]);
  assert.ok(!updatedUser.email);
  assert.ok(!updatedRealm.smtpServer?.host);
  console.log(JSON.stringify({ status: 'mailbox-removed', sameUserPreserved: updatedUser.id === user.id, passkeyCount: passkeys.length }));
} else if (command === 'rollback-policy') {
  assert.equal(publicBase.origin, targetOrigin, 'Rollback policy before reverting the Keycloak hostname.');
  assert.equal(realm.webAuthnPolicyPasswordlessRpId, targetHost);
  assert.equal(mapper.config?.['included.custom.audience'], targetOrigin);
  await put(mapperItemPath, {
    ...mapper,
    config: { ...mapper.config, 'included.custom.audience': previousOrigin },
  });
  await put('', {
    ...realm,
    webAuthnPolicyRpId: previousHost,
    webAuthnPolicyPasswordlessRpId: previousHost,
  });
  console.log(JSON.stringify({ status: 'policy-rolled-back', sameUserPreserved: true, oldPasskeyRetained: true }));
}
