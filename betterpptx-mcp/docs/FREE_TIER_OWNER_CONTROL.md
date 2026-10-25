# Free tier: owner control

The launch free tier has three rolling 30-day allowances per secured identity:

| Limit | Field | Fallback env / GitHub variable | Default | Range | Counted when |
|---|---|---|---|---|---|
| Complete new deck publications | `publicationsPerWindow` | `BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW` | 5 | 1–1000 | a save succeeds |
| Custom talking-head renders | `talkingHeadsPerWindow` | `BETTERPPTX_FREE_TALKING_HEADS_PER_WINDOW` | 1 | 0–1000 | `generate_from_spec phase:"resolve"` renders one, whether or not the deck is published |
| Custom presenter-persona renders | `customPersonasPerWindow` | `BETTERPPTX_FREE_CUSTOM_PERSONAS_PER_WINDOW` | 1 | 0–1000 | `generate_from_spec phase:"resolve"` renders one, whether or not the deck is published |

- **Everything else has no limit of its own.** Narration preparation and all other features come with each deck at no extra cost.
- **Retries:** an exact retry of the same resolve request, with the same idempotency key and inputs, is not counted twice. A failed render releases its reservation.
- **Paid accounts** never draw on these allowances.
- **Editing an existing deck** is a paid service while `BETTERPPTX_EDIT_REQUIRES_PAYMENT=1`, which is the default. A deck counts as "existing" when it was opened with `deck.open_uploaded` or has already been published once.
  - Iterating on a draft that was never saved is part of creating it, so it stays free.
  - Free accounts get `REQUIRES_PAID_ENTITLEMENT`, and the error explains how to publish the revised deck as a new presentation instead.

## Changing a limit

For each limit, the service uses the first of these that is set:

1. The owner config document in Firestore: `betterpptx_owner_config/free_tier`. Running instances re-read it within about 60 seconds (`BETTERPPTX_OWNER_CONFIG_CACHE_TTL_MS`), so a change needs no redeploy.
2. The fallback environment variable from the table above.
3. The default.

Changing a limit only changes the number that usage is compared against. Usage records are never reset, rewritten or deleted:

- **Raising a limit:** each identity's existing usage counts against the new number.
- **Lowering a limit below someone's current usage:** that identity cannot use it free again until older uses leave the 30-day window. Re-downloads and exact idempotent replays still work.
- **Setting a media limit to 0:** turns that free render off.

If the config document can't be read, the service keeps the last known values. If nothing has been read yet, it uses the environment values.

### Set them now (owner credentials, no IAM change)

Flags you leave out keep their current value.

```bash
gcloud auth application-default login
node betterpptx-mcp/deploy/gcp/set-free-publication-limit.mjs --project betterpptx-mcp-20260926 --show
node betterpptx-mcp/deploy/gcp/set-free-publication-limit.mjs --project betterpptx-mcp-20260926 --limit 5 --talking-heads 1 --personas 1
```

### Set them from Mission Control

The private Mission Control page has a **Free Tier** panel. You can also call `GET` or `POST /ops/mission-control/free-tier` directly.

A `POST` takes any of the three fields plus a confirmation phrase:

```json
{"publicationsPerWindow": 5, "talkingHeadsPerWindow": 1, "customPersonasPerWindow": 1, "confirm": "SET FREE PUBLICATION LIMIT"}
```

The Mission Control service account has no Firestore role yet, so the panel shows an error until the owner grants one:

```bash
gcloud projects add-iam-policy-binding betterpptx-mcp-20260926 --member=serviceAccount:betterpptx-mc-runtime@betterpptx-mcp-20260926.iam.gserviceaccount.com --role=roles/datastore.user --condition=None
```

Until then, use the CLI above.

### Fallback through a redeploy

Set the GitHub variables from the table, then run the release workflow. This only matters for a field the owner config document does not set.

## Paid editing switch

Set the GitHub variable `BETTERPPTX_EDIT_REQUIRES_PAYMENT` to `0` and redeploy to include editing in the free plan. When it is `0`:

- Opening an upload is ordinary free authoring.
- Saving an edited deck uses one publication.
- Accounts with a paid entitlement are unaffected either way.
