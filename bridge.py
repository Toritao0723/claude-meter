#!/usr/bin/env python3
"""Read-only Claude account usage + local Claude Code session observer. No model requests."""
import datetime as dt
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

urllib.request.proxy_bypass = lambda host: False   # we only talk to api.anthropic.com; never bypass the proxy

HOME = Path.home()
CLAUDE_HOME = Path(os.environ.get('CLAUDE_CONFIG_DIR', str(HOME / '.claude')))
STATE = HOME / 'Library/Application Support/Claude Meter'
USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
KEYCHAIN_SERVICE = 'Claude Code-credentials'


def stamp(value):
    try:
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError, AttributeError):
        return 0


WINDOWS = (('five_hour', 300, '5 小时额度'), ('seven_day', 10080, '每周额度'),
           ('seven_day_opus', 10080, '每周 Opus 额度'), ('seven_day_sonnet', 10080, '每周 Sonnet 额度'))


def normalize_usage(result, now=None):
    """Turn the /api/oauth/usage response into the meter's window list."""
    now = now or time.time()
    windows = []
    for key, minutes, name in WINDOWS:
        w = result.get(key)
        if not isinstance(w, dict):
            continue
        used = w.get('utilization')
        if not isinstance(used, (int, float)):
            continue
        reset = stamp(w.get('resets_at')) or None
        windows.append({'id': key, 'known': True, 'idle': False, 'label': name,
                        'percentUsed': min(100, max(0, used)), 'minutes': minutes,
                        'startsAt': (reset - minutes * 60) * 1000 if reset else None,
                        'resetsAt': reset * 1000 if reset else None})
    extra = result.get('extra_usage') if isinstance(result.get('extra_usage'), dict) else {}
    return {'windows': windows, 'plan': None, 'liveAt': now * 1000, 'resetCredits': None,
            'creditBalance': extra.get('used_credits') if extra.get('is_enabled') else None}


def find_token(value):
    """Find an OAuth access token in a stored credential blob, whatever its nesting."""
    if isinstance(value, dict):
        for key in ('accessToken', 'access_token'):
            if isinstance(value.get(key), str) and value[key]:
                return value[key], value.get('expiresAt') or value.get('expires_at')
        for child in value.values():
            found = find_token(child)
            if found:
                return found
    return None


def read_token():
    """Claude Code's own sign-in: macOS Keychain first, then ~/.claude/.credentials.json."""
    blobs = []
    try:
        out = subprocess.run(['/usr/bin/security', 'find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
                             capture_output=True, text=True, timeout=30)
        if out.returncode == 0:
            blobs.append(out.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        blobs.append((CLAUDE_HOME / '.credentials.json').read_text())
    except OSError:
        pass
    for blob in blobs:
        try:
            found = find_token(json.loads(blob))
        except ValueError:
            found = (blob, None) if blob.startswith('sk-ant-oat') else None
        if found:
            return found
    raise RuntimeError('signed-out')


def _opener():
    """Route through the proxy the Mac is actually using.

    Python ignores the macOS system proxy as soon as any *_proxy variable exists in the environment
    (even NO_PROXY=* or an empty HTTPS_PROXY inherited from a terminal), which silently sends the
    request out directly. In unsupported regions Anthropic then answers 403, so look at both sources.
    """
    env = {k: v for k, v in urllib.request.getproxies_environment().items() if k in ('http', 'https') and v}
    system = {}
    if sys.platform == 'darwin':
        try:
            system = {k: v for k, v in urllib.request.getproxies_macosx_sysconf().items() if k in ('http', 'https') and v}
        except Exception:
            pass
    proxies = env or system
    handlers = [urllib.request.ProxyHandler(proxies)] if proxies else [urllib.request.ProxyHandler({})]
    return urllib.request.build_opener(*handlers)


def fetch_usage():
    token, expires = read_token()
    if isinstance(expires, (int, float)) and expires / 1000 < time.time():
        raise RuntimeError('expired')
    request = urllib.request.Request(USAGE_URL, headers={
        'Authorization': f'Bearer {token}', 'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json', 'User-Agent': 'claude-meter/1.0'})
    try:
        with _opener().open(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError('expired' if error.code == 401 else f'http {error.code}')


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ' '.join(p.get('text', '') for p in content if isinstance(p, dict) and p.get('type') == 'text')
    return ''


class Session:
    """One Claude Code conversation log (~/.claude/projects/<project>/<session>.jsonl)."""

    def __init__(self, path, notify_initial=False):
        self.path = path
        self.id = path.stem
        self.notify_initial = notify_initial
        self.offset = 0
        self.title = ''
        self.prompt = ''
        self.project = ''
        self.state = 'unknown'
        self.started = 0
        self.at = 0
        self.tokens = None
        self.context = None
        self.pending_tool = False
        self.events = []

    @property
    def label(self):
        name = self.title or self.prompt or 'Claude 任务'
        return ' '.join(name.split())[:90]

    def finish(self, at, notify):
        self.state = 'done'
        if notify and at > time.time() - 120:
            self.events.append({'key': f'{self.id}:{int(at)}:done', 'state': 'done',
                                'label': self.label[:70], 'threadId': self.id})

    def parse(self, obj, notify):
        kind = obj.get('type')
        if kind == 'custom-title':
            self.title = obj.get('customTitle') or self.title
            return
        if kind == 'ai-title':
            if not self.title:
                self.title = obj.get('aiTitle') or ''
            return
        if kind not in ('user', 'assistant') or obj.get('isSidechain'):
            return
        at = stamp(obj.get('timestamp'))
        self.at = max(self.at, at)
        if obj.get('cwd'):
            self.project = Path(obj['cwd']).name
        message = obj.get('message') or {}
        if kind == 'user':
            content = message.get('content')
            is_result = isinstance(content, list) and any(isinstance(p, dict) and p.get('type') == 'tool_result' for p in content)
            if not is_result and not obj.get('isMeta'):
                text = text_of(content).strip()
                if text and not text.startswith('<'):
                    self.prompt = text
                    self.started = at
            self.state = 'working'
            return
        usage = message.get('usage') or {}
        if usage:
            last = sum(usage.get(k) or 0 for k in ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'))
            self.tokens = last + (usage.get('output_tokens') or 0)
            self.context = min(100, round(last / (200000 if last <= 200000 else 1000000) * 100))
        stop = message.get('stop_reason')
        if stop == 'end_turn':
            self.finish(at, notify)
        elif stop:
            self.state = 'working'

    def scan(self):
        initial = self.offset == 0
        try:
            size = self.path.stat().st_size
            if size < self.offset:
                self.offset, self.state = 0, 'unknown'
                initial = True
            if initial and size > 4_000_000:
                # Long logs: only the tail matters for current state.
                self.offset = size - 2_000_000
            with self.path.open('rb') as file:
                file.seek(self.offset)
                if initial and self.offset:
                    self.offset += len(file.readline())
                for line in file:
                    if not line.endswith(b'\n'):
                        break
                    self.offset += len(line)
                    try:
                        self.parse(json.loads(line), not initial or self.notify_initial)
                    except (ValueError, TypeError, AttributeError):
                        continue
        except OSError:
            self.state = 'unknown'

    def snapshot(self, now):
        state = self.state
        if state == 'working' and now - self.at > 600:
            state = 'unknown'
        title = self.label if not self.project else f'{self.label} · {self.project}'
        return {'id': self.id, 'title': title[:90], 'state': state,
                'startedAt': self.started * 1000, 'updatedAt': self.at * 1000,
                'tokens': self.tokens, 'contextPercent': self.context, 'plan': None, 'attention': None}


class Observer:
    def __init__(self, claude_home=CLAUDE_HOME):
        self.home = claude_home / 'projects'
        self.sessions = {}
        self.problem = ''
        self.primed = False

    def scan(self):
        try:
            cutoff = time.time() - 3 * 86400
            paths = []
            for path in self.home.glob('*/*.jsonl'):
                try:
                    mtime = path.stat().st_mtime
                except OSError:
                    continue
                if mtime > cutoff:
                    paths.append((mtime, path))
            paths = [p for _, p in sorted(paths, reverse=True)[:40]]
            keep = {str(p) for p in paths}
            self.sessions = {k: v for k, v in self.sessions.items() if k in keep}
            for path in paths:
                session = self.sessions.setdefault(str(path), Session(path, notify_initial=self.primed))
                session.scan()
            self.problem = ''
            self.primed = True
        except OSError:
            self.problem = '任务数据暂不可用'
        now = time.time()
        tasks = [s.snapshot(now) for s in self.sessions.values() if s.at]
        tasks.sort(key=lambda t: (t['state'] not in ('working', 'waiting'), -t['updatedAt']))
        events = [event for s in self.sessions.values() for event in s.events]
        for s in self.sessions.values():
            s.events.clear()
        return tasks, events


def main():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(STATE, 0o700)
    stop, refresh = threading.Event(), threading.Event()
    lock = threading.Lock()
    current = {'windows': [], 'liveAt': None, 'live': False, 'liveProblem': '正在连接 Claude'}
    try:
        cached = json.loads((STATE / 'usage.json').read_text())
        current.update(cached)
        current['live'] = False
    except (OSError, ValueError):
        pass

    def poll_account():
        while not stop.is_set():
            try:
                data = normalize_usage(fetch_usage())
                data.update(live=True, liveProblem='')
                with lock:
                    current.clear()
                    current.update(data)
                tmp = STATE / 'usage.tmp'
                tmp.write_text(json.dumps(data))
                os.chmod(tmp, 0o600)
                tmp.replace(STATE / 'usage.json')
            except Exception as error:
                reason = str(error)
                problem = ('未登录 Claude Code，请在终端运行 claude 登录' if reason == 'signed-out' else
                           '登录已过期，打开 Claude Code 发一条消息即可刷新' if reason == 'expired' else
                           '同步失败，请检查网络连接')
                with lock:
                    current.update(live=False, liveProblem=problem)
            refresh.wait(60)
            refresh.clear()

    def input_loop():
        for line in sys.stdin:
            if line.strip() == 'refresh':
                refresh.set()
        stop.set()
        refresh.set()

    def shutdown(*_):
        stop.set()
        refresh.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    threading.Thread(target=poll_account, daemon=True).start()
    threading.Thread(target=input_loop, daemon=True).start()
    observer = Observer()
    try:
        while not stop.is_set():
            tasks, events = observer.scan()
            with lock:
                payload = dict(current)
            payload.update(now=time.time() * 1000, tasks=tasks, events=events, taskProblem=observer.problem)
            print(json.dumps(payload, ensure_ascii=False), flush=True)
            stop.wait(2)
    except BrokenPipeError:
        pass
    finally:
        stop.set()


if __name__ == '__main__':
    main()
