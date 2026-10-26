import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_modal_budget', Path(__file__).with_name('sync_modal_budget.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class BillingAccountsTests(unittest.TestCase):
    def test_separate_speech_source_keeps_six_account_inventory_unchanged(self):
        rows = [{'id': f'avatar-{i}', 'tokenId': 'fake-id', 'tokenSecret': 'fake-secret'} for i in range(6)]
        original = json.dumps({'accounts': rows})
        env = {'BETTERPPTX_MODAL_BILLING_TOKENS': original,
               'BETTERPPTX_SPEECH_WORKER_ACCOUNT_ID': 'speech-account',
               'BETTERPPTX_SPEECH_WORKER_CREDENTIALS': json.dumps({'token_id': 'speech-id', 'token_secret': 'speech-secret'})}
        actual = sync.billing_accounts(env)
        self.assertEqual(actual[:6], rows)
        self.assertEqual(len(actual), 7)
        self.assertEqual(actual[-1], {'id': 'speech-account', 'tokenId': 'speech-id', 'tokenSecret': 'speech-secret'})
        self.assertEqual(env['BETTERPPTX_MODAL_BILLING_TOKENS'], original)
        self.assertEqual(sync.billing_accounts({'BETTERPPTX_MODAL_BILLING_TOKENS': original}), rows)

    def test_missing_identity_or_invalid_credentials_fail_closed(self):
        for env in [
            {'BETTERPPTX_SPEECH_WORKER_CREDENTIALS': '{}'},
            {'BETTERPPTX_SPEECH_WORKER_ACCOUNT_ID': 'speech', 'BETTERPPTX_SPEECH_WORKER_CREDENTIALS': '{"token_id":"x"}'},
            {'BETTERPPTX_MODAL_BILLING_TOKENS': '{"accounts":[{"id":"speech","tokenId":"x","tokenSecret":"y"}]}', 'BETTERPPTX_SPEECH_WORKER_ACCOUNT_ID': 'speech', 'BETTERPPTX_SPEECH_WORKER_CREDENTIALS': '{"token_id":"x","token_secret":"y"}'},
        ]:
            with self.assertRaises(ValueError):
                sync.billing_accounts(env)

    def test_real_report_totals_and_subprocess_secret_isolation(self):
        def run(*args, **kwargs):
            self.assertNotIn('BETTERPPTX_MODAL_BILLING_TOKENS', kwargs['env'])
            self.assertNotIn('BETTERPPTX_SPEECH_WORKER_CREDENTIALS', kwargs['env'])
            self.assertEqual(kwargs['env']['MODAL_TOKEN_ID'], 'fake-id')
            return SimpleNamespace(stdout='[{"cost":0.125},{"cost":"0.375"}]')
        with patch.dict(sync.os.environ, {'BETTERPPTX_MODAL_BILLING_TOKENS': 'fake', 'BETTERPPTX_SPEECH_WORKER_CREDENTIALS': 'fake'}), patch.object(sync.subprocess, 'run', side_effect=run):
            self.assertEqual(sync.month_spend('fake-id', 'fake-secret'), 0.5)

    def test_malformed_reports_never_become_fresh_zero_billing(self):
        for data in [{}, {'error': 'unavailable'}, [{'cost': 'NaN'}], [{'cost': -1}], [{}], [{'cost': None}]]:
            with patch.object(sync.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(data))):
                with self.assertRaises(ValueError):
                    sync.month_spend('fake-id', 'fake-secret')
        with patch.object(sync.subprocess, 'run', return_value=SimpleNamespace(stdout='[]')):
            self.assertEqual(sync.month_spend('fake-id', 'fake-secret'), 0)


if __name__ == '__main__':
    unittest.main()
