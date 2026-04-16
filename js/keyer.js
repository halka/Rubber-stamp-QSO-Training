/**
 * keyer.js — CW input handler
 * Supports straight key and iambic paddle (Mode B).
 * Input sources: keyboard ([/]/Space), touch, and mouse.
 * Calls onElement({type:'dit'|'dah'}) after each element is sent.
 */

export function createKeyer(audio, onElement) {
  let _mode = 'paddle';   // 'paddle' | 'straight'
  let _wpm = 15;
  let _charWpm = 20;

  // ---- Straight key state ----
  let sk_down = false;
  let sk_startTime = 0;

  // ---- Iambic keyer state ----
  // States: IDLE, DIT, DAH, DIT_GAP, DAH_GAP
  let state = 'IDLE';
  let ditHeld = false;
  let dahHeld = false;
  let elementTimer = null;

  function ditMs() { return 1200 / _charWpm; }
  function dahMs() { return 3 * ditMs(); }
  function elGapMs() { return ditMs(); }

  // ---- Straight key ----

  function straightKeyDown() {
    if (_mode !== 'straight') return;
    if (sk_down) return;
    sk_down = true;
    sk_startTime = performance.now();
    audio.keyDown();
  }

  function straightKeyUp() {
    if (_mode !== 'straight') return;
    if (!sk_down) return;
    sk_down = false;
    audio.keyUp();
    const dur = performance.now() - sk_startTime;
    const type = dur < ditMs() * 1.5 ? 'dit' : 'dah';
    onElement({ type });
  }

  // ---- Iambic paddle (Mode B) ----

  function ditDown() {
    if (_mode !== 'paddle') return;
    ditHeld = true;
    if (state === 'IDLE') startDit();
  }

  function ditUp() {
    if (_mode !== 'paddle') return;
    ditHeld = false;
  }

  function dahDown() {
    if (_mode !== 'paddle') return;
    dahHeld = true;
    if (state === 'IDLE') startDah();
  }

  function dahUp() {
    if (_mode !== 'paddle') return;
    dahHeld = false;
  }

  function startDit() {
    state = 'DIT';
    audio.keyDown();
    scheduleEnd(ditMs(), afterDit);
  }

  function startDah() {
    state = 'DAH';
    audio.keyDown();
    scheduleEnd(dahMs(), afterDah);
  }

  function afterDit() {
    audio.keyUp();
    onElement({ type: 'dit' });
    state = 'DIT_GAP';
    scheduleEnd(elGapMs(), afterDitGap);
  }

  function afterDah() {
    audio.keyUp();
    onElement({ type: 'dah' });
    state = 'DAH_GAP';
    scheduleEnd(elGapMs(), afterDahGap);
  }

  function afterDitGap() {
    // Mode B: if dah was pressed during the dit (or is still held), send dah
    if (dahHeld) { startDah(); return; }
    if (ditHeld) { startDit(); return; }
    state = 'IDLE';
  }

  function afterDahGap() {
    if (ditHeld) { startDit(); return; }
    if (dahHeld) { startDah(); return; }
    state = 'IDLE';
  }

  let _timerStart = 0;
  let _timerDuration = 0;

  function scheduleEnd(ms, cb) {
    clearTimeout(elementTimer);
    _timerStart = performance.now();
    _timerDuration = ms;
    elementTimer = setTimeout(() => {
      // Compensate for setTimeout jitter: if we fired early (rare), re-schedule remainder
      const elapsed = performance.now() - _timerStart;
      const remaining = _timerDuration - elapsed;
      if (remaining > 2) {
        elementTimer = setTimeout(cb, remaining);
        return;
      }
      cb();
    }, ms);
  }

  function reset() {
    clearTimeout(elementTimer);
    state = 'IDLE';
    ditHeld = false;
    dahHeld = false;
    sk_down = false;
    audio.keyUp();
  }

  function setMode(m) {
    reset();
    _mode = m;
  }

  function setWpm(w, cw) {
    _wpm = w;
    _charWpm = cw || Math.max(w, _charWpm);
    audio.setWpm(w, cw);
  }

  // ---- Input binding ----

  function bindInputs() {
    const ditBtn = document.getElementById('dit-btn');
    const dahBtn = document.getElementById('dah-btn');
    const skBtn  = document.getElementById('sk-btn');

    if (!ditBtn || !dahBtn || !skBtn) return;

    // Prevent context menu / text selection on long press
    [ditBtn, dahBtn, skBtn].forEach(b => {
      b.addEventListener('contextmenu', e => e.preventDefault());
    });

    // ---- Touch events (mobile) ----
    let touchDit = false, touchDah = false, touchSk = false;

    ditBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      touchDit = true;
      setAriaPressed(ditBtn, true);
      ditDown();
    }, { passive: false });

    ditBtn.addEventListener('touchend', e => {
      e.preventDefault();
      touchDit = false;
      setAriaPressed(ditBtn, false);
      ditUp();
    }, { passive: false });

    ditBtn.addEventListener('touchcancel', () => {
      touchDit = false;
      setAriaPressed(ditBtn, false);
      ditUp();
    });

    dahBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      touchDah = true;
      setAriaPressed(dahBtn, true);
      dahDown();
    }, { passive: false });

    dahBtn.addEventListener('touchend', e => {
      e.preventDefault();
      touchDah = false;
      setAriaPressed(dahBtn, false);
      dahUp();
    }, { passive: false });

    dahBtn.addEventListener('touchcancel', () => {
      touchDah = false;
      setAriaPressed(dahBtn, false);
      dahUp();
    });

    skBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      touchSk = true;
      setAriaPressed(skBtn, true);
      straightKeyDown();
    }, { passive: false });

    skBtn.addEventListener('touchend', e => {
      e.preventDefault();
      touchSk = false;
      setAriaPressed(skBtn, false);
      straightKeyUp();
    }, { passive: false });

    skBtn.addEventListener('touchcancel', () => {
      touchSk = false;
      setAriaPressed(skBtn, false);
      straightKeyUp();
    });

    // ---- Mouse events (desktop) ----
    ditBtn.addEventListener('mousedown', e => {
      if (touchDit) return;
      e.preventDefault();
      setAriaPressed(ditBtn, true);
      ditDown();
    });
    ditBtn.addEventListener('mouseup', () => {
      if (touchDit) return;
      setAriaPressed(ditBtn, false);
      ditUp();
    });
    ditBtn.addEventListener('mouseleave', () => {
      if (touchDit) return;
      if (ditHeld) { setAriaPressed(ditBtn, false); ditUp(); }
    });

    dahBtn.addEventListener('mousedown', e => {
      if (touchDah) return;
      e.preventDefault();
      setAriaPressed(dahBtn, true);
      dahDown();
    });
    dahBtn.addEventListener('mouseup', () => {
      if (touchDah) return;
      setAriaPressed(dahBtn, false);
      dahUp();
    });
    dahBtn.addEventListener('mouseleave', () => {
      if (touchDah) return;
      if (dahHeld) { setAriaPressed(dahBtn, false); dahUp(); }
    });

    skBtn.addEventListener('mousedown', e => {
      if (touchSk) return;
      e.preventDefault();
      setAriaPressed(skBtn, true);
      straightKeyDown();
    });
    skBtn.addEventListener('mouseup', () => {
      if (touchSk) return;
      setAriaPressed(skBtn, false);
      straightKeyUp();
    });
    skBtn.addEventListener('mouseleave', () => {
      if (touchSk) return;
      if (sk_down) { setAriaPressed(skBtn, false); straightKeyUp(); }
    });

    // ---- Keyboard events ----
    const keyMap = {
      '[': { down: () => { setAriaPressed(ditBtn, true);  ditDown(); },
             up:   () => { setAriaPressed(ditBtn, false); ditUp();   } },
      ']': { down: () => { setAriaPressed(dahBtn, true);  dahDown(); },
             up:   () => { setAriaPressed(dahBtn, false); dahUp();   } },
      ' ': { down: () => { setAriaPressed(skBtn, true);  straightKeyDown(); },
             up:   () => { setAriaPressed(skBtn, false); straightKeyUp();   } },
    };

    const keysDown = new Set();

    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;
      if (keysDown.has(key)) return; // suppress auto-repeat
      const binding = keyMap[key];
      if (!binding) return;
      e.preventDefault();
      keysDown.add(key);
      binding.down();
    });

    window.addEventListener('keyup', e => {
      const key = e.key;
      if (!keysDown.has(key)) return;
      keysDown.delete(key);
      const binding = keyMap[key];
      if (!binding) return;
      binding.up();
    });

    // Release all keys when window loses focus
    window.addEventListener('blur', () => {
      keysDown.clear();
      reset();
      setAriaPressed(ditBtn, false);
      setAriaPressed(dahBtn, false);
      setAriaPressed(skBtn, false);
    });
  }

  function setAriaPressed(el, val) {
    el.setAttribute('aria-pressed', val ? 'true' : 'false');
    el.classList.toggle('active', val);
  }

  function getMode() { return _mode; }

  return { ditDown, ditUp, dahDown, dahUp, straightKeyDown, straightKeyUp, setMode, setWpm, reset, bindInputs, getMode };
}
