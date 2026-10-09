import json
from pathlib import Path
import tempfile
import time
import unittest
import urllib.error
from unittest import mock

import bridge
from bridge import Session, find_token, normalize_usage


class QuotaTests(unittest.TestCase):
    def test_five_hour_and_weekly_windows(self):
        value = normalize_usage({'five_hour': {'utilization': 8.0, 'resets_at': '2026-10-08T09:50:00+00:00'},
                                 'seven_day': {'utilization': 6, 'resets_at': '2026-10-09T07:00:00Z'},
                                 'seven_day_opus': None})
        self.assertEqual([w['id'] for w in value['windows']], ['five_hour', 'seven_day'])
        self.assertEqual(value['windows'][0]['percentUsed'], 8.0)
        self.assertEqual(value['windows'][0]['resetsAt'], 1791453000000)

    def test_missing_utilization_is_skipped(self):
        self.assertEqual(normalize_usage({'five_hour': {'resets_at': None}})['windows'], [])

    def test_token_found_at_any_depth(self):
        self.assertEqual(find_token({'claudeAiOauth': {'accessToken': 'x', 'expiresAt': 1}}), ('x', 1))
        self.assertIsNone(find_token({'mcpOAuth': {}}))


class LoginReadingTests(unittest.TestCase):
    """Two Keychain items can share the name "Claude Code-credentials": the sign-in, and one with only MCP connector data."""

    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        patch = mock.patch.object(bridge, 'CLAUDE_HOME', self.folder)
        patch.start()
        self.addCleanup(patch.stop)
        self.future = (time.time() + 3600) * 1000
        self.past = (time.time() - 60) * 1000

    def login(self, token, expires=None):
        return json.dumps({'claudeAiOauth': {'accessToken': token, 'expiresAt': expires or self.future}, 'mcpOAuth': {}})

    def keychain(self, *blobs):
        return mock.patch.object(bridge, '_keychain_blobs', return_value=list(blobs))

    def test_the_item_with_only_connector_data_is_skipped(self):
        with self.keychain(json.dumps({'mcpOAuth': {'figma': {}}}), self.login('real')):
            self.assertEqual(bridge.read_token()[0], 'real')

    def test_a_valid_token_is_preferred_over_an_expired_one(self):
        with self.keychain(self.login('old', self.past), self.login('new')):
            self.assertEqual(bridge.read_token()[0], 'new')

    def test_an_expired_token_is_still_returned_so_it_can_be_renewed(self):
        with self.keychain(self.login('old', self.past)):
            self.assertEqual(bridge.read_token()[0], 'old')

    def test_only_connector_data_means_signed_out(self):
        with self.keychain(json.dumps({'mcpOAuth': {'figma': {}}})):
            with self.assertRaisesRegex(RuntimeError, 'signed-out'):
                bridge.read_token()

    def test_the_credentials_file_is_used_when_the_keychain_has_nothing(self):
        (self.folder / '.credentials.json').write_text(self.login('from-file'))
        with self.keychain():
            self.assertEqual(bridge.read_token()[0], 'from-file')

    def test_the_logged_in_users_item_is_asked_for_first_then_any(self):
        answers = [mock.Mock(returncode=0, stdout=self.login('mine') + '\n'), mock.Mock(returncode=0, stdout='{"mcpOAuth":{}}\n')]
        with mock.patch.object(bridge.getpass, 'getuser', return_value='tori'), \
                mock.patch.object(bridge.subprocess, 'run', side_effect=answers) as run:
            blobs = bridge._keychain_blobs()
        first, second = run.call_args_list[0][0][0], run.call_args_list[1][0][0]
        self.assertEqual(first[:5], ['/usr/bin/security', 'find-generic-password', '-a', 'tori', '-s'])
        self.assertNotIn('-a', second)
        self.assertEqual(len(blobs), 2)

    def test_the_same_item_is_not_listed_twice(self):
        same = mock.Mock(returncode=0, stdout=self.login('mine') + '\n')
        with mock.patch.object(bridge.getpass, 'getuser', return_value='tori'), \
                mock.patch.object(bridge.subprocess, 'run', side_effect=[same, same]):
            self.assertEqual(len(bridge._keychain_blobs()), 1)


class SessionTests(unittest.TestCase):
    def write(self, rows):
        folder = tempfile.mkdtemp()
        path = Path(folder) / 'abc.jsonl'
        path.write_text(''.join(json.dumps(r) + '\n' for r in rows))
        return path

    def test_turn_end_marks_done_with_title(self):
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        path = self.write([
            {'type': 'user', 'timestamp': now, 'cwd': '/tmp/proj', 'message': {'content': 'hello'}},
            {'type': 'assistant', 'timestamp': now, 'message': {'stop_reason': 'end_turn', 'usage': {'input_tokens': 1000}}},
            {'type': 'ai-title', 'aiTitle': 'Greeting'}])
        session = Session(path)
        session.scan()
        snap = session.snapshot(time.time())
        self.assertEqual(snap['state'], 'done')
        self.assertEqual(snap['title'], 'Greeting · proj')

    def test_tool_use_is_working(self):
        now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        path = self.write([{'type': 'assistant', 'timestamp': now, 'message': {'stop_reason': 'tool_use'}}])
        session = Session(path)
        session.scan()
        self.assertEqual(session.snapshot(time.time())['state'], 'working')


class RenewTests(unittest.TestCase):
    """Renewal is delegated to Claude Code itself. Everything here is mocked: no Keychain, no real command, no network."""

    def setUp(self):
        self.past = (time.time() - 60) * 1000
        self.later = (time.time() + 8 * 3600) * 1000
        for patch in (mock.patch.object(bridge, 'STATE', Path(tempfile.mkdtemp())),
                      mock.patch.object(bridge, '_last_renew', 0.0),
                      mock.patch.object(bridge, 'AUTO_RENEW', True),
                      mock.patch.object(bridge, 'find_claude_cli', return_value='/fake/claude')):
            patch.start()
            self.addCleanup(patch.stop)

    def tokens(self, *reads):
        return mock.patch.object(bridge, 'read_token', side_effect=list(reads))

    def ran(self, cost=0):
        return mock.patch.object(bridge.subprocess, 'run', return_value=mock.Mock(stdout=json.dumps({'total_cost_usd': cost})))

    def test_valid_token_does_not_start_claude_code(self):
        with self.tokens(('good', self.later)), self.ran() as run:
            self.assertEqual(bridge.ensure_fresh(), 'good')
        run.assert_not_called()

    def test_expired_token_is_renewed_by_claude_code(self):
        with self.tokens(('old', self.past), ('new', self.later)), self.ran() as run:
            self.assertEqual(bridge.ensure_fresh(), 'new')
        command, options = run.call_args[0][0], run.call_args[1]
        self.assertEqual(command[:3], ['/fake/claude', '-p', '/claude-meter-renew'])
        self.assertEqual(options['stdin'], bridge.subprocess.DEVNULL)

    def test_token_still_expired_after_renewal_reports_login_expired(self):
        with self.tokens(('old', self.past), ('old', self.past)), self.ran():
            with self.assertRaisesRegex(RuntimeError, 'login-expired'):
                bridge.ensure_fresh()

    def test_claude_code_is_started_at_most_once_per_retry_window(self):
        with self.tokens(('old', self.past), ('old', self.past), ('old', self.past), ('old', self.past)), self.ran() as run:
            for _ in range(2):
                with self.assertRaises(RuntimeError):
                    bridge.ensure_fresh()
        self.assertEqual(run.call_count, 1)

    def test_a_run_that_costs_tokens_switches_renewal_off(self):
        with self.tokens(('old', self.past), ('old', self.past)), self.ran(cost=0.02):
            with self.assertRaisesRegex(RuntimeError, 'expired'):
                bridge.ensure_fresh()
        self.assertFalse(bridge.AUTO_RENEW)

    def test_missing_claude_code_cannot_renew(self):
        with self.tokens(('old', self.past), ('old', self.past)), self.ran() as run, \
                mock.patch.object(bridge, 'find_claude_cli', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'login-expired'):
                bridge.ensure_fresh()
        run.assert_not_called()

    def test_renewal_switched_off_by_the_user(self):
        with self.tokens(('old', self.past), ('old', self.past)), self.ran() as run, mock.patch.object(bridge, 'AUTO_RENEW', False):
            with self.assertRaisesRegex(RuntimeError, 'expired'):
                bridge.ensure_fresh()
        run.assert_not_called()

    def test_refused_token_triggers_renewal_even_if_it_looks_valid(self):
        with self.tokens(('same', self.later), ('newer', self.later)), self.ran() as run:
            self.assertEqual(bridge.ensure_fresh(rejected='same'), 'newer')
        run.assert_called_once()

    def test_a_401_is_retried_once_with_the_renewed_token(self):
        refused = urllib.error.HTTPError('u', 401, 'no', {}, None)
        with mock.patch.object(bridge, 'ensure_fresh', side_effect=['t1', 't2']) as fresh, \
                mock.patch.object(bridge, '_get_usage', side_effect=[refused, {'five_hour': {}}]):
            self.assertEqual(bridge.fetch_usage(), {'five_hour': {}})
        self.assertEqual(fresh.call_args_list[1], mock.call(rejected='t1'))

    def test_a_second_401_gives_up(self):
        refused = urllib.error.HTTPError('u', 401, 'no', {}, None)
        with mock.patch.object(bridge, 'ensure_fresh', side_effect=['t1', 't2']), \
                mock.patch.object(bridge, '_get_usage', side_effect=[refused, refused]):
            with self.assertRaisesRegex(RuntimeError, 'login-expired'):
                bridge.fetch_usage()

    def test_claude_code_gets_the_system_proxy_and_no_bypass(self):
        with mock.patch.dict(bridge.os.environ, {'NO_PROXY': '*', 'HTTPS_PROXY': ''}), \
                mock.patch.object(bridge, '_proxies', return_value={'https': 'http://127.0.0.1:7897'}):
            env = bridge._proxy_env()
        self.assertNotIn('NO_PROXY', env)
        self.assertEqual(env['HTTPS_PROXY'], 'http://127.0.0.1:7897')

    def test_every_error_code_has_a_message(self):
        for code in ('signed-out', 'login-expired', 'expired', 'http 403', 'http 429', 'network'):
            self.assertIn(code, bridge.PROBLEMS)


if __name__ == '__main__':
    unittest.main()
