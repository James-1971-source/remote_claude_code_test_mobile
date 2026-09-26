(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const gutter = $('gutter');
  const findbar = $('findbar');
  const findInput = $('findInput');
  const replaceInput = $('replaceInput');
  const matchCase = $('matchCase');
  const fileInput = $('fileInput');

  const STORAGE_KEY = 'colorNotepad.v1';
  const APP_NAME = '컬러 메모장';
  const BASE_FONT = 16;

  const state = {
    fileName: '제목 없음.txt',
    fileHandle: null,
    savedText: '',
    wrap: window.innerWidth < 600,
    statusBar: true,
    lineNumbers: true,
    zoom: 100,
    theme: 'ocean',
    fontFamily: 'Consolas, "D2Coding", "Courier New", monospace',
    fontSize: BASE_FONT,
    fontWeight: 'normal',
    fontStyle: 'normal',
    customColors: null, // { fg, bg }
  };

  /* ---------- 저장소 ---------- */
  function safeGet() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }
  function persist() {
    try {
      const { fileHandle, ...rest } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, text: editor.value }));
      $('stSaved').textContent = '자동 저장됨';
    } catch { $('stSaved').textContent = '자동 저장 불가'; }
  }
  let persistTimer;
  function schedulePersist() {
    $('stSaved').textContent = '저장 중...';
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 400);
  }

  /* ---------- 실행 취소 / 다시 실행 ---------- */
  const history = { stack: [], index: -1, timer: null, max: 500 };
  function snapshot() {
    const cur = history.stack[history.index];
    if (cur && cur.text === editor.value) return;
    history.stack.splice(history.index + 1);
    history.stack.push({ text: editor.value, start: editor.selectionStart, end: editor.selectionEnd });
    if (history.stack.length > history.max) history.stack.shift();
    history.index = history.stack.length - 1;
  }
  function scheduleSnapshot() {
    clearTimeout(history.timer);
    history.timer = setTimeout(snapshot, 350);
  }
  function restore(entry) {
    editor.value = entry.text;
    editor.setSelectionRange(entry.start, entry.end);
    onChange(false);
  }
  function undo() {
    clearTimeout(history.timer);
    snapshot();
    if (history.index > 0) restore(history.stack[--history.index]);
  }
  function redo() {
    if (history.index < history.stack.length - 1) restore(history.stack[++history.index]);
  }
  function resetHistory() {
    history.stack = [];
    history.index = -1;
    snapshot();
  }

  /* 텍스트 삽입 (실행 취소 기록 포함) */
  function insertText(text) {
    snapshot();
    const { selectionStart: s, selectionEnd: e, value } = editor;
    editor.value = value.slice(0, s) + text + value.slice(e);
    const pos = s + text.length;
    editor.setSelectionRange(pos, pos);
    snapshot();
    onChange(false);
    editor.focus();
  }

  /* ---------- 화면 갱신 ---------- */
  function isDirty() { return editor.value !== state.savedText; }

  function updateTitle() {
    const title = `${isDirty() ? '*' : ''}${state.fileName} - ${APP_NAME}`;
    $('docTitle').textContent = title;
    document.title = title;
  }

  let lastLineCount = -1;
  function updateGutter(force) {
    if (!state.lineNumbers || state.wrap) return;
    const count = editor.value.split('\n').length;
    if (count !== lastLineCount || force) {
      let out = '';
      for (let i = 1; i <= count; i++) out += i + '\n';
      gutter.textContent = out;
      lastLineCount = count;
    }
    gutter.scrollTop = editor.scrollTop;
  }

  function updateStatus() {
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    const sel = Math.abs(editor.selectionEnd - editor.selectionStart);
    $('stPos').textContent = `줄 ${line}, 열 ${col}${sel ? ` (${sel}자 선택)` : ''}`;
    const text = editor.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $('stCount').textContent = `${text.length.toLocaleString()}자 · ${words.toLocaleString()}단어`;
    $('stZoom').textContent = `${state.zoom}%`;
  }

  function onChange(recordHistory = true) {
    if (recordHistory) scheduleSnapshot();
    updateTitle();
    updateGutter();
    updateStatus();
    schedulePersist();
  }

  /* ---------- 서식/보기 적용 ---------- */
  function applyView() {
    const wrapEl = editor.parentElement;
    wrapEl.style.setProperty('--font-size', `${(state.fontSize * state.zoom) / 100}px`);
    wrapEl.style.setProperty('--font-family', state.fontFamily);
    editor.style.fontWeight = state.fontWeight;
    editor.style.fontStyle = state.fontStyle;

    editor.classList.toggle('wrap', state.wrap);
    // 자동 줄 바꿈 시 줄 번호는 맞지 않으므로 숨김
    document.body.classList.toggle('no-lines', !state.lineNumbers || state.wrap);
    $('statusbar').classList.toggle('hidden', !state.statusBar);

    $('chkWrap').classList.toggle('on', state.wrap);
    $('chkStatus').classList.toggle('on', state.statusBar);
    $('chkLines').classList.toggle('on', state.lineNumbers);

    applyTheme();
    updateGutter(true);
    updateStatus();
  }

  function applyTheme() {
    document.body.dataset.theme = state.theme;
    document.querySelectorAll('.dot').forEach((d) =>
      d.classList.toggle('active', d.dataset.theme === state.theme && !state.customColors));
    const s = document.body.style;
    if (state.customColors) {
      s.setProperty('--editor-fg', state.customColors.fg);
      s.setProperty('--editor-bg', state.customColors.bg);
    } else {
      s.removeProperty('--editor-fg');
      s.removeProperty('--editor-bg');
    }
  }

  function setZoom(z) {
    state.zoom = Math.min(500, Math.max(10, z));
    applyView();
    schedulePersist();
  }

  /* ---------- 대화 상자 ---------- */
  function dialog({ title, body = '', buttons }) {
    return new Promise((resolve) => {
      $('modalTitle').textContent = title;
      const bodyEl = $('modalBody');
      if (typeof body === 'string') bodyEl.innerHTML = body; else { bodyEl.innerHTML = ''; bodyEl.append(body); }
      const actions = $('modalActions');
      actions.innerHTML = '';
      const close = (val) => {
        $('modal').classList.add('hidden');
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
        editor.focus();
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
          const primary = buttons.find((b) => b.primary);
          if (primary) { e.preventDefault(); e.stopPropagation(); close(primary.value); }
        }
      };
      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.primary) btn.className = 'primary';
        btn.onclick = () => close(b.value);
        actions.append(btn);
      });
      document.addEventListener('keydown', onKey, true);
      $('modal').classList.remove('hidden');
      const first = bodyEl.querySelector('input, select') || actions.querySelector('.primary');
      if (first) setTimeout(() => { first.focus(); first.select?.(); }, 0);
    });
  }

  const alertBox = (title, msg) => dialog({ title, body: msg, buttons: [{ label: '확인', value: true, primary: true }] });

  async function confirmDiscard() {
    if (!isDirty()) return true;
    const res = await dialog({
      title: APP_NAME,
      body: `<p><b>${escapeHtml(state.fileName)}</b>의 변경 내용을 저장하시겠습니까?</p>`,
      buttons: [
        { label: '저장', value: 'save', primary: true },
        { label: '저장 안 함', value: 'discard' },
        { label: '취소', value: null },
      ],
    });
    if (res === 'save') return save();
    return res === 'discard';
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- 파일 ---------- */
  async function newFile() {
    if (!(await confirmDiscard())) return;
    loadDocument('', '제목 없음.txt', null);
  }

  function loadDocument(text, name, handle) {
    editor.value = text;
    state.fileName = name;
    state.fileHandle = handle;
    state.savedText = text;
    editor.setSelectionRange(0, 0);
    editor.scrollTop = 0;
    resetHistory();
    onChange(false);
    editor.focus();
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt', '.md', '.csv', '.log', '.json'] } }],
        });
        const file = await handle.getFile();
        loadDocument(await file.text(), file.name, handle);
      } catch (err) {
        if (err.name !== 'AbortError') alertBox('오류', '파일을 열 수 없습니다.');
      }
      return;
    }
    fileInput.value = '';
    fileInput.click();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    loadDocument(await file.text(), file.name, null);
  });

  async function save() {
    if (state.fileHandle) {
      try {
        const w = await state.fileHandle.createWritable();
        await w.write(editor.value);
        await w.close();
        markSaved();
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
      }
    }
    return saveAs();
  }

  async function saveAs() {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: state.fileName,
          types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }],
        });
        const w = await handle.createWritable();
        await w.write(editor.value);
        await w.close();
        state.fileHandle = handle;
        state.fileName = handle.name;
        markSaved();
        return true;
      } catch (err) {
        if (err.name === 'AbortError') return false;
      }
    }
    // 대체: 파일 이름을 받아서 다운로드
    const input = document.createElement('div');
    input.innerHTML = `<label>파일 이름</label><input type="text" id="dlgName" value="${escapeHtml(state.fileName)}" />`;
    const ok = await dialog({
      title: '다른 이름으로 저장',
      body: input,
      buttons: [{ label: '저장', value: true, primary: true }, { label: '취소', value: false }],
    });
    if (!ok) return false;
    let name = input.querySelector('#dlgName').value.trim() || '제목 없음.txt';
    if (!/\.[a-z0-9]+$/i.test(name)) name += '.txt';
    const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    state.fileName = name;
    markSaved();
    return true;
  }

  function markSaved() {
    state.savedText = editor.value;
    updateTitle();
    persist();
  }

  function printDoc() {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(state.fileName)}</title>
      <style>body{font-family:${state.fontFamily};font-size:${state.fontSize}px;font-weight:${state.fontWeight};font-style:${state.fontStyle};}
      pre{white-space:pre-wrap;word-break:break-all;font:inherit;margin:0}</style></head>
      <body><pre>${escapeHtml(editor.value)}</pre></body></html>`);
    doc.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }

  /* ---------- 편집 ---------- */
  function selectedText() { return editor.value.slice(editor.selectionStart, editor.selectionEnd); }

  async function copy() {
    const t = selectedText();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch { document.execCommand('copy'); }
    editor.focus();
  }
  async function cut() {
    const t = selectedText();
    if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch { document.execCommand('copy'); }
    insertText('');
  }
  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      insertText(t);
    } catch {
      alertBox('붙여넣기', '브라우저 보안 설정으로 메뉴에서 붙여넣기를 할 수 없습니다.<br>Ctrl+V(길게 눌러 붙여넣기)를 사용해 주세요.');
    }
  }
  function del() {
    if (editor.selectionStart === editor.selectionEnd) {
      editor.setSelectionRange(editor.selectionStart, editor.selectionStart + 1);
    }
    insertText('');
  }
  function selectAll() { editor.focus(); editor.select(); updateStatus(); }

  function timeDate() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const h = now.getHours();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${h < 12 ? '오전' : '오후'} ${pad(h % 12 || 12)}:${pad(now.getMinutes())}`;
    insertText(stamp);
  }

  /* ---------- 찾기 / 바꾸기 ---------- */
  function openFind(replaceMode) {
    findbar.classList.remove('hidden');
    findbar.classList.toggle('replace-mode', replaceMode);
    const sel = selectedText();
    if (sel && !sel.includes('\n')) findInput.value = sel;
    findInput.focus();
    findInput.select();
    updateFindCount();
  }
  function closeFind() {
    findbar.classList.add('hidden');
    editor.focus();
  }

  function norm(s) { return matchCase.checked ? s : s.toLowerCase(); }

  function updateFindCount() {
    const q = findInput.value;
    if (!q) { $('findCount').textContent = ''; return; }
    const hay = norm(editor.value), needle = norm(q);
    let n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
    $('findCount').textContent = n ? `${n}개 일치` : '결과 없음';
  }

  function selectRange(start, end) {
    editor.focus();
    editor.setSelectionRange(start, end);
    // 선택 위치로 스크롤
    const lineH = parseFloat(getComputedStyle(editor).lineHeight) || 24;
    const line = editor.value.slice(0, start).split('\n').length - 1;
    const target = line * lineH - editor.clientHeight / 2;
    if (!state.wrap) editor.scrollTop = Math.max(0, target);
    updateStatus();
    updateGutter();
  }

  function findNext(backward = false) {
    const q = findInput.value;
    if (!q) { openFind(false); return false; }
    const hay = norm(editor.value), needle = norm(q);
    let idx;
    if (backward) {
      idx = hay.lastIndexOf(needle, editor.selectionStart - 1);
      if (idx === -1) idx = hay.lastIndexOf(needle);
    } else {
      idx = hay.indexOf(needle, editor.selectionEnd);
      if (idx === -1) idx = hay.indexOf(needle);
    }
    if (idx === -1) {
      $('findCount').textContent = `"${q}"을(를) 찾을 수 없습니다`;
      return false;
    }
    selectRange(idx, idx + q.length);
    findInput.focus();
    return true;
  }

  function replaceOne() {
    const q = findInput.value;
    if (!q) return;
    if (norm(selectedText()) === norm(q)) insertText(replaceInput.value);
    findNext();
    updateFindCount();
  }

  function replaceAll() {
    const q = findInput.value;
    if (!q) return;
    const flags = matchCase.checked ? 'g' : 'gi';
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches = editor.value.match(re);
    if (!matches) { $('findCount').textContent = '결과 없음'; return; }
    snapshot();
    editor.value = editor.value.replace(re, () => replaceInput.value);
    snapshot();
    onChange(false);
    $('findCount').textContent = `${matches.length}개 바꿈`;
  }

  async function gotoLine() {
    const total = editor.value.split('\n').length;
    const cur = editor.value.slice(0, editor.selectionStart).split('\n').length;
    const box = document.createElement('div');
    box.innerHTML = `<label>줄 번호 (1 ~ ${total})</label><input type="number" id="dlgLine" min="1" max="${total}" value="${cur}" />`;
    const ok = await dialog({
      title: '줄 이동',
      body: box,
      buttons: [{ label: '이동', value: true, primary: true }, { label: '취소', value: false }],
    });
    if (!ok) return;
    const n = parseInt(box.querySelector('#dlgLine').value, 10);
    if (!(n >= 1 && n <= total)) { alertBox('줄 이동', '줄 번호가 전체 줄 수를 넘습니다.'); return; }
    const lines = editor.value.split('\n');
    let pos = 0;
    for (let i = 0; i < n - 1; i++) pos += lines[i].length + 1;
    selectRange(pos, pos);
  }

  /* ---------- 글꼴 ---------- */
  const FONTS = [
    ['고정폭 (Consolas)', 'Consolas, "D2Coding", "Courier New", monospace'],
    ['맑은 고딕', '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'],
    ['바탕', '"Batang", "AppleMyungjo", serif'],
    ['굴림', '"Gulim", "Apple SD Gothic Neo", sans-serif'],
    ['Arial', 'Arial, Helvetica, sans-serif'],
    ['Georgia', 'Georgia, serif'],
    ['Courier New', '"Courier New", monospace'],
  ];

  async function fontDialog() {
    const box = document.createElement('div');
    const styleVal = `${state.fontWeight}|${state.fontStyle}`;
    box.innerHTML = `
      <label>글꼴</label>
      <select id="dlgFont">${FONTS.map(([n, v]) => `<option value='${v}' ${v === state.fontFamily ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label>글꼴 스타일</label>
      <select id="dlgStyle">
        <option value="normal|normal">보통</option>
        <option value="normal|italic">기울임꼴</option>
        <option value="bold|normal">굵게</option>
        <option value="bold|italic">굵은 기울임꼴</option>
      </select>
      <label>크기 (px)</label>
      <input type="number" id="dlgSize" min="8" max="72" value="${state.fontSize}" />
      <div class="font-preview" id="dlgPreview">가나다라 AaBbCc 123</div>`;
    const selFont = box.querySelector('#dlgFont');
    const selStyle = box.querySelector('#dlgStyle');
    const inSize = box.querySelector('#dlgSize');
    const preview = box.querySelector('#dlgPreview');
    selStyle.value = styleVal;
    const refresh = () => {
      const [w, st] = selStyle.value.split('|');
      preview.style.fontFamily = selFont.value;
      preview.style.fontWeight = w;
      preview.style.fontStyle = st;
      preview.style.fontSize = `${inSize.value}px`;
    };
    [selFont, selStyle, inSize].forEach((el) => el.addEventListener('input', refresh));
    refresh();
    const ok = await dialog({
      title: '글꼴',
      body: box,
      buttons: [{ label: '확인', value: true, primary: true }, { label: '취소', value: false }],
    });
    if (!ok) return;
    state.fontFamily = selFont.value;
    [state.fontWeight, state.fontStyle] = selStyle.value.split('|');
    state.fontSize = Math.min(72, Math.max(8, parseInt(inSize.value, 10) || BASE_FONT));
    applyView();
    schedulePersist();
  }

  /* ---------- 색상 ---------- */
  function setTheme(theme) {
    state.theme = theme;
    state.customColors = null;
    applyTheme();
    schedulePersist();
  }

  async function customColorDialog() {
    const cs = getComputedStyle(document.body);
    const toHex = (c) => {
      c = c.trim();
      if (c.startsWith('#')) return c.length === 4 ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c;
      const m = c.match(/\d+/g);
      return m ? '#' + m.slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#000000';
    };
    const fg = state.customColors?.fg || toHex(cs.getPropertyValue('--editor-fg'));
    const bg = state.customColors?.bg || toHex(cs.getPropertyValue('--editor-bg'));
    const presets = [
      ['#1a202c', '#fffff0'], ['#22543d', '#f0fff4'], ['#fefcbf', '#2a4365'],
      ['#00ff66', '#000000'], ['#63171b', '#fff5f5'], ['#ffffff', '#44337a'],
    ];
    const box = document.createElement('div');
    box.innerHTML = `
      <label>글자 색</label><input type="color" id="dlgFg" value="${fg}" />
      <label>배경 색</label><input type="color" id="dlgBg" value="${bg}" />
      <label>추천 조합</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${presets.map(([f, b]) => `<button type="button" data-f="${f}" data-b="${b}" style="width:40px;height:30px;border-radius:5px;border:1px solid var(--border);background:${b};color:${f};font-weight:700;cursor:pointer">가</button>`).join('')}
      </div>
      <div class="font-preview" id="dlgColorPreview">색상 미리보기 — The quick brown fox</div>`;
    const inFg = box.querySelector('#dlgFg');
    const inBg = box.querySelector('#dlgBg');
    const preview = box.querySelector('#dlgColorPreview');
    const refresh = () => { preview.style.color = inFg.value; preview.style.background = inBg.value; };
    inFg.addEventListener('input', refresh);
    inBg.addEventListener('input', refresh);
    box.querySelectorAll('button[data-f]').forEach((b) => b.addEventListener('click', () => {
      inFg.value = b.dataset.f; inBg.value = b.dataset.b; refresh();
    }));
    refresh();
    const res = await dialog({
      title: '사용자 지정 색상',
      body: box,
      buttons: [
        { label: '적용', value: 'apply', primary: true },
        { label: '테마 기본값', value: 'reset' },
        { label: '취소', value: null },
      ],
    });
    if (res === 'apply') state.customColors = { fg: inFg.value, bg: inBg.value };
    else if (res === 'reset') state.customColors = null;
    else return;
    applyTheme();
    schedulePersist();
  }

  function about() {
    alertBox('메모장 정보', `
      <p><b>📝 ${APP_NAME}</b> v1.0</p>
      <p>브라우저에서 동작하는 색상 테마 메모장입니다.<br>
      입력한 내용은 이 브라우저에 자동 저장됩니다.</p>
      <p style="font-size:12px;opacity:.75">새로 만들기 · 열기 · 저장 · 인쇄 · 실행 취소 · 찾기/바꾸기 · 줄 이동 ·
      시간/날짜 · 자동 줄 바꿈 · 글꼴 · 확대/축소 · 6가지 색상 테마 · 사용자 지정 색상</p>`);
  }

  /* ---------- 명령 연결 ---------- */
  const actions = {
    new: newFile, open: openFile, save, saveAs, print: printDoc,
    undo, redo, cut, copy, paste, delete: del,
    find: () => openFind(false), findNext: () => findNext(), replace: () => openFind(true),
    goto: gotoLine, selectAll, timeDate,
    wordWrap: () => { state.wrap = !state.wrap; applyView(); schedulePersist(); },
    font: fontDialog,
    zoomIn: () => setZoom(state.zoom + 10),
    zoomOut: () => setZoom(state.zoom - 10),
    zoomReset: () => setZoom(100),
    statusBar: () => { state.statusBar = !state.statusBar; applyView(); schedulePersist(); },
    lineNumbers: () => { state.lineNumbers = !state.lineNumbers; applyView(); schedulePersist(); },
    customColor: customColorDialog,
    about,
  };

  // 메뉴 열기/닫기
  const menus = [...document.querySelectorAll('.menu')];
  const closeMenus = () => menus.forEach((m) => m.classList.remove('open'));
  menus.forEach((menu) => {
    const btn = menu.querySelector('.menu-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      closeMenus();
      if (!wasOpen) menu.classList.add('open');
    });
    btn.addEventListener('mouseenter', () => {
      if (menus.some((m) => m.classList.contains('open')) && !menu.classList.contains('open')) {
        closeMenus();
        menu.classList.add('open');
      }
    });
  });
  document.addEventListener('click', closeMenus);

  // 메뉴 항목 클릭 시 선택 영역이 사라지지 않도록 포커스 이동 방지
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenus();
      const a = el.dataset.action;
      if (a === 'theme') setTheme(el.dataset.theme);
      else actions[a]?.();
    });
  });

  // 찾기 패널
  $('btnFindNext').onclick = () => findNext(false);
  $('btnFindPrev').onclick = () => findNext(true);
  $('btnReplace').onclick = replaceOne;
  $('btnReplaceAll').onclick = replaceAll;
  $('btnFindClose').onclick = closeFind;
  findInput.addEventListener('input', updateFindCount);
  matchCase.addEventListener('change', updateFindCount);
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey); }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
  });

  // 편집기 이벤트
  editor.addEventListener('input', () => onChange(true));
  editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; });
  ['keyup', 'click', 'select'].forEach((ev) => editor.addEventListener(ev, updateStatus));
  document.addEventListener('selectionchange', () => { if (document.activeElement === editor) updateStatus(); });

  editor.addEventListener('keydown', (e) => {
    // 줄 단위로 실행 취소되도록 Enter 입력 직전 상태를 기록
    if (e.key === 'Enter') { clearTimeout(history.timer); snapshot(); }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      insertText('\t');
    }
  });

  editor.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setZoom(state.zoom + (e.deltaY < 0 ? 10 : -10));
    }
  }, { passive: false });

  // 단축키
  document.addEventListener('keydown', (e) => {
    if (!$('modal').classList.contains('hidden')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let action = null;
    if (ctrl && e.shiftKey && k === 's') action = 'saveAs';
    else if (ctrl && e.shiftKey && k === 'z') action = 'redo';
    else if (ctrl && !e.shiftKey && !e.altKey) {
      action = {
        n: 'new', o: 'open', s: 'save', p: 'print', z: 'undo', y: 'redo',
        f: 'find', h: 'replace', g: 'goto',
        '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset',
      }[k] || null;
    } else if (e.key === 'F3') action = e.shiftKey ? null : 'findNext';
    else if (e.key === 'F5') action = 'timeDate';
    else if (e.key === 'Escape' && !findbar.classList.contains('hidden')) action = 'closeFind';

    if (e.key === 'F3' && e.shiftKey) { e.preventDefault(); findNext(true); return; }
    if (!action) return;
    // 찾기 입력창 안에서의 실행 취소는 브라우저 기본 동작 사용
    if ((action === 'undo' || action === 'redo') && e.target !== editor) return;
    e.preventDefault();
    if (action === 'closeFind') closeFind();
    else actions[action]();
  });

  window.addEventListener('beforeunload', (e) => {
    persist();
    if (isDirty() && state.fileHandle) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- 초기화 ---------- */
  const saved = safeGet();
  if (saved) {
    const { text = '', ...rest } = saved;
    Object.assign(state, rest, { fileHandle: null });
    editor.value = text;
  }
  resetHistory();
  applyView();
  updateTitle();
  editor.focus();
})();
