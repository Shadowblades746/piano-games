/**
 * NoteReader — Core Musical Data & Formulas
 * Defines canonical notes, diatonic step math, frequencies, MIDI mapping, and level presets.
 */

export const ALL_NOTES = [
    { id: 'F2', letter: 'F', octave: 2, midi: 41, freq: 87.31,  clef: 'bass' },
    { id: 'G2', letter: 'G', octave: 2, midi: 43, freq: 98.00,  clef: 'bass' },
    { id: 'A2', letter: 'A', octave: 2, midi: 45, freq: 110.00, clef: 'bass' },
    { id: 'B2', letter: 'B', octave: 2, midi: 47, freq: 123.47, clef: 'bass' },
    { id: 'C3', letter: 'C', octave: 3, midi: 48, freq: 130.81, clef: 'bass' },
    { id: 'D3', letter: 'D', octave: 3, midi: 50, freq: 146.83, clef: 'bass' },
    { id: 'E3', letter: 'E', octave: 3, midi: 52, freq: 164.81, clef: 'bass' },
    { id: 'F3', letter: 'F', octave: 3, midi: 53, freq: 174.61, clef: 'bass' },
    { id: 'G3', letter: 'G', octave: 3, midi: 55, freq: 196.00, clef: 'bass' },
    { id: 'A3', letter: 'A', octave: 3, midi: 57, freq: 220.00, clef: 'bass' },
    { id: 'B3', letter: 'B', octave: 3, midi: 59, freq: 246.94, clef: 'bass' },
    { id: 'C4', letter: 'C', octave: 4, midi: 60, freq: 261.63, clef: 'treble' },
    { id: 'D4', letter: 'D', octave: 4, midi: 62, freq: 293.66, clef: 'treble' },
    { id: 'E4', letter: 'E', octave: 4, midi: 64, freq: 329.63, clef: 'treble' },
    { id: 'F4', letter: 'F', octave: 4, midi: 65, freq: 349.23, clef: 'treble' },
    { id: 'G4', letter: 'G', octave: 4, midi: 67, freq: 392.00, clef: 'treble' },
    { id: 'A4', letter: 'A', octave: 4, midi: 69, freq: 440.00, clef: 'treble' },
    { id: 'B4', letter: 'B', octave: 4, midi: 71, freq: 493.88, clef: 'treble' },
    { id: 'C5', letter: 'C', octave: 5, midi: 72, freq: 523.25, clef: 'treble' },
    { id: 'D5', letter: 'D', octave: 5, midi: 74, freq: 587.33, clef: 'treble' },
    { id: 'E5', letter: 'E', octave: 5, midi: 76, freq: 659.25, clef: 'treble' },
    { id: 'F5', letter: 'F', octave: 5, midi: 77, freq: 698.46, clef: 'treble' },
    { id: 'G5', letter: 'G', octave: 5, midi: 79, freq: 783.99, clef: 'treble' }
];

export const MIDI_PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export const CLEF_FONT = "'Apple Symbols','Segoe UI Symbol','Noto Music',serif";

/**
 * Calculates absolute diatonic staff step index for a note:
 * e.g., C4 = 4 * 7 + 0 = 28; E4 = 4 * 7 + 2 = 30; G4 = 4 * 7 + 4 = 32.
 */
export function noteDiatonic(note) {
    if (!note) return 0;
    return note.octave * 7 + LETTER_INDEX[note.letter];
}

export function midiNumberToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
}

export function getNoteById(id) {
    return ALL_NOTES.find(n => n.id === id) || null;
}

export function getNoteByMidi(midi) {
    return ALL_NOTES.find(n => n.midi === midi) || null;
}

export function getClosestNoteForLetter(letter, anchorMidi = 60) {
    const candidates = ALL_NOTES.filter(n => n.letter === letter);
    if (!candidates.length) return null;
    return candidates.sort((a, b) => Math.abs(a.midi - anchorMidi) - Math.abs(b.midi - anchorMidi))[0];
}

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

/**
 * Flashcard Sight-Reading Levels (Hoffman Academy progression)
 */
export const LEVELS = {
    pentascale: {
        id: 'pentascale',
        name: 'Unit 1: Treble C–G',
        clef: 'treble',
        noteIds: ['C4', 'D4', 'E4', 'F4', 'G4'],
        pianoRangeDesktop: ['C3', 'G5'],
        pianoRangeMobile: ['C4', 'B4']
    },
    treble_octave: {
        id: 'treble_octave',
        name: 'Unit 2: Treble C4–C5',
        clef: 'treble',
        noteIds: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
        pianoRangeDesktop: ['C3', 'G5'],
        pianoRangeMobile: ['C4', 'C5']
    },
    treble_full: {
        id: 'treble_full',
        name: 'Unit 3: Full Treble',
        clef: 'treble',
        noteIds: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'],
        pianoRangeDesktop: ['C3', 'G5'],
        pianoRangeMobile: ['C4', 'G5']
    },
    bass_pentascale: {
        id: 'bass_pentascale',
        name: 'Unit 4: Bass C3–G3',
        clef: 'bass',
        noteIds: ['C3', 'D3', 'E3', 'F3', 'G3'],
        pianoRangeDesktop: ['F2', 'C5'],
        pianoRangeMobile: ['C3', 'B3']
    },
    bass_full: {
        id: 'bass_full',
        name: 'Unit 5: Full Bass',
        clef: 'bass',
        noteIds: ['F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'],
        pianoRangeDesktop: ['F2', 'C5'],
        pianoRangeMobile: ['F2', 'C4']
    },
    grand_staff: {
        id: 'grand_staff',
        name: 'Unit 6: Grand Staff',
        clef: 'grand',
        noteIds: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'],
        pianoRangeDesktop: ['F2', 'C5'],
        pianoRangeMobile: ['G2', 'C5']
    }
};

/**
 * Ear Training (Listen & Match) Levels
 */
export const LISTEN_LEVELS = [
    { id: 0, name: '1 · Pentascale, 3 notes', from: 'C4', to: 'G4', len: 3, changes: [2, 3], flip: 0.4 },
    { id: 1, name: '2 · Pentascale, 4 notes', from: 'C4', to: 'G4', len: 4, changes: [1, 2], flip: 0.2 },
    { id: 2, name: '3 · One octave, 4 notes', from: 'C4', to: 'C5', len: 4, changes: [1, 2], flip: 0.2 },
    { id: 3, name: '4 · Wide range, 5 notes', from: 'C4', to: 'G5', len: 5, changes: [1],    flip: 0.1 }
];
