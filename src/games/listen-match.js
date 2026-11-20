/**
 * NoteReader — Game 2: Listen & Match (Ear-Training)
 * Hear a short piano melody, compare with 4 sheet-music choices, and tap the match!
 */

import { ALL_NOTES, LISTEN_LEVELS } from '../core/notes.js';
import { generateSheetMusicSvg } from '../ui/staff.js';

export default {
    id: 'listen-match',
    title: 'Listen & Match',
    shortTitle: 'Listen',
    icon: '🎧',
    description: 'Ear training: listen to a melody and pick the sheet music',

    mount(container, context) {
        this.container = container;
        this.context = context;

        const savedPrefs = context.storage.getPreferences();
        this.levelIndex = savedPrefs.listenLevel || 0;

        const savedStats = context.storage.getGameStats('listen-match');
        this.firstTry = savedStats.firstTryCorrect || 0;
        this.rounds = savedStats.totalRounds || 0;
        this.streak = savedStats.currentStreak || 0;

        this.seq = [];
        this.options = [];
        this.correctIndex = 0;
        this.isDone = false;
        this.isMissed = false;
        this.advanceTimer = null;
        this.unsubscribers = [];

        this._renderDom();
        this._bindEvents();
        this._updateStatsUI();
        this.newRound();
    },

    unmount() {
        clearTimeout(this.advanceTimer);
        if (this.context?.audio) {
            this.context.audio.clearSequence();
        }
        this.unsubscribers.forEach(fn => fn());
        this.unsubscribers = [];

        if (this.container) {
            this.container.innerHTML = '';
        }
    },

    _renderDom() {
        this.container.innerHTML = `
            <div class="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto px-2.5 sm:px-6 py-2.5 sm:py-4 gap-3">
                <!-- Warm Studio Ear-Training Card -->
                <div class="studio-card rounded-2xl p-3 sm:p-5 flex flex-col gap-3.5 shadow-md">
                    <!-- Controls Bar -->
                    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#d6c5a3]/50 pb-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <select id="lmLevelSelect" aria-label="Ear Training Difficulty" style="font-size:16px" class="bg-[#fcf8ee] text-[#3d2a1f] border border-[#cbb894] rounded-lg px-2.5 py-1.5 font-semibold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer">
                                ${LISTEN_LEVELS.map(l => `
                                    <option value="${l.id}" ${l.id === this.levelIndex ? 'selected' : ''}>${l.name}</option>
                                `).join('')}
                            </select>

                            <button id="lmPlayBtn" type="button" class="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer">
                                <span>▶</span>
                                <span>Replay Notes</span>
                            </button>

                            <button id="lmNextBtn" type="button" class="h-9 sm:h-10 px-3 sm:px-4 rounded-xl bg-[#fcf8ee] hover:bg-white active:bg-[#ebdec2] text-[#3d2a1f] border border-[#cbb894] text-xs sm:text-sm font-semibold shadow-sm transition cursor-pointer">
                                <span>Next Pattern →</span>
                            </button>
                        </div>

                        <!-- Pill showing score in current game -->
                        <div class="flex items-center gap-1.5 text-xs">
                            <span class="inline-flex items-center gap-1 bg-[#f5ecd8] border border-[#d6c5a3] rounded-full px-2.5 py-1 font-semibold text-[#3d2a1f]">
                                <span>🎯 Accuracy:</span>
                                <strong id="lmScoreBadge">0/0</strong>
                            </span>
                        </div>
                    </div>

                    <!-- Prompt / Status Message -->
                    <div class="min-h-[2.2rem] flex items-center">
                        <p id="lmMsg" aria-live="polite" class="text-xs sm:text-sm text-[#5c4332] font-medium">
                            Listen closely, then tap the sheet music card that matches what you hear.
                        </p>
                    </div>

                    <!-- 2x2 Sheet Music Options Grid -->
                    <div id="lmGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 my-auto">
                        <!-- 4 Sheet Music Buttons rendered dynamically -->
                    </div>

                    <div class="pt-2 border-t border-[#d6c5a3]/40 flex items-center justify-between text-[11px] text-[#785a46]">
                        <span>Keyboard shortcuts: <kbd class="px-1.5 py-0.5 bg-[#f5ecd8] border border-[#cbb894] rounded text-[10px] font-mono">1–4</kbd> pick · <kbd class="px-1.5 py-0.5 bg-[#f5ecd8] border border-[#cbb894] rounded text-[10px] font-mono">R</kbd> replay · <kbd class="px-1.5 py-0.5 bg-[#f5ecd8] border border-[#cbb894] rounded text-[10px] font-mono">N</kbd> next</span>
                        <span class="hidden sm:inline">First-try matches build your practice streak!</span>
                    </div>
                </div>
            </div>
        `;
    },

    _bindEvents() {
        const levelSel = document.getElementById('lmLevelSelect');
        levelSel?.addEventListener('change', (e) => {
            this.levelIndex = parseInt(e.target.value, 10);
            e.target.blur();
            this.context.storage.savePreferences({ listenLevel: this.levelIndex });
            this.newRound();
        });

        document.getElementById('lmPlayBtn')?.addEventListener('click', () => {
            this.playSequence(this.seq);
        });

        document.getElementById('lmNextBtn')?.addEventListener('click', () => {
            this.newRound();
        });
    },

    _updateStatsUI() {
        const badge = document.getElementById('lmScoreBadge');
        if (badge) {
            badge.textContent = `${this.firstTry}/${this.rounds}`;
        }
        this.context.updateHeaderScore?.(this.streak);
        this.context.storage.saveGameStats('listen-match', {
            firstTryCorrect: this.firstTry,
            totalRounds: this.rounds,
            currentStreak: this.streak
        });
    },

    playSequence(sequence) {
        if (!sequence || !sequence.length) return;
        this.context.audio.playSequence(sequence, {
            interval: 650,
            duration: 0.9,
            ignoreMute: true // User explicitly requested audio feedback for ear training
        });
    },

    _makeDistractor(target, pool, levelConfig) {
        if (Math.random() < levelConfig.flip) {
            return [...target].reverse();
        }
        const mutated = [...target];
        const changesCount = levelConfig.changes[Math.floor(Math.random() * levelConfig.changes.length)];
        const indices = [...mutated.keys()].sort(() => Math.random() - 0.5).slice(0, changesCount);

        indices.forEach(idx => {
            const poolWithoutCurrent = pool.filter(n => n.id !== mutated[idx].id);
            if (poolWithoutCurrent.length > 0) {
                mutated[idx] = poolWithoutCurrent[Math.floor(Math.random() * poolWithoutCurrent.length)];
            }
        });
        return mutated;
    },

    newRound() {
        clearTimeout(this.advanceTimer);
        const levelConfig = LISTEN_LEVELS[this.levelIndex] || LISTEN_LEVELS[0];

        const startIdx = ALL_NOTES.findIndex(n => n.id === levelConfig.from);
        const endIdx = ALL_NOTES.findIndex(n => n.id === levelConfig.to);
        const pool = ALL_NOTES.slice(startIdx, endIdx + 1);

        const getRandomNote = () => pool[Math.floor(Math.random() * pool.length)];

        let target;
        let attempts = 0;
        do {
            target = Array.from({ length: levelConfig.len }, getRandomNote);
            attempts++;
        } while (new Set(target.map(n => n.id)).size < 2 && attempts < 20);

        const key = arr => arr.map(n => n.id).join();
        const sets = [target];

        for (let t = 0; sets.length < 4 && t < 500; t++) {
            const distractor = this._makeDistractor(target, pool, levelConfig);
            if (!sets.some(existing => key(existing) === key(distractor))) {
                sets.push(distractor);
            }
        }

        const options = sets.map((seq, i) => ({ seq, isCorrect: i === 0 }))
            .sort(() => Math.random() - 0.5);

        this.seq = target;
        this.options = options.map(o => o.seq);
        this.correctIndex = options.findIndex(o => o.isCorrect);
        this.isDone = false;
        this.isMissed = false;

        const grid = document.getElementById('lmGrid');
        if (grid) {
            grid.innerHTML = '';
            this.options.forEach((seq, i) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'lm-card relative bg-[#fdfaf2] rounded-xl border-4 border-[#e2d5bd] shadow-md p-1.5 sm:p-2.5 transition active:scale-[0.98] cursor-pointer hover:border-[#3b82f6]/50';
                btn.setAttribute('aria-label', `Sheet Music Option ${i + 1}`);
                btn.innerHTML = `
                    <span class="absolute top-1.5 left-2.5 font-display font-bold text-slate-500 text-xs sm:text-sm bg-amber-100/70 border border-amber-300/40 rounded px-1.5 py-0.5">${i + 1}</span>
                    ${generateSheetMusicSvg(seq)}
                `;
                btn.addEventListener('click', () => this.pick(i));
                grid.appendChild(btn);
            });
        }

        const msg = document.getElementById('lmMsg');
        if (msg) {
            msg.textContent = 'Listen closely, then tap the sheet music card that matches.';
        }

        this._updateStatsUI();
        this.playSequence(target);
    },

    pick(index) {
        if (this.isDone) return;
        const grid = document.getElementById('lmGrid');
        if (!grid) return;
        const card = grid.children[index];
        if (!card || card.disabled) return;

        const msg = document.getElementById('lmMsg');

        if (index === this.correctIndex) {
            this.isDone = true;
            this.rounds++;
            if (!this.isMissed) {
                this.firstTry++;
                this.streak++;
                this.context.onScoreEarned?.(this.streak);
            }

            card.classList.remove('border-[#e2d5bd]', 'hover:border-[#3b82f6]/50');
            card.classList.add('border-emerald-500', 'ring-4', 'ring-emerald-300', 'bg-emerald-50/50');

            if (msg) {
                msg.innerHTML = `<span class="text-emerald-700 font-bold">${this.isMissed ? "That's the one!" : "Correct! 🎉"}</span>`;
            }
            this._updateStatsUI();

            this.advanceTimer = setTimeout(() => {
                this.newRound();
            }, 1600);
        } else {
            this.isMissed = true;
            this.streak = 0;
            card.disabled = true;
            card.classList.remove('border-[#e2d5bd]', 'hover:border-[#3b82f6]/50');
            card.classList.add('border-red-500', 'opacity-50', 'shake');

            if (msg) {
                msg.innerHTML = '<span class="text-rose-700 font-semibold">Not quite. That card sounds like this. Tap Replay to hear the goal again.</span>';
            }
            this._updateStatsUI();
            this.playSequence(this.options[index]);
        }
    },

    handleKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = e.target.tagName;
        if (tag === 'SELECT' || e.repeat) return;

        if (/^[1-4]$/.test(e.key)) {
            e.preventDefault();
            this.pick(parseInt(e.key, 10) - 1);
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            this.playSequence(this.seq);
        } else if (e.key === 'n' || e.key === 'N' || e.code === 'ArrowRight') {
            e.preventDefault();
            this.newRound();
        } else if (tag !== 'BUTTON' && e.code === 'Space') {
            e.preventDefault();
            this.playSequence(this.seq);
        } else if (tag !== 'BUTTON' && e.code === 'Enter') {
            e.preventDefault();
            this.newRound();
        }
    }
};
