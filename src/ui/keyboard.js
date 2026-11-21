/**
 * Responsive overhead piano keyboard (white keys = natural notes from ALL_NOTES,
 * black keys drawn between them).
 *
 *   const kb = createKeyboard(el, {
 *     desktopRange: ['C3','G5'], mobileRange: ['C4','B4'],
 *     onKeyPress(note, event) {}, onBlackKeyPress({ midi, freq }, event) {},
 *   });
 *   kb.render();                         // (re)build; call again on resize / range change
 *   kb.setCounters([{ seqIdx, noteId | midi, text, done }]);   // counter badges on white or black keys
 *   kb.pressNote('C4', true);  kb.pressMidi(61, true);  // highlight from MIDI / playback
 *   kb.flagCounter(idx, 'active-play' | 'wrong-flash', on);  kb.markWrong('C4', true);
 *   kb.destroy();
 */
import { noteForMidi, notesBetween } from '../core/notes.js';
import { isMobileViewport } from '../core/util.js';

export function createKeyboard(container, options = {}) {
  let { desktopRange = ['C3', 'G5'], mobileRange = ['C4', 'B4'] } = options;
  const { onKeyPress, onBlackKeyPress } = options;
  let visible = [];
  const timers = new Set();

  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const whiteKey = (noteId) => container.querySelector(`.white-key[data-note-id="${noteId}"]`);

  function computeVisible() {
    const range = isMobileViewport() ? mobileRange : desktopRange;
    visible = notesBetween(range[0], range[1]);
    return visible;
  }

  function render() {
    computeVisible();
    container.innerHTML = '';
    const total = visible.length;
    const widthPct = 100 / total;

    visible.forEach((note, index) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.dataset.noteId = note.id;
      key.dataset.letter = note.letter;
      key.setAttribute('aria-label', `Piano key ${note.id}`);
      key.style.width = `${widthPct}%`;
      key.className = 'white-key relative h-full flex flex-col items-center justify-end pb-1.5 sm:pb-3 focus:outline-none cursor-pointer';

      if (note.letter === 'C') {
        const marker = document.createElement('span');
        marker.className = 'text-[9px] sm:text-xs font-bold text-stone-400 mb-0.5 pointer-events-none';
        marker.textContent = note.id;
        key.appendChild(marker);
      }

      const slot = document.createElement('div');
      slot.className = 'key-counter-slot flex flex-col-reverse items-center gap-0.5 sm:gap-1 mb-0.5 pointer-events-none z-10';
      key.appendChild(slot);

      key.addEventListener('click', (e) => {
        if (onKeyPress) onKeyPress(note, e);
        pressNote(note.id, true);
        later(() => pressNote(note.id, false), 220);
      });
      container.appendChild(key);

      if (['C', 'D', 'F', 'G', 'A'].includes(note.letter) && index < total - 1) {
        const black = document.createElement('div');
        const blackW = widthPct * 0.62;
        black.style.width = `${blackW}%`;
        black.style.left = `${(index + 1) * widthPct - blackW / 2}%`;
        black.className = 'black-key absolute top-0 h-[56%] cursor-pointer';
        black.dataset.sharpMidi = note.midi + 1;
        const bslot = document.createElement('div');
        bslot.className = 'key-counter-slot black-slot absolute bottom-1 inset-x-0 flex justify-center pointer-events-none z-10';
        black.appendChild(bslot);
        black.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onBlackKeyPress) onBlackKeyPress({ midi: note.midi + 1, freq: note.freq * Math.pow(2, 1 / 12) }, e);
          black.classList.add('pressed');
          later(() => black.classList.remove('pressed'), 200);
        });
        container.appendChild(black);
      }
    });
  }

  function pressNote(noteId, on) {
    const el = whiteKey(noteId);
    if (el) el.classList.toggle('pressed', on);
  }

  function pressMidi(midiNumber, on) {
    const natural = noteForMidi(midiNumber);
    if (natural) { pressNote(natural.id, on); return; }
    const black = container.querySelector(`.black-key[data-sharp-midi="${midiNumber}"]`);
    if (black) black.classList.toggle('pressed', on);
  }

  /** Counter badges. Items: { seqIdx, noteId | midi, text, done }. A `midi` on a black key lands on that black key. */
  function setCounters(list = []) {
    container.querySelectorAll('.key-counter-slot').forEach((s) => { s.innerHTML = ''; });
    const n = visible.length;
    const size = n <= 8
      ? 'w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm'
      : n <= 12
        ? 'w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm'
        : 'w-4 h-4 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[9px] sm:text-xs';
    const blackSize = 'w-4 h-4 sm:w-6 sm:h-6 text-[8px] sm:text-[10px]';

    list.forEach(({ seqIdx, noteId, midi, text = '', done = false }) => {
      const natural = midi !== undefined ? noteForMidi(midi) : null;
      const onBlack = midi !== undefined && !natural;
      const slot = onBlack
        ? container.querySelector(`.black-key[data-sharp-midi="${midi}"] .key-counter-slot`)
        : whiteKey(noteId || natural.id)?.querySelector('.key-counter-slot');
      if (!slot) return;
      const dot = document.createElement('div');
      dot.dataset.seqIdx = seqIdx;
      dot.className = `blue-counter piano-dot ${onBlack ? blackSize : size} rounded-full flex items-center justify-center text-white font-display font-bold shadow-md ${done ? 'revealed-correct' : ''}`;
      dot.textContent = text;
      slot.appendChild(dot);
    });
  }

  const flagCounter = (seqIdx, cls, on) => {
    container.querySelectorAll(`.piano-dot[data-seq-idx="${seqIdx}"]`).forEach((d) => d.classList.toggle(cls, on));
  };
  const markWrong = (noteId, on) => {
    const el = whiteKey(noteId);
    if (el) el.classList.toggle('midi-wrong', on);
  };
  const clearPressed = () => container.querySelectorAll('.white-key.pressed').forEach((k) => k.classList.remove('pressed'));

  return {
    render,
    setRanges(desktop, mobile) { desktopRange = desktop; mobileRange = mobile; },
    get visibleNotes() { return visible.length ? visible : computeVisible(); },
    get rangeLabel() {
      const v = visible.length ? visible : computeVisible();
      return v.length ? `Keys: ${v[0].id} – ${v[v.length - 1].id}` : '';
    },
    setCounters, pressNote, pressMidi, flagCounter, markWrong, clearPressed,
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      container.innerHTML = '';
    },
  };
}

