/**
 * NoteReader — Game 1: Hoffman Sight-Reading Note Flashcards
 * Implements interactive Hoffman Academy-style sight-reading drills with:
 *  - Blue magnetic counter tokens on piano keys & musical staff
 *  - Voice ("Say It Out Loud" Web Speech API)
 *  - Virtual Piano touch & A–G button strip
 *  - USB/Bluetooth MIDI (Play-to-Answer & Free Play modes)
 *  - Comprehensive range presets from Pentascale to Grand Staff
 */

import {
    ALL_NOTES,
    LEVELS,
    escapeHtml,
    noteDiatonic,
    getClosestNoteForLetter
} from '../core/notes.js';
import { renderStaff, flashWrongStaffDot, highlightStaffDot } from '../ui/staff.js';
import { PianoKeyboard } from '../ui/keyboard.js';

export default {
    id: 'note-flashcards',
    title: 'Note Flashcards',
    shortTitle: 'Flashcards',
    icon: '🎯',
    description: 'Sight-reading flashcards with Hoffman blue counters',

    mount(container, context) {
        this.container = container;
        this.context = context;
        const { audio, midi, speech, storage } = context;

        const savedPrefs = storage.getPreferences();
        this.level = savedPrefs.flashcardLevel || 'pentascale';
        this.countMode = savedPrefs.flashcardCount || '5';
        this.displayMode = savedPrefs.flashcardDisplay || 'both';

        this.currentSequence = [];
        this.userTypedLetters = [];
        this.isRevealed = false;
        this.score = 0;

        this.autoAdvanceTimer = null;
        this.resizeTimer = null;
        this.unsubscribers = [];

        this._renderDom();
        this._initKeyboard();
        this._bindEvents();
        this._bindMidi();
        this._bindSpeech();

        this.generateChallenge(true);
    },

    unmount() {
        clearTimeout(this.autoAdvanceTimer);
        clearTimeout(this.resizeTimer);

        if (this.context?.speech?.isListening) {
            this.context.speech.stop();
        }

        if (this.context?.audio) {
            this.context.audio.clearSequence();
        }

        this.unsubscribers.forEach(fn => fn());
        this.unsubscribers = [];

        if (this.keyboard) {
            this.keyboard.destroy();
            this.keyboard = null;
        }

        if (this.container) {
            this.container.innerHTML = '';
        }
    },

    _renderDom() {
        this.container.innerHTML = `
            <div class="flex-1 flex flex-col justify-between max-w-5xl w-full mx-auto px-2.5 sm:px-6 py-2.5 sm:py-4 gap-2.5 sm:gap-3.5">
                <!-- Compact Warm Parchment Filter Strip -->
                <div id="filterBar" class="flex flex-wrap items-center justify-between gap-2 bg-[#f5ecd8] border border-[#d6c5a3] rounded-xl p-1.5 shadow-sm text-xs">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <select id="fcLevelSelect" aria-label="Note Range" class="bg-[#fcf8ee] hover:bg-white text-[#2c1e16] border border-[#cbb894] rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer">
                            <option value="pentascale" ${this.level === 'pentascale' ? 'selected' : ''}>Unit 1: Treble C–G</option>
                            <option value="treble_octave" ${this.level === 'treble_octave' ? 'selected' : ''}>Unit 2: Treble C4–C5</option>
                            <option value="treble_full" ${this.level === 'treble_full' ? 'selected' : ''}>Unit 3: Full Treble</option>
                            <option value="bass_pentascale" ${this.level === 'bass_pentascale' ? 'selected' : ''}>Unit 4: Bass C3–G3</option>
                            <option value="bass_full" ${this.level === 'bass_full' ? 'selected' : ''}>Unit 5: Full Bass</option>
                            <option value="grand_staff" ${this.level === 'grand_staff' ? 'selected' : ''}>Unit 6: Grand Staff</option>
                        </select>

                        <select id="fcCountSelect" aria-label="Number of Dots" class="bg-[#fcf8ee] hover:bg-white text-[#2c1e16] border border-[#cbb894] rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer">
                            <option value="1" ${this.countMode === '1' ? 'selected' : ''}>1 Dot</option>
                            <option value="3" ${this.countMode === '3' ? 'selected' : ''}>3 Dots</option>
                            <option value="5" ${this.countMode === '5' ? 'selected' : ''}>5 Dots</option>
                            <option value="random" ${this.countMode === 'random' ? 'selected' : ''}>Random (1–5)</option>
                        </select>

                        <select id="fcDisplayModeSelect" aria-label="Where to show dots" class="bg-[#fcf8ee] hover:bg-white text-[#2c1e16] border border-[#cbb894] rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer">
                            <option value="both" ${this.displayMode === 'both' ? 'selected' : ''}>Both Piano &amp; Staff</option>
                            <option value="staff" ${this.displayMode === 'staff' ? 'selected' : ''}>Staff Only</option>
                            <option value="piano" ${this.displayMode === 'piano' ? 'selected' : ''}>Piano Only</option>
                        </select>
                    </div>

                    <!-- MIDI Play Mode Pill -->
                    <button id="fcMidiModeToggleBtn" type="button" class="hidden items-center gap-1.5 bg-emerald-100 hover:bg-emerald-200/80 text-emerald-900 border border-emerald-300 rounded-lg px-2.5 py-1.5 font-semibold transition cursor-pointer shrink-0" title="Switch between Play-to-Answer and Free Play">
                        <span id="fcMidiModeIcon">🎯</span>
                        <span id="fcMidiModeLabel">Play-to-Answer</span>
                    </button>
                </div>

                <!-- Unified Elevated Piano + Cream Sheet Music Notebook Card -->
                <section aria-label="Piano and Musical Staff" class="studio-card flex-1 flex flex-col rounded-2xl overflow-hidden">
                    <!-- TOP HALF: Overhead Ivory Piano Keyboard -->
                    <div class="piano-bed w-full pt-1.5 pb-2 px-2 sm:px-5 relative select-none">
                        <div class="flex items-center justify-between px-0.5 pb-1 text-[10px] sm:text-xs text-[#d6c5a3] font-medium">
                            <span id="fcPianoRangeLabel">Keys: C4 – G4</span>
                            <span class="sm:hidden">Tap keys to answer</span>
                            <span class="hidden sm:inline">Click keys or press A–G</span>
                        </div>
                        <div id="fcPianoContainer" class="relative w-full h-32 sm:h-40 md:h-44 flex">
                            <!-- Keys dynamically generated by PianoKeyboard -->
                        </div>
                    </div>

                    <!-- BOTTOM HALF: Warm Cream Sheet Music Paper -->
                    <div class="music-sheet flex-1 flex flex-col justify-between p-3 sm:p-5">
                        <div class="flex items-center justify-between gap-2">
                            <span id="fcChallengeBadge" class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-display font-semibold bg-[#e0edff] text-[#13449e] border border-[#b6d4fe]">
                                Say the letters out loud
                            </span>

                            <button id="fcPlaySoundBtn" type="button" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#f5ecd8] hover:bg-[#ebdec2] active:bg-[#e0cfa9] text-[#3d2a1f] border border-[#cbb894] transition cursor-pointer shadow-sm" title="Hear the notes">
                                <svg class="w-3.5 h-3.5 text-[#1d63dc]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"/></svg>
                                <span>Replay</span>
                            </button>
                        </div>

                        <!-- Responsive SVG Staff -->
                        <div class="w-full flex items-center justify-center my-auto py-1">
                            <svg id="fcStaffSvg" viewBox="0 0 820 220" class="w-full h-auto max-h-40 sm:max-h-52 overflow-visible">
                            </svg>
                        </div>

                        <!-- Answer Banner -->
                        <div id="fcAnswerBanner" class="min-h-[36px] flex flex-wrap items-center justify-center gap-1.5 transition-all">
                            <p class="text-[#5c4332] text-xs sm:text-sm text-center">
                                Say the note names out loud, then tap <strong class="text-[#2c1e16] font-semibold">Reveal &amp; Hear</strong>
                            </p>
                        </div>
                    </div>
                </section>

                <!-- Cozy Parchment Bottom Control Dock -->
                <section aria-label="Practice Controls" class="bg-[#f5ecd8] border border-[#d6c5a3] rounded-2xl p-2 sm:p-2.5 shadow-md flex flex-col gap-2">
                    <!-- Voice Recognition Live Transcript Bar -->
                    <div id="fcVoiceFeedbackBar" class="hidden bg-[#fcf8ee] border border-[#cbb894] rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div class="flex items-center gap-2">
                            <span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                            <span class="text-[#5c4332] font-medium">Listening (A–G):</span>
                            <span id="fcHeardLettersDisplay" class="font-display font-bold text-[#1d63dc] tracking-wider"></span>
                        </div>
                        <button id="fcClearHeardBtn" type="button" class="text-[#785a46] hover:text-[#2c1e16] font-semibold cursor-pointer">Clear</button>
                    </div>

                    <!-- Main Actions Row -->
                    <div class="flex items-center gap-1.5 sm:gap-2">
                        <button id="fcRevealBtn" type="button" class="flex-1 h-11 sm:h-12 flex items-center justify-center gap-1.5 px-3 sm:px-4 rounded-xl font-display font-semibold text-xs sm:text-sm bg-[#2c1e16] hover:bg-[#3d2a1f] active:bg-[#1f150f] text-[#fdf6e7] border-b-2 border-[#140d09] shadow-sm transition cursor-pointer">
                            <span>Reveal &amp; Hear</span>
                        </button>

                        <button id="fcNextBtn" type="button" class="flex-1 h-11 sm:h-12 flex items-center justify-center gap-1.5 px-3 sm:px-4 rounded-xl font-display font-semibold text-xs sm:text-sm bg-gradient-to-b from-[#2b72eb] to-[#1d63dc] hover:from-[#3b82f6] hover:to-[#2563eb] active:from-[#1d4ed8] active:to-[#1e40af] text-white border-b-2 border-[#13449e] shadow-sm transition cursor-pointer">
                            <span>Next Pattern</span>
                            <span aria-hidden="true">→</span>
                        </button>

                        <!-- Mic Toggle -->
                        <button id="fcMicBtn" type="button" class="relative h-11 sm:h-12 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-[#fcf8ee] hover:bg-white text-[#3d2a1f] border border-[#cbb894] text-xs font-semibold transition cursor-pointer shrink-0" title="Toggle Voice Auto-Listen">
                            <span class="text-sm">🎙️</span>
                            <span id="fcMicLabel" class="hidden md:inline">Mic Off</span>
                        </button>
                    </div>

                    <!-- Compact Warm Cream A–G Button Strip -->
                    <div class="grid grid-cols-7 gap-1 sm:gap-1.5">
                        ${['C','D','E','F','G','A','B'].map(l => `
                            <button type="button" data-letter="${l}" class="fc-letter-btn h-9 sm:h-10 rounded-lg bg-[#fcf8ee] hover:bg-[#e0edff] hover:text-[#13449e] hover:border-[#8fc0ff] active:bg-[#1d63dc] active:text-white text-[#2c1e16] font-display font-semibold text-sm border border-[#cbb894] border-b-2 transition cursor-pointer">${l}</button>
                        `).join('')}
                    </div>
                </section>
            </div>
        `;
    },

    _initKeyboard() {
        const pianoContainer = document.getElementById('fcPianoContainer');
        const range = this._getCurrentKeyboardRange();

        this.keyboard = new PianoKeyboard(pianoContainer, {
            range,
            onKeyPress: (note) => {
                this.context.audio.playNote(note.freq, 0.6, 0);
                this.keyboard.pressKeyVisual(note.id, true);
                setTimeout(() => this.keyboard?.pressKeyVisual(note.id, false), 220);
                this.handleLetterInput(note.letter);
            },
            onSharpPress: ({ freq }) => {
                this.context.audio.playNote(freq, 0.5, 0);
            }
        });

        this.keyboard.render();
        this._updateRangeLabel();
    },

    _getCurrentKeyboardRange() {
        const isMobile = window.innerWidth < 640;
        const lvl = LEVELS[this.level] || LEVELS.pentascale;
        return isMobile ? lvl.pianoRangeMobile : lvl.pianoRangeDesktop;
    },

    _updateRangeLabel() {
        const rangeLabel = document.getElementById('fcPianoRangeLabel');
        if (rangeLabel && this.keyboard?.visibleNotes?.length > 0) {
            const notes = this.keyboard.visibleNotes;
            rangeLabel.textContent = `Keys: ${notes[0].id} – ${notes[notes.length - 1].id}`;
        }
    },

    _bindEvents() {
        const levelSel = document.getElementById('fcLevelSelect');
        const countSel = document.getElementById('fcCountSelect');
        const displaySel = document.getElementById('fcDisplayModeSelect');

        levelSel?.addEventListener('change', (e) => {
            this.level = e.target.value;
            e.target.blur();
            this.context.storage.savePreferences({ flashcardLevel: this.level });
            this._updateKeyboardAndStaff();
            this.generateChallenge(false);
        });

        countSel?.addEventListener('change', (e) => {
            this.countMode = e.target.value;
            e.target.blur();
            this.context.storage.savePreferences({ flashcardCount: this.countMode });
            this.generateChallenge(false);
        });

        displaySel?.addEventListener('change', (e) => {
            this.displayMode = e.target.value;
            e.target.blur();
            this.context.storage.savePreferences({ flashcardDisplay: this.displayMode });
            this._renderStaff();
            this.keyboard.updateCounters({
                sequence: this.currentSequence,
                completedCount: this.userTypedLetters.length,
                isRevealed: this.isRevealed,
                displayMode: this.displayMode
            });
        });

        document.getElementById('fcRevealBtn')?.addEventListener('click', () => {
            this.revealAnswer(true);
        });

        document.getElementById('fcNextBtn')?.addEventListener('click', () => {
            this.generateChallenge(false);
        });

        document.getElementById('fcPlaySoundBtn')?.addEventListener('click', () => {
            this.playSequenceAudio(true);
        });

        document.getElementById('fcClearHeardBtn')?.addEventListener('click', () => {
            this.userTypedLetters = [];
            this._updateHeardDisplay();
            this.keyboard.updateCounters({
                sequence: this.currentSequence,
                completedCount: 0,
                isRevealed: this.isRevealed,
                displayMode: this.displayMode
            });
            this._renderStaff();
        });

        document.getElementById('fcMicBtn')?.addEventListener('click', () => {
            this.context.speech.toggle();
        });

        document.getElementById('fcMidiModeToggleBtn')?.addEventListener('click', () => {
            const newMode = this.context.midi.toggleMode();
            this._updateMidiModeUI(newMode);
        });

        this.container.querySelectorAll('.fc-letter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const letter = btn.dataset.letter;
                this._playLetterTone(letter);
                this.handleLetterInput(letter);
            });
        });

        const onResize = () => {
            clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this._updateKeyboardAndStaff();
            }, 150);
        };
        window.addEventListener('resize', onResize);
        this.unsubscribers.push(() => window.removeEventListener('resize', onResize));
    },

    _updateKeyboardAndStaff() {
        if (!this.keyboard) return;
        this.keyboard.setRange(this._getCurrentKeyboardRange());
        this._updateRangeLabel();
        this.keyboard.updateCounters({
            sequence: this.currentSequence,
            completedCount: this.userTypedLetters.length,
            isRevealed: this.isRevealed,
            displayMode: this.displayMode
        });
        this._renderStaff();
    },

    _bindMidi() {
        const unsubState = this.context.midi.on('statechange', (state) => {
            this._updateMidiModeUI(state.mode, state.connected);
        });
        this.unsubscribers.push(unsubState);

        const unsubNoteOn = this.context.midi.on('noteon', ({ midi, pitchName, noteObj, mode }) => {
            this.keyboard?.pressMidiVisual(midi, true);

            if (mode === 'answer') {
                this.handleLetterInput(pitchName, {
                    fromMidi: true,
                    midiNoteObj: noteObj,
                    rawMidiNumber: midi
                });
            }
        });
        this.unsubscribers.push(unsubNoteOn);

        const unsubNoteOff = this.context.midi.on('noteoff', ({ midi }) => {
            this.keyboard?.pressMidiVisual(midi, false);
        });
        this.unsubscribers.push(unsubNoteOff);

        const state = this.context.midi.getState();
        this._updateMidiModeUI(state.mode, state.connected);
    },

    _updateMidiModeUI(mode, connected = this.context.midi.connected) {
        const btn = document.getElementById('fcMidiModeToggleBtn');
        const icon = document.getElementById('fcMidiModeIcon');
        const label = document.getElementById('fcMidiModeLabel');
        if (!btn || !icon || !label) return;

        if (connected) {
            btn.classList.remove('hidden');
            btn.classList.add('inline-flex');
            if (mode === 'answer') {
                icon.textContent = '🎯';
                label.textContent = 'Play-to-Answer';
                btn.className = 'inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg px-2.5 py-1.5 font-semibold transition cursor-pointer shrink-0';
            } else {
                icon.textContent = '🎹';
                label.textContent = 'Free Play';
                btn.className = 'inline-flex items-center gap-1.5 bg-sky-100 text-sky-900 border border-sky-300 rounded-lg px-2.5 py-1.5 font-semibold transition cursor-pointer shrink-0';
            }
        } else {
            btn.classList.add('hidden');
            btn.classList.remove('inline-flex');
        }
    },

    _bindSpeech() {
        const unsubState = this.context.speech.onStateChange(({ isListening, error }) => {
            const micBtn = document.getElementById('fcMicBtn');
            const micLabel = document.getElementById('fcMicLabel');
            const voiceBar = document.getElementById('fcVoiceFeedbackBar');
            if (!micBtn || !micLabel || !voiceBar) return;

            if (isListening) {
                micBtn.classList.add('mic-pulse', 'bg-red-100', 'text-red-700', 'border-red-300');
                micBtn.classList.remove('bg-[#fcf8ee]', 'text-[#3d2a1f]', 'border-[#cbb894]');
                micLabel.textContent = 'Listening';
                voiceBar.classList.remove('hidden');
            } else {
                micBtn.classList.remove('mic-pulse', 'bg-red-100', 'text-red-700', 'border-red-300');
                micBtn.classList.add('bg-[#fcf8ee]', 'text-[#3d2a1f]', 'border-[#cbb894]');
                micLabel.textContent = 'Mic Off';
                voiceBar.classList.add('hidden');
            }

            if (error) {
                this.context.showToast(error === 'not-allowed'
                    ? 'Mic access denied. Say notes out loud and tap Reveal & Hear!'
                    : 'Voice recognition unavailable. Say notes out loud and tap Reveal & Hear!');
            }
        });
        this.unsubscribers.push(unsubState);

        const unsubNote = this.context.speech.onNote((letter) => {
            this.handleLetterInput(letter);
        });
        this.unsubscribers.push(unsubNote);
    },

    _playLetterTone(letter) {
        const expected = this.currentSequence[this.userTypedLetters.length];
        let note = (expected && !this.isRevealed && expected.letter === letter) ? expected : null;
        if (!note) {
            const levelConfig = LEVELS[this.level] || LEVELS.pentascale;
            const anchorId = levelConfig.noteIds[0];
            const anchor = ALL_NOTES.find(n => n.id === anchorId)?.midi || 60;
            note = ALL_NOTES.filter(n => n.letter === letter)
                .sort((a, b) => Math.abs(a.midi - anchor) - Math.abs(b.midi - anchor))[0];
        }
        if (note) {
            this.context.audio.playNote(note.freq, 0.45, 0);
        }
    },

    generateChallenge(forceAscendingFirst = false) {
        clearTimeout(this.autoAdvanceTimer);
        this.context.audio.clearSequence();
        this.isRevealed = false;
        this.userTypedLetters = [];
        this._updateHeardDisplay();

        const levelConfig = LEVELS[this.level] || LEVELS.pentascale;
        const pool = levelConfig.noteIds.map(id => ALL_NOTES.find(n => n.id === id)).filter(Boolean);

        let numDots = 5;
        if (this.countMode === 'random') {
            const choices = [1, 2, 3, 4, 5];
            numDots = choices[Math.floor(Math.random() * choices.length)];
        } else {
            numDots = parseInt(this.countMode, 10);
        }

        const sequence = [];

        if (forceAscendingFirst && this.level === 'pentascale' && numDots === 5) {
            sequence.push(...pool.slice(0, 5));
        } else if (numDots === 1) {
            let candidate = pool[Math.floor(Math.random() * pool.length)];
            if (this.currentSequence.length === 1 && pool.length > 1) {
                while (candidate.id === this.currentSequence[0]?.id) {
                    candidate = pool[Math.floor(Math.random() * pool.length)];
                }
            }
            sequence.push(candidate);
        } else {
            let currentIdx = Math.floor(Math.random() * pool.length);
            sequence.push(pool[currentIdx]);

            for (let i = 1; i < numDots; i++) {
                const intervals = [-2, -1, -1, 1, 1, 2];
                let delta = intervals[Math.floor(Math.random() * intervals.length)];
                let nextIdx = currentIdx + delta;

                if (nextIdx < 0 || nextIdx >= pool.length) {
                    nextIdx = currentIdx - delta;
                }
                nextIdx = Math.max(0, Math.min(pool.length - 1, nextIdx));
                currentIdx = nextIdx;
                sequence.push(pool[currentIdx]);
            }
        }

        this.currentSequence = sequence;

        const badge = document.getElementById('fcChallengeBadge');
        if (badge) {
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-display font-semibold bg-[#e0edff] text-[#13449e] border border-[#b6d4fe]';
            badge.textContent = numDots === 1 ? 'Say the note name out loud' : `Say the ${numDots} notes left to right`;
        }

        const answerBanner = document.getElementById('fcAnswerBanner');
        const isMidiAnswerMode = this.context.midi.connected && this.context.midi.mode === 'answer';
        if (answerBanner) {
            answerBanner.innerHTML = `
                <p class="text-[#5c4332] text-xs sm:text-sm text-center">
                    ${isMidiAnswerMode
                        ? `Say &amp; play on <strong class="text-[#2c1e16] font-semibold">${escapeHtml(this.context.midi.deviceName || 'your MIDI piano')}</strong>`
                        : `Read the blue ${numDots === 1 ? 'dot' : 'dots'} out loud, then tap <strong class="text-[#2c1e16] font-semibold">Reveal &amp; Hear</strong>`
                    }
                </p>
            `;
        }

        this.keyboard?.updateCounters({
            sequence: this.currentSequence,
            completedCount: 0,
            isRevealed: false,
            displayMode: this.displayMode
        });
        this._renderStaff();
    },

    _renderStaff() {
        const svg = document.getElementById('fcStaffSvg');
        if (!svg) return;

        const levelConfig = LEVELS[this.level] || LEVELS.pentascale;
        renderStaff(svg, {
            clef: levelConfig.clef,
            sequence: this.currentSequence,
            displayMode: this.displayMode,
            isRevealed: this.isRevealed,
            completedCount: this.userTypedLetters.length,
            onDotClick: (note, idx) => {
                this.context.audio.playNote(note.freq, 0.65, 0);
                highlightStaffDot(svg, idx, true, this.isRevealed || idx < this.userTypedLetters.length);
                this.keyboard?.pressKeyVisual(note.id, true);
                setTimeout(() => {
                    highlightStaffDot(svg, idx, false, this.isRevealed || idx < this.userTypedLetters.length);
                    this.keyboard?.pressKeyVisual(note.id, false);
                }, 350);
            }
        });
    },

    revealAnswer(earnedPoint = true, playAudio = true) {
        if (!this.isRevealed) {
            this.isRevealed = true;
            if (earnedPoint) {
                this.score += 1;
                this.context.onScoreEarned?.(this.score);
            }
        }

        const badge = document.getElementById('fcChallengeBadge');
        if (badge) {
            badge.className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-display font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
            badge.textContent = '✓ Answer Revealed';
        }

        const answerBanner = document.getElementById('fcAnswerBanner');
        if (answerBanner) {
            const badgesHtml = this.currentSequence.map((note, idx) => `
                <span class="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-600 text-white font-display font-bold text-sm sm:text-base shadow-sm border border-emerald-300">
                    ${note.letter}
                </span>
                ${idx < this.currentSequence.length - 1 ? '<span class="text-[#9e856d] font-semibold">–</span>' : ''}
            `).join('');

            answerBanner.innerHTML = `
                <div class="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
                    ${badgesHtml}
                </div>
            `;
        }

        this.keyboard?.updateCounters({
            sequence: this.currentSequence,
            completedCount: this.currentSequence.length,
            isRevealed: true,
            displayMode: this.displayMode
        });
        this._renderStaff();

        if (playAudio) {
            this.playSequenceAudio(true);
        }
    },

    handleLetterInput(letter, options = {}) {
        const { fromMidi = false, midiNoteObj = null, rawMidiNumber = null } = options;
        if (this.isRevealed) return;

        const currentStepIdx = this.userTypedLetters.length;
        const expectedNoteObj = this.currentSequence[currentStepIdx];
        if (!expectedNoteObj) return;

        let isMatch = false;
        if (fromMidi && rawMidiNumber !== null) {
            const pitchClass = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][rawMidiNumber % 12];
            isMatch = (rawMidiNumber === expectedNoteObj.midi) || (pitchClass === expectedNoteObj.letter);
        } else {
            isMatch = (letter === expectedNoteObj.letter);
        }

        if (isMatch) {
            this.userTypedLetters.push(expectedNoteObj.letter);
            this.context.storage.recordNoteAttempt(expectedNoteObj.id, true);
            this._updateHeardDisplay();

            this.keyboard?.updateCounters({
                sequence: this.currentSequence,
                completedCount: this.userTypedLetters.length,
                isRevealed: false,
                displayMode: this.displayMode
            });
            this._renderStaff();

            const svg = document.getElementById('fcStaffSvg');
            highlightStaffDot(svg, currentStepIdx, true, false);
            setTimeout(() => {
                highlightStaffDot(svg, currentStepIdx, false, true);
            }, 260);

            if (this.userTypedLetters.length === this.currentSequence.length) {
                const expectedLetters = this.currentSequence.map(n => n.letter);
                if (fromMidi) {
                    this.revealAnswer(true, false);
                    this.context.showToast(`✓ Nailed ${expectedLetters.join(' - ')}!`);
                    this.autoAdvanceTimer = setTimeout(() => {
                        this.generateChallenge(false);
                    }, 650);
                } else {
                    this.context.showToast(`Awesome! You got ${expectedLetters.join(' - ')}!`);
                    this.revealAnswer(true, true);
                }
            }
        } else {
            this.context.storage.recordNoteAttempt(expectedNoteObj.id, false);
            this._updateHeardDisplay(letter);

            const svg = document.getElementById('fcStaffSvg');
            flashWrongStaffDot(svg, currentStepIdx, false);

            if (fromMidi && midiNoteObj) {
                this.keyboard?.flashWrongKey(midiNoteObj.id);
                this.context.audio.playThud();
            } else {
                this.keyboard?.flashWrongKey(expectedNoteObj.id);
            }
        }
    },

    _updateHeardDisplay(wrongLetter = null) {
        const display = document.getElementById('fcHeardLettersDisplay');
        if (!display) return;
        const matched = this.userTypedLetters.join(' · ');
        if (wrongLetter) {
            display.innerHTML = `${matched ? matched + ' · ' : ''}<span class="text-rose-400 line-through">${wrongLetter}</span>`;
            setTimeout(() => {
                if (display) display.textContent = this.userTypedLetters.join(' · ');
            }, 450);
        } else {
            display.textContent = matched;
        }
    },

    playSequenceAudio(highlight = true) {
        const svg = document.getElementById('fcStaffSvg');
        this.context.audio.playSequence(this.currentSequence, {
            interval: 420,
            duration: 0.65,
            onStep: (note, idx, isActive = true) => {
                if (highlight) {
                    highlightStaffDot(svg, idx, isActive, this.isRevealed || idx < this.userTypedLetters.length);
                    this.keyboard?.pressKeyVisual(note.id, isActive);
                }
            }
        });
    },

    handleKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const tag = e.target.tagName;
        if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
        const onButton = tag === 'BUTTON';

        if (/^[a-gA-G]$/.test(e.key)) {
            const letter = e.key.toUpperCase();
            this._playLetterTone(letter);
            this.handleLetterInput(letter);
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            this.generateChallenge(false);
        } else if (!onButton && e.code === 'Space') {
            e.preventDefault();
            if (!this.isRevealed) this.revealAnswer(true);
            else this.playSequenceAudio(true);
        } else if (!onButton && e.code === 'Enter') {
            e.preventDefault();
            this.generateChallenge(false);
        }
    }
};
