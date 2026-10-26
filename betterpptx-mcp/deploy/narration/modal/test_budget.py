"""Shared-ledger policy boundaries, concurrent serialization and HTTP fail closure."""
import asyncio
import copy
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, AsyncMock, Mock

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import budget
import bridge

NOW = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)


def record(billed=0):
    return {'schemaVersion': budget.VERSION, 'month': '2026-10', 'accountHash': budget.ACCOUNT_HASH,
            'billedUsd': billed, 'billedAt': NOW.isoformat(), 'entries': {}, 'updatedAt': NOW.isoformat()}


class PolicyTests(unittest.TestCase):
    def test_exact_boundary_and_next_reservation_rejected(self):
        value = record(26.7)
        budget.reserve_record(value, 'a' * 64, NOW)
        self.assertEqual(value['entries']['a' * 64]['usd'], .3)
        with self.assertRaises(budget.BudgetUnavailable):
            budget.reserve_record(value, 'b' * 64, NOW)

    def test_missing_stale_month_future_and_invalid_snapshot_fail_closed(self):
        cases = [None, {}, {**record(), 'month': '2026-09'}, {**record(), 'billedAt': None},
                 {**record(), 'billedAt': (NOW - timedelta(hours=6, seconds=1)).isoformat()},
                 {**record(), 'billedAt': (NOW + timedelta(seconds=1)).isoformat()},
                 {**record(), 'billedUsd': float('nan')}, {**record(), 'entries': []}]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(budget.BudgetUnavailable):
                budget.reserve_record(value, 'a' * 64, NOW)

    def test_reserved_holds_never_age_out_and_settled_respects_billing_lag(self):
        old = (NOW - timedelta(days=1)).isoformat()
        for status, allowed in [('reserved', False), ('settled', True), ('released', True)]:
            value = record(26.7)
            value['entries']['b' * 64] = {'usd': .3, 'status': status, 'createdAt': old}
            if allowed:
                budget.reserve_record(value, 'a' * 64, NOW)
            else:
                with self.assertRaises(budget.BudgetUnavailable):
                    budget.reserve_record(value, 'a' * 64, NOW)
        value = record(26.7)
        value['entries']['b' * 64] = {'usd': .3, 'status': 'settled', 'createdAt': (NOW - timedelta(hours=6)).isoformat()}
        with self.assertRaises(budget.BudgetUnavailable):
            budget.reserve_record(value, 'a' * 64, NOW)

    def test_owner_environment_can_tighten_but_never_raise_ceilings(self):
        with patch.dict(os.environ, {'BETTERPPTX_SPEECH_MONTHLY_CAP_USD': '100', 'BETTERPPTX_SPEECH_BUDGET_RESERVE_USD': '0', 'BETTERPPTX_SPEECH_ADMISSION_CEILING_USD': '100'}):
            self.assertEqual(budget.limit(), 27)
        with patch.dict(os.environ, {'BETTERPPTX_SPEECH_ADMISSION_CEILING_USD': '2'}):
            self.assertEqual(budget.limit(), 2)

    def test_reservations_do_not_overwrite_prior_entries(self):
        value = record()
        budget.reserve_record(value, 'a' * 64, NOW)
        saved = copy.deepcopy(value)
        with self.assertRaises(budget.BudgetUnavailable):
            budget.reserve_record(value, 'a' * 64, NOW)
        self.assertEqual(value, saved)


class AdmissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_gpu_routes_block_before_worker_lookup(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=bridge.app), base_url='http://test') as client:
            with patch.object(budget, 'reserve', side_effect=budget.BudgetUnavailable()), patch.object(bridge, 'worker') as worker, patch('fallback.synthesize_fallback', new=AsyncMock(return_value=None)):
                responses = [await client.get('/voices'), await client.post('/voices/register', json={}),
                             await client.post('/synthesize', json={'text': 'Hello.', 'voice': 'narrator-sw-female'})]
                self.assertTrue(all(response.status_code == 503 for response in responses))
                self.assertTrue(all('budget' not in response.text.lower() for response in responses))
                worker.assert_not_called()

    async def test_budget_denial_permits_approved_fallback_and_health_is_independent(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=bridge.app), base_url='http://test') as client:
            with patch.object(budget, 'reserve', side_effect=budget.BudgetUnavailable()) as reserve, patch.object(bridge, 'worker') as worker, patch('fallback.synthesize_fallback', new=AsyncMock(return_value=(b'audio', {'X-Speech-Fallback': '1', 'X-Speech-Voice-Id': 'approved'}))):
                response = await client.post('/synthesize', json={'text': 'Hello.', 'voice': 'narrator-en-female'})
                self.assertEqual(response.status_code, 200)
                worker.assert_not_called()
                self.assertEqual((await client.get('/health')).status_code, 200)
                self.assertEqual(reserve.call_count, 1)

    async def test_ambiguous_spawn_and_timeout_keep_reservation(self):
        from types import SimpleNamespace
        for spawn_error in (True, False):
            get = AsyncMock(side_effect=TimeoutError())
            call = SimpleNamespace(get=SimpleNamespace(aio=get), cancel=SimpleNamespace(aio=AsyncMock()))
            submit = AsyncMock(side_effect=RuntimeError() if spawn_error else None, return_value=call)
            worker = SimpleNamespace(voices=SimpleNamespace(spawn=SimpleNamespace(aio=submit)))
            with patch.object(budget, 'reserve', return_value='hold'), patch.object(budget, 'settle') as settle, patch.object(bridge, 'worker', return_value=worker):
                response = await bridge.invoke('voices')
                self.assertIn(response.status_code, (503, 504))
                settle.assert_not_called()


class TransactionTests(unittest.TestCase):
    def transaction_fixture(self, value):
        from types import SimpleNamespace
        ref = Mock()
        ref.get.return_value = SimpleNamespace(exists=value is not None, to_dict=lambda: copy.deepcopy(value))
        db = Mock()
        db.collection.return_value.document.return_value = ref
        transaction = Mock()
        db.transaction.return_value = transaction
        now = datetime.now(timezone.utc)
        if value is not None:
            value.update(month=now.strftime('%Y-%m'), billedAt=now.isoformat())
        return db, transaction, ref

    def test_atomic_admission_and_conservative_settlement_use_shared_document(self):
        from google.cloud import firestore
        value = record()
        db, transaction, ref = self.transaction_fixture(value)
        with patch.object(budget, 'client', return_value=db), patch.object(firestore, 'transactional', side_effect=lambda fn: fn):
            budget.mutate('a' * 64)
            db.collection.return_value.document.assert_called_with(budget.ACCOUNT_HASH)
            ref.get.assert_called_with(transaction=transaction, timeout=10)
            saved = transaction.set.call_args.args[1]
            self.assertEqual(saved['entries']['a' * 64]['status'], 'reserved')
            self.assertEqual(saved['entries']['a' * 64]['usd'], .3)
            value.update(saved)
            budget.settle('a' * 64)
            self.assertEqual(transaction.set.call_args.args[1]['entries']['a' * 64], {**saved['entries']['a' * 64], 'status': 'settled'})

    def test_missing_snapshot_never_creates_a_fabricated_billing_record(self):
        from google.cloud import firestore
        db, transaction, ref = self.transaction_fixture(None)
        with patch.object(budget, 'client', return_value=db), patch.object(firestore, 'transactional', side_effect=lambda fn: fn), self.assertRaises(budget.BudgetUnavailable):
            budget.mutate('a' * 64)
        transaction.set.assert_not_called()


if __name__ == '__main__':
    unittest.main()
