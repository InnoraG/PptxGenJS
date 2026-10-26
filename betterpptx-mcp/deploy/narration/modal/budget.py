"""Private speech admission using the shared monthly worker-budget ledger.

Each admitted RPC reserves a conservative complete container lifecycle ($0.30),
not inference time alone. Unknown remote outcomes retain their reservation.
"""
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import math
import os
import uuid

VERSION = 'betterpptx.avatar-worker-budget.v1'
ACCOUNT = 'fluxworkerai1'
ACCOUNT_HASH = hashlib.sha256(ACCOUNT.encode()).hexdigest()
ESTIMATE = 0.30
MAX_AGE_SECONDS = 6 * 3600


class BudgetUnavailable(Exception):
    pass


def amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise BudgetUnavailable()
    return float(value)


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.timestamp()
    except Exception:
        raise BudgetUnavailable() from None


def limit():
    # Environment can tighten this policy; raising the owner ceilings needs code review.
    try:
        cap = min(29.50, amount(float(os.environ.get('BETTERPPTX_SPEECH_MONTHLY_CAP_USD', '29.50'))))
        reserve = max(1.50, amount(float(os.environ.get('BETTERPPTX_SPEECH_BUDGET_RESERVE_USD', '1.50'))))
        ceiling = min(27.00, amount(float(os.environ.get('BETTERPPTX_SPEECH_ADMISSION_CEILING_USD', '27.00'))))
        return max(0, min(cap - reserve, ceiling))
    except Exception:
        raise BudgetUnavailable() from None


def reserve_record(record, reservation, now):
    """Mutates the same v1 record as avatar-worker-budget-store.mjs, fail closed."""
    month = now.strftime('%Y-%m')
    if not isinstance(record, dict) or record.get('month') != month or record.get('schemaVersion') != VERSION or record.get('accountHash') != ACCOUNT_HASH:
        raise BudgetUnavailable()
    billed = amount(record.get('billedUsd'))
    billed_at = timestamp(record.get('billedAt'))
    age = now.timestamp() - billed_at
    if age < 0 or age > MAX_AGE_SECONDS:
        raise BudgetUnavailable()
    entries = record.get('entries')
    if not isinstance(entries, dict):
        raise BudgetUnavailable()
    spent = billed
    for key, item in entries.items():
        if not isinstance(key, str) or len(key) != 64 or any(c not in '0123456789abcdef' for c in key) or not isinstance(item, dict):
            raise BudgetUnavailable()
        status = item.get('status')
        if status not in ('reserved', 'settled', 'released'):
            raise BudgetUnavailable()
        usd = amount(item.get('usd'))
        if status == 'reserved':
            spent += usd  # Uncertain holds never expire, even after billing catches up.
        elif status == 'settled':
            try:
                created = timestamp(item.get('createdAt'))
            except BudgetUnavailable:
                created = float('inf')  # Same conservative unknown-date treatment as JS.
            if created >= billed_at - MAX_AGE_SECONDS:
                spent += usd
    if round(spent + ESTIMATE, 6) > limit():
        raise BudgetUnavailable()
    if reservation in entries:
        raise BudgetUnavailable()  # New admissions use independent opaque UUID hashes.
    entries[reservation] = {'usd': ESTIMATE, 'status': 'reserved', 'createdAt': now.isoformat().replace('+00:00', 'Z')}
    record['updatedAt'] = now.isoformat().replace('+00:00', 'Z')
    return record


@lru_cache(maxsize=1)
def client():
    from google.cloud import firestore
    project = os.environ.get('BETTERPPTX_GCP_PROJECT') or os.environ.get('GOOGLE_CLOUD_PROJECT')
    if not project:
        raise BudgetUnavailable()
    return firestore.Client(project=project, database=os.environ.get('BETTERPPTX_FIRESTORE_DATABASE', '(default)'))


def mutate(reservation, settle=False):
    from google.cloud import firestore
    db = client()
    ref = db.collection(os.environ.get('BETTERPPTX_FIRESTORE_AVATAR_WORKER_BUDGET_COLLECTION', 'betterpptx_avatar_worker_budget')).document(ACCOUNT_HASH)

    @firestore.transactional
    def transaction_write(transaction):
        snapshot = ref.get(transaction=transaction, timeout=10)
        record = snapshot.to_dict() if snapshot.exists else None
        now = datetime.now(timezone.utc)
        if settle:
            if not isinstance(record, dict) or record.get('month') != now.strftime('%Y-%m'):
                return  # A month rollover must never erase/overwrite a newer snapshot.
            entry = record.get('entries', {}).get(reservation)
            if not isinstance(entry, dict) or entry.get('status') != 'reserved':
                return
            entry.update(usd=ESTIMATE, status='settled')
            record['updatedAt'] = now.isoformat().replace('+00:00', 'Z')
        else:
            reserve_record(record, reservation, now)
        transaction.set(ref, record)

    transaction_write(db.transaction(max_attempts=3))


def reserve():
    reservation = hashlib.sha256(uuid.uuid4().hex.encode()).hexdigest()
    mutate(reservation)
    return reservation


def settle(reservation):
    # Failed settlement leaves the previous reserved hold safely counted.
    mutate(reservation, settle=True)
