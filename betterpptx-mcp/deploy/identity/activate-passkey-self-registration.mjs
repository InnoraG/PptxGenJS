// Idempotently enable first-party passkey self-enrollment without adding a
// password, external identity provider, public client registration or account
// console. Never prints credentials, tokens, user records or private responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { identityPublicOrigin } from './public-origin.mjs';

const base = 'http://127.0.0.1:8180/identity';
const { hostname } = identityPublicOrigin();
const proxyHeaders = {
  'X-Forwarded-Proto': 'https',
  'X-Forwarded-Host': hostname,
  'X-Forwarded-Port': '443',
};

async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { ...proxyHeaders, ...options.headers },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Identity administration failed with HTTP ${response.status}.`);
  }
  if (response.status === 204) return null;
  return response.json();
}

const password = readFileSync(
  fileURLToPath(new URL('./.private/secrets/bootstrap-admin-password', import.meta.url)),
  'utf8',
).trim();
const login = await request('/realms/master/protocol/openid-connect/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: 'admin-cli', username: 'bootstrap-owner', password, grant_type: 'password',
  }),
});
assert.ok(login.access_token);
const adminHeaders = { Authorization: `Bearer ${login.access_token}` };
const credentialLabel = 'Passkey BetterPPTX';

const realm = await request('/admin/realms/betterpptx', { headers: adminHeaders });
await request('/admin/realms/betterpptx', {
  method: 'PUT',
  headers: { ...adminHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...realm,
    registrationAllowed: true,
    registrationFlow: 'registration',
    resetPasswordAllowed: false,
    rememberMe: false,
  }),
});

const registration = await request(
  '/admin/realms/betterpptx/authentication/flows/registration/executions',
  { headers: adminHeaders },
);
const passwordExecution = registration.find(entry => entry.providerId === 'registration-password-action');
assert.ok(passwordExecution?.id, 'Expected the built-in registration password execution.');
await request('/admin/realms/betterpptx/authentication/flows/registration/executions', {
  method: 'PUT',
  headers: { ...adminHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...passwordExecution, requirement: 'DISABLED' }),
});

const [updatedRealm, updatedRegistration, requiredActions, users] = await Promise.all([
  request('/admin/realms/betterpptx', { headers: adminHeaders }),
  request('/admin/realms/betterpptx/authentication/flows/registration/executions', { headers: adminHeaders }),
  request('/admin/realms/betterpptx/authentication/required-actions', { headers: adminHeaders }),
  request('/admin/realms/betterpptx/users/count', { headers: adminHeaders }),
]);
assert.equal(updatedRealm.registrationAllowed, true);
assert.equal(updatedRealm.registrationFlow, 'registration');
assert.equal(updatedRealm.resetPasswordAllowed, false);
assert.equal(
  updatedRegistration.find(entry => entry.providerId === 'registration-password-action')?.requirement,
  'DISABLED',
);
assert.equal(
  updatedRegistration.find(entry => entry.providerId === 'registration-user-creation')?.requirement,
  'REQUIRED',
);
const passkeyAction = requiredActions.find(action => action.alias === 'webauthn-register-passwordless');
assert.equal(passkeyAction?.enabled, true);
assert.equal(passkeyAction?.defaultAction, true);

const profile = await request('/admin/realms/betterpptx/users/profile', { headers: adminHeaders });
const username = profile.attributes.find(attribute => attribute.name === 'username');
assert.ok(username, 'Expected the built-in username profile attribute.');
const hiddenAdministrativeAttributes = profile.attributes
  .filter(attribute => attribute.name !== 'username')
  .map(({ required: _required, ...attribute }) => ({
    ...attribute,
    permissions: { view: ['admin'], edit: ['admin'] },
  }));
await request('/admin/realms/betterpptx/users/profile', {
  method: 'PUT',
  headers: { ...adminHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...profile,
    attributes: [username, ...hiddenAdministrativeAttributes],
  }),
});
const minimalProfile = await request('/admin/realms/betterpptx/users/profile', { headers: adminHeaders });
assert.deepEqual(
  minimalProfile.attributes.filter(attribute => attribute.permissions?.edit?.includes('user')).map(attribute => attribute.name),
  ['username'],
);

await request('/admin/realms/betterpptx/localization/en/webauthn-registration-init-label', {
  method: 'PUT',
  headers: { ...adminHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  body: credentialLabel,
});
const localizedLabel = await fetch(
  base + '/admin/realms/betterpptx/localization/en/webauthn-registration-init-label',
  { headers: { ...proxyHeaders, ...adminHeaders }, redirect: 'error', signal: AbortSignal.timeout(15000) },
);
assert.equal(localizedLabel.status, 200);
assert.equal(await localizedLabel.text(), credentialLabel);

let migratedCredentialLabels = 0;
for (let first = 0; ; first += 100) {
  const users = await request(`/admin/realms/betterpptx/users?first=${first}&max=100`, { headers: adminHeaders });
  for (const user of users) {
    const credentials = await request(
      `/admin/realms/betterpptx/users/${encodeURIComponent(user.id)}/credentials`,
      { headers: adminHeaders },
    );
    for (const credential of credentials) {
      if (credential.type !== 'webauthn-passwordless'
        || !['Passkey (Default Label)', 'WebAuthn Authenticator (Default Label)'].includes(credential.userLabel)) continue;
      await request(
        `/admin/realms/betterpptx/users/${encodeURIComponent(user.id)}/credentials/${encodeURIComponent(credential.id)}/userLabel`,
        {
          method: 'PUT',
          headers: { ...adminHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
          body: credentialLabel,
        },
      );
      migratedCredentialLabels += 1;
    }
  }
  if (users.length < 100) break;
}

console.log(JSON.stringify({
  status: 'activated',
  registration: 'username-then-required-passkey',
  registrationFields: ['username'],
  passkeyDefaultLabel: credentialLabel,
  migratedCredentialLabels,
  passwordRegistration: 'disabled',
  passwordReset: 'disabled',
  externalIdentityProvider: false,
  applicationUserCount: users,
  secretPrinted: false,
}, null, 2));
