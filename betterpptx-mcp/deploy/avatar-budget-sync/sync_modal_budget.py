"""Hourly Modal billing sync for the rotated avatar-worker accounts (Cloud Run job).

Owner hard rule: never spend more than $30/month per Modal account (practical $29.50).
For each rotation account this reads the REAL month-to-date spend with
`modal billing report --for "this month" --json` (the same source as
deploy/model3d-worker/check_budget.py) and records it in the Firestore budget
document that storage/avatar-worker-budget-store.mjs gates on. An account whose
spend cannot be read is left untouched, so its billing figure goes stale and the
runtime drops it out of rotation (fail closed).

Input: BETTERPPTX_MODAL_BILLING_TOKENS = {"accounts": [{"id", "tokenId", "tokenSecret"}]}
(Secret Manager). Only account ids and USD totals are printed.
"""
import datetime
import hashlib
import json
import os
import subprocess
import sys

from google.cloud import firestore

VERSION = "betterpptx.avatar-worker-budget.v1"
COLLECTION = os.environ.get("BETTERPPTX_FIRESTORE_AVATAR_WORKER_BUDGET_COLLECTION", "betterpptx_avatar_worker_budget")
LAG_SECONDS = float(os.environ.get("BETTERPPTX_AVATAR_WORKER_BILLING_LAG_MS", str(6 * 3600000))) / 1000


def month_spend(token_id, token_secret):
    env = dict(os.environ, MODAL_TOKEN_ID=token_id, MODAL_TOKEN_SECRET=token_secret, PYTHONWARNINGS="ignore")
    env.pop("BETTERPPTX_MODAL_BILLING_TOKENS", None)
    out = subprocess.run([sys.executable, "-m", "modal", "billing", "report", "--for", "this month", "--json"],
                         capture_output=True, text=True, env=env, timeout=120, check=True)
    data = json.loads(out.stdout)
    rows = data if isinstance(data, list) else (data.get("data") or data.get("report") or [])
    return sum(float((row.get("cost") if isinstance(row, dict) else 0) or 0) for row in rows)


def iso(moment):
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def record_billed(db, account_id, billed_usd, now):
    ref = db.collection(COLLECTION).document(hashlib.sha256(account_id.encode()).hexdigest())
    month = now.strftime("%Y-%m")
    cutoff = now.timestamp() - LAG_SECONDS

    @firestore.transactional
    def apply(transaction):
        snapshot = ref.get(transaction=transaction)
        record = snapshot.to_dict() if snapshot.exists else None
        if not record or record.get("month") != month:
            record = {"entries": {}}
        entries = {}
        for key, entry in (record.get("entries") or {}).items():
            if not isinstance(entry, dict) or entry.get("status") == "released":
                continue
            try:
                created = datetime.datetime.fromisoformat(str(entry.get("createdAt")).replace("Z", "+00:00")).timestamp()
            except ValueError:
                created = now.timestamp()
            if entry.get("status") == "settled" and created < cutoff:
                continue
            entries[key] = entry
        transaction.set(ref, {
            "schemaVersion": VERSION,
            "month": month,
            "accountHash": ref.id,
            "billedUsd": round(max(0.0, billed_usd), 6),
            "billedAt": iso(now),
            "entries": entries,
            "updatedAt": iso(now),
        })

    apply(db.transaction())


def main():
    accounts = json.loads(os.environ["BETTERPPTX_MODAL_BILLING_TOKENS"]).get("accounts") or []
    if not accounts:
        print("[budget-sync] no accounts configured", file=sys.stderr)
        return 2
    db = firestore.Client(project=os.environ.get("BETTERPPTX_GCP_PROJECT") or None)
    failed = 0
    for account in accounts:
        account_id = str(account.get("id") or "").strip()
        try:
            spent = month_spend(str(account["tokenId"]), str(account["tokenSecret"]))
            record_billed(db, account_id, spent, datetime.datetime.now(datetime.timezone.utc))
            print(f"[budget-sync] {account_id}: ${spent:.2f} this month")
        except Exception as error:  # noqa: BLE001 - one bad account must not stop the others
            failed += 1
            print(f"[budget-sync] {account_id}: billing read FAILED ({type(error).__name__}); left stale -> fails closed", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
