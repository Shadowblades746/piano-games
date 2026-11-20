/**
 * NoteReader — Overhead Piano Keyboard Component
 * Generates an interactive SVG/HTML piano keyboard with responsive ivory white keys,
 * ebony black keys, touch feedback, MIDI press states, and Hoffman blue magnetic tokens.
 */

import { ALL_NOTES } from '../core/notes.js';

export class PianoKeyboard {
    constructor(container, options = {}) {
        this.container = container;
        this.range = options.range || ['C4', 'G4'];
        this.onKeyPress = options.onKeyPress || null;
        this.onSharpPress = options.onSharpPress || null;
        this.visibleNotes = [];
    }

    setRange(range) {
        this.range = range;
        this.render();
    }

    getVisibleNotes() {
        const startIdx = ALL_NOTES.findIndex(n => n.id === this.range[0]);
        const endIdx = ALL_NOTES.findIndex(n => n.id === this.range[1]);
        if (startIdx === -1 || endIdx === -1) return ALL_NOTES.slice(11, 16); // Default C4-G4
        return ALL_NOTES.slice(startIdx, endIdx + 1);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.visibleNotes = this.getVisibleNotes();
        const totalWhiteKeys = this.visibleNotes.length;
        if (totalWhiteKeys === 0) return;

        const whiteKeyWidthPct = 100 / totalWhiteKeys;

        this.visibleNotes.forEach((note, index) => {
            const keyBtn = document.createElement('button');
            keyBtn.type = 'button';
            keyBtn.dataset.noteId = note.id;
            keyBtn.dataset.letter = note.letter;
            keyBtn.setAttribute('aria-label', `Piano key ${note.id}`);
            keyBtn.style.width = `${whiteKeyWidthPct}%`;
            keyBtn.className = 'white-key relative h-full flex flex-col items-center justify-end pb-1.5 sm:pb-3 focus:outline-none cursor-pointer';

            if (note.letter === 'C') {
                const cMarker = document.createElement('span');
                cMarker.className = 'text-[9px] sm:text-xs font-bold text-stone-400 mb-0.5 pointer-events-none';
                cMarker.textContent = note.id;
                keyBtn.appendChild(cMarker);
            }

            const counterSlot = document.createElement('div');
            counterSlot.className = 'key-counter-slot flex flex-col-reverse items-center gap-0.5 sm:gap-1 mb-0.5 pointer-events-none z-10';
            keyBtn.appendChild(counterSlot);

            keyBtn.addEventListener('click', (e) => {
                if (this.onKeyPress) {
                    this.onKeyPress(note, e);
                }
            });

            this.container.appendChild(keyBtn);

            const hasSharp = ['C', 'D', 'F', 'G', 'A'].includes(note.letter) && index < totalWhiteKeys - 1;
            if (hasSharp) {
                const blackKey = document.createElement('div');
                const blackWidthPct = whiteKeyWidthPct * 0.62;
                const leftPct = (index + 1) * whiteKeyWidthPct - (blackWidthPct / 2);
                blackKey.style.width = `${blackWidthPct}%`;
                blackKey.style.left = `${leftPct}%`;
                blackKey.className = 'black-key absolute top-0 h-[56%] cursor-pointer';

                const sharpMidi = note.midi + 1;
                const sharpFreq = note.freq * Math.pow(2, 1 / 12);
                blackKey.dataset.sharpMidi = sharpMidi;

                blackKey.addEventListener('click', (e) => {
                    e.stopPropagation();
                    blackKey.classList.add('pressed');
                    setTimeout(() => blackKey.classList.remove('pressed'), 200);
                    if (this.onSharpPress) {
                        this.onSharpPress({ midi: sharpMidi, freq: sharpFreq }, e);
                    }
                });

                this.container.appendChild(blackKey);
            }
        });
    }

    pressKeyVisual(noteId, isPressed) {
        if (!this.container) return;
        const keyEl = this.container.querySelector(`.white-key[data-note-id="${noteId}"]`);
        if (!keyEl) return;
        if (isPressed) keyEl.classList.add('pressed');
        else keyEl.classList.remove('pressed');
    }

    pressMidiVisual(midiNumber, isPressed) {
        if (!this.container) return;
        const whiteNote = ALL_NOTES.find(n => n.midi === midiNumber);
        if (whiteNote) {
            this.pressKeyVisual(whiteNote.id, isPressed);
            return;
        }
        const blackEl = this.container.querySelector(`.black-key[data-sharp-midi="${midiNumber}"]`);
        if (blackEl) {
            if (isPressed) blackEl.classList.add('pressed');
            else blackEl.classList.remove('pressed');
        }
    }

    flashWrongKey(noteId) {
        if (!this.container) return;
        const keyEl = this.container.querySelector(`.white-key[data-note-id="${noteId}"]`);
        if (!keyEl) return;
        keyEl.classList.add('midi-wrong');
        setTimeout(() => keyEl.classList.remove('midi-wrong'), 340);
    }

    updateCounters({
        sequence = [],
        completedCount = 0,
        isRevealed = false,
        displayMode = 'both'
    } = {}) {
        if (!this.container) return;

        this.container.querySelectorAll('.key-counter-slot').forEach(slot => {
            slot.innerHTML = '';
        });

        if (displayMode === 'staff' && !isRevealed) return;

        const visibleCount = this.visibleNotes.length;
        const dotSizeClass = visibleCount <= 8
            ? 'w-7 h-7 sm:w-9 sm:h-9 text-xs sm:text-sm'
            : visibleCount <= 12
                ? 'w-5 h-5 sm:w-8 sm:h-8 text-[10px] sm:text-sm'
                : 'w-4 h-4 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[9px] sm:text-xs';

        sequence.forEach((note, seqIdx) => {
            const keyEl = this.container.querySelector(`.white-key[data-note-id="${note.id}"]`);
            if (!keyEl) return;
            const slot = keyEl.querySelector('.key-counter-slot');
            if (!slot) return;

            const isStepCompleted = isRevealed || seqIdx < completedCount;

            const dot = document.createElement('div');
            dot.dataset.seqIdx = seqIdx;
            dot.className = `blue-counter piano-dot ${dotSizeClass} rounded-full flex items-center justify-center text-white font-display font-bold shadow-md ${isStepCompleted ? 'revealed-correct' : ''}`;

            if (isStepCompleted) {
                dot.textContent = note.letter;
            } else {
                const duplicates = sequence.filter(n => n.id === note.id).length > 1;
                if (duplicates) {
                    dot.textContent = seqIdx + 1;
                }
            }

            slot.appendChild(dot);
        });
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
