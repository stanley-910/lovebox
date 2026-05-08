import { subscribeMessages, sendMessage as fbSendNote, setMood as fbSetMood, subscribeMood, subscribeCanvas, addStroke, deleteStroke, clearCanvas, markRead, subscribeSnapshots, saveSnapshot, signIn, onAuth, getIdentity } from './firebase.js';
import { createKeyboard } from './keyboard.js';

const MODULES = [
  { id: 'home',  label: 'home',  glyph: '⌂' },
  { id: 'inbox', label: 'inbox', glyph: '✉' },
  { id: 'draw',  label: 'draw',  glyph: '✎' },
  { id: 'note',  label: 'note',  glyph: '⏎' },
  { id: 'mood',  label: 'mood',  glyph: '♡' },
  { id: 'play',  label: 'music', glyph: '♪' },
  { id: 'settings', label: 'sys', glyph: '⚙' },
];

const MOODS = [
  { k: 'sleepy',   ascii: '(- _ -) Z z z', t: 'sleepy',          status: 'sleeping ◐' },
  { k: 'thinking', ascii: '( ◔ ◡ ◔ )',    t: 'thinking of you', status: 'thinking of u' },
  { k: 'busy',     ascii: '[> _ <]',       t: 'heads down',      status: 'heads down ◧' },
  { k: 'happy',    ascii: '\\( ^ ω ^ )/',  t: 'happy today',     status: 'awake & humming' },
  { k: 'missing',  ascii: '( ; _ ; )♡',   t: 'missing you',     status: 'missing you ♡' },
  { k: 'coffee',   ascii: '☕ ( ◑ ◡ ◑ )', t: 'caffeinated',     status: 'caffeinated ☕' },
];

const DRAW_COLORS = ['#1a1410', '#a83a52', '#4a7a4a', '#5a78a8', '#c89020', '#9a4a8a'];
const DRAW_COLORS_DARK = ['#e8d8c4', '#d8627a', '#7ac98a', '#8aa6dc', '#c89020', '#9a4a8a'];

const ASCII_DIGITS = {
  '0': ['███','█ █','█ █','█ █','███'],
  '1': ['  █','  █','  █','  █','  █'],
  '2': ['███','  █','███','█  ','███'],
  '3': ['███','  █','███','  █','███'],
  '4': ['█ █','█ █','███','  █','  █'],
  '5': ['███','█  ','███','  █','███'],
  '6': ['███','█  ','███','█ █','███'],
  '7': ['███','  █','  █','  █','  █'],
  '8': ['███','█ █','███','█ █','███'],
  '9': ['███','█ █','███','  █','███'],
  ':': ['   ',' █ ','   ',' █ ','   '],
  ' ': ['   ','   ','   ','   ','   '],
};

// ── State ──
const state = {
  identity: null, // 'him' or 'her', set after auth
  theme: localStorage.getItem('lovebox-theme') || 'light',
  active: 'home',
  mood: 'thinking',
  messages: [],
  sentFlash: false,
  incomingToast: null,
  drawColor: '#a83a52',
  canvasStrokes: [],
  drawRedoStack: [],
  currentStroke: null,
  canvasSnapshots: [],
  drawView: 'canvas',
  noteText: '',
  searchQuery: '',
  lastMessageCount: 0,
  sleeping: false,
};

function partnerIdentity() {
  return state.identity === 'him' ? 'her' : 'him';
}

document.documentElement.setAttribute('data-theme', state.theme);

// ── On-screen keyboard (singleton, lives at #app level) ──
let keyboard = null;
function ensureKeyboard() {
  if (keyboard) return keyboard;
  keyboard = createKeyboard({ theme: state.theme, height: 220 });
  document.getElementById('app').appendChild(keyboard.el);
  return keyboard;
}

function bindKeyboard(handlers) {
  ensureKeyboard().setHandlers({ onSubmit: undefined, ...handlers });
}

// ── Helpers ──
function fmtTime(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(d) {
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase();
}

function fmtMsgTime(timestamp) {
  if (!timestamp) return 'now';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return fmtTime(d);
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'yest';
  if (days < 7) return d.toLocaleDateString('en', { weekday: 'short' }).toLowerCase();
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' }).toLowerCase();
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

// ── ASCII Clock ──
function renderAsciiClock(timeStr, color = '#1a1410', size = 9) {
  const rows = ['', '', '', '', ''];
  for (const ch of timeStr) {
    const g = ASCII_DIGITS[ch] || ASCII_DIGITS[' '];
    for (let r = 0; r < 5; r++) rows[r] += g[r] + ' ';
  }
  const wrap = el('div', { className: 'ascii-clock' });
  for (let i = 0; i < 5; i++) {
    const row = el('div', { className: 'ascii-clock-row' });
    for (const c of rows[i]) {
      row.appendChild(el('span', {
        className: 'ascii-clock-cell',
        style: {
          width: size + 'px',
          height: size + 'px',
          background: c === '█' ? color : 'transparent',
        },
      }));
    }
    wrap.appendChild(row);
  }
  return wrap;
}

// ── Window wrapper ──
function renderWindow(title, accent, chip, body) {
  const isDark = state.theme === 'dark';
  const win = el('div', { className: 'window' });
  const titleBar = el('div', { className: 'window-title', style: { background: isDark ? 'var(--titlebar-bg)' : accent } },
    el('span', { className: 'window-title-left' },
      el('span', { className: 'window-title-dot', style: isDark ? { background: chip } : {} }),
      title
    ),
  );
  win.appendChild(titleBar);
  const bodyWrap = el('div', { className: 'window-body' });
  bodyWrap.appendChild(body);
  win.appendChild(bodyWrap);
  return win;
}

// ── Screens ──

function renderHome() {
  const now = new Date();
  const samTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const caliTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const myTime = fmtTime(caliTime);
  const timeDigits = fmtTime(samTime).replace(/ (am|pm)/, '');
  const ampm = samTime.getHours() >= 12 ? 'pm' : 'am';
  const moodData = MOODS.find(m => m.k === state.mood) || MOODS[1];
  const unread = state.messages.filter(m => !m.read);
  const newest = state.messages[0];
  const rest = state.messages.slice(1, 4);

  const left = el('div', { className: 'home-left' },
    el('div', { className: 'home-header' },
      el('span', { className: 'home-header-him' }, `◐ stanley · ${myTime}`),
    ),
    el('div', { className: 'home-clock-wrap' },
      renderAsciiClock(timeDigits, 'var(--ink)'),
      el('div', { className: 'home-clock-meta' }, `${ampm} · ${fmtDate(now)}`),
    ),
    el('div', { className: 'home-status' },
      el('div', { className: 'home-status-inner' },
        el('div', { className: 'home-status-label' }, 'STATUS://'),
        el('div', { className: 'home-status-text' }, moodData.status),
      ),
    ),
    el('div', { className: 'home-footer' },
      el('span', {}, '○ tokyo · 64° clear'),
      el('span', {}, '○ sf · 58° fog'),
    ),
  );

  const mailPreview = el('div', { className: 'bevel-recessed mail-preview' });
  if (state.messages.length === 0) {
    mailPreview.appendChild(el('div', { style: { color: 'var(--ink-soft)', fontSize: '13px' } }, 'no messages yet'));
  }
  const shown = state.messages.slice(0, 5);
  for (const x of shown) {
    const isUnread = !x.read;
    const sender = el('span', { style: { color: x.from === 'him' ? 'var(--pink-deep)' : 'var(--blue)' } }, `${x.from === 'him' ? 'S:' : 'L:'}`);
    const textSpan = el('span', { className: 'mail-row-text', style: isUnread ? { color: 'var(--ink)' } : {} }, ` ${x.text || '(drawing)'}`);
    const timeSpan = el('span', { className: 'mail-row-time' }, fmtMsgTime(x.timestamp));
    const dot = el('span', { className: `mail-row-dot ${isUnread ? 'unread' : ''}` }, isUnread ? '●' : '');
    const row = el('div', { className: 'mail-row' }, sender, textSpan, dot, timeSpan);
    mailPreview.appendChild(row);
  }

  const readAllBtn = el('button', { className: 'btn-readall', onClick: () => switchModule('inbox') }, 'read all ▸');

  const right = el('div', { className: 'home-right' },
    el('div', { className: 'mail-header' },
      el('span', { className: 'mail-header-label' }, `▸ MAIL.LOG · ${unread.length} new`),
      el('span', { className: 'mail-header-status' }, '● online'),
    ),
    mailPreview,
    readAllBtn,
  );

  const grid = el('div', { className: 'home-grid' }, left, right);
  return renderWindow('ATRIUM.SYS', 'var(--ink)', 'var(--pink)', grid);
}

function renderInbox() {
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', gap: '4px' } });

  const q = state.searchQuery;
  const searchField = el('div', {
    className: `inbox-search-field ${q ? '' : 'empty'}`,
    onClick: () => openInboxSearch(),
  }, q || '');
  const searchRow = el('div', { className: 'inbox-search-row' },
    el('span', { className: 'inbox-search-label' }, 'FIND:'),
    searchField,
  );
  if (q) {
    searchRow.appendChild(el('button', {
      className: 'inbox-search-clear',
      onClick: (e) => {
        e.stopPropagation();
        state.searchQuery = '';
        const kb = ensureKeyboard();
        kb.close();
        render();
      },
    }, 'clear'));
  }
  body.appendChild(searchRow);

  body.appendChild(el('div', { className: 'inbox-header' },
    el('span', {}, 'FROM'),
    el('span', {}, 'MSG'),
    el('span', {}, ''),
    el('span', {}, 'TIME'),
  ));

  const list = el('div', { className: 'inbox-list' });
  const filter = q.toLowerCase();
  const filtered = filter
    ? state.messages.filter(m => (m.text || '').toLowerCase().includes(filter))
    : state.messages;
  for (const m of filtered) {
    const isUnread = !m.read;
    list.appendChild(el('div', { className: 'inbox-row' },
      el('span', {
        className: 'inbox-from',
        style: { color: m.from === 'him' ? 'var(--pink-deep)' : 'var(--blue)' },
      }, m.from === 'him' ? 'S:' : 'L:'),
      el('span', { className: `inbox-text ${isUnread ? 'unread' : ''}` }, m.text || '(drawing)'),
      el('span', { className: `inbox-dot ${isUnread ? 'unread' : ''}` }, isUnread ? '●' : ''),
      el('span', { className: 'inbox-time' }, fmtMsgTime(m.timestamp)),
    ));
  }
  body.appendChild(list);
  return renderWindow('MAIL.LOG ▸ all', 'var(--pink-deep)', 'var(--pink-deep)', body);
}

function openInboxSearch() {
  const kb = ensureKeyboard();
  kb.setLabel('SEARCH.SYS');
  kb.open();
  // Rebind handlers (createKeyboard captures opts at construction; we set
  // module-level callbacks via wrapper functions on state).
  bindKeyboard({
    onKey: (ch) => { state.searchQuery += ch; render(); },
    onBackspace: () => { state.searchQuery = state.searchQuery.slice(0, -1); render(); },
    onEnter: () => { kb.close(); },
    onClose: () => {},
  });
}

let drawCanvasEl = null;
let drawOffscreen = null;

function drawStrokeCtx(ctx, stroke) {
  if (!stroke.points || stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

function renderCommittedStrokes() {
  if (!drawOffscreen) return;
  const ctx = drawOffscreen.getContext('2d');
  ctx.fillStyle = state.theme === 'dark' ? '#1a1d24' : '#f4ead8';
  ctx.fillRect(0, 0, drawOffscreen.width, drawOffscreen.height);
  for (const stroke of state.canvasStrokes) {
    drawStrokeCtx(ctx, stroke);
  }
  compositeDrawCanvas();
}

function compositeDrawCanvas() {
  if (!drawCanvasEl || !drawOffscreen) return;
  const ctx = drawCanvasEl.getContext('2d');
  ctx.drawImage(drawOffscreen, 0, 0);
  if (state.currentStroke) {
    drawStrokeCtx(ctx, state.currentStroke);
  }
}

function renderDraw() {
  const sidebar = el('div', { className: 'draw-sidebar' });

  if (state.drawView === 'gallery') {
    const gallery = el('div', { className: 'draw-gallery bevel-recessed' });
    if (state.canvasSnapshots.length === 0) {
      gallery.appendChild(el('div', { className: 'draw-gallery-empty' }, 'no saved drawings yet'));
    } else {
      for (const snap of state.canvasSnapshots) {
        const thumb = el('div', { className: 'draw-gallery-thumb' },
          el('img', { src: snap.imageUrl }),
          el('div', { className: 'draw-gallery-time' }, fmtMsgTime(snap.timestamp)),
        );
        gallery.appendChild(thumb);
      }
    }
    sidebar.appendChild(el('button', {
      className: 'draw-gallery-btn',
      onClick: () => { state.drawView = 'canvas'; render(); },
    }, 'back'));

    const grid = el('div', { className: 'draw-grid' }, gallery, sidebar);
    return renderWindow('DRAW.EXE', 'var(--green)', 'var(--green)', grid);
  }

  const canvasWrap = el('div', { className: 'draw-canvas-wrap bevel-recessed' });
  const canvas = el('canvas', {});
  canvasWrap.appendChild(canvas);

  const undoRedoWrap = el('div', { className: 'draw-undo-wrap' },
    el('button', { className: 'draw-undo-btn', onClick: () => {
      const myStrokes = state.canvasStrokes.filter(s => s.from === state.identity);
      if (!myStrokes.length) return;
      const last = myStrokes[myStrokes.length - 1];
      state.drawRedoStack.push({ points: last.points, color: last.color, width: last.width, from: last.from });
      deleteStroke(last.id);
    }}, 'undo'),
    el('button', { className: 'draw-undo-btn', onClick: () => {
      if (!state.drawRedoStack.length) return;
      const stroke = state.drawRedoStack.pop();
      addStroke(stroke);
    }}, 'redo'),
  );
  canvasWrap.appendChild(undoRedoWrap);

  const saveBtn = el('button', { className: 'draw-save', onClick: () => {
    if (!drawCanvasEl) return;
    const dataUrl = drawCanvasEl.toDataURL('image/png');
    saveSnapshot(dataUrl, state.identity);
    saveBtn.textContent = '✓';
    setTimeout(() => { if (saveBtn.isConnected) saveBtn.textContent = 'save'; }, 1200);
  }}, 'save');
  canvasWrap.appendChild(saveBtn);

  const clearBtn = el('button', { className: 'draw-clear', onClick: () => {
    state.drawRedoStack = [];
    clearCanvas();
  }}, 'clear');
  canvasWrap.appendChild(clearBtn);

  setTimeout(() => {
    canvas.width = 520;
    canvas.height = 340;
    drawCanvasEl = canvas;
    drawOffscreen = document.createElement('canvas');
    drawOffscreen.width = 520;
    drawOffscreen.height = 340;
    renderCommittedStrokes();

    let drawing = false;

    function point(e) {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return {
        x: Math.round(((t.clientX - r.left) / r.width) * canvas.width),
        y: Math.round(((t.clientY - r.top) / r.height) * canvas.height),
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      state.currentStroke = { points: [point(e)], color: state.drawColor, width: 3, from: state.identity };
    }

    function moveDraw(e) {
      if (!drawing || !state.currentStroke) return;
      e.preventDefault();
      state.currentStroke.points.push(point(e));
      compositeDrawCanvas();
    }

    function endDraw() {
      if (!drawing || !state.currentStroke) return;
      drawing = false;
      if (state.currentStroke.points.length > 1) {
        addStroke({
          points: state.currentStroke.points,
          color: state.currentStroke.color,
          width: state.currentStroke.width,
          from: state.currentStroke.from,
        });
        state.drawRedoStack = [];
      }
      state.currentStroke = null;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('touchstart', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('touchmove', moveDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchend', endDraw);
  }, 0);

  const drawPalette = state.theme === 'dark' ? DRAW_COLORS_DARK : DRAW_COLORS;
  if (!drawPalette.includes(state.drawColor)) state.drawColor = drawPalette[1];

  sidebar.appendChild(el('div', { className: 'draw-color-label' }, 'COLOR'));
  const colors = el('div', { className: 'draw-colors' });
  for (const c of drawPalette) {
    const swatch = el('button', {
      className: `draw-swatch ${state.drawColor === c ? 'active' : ''}`,
      style: { background: c },
      onClick: () => {
        state.drawColor = c;
        document.querySelectorAll('.draw-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      },
    });
    colors.appendChild(swatch);
  }
  sidebar.appendChild(colors);
  sidebar.appendChild(el('div', { style: { flex: '1' } }));

  const count = state.canvasSnapshots.length;
  sidebar.appendChild(el('button', {
    className: 'draw-gallery-btn',
    onClick: () => {
      drawCanvasEl = null;
      drawOffscreen = null;
      state.drawView = 'gallery';
      render();
    },
  }, count > 0 ? `◧${count}` : '◧'));

  const grid = el('div', { className: 'draw-grid' }, canvasWrap, sidebar);
  return renderWindow('DRAW.EXE', 'var(--green)', 'var(--green)', grid);
}

function renderNote() {
  const wrap = el('div', { className: 'note-wrap' });
  wrap.appendChild(el('div', { className: 'note-to' }, 'TO: sam@home ◂ FROM: me'));

  const display = el('div', {
    className: `note-text-display bevel-recessed ${state.noteText ? '' : 'empty'}`,
    'data-placeholder': 'type a tiny letter…',
    onClick: () => {
      const kb = ensureKeyboard();
      if (!kb.isOpen()) { bindNoteKeyboard(); kb.open(); }
    },
  });
  if (state.noteText) display.textContent = state.noteText;
  const caret = el('span', { className: 'note-caret' });
  display.appendChild(caret);
  wrap.appendChild(display);

  const charCount = el('span', {}, `${state.noteText.length} chars`);

  function refreshDisplay() {
    display.textContent = state.noteText;
    display.classList.toggle('empty', !state.noteText);
    display.appendChild(caret);
    charCount.textContent = `${state.noteText.length} chars`;
    display.scrollTop = display.scrollHeight;
  }

  function send() {
    if (state.noteText.trim()) {
      fbSendNote(state.noteText, state.identity);
      state.noteText = '';
      refreshDisplay();
    }
    flashSend();
  }

  function bindNoteKeyboard() {
    const kb = ensureKeyboard();
    kb.setLabel('KEYS.SYS');
    kb.setHandlers({
      onKey: (ch) => { state.noteText += ch; refreshDisplay(); },
      onBackspace: () => { state.noteText = state.noteText.slice(0, -1); refreshDisplay(); },
      onEnter: () => { state.noteText += '\n'; refreshDisplay(); },
      onClose: () => { renderShowKeysButton(); },
      onSubmit: () => send(),
    });
  }

  const sendBtn = el('button', {
    className: `btn-send-sm ${state.sentFlash ? 'sent' : 'default'}`,
    onClick: send,
  }, state.sentFlash ? '✓ delivered' : 'send ▸');

  const footer = el('div', { className: 'note-footer' }, charCount);
  const rightGroup = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
  function renderShowKeysButton() {
    rightGroup.innerHTML = '';
    const kb = ensureKeyboard();
    if (!kb.isOpen()) {
      rightGroup.appendChild(el('button', {
        className: 'note-show-keys',
        onClick: () => { bindNoteKeyboard(); ensureKeyboard().open(); renderShowKeysButton(); },
      }, 'show keys ▴'));
    }
    rightGroup.appendChild(sendBtn);
  }
  renderShowKeysButton();
  footer.appendChild(rightGroup);
  wrap.appendChild(footer);

  // Auto-open keyboard when note module mounts.
  setTimeout(() => { bindNoteKeyboard(); ensureKeyboard().open(); renderShowKeysButton(); }, 0);

  return renderWindow('NOTE.TXT', 'var(--blue)', 'var(--blue)', wrap);
}

function renderMood() {
  const grid = el('div', { className: 'mood-grid' });
  for (const m of MOODS) {
    grid.appendChild(el('button', {
      className: `mood-btn ${state.mood === m.k ? 'picked' : 'inactive'}`,
      onClick: () => {
        state.mood = m.k;
        fbSetMood(m.k, state.identity);
        render();
        flashSend();
      },
    },
      el('span', { className: 'mood-ascii' }, m.ascii),
      el('span', { className: 'mood-label' }, m.t),
    ));
  }
  return renderWindow('MOOD.CFG', 'var(--pink-deep)', 'var(--pink-deep)', grid);
}

function renderMusic() {
  const wrap = el('div', { className: 'music-wrap' });
  wrap.appendChild(el('div', { className: 'music-header' }, 'NOW PLAYING ▸ shared queue'));

  const body = el('div', { className: 'music-body bevel-recessed' });
  body.appendChild(el('div', { className: 'music-track' },
    el('div', { className: 'music-cover' }, '♪'),
    el('div', {},
      el('div', {}, 'tape #14'),
      el('div', { className: 'music-meta-sub' }, 'track 03 · "petal radio"'),
    ),
  ));

  const wave = el('div', { className: 'music-wave' });
  for (let i = 0; i < 60; i++) {
    const h = 20 + Math.sin(i * 0.6) * 14 + Math.cos(i * 0.3) * 8;
    wave.appendChild(el('div', { className: 'music-wave-bar', style: { height: `${h}%` } }));
  }
  body.appendChild(wave);

  const tracklist = el('div', { className: 'music-tracklist' });
  tracklist.innerHTML = '▸ tape #14 — for slow mornings<br>· 03 petal radio (1:24/3:48)<br>· 04 cherry static<br>· 05 longwave';
  body.appendChild(tracklist);

  wrap.appendChild(body);
  return renderWindow('JUKEBOX.WAV', 'var(--green)', 'var(--green)', wrap);
}

function toggleTheme() {
  const oldColors = state.theme === 'dark' ? DRAW_COLORS_DARK : DRAW_COLORS;
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  const newColors = state.theme === 'dark' ? DRAW_COLORS_DARK : DRAW_COLORS;
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('lovebox-theme', state.theme);
  if (keyboard) {
    keyboard.destroy();
    keyboard = null;
  }
  const idx = oldColors.indexOf(state.drawColor);
  if (idx !== -1) state.drawColor = newColors[idx];
  else state.drawColor = newColors[1];
  render();
}

function renderSettings() {
  const wrap = el('div', { className: 'settings-wrap' });

  wrap.appendChild(el('div', { className: 'settings-section-label' }, 'DISPLAY'));
  const displaySection = el('div', { className: 'settings-section bevel-recessed' });

  displaySection.appendChild(el('button', {
    className: 'settings-btn',
    onClick: () => toggleTheme(),
  }, state.theme === 'dark' ? 'theme: dark ◑' : 'theme: light ◐'));

  displaySection.appendChild(el('button', {
    className: 'settings-btn',
    onClick: () => enterSleep(),
  }, 'sleep display ◐'));
  wrap.appendChild(displaySection);

  wrap.appendChild(el('div', { className: 'settings-section-label', style: { marginTop: '10px' } }, 'SYSTEM'));
  const sysSection = el('div', { className: 'settings-section bevel-recessed' });
  sysSection.appendChild(el('div', { className: 'settings-info' }, '▸ SAKURA//OS v1.0'));
  sysSection.appendChild(el('div', { className: 'settings-info' }, '▸ lovebox · for sam'));
  wrap.appendChild(sysSection);

  return renderWindow('SYSTEM.CFG', 'var(--ink-soft)', 'var(--ink-soft)', wrap);
}

// ── Sleep mode ──
function enterSleep() {
  state.sleeping = true;
  const overlay = document.getElementById('sleep-overlay');
  overlay.classList.add('active');
  overlay.addEventListener('click', exitSleep, { once: true });
  overlay.addEventListener('touchstart', exitSleep, { once: true });
}

function exitSleep() {
  state.sleeping = false;
  const overlay = document.getElementById('sleep-overlay');
  overlay.classList.remove('active');
}

// ── Send flash ──
function applySendFlash() {
  // Mutate every live send button to reflect state.sentFlash. The note module
  // can rebuild its sendBtn between flashSend() and the timeout (e.g. when the
  // sent message round-trips through Firebase and triggers render()), so we
  // can't hold onto a single ref.
  const small = state.sentFlash ? '✓ delivered' : 'send ▸';
  for (const b of document.querySelectorAll('.btn-send-sm')) {
    b.classList.toggle('sent', state.sentFlash);
    b.classList.toggle('default', !state.sentFlash);
    b.textContent = small;
  }
}

function flashSend() {
  state.sentFlash = true;
  applySendFlash();
  setTimeout(() => {
    state.sentFlash = false;
    applySendFlash();
  }, 1600);
}

// ── Toast ──
function showToast(msg) {
  if (state.active === 'inbox') return;
  state.incomingToast = msg;
  const toast = document.getElementById('toast');
  toast.innerHTML = '';
  toast.classList.add('visible');

  const card = el('div', { className: 'toast-card' },
    el('div', { className: 'toast-header' },
      el('span', {}, '◆ NEW MESSAGE'),
      el('span', { className: 'toast-close', onClick: dismissToast }, '×'),
    ),
    el('div', { className: 'toast-body' },
      el('div', { className: 'toast-from' }, `${msg.from === 'him' ? 'S:' : 'L:'} · now`),
      el('div', { className: 'toast-text' }, `"${msg.text || '(drawing)'}"`),
    ),
  );
  toast.appendChild(card);
  renderTaskbar();
}

function dismissToast() {
  state.incomingToast = null;
  const toast = document.getElementById('toast');
  toast.classList.remove('visible');
  toast.innerHTML = '';
  renderTaskbar();
}

// ── Taskbar ──
function renderTaskbar() {
  const tb = document.getElementById('taskbar');
  tb.innerHTML = '';

  for (const m of MODULES) {
    const btn = el('button', {
      className: `tb-btn ${state.active === m.id ? 'active' : ''}`,
      onClick: () => switchModule(m.id),
    }, el('span', {}, m.glyph), m.label);
    tb.appendChild(btn);
  }

  tb.appendChild(el('div', { className: 'tb-spacer' }));

  if (state.incomingToast && state.active !== 'inbox') {
    tb.appendChild(el('span', { className: 'tb-incoming' }, '◆ new from him'));
  }

  const clockBtn = el('button', { className: 'tb-clock', onClick: () => switchModule('home') }, fmtTime(new Date()));
  tb.appendChild(clockBtn);
}

// ── Module switching ──
function switchModule(id) {
  if (state.active === 'draw') {
    drawCanvasEl = null;
    drawOffscreen = null;
  }
  if (state.active !== id && keyboard) {
    keyboard.close();
  }
  if (state.active === 'inbox' && id !== 'inbox') state.searchQuery = '';
  state.active = id;
  if (id === 'inbox') {
    dismissToast();
    for (const m of state.messages) {
      if (!m.read) markRead(m.id);
    }
  }
  render();
}

// ── Main render ──
function render() {
  const desktop = document.getElementById('desktop');
  desktop.innerHTML = '';

  const screens = {
    home: renderHome,
    inbox: renderInbox,
    draw: renderDraw,
    note: renderNote,
    mood: renderMood,
    play: renderMusic,
    settings: renderSettings,
  };

  desktop.appendChild(screens[state.active]());
  renderTaskbar();
}

// ── Auth & Init ──
function boot() {
  subscribeMessages((messages) => {
    const isNew = state.lastMessageCount > 0 && messages.length > state.lastMessageCount;
    state.messages = messages;
    state.lastMessageCount = messages.length;

    if (isNew && messages[0]?.from === partnerIdentity()) {
      showToast(messages[0]);
    }

    if (state.active === 'draw') {
      renderTaskbar();
    } else {
      render();
    }
  });

  subscribeMood((moodDoc) => {
    if (moodDoc.from === partnerIdentity()) {
      state.mood = moodDoc.mood;
      if (state.active === 'home') render();
    }
  });

  subscribeCanvas((strokes) => {
    state.canvasStrokes = strokes;
    renderCommittedStrokes();
  });

  subscribeSnapshots((snapshots) => {
    state.canvasSnapshots = snapshots;
    if (state.active === 'draw' && state.drawView === 'gallery') {
      render();
    }
  });

  render();

  setInterval(() => {
    if (state.active === 'home') {
      render();
    } else {
      const clockBtn = document.querySelector('.tb-clock');
      if (clockBtn) clockBtn.textContent = fmtTime(new Date());
    }
  }, 1000);
}

onAuth((user) => {
  if (user) {
    state.identity = getIdentity();
    if (!state.identity) {
      document.getElementById('desktop').textContent = 'unknown user';
      return;
    }
    boot();
  }
});

// Auto sign-in: credentials injected at build time or fall back to prompt.
// On the Pi, set VITE_LB_EMAIL and VITE_LB_PASS in a .env file.
const email = import.meta.env.VITE_LB_EMAIL;
const pass = import.meta.env.VITE_LB_PASS;
if (email && pass) {
  signIn(email, pass).catch((err) => {
    document.getElementById('desktop').textContent = `auth error: ${err.message}`;
  });
} else {
  document.getElementById('desktop').textContent = 'set VITE_LB_EMAIL and VITE_LB_PASS in .env';
}
