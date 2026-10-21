(() => {
  'use strict';
  const bank = window.QUESTION_BANK;
  const $ = (selector) => document.querySelector(selector);
  if (!bank?.questions?.length) {
    $('#question').textContent = '题库加载失败，请刷新页面重试。';
    return;
  }
  const KEY = 'midpoint-whisper:v1';
  const types = [['all', '全部'], ['judge', '判断'], ['choice', '选择'], ['blank', '填空'], ['code', '程序填空']];
  const icons = {
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const inline = (text) => text.split(/(`[^`]+`)/g).map((part) => part.startsWith('`') && part.endsWith('`')
    ? `<code>${escape(part.slice(1, -1))}</code>`
    : escape(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_([^_\n]+)_/g, '<em>$1</em>')).join('');
  function markdown(text) {
    return String(text).split(/(```[^\n]*\n[\s\S]*?```)/g).map((block) => {
      if (block.startsWith('```')) return `<pre><code>${escape(block.replace(/^```[^\n]*\n/, '').replace(/```$/, '').trimEnd())}</code></pre>`;
      return block.trim().split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`).join('');
    }).join('');
  }
  const defaults = () => ({records: {}, drafts: {}, stars: [], settings: {mode: 'practice', chapter: 1, type: 'all', order: 'sequence', cursor: null}});
  const validIds = new Set(bank.questions.map((q) => q.id));
  let data = defaults();
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.records && typeof saved.records === 'object' && !Array.isArray(saved.records)) {
        for (const [id, record] of Object.entries(saved.records)) {
          if (validIds.has(id) && record && typeof record.correct === 'boolean') data.records[id] = record;
        }
      }
      if (saved.drafts && typeof saved.drafts === 'object') {
        for (const [id, draft] of Object.entries(saved.drafts)) if (validIds.has(id) && typeof draft === 'string') data.drafts[id] = draft;
      }
      if (Array.isArray(saved.stars)) data.stars = [...new Set(saved.stars.filter((id) => validIds.has(id)))];
      const s = saved.settings || {};
      if (['practice', 'wrong', 'favorites'].includes(s.mode)) data.settings.mode = s.mode;
      if ([0, 1, 2, 3, 4].includes(s.chapter)) data.settings.chapter = s.chapter;
      if (types.some(([id]) => id === s.type)) data.settings.type = s.type;
      if (['sequence', 'random'].includes(s.order)) data.settings.order = s.order;
      if (validIds.has(s.cursor)) data.settings.cursor = s.cursor;
    }
  } catch { storageAvailable = false; }
  let questions = [];
  let index = 0;
  const revealed = new Set();
  const retrying = new Set();
  let toastTimer;
  function toast(text) {
    clearTimeout(toastTimer);
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3000);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('#save-status').classList.toggle('warning', !storageAvailable);
    $('#save-status').textContent = storageAvailable ? '进度已保存' : '本地保存不可用，当前进度仅在本页面有效';
    $('#save-status').title = storageAvailable ? '答题、收藏和草稿已保存在当前浏览器，清除网站数据会清空进度。' : '浏览器阻止了存储或空间已满，当前进度仅在此页面内有效。';
  }
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  function filterQuestions(restore = false) {
    const s = data.settings;
    questions = bank.questions.filter((q) => (!s.chapter || q.chapter === s.chapter) && (s.type === 'all' || q.type === s.type)
      && (s.mode !== 'wrong' || data.records[q.id]?.correct === false)
      && (s.mode !== 'favorites' || data.stars.includes(q.id)));
    if (s.order === 'random') shuffle(questions);
    index = restore ? Math.max(0, questions.findIndex((q) => q.id === s.cursor)) : 0;
    data.settings.cursor = questions[index]?.id || null;
    save();
    render();
  }
  const current = () => questions[index];
  const chapterName = (id) => bank.chapters.find((c) => c.id === id)?.name || '全部章节';
  function renderNavigation() {
    const s = data.settings;
    const wrong = Object.values(data.records).filter((r) => r.correct === false).length;
    $('#main-nav').innerHTML = [['practice', '练习', 0], ['wrong', '错题', wrong], ['favorites', '收藏', data.stars.length]]
      .map(([id, label, count]) => `<button class="nav-button ${s.mode === id ? 'active' : ''}" data-mode="${id}" aria-pressed="${s.mode === id}">${label}${count ? `<span class="nav-badge">${count}</span>` : ''}</button>`).join('');
    $('#chapter').innerHTML = [{id: 0, name: '全部章节'}, ...bank.chapters].map((c) => `<option value="${c.id}">${c.id ? String(c.id).padStart(2, '0') + ' ' : ''}${escape(c.name)}</option>`).join('');
    $('#chapter').value = s.chapter;
    $('#type-tabs').innerHTML = types.map(([id, label]) => `<button class="type-button ${s.type === id ? 'active' : ''}" data-type="${id}" aria-pressed="${s.type === id}">${label}</button>`).join('');
    $('#order').value = s.order;
    const scored = questions.filter((q) => !q.referenceOnly);
    const done = scored.filter((q) => data.records[q.id]).length;
    $('#progress-text').textContent = `已答 ${done}/${scored.length}`;
    $('#progress-text').title = '当前范围的答题进度，不含仅供查阅的题目';
    $('#nav-count').textContent = `${questions.length} 题`;
    $('#number-grid').innerHTML = questions.map((q, i) => {
      const result = data.records[q.id];
      const status = q.referenceOnly ? 'reference' : result ? result.correct ? 'correct' : 'wrong' : '';
      const label = q.referenceOnly ? '仅供查阅' : result ? result.correct ? '已掌握' : '待复习' : '未作答';
      return `<button class="number-button ${status} ${i === index ? 'current' : ''} ${data.stars.includes(q.id) ? 'saved' : ''}" data-index="${i}" ${i === index ? 'aria-current="step"' : ''} aria-label="第 ${i+1} 题，${chapterName(q.chapter)}，${q.label} ${q.number}，${label}">${i + 1}</button>`;
    }).join('');
    $('#previous').disabled = index <= 0;
    $('#next').disabled = index >= questions.length - 1;
    $('#position').textContent = questions.length ? `${index + 1} / ${questions.length}` : '0 / 0';
    $('.pagination').hidden = !questions.length;
  }
  function renderQuestion() {
    const q = current();
    if (!q) {
      const s = data.settings;
      const filtered = s.chapter !== 0 || s.type !== 'all';
      const title = filtered ? '这个范围内还没有题目' : s.mode === 'wrong' ? '暂时没有错题' : '还没有收藏题目';
      const description = filtered ? '试试其他章节或题型。' : s.mode === 'wrong' ? '答错或标记为「需要复习」的题目会出现在这里。' : '点击题目右上角的星标，把好题留在这里。';
      $('#question').innerHTML = `<div class="empty-state"><h3>${title}</h3><p>${description}</p><button class="button" data-action="${filtered ? 'clear-filters' : 'practice'}">${filtered ? '查看全部范围' : '开始练习'}</button></div>`;
      return;
    }
    const result = !retrying.has(q.id) ? data.records[q.id] : null;
    const isObjective = q.type === 'judge' || q.type === 'choice';
    const options = q.type === 'judge' ? [{key: 'T', text: '正确'}, {key: 'F', text: '错误'}] : q.options;
    const draft = data.drafts[q.id] || '';
    const hasStar = data.stars.includes(q.id);
    const source = q.source.split('/').map(encodeURIComponent).join('/');
    let input = '';
    if (isObjective) {
      input = `<div class="options ${q.type === 'judge' ? 'judge-options' : ''}" role="group" aria-label="选择答案">${options.map((o) => `<button class="option ${draft === o.key ? 'selected' : ''} ${result && o.key === q.answer ? 'is-correct' : ''} ${result && draft === o.key && !result.correct ? 'is-wrong' : ''}" data-option="${o.key}" aria-pressed="${draft === o.key}" ${result ? 'aria-disabled="true"' : ''}><span class="option-key">${o.key}</span><span class="markdown">${inline(o.text).replace(/\n/g, '<br>')}</span></button>`).join('')}</div>`;
    } else if (!q.referenceOnly) {
      input = `<label for="response" class="answer-label">你的答案</label><textarea id="response" ${q.type === 'code' ? 'class="code-input" spellcheck="false"' : ''} ${result ? 'readonly' : ''} placeholder="按空号顺序填写">${escape(draft)}</textarea>`;
    }
    let feedback = '';
    if (result || revealed.has(q.id)) {
      const heading = q.referenceOnly ? '原笔记说明' : result ? result.correct ? '回答正确' : '需要复习' : '参考答案';
      feedback = `<div class="feedback ${result ? result.correct ? 'correct' : 'wrong' : 'neutral'}" role="status"><p class="feedback-heading">${heading}</p><div class="markdown">${isObjective ? `<p>正确答案：<strong>${escape(q.answer)}${q.type === 'judge' ? q.answer === 'T' ? ' · 正确' : ' · 错误' : ''}</strong></p>` : markdown(q.answer)}</div>${!isObjective && !q.referenceOnly && !result ? '<div class="action-row"><button class="button success" data-rate="correct">已掌握</button><button class="button secondary" data-rate="wrong">需要复习</button></div>' : ''}</div>`;
    }
    const action = result ? '<button class="button secondary" data-action="retry">重新作答</button>' : isObjective
      ? `<button id="submit" class="button" data-action="submit" ${!draft ? 'disabled' : ''}>提交答案</button>`
      : !revealed.has(q.id) ? `<button class="button" data-action="reveal">${q.referenceOnly ? '查看原笔记说明' : '查看答案'}</button>` : '';
    $('#question').innerHTML = `<article class="question-card"><div class="question-meta"><span>${q.label} · 第 ${q.number} 题${data.settings.chapter ? '' : ' · ' + escape(chapterName(q.chapter))}</span><button class="star-button ${hasStar ? 'starred' : ''}" data-action="star" aria-label="${hasStar ? '取消收藏' : '收藏此题'}" aria-pressed="${hasStar}">${svg('star')}<span>${hasStar ? '已收藏' : '收藏'}</span></button></div>${q.type === 'code' ? `<h3 class="question-title">${escape(q.title)}</h3>` : ''}<div class="markdown prompt">${markdown(q.prompt)}</div>${q.referenceOnly && q.note ? `<div class="note">${escape(q.note)}</div>` : ''}${input}${action ? `<div class="action-row">${action}</div>` : ''}${feedback}${feedback ? `<details class="source-row"><summary>原始笔记</summary><a href="./${source}" target="_blank" rel="noopener">${escape(chapterName(q.chapter))} · ${q.label} ${q.number}</a></details>` : ''}</article>`;
  }
  function render() { renderNavigation(); renderQuestion(); }
  function goTo(nextIndex) {
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    index = nextIndex;
    data.settings.cursor = current().id;
    save();
    render();
    $('#question').focus({preventScroll: true});
    if ($('#question').getBoundingClientRect().top < 0) $('#question').scrollIntoView({block: 'start'});
  }
  function grade(correct) {
    const q = current();
    if (!q || q.referenceOnly) return;
    data.records[q.id] = {correct, response: data.drafts[q.id] || '', attempts: (data.records[q.id]?.attempts || 0) + 1};
    retrying.delete(q.id);
    save();
    render();
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.mode) {
      data.settings.mode = button.dataset.mode;
      data.settings.chapter = 0;
      data.settings.type = 'all';
      filterQuestions();
    } else if (button.dataset.type) {
      data.settings.type = button.dataset.type;
      filterQuestions();
    } else if (button.dataset.index !== undefined) {
      $('#question-nav').close();
      goTo(Number(button.dataset.index));
    } else if (button.dataset.option) {
      if (data.records[current().id] && !retrying.has(current().id)) return;
      data.drafts[current().id] = button.dataset.option;
      save();
      renderQuestion();
      $(`[data-option="${button.dataset.option}"]`)?.focus({preventScroll: true});
    } else if (button.dataset.rate) {
      grade(button.dataset.rate === 'correct');
    } else if (button.dataset.action) {
      const action = button.dataset.action;
      if (action === 'star') {
        const id = current().id;
        data.stars = data.stars.includes(id) ? data.stars.filter((savedId) => savedId !== id) : [...data.stars, id];
        save(); render();
        toast(data.stars.includes(id) ? '已加入收藏' : '已取消收藏');
      } else if (action === 'submit') {
        if (data.drafts[current().id]) grade(data.drafts[current().id] === current().answer);
      } else if (action === 'reveal') {
        revealed.add(current().id); renderQuestion();
      } else if (action === 'retry') {
        retrying.add(current().id);
        revealed.delete(current().id);
        data.drafts[current().id] = '';
        save(); renderQuestion();
      } else if (action === 'clear-filters') {
        data.settings.chapter = 0; data.settings.type = 'all'; filterQuestions();
      } else if (action === 'practice') {
        data.settings.mode = 'practice'; data.settings.chapter = 1; data.settings.type = 'all'; filterQuestions();
      }
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.id === 'response' && current()) { data.drafts[current().id] = event.target.value; save(); }
  });
  $('#order').addEventListener('change', (event) => { data.settings.order = event.target.value; filterQuestions(); });
  $('#chapter').addEventListener('change', (event) => { data.settings.chapter = Number(event.target.value); filterQuestions(); });
  $('#open-navigator').addEventListener('click', () => {
    $('#question-nav').showModal();
    $('.number-button.current')?.scrollIntoView({block: 'nearest'});
  });
  $('#close-navigator').addEventListener('click', () => $('#question-nav').close());
  $('#previous').addEventListener('click', () => goTo(index - 1));
  $('#next').addEventListener('click', () => goTo(index + 1));
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || $('#question-nav').open) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); goTo(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) toast('另一页面更新了进度，刷新后可载入最新记录。');
  });
  filterQuestions(true);
})();
