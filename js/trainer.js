/**
 * trainer.js — Rubber Stamp QSO script and training logic
 */

/** Build QSO script from settings */
export function buildScript(s) {
  const { mycall, theircall, myname, theirname, myloc, theirloc, rst } = s;

  function fill(t) {
    return t
      .replace(/{mycall}/g, mycall)
      .replace(/{theircall}/g, theircall)
      .replace(/{myname}/g, myname)
      .replace(/{theirname}/g, theirname)
      .replace(/{myloc}/g, myloc)
      .replace(/{theirloc}/g, theirloc)
      .replace(/{rst}/g, rst || '599');
  }

  return [
    {
      id: 'cq',
      role: 'user',
      label: 'CQ Call',
      template: 'CQ CQ CQ DE {mycall} K',
      hint: 'Call CQ to invite contacts. End with K (over).',
    },
    {
      id: 'answer',
      role: 'user',
      label: 'Answer a CQ',
      template: '{theircall} DE {mycall} {mycall} K',
      hint: "Send their call, then your call twice, then K.",
    },
    {
      id: 'exchange_rx',
      role: 'partner',
      label: 'Partner Exchange (listen)',
      template: '{mycall} DE {theircall} GM OM UR RST {rst} {rst} QTH {theirloc} NAME {theirname} {theirname} HW? BK',
      hint: 'Listen to the partner\'s exchange. GM=Good morning, OM=Old man, HW=How copy, BK=break.',
    },
    {
      id: 'exchange_tx',
      role: 'user',
      label: 'Your Exchange',
      template: 'R {theircall} DE {mycall} GM TNX FER CALL UR {rst} QTH {myloc} NAME {myname} {myname} 73 SK',
      hint: 'R=Roger, TNX FER=Thanks for, 73=Best regards, SK=end of contact.',
    },
    {
      id: 'signoff',
      role: 'partner',
      label: 'Partner Sign-off (listen)',
      template: '{mycall} DE {theircall} TNX 73 SK',
      hint: 'Partner closes. QSO complete!',
    },
  ].map(step => ({ ...step, text: fill(step.template) }));
}

/** Simple text normaliser for comparison: uppercase, collapse spaces, strip punctuation */
function normalise(s) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Compute per-character match result between sent (normalised) and expected (normalised).
 *  Returns array of {char, status: 'match'|'error'|'pending'} for expected chars. */
export function matchText(sent, expected) {
  const e = normalise(expected);
  const s = normalise(sent);
  const result = [];
  for (let i = 0; i < e.length; i++) {
    if (i >= s.length) {
      result.push({ char: e[i], status: i === s.length ? 'current' : 'pending' });
    } else if (s[i] === e[i]) {
      result.push({ char: e[i], status: 'match' });
    } else {
      result.push({ char: e[i], status: 'error' });
    }
  }
  return result;
}

/** Check if sent text is "close enough" to expected (for auto-advance).
 *  Requires all expected chars sent, allowing 1 error per 10 chars. */
export function isAcceptable(sent, expected) {
  const e = normalise(expected);
  const s = normalise(sent);
  if (s.length < e.length) return false;
  const compared = s.slice(0, e.length);
  let errors = 0;
  for (let i = 0; i < e.length; i++) {
    if (compared[i] !== e[i]) errors++;
  }
  const allowedErrors = Math.max(1, Math.floor(e.length / 10));
  return errors <= allowedErrors;
}

/** Create trainer state machine */
export function createTrainer(script, audio, onStepChange) {
  let _stepIndex = 0;
  let _sentText = '';
  let _active = false;
  let _advancePending = false;

  function currentStep() { return script[_stepIndex]; }
  function stepCount()   { return script.length; }

  function start() {
    _active = true;
    _stepIndex = 0;
    _sentText = '';
    runStep();
  }

  function runStep() {
    const step = currentStep();
    if (!step) return;
    _sentText = '';
    _advancePending = false;
    if (onStepChange) onStepChange(step, _stepIndex, script.length);
    if (step.role === 'partner') {
      // Play computer side, then auto-advance
      audio.playCWString(step.text, () => {
        advanceStep();
      });
    }
  }

  function onDecodedChar(ch) {
    if (!_active) return;
    const step = currentStep();
    if (!step || step.role !== 'user') return;
    _sentText += ch;
    if (onStepChange) onStepChange(step, _stepIndex, script.length, _sentText);
    if (!_advancePending && isAcceptable(_sentText, step.text)) {
      _advancePending = true;
      setTimeout(() => advanceStep(), 600);
    }
  }

  function advanceStep() {
    if (_stepIndex < script.length - 1) {
      _stepIndex++;
      runStep();
    } else {
      // QSO complete
      _active = false;
      if (onStepChange) onStepChange(null, _stepIndex, script.length, _sentText);
    }
  }

  function goToStep(idx) {
    if (idx < 0 || idx >= script.length) return;
    audio.stopPlayback();
    _stepIndex = idx;
    runStep();
  }

  function replayPartner() {
    const step = currentStep();
    if (step && step.role === 'partner') {
      audio.stopPlayback();
      audio.playCWString(step.text, () => advanceStep());
    }
  }

  function reset() {
    audio.stopPlayback();
    _active = false;
    _stepIndex = 0;
    _sentText = '';
  }

  function getSentText() { return _sentText; }
  function getStepIndex() { return _stepIndex; }
  function isActive() { return _active; }

  return { start, onDecodedChar, advanceStep, goToStep, replayPartner, reset, currentStep, stepCount, getSentText, getStepIndex, isActive };
}
