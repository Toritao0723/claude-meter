// Task names stay in stable rows; only the quota panel carries the pet animation.
(() => {
  const root = document.documentElement, box = document.getElementById('bubble');
  const native = window.webkit?.messageHandlers?.meter;
  const post = message => native?.postMessage(message);
  const words = { working:'进行中', done:'已完成', waiting:'待回复', warning:'额度提醒', error:'出错', interrupted:'已中断', unknown:'待确认' };
  let theme = 'auto';
  function applyTheme() {
    root.dataset.theme = theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  }
  function show(data) {
    theme = data.theme || 'auto'; applyTheme();
    box.dataset.state = data.state;
    document.getElementById('heading').textContent = data.heading || '任务状态';
    const list = document.getElementById('taskItems');
    const focused = document.activeElement?.dataset?.id;
    list.replaceChildren();
    for (const task of data.items || []) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'task-item'; row.dataset.id = task.id || '';
      row.dataset.state = task.attention ? 'waiting' : task.state;
      const title = document.createElement('span'); title.className = 'name'; title.textContent = task.title || 'Claude 任务';
      const status = document.createElement('span'); status.className = 'state';
      status.textContent = task.attention === 'approval' ? '待批准' : task.attention ? '待回复' : words[task.state] || '待确认';
      row.title = `${title.textContent} · ${status.textContent}`;
      row.append(title,status);
      row.disabled = !task.id;
      row.addEventListener('click', () => task.id && post({type:'openTask',id:task.id}));
      list.append(row);
      if (focused && focused === task.id) row.focus({preventScroll:true});
    }
    box.classList.add('on');
    requestAnimationFrame(() => post({type:'bubbleSize',h:Math.ceil(box.offsetHeight)}));
  }
  window.bubble = { show, hide:()=>box.classList.remove('on') };
  matchMedia('(prefers-color-scheme: light)').addEventListener('change',applyTheme);
  const q = new URLSearchParams(location.search);
  if(q.has('state')) {
    const state=q.get('state'), waiting=state==='waiting';
    show({state,theme:q.get('theme')||'dark',heading:waiting?'需要你回复':'2 个任务进行中',items:[
      {id:'00000000-0000-4000-8000-000000000001',title:'监控 Claude 用量',state:'working',attention:waiting?'reply':null},
      {id:'00000000-0000-4000-8000-000000000002',title:'制定千美元创业变现方案',state:'working'}
    ]});
  }
})();
