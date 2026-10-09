// Claude Meter activity companion. Original pixel character © 2026 Bon Yeung.
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const card = $('card'), lane = $('lane'), laneBox = $('laneBox');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.meter;
  const post = msg => native && native.postMessage(msg);

  const TICK = 150;
  const S = { d: null, colors: {}, sized: false, sceneOffset: 0 };
  const tasks = new window.TaskNavigation();
  const L = (zh, en) => S.lang === 'en' ? en : zh;
  // The bridge sends Chinese window labels; English is looked up by window id.
  const windowEn = { five_hour:'5-hour limit', seven_day:'Weekly limit', seven_day_opus:'Weekly Opus limit', seven_day_sonnet:'Weekly Sonnet limit' };
  const windowLabel = w => (S.lang === 'en' && windowEn[w.id]) || w.label;

  // ---------- data in ----------

  function update(d) {
    const windows = d.windows || [];
    d.session = windows[0] || { known: false, idle: true, percentUsed: 0 };
    d.weekly = windows[1] || windows[0] || { known: false };
    S.d = d;
    S.lang = d.lang || S.lang || 'zh';
    applyLanguage();
    S.sceneOffset = d.sceneOffset ?? S.sceneOffset;
    applyTheme(d.theme || 'dark');
    root.classList.toggle('mini', !!d.mini);
    root.classList.toggle('minimized', !!d.minimized);
    tasks.update(d.taskNav?.items || []);
    renderNavigation();
    $('sizeBtn').setAttribute('aria-label', d.mini ? L('展开完整面板', 'Expand full panel') : L('紧凑模式', 'Compact mode'));
    $('sizeBtn').title = d.mini ? L('展开完整面板', 'Expand full panel') : L('紧凑模式', 'Compact mode');
    $('sizeBtn').innerHTML = d.mini
      ? '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1h6v6H1zM2 3v3h4V3z" fill-rule="evenodd"/></svg>'
      : '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1 1h6v6H1zM2 2v4h4V2zM2 4h4v1H2z" fill-rule="evenodd"/></svg>';

    laneBox.title = d.minimized ? L('点击小螃蟹恢复面板；拖动可移动', 'Click the crab to restore the panel; drag to move') : L('进行中每 16 秒换一个忙碌场景，也可以点击切换。等待时听歌，完成时撒花。', 'While working, the scene changes every 16 s — click to switch. Music while waiting, confetti when done.');
    renderText();
    draw();                     // paint the lane straight away, not on the next tick
    reportSize();
  }

  function renderNavigation() {
    const item = tasks.current(), nav = $('taskNav');
    nav.hidden = !item;
    card.classList.toggle('has-tasks', !!item);
    if (!item) return;
    const state = tasks.needsReply(item) ? 'waiting' : item.state;
    const labels = S.lang === 'en'
      ? { working:'Working', waiting:'Needs reply', done:'Done', error:'Error', interrupted:'Interrupted', warning:'Quota alert' }
      : { working:'进行中', waiting:'待回复', done:'已完成', error:'出错', interrupted:'已中断', warning:'额度提醒' };
    nav.dataset.state = state;
    $('taskState').textContent = labels[state] || L('任务', 'Task');
    $('taskTitle').textContent = item.title;
    $('taskTitle').title = item.title;
    $('taskTitle').disabled = !item.id;
    $('taskTitle').setAttribute('aria-label', `${labels[state] || L('任务', 'Task')}${L('：', ': ')}${item.title}${item.id ? L('，打开任务', ', open task') : ''}`);
    $('taskPages').hidden = tasks.items.length < 2;
    $('taskIndex').textContent = `${tasks.index() + 1}/${tasks.items.length}`;
    nav.setAttribute('aria-label', `${L('任务导航，', 'Task navigation, ')}${tasks.index() + 1}/${tasks.items.length}`);
  }

  function applyLanguage() {
    root.lang = S.lang === 'en' ? 'en' : 'zh-Hans';
    const next = S.lang === 'en' ? '中' : 'EN';
    $('langBtn').textContent = next;
    $('langBtn').title = $('langBtn').ariaLabel = S.lang === 'en' ? '切换到中文' : 'Switch to English';
    $('leftUnit').textContent = L('% 剩余', '% left');
    $('resetLabel').textContent = L('重置倒计时', 'Resets in');
  }

  function applyTheme(t) {
    const resolved = t === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
    if (root.dataset.theme !== resolved) { root.dataset.theme = resolved; S.colors = {}; }
  }

  // ---------- words and numbers ----------

  const pad = n => String(n).padStart(2, '0');
  function countdown(msLeft) {
    if (msLeft <= 0) return '0m';
    const m = Math.floor(msLeft / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return `${d}d ${h % 24}h`;
    if (h >= 1) return `${h}h ${pad(m % 60)}m`;
    return `${m}m ${pad(Math.floor(msLeft / 1000) % 60)}s`;
  }
  function clock(ms, withDay) {
    const t = new Date(ms);
    const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sameDay = t.toDateString() === new Date().toDateString();
    return withDay || !sameDay ? `${t.toLocaleDateString([], { weekday: 'short' })} ${time}` : time;
  }
  function mood() {
    const s = S.d.session || {};
    if (!s.known) return 'idle';
    if (s.percentUsed >= 100) return 'out';
    if (s.percentUsed >= 90) return 'warn';
    if (s.percentUsed >= 80) return 'close';
    return 'ok';
  }

  function renderText() {
    const d = S.d, s = d.session || {};
    const used = s.idle ? 0 : s.percentUsed;
    // Round "left" down so it never claims more than you really have.
    $('left').textContent = s.known ? Math.max(0, Math.floor(100 - used)) : '--';
    $('plan').textContent = (s.label && windowLabel(s)) || L('额度未提供', 'No quota data');

    card.dataset.mood = mood();

    // Weekly: fill = used, right end = the limit, which resets at the time shown under it.
    const w = d.weekly || {};
    $('wLabel').textContent = (w.label && windowLabel(w)) || L('额度明细', 'Quota details');
    if (w.known && !w.idle) {
      const wUsed = Math.min(100, Math.ceil(w.percentUsed));
      $('wFill').style.width = `${wUsed}%`;
      $('wLeft').textContent = L(`剩余 ${100 - wUsed}%`, `${100 - wUsed}% left`);
      $('wUsed').textContent = L(`已用 ${wUsed}%`, `${wUsed}% used`);
      $('wReset').textContent = w.resetsAt ? L(`重置 ${clock(w.resetsAt, true)}`, `Resets ${clock(w.resetsAt, true)}`) : L('重置时间未提供', 'No reset time');
    } else {
      $('wFill').style.width = '0%';
      $('wLeft').textContent = '--';
      $('wUsed').textContent = L('已用 --', '-- used');
      $('wReset').textContent = L('等待账户数据', 'Waiting for account data');
    }

    $('syncBtn').classList.remove('spinning');
    secondTick();
  }

  // Runs every second so the countdown is live between data updates.
  function secondTick() {
    if (!S.d) return;
    const s = S.d.session || {};
    if (s.idle || !s.resetsAt) {
      $('count').textContent = '--';
      $('resetAt').textContent = L('时间未提供', 'No reset time');
    } else {
      $('count').textContent = countdown(s.resetsAt - Date.now());
      $('resetAt').textContent = L(`于 ${clock(s.resetsAt)}`, `at ${clock(s.resetsAt)}`);
    }
    liveStatus();
  }

  // "● LIVE · updated 20s ago" when the numbers come straight from your account (refreshed every minute).
  // Anything else is shown in pink as NOT LIVE, so a stale number can never pass for a real one.
  const since = ms => {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return L(`${s} 秒`, `${s}s`);
    const m = Math.round(s / 60);
    return m < 60 ? L(`${m} 分钟`, `${m} min`) : L(`${Math.round(m / 60)} 小时`, `${Math.round(m / 60)} h`);
  };
  // Why the last refresh failed: a short reason for the footer, and what to do about it for the tooltip.
  const problems = {
    'signed-out':    [['请先登录 Claude Code', 'sign in to Claude Code'], ['这台 Mac 上的 Claude Code 还没有安装或登录（和 Claude 应用的登录是两回事）：运行 README 里的 setup-claude-code.sh 一条命令即可', 'Claude Code is not installed or signed in on this Mac (a separate login from the Claude app): run the one setup-claude-code.sh command from the README']],
    'login-expired': [['登录已过期', 'login expired'],     ['自动续期未成功：检查网络节点，或在终端运行 claude auth login', 'Auto-renew did not work: check your proxy region, or run "claude auth login" in a terminal']],
    'expired':       [['登录已过期', 'login expired'],     ['右键菜单里打开「自动续期登录」', 'Turn on "Auto-renew sign-in" in the right-click menu']],
    'http 403':      [['地区受限', 'region blocked'],      ['Anthropic 不支持当前网络地区：请换到支持地区的代理节点', 'Anthropic blocks this region: switch your proxy to a supported one']],
    'http 429':      [['请求太频繁', 'rate limited'],      ['请求过于频繁，稍后会自动重试', 'Too many requests: it will retry by itself shortly']],
    'network':       [['网络不通', 'no connection'],       ['检查网络连接或代理', 'Check your internet connection or proxy']],
  };
  function liveStatus() {
    const d = S.d;
    const live = d.live && d.liveAt && Date.now() - d.liveAt < 180000;
    const last = d.liveAt || d.syncedAt;
    const foot = $('foot'), mini = $('miniLive');
    card.dataset.stale = String(!live);
    $('quota').title = L(`剩余额度 ${$('left').textContent}% · ${live ? '实时' : '待同步'}${last ? ` · ${since(last)}前更新` : ''}`, `${$('left').textContent}% left · ${live ? 'live' : 'not synced'}${last ? ` · updated ${since(last)} ago` : ''}`);
    for (const el of [foot, mini]) { el.classList.toggle('live', !!live); el.classList.toggle('stale', !live); }
    const problem = problems[d.liveProblemCode];
    foot.title = !live && problem ? L(...problem[1]) : '';
    if (live) {
      foot.innerHTML = L(`<i class="dot"></i><b>实时</b> · ${since(d.liveAt)}前更新`, `<i class="dot"></i><b>Live</b> · updated ${since(d.liveAt)} ago`);
      mini.innerHTML = L(`<i class="dot"></i>实时 · ${since(d.liveAt)}前`, `<i class="dot"></i>Live · ${since(d.liveAt)} ago`);
    } else {
      const why = problem ? L(...problem[0]) : last ? L(`上次 ${since(last)}前`, `last ${since(last)} ago`) : L('点击刷新', 'click to refresh');
      foot.innerHTML = `<b>${L('待同步', 'Not synced')}</b> · ${why}`;
      mini.innerHTML = L('待同步', 'Not synced');   // compact bar is narrow: status word only, the time stays in the tooltip and full panel
    }
  }

  function reportSize() {
    requestAnimationFrame(() => {
      S.sized = true;
      // macOS draws the soft window shadow outside the native glass surface.
      post({ type: 'size', w: Math.ceil(card.offsetWidth), h: Math.ceil(card.offsetHeight) });
    });
  }

  // Task activity owns the character; quota remains a separate, factual meter.
  function activity() {
    if (S.d?.activity) return S.d.activity;
    if (S.d?.taskProblem) return { state:'unknown' };
    const tasks = S.d?.tasks || [];
    return { state:tasks.some(t=>t.state==='waiting')?'waiting':tasks.some(t=>t.state==='working')?'working':'idle' };
  }
  function draw() {
    if (!S.d) return;
    const state = activity().state;
    const scene = window.CrabPet.draw(lane, { scene:native ? undefined : S.d.previewScene, state, time:Date.now(), theme:root.dataset.theme, reduced:reduce, offset:S.sceneOffset });
    const statuses = S.lang === 'en'
      ? { working:'Working', waiting:'Waiting for you', idle:'Resting', done:'Turn finished', error:'Task error', interrupted:'Interrupted', warning:'Quota alert', unknown:'Checking status' }
      : { working:'任务进行中', waiting:'等待你回复', idle:'休息中', done:'本轮已完成', error:'任务出错', interrupted:'已中断', warning:'额度提醒', unknown:'状态待确认' };
    $('petTitle').textContent = (S.lang === 'en' ? window.CrabPet.titlesEn : window.CrabPet.titles)[scene] || '';
    $('petStatus').textContent = statuses[state] || statuses.unknown;
    laneBox.setAttribute('aria-label', S.d.minimized ? L('展开额度与任务面板', 'Expand quota and task panel') : `${$('petTitle').textContent}${L('，', ', ')}${$('petStatus').textContent}${L('，点击切换忙碌动作', ', click to switch scene')}`);
  }

  // ---------- interaction ----------

  for (const button of document.querySelectorAll('button')) button.addEventListener('pointerdown', () => post({ type:'nodrag' }));
  $('taskTitle').addEventListener('click', () => { if (tasks.current()?.id) post({ type:'openTask', id:tasks.current().id }); });
  for (const [id, delta] of [['prevTask', -1], ['nextTask', 1]]) $(id).addEventListener('click', () => { tasks.move(delta); renderNavigation(); });
  $('syncBtn').addEventListener('click', () => {
    $('syncBtn').classList.add('spinning');          // spins until the fresh numbers arrive
    if (native) post({ type: 'sync' });
    else setTimeout(() => update({ ...S.d, live: true, liveAt: Date.now() }), 900);
  });
  $('sizeBtn').addEventListener('click', () => {
    const next = !root.classList.contains('mini');
    if (native) post({ type: 'mini', value: next });
    else update({ ...S.d, mini: next });
  });
  function setMinimized(value) {
    if (native) post({ type:'minimized', value });
    else update({ ...S.d, minimized:value });
  }
  $('minimizeBtn').addEventListener('click', () => setMinimized(true));
  $('langBtn').addEventListener('click', () => {
    const next = S.lang === 'en' ? 'zh' : 'en';
    if (native) post({ type:'lang', value:next });
    else update({ ...S.d, lang:next });
  });
  function nextScene() {
    if (S.d?.minimized) { setMinimized(false); return; }
    S.sceneOffset = (S.sceneOffset + 1) % window.CrabPet.busy.length;
    if (native) post({ type:'petScene', offset:S.sceneOffset });
    draw();
  }
  laneBox.addEventListener('click', nextScene);
  laneBox.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); nextScene(); } });

  setInterval(draw, TICK);
  setInterval(secondTick, 1000);
  // Recalculate the mood and sentences each minute even if no new data arrives.
  setInterval(() => S.d && update(S.d), 60000);

  window.meter = { update };
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change',()=>{ if(S.d?.theme==='auto') update(S.d); });

  // ---------- demo data for a plain browser ----------
  if (!native) {
    const q = new URLSearchParams(location.search);
    const now = Date.now(), H = 3600e3;
    const states = {
      ok:    { percentUsed: 23, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H },
      close: { percentUsed: 46, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H },
      warn:  { percentUsed: 71, startsAt: now - 2.5 * H, resetsAt: now + 2.5 * H, emptyAt: now + 1.2 * H },
      out:   { percentUsed: 100, startsAt: now - 4 * H, resetsAt: now + 1 * H },
      idle:  { idle: true, percentUsed: 0 },
    };
    const en = q.get('lang') === 'en';
    const session = { kind: 'session', known: true, idle: false, ...states[q.get('state') || 'ok'] };
    update({
      now, plan: 'Pro', syncedAt: now - 12 * 60e3, live: q.get('live') !== '0', liveAt: now - 20e3, liveProblemCode: q.get('problem') || undefined,
      lang: q.get('lang') || 'zh', theme: q.get('theme') || 'dark', mini: q.get('mini') === '1', minimized:q.get('minimized') === '1',
      taskNav:{ items:q.get('activity') === 'idle' ? [] : [
        { id:'00000000-0000-0000-0000-000000000001', title:en ? 'Demo · Polish the crab companion' : '演示 · 优化小螃蟹桌面伴侣', state:q.get('activity') || 'working' },
        { id:'00000000-0000-0000-0000-000000000002', title:en ? 'Demo · Draft the project plan' : '演示 · 制定项目计划', state:'working' },
      ] },
      activity: { state:q.get('activity') || 'working' }, previewScene:q.get('scene'),
      windows: [{...session, id:'five_hour', label:'5 小时额度'}, { id:'seven_day', label:'每周额度', known:true, percentUsed:40, resetsAt:now + 2 * 24 * H }],
      session,
    });
  }
})();
