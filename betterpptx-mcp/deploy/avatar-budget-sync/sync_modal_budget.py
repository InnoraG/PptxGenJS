"""Hourly Modal billing sync for approved compute accounts (Cloud Run job).

Owner hard rule: never spend more than $30/month per Modal account (practical $29.50).
For each configured account this reads the REAL month-to-date spend with
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
import math
import os
import subprocess
import sys


VERSION = "betterpptx.avatar-worker-budget.v1"
COLLECTION = os.environ.get("BETTERPPTX_FIRESTORE_AVATAR_WORKER_BUDGET_COLLECTION", "betterpptx_avatar_worker_budget")
LAG_SECONDS = float(os.environ.get("BETTERPPTX_AVATAR_WORKER_BILLING_LAG_MS", str(6 * 3600000))) / 1000


def month_spend(token_id, token_secret):
    env = dict(os.environ, MODAL_TOKEN_ID=token_id, MODAL_TOKEN_SECRET=token_secret, PYTHONWARNINGS="ignore")
    env.pop("BETTERPPTX_MODAL_BILLING_TOKENS", None)
    env.pop("BETTERPPTX_SPEECH_WORKER_CREDENTIALS", None)
    out = subprocess.run([sys.executable, "-m", "modal", "billing", "report", "--for", "this month", "--json"],
                         capture_output=True, text=True, env=env, timeout=120, check=True)
    data = json.loads(out.stdout)
    rows = data if isinstance(data, list) else (data.get("data", data.get("report")) if isinstance(data, dict) else None)
    if not isinstance(rows, list):
        raise ValueError("Billing report format is invalid.")
    costs = []
    for row in rows:
        if not isinstance(row, dict) or "cost" not in row or row["cost"] is None:
            raise ValueError("Billing report cost is missing.")
        cost = float(row["cost"])
        if not math.isfinite(cost) or cost < 0:
            raise ValueError("Billing report cost is invalid.")
        costs.append(cost)
    return sum(costs)


def iso(moment):
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def record_billed(db, account_id, billed_usd, now):
    from google.cloud import firestore

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


def billing_accounts(env):
    """Compose monitoring only; never rewrite or enroll speech into avatar rotation."""
    inventory = json.loads(env.get("BETTERPPTX_MODAL_BILLING_TOKENS", '{"accounts":[]}'))
    accounts = list(inventory.get("accounts") or [])
    speech = env.get("BETTERPPTX_SPEECH_WORKER_CREDENTIALS")
    if speech:
        pair = json.loads(speech)
        account_id = str(env.get("BETTERPPTX_SPEECH_WORKER_ACCOUNT_ID") or "").strip()
        if not account_id or any(row.get("id") == account_id for row in accounts):
            raise ValueError("Dedicated speech billing identity must be separate.")
        if not isinstance(pair, dict) or not all(isinstance(pair.get(key), str) and pair[key].strip() for key in ("token_id", "token_secret")):
            raise ValueError("Dedicated speech billing credentials are invalid.")
        accounts.append({"id": account_id, "tokenId": pair["token_id"], "tokenSecret": pair["token_secret"]})
    if any(not isinstance(row, dict) or not all(isinstance(row.get(key), str) and row[key].strip() for key in ("id", "tokenId", "tokenSecret")) for row in accounts):
        raise ValueError("Billing account configuration is invalid.")
    if len({row["id"] for row in accounts}) != len(accounts):
        raise ValueError("Billing account identities must be unique.")
    return accounts


def main():
    from google.cloud import firestore
    try:
        accounts = billing_accounts(os.environ)
    except Exception:
        print("[budget-sync] invalid account configuration; no credentials logged", file=sys.stderr)
        return 2
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
