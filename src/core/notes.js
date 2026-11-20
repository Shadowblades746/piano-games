/**
 * Canonical musical data + pure helpers. No DOM, no audio, no state.
 */

// ---------- Frequency / MIDI conversion ----------
export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (freq) => 69 + 12 * Math.log2(freq / 440);

export const MIDI_PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const pitchClassName = (midi) => MIDI_PITCH_CLASSES[midi % 12];

// ---------- Natural notes F2 … G5 ----------
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function makeNote(letter, octave) {
  const midi = (octave + 1) * 12 + NATURAL_PC[letter];
  return {
    id: `${letter}${octave}`,
    letter,
    octave,
    midi,
    freq: Math.round(midiToFreq(midi) * 100) / 100,
    clef: midi >= 60 ? 'treble' : 'bass',
  };
}

/** Every natural note from F2 to G5, ascending. */
export const ALL_NOTES = (() => {
  const out = [];
  for (let d = 2 * 7 + LETTER_INDEX.F; d <= 5 * 7 + LETTER_INDEX.G; d++) {
    out.push(makeNote(LETTERS[d % 7], Math.floor(d / 7)));
  }
  return out;
})();

const NOTE_BY_ID = new Map(ALL_NOTES.map((n) => [n.id, n]));
export const getNote = (id) => NOTE_BY_ID.get(id) || null;
export const noteForMidi = (midi) => ALL_NOTES.find((n) => n.midi === midi) || null;

/** Inclusive slice of ALL_NOTES, e.g. notesBetween('C4', 'G4'). */
export function notesBetween(fromId, toId) {
  const a = ALL_NOTES.findIndex((n) => n.id === fromId);
  const b = ALL_NOTES.findIndex((n) => n.id === toId);
  return a < 0 || b < 0 ? [] : ALL_NOTES.slice(a, b + 1);
}

// ---------- Staff geometry ----------
/** Diatonic index (octave * 7 + letter). One step = one line or space. */
export const noteDiatonic = (n) => n.octave * 7 + LETTER_INDEX[n.letter];

/** Diatonic index of the bottom staff line: E4 on treble, G2 on bass. */
export const BOTTOM_LINE_DIATONIC = { treble: 30, bass: 18 };

/** Steps above the bottom line (0 = bottom line, 2 = 2nd line, 8 = top line; negative = below). */
export const staffStep = (note, clef = 'treble') => noteDiatonic(note) - BOTTOM_LINE_DIATONIC[clef];

/** Step positions (even numbers) that need a ledger line for a note at `step`. */
export function ledgerSteps(step) {
  const out = [];
  if (step < 0) for (let s = -2; s >= step; s -= 2) out.push(s);
  if (step > 8) for (let s = 10; s <= step; s += 2) out.push(s);
  return out;
}

/** Clef glyph font stack: system music fonts first, Noto Music (subset in index.html) last. */
export const CLEF_FONT = "'Apple Symbols','Segoe UI Symbol','Noto Music',serif";

// ---------- Level / range presets ----------
/** Note Flashcards levels (staff clef, note pool, keyboard window per viewport). */
export const FLASHCARD_LEVELS = {
  pentascale:      { label: 'Unit 1: Treble C–G',   clef: 'treble', noteIds: ['C4','D4','E4','F4','G4'],
                     pianoRangeDesktop: ['C3','G5'], pianoRangeMobile: ['C4','B4'] },
  treble_octave:   { label: 'Unit 2: Treble C4–C5', clef: 'treble', noteIds: ['C4','D4','E4','F4','G4','A4','B4','C5'],
                     pianoRangeDesktop: ['C3','G5'], pianoRangeMobile: ['C4','C5'] },
  treble_full:     { label: 'Unit 3: Full Treble',  clef: 'treble', noteIds: ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5'],
                     pianoRangeDesktop: ['C3','G5'], pianoRangeMobile: ['C4','G5'] },
  bass_pentascale: { label: 'Unit 4: Bass C3–G3',   clef: 'bass',   noteIds: ['C3','D3','E3','F3','G3'],
                     pianoRangeDesktop: ['F2','C5'], pianoRangeMobile: ['C3','B3'] },
  bass_full:       { label: 'Unit 5: Full Bass',    clef: 'bass',   noteIds: ['F2','G2','A2','B2','C3','D3','E3','F3','G3','A3','B3','C4'],
                     pianoRangeDesktop: ['F2','C5'], pianoRangeMobile: ['F2','C4'] },
  grand_staff:     { label: 'Unit 6: Grand Staff',  clef: 'grand',  noteIds: ['G2','A2','B2','C3','D3','E3','F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5'],
                     pianoRangeDesktop: ['F2','C5'], pianoRangeMobile: ['G2','C5'] },
};

/**
 * Listen & Match levels. Add harder ones here:
 * from/to = note range, len = melody length, changes = how many notes the wrong
 * sheets alter, flip = chance a wrong sheet is the melody reversed.
 */
export const LISTEN_LEVELS = [
  { name: '1 · Pentascale, 3 notes', from: 'C4', to: 'G4', len: 3, changes: [2, 3], flip: 0.4 },
  { name: '2 · Pentascale, 4 notes', from: 'C4', to: 'G4', len: 4, changes: [1, 2], flip: 0.2 },
  { name: '3 · One octave, 4 notes', from: 'C4', to: 'C5', len: 4, changes: [1, 2], flip: 0.2 },
  { name: '4 · Wide range, 5 notes', from: 'C4', to: 'G5', len: 5, changes: [1],    flip: 0.1 },
];
