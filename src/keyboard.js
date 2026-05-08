// Vanilla port of D1Keyboard from design_handoff_sakura_os_keyboard.
// Touch-friendly QWERTY, beveled retro keys. Slides up from the bottom of its
// containing relative-positioned parent. Sits above the 26px taskbar slot.

export const KB_PALETTES = {
  light: {
    chrome:    '#c8c0b0',
    chromeBar: '#a89e88',
    key:       '#e8e2d2',
    keyDown:   '#b8b0a0',
    keyText:   '#1a1410',
    accent:    '#d8627a',
    accentText:'#fff8e8',
    accentDown:'#a83a52',
    util:      '#d4ccba',
    utilDown:  '#9c9484',
    utilText:  '#5a5040',
    bevelHi:   '#fff8e8',
    bevelLo:   '#7a7060',
    bevelHi2:  '#ffffff',
    bevelLo2:  '#5a5040',
  },
  dark: {
    chrome:    '#0e1014',
    chromeBar: '#1c1f27',
    key:       '#1c1f27',
    keyDown:   '#0a0c10',
    keyText:   '#e8d8c4',
    accent:    '#d8627a',
    accentText:'#0e1014',
    accentDown:'#a83a52',
    util:      '#15181f',
    utilDown:  '#0a0c10',
    utilText:  '#8a8478',
    bevelHi:   '#2e323d',
    bevelLo:   '#000000',
    bevelHi2:  '#2e323d',
    bevelLo2:  '#000000',
  },
};

const KB_LAYOUT = {
  abc: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l',"'"],
    ['SHIFT','z','x','c','v','b','n','m',',','.','BACK'],
    ['SYM',' ','RET'],
  ],
  ABC: [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L','"'],
    ['shift','Z','X','C','V','B','N','M','!','?','BACK'],
    ['SYM',' ','RET'],
  ],
  sym: [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['-','/',':',';','(',')','$','&','@','"'],
    ['#+=','.',',','?','!',"'",'+','*','=','BACK'],
    ['ABC',' ','RET'],
  ],
  '#+=': [
    ['[',']','{','}','#','%','^','*','+','='],
    ['_','\\','|','~','<','>','€','£','¥','•'],
    ['sym','.',',','?','!',"'",'"','—','…','BACK'],
    ['ABC',' ','RET'],
  ],
};

let _kbAudioCtx = null;
function playKbClick(kind = 'tap') {
  try {
    if (!_kbAudioCtx) _kbAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _kbAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = kind === 'tap' ? 'square' : 'triangle';
    const f0 = kind === 'tap' ? 1800 : kind === 'space' ? 600 : 1200;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, ctx.currentTime + 0.04);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
  } catch (e) { /* mute on any audio failure */ }
}

const SPECIALS = new Set(['SHIFT','shift','BACK','RET','SYM','ABC','#+=','sym']);

function bevelShadow(p, down) {
  return down
    ? `inset 1px 1px 0 ${p.bevelLo}, inset -1px -1px 0 ${p.bevelHi}, inset 2px 2px 0 ${p.bevelLo2}, inset -2px -2px 0 ${p.bevelHi2}`
    : `inset 1px 1px 0 ${p.bevelHi}, inset -1px -1px 0 ${p.bevelLo}, inset 2px 2px 0 ${p.bevelHi2}, inset -2px -2px 0 ${p.bevelLo2}`;
}

function makeKey(p, { label, kind = 'char', flex = 1, onPress, soundKind, ariaLabel }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kb-key';
  btn.setAttribute('aria-label', ariaLabel || label);
  btn.dataset.kind = kind;
  btn.textContent = label === ' ' ? '␣' : label;
  Object.assign(btn.style, {
    flex: String(flex),
    height: '100%',
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"VT323", "Courier New", monospace',
    fontSize: '24px',
    lineHeight: '1',
    userSelect: 'none',
    touchAction: 'manipulation',
    transition: 'background 30ms linear',
    padding: '0',
  });

  const paint = (down) => {
    const isUtil = kind === 'util';
    const isAccent = kind === 'accent';
    const bg = down
      ? (isAccent ? p.accentDown : isUtil ? p.utilDown : p.keyDown)
      : (isAccent ? p.accent : isUtil ? p.util : p.key);
    const fg = isAccent ? p.accentText : isUtil ? p.utilText : p.keyText;
    btn.style.background = bg;
    btn.style.color = fg;
    btn.style.boxShadow = bevelShadow(p, down);
    btn.style.transform = down ? 'translate(0.5px, 0.5px)' : 'none';
  };
  paint(false);

  const down = (e) => {
    e.preventDefault();
    paint(true);
    playKbClick(soundKind || (label === ' ' ? 'space' : (kind === 'util' || kind === 'accent') ? 'util' : 'tap'));
    onPress && onPress();
  };
  const up = () => paint(false);

  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('pointercancel', up);

  return btn;
}

// Public factory.
//
// Options:
//   theme: 'light' | 'dark'  (default 'light')
//   onKey(ch), onBackspace(), onEnter(), onClose(), onSubmit?
//   height: number (default 220)
//   label: string (default 'KEYS.SYS')
//
// Returns { el, open(), close(), isOpen(), setLabel(s), destroy() }.
export function createKeyboard(opts = {}) {
  const theme = opts.theme || 'light';
  const p = KB_PALETTES[theme];
  const height = opts.height || 220;

  let layout = 'abc';
  let shiftLatch = false;
  let capsLock = false;
  let labelText = opts.label || 'KEYS.SYS';
  let isOpen = false;

  // When the keyboard is up the taskbar hides (see body.kb-up in style.css),
  // so the keyboard sits flush at bottom: 0 and reclaims that vertical space.
  const root = document.createElement('div');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'On-screen keyboard');
  root.className = 'kb-root';
  Object.assign(root.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    height: height + 'px',
    background: p.chrome,
    boxShadow: `inset 0 1px 0 ${p.bevelHi}, 0 -2px 0 ${p.bevelLo}`,
    display: 'none',
    flexDirection: 'column',
    zIndex: '20',
  });

  // chrome bar
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    background: p.chromeBar,
    color: p.keyText,
    padding: '3px 6px',
    fontFamily: '"VT323", monospace',
    fontSize: '13px',
    letterSpacing: '0.5px',
    minHeight: '36px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${p.bevelLo}`,
    flexShrink: '0',
  });

  const barLeft = document.createElement('span');
  Object.assign(barLeft.style, { display: 'flex', alignItems: 'center', gap: '6px' });
  const dot = document.createElement('span');
  Object.assign(dot.style, { width: '6px', height: '6px', background: p.accent, display: 'inline-block' });
  const labelSpan = document.createElement('span');
  barLeft.appendChild(dot);
  barLeft.appendChild(labelSpan);

  const barRight = document.createElement('span');
  Object.assign(barRight.style, { display: 'flex', gap: '6px', alignItems: 'center' });

  function chromeBtn(text, accent, handler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    Object.assign(b.style, {
      background: accent ? p.accent : p.util,
      color: accent ? p.accentText : p.utilText,
      border: 'none',
      boxShadow: accent
        ? `inset 1px 1px 0 ${p.bevelHi}, inset -1px -1px 0 ${p.bevelLo}, inset 2px 2px 0 ${p.bevelHi2}, inset -2px -2px 0 ${p.bevelLo2}`
        : `inset 1px 1px 0 ${p.bevelHi}, inset -1px -1px 0 ${p.bevelLo}`,
      fontFamily: '"VT323", monospace',
      fontSize: accent ? '18px' : '13px',
      letterSpacing: accent ? '0.5px' : '0',
      padding: accent ? '6px 18px' : '1px 8px',
      minHeight: accent ? '30px' : '20px',
      minWidth: accent ? '90px' : 'auto',
      cursor: 'pointer',
      touchAction: 'manipulation',
    });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); playKbClick('util'); handler(); });
    return b;
  }

  let handlers = {
    onKey: opts.onKey,
    onBackspace: opts.onBackspace,
    onEnter: opts.onEnter,
    onClose: opts.onClose,
    onSubmit: opts.onSubmit,
  };

  const hideBtn = chromeBtn('hide ▾', false, () => { close(); handlers.onClose && handlers.onClose(); });
  Object.assign(hideBtn.style, {
    fontSize: '18px',
    padding: '4px 10px',
    minHeight: '30px',
  });
  barRight.appendChild(hideBtn);

  const submitBtn = chromeBtn('send ▸', true, () => handlers.onSubmit && handlers.onSubmit());
  submitBtn.style.display = handlers.onSubmit ? '' : 'none';
  barRight.appendChild(submitBtn);

  bar.appendChild(barLeft);
  bar.appendChild(barRight);
  root.appendChild(bar);

  // key area
  const keyArea = document.createElement('div');
  Object.assign(keyArea.style, {
    flex: '1',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minHeight: '0',
  });
  root.appendChild(keyArea);

  function refreshLabel() {
    const tag = capsLock ? ' · CAPS' : shiftLatch ? ' · SHIFT' : '';
    labelSpan.textContent = labelText + tag;
  }

  function visibleLayout() {
    return (capsLock || shiftLatch) ? (layout === 'abc' ? 'ABC' : layout) : layout;
  }

  function handleChar(ch) {
    handlers.onKey && handlers.onKey(ch);
    if (shiftLatch && !capsLock) { shiftLatch = false; rebuild(); }
  }

  function handleSpecial(k) {
    if (k === 'BACK')      { handlers.onBackspace && handlers.onBackspace(); return; }
    if (k === 'RET')       { handlers.onEnter && handlers.onEnter(); return; }
    if (k === ' ')         { handlers.onKey && handlers.onKey(' '); return; }
    if (k === 'SHIFT' || k === 'shift') {
      if (shiftLatch) { capsLock = true; shiftLatch = false; }
      else if (capsLock) { capsLock = false; }
      else { shiftLatch = true; }
      rebuild(); return;
    }
    if (k === 'SYM')  { layout = 'sym'; rebuild(); return; }
    if (k === 'ABC')  { layout = 'abc'; rebuild(); return; }
    if (k === '#+=')  { layout = '#+='; rebuild(); return; }
    if (k === 'sym')  { layout = 'sym'; rebuild(); return; }
  }

  function rebuild() {
    refreshLabel();
    keyArea.innerHTML = '';
    const rows = KB_LAYOUT[visibleLayout()];
    for (const row of rows) {
      const rowEl = document.createElement('div');
      Object.assign(rowEl.style, { flex: '1', display: 'flex', gap: '4px', minHeight: '0' });
      for (const k of row) {
        let key;
        if (k === ' ') {
          key = makeKey(p, { label: 'space', kind: 'util', flex: 5, onPress: () => handleSpecial(' '), soundKind: 'space', ariaLabel: 'Space' });
        } else if (k === 'BACK') {
          key = makeKey(p, { label: '⌫', kind: 'util', flex: 1.5, onPress: () => handleSpecial('BACK'), soundKind: 'util', ariaLabel: 'Backspace' });
        } else if (k === 'RET') {
          key = makeKey(p, { label: '↵', kind: 'accent', flex: 1.5, onPress: () => handleSpecial('RET'), soundKind: 'util', ariaLabel: 'Return' });
        } else if (k === 'SHIFT' || k === 'shift') {
          const kind = (shiftLatch || capsLock) ? 'accent' : 'util';
          const label = capsLock ? '⇪' : '⇧';
          key = makeKey(p, { label, kind, flex: 1.5, onPress: () => handleSpecial(k), soundKind: 'util', ariaLabel: 'Shift' });
        } else if (k === 'SYM') {
          key = makeKey(p, { label: '123', kind: 'util', flex: 1.4, onPress: () => handleSpecial('SYM'), soundKind: 'util', ariaLabel: 'Symbols' });
        } else if (k === 'ABC') {
          key = makeKey(p, { label: 'abc', kind: 'util', flex: 1.4, onPress: () => handleSpecial('ABC'), soundKind: 'util', ariaLabel: 'Letters' });
        } else if (k === '#+=') {
          key = makeKey(p, { label: '#+=', kind: 'util', flex: 1.4, onPress: () => handleSpecial('#+='), soundKind: 'util', ariaLabel: 'More symbols' });
        } else if (k === 'sym') {
          key = makeKey(p, { label: '123', kind: 'util', flex: 1.4, onPress: () => handleSpecial('sym'), soundKind: 'util', ariaLabel: 'Numbers' });
        } else {
          const isSpecial = SPECIALS.has(k);
          key = makeKey(p, { label: k, kind: isSpecial ? 'util' : 'char', onPress: () => handleChar(k) });
        }
        rowEl.appendChild(key);
      }
      keyArea.appendChild(rowEl);
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    document.body.classList.add('kb-up');
    root.style.display = 'flex';
    root.style.animation = 'kbslideup 180ms cubic-bezier(.2,.7,.3,1) both';
    rebuild();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    document.body.classList.remove('kb-up');
    root.style.display = 'none';
    // Swallow the ghost click: when 'hide' fires on pointerdown and the
    // keyboard disappears, the finger-lift generates a click on whatever's
    // now under that touch point (e.g. the note text field), which would
    // re-open the keyboard. Block all pointer events for ~350ms.
    document.body.classList.add('kb-just-closed');
    setTimeout(() => document.body.classList.remove('kb-just-closed'), 350);
  }

  function setLabel(s) {
    labelText = s;
    refreshLabel();
  }

  function destroy() {
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  function setHandlers(h) {
    handlers = { ...handlers, ...h };
    submitBtn.style.display = handlers.onSubmit ? '' : 'none';
  }

  rebuild();

  return { el: root, open, close, isOpen: () => isOpen, setLabel, setHandlers, destroy };
}
