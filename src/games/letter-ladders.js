/**
 * Game 3 — Letter Ladders.
 * Recite the musical alphabet (or movable-do solfège) in steps and skips, up and down:
 *   steps up   A B C D E F G        skips up   A C E G
 *   steps down G F E D C B A        skips down G E C A
 * The start note is given; you answer the rest. Keyboard and staff are optional hints.
 * Answer by buttons, computer keys, voice, clicking the piano, or a MIDI keyboard.
 *
 * Any major key (12 keys, sharps and flats). Movable do: "do" is the key's tonic, so
 * do re mi fa sol la ti are scale degrees 1–7 in whatever key you pick. In letters mode the
 * letter you say still has to match the key (in D major, "F" means F♯).
 */
import { MAJOR_KEYS, getMajorKey, scaleNotes } from '../core/notes.js';
import * as audio from '../core/audio.js';
import { midi } from '../core/midi.js';
import { createLetterListener } from '../core/speech.js';
import { storage as appStorage } from '../core/storage.js';
import { pickRandom, isMobileViewport } from '../core/util.js';
import { createCounterStaff } from '../ui/staff.js';
import { createKeyboard } from '../ui/keyboard.js';
import { showToast } from '../ui/toast.js';

const SYLLABLES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
const SOLFEGE_KEYS = { d: 'do', r: 're', m: 'mi', f: 'fa', s: 'sol', l: 'la', t: 'ti' };

const PATTERNS = {
  'steps-up':   { label: 'Steps ↑ (A B C D…)',   stride: 1, dir: 1 },
  'steps-down': { label: 'Steps ↓ (G F E D…)',   stride: 1, dir: -1 },
  'skips-up':   { label: 'Skips ↑ (A C E G…)',   stride: 2, dir: 1 },
  'skips-down': { label: 'Skips ↓ (G E C A…)',   stride: 2, dir: -1 },
  mixed:        { label: 'Mixed (random)' },
};
const ARROW = { 1: '↑', '-1': '↓' };

const SELECT = 'bg-[#fcf8ee] hover:bg-white text-[#2c1e16] border border-[#cbb894] rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer';
const TOGGLE = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold border transition cursor-pointer';
const TOGGLE_ON = 'bg-[#e0edff] text-[#13449e] border-[#8fc0ff]';
const TOGGLE_OFF = 'bg-[#fcf8ee] text-[#3d2a1f] border-[#cbb894]';
const ANSWER_BTN = 'answer-btn h-10 min-w-[2.6rem] px-2 rounded-lg bg-[#fcf8ee] hover:bg-[#e0edff] hover:text-[#13449e] hover:border-[#8fc0ff] active:bg-[#1d63dc] active:text-white text-[#2c1e16] font-display font-semibold text-sm border border-[#cbb894] border-b-2 transition cursor-pointer';
const CHIP = 'inline-flex items-center justify-center min-w-[2.5rem] h-10 px-2 rounded-xl font-display font-bold text-base border';
const CHIP_START = `${CHIP} bg-[#1d63dc] text-white border-[#8fc0ff]`;
const CHIP_DONE = `${CHIP} bg-emerald-600 text-white border-emerald-300`;
const CHIP_TODO = `${CHIP} bg-[#e0edff] text-[#13449e] border-[#b6d4fe]`;

const TEMPLATE = `
<div class="flex flex-wrap items-center justify-between gap-2 bg-[#f5ecd8] border border-[#d6c5a3] rounded-xl p-1.5 shadow-sm text-xs">
  <div class="flex flex-wrap items-center gap-1.5">
    <select id="namesSelect" aria-label="Names" class="${SELECT}">
      <option value="letters">Letters (A–G)</option>
      <option value="solfege">Solfège (movable do)</option>
    </select>
    <select id="keySelect" aria-label="Key" class="${SELECT}"></select>
    <select id="patternSelect" aria-label="Pattern" class="${SELECT}"></select>
    <select id="lenSelect" aria-label="Notes per card" class="${SELECT}">
      <option value="4">4 notes</option><option value="5">5 notes</option><option value="7">7 notes</option>
    </select>
  </div>
  <div class="flex items-center gap-1.5">
    <button id="hintKeysBtn" type="button" class="${TOGGLE} ${TOGGLE_OFF}" aria-pressed="false" title="Show the answer notes on the piano">🎹 Keys hint</button>
    <button id="hintStaffBtn" type="button" class="${TOGGLE} ${TOGGLE_OFF}" aria-pressed="false" title="Show the answer notes on the staff">🎼 Staff hint</button>
  </div>
</div>

<section aria-label="Piano and staff" class="studio-card flex-1 flex flex-col rounded-2xl overflow-hidden">
  <div class="piano-bed w-full pt-1.5 pb-2 px-2 sm:px-5 relative select-none">
    <div class="flex items-center justify-between px-0.5 pb-1 text-[10px] sm:text-xs text-[#d6c5a3] font-medium">
      <span id="rangeLabel"></span><span>Hint dots show where the notes are · keys can also answer</span>
    </div>
    <div id="ladderPiano" class="relative w-full h-28 sm:h-36 flex"></div>
  </div>

  <div class="music-sheet flex-1 flex flex-col gap-2 p-3 sm:p-5">
    <div class="flex items-center justify-between gap-2">
      <span id="ladderBadge" class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-display font-semibold bg-[#e0edff] text-[#13449e] border border-[#b6d4fe]"></span>
      <div class="flex items-center gap-1.5">
        <button id="ladderMicBtn" type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#fcf8ee] text-[#3d2a1f] border border-[#cbb894] transition cursor-pointer">🎙 <span id="ladderMicLabel">Mic Off</span></button>
        <button id="ladderHearBtn" type="button" class="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#f5ecd8] hover:bg-[#ebdec2] text-[#3d2a1f] border border-[#cbb894] transition cursor-pointer">🔊 Hear it</button>
      </div>
    </div>

    <p id="promptLine" class="text-center font-display font-bold text-xl sm:text-3xl text-[#2c1e16]"></p>
    <div id="ladderRow" class="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"></div>

    <div class="w-full flex items-center justify-center py-1">
      <svg id="ladderStaff" viewBox="0 0 820 220" class="w-full h-auto max-h-36 sm:max-h-44 overflow-visible"></svg>
    </div>

    <p id="ladderMsg" aria-live="polite" class="text-center text-xs sm:text-sm text-[#5c4332] min-h-[1.25rem]"></p>
    <div id="answerRow" class="flex flex-wrap items-center justify-center gap-1.5"></div>
    <p id="answerHelp" class="hidden sm:block text-center text-[11px] text-[#9e856d]"></p>
    <div class="flex justify-center">
      <button id="ladderNextBtn" type="button" class="h-10 px-5 rounded-xl bg-[#fcf8ee] hover:bg-white text-[#3d2a1f] border border-[#cbb894] text-sm font-semibold cursor-pointer">Next →</button>
    </div>
  </div>
</section>`;

export default function createLetterLadders(ctx) {
  const { scope, storage: prefs } = ctx;
  const state = {
    names: 'letters', keyId: 'C', pattern: 'steps-up', len: 5,
    hintKeys: false, hintStaff: false,
    seq: [], typed: 1, mistakes: 0, done: false, patternUsed: null, advance: null,
  };
  let root = null;
  let $ = () => null;
  let keyboard = null, staff = null, listener = null, handle = null;

  const isSolfege = () => state.names === 'solfege';
  const pools = new Map();   // keyId → ascending scale notes (C4–G5 range)
  const pool = () => {
    if (!pools.has(state.keyId)) pools.set(state.keyId, scaleNotes(state.keyId, 60, 79));
    return pools.get(state.keyId);
  };
  const keyInfo = () => getMajorKey(state.keyId);

  /** Movable do: the syllable is the scale degree, whatever the key. */
  const syllable = (note) => SYLLABLES[note.degree];
  /** What the player must say/press for this note. */
  const tokenOf = (note) => (isSolfege() ? syllable(note) : note.letter);
  /** What we show for it (letters keep their ♯/♭). */
  const nameOf = (note) => (isSolfege() ? syllable(note) : note.name);
  /** The 7 notes of the key, tonic first. */
  const scaleDegrees = () => {
    const byDegree = new Map();
    pool().forEach((n) => { if (!byDegree.has(n.degree)) byDegree.set(n.degree, n); });
    return [...byDegree.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  };
  const isDone = (idx) => idx < state.typed;

  // ---------- Card generation ----------
  function newCard() {
    scope.clear(state.advance);
    if (handle) handle.cancel();
    const p = pool();
    const key = state.pattern === 'mixed' ? pickRandom(['steps-up', 'steps-down', 'skips-up', 'skips-down']) : state.pattern;
    const { stride, dir } = PATTERNS[key];
    const len = Math.max(2, Math.min(state.len, Math.floor((p.length - 1) / stride) + 1));
    const span = (len - 1) * stride;

    const starts = [];
    for (let i = dir > 0 ? 0 : span; i <= (dir > 0 ? p.length - 1 - span : p.length - 1); i++) starts.push(i);
    let start = pickRandom(starts);
    for (let t = 0; t < 4 && state.seq[0] && p[start].id === state.seq[0].id && starts.length > 1; t++) start = pickRandom(starts);

    state.seq = Array.from({ length: len }, (_, i) => p[start + i * stride * dir]);
    state.patternUsed = { key, stride, dir, capped: len < state.len };
    state.typed = 1;
    state.mistakes = 0;
    state.done = false;
    renderCard();
  }

  // ---------- Rendering ----------
  function renderCard() {
    const { key, stride, dir, capped } = state.patternUsed;
    const kind = stride === 1 ? 'Steps' : 'Skips';
    const start = state.seq[0];
    $('ladderBadge').textContent = `${kind} ${ARROW[dir]} · say the next ${state.seq.length - 1}`;
    const k = keyInfo();
    $('promptLine').innerHTML = `Start on <span class="text-[#1d63dc]">${nameOf(start)}</span> · ${kind} ${ARROW[dir]}`;
    $('ladderMsg').textContent = `${k.label}${isSolfege() ? ` · do = ${k.name}` : ''}`
      + (capped ? ` · (only ${state.seq.length} notes fit this range)` : '');
    renderLadder();
    renderHints();
    $('ladderNextBtn').classList.toggle('opacity-60', !state.done);
  }

  function renderLadder() {
    $('ladderRow').innerHTML = state.seq.map((note, i) => {
      if (i === 0) return `<span class="${CHIP_START}" title="Start">${nameOf(note)}</span>`;
      if (i < state.typed) return `<span class="${CHIP_DONE}">${nameOf(note)}</span>`;
      return `<span class="${CHIP_TODO}">?</span>`;
    }).join('<span class="text-[#9e856d] font-semibold">→</span>');
  }

  function renderHints() {
    $('rangeLabel').textContent = keyboard.rangeLabel;
    keyboard.setCounters(state.hintKeys
      ? state.seq.map((note, seqIdx) => ({ seqIdx, midi: note.midi, done: isDone(seqIdx), text: isDone(seqIdx) ? nameOf(note) : '' }))
      : []);
    staff.render({
      clef: 'treble',
      notes: state.seq,
      mobile: isMobileViewport(),
      isDone,
      hint: state.hintStaff ? null : 'Staff hint is off. Try it from memory!',
      labelFor: (note) => (isSolfege() ? syllable(note) : note.letter),
      onNoteClick: (idx, note) => audio.playTone(note.freq, { duration: 0.6 }),
    });
  }

  function renderAnswerButtons() {
    const row = $('answerRow');
    row.innerHTML = scaleDegrees().map((n) => `<button type="button" data-token="${tokenOf(n)}" class="${ANSWER_BTN}">${nameOf(n)}</button>`).join('');
    row.querySelectorAll('.answer-btn').forEach((btn) => {
      btn.addEventListener('click', () => submit({ token: btn.dataset.token }));   // removed with the buttons on re-render
    });
    $('answerHelp').textContent = isSolfege()
      ? 'Keys: d = do · r = re · m = mi · f = fa · s = sol · l = la · t = ti'
      : `Keys: ${scaleDegrees().map((n) => n.letter).join(' ')} (the letter picks the note in this key)`;
  }

  function renderToggles() {
    [['hintKeysBtn', state.hintKeys], ['hintStaffBtn', state.hintStaff]].forEach(([id, on]) => {
      const b = $(id);
      b.className = `${TOGGLE} ${on ? TOGGLE_ON : TOGGLE_OFF}`;
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- Answering ----------
  /** answer: { token } (buttons / keys / voice)  or  { midi, silent } (piano key or MIDI keyboard). */
  function submit(answer) {
    if (state.done) return;
    const expected = state.seq[state.typed];
    if (!expected) return;

    const ok = answer.midi !== undefined
      ? answer.midi % 12 === expected.midi % 12
      : answer.token === tokenOf(expected);
    appStorage.recordNote(expected.id, ok);

    if (!ok) {
      state.mistakes += 1;
      ctx.score.miss();
      if (answer.midi !== undefined && !answer.silent) audio.playThud();
      const row = $('ladderRow');
      row.classList.add('shake');
      scope.timeout(() => row.classList.remove('shake'), 400);
      $('ladderMsg').textContent = 'Not quite. Think about the pattern and try again.';
      return;
    }

    if (!answer.silent && answer.midi === undefined) audio.playTone(expected.freq, { duration: 0.45 });
    state.typed += 1;
    $('ladderMsg').textContent = '';
    renderLadder();
    renderHints();
    if (state.typed === state.seq.length) finish();
  }

  function finish() {
    state.done = true;
    ctx.score.award(1);
    if (state.mistakes === 0) ctx.score.hit(); else ctx.score.miss();
    $('ladderMsg').textContent = `✓ ${state.seq.map(nameOf).join(' – ')}`;
    $('ladderNextBtn').classList.remove('opacity-60');
    hear();
    state.advance = scope.timeout(newCard, 2200);
  }

  function hear() {
    if (handle) handle.cancel();
    keyboard.clearPressed();
    handle = audio.playSequence(state.seq, {
      gap: 420, duration: 0.65, noteLength: 350,
      onStep: (i, note) => keyboard.pressMidi(note.midi, true),
      onStepEnd: (i, note) => keyboard.pressMidi(note.midi, false),
    });
  }

  // ---------- Voice ----------
  function setMicUI(on) {
    const btn = $('ladderMicBtn');
    btn.classList.toggle('mic-pulse', on);
    ['bg-red-100', 'text-red-700', 'border-red-300'].forEach((c) => btn.classList.toggle(c, on));
    ['bg-[#fcf8ee]', 'text-[#3d2a1f]', 'border-[#cbb894]'].forEach((c) => btn.classList.toggle(c, !on));
    $('ladderMicLabel').textContent = on ? 'Listening' : 'Mic Off';
  }

  function buildListener() {
    if (listener) listener.destroy();
    setMicUI(false);
    listener = createLetterListener({
      vocabulary: isSolfege() ? 'solfege' : 'letters',
      onLetter: (token) => submit({ token }),
      onStart: () => setMicUI(true),
      onStop: () => setMicUI(false),
      onError: () => showToast('Voice recognition is unavailable here. Use the buttons or keys instead.'),
    });
  }

  function toggleMic() {
    if (!listener.supported) { showToast('Voice recognition is not available in this browser. Use the buttons or keys!'); return; }
    if (listener.listening) listener.stop();
    else if (!listener.start().ok) showToast('Could not start the microphone. Try again.');
  }

  // ---------- Settings ----------
  function renderKeyOptions() {
    $('keySelect').innerHTML = MAJOR_KEYS
      .map((k) => `<option value="${k.id}">${isSolfege() ? `Do = ${k.name}` : k.label}</option>`).join('');
    $('keySelect').value = state.keyId;
  }

  function applyNames() {
    renderKeyOptions();
    renderAnswerButtons();
    buildListener();
  }

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = TEMPLATE;
    $ = (id) => root.querySelector(`#${id}`);

    $('patternSelect').innerHTML = Object.entries(PATTERNS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

    if (['letters', 'solfege'].includes(prefs.get('names'))) state.names = prefs.get('names');
    if (MAJOR_KEYS.some((k) => k.id === prefs.get('keyId'))) state.keyId = prefs.get('keyId');
    if (PATTERNS[prefs.get('pattern')]) state.pattern = prefs.get('pattern');
    if ([4, 5, 7].includes(prefs.get('len'))) state.len = prefs.get('len');
    state.hintKeys = !!prefs.get('hintKeys');
    state.hintStaff = !!prefs.get('hintStaff');
    $('namesSelect').value = state.names;
    $('patternSelect').value = state.pattern;
    $('lenSelect').value = String(state.len);

    keyboard = createKeyboard($('ladderPiano'), {
      desktopRange: ['C3', 'G5'], mobileRange: ['C4', 'G5'],
      onKeyPress: (note) => { audio.playTone(note.freq, { duration: 0.5 }); submit({ midi: note.midi, silent: true }); },
      onBlackKeyPress: ({ midi: m, freq }) => { audio.playTone(freq, { duration: 0.5 }); submit({ midi: m, silent: true }); },
    });
    keyboard.render();
    staff = createCounterStaff($('ladderStaff'));

    const setting = (id, key, parse = (v) => v, redo = true) => scope.listen($(id), 'change', (e) => {
      state[key] = parse(e.target.value);
      prefs.set(key, state[key]);
      e.target.blur();
      if (key === 'names' || key === 'keyId') applyNames();
      if (redo) newCard();
    });
    setting('namesSelect', 'names');
    setting('keySelect', 'keyId');
    setting('patternSelect', 'pattern');
    setting('lenSelect', 'len', Number);

    [['hintKeysBtn', 'hintKeys'], ['hintStaffBtn', 'hintStaff']].forEach(([id, key]) => {
      scope.listen($(id), 'click', () => {
        state[key] = !state[key];
        prefs.set(key, state[key]);
        renderToggles(); renderHints();
      });
    });

    scope.listen($('ladderNextBtn'), 'click', newCard);
    scope.listen($('ladderHearBtn'), 'click', hear);
    scope.listen($('ladderMicBtn'), 'click', toggleMic);
    scope.listen(window, 'resize', () => { keyboard.render(); renderHints(); });

    scope.add(midi.on('noteon', ({ note }) => submit({ midi: note })));
    scope.add(midi.on('noteoff', ({ note }) => keyboard.pressMidi(note, false)));
    scope.add(midi.on('noteon', ({ note }) => keyboard.pressMidi(note, true)));

    renderToggles();
    applyNames();
    newCard();
  }

  function unmount() {
    if (listener) listener.destroy();
    if (handle) handle.cancel();
    if (keyboard) keyboard.destroy();
    if (root) root.innerHTML = '';
    listener = keyboard = staff = handle = null;
  }

  function onKeyDown(e) {
    const onButton = e.target.tagName === 'BUTTON';
    if (!isSolfege() && /^[a-gA-G]$/.test(e.key)) submit({ token: e.key.toUpperCase() });
    else if (isSolfege() && e.key.length === 1 && SOLFEGE_KEYS[e.key.toLowerCase()]) {
      const token = SOLFEGE_KEYS[e.key.toLowerCase()];
      submit({ token });
    } else if (e.code === 'ArrowRight') { e.preventDefault(); newCard(); }
    else if (!onButton && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); newCard(); }
  }

  return { mount, unmount, onKeyDown };
}
