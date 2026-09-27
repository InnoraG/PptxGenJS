// IMG10 account/license/session tenant identity contract. Pure and offline.
import assert from 'node:assert/strict'
import { resolveGenAssetTenantIdentity } from './storage/gen-asset-store.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const account = resolveGenAssetTenantIdentity({ accountId: 'acct-owner-42', licenseId: 'lic-premium', sessionId: 'sess-a' })
const license = resolveGenAssetTenantIdentity({ licenseId: 'lic-premium', sessionId: 'sess-a' })
const tenant = resolveGenAssetTenantIdentity({ tenantId: 'tenant-research', sessionId: 'sess-a' })
const session = resolveGenAssetTenantIdentity({ sessionId: 'sess-a' })
ok('account identity has highest precedence', account.source === 'account' && account.accountScoped === true)
ok('license identity is used without account', license.source === 'license' && license.accountScoped === false)
ok('explicit tenant override remains supported', tenant.source === 'tenant' && tenant.explicit === true)
ok('session is the safe research fallback', session.source === 'session' && session.explicit === false)
ok('normalized path key contains no separators', [account, license, tenant, session].every(item => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.tenantId)))
ok('unsafe identity becomes an opaque slug', resolveGenAssetTenantIdentity({ accountId: 'C:\\private\\owner' }).tenantId.startsWith('t-'))
ok('raw account identity is not returned', !JSON.stringify(account).includes('acct-owner-42'))
ok('resolution is deterministic', JSON.stringify(resolveGenAssetTenantIdentity({ accountId: 'acct-owner-42' })) === JSON.stringify(resolveGenAssetTenantIdentity({ accountId: 'acct-owner-42' })))
ok('missing identities default safely', resolveGenAssetTenantIdentity({}).tenantId === 'default')
ok('identity source is explicit for audit', ['account', 'license', 'tenant', 'session', 'default'].includes(account.source))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
