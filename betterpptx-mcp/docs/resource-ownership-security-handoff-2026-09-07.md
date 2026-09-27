# Resource ownership security sidecar — integration handoff

Scope: local audit and bounded helper implementation. Main owns `engine.mjs`,
`server-http.mjs`, entitlements and reservations. This sidecar edited none of those
files and no existing storage files. `storage/artifact-store.mjs` was already dirty;
storage ownership was not established. No cloud requests, deployments, restarts,
payments, credentials or environment-file reads were performed.

## Delivered and verified

- `auth/resource-authorization.mjs`: request-local authorization using
  `AsyncLocalStorage`, immutable versioned owner records, private metadata-envelope
  support, uniform absent/foreign errors, owner-specific cache keys.
- `test/resource-authorization.test.mjs`: 22 offline tests, including scope presence
  and restoration after nested, synchronous and asynchronous failures.
- `test/resource-authorization-persistence.test.mjs`: 3 offline tests against the
  existing **local** deck and operation stores, including fresh store instances,
  compare-and-swap updates, completion and idempotent replay.

Command, from repository root:

```powershell
node --test betterpptx-mcp/test/resource-authorization.test.mjs betterpptx-mcp/test/resource-authorization-persistence.test.mjs
```

Result: **25 passed, 0 failed**. These verify the helper and persistence recipe,
not an integrated HTTP or engine security fix. Firestore was inspected, not executed.
Only disposable test fixture directories were created and removed.

## Exact engine integration

### 1. Wrap the entire tool call, including early cache/replay/billing paths

Import the helper. Rename the current implementation to a private function and
retain `callBetterPptxTool` as the exported wrapper. Do not start the scope only
around `HANDLERS[name]`: ownership must already apply to hydration, version checks,
completed-save replay, durable-operation replay, estimates and all result enrichment.

```js
import {
  withResourceAuthorization, currentResourceOwner, resourceOwnerOf,
  bindNewResourceOwner, canAccessResource, assertResourceAccess,
  resourceOwnerCacheKey, resourceAuthorizationActive,
} from './auth/resource-authorization.mjs'

export async function callBetterPptxTool(name, args = {}, context = {}) {
  try {
    return await withResourceAuthorization(
      context,
      () => callBetterPptxToolScoped(name, args, context),
      { localMaintainer: (!isPublicBlackBoxMode() || isLocalMaintainerMode()) && !isProductionBillingEnvironment() },
    )
  } catch (err) {
    return buildToolErrorResult(err, canonicalToolName(String(name || '')), args)
  }
}

async function callBetterPptxToolScoped(name, args = {}, context = {}) {
  // The complete previous callBetterPptxTool body.
}
```

Use the existing **server** maintainer policy for the option; never take it from
`args`, clientInfo or a client-supplied context flag. Identity derives exclusively
from the server-validated `installHash` (`install_` plus 64 lowercase hex digits),
otherwise a nonempty server-issued `sessionId`. Missing/default/anonymous shared
identities deny. The same install with a new session retains its owner. A changed
install cannot fall back to a matching session. Account/license/tenant/billing
fields do not establish ownership. Plan and credit changes do not change owner.

`resourceAuthorizationActive()` returns exactly `scopes.getStore() != null`.
It reports scope presence, not permission. Main may preserve trusted white-box
direct imports by checking in `getDeck` only when this is true, provided every
public resource call enters the wrapper or denies before invoking any handler.
Unscoped public lists must return no resource records. The explicit maintainer
option must never be enabled in production and never come from request fields.

Anonymous metadata calls require a strict, resource-free allowlist. Current
`handleMonetizedMcpPriceListing` consumes `args.toolArgs || args.args`, then derives
`deckId` and reads `decks.get(deckId)`; it also resolves spec narration timing when
given `args.spec`. Therefore `!args.deckId` alone does **not** make `price-listing`
or `pricing-listing` safe for an unscoped fallback. Remove dynamic pricing handlers
from the anonymous allowlist or route anonymous calls to a static metadata-only
path that rejects nested resource/spec inputs before any lookup. The wrapper
should also distinguish missing identity at entry from an identity error thrown
later by a handler: catching the latter and rerunning unscoped could repeat work.

All internal calls that use the exported wrapper must carry their trusted context.
Direct internal handler calls inherit the active scope. Outside any scope,
`assertResourceAccess` denies and `currentResourceOwner` throws. Local white-box
tests can explicitly enter a maintainer scope rather than adding a public bypass.

### 2. Bind fresh decks and guard every lookup

In `registerDeck(entry)`, call `bindNewResourceOwner(entry)` before `decks.set`.
Only use binding for a newly created server record. Never bind a record fetched by
an incoming handle as a way to repair missing ownership.

At the start of `getDeck`, before updating last access:

```js
const entry = decks.get(deckId)
if (resourceAuthorizationActive()) assertResourceAccess(entry, { kind: 'deck' })
```

Keep the same unavailable error for missing, unowned and foreign decks. If keeping
the old recommendation envelope, use it equally for all three cases and do not
return the foreign deck's title/version/count.

In `publicDeckList`, skip entries failing `canAccessResource(entry)`. In
`handleDispose`, call `getDeck(args.deckId)` before `decks.delete`. Audit every
remaining direct `decks.get/has/delete` use: billing estimates, quote/listing
helpers, `deckSessionEnvelope`, `addDeckVersionToData`, mutation paths and response
enrichment cannot treat a global map hit as authority. Caller-supplied nested
`toolArgs.deckId` must pass the same check before an estimate/quote observes it.

In `rememberRecentOperation`, capture `currentResourceOwner()` in a private
`resourceOwner` field. In `handleOperationRecent`, filter by `canAccessResource`
**before** limiting results, then project only the original public fields. Do not
spread the private ownership field into a result.

### 3. Check warm, cold and in-flight hydration

Remove the dispatch condition `args.deckId && !decks.has(args.deckId)`: every deck
request must authorize, regardless of cache state. Unknown handles should fail
before billing/reserving or returning replay data.

Use this structure for `ensureDeckHydrated`:

```js
async function ensureDeckHydrated(deckId, context = {}) {
  const id = String(deckId || '')
  if (decks.has(id)) return getDeck(id)
  const key = resourceOwnerCacheKey(id)
  let pending = deckRehydratePromises.get(key)
  if (!pending) {
    pending = rehydrateDeckFromCanonicalSpec(id, context)
      .finally(() => deckRehydratePromises.delete(key))
    deckRehydratePromises.set(key, pending)
  }
  // Mandatory even when a promise is reused or another request filled the cache.
  return assertResourceAccess(await pending, { kind: 'deck' })
}
```

In `rehydrateDeckFromCanonicalSpec`, change the initial map-hit return to
`getDeck(deckId)`. Immediately after loading the head, assert access **before**
reading its canonical-spec digest, fetching any bytes/locked assets, compiling,
registering a temporary deck, or exposing a version. Preserve the deleted-head
check. The temporary deck is created in the authorized scope; confirm its owner
equals the already-authorized head before publishing it under the durable ID.

### 4. Persist ownership in the exact fields the existing stores retain

The owner record is `{schemaVersion:'betterpptx.resource-owner.v1', kind, id}`.
`id` is a namespace-separated SHA-256 of trusted identity; the raw install hash,
device token and session ID are not in this record. Keep it private.

| State | Write location | Read/authorization point |
| --- | --- | --- |
| In-memory deck | `entry.resourceOwner` via binding at registration | `getDeck` and every alternate map path |
| Durable deck head | `head.metadata.resourceOwner` | Immediately after `getDeckHead`, before snapshot/asset read |
| Durable operation | `operation.metadata.resourceOwner` | Status, create-or-get/replay, claimed-terminal result, worker entry |
| Queued operation identity | `request.context.installHash` and `request.context.sessionId` from trusted server context only | Reenter the wrapper and compare persisted operation owner before any result/work |
| Recent-operation row | Private `row.resourceOwner` | Filter, then explicit public projection |
| Avatar job | Requires `job.resourceOwner` plus durable record and hydration preservation | Existing session-only job API needs integration; see failures below |
| Artifact/download | Private durable publication record keyed by exact artifact/token, containing owner | URL issuance, replays, URL import/reopen and actual HTTP delivery |

`storage/deck-state-store.mjs::publicDeckHead` **drops new top-level fields** but
clones `metadata`; add owner inside `deckHeadMetadata`. Keep it when replacing
metadata during every compare-and-swap update. An authoritative owner field must
be assigned after any merge that could overwrite it.

`storage/operation-store.mjs::publicOperation` also allowlists top-level fields
and retains `metadata`. Add owner inside `durableOperationInput().metadata`.
Retain the existing raw `installHash` namespace used for idempotency keys unless
deliberately migrating it; changing that key would break reconnect replay. Do
not derive a new owner from `context.billingCustomerHash` or tool arguments.

`beginDurableOperation` must assert on the returned operation before **every**
succeeded/failed/pending return. Also assert on a terminal claim result before
returning it. `handleOperationStatus` must assert on owner metadata, not merely
conditionally compare a nonempty install binding. Worker execution should rebuild
context only from trusted persisted request fields and assert the operation owner
in that scope before returning an existing terminal result or running work.

Adding owner metadata to operation creation changes the current request digest,
which includes metadata. Existing idempotency rows may therefore report conflicts
even for the same legitimate install. Preserve the old digest for the additive
owner field, or implement a narrow store migration that verifies stored identity
and all other digest inputs before upgrading. Do not blindly retry under a new key.

Canonical snapshots are shared, content-addressed bytes. In particular,
`deck-snapshot-store.mjs` local `putCanonicalSpec` only **returns** the supplied
metadata; the file contains just the spec and `getCanonicalSpec` does not restore
metadata. Adding owner there is **not** durable authorization. Gate snapshot reads
through an owned head and its server-stored lineage. A client-supplied `spec://`
digest, canonical spec or PPTX sidecar cannot grant access.

### 5. Legacy and reconnect policy

Existing operations with a genuine persisted `installHash` can be checked against
`resourceOwnerForContext({ installHash: operation.installHash })` for a narrow
legacy read/migration. Use that only for an old record with no new owner metadata;
never fall back when the new field is present but malformed or conflicting. Do
not guess whether an old untyped billing/session/default string names an owner.

Ownerless historical decks cannot be safely assigned to the first requester.
Permit an explicit maintainer migration only when a trusted historical record
proves the binding; otherwise deny that old public handle. Reopening bytes a
caller actually supplies creates a new owned resource, but embedded references
must still pass authorization. The same install's new decks, durable heads and
operation records survive reconnect with unchanged public handles.

## Exact failures still needing integration or a public fail-closed guard

These are source-confirmed paths. No live service was probed.

1. **Deck IDOR, including discovery.** B calls `betterpptx.deck.recent`/list and
   receives A's ID/title/count from `publicDeckList`; B supplies that ID to
   export/read/mutate/dispose/save paths. `registerDeck` has no owner and `getDeck`
   returns the global entry. Dispatch only hydrates misses. A known durable ID
   also reaches `getDeckHead` → shared snapshot read → recompilation with no
   owner assertion. The helper alone does not fix these until wired in.

2. **Generated image/3D cache bypass.** A populates a hash. B reuses its `gen://`
   handle in a spec/materializer. `image-gen-providers.mjs::hydrateGeneratedImage`
   and `model3d-gen-providers.mjs::hydrateGeneratedRigged3d` both return global
   `genCache.get(hash)` **before** checking the tenant store. Engine materializers
   also call global getters first. `genAssetTenantFor` does not use the stable
   install identity. This is a cross-owner retrieval path wherever those public
   features are enabled; image production feature guards may disable some routes.
   **Bounded guard:** require an independently established owner grant before any
   generated-handle resolver/cache lookup, including spec dry-run/resolve paths.
   If no such authority exists, reject the public reference before provider work
   or billing. Merely changing the durable tenant prefix is insufficient.

3. **Locked/generated/opaque-native assets.** `resolveLockedAssetHandle` returns
   a shared file solely from kind/digest; `resolveGeneratedAssetRefs` returns
   `generatedAssetHandles.get(handle)`; `loadOpaqueNativeSnapshot` and restore/
   replacement handlers fall back to a global registry and shared file. None
   checks owner. A valid known handle can embed another owner's audio/video/GLB
   or object snapshot without going through that owner's deck/job lookup.
   **Bounded guard:** owner-authorize every private handle before cache, file or
   shared-store access; absent authority denies. Approved public catalog assets
   retain their existing explicit catalog lookup. A content hash is not a grant.
   Scope grants/caches by `resourceOwnerCacheKey(handle)` while leaving handles
   unchanged. Identical bytes independently created by two owners need two grants,
   not reassignment of one shared blob's owner. Persist grants in server-owned
   envelopes and restore only after an owner check; spec references cannot mint them.

4. **Avatar jobs: partial checks and reconnect failure.** Normal session-bound
   jobs reject a different session, including the same install after reconnect.
   `assertAvatarJobAccess` permits an unbound in-memory job if one exists.
   `durableAvatarJobRecord` stores only a hash of session and drops owner fields;
   `getAvatarJobAsync` reconstructs only `_sessionHash`. Adding owner at engine
   creation alone does nothing unless `createAvatarJob`, durable serialization
   and hydration all carry it. Completed-asset inputs can bypass the job lookup
   entirely through the unguarded asset resolver above. **Bounded guard:** reject
   publicly unowned job/asset reads; keep verified legacy session access only where
   the stored session binding proves it. Do not claim install reconnect is fixed
   until job owner persistence is integrated.

5. **Operation handles.** `operation.recent` returns the global array and exposes
   other owners' operation/deck IDs. Existing nonempty install-bound status checks
   deny other installs, but ownerless status records pass and session-fallback
   records compare against the wrong caller field. Status and replay return stored
   results containing artifact URLs. Apply the owner assertion before projections
   and every replay/terminal result; filter recent rows as above.

6. **Downloads remain bearer capabilities.** `server-http.mjs` serves
   `GET /files/:token/:name` without caller authorization. The artifact store also
   issues direct GCS signed URLs. Either URL can be used by B after disclosure,
   even if B's install is different or absent. `isPublishedArtifactDownloadPair`
   proves a URL was published by this service, **not** that the current caller
   owns it. This also matters when a public URL is supplied to import/reopen/fetch.
   **Bounded guard:** require owner-authorized publication records before issuing,
   replaying or importing paid artifact URLs; fail public delivery with a generic
   unavailable result when owner metadata/caller binding is absent. For local
   `/files`, assert owner before stat/stream and use `no-store` for guarded delivery.
   A guard in MCP cannot protect an already-issued direct GCS URL. Strict
   cross-owner download denial needs an owner-checked delivery endpoint; until
   that exists, fail closed before issuing new paid signed URLs. Existing signed
   URLs remain valid until expiry/revocation; this sidecar made no live changes.
   Missing device identity must not become a bypass just to accommodate a browser
   that cannot send the header. This limitation needs to remain explicit.

7. **Saved edition representation is untrusted input.** `_encodeEditionPayload`
   uses raw deflate plus base64, **not encryption or authentication**;
   `_readEditionSidecar` accepts the decoded schema, and `handleOpenExisting`
   restores semantic/provenance references from it. Never persist an owner in this
   payload and then trust it on reopen. A forged sidecar containing a private
   asset handle must encounter the same fail-closed resolver checks. This audit
   found no direct payment-settlement grant in the sidecar; the concrete risk is
   untrusted references reaching globally accessible resources.

Async queue note: ALS follows async work created inside a scope, but a callback
stored in a shared queue and later invoked by another owner's completion runs in
that invoker's scope. In `avatar/jobs.mjs::runNext`, invoke each task inside a new
scope built from that job's trusted captured context (or wrap the callback with
`withResourceAuthorization` at creation). Preserve its context for billing and
resource registration. Do not rely on the global queue's current ALS state.

## Remaining acceptance checks for main

- Two installs: B cannot discover/read/mutate/delete/export/save or obtain replay
  URLs from A's deck, including warm cache, cold head and simultaneous hydration.
- Same install reconnect: A2 can read A's durable deck and replay a completed
  operation, including an existing pre-migration idempotency key where provable.
- Spoofed owner/account/license/tenant/billing/maintainer fields in tool arguments
  cannot affect authority; malformed persisted owner fails closed.
- Known private asset/job/operation handles deny cross-owner on warm and cold
  paths, nested specs, completedAsset inputs and saved sidecar reimports.
- Download bytes and issued URL replay match the strict ownership promise, or
  the relevant public feature explicitly remains disabled/fails closed.

No billing rates, charging rules, entitlement principles or auth architecture were
changed by the helper. Broad runtime coverage remains main's integration work.
