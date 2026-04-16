/**
 * audio.js — Web Audio API engine
 * Handles sidetone (live keying) and scheduled CW playback (listen mode).
 */

const MORSE_CHAR = {
  A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....',
  I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.',
  Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-',
  Y:'-.--', Z:'--..',
  '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-',
  '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
  '.':'.-.-.-', ',':'--..--', '?':'..--..', '/':'-..-.', '-':'-....-',
  '+':'.-.-.', '=':'-...-', '@':'.--.-.', ':':'---...',
  // prosigns encoded as single tokens
  'AR':'.-.-.',  'SK':'...-.-', 'KN':'-.--.', 'BT':'-...-', 'AA':'.-.-',
};

/** Convert text to array of { symbol: '.'|'-', isSpace } events */
function textToMorse(text) {
  const tokens = tokenise(text.toUpperCase());
  const events = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === ' ') {
      events.push({ type: 'wordgap' });
      continue;
    }
    const code = MORSE_CHAR[tok];
    if (!code) continue;
    for (let j = 0; j < code.length; j++) {
      if (j > 0) events.push({ type: 'elgap' });
      events.push({ type: code[j] === '.' ? 'dit' : 'dah' });
    }
    if (i < tokens.length - 1 && tokens[i + 1] !== ' ') {
      events.push({ type: 'ltrgap' });
    }
  }
  return events;
}

/** Split text into character tokens, treating prosigns like AR/SK/KN/BT as single tokens */
function tokenise(text) {
  const prosigns = ['AR', 'SK', 'KN', 'BT', 'AA'];
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === ' ') { tokens.push(' '); i++; continue; }
    let matched = false;
    for (const ps of prosigns) {
      if (text.startsWith(ps, i)) {
        tokens.push(ps);
        i += ps.length;
        matched = true;
        break;
      }
    }
    if (!matched) { tokens.push(text[i]); i++; }
  }
  return tokens;
}

export function createAudioEngine(freq = 700, wpm = 15, charWpm = 20, volume = 0.7) {
  let ctx = null;
  let oscillator = null;
  let gainNode = null;
  let masterGain = null;
  let playbackSrc = null;  // scheduled gain node for playback
  let playbackOsc = null;
  let _freq = freq;
  let _wpm = wpm;
  let _charWpm = charWpm;
  let _vol = volume;
  let _playbackEndTime = 0;
  let _onPlaybackEnd = null;

  function ditMs(w) { return 1200 / w; }

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(_vol, ctx.currentTime);
    masterGain.connect(ctx.destination);

    oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(_freq, ctx.currentTime);
    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start();
  }

  function keyDown() {
    ensureContext();
    const t = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(1.0, t + 0.004);
  }

  function keyUp() {
    if (!ctx) return;
    const t = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(gainNode.gain.value, t);
    gainNode.gain.linearRampToValueAtTime(0.0, t + 0.008);
  }

  function playCWString(text, onEnd) {
    ensureContext();
    stopPlayback();

    playbackOsc = ctx.createOscillator();
    playbackOsc.type = 'sine';
    playbackOsc.frequency.setValueAtTime(_freq, ctx.currentTime);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0, ctx.currentTime);
    playbackOsc.connect(pg);
    pg.connect(masterGain);
    playbackOsc.start();
    playbackSrc = pg;

    const events = textToMorse(text);
    const dit = ditMs(_wpm) / 1000;
    const charDit = ditMs(_charWpm) / 1000;
    // inter-element and inter-letter use charWpm timing
    // inter-word uses wpm (overall) timing
    const dah = 3 * charDit;
    const elgap = charDit;
    const ltrgap = 3 * dit;     // Farnsworth: letter gap uses overall wpm
    const wordgap = 7 * dit;

    let t = ctx.currentTime + 0.05;
    for (const ev of events) {
      switch (ev.type) {
        case 'dit':
          pg.gain.setValueAtTime(1, t);
          t += charDit;
          pg.gain.setValueAtTime(0, t);
          break;
        case 'dah':
          pg.gain.setValueAtTime(1, t);
          t += dah;
          pg.gain.setValueAtTime(0, t);
          break;
        case 'elgap':   t += elgap;   break;
        case 'ltrgap':  t += ltrgap;  break;
        case 'wordgap': t += wordgap; break;
      }
    }

    _playbackEndTime = t;
    _onPlaybackEnd = onEnd || null;

    const stopAt = t + 0.05;
    playbackOsc.stop(stopAt);
    playbackOsc.onended = () => {
      playbackSrc = null;
      playbackOsc = null;
      if (_onPlaybackEnd) { _onPlaybackEnd(); _onPlaybackEnd = null; }
    };
  }

  function stopPlayback() {
    if (playbackOsc) {
      try { playbackOsc.stop(); } catch (_) {}
      playbackOsc = null;
    }
    if (playbackSrc) {
      try { playbackSrc.disconnect(); } catch (_) {}
      playbackSrc = null;
    }
    _onPlaybackEnd = null;
  }

  function setWpm(w, cw) {
    _wpm = w;
    _charWpm = cw || Math.max(w, _charWpm);
  }

  function setFreq(hz) {
    _freq = hz;
    if (oscillator) oscillator.frequency.setValueAtTime(hz, ctx.currentTime);
    if (playbackOsc) playbackOsc.frequency.setValueAtTime(hz, ctx.currentTime);
  }

  function setVolume(v) {
    _vol = v;
    if (masterGain) masterGain.gain.setValueAtTime(v, ctx.currentTime);
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function getDitMs() { return ditMs(_charWpm); }
  function getWpm() { return _wpm; }
  function getCharWpm() { return _charWpm; }
  function isPlaying() { return playbackSrc !== null; }

  return { keyDown, keyUp, playCWString, stopPlayback, setWpm, setFreq, setVolume, resume, getDitMs, getWpm, getCharWpm, isPlaying };
}
