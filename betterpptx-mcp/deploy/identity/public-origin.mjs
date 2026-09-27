const legacyOrigin = 'https://betterpptx.tail070c3a.ts.net';

export function identityPublicOrigin(env = process.env) {
  const input = String(env.BETTERPPTX_PUBLIC_BASE || legacyOrigin).trim();
  let url;
  try { url = new URL(input); } catch { throw new Error('Identity public origin must be an absolute HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash ||
      url.username || url.password || url.port || url.origin !== input) {
    throw new Error('Identity public origin must be a canonical HTTPS origin without credentials, port, path, query or fragment.');
  }
  return { origin: url.origin, hostname: url.hostname, issuer: `${url.origin}/identity/realms/betterpptx` };
}

export function applyIdentityOriginToRealm(realm, origin) {
  const { hostname, origin: audience } = identityPublicOrigin({ BETTERPPTX_PUBLIC_BASE: origin });
  const copy = structuredClone(realm);
  copy.webAuthnPolicyRpId = hostname;
  copy.webAuthnPolicyPasswordlessRpId = hostname;
  for (const scope of copy.clientScopes ?? []) {
    if (scope.name !== 'betterpptx') continue;
    const mapper = scope.protocolMappers?.find(item => item.name === 'betterpptx-resource-audience');
    if (!mapper) throw new Error('BetterPPTX resource-audience mapper is missing.');
    mapper.config['included.custom.audience'] = audience;
  }
  return copy;
}
