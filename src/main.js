/**
 * NoteReader — App Bootstrapper & Main Orchestrator
 * Coordinates:
 *  - Static ES Modules architecture & lifecycle routing
 *  - Shared top navigation (Game Switcher, Web MIDI, 2-Min Drill Timer, Streak/Score, Mute)
 *  - Keyboard shortcut delegation to active game
 *  - Persistent storage & audio engine status tracking
 */

import { audio, AUDIO_ATTRIBUTION } from './core/audio.js';
import { midi } from './core/midi.js';
import { speech } from './core/speech.js';
import { storage } from './core/storage.js';
import { showToast } from './ui/toast.js';
import { getAllGames, getGameById, getDefaultGameId } from './games/registry.js';

class NoteReaderApp {
    constructor() {
        this.mountEl = document.getElementById('appMount');
        this.activeGame = null;
        this.activeGameId = null;

        // Shared Session Stats & Drill Timer State
        this.sessionScore = 0;
        this.drillRunning = false;
        this.drillSecondsLeft = 120;
        this.drillStartScore = 0;
        this.drillInterval = null;

        this.init();
    }

    init() {
        this._setupAudioMute();
        this._setupMidi();
        this._setupDrillTimer();
        this._setupGameSwitcher();
        this._setupKeyboardRouting();
        this._setupBlurHandler();

        // Restore active game from URL hash or storage
        const hashMatch = window.location.hash.match(/game=([a-z0-9_-]+)/i);
        const storedPrefs = storage.getPreferences();
        const initialGameId = hashMatch ? hashMatch[1] : (storedPrefs.activeGameId || getDefaultGameId());

        this.switchGame(initialGameId);

        // Listen for browser back/forward navigation
        window.addEventListener('hashchange', () => {
            const match = window.location.hash.match(/game=([a-z0-9_-]+)/i);
            if (match && match[1] !== this.activeGameId) {
                this.switchGame(match[1]);
            }
        });
    }

    _setupAudioMute() {
        const muteBtn = document.getElementById('synthMuteBtn');
        const muteIcon = document.getElementById('synthMuteIcon');
        const statusSpan = document.getElementById('pianoStatus');

        audio.onStatusChange((statusText) => {
            if (statusSpan) statusSpan.textContent = statusText;
        });

        const updateMuteUI = (isMuted) => {
            if (!muteBtn || !muteIcon) return;
            if (isMuted) {
                muteIcon.textContent = '🔇';
                muteBtn.classList.remove('text-[#3d2a1f]', 'bg-[#fcf8ee]', 'border-[#cbb894]');
                muteBtn.classList.add('text-amber-900', 'border-amber-400', 'bg-amber-100');
            } else {
                muteIcon.textContent = '🔊';
                muteBtn.classList.remove('text-amber-900', 'border-amber-400', 'bg-amber-100');
                muteBtn.classList.add('text-[#3d2a1f]', 'bg-[#fcf8ee]', 'border-[#cbb894]');
            }
        };

        const prefs = storage.getPreferences();
        if (prefs.synthMuted) {
            audio.setMuted(true);
        }
        updateMuteUI(audio.isMuted());

        muteBtn?.addEventListener('click', () => {
            const isMuted = audio.toggleMute();
            storage.savePreferences({ synthMuted: isMuted });
            updateMuteUI(isMuted);
            showToast(isMuted
                ? 'Browser audio muted (ideal for P-125 speakers or external synth).'
                : 'Browser piano audio enabled.');
        });
    }

    _setupMidi() {
        const connectBtn = document.getElementById('midiConnectBtn');
        const dot = document.getElementById('midiStatusDot');
        const label = document.getElementById('midiStatusLabel');

        const updateMidiUI = (state) => {
            if (!dot || !label || !connectBtn) return;

            if (!state.isSupported) {
                dot.className = 'w-2 h-2 rounded-full bg-[#8c6d56] shrink-0';
                label.textContent = 'MIDI Unavailable';
                connectBtn.classList.add('opacity-60');
                return;
            }

            if (state.connected) {
                dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0';
                label.textContent = state.deviceName || 'MIDI Connected';
                connectBtn.classList.remove('border-[#5e4332]', 'text-[#f5ecd8]', 'bg-[#3d2a1f]');
                connectBtn.classList.add('border-emerald-400/50', 'text-emerald-200', 'bg-emerald-950/80');
            } else {
                dot.className = 'w-2 h-2 rounded-full bg-amber-300/80 shrink-0';
                label.textContent = state.hasAccess ? 'No MIDI Device' : 'Connect MIDI';
                connectBtn.classList.remove('border-emerald-400/50', 'text-emerald-200', 'bg-emerald-950/80');
                connectBtn.classList.add('border-[#5e4332]', 'text-[#f5ecd8]', 'bg-[#3d2a1f]');
            }
        };

        midi.on('statechange', (state) => {
            updateMidiUI(state);
            if (state.wasConnected === false && state.connected) {
                showToast(`🎹 Connected: ${state.deviceName}! You can play notes on your piano.`);
            } else if (state.wasConnected === true && !state.connected) {
                showToast('MIDI keyboard disconnected.');
            }
        });

        connectBtn?.addEventListener('click', async () => {
            const res = await midi.requestAccess(true);
            if (!res.ok) {
                if (res.error === 'unsupported') {
                    showToast('Web MIDI is not supported on this browser (supported in Chrome/Edge on Desktop & Android).');
                } else {
                    showToast('MIDI permission denied. Check browser settings.');
                }
            } else if (!res.connected) {
                showToast('Plug in your Yamaha P-125 or USB MIDI keyboard and it will auto-detect!');
            }
        });

        updateMidiUI(midi.getState());
    }

    _setupDrillTimer() {
        const timerBtn = document.getElementById('drillTimerBtn');
        const timerDisplay = document.getElementById('timerDisplay');

        timerBtn?.addEventListener('click', () => {
            if (this.drillRunning) {
                clearInterval(this.drillInterval);
                this.drillRunning = false;
                this.drillSecondsLeft = 120;
                if (timerDisplay) timerDisplay.textContent = '2:00';
                showToast('2-minute drill timer reset.');
                return;
            }

            this.drillRunning = true;
            this.drillSecondsLeft = 120;
            this.drillStartScore = this.sessionScore;
            if (timerDisplay) timerDisplay.textContent = '2:00';
            showToast('2-minute daily drill started! Go!');

            this.drillInterval = setInterval(() => {
                this.drillSecondsLeft -= 1;
                const mins = Math.floor(this.drillSecondsLeft / 60);
                const secs = this.drillSecondsLeft % 60;
                if (timerDisplay) {
                    timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                }

                if (this.drillSecondsLeft <= 0) {
                    clearInterval(this.drillInterval);
                    this.drillRunning = false;
                    if (timerDisplay) timerDisplay.textContent = 'Done!';
                    const doneCount = this.sessionScore - this.drillStartScore;
                    showToast(`Time's up! You completed ${doneCount} pattern${doneCount === 1 ? '' : 's'}!`);
                    audio.playNote(523.25, 0.4, 0); // C5 celebratory ping
                }
            }, 1000);
        });
    }

    _setupGameSwitcher() {
        const switcherContainer = document.getElementById('gameSwitcher');
        if (!switcherContainer) return;

        switcherContainer.innerHTML = '';
        const games = getAllGames();

        games.forEach(game => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.gameId = game.id;
            btn.className = 'game-switch-btn inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold text-[#f5ecd8] border border-transparent cursor-pointer';
            btn.innerHTML = `<span aria-hidden="true">${game.icon}</span><span>${game.shortTitle || game.title}</span>`;
            btn.setAttribute('title', game.description);

            btn.addEventListener('click', () => {
                this.switchGame(game.id);
            });

            switcherContainer.appendChild(btn);
        });
    }

    _updateGameSwitcherUI() {
        const buttons = document.querySelectorAll('.game-switch-btn');
        buttons.forEach(btn => {
            if (btn.dataset.gameId === this.activeGameId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    switchGame(gameId) {
        const gameEntry = getGameById(gameId);
        if (!gameEntry) return;

        if (this.activeGame && this.activeGame.unmount) {
            this.activeGame.unmount();
        }

        this.activeGameId = gameEntry.id;
        this.activeGame = gameEntry.module;

        // Persist preference and sync URL hash without reloading
        storage.savePreferences({ activeGameId: this.activeGameId });
        if (window.location.hash !== `#game=${this.activeGameId}`) {
            history.replaceState(null, '', `#game=${this.activeGameId}`);
        }

        this._updateGameSwitcherUI();

        // Game context containing shared services & hooks
        const context = {
            audio,
            midi,
            speech,
            storage,
            showToast,
            updateHeaderScore: (score) => {
                const scoreDisplay = document.getElementById('scoreDisplay');
                if (scoreDisplay) scoreDisplay.textContent = score;
            },
            onScoreEarned: (currentStreakOrScore) => {
                this.sessionScore += 1;
                const scoreDisplay = document.getElementById('scoreDisplay');
                if (scoreDisplay) scoreDisplay.textContent = currentStreakOrScore;
            }
        };

        if (this.activeGame && this.activeGame.mount) {
            this.activeGame.mount(this.mountEl, context);
        }
    }

    _setupKeyboardRouting() {
        window.addEventListener('keydown', (e) => {
            if (this.activeGame && typeof this.activeGame.handleKeyDown === 'function') {
                this.activeGame.handleKeyDown(e);
            }
        });
    }

    _setupBlurHandler() {
        // Prevents mouse/touch clicks from retaining focus on buttons so keyboard shortcuts keep working
        document.addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('button');
            if (b && e.detail > 0) b.blur();
        });
    }
}

// Bootstrap on DOM readiness
document.addEventListener('DOMContentLoaded', () => {
    window.noteReaderApp = new NoteReaderApp();
});
