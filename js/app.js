/**
 * app.js — Main orchestrator
 * Wires together audio, keyer, decoder, trainer and UI.
 */

import { createAudioEngine } from './audio.js';
import { createKeyer }       from './keyer.js';
import { createDecoder }     from './decoder.js';
import { buildScript, createTrainer, matchText } from './trainer.js';

// ============================================================
// Morse encoding table (for pattern guide display)
// ============================================================
const MORSE_ENC = {
  A:'.-',   B:'-...', C:'-.-.', D:'-..', E:'.',    F:'..-.',
  G:'--.',  H:'....', I:'..',   J:'.---',K:'-.-',  L:'.-..',
  M:'--',   N:'-.',   O:'---',  P:'.--.', Q:'--.-', R:'.-.',
  S:'...',  T:'-',    U:'..-',  V:'...-', W:'.--',  X:'-..-',
  Y:'-.--', Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
  '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-', ',':'--..--', '?':'..--..', '/':'-..-.', '-':'-....-',
  // prosigns stored as multi-char keys
  AR:'.-.-.', SK:'...-.-', KN:'-.--.', BT:'-...-',
};

// Tokenise a text string into an array of {token, pattern} objects.
// Prosigns like AR, SK, KN, BT are treated as single tokens.
function tokensFromText(text) {
  const PROSIGNS = ['AR','SK','KN','BT'];
  const tokens = [];
  const upper = text.toUpperCase();
  let i = 0;
  while (i < upper.length) {
    // Check 2-char prosign
    const two = upper.slice(i, i + 2);
    if (PROSIGNS.includes(two)) {
      tokens.push({ token: two, pattern: MORSE_ENC[two] || '' });
      i += 2;
      continue;
    }
    const ch = upper[i];
    if (ch === ' ') {
      tokens.push({ token: ' ', pattern: null }); // word gap
    } else {
      tokens.push({ token: ch, pattern: MORSE_ENC[ch] || null });
    }
    i++;
  }
  return tokens;
}

// Build the Morse guide DOM inside #morse-guide.
// sentText is the user's decoded text so far (used to mark sent chars).
function renderMorseGuide(expectedText, sentText) {
  const guideEl = document.getElementById('morse-guide');
  if (!guideEl) return;

  const tokens = tokensFromText(expectedText || '');
  const sentLen = (sentText || '').replace(/\s+$/, '').length; // chars sent so far
  // Map sent length to token index (count non-space tokens)
  let nonSpaceSent = 0;
  const sentChars = (sentText || '').replace(/ /g, '').length;

  let nonSpaceCount = 0;
  const html = tokens.map(({ token, pattern }) => {
    if (token === ' ') {
      return '<span class="mg-sp"></span>';
    }
    if (!pattern) return ''; // unknown char — skip
    const isSent    = nonSpaceCount < sentChars;
    const isCurrent = nonSpaceCount === sentChars;
    nonSpaceCount++;

    const cls = isSent ? 'mg-cg mc-sent' : isCurrent ? 'mg-cg mc-curr' : 'mg-cg';
    const dots = pattern.split('').map(c =>
      c === '.' ? '<span class="md"></span>' : '<span class="mh"></span>'
    ).join('');
    return `<span class="${cls}"><span class="mg-ltr">${token}</span><span class="mg-pat">${dots}</span></span>`;
  }).join('');

  guideEl.innerHTML = html;

  // Scroll current character into view
  const curr = guideEl.querySelector('.mc-curr');
  if (curr) curr.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function clearMorseGuide() {
  const guideEl = document.getElementById('morse-guide');
  if (guideEl) guideEl.innerHTML = '';
}

// ============================================================
// Default settings
// ============================================================
const DEFAULTS = {
  mycall:    'W1AW',
  theircall: 'K1TTT',
  myname:    'HIRAM',
  theirname: 'MAX',
  myloc:     'NEWINGTON CT',
  theirloc:  'ALBANY NY',
  rst:       '599',
  wpm:       15,
  charWpm:   20,
  freq:      700,
  volume:    0.7,
  keyMode:   'paddle',
  mode:      'qso_guide',
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('cw-qso-settings') || '{}');
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

function saveSettings(s) {
  localStorage.setItem('cw-qso-settings', JSON.stringify(s));
}

// ============================================================
// DOM references
// ============================================================
const $ = id => document.getElementById(id);

const mainEl        = $('main');
const stepLabel     = $('step-label');
const scriptDisplay = $('script-display');
const decodedDisplay= $('decoded-display');
const hintText      = $('hint-text');
const progressBar   = $('progress-bar');
const wpmBadge      = $('wpm-display');
const stepCounter   = $('step-counter');
const prevBtn       = $('prev-step-btn');
const nextBtn       = $('next-step-btn');
const replayBtn     = $('replay-btn');
const settingsBtn   = $('settings-btn');
const settingsClose = $('settings-close');
const settingsSave  = $('settings-save');
const settingsPanel = $('settings-panel');
const overlay       = $('overlay');
const modeBtns      = document.querySelectorAll('.mode-btn');

// Settings inputs
const si = id => $(id);

// ============================================================
// App state
// ============================================================
let settings = loadSettings();
let audio, keyer, decoder, trainer, script;
let currentMode = settings.mode;
let practiceText = '';
let listenPlaying = false;

// ============================================================
// Initialise modules
// ============================================================
function init() {
  audio   = createAudioEngine(settings.freq, settings.wpm, settings.charWpm, settings.volume);
  decoder = createDecoder(settings.wpm, settings.charWpm, onDecodedChar, onDecodedWord);
  keyer   = createKeyer(audio, el => {
    decoder.pushElement(el.type);
    audio.resume();
  });
  keyer.setMode(settings.keyMode);
  keyer.setWpm(settings.wpm, settings.charWpm);
  keyer.bindInputs();

  script  = buildScript(settings);
  trainer = createTrainer(script, audio, onStepChange);

  applyMode(currentMode);
  updateWpmBadge();
  populateSettingsForm();

  // Resume AudioContext on any visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) audio.resume();
  });
}

// ============================================================
// Mode management
// ============================================================
function applyMode(mode) {
  currentMode = mode;
  mainEl.dataset.mode = mode;
  modeBtns.forEach(b => {
    const active = b.dataset.mode === mode;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  audio.stopPlayback();
  decoder.reset();
  practiceText = '';
  decodedDisplay.textContent = '';
  clearMorseGuide();

  switch (mode) {
    case 'qso_guide':
      trainer.reset();
      trainer.start();
      break;
    case 'practice':
      scriptDisplay.innerHTML = '';
      stepLabel.textContent = 'Practice Mode — send anything';
      hintText.textContent = 'Your decoded text appears below. [ = dit  ] = dah  Space = straight key';
      stepCounter.textContent = '';
      progressBar.style.width = '0%';
      break;
    case 'listen':
      startListenMode();
      break;
    case 'vband_assist':
      startVbandMode();
      break;
  }
}

// ============================================================
// QSO Guide mode callbacks
// ============================================================
function onStepChange(step, idx, total, sentText) {
  if (!step) {
    // QSO complete
    stepLabel.textContent = 'QSO Complete!';
    scriptDisplay.innerHTML = '<span class="ch-match">73 DE ' + settings.mycall + ' SK</span>';
    hintText.textContent = 'Well done! Press Next to start over.';
    stepCounter.textContent = total + '/' + total;
    progressBar.style.width = '100%';
    decodedDisplay.textContent = '';
    clearMorseGuide();
    return;
  }

  stepLabel.textContent = step.label;
  hintText.textContent = step.hint;
  stepCounter.textContent = (idx + 1) + ' / ' + total;
  progressBar.style.width = (((idx) / total) * 100).toFixed(0) + '%';

  if (step.role === 'partner') {
    scriptDisplay.innerHTML = '<em style="color:var(--accent)">' + escHtml(step.text) + '</em>';
    decodedDisplay.textContent = '(listening…)';
    replayBtn.style.visibility = 'visible';
    clearMorseGuide();
  } else {
    renderMatchDisplay(sentText || '', step.text);
    decodedDisplay.textContent = sentText ? escHtml(sentText) : '';
    replayBtn.style.visibility = 'hidden';
    renderMorseGuide(step.text, sentText || '');
  }
}

function onDecodedChar(ch) {
  if (currentMode === 'practice') {
    practiceText += ch;
    decodedDisplay.textContent = practiceText;
  } else if (currentMode === 'qso_guide') {
    trainer.onDecodedChar(ch);
  } else if (currentMode === 'vband_assist') {
    practiceText += ch;
    decodedDisplay.textContent = practiceText;
  }
}

function onDecodedWord(sp) {
  if (currentMode === 'practice' || currentMode === 'vband_assist') {
    if (practiceText.length && practiceText[practiceText.length - 1] !== ' ') {
      practiceText += ' ';
      decodedDisplay.textContent = practiceText;
    }
  } else if (currentMode === 'qso_guide') {
    trainer.onDecodedChar(' ');
  }
}

function renderMatchDisplay(sent, expected) {
  const matches = matchText(sent, expected);
  scriptDisplay.innerHTML = matches.map(m => {
    const ch = m.char === ' ' ? '&nbsp;' : escHtml(m.char);
    return `<span class="ch-${m.status}">${ch}</span>`;
  }).join('');
}

// ============================================================
// Listen mode
// ============================================================
function startListenMode() {
  const fullQSO = script.map(s => s.text).join('  ');
  stepLabel.textContent = 'Listen Mode';
  hintText.textContent  = 'The full QSO is being played. Follow along.';
  decodedDisplay.textContent = '';
  stepCounter.textContent = '';
  progressBar.style.width = '0%';
  listenPlaying = true;
  let stepIdx = 0;

  function playNext() {
    if (stepIdx >= script.length) {
      listenPlaying = false;
      stepLabel.textContent = 'Listen Mode — Complete';
      hintText.textContent = 'Switch to QSO Guide to practice sending.';
      progressBar.style.width = '100%';
      return;
    }
    const step = script[stepIdx];
    stepLabel.textContent = step.label + (step.role === 'partner' ? ' (partner)' : ' (you)');
    scriptDisplay.textContent = step.text;
    progressBar.style.width = ((stepIdx / script.length) * 100).toFixed(0) + '%';
    audio.playCWString(step.text, () => {
      stepIdx++;
      setTimeout(playNext, 800);
    });
  }

  playNext();
}

// ============================================================
// vband Assist mode
// ============================================================
function startVbandMode() {
  practiceText = '';
  decoder.reset();
  const step = script.find(s => s.role === 'user') || script[0];
  stepLabel.textContent = 'vband Assist';
  hintText.textContent  = 'Use [ ] keys on vband. Practice here first, then send the same on vband.';
  decodedDisplay.textContent = '';

  let html = '<div style="margin-bottom:8px;font-size:0.8rem;color:var(--text-dim)">Next to send on vband:</div>';
  html += '<div style="font-family:var(--font-mono);font-size:1rem;margin-bottom:10px">' + escHtml(step.text) + '</div>';
  html += '<div class="vband-keys-visual">';
  html += '<div class="vband-key-chip dit">[ = DIT</div>';
  html += '<div style="color:var(--text-dim);font-size:0.8rem">paddle</div>';
  html += '<div class="vband-key-chip dah">] = DAH</div>';
  html += '</div>';
  scriptDisplay.innerHTML = html;
}

// ============================================================
// Step navigation buttons
// ============================================================
if (prevBtn) prevBtn.addEventListener('click', () => {
  if (currentMode !== 'qso_guide') return;
  const idx = trainer.getStepIndex();
  trainer.goToStep(Math.max(0, idx - 1));
});

if (nextBtn) nextBtn.addEventListener('click', () => {
  if (currentMode !== 'qso_guide') return;
  const idx = trainer.getStepIndex();
  const total = trainer.stepCount();
  if (idx < total - 1) trainer.goToStep(idx + 1);
  else { trainer.reset(); trainer.start(); }
});

if (replayBtn) replayBtn.addEventListener('click', () => {
  if (currentMode !== 'qso_guide') return;
  trainer.replayPartner();
});

// ============================================================
// Mode bar
// ============================================================
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode !== currentMode) applyMode(mode);
  });
});

// ============================================================
// Settings panel
// ============================================================
function openSettings() {
  settingsPanel.classList.add('open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  overlay.classList.add('visible');
  settingsBtn.setAttribute('aria-expanded', 'true');
  settingsClose.focus();
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('visible');
  settingsBtn.setAttribute('aria-expanded', 'false');
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
overlay.addEventListener('click', closeSettings);

settingsSave.addEventListener('click', () => {
  applySettingsFromForm();
  closeSettings();
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && settingsPanel.classList.contains('open')) closeSettings();
});

function populateSettingsForm() {
  $('s-mycall').value    = settings.mycall;
  $('s-myname').value    = settings.myname;
  $('s-myloc').value     = settings.myloc;
  $('s-theircall').value = settings.theircall;
  $('s-theirname').value = settings.theirname;
  $('s-theirloc').value  = settings.theirloc;
  $('s-rst').value       = settings.rst;

  const wpmInput     = $('s-wpm');
  const charWpmInput = $('s-charwpm');
  const freqInput    = $('s-freq');
  const volInput     = $('s-vol');

  wpmInput.value     = settings.wpm;
  charWpmInput.value = settings.charWpm;
  freqInput.value    = settings.freq;
  volInput.value     = Math.round(settings.volume * 100);

  $('s-wpm-val').textContent     = settings.wpm;
  $('s-charwpm-val').textContent = settings.charWpm;
  $('s-freq-val').textContent    = settings.freq;
  $('s-vol-val').textContent     = Math.round(settings.volume * 100);

  const modeRadio = settings.keyMode === 'straight' ? $('s-mode-straight') : $('s-mode-paddle');
  if (modeRadio) modeRadio.checked = true;

  // Live range display
  wpmInput.addEventListener('input', () => {
    $('s-wpm-val').textContent = wpmInput.value;
    // Ensure charWpm >= wpm
    if (+charWpmInput.value < +wpmInput.value) {
      charWpmInput.value = wpmInput.value;
      $('s-charwpm-val').textContent = wpmInput.value;
    }
  });
  charWpmInput.addEventListener('input', () => {
    $('s-charwpm-val').textContent = charWpmInput.value;
  });
  freqInput.addEventListener('input', () => {
    $('s-freq-val').textContent = freqInput.value;
    audio.setFreq(+freqInput.value); // live preview
  });
  volInput.addEventListener('input', () => {
    $('s-vol-val').textContent = volInput.value;
    audio.setVolume(+volInput.value / 100);
  });
}

function applySettingsFromForm() {
  const wpm     = Math.max(5, Math.min(40, +$('s-wpm').value));
  const charWpm = Math.max(wpm, Math.min(40, +$('s-charwpm').value));
  const freq    = Math.max(400, Math.min(900, +$('s-freq').value));
  const vol     = Math.max(0, Math.min(100, +$('s-vol').value)) / 100;
  const keyMode = $('s-mode-straight').checked ? 'straight' : 'paddle';

  settings = {
    ...settings,
    mycall:    ($('s-mycall').value.trim().toUpperCase() || DEFAULTS.mycall),
    myname:    ($('s-myname').value.trim().toUpperCase() || DEFAULTS.myname),
    myloc:     ($('s-myloc').value.trim().toUpperCase() || DEFAULTS.myloc),
    theircall: ($('s-theircall').value.trim().toUpperCase() || DEFAULTS.theircall),
    theirname: ($('s-theirname').value.trim().toUpperCase() || DEFAULTS.theirname),
    theirloc:  ($('s-theirloc').value.trim().toUpperCase() || DEFAULTS.theirloc),
    rst:       ($('s-rst').value.trim() || '599'),
    wpm, charWpm, freq, volume: vol, keyMode,
  };

  saveSettings(settings);

  // Apply to modules
  audio.setFreq(freq);
  audio.setVolume(vol);
  audio.setWpm(wpm, charWpm);
  keyer.setWpm(wpm, charWpm);
  keyer.setMode(keyMode);
  decoder.setWpm(wpm, charWpm);

  // Rebuild script with new callsigns etc.
  script = buildScript(settings);
  trainer.reset();

  // Update UI
  mainEl.dataset.keyMode = keyMode;
  updateWpmBadge();

  // Re-enter current mode with fresh state
  applyMode(currentMode);
}

function updateWpmBadge() {
  wpmBadge.textContent = settings.wpm + ' WPM';
}

// ============================================================
// Key mode visual switch
// ============================================================
function syncKeyModeUI() {
  mainEl.dataset.keyMode = settings.keyMode;
}

// ============================================================
// Helpers
// ============================================================
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// Boot
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  syncKeyModeUI();
  init();
});
