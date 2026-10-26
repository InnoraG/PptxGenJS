# Owner compute budget sync

The hourly job monitors the six existing avatar accounts and the dedicated speech
account separately. It never adds speech to avatar credential rotation. Both use
the existing `betterpptx_avatar_worker_budget` Firestore collection and v1 ledger
schema. A document is keyed by SHA-256 of the configured account ID.

The job must run as `betterpptx-modal-budget-sync@PROJECT.iam.gserviceaccount.com`,
not the public gateway identity. Provision that identity with Firestore budget
read/write access and Secret Manager accessor on the two named inputs only:

- `BETTERPPTX_MODAL_BILLING_TOKENS=betterpptx-modal-billing-tokens:latest`
- `BETTERPPTX_SPEECH_WORKER_CREDENTIALS=betterpptx-speech-worker-credentials:1`

Set `BETTERPPTX_GCP_PROJECT`,
`BETTERPPTX_FIRESTORE_AVATAR_WORKER_BUDGET_COLLECTION=betterpptx_avatar_worker_budget`,
and `BETTERPPTX_SPEECH_WORKER_ACCOUNT_ID=fluxworkerai1`. The speech pair is owned
through Mission Control's existing Speech GPU Account Credentials controls.
Rotation requires a deliberate new secret-version binding and redeployment.
Never grant the public gateway access to this pair or log token values.

The bridge separately enforces owner policy before every GPU wake: monthly cap
$29.50, reserve $1.50, and the stricter admission ceiling $27.00. Its private
deployment fields are `BETTERPPTX_SPEECH_MONTHLY_CAP_USD`,
`BETTERPPTX_SPEECH_BUDGET_RESERVE_USD`, and
`BETTERPPTX_SPEECH_ADMISSION_CEILING_USD`; they may tighten those ceilings. Each
admission reserves $0.30 for a complete bounded container lifecycle. Unknown
outcomes retain their hold. Explicit Piper requests do not wake a GPU.

The sync records real account-wide month-to-date billed USD, including other
account work; it does not claim an exact invoice or bypass provider billing lag.
Missing, malformed, failed, or more than six-hour-old snapshots block speech GPU
admission. A successful first sync is required before primary speech can run.
Settled estimates remain for six hours; uncertain reservations do not expire.

After deployment, retain a compact proof containing the sync source/image digest,
job execution ID/outcome, dedicated job service account, and secret names/versions
only. Read back the speech ledger document without credentials: verify v1 schema,
current UTC month, matching account hash, finite nonnegative `billedUsd`, fresh
`billedAt`, and retained reservations. Also verify the private bridge uses the same
project/database/collection and that the old six-account inventory is unchanged.
Do not mark coverage active from a successful image build alone.

Focused checks:

```text
python -m unittest discover -s betterpptx-mcp/deploy/avatar-budget-sync -p test_sync_modal_budget.py
python -m unittest discover -s betterpptx-mcp/deploy/narration/modal -p test_budget.py
```
