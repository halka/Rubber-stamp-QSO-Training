/**
 * decoder.js — Real-time Morse code decoder
 * Receives dit/dah elements from the keyer and decodes characters
 * using letter/word boundary gap timers.
 */

const MORSE_TABLE = {
  '.-':'A', '-...':'B', '-.-.':'C', '-..':'D', '.':'E',
  '..-.':'F', '--.':'G', '....':'H', '..':'I', '.---':'J',
  '-.-':'K', '.-..':'L', '--':'M', '-.':'N', '---':'O',
  '.--.':'P', '--.-':'Q', '.-.':'R', '...':'S', '-':'T',
  '..-':'U', '...-':'V', '.--':'W', '-..-':'X', '-.--':'Y',
  '--..':'Z',
  '-----':'0', '.----':'1', '..---':'2', '...--':'3', '....-':'4',
  '.....':'5', '-....':'6', '--...':'7', '---..':'8', '----.':'9',
  '.-.-.-':'.', '--..--':',', '..--..':'?', '-..-.':'/', '-....-':'-',
  '.-.-.':'+', '-...-':'=', '.--.-.':'@', '---...':':',
  '.----.':'\'', '.-..-.':'"',
  // prosigns
  '.-.-.':'AR', '...-.-':'SK', '-.--.':'KN', '-...-':'BT', '.-.-':'AA',
  '...-.':'AS', '........':'HH',
};

export function createDecoder(wpm, charWpm, onChar, onWord) {
  let _wpm = wpm;
  let _charWpm = charWpm;
  let _elements = '';       // accumulated dit/dah pattern for current letter
  let _transcript = '';
  let _letterTimer = null;
  let _wordTimer = null;

  function charDitMs() { return 1200 / _charWpm; }
  // Fire letter boundary after 2.5 inter-element gaps at char speed
  function ltrGapMs() { return charDitMs() * 2.5; }
  // Fire word boundary after 5 dits at overall speed
  function wordGapMs() { return (1200 / _wpm) * 5; }

  function pushElement(type) {
    clearTimeout(_letterTimer);
    clearTimeout(_wordTimer);
    _elements += (type === 'dit') ? '.' : '-';

    // Schedule letter boundary detection
    _letterTimer = setTimeout(() => {
      finaliseLetter();
    }, ltrGapMs());

    // Schedule word boundary detection (longer gap)
    _wordTimer = setTimeout(() => {
      if (_transcript.length > 0 && _transcript[_transcript.length - 1] !== ' ') {
        _transcript += ' ';
        if (onWord) onWord(' ');
      }
    }, wordGapMs());
  }

  function finaliseLetter() {
    if (!_elements) return;
    const ch = MORSE_TABLE[_elements] || '?';
    _elements = '';
    _transcript += ch;
    if (onChar) onChar(ch);
  }

  function setWpm(w, cw) {
    _wpm = w;
    _charWpm = cw || Math.max(w, _charWpm);
  }

  function reset() {
    clearTimeout(_letterTimer);
    clearTimeout(_wordTimer);
    _elements = '';
    _transcript = '';
  }

  function flushLetter() {
    clearTimeout(_letterTimer);
    clearTimeout(_wordTimer);
    finaliseLetter();
  }

  function getTranscript() { return _transcript; }

  return { pushElement, setWpm, reset, flushLetter, getTranscript };
}
