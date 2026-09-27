import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyIdentityOriginToRealm, identityPublicOrigin } from './public-origin.mjs';

test('public origin selects the canonical HTTPS issuer', () => {
  assert.deepEqual(identityPublicOrigin({ BETTERPPTX_PUBLIC_BASE: 'https://betterpptx.xmcpx.com' }), {
    origin: 'https://betterpptx.xmcpx.com',
    hostname: 'betterpptx.xmcpx.com',
    issuer: 'https://betterpptx.xmcpx.com/identity/realms/betterpptx',
  });
  for (const value of [
    'http://betterpptx.xmcpx.com',
    'https://betterpptx.xmcpx.com/',
    'https://betterpptx.xmcpx.com/path',
    'https://betterpptx.xmcpx.com:444',
    'https://user:secret@betterpptx.xmcpx.com',
    'https://betterpptx.xmcpx.com?next=1',
  ]) assert.throws(() => identityPublicOrigin({ BETTERPPTX_PUBLIC_BASE: value }));
});

test('realm origin migration updates both passkey policies and the resource audience without mutating the template', () => {
  const realm = {
    webAuthnPolicyRpId: 'old.example',
    webAuthnPolicyPasswordlessRpId: 'old.example',
    clientScopes: [{ name: 'betterpptx', protocolMappers: [{
      name: 'betterpptx-resource-audience', config: { 'included.custom.audience': 'https://old.example' },
    }] }],
  };
  const result = applyIdentityOriginToRealm(realm, 'https://betterpptx.xmcpx.com');
  assert.equal(result.webAuthnPolicyRpId, 'betterpptx.xmcpx.com');
  assert.equal(result.webAuthnPolicyPasswordlessRpId, 'betterpptx.xmcpx.com');
  assert.equal(result.clientScopes[0].protocolMappers[0].config['included.custom.audience'], 'https://betterpptx.xmcpx.com');
  assert.equal(realm.webAuthnPolicyRpId, 'old.example');
});
