import json
from pathlib import Path
import tempfile
import time
import unittest
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


if __name__ == '__main__':
    unittest.main()
