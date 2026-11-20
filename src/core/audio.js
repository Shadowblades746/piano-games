/**
 * NoteReader — Audio Engine
 * Features:
 *  - Salamander Grand Piano sample playback (Alexander Holm, CC BY 3.0)
 *  - Persistent CacheStorage for offline & instant reloads
 *  - Tuned convolution reverb & opened-up dynamic brightness filter (3500 + velNorm * 11500 Hz)
 *  - Velocity-sensitive playback, Note-Off release & Sustain Pedal (CC 64) tracking
 *  - Automatic 3-oscillator additive Web Audio synth fallback
 *  - Sequence playback helper with cancellation
 *  - Global mute toggle and mobile touch unlock
 */

const BASES = [
    'https://tonejs.github.io/audio/salamander/',
    'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/'
];

const SAMPLE_NAMES = [
    'A1','C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4',
    'Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7'
];

const PITCH_CLASS_OFFSET = { C: 0, Ds: 3, Fs: 6, A: 9 };
const midiOfSample = name => {
    const oct = parseInt(name.slice(-1), 10);
    const pc = name.slice(0, -1);
    return (oct + 1) * 12 + PITCH_CLASS_OFFSET[pc];
};

const CACHE_NAME = 'notereader-salamander-v1';

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.audioPrimed = false;
        this.muted = false;

        this.rawBuffers = {};
        this.sampleBuffers = [];
        this.activeVoices = new Map();     // midi -> { src, gain, released }
        this.sustainedVoices = new Set();  // voices held by sustain pedal
        this.sustainDown = false;
        this.reverbBus = null;

        this.fetchedCount = 0;
        this.failedCount = 0;
        this.statusListeners = new Set();
        this.muteListeners = new Set();
        this.activeSequenceTimers = [];

        this._setupUnlockListeners();
        this._loadSamples();
    }

    _setupUnlockListeners() {
        const unlock = () => {
            this.unlockAudioContext();
            setTimeout(() => this._decodePendingBuffers(), 0);
        };
        ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach(evt => {
            window.addEventListener(evt, unlock, { passive: true });
        });
    }

    unlockAudioContext() {
        try {
            if (!this.audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                this.audioCtx = new AudioContextClass();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            if (!this.audioPrimed) {
                const silentBuf = this.audioCtx.createBuffer(1, 1, 22050);
                const source = this.audioCtx.createBufferSource();
                source.buffer = silentBuf;
                source.connect(this.audioCtx.destination);
                source.start(0);
                this.audioPrimed = true;
            }
        } catch (err) {
            console.warn('AudioContext unlock error:', err);
        }
    }

    async _fetchWithCache(name) {
        const cache = ('caches' in window) ? await caches.open(CACHE_NAME).catch(() => null) : null;
        for (let i = 0; i < BASES.length; i++) {
            const url = BASES[i] + name + '.mp3';
            try {
                if (cache) {
                    const hit = await cache.match(url);
                    if (hit) return await hit.arrayBuffer();
                }
                const res = await fetch(url);
                if (!res.ok) continue;
                if (cache) cache.put(url, res.clone()).catch(() => {});
                return await res.arrayBuffer();
            } catch (e) {
                // Try fallback CDN
            }
        }
        throw new Error(`Failed to load ${name}`);
    }

    _loadSamples() {
        SAMPLE_NAMES.forEach(name => {
            this._fetchWithCache(name)
                .then(ab => {
                    this.rawBuffers[name] = ab;
                    this.fetchedCount++;
                    this._notifyStatus();
                    this._decodePendingBuffers();
                })
                .catch(() => {
                    this.failedCount++;
                    this._notifyStatus();
                });
        });
        this._notifyStatus();
    }

    _decodePendingBuffers() {
        if (!this.audioCtx) return;
        Object.keys(this.rawBuffers).forEach(name => {
            const ab = this.rawBuffers[name];
            delete this.rawBuffers[name];
            this.audioCtx.decodeAudioData(
                ab,
                buffer => {
                    this.sampleBuffers.push({ midi: midiOfSample(name), buffer });
                    this._notifyStatus();
                },
                () => {
                    this.failedCount++;
                    this._notifyStatus();
                }
            );
        });
    }

    _getReverbBus() {
        if (this.reverbBus && this.reverbBus.ctx === this.audioCtx) {
            return this.reverbBus;
        }
        const ctx = this.audioCtx;
        const input = ctx.createGain();
        const dry = ctx.createGain();
        dry.gain.value = 0.88;
        const wet = ctx.createGain();
        wet.gain.value = 0.22;

        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 6500;

        const conv = ctx.createConvolver();
        const len = Math.floor(ctx.sampleRate * 1.9);
        const ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            for (let i = 0; i < len; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
            }
        }
        conv.buffer = ir;

        input.connect(dry);
        dry.connect(ctx.destination);
        input.connect(conv);
        conv.connect(tone);
        tone.connect(wet);
        wet.connect(ctx.destination);

        this.reverbBus = { ctx, input };
        return this.reverbBus;
    }

    _releaseVoice(voice, releaseTime = 0.42) {
        if (!voice || voice.released || !this.audioCtx) return;
        voice.released = true;
        const now = this.audioCtx.currentTime;
        try {
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0005), now);
            voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
            voice.src.stop(now + releaseTime + 0.05);
        } catch (e) {}
    }

    _playSample(freq, duration, delay, velocity = 112, holdUntilNoteOff = false) {
        if (!this.audioCtx || !this.sampleBuffers.length) return false;
        const midi = 69 + 12 * Math.log2(freq / 440);
        const midiRound = Math.round(midi);

        let best = null;
        for (const b of this.sampleBuffers) {
            if (!best || Math.abs(b.midi - midi) < Math.abs(best.midi - midi)) {
                best = b;
            }
        }
        if (!best || Math.abs(best.midi - midi) > 3) return false;

        const t = this.audioCtx.currentTime + (delay || 0);
        const src = this.audioCtx.createBufferSource();
        src.buffer = best.buffer;
        src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);

        const velNorm = Math.max(0.05, Math.min(1, velocity / 127));
        const peakGain = 0.18 + Math.pow(velNorm, 1.35) * 0.82;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3500 + velNorm * 11500, t);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(peakGain, t);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this._getReverbBus().input);
        src.start(t);

        const voice = { src, gain, released: false };

        if (holdUntilNoteOff) {
            const prev = this.activeVoices.get(midiRound);
            if (prev) this._releaseVoice(prev, 0.12);
            this.activeVoices.set(midiRound, voice);
            this.sustainedVoices.delete(voice);
        } else {
            const hold = Math.max(duration || 0.65, 0.55) * 1.5;
            gain.gain.setValueAtTime(peakGain, t + hold);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.5);
            src.stop(t + hold + 0.55);
        }
        return true;
    }

    _playSynth(freq, duration, delay) {
        if (!this.audioCtx) return;
        const startTime = this.audioCtx.currentTime + delay;

        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const osc3 = this.audioCtx.createOscillator();

        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc3.type = 'sine';

        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq * 2, startTime);
        osc3.frequency.setValueAtTime(freq * 3, startTime);

        const gain1 = this.audioCtx.createGain();
        const gain2 = this.audioCtx.createGain();
        const gain3 = this.audioCtx.createGain();
        const masterGain = this.audioCtx.createGain();

        gain1.gain.value = 0.55;
        gain2.gain.value = 0.18;
        gain3.gain.value = 0.05;

        masterGain.gain.setValueAtTime(0.001, startTime);
        masterGain.gain.linearRampToValueAtTime(0.45, startTime + 0.015);
        masterGain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.25);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc1.connect(gain1);
        osc2.connect(gain2);
        osc3.connect(gain3);

        gain1.connect(masterGain);
        gain2.connect(masterGain);
        gain3.connect(masterGain);
        masterGain.connect(this.audioCtx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        osc3.start(startTime);

        osc1.stop(startTime + duration + 0.05);
        osc2.stop(startTime + duration + 0.05);
        osc3.stop(startTime + duration + 0.05);
    }

    playNote(freq, duration = 0.65, delay = 0, { velocity = 112, holdUntilNoteOff = false, ignoreMute = false } = {}) {
        if (this.muted && !ignoreMute) return;
        try {
            this.unlockAudioContext();
            if (!this.audioCtx) return;

            const handledBySample = this._playSample(freq, duration, delay, velocity, holdUntilNoteOff);
            if (!handledBySample) {
                this._playSynth(freq, duration, delay);
            }
        } catch (err) {
            console.warn('Audio playback skipped:', err);
        }
    }

    stopNote(midiNumber) {
        const voice = this.activeVoices.get(midiNumber);
        if (!voice) return;
        this.activeVoices.delete(midiNumber);
        if (this.sustainDown) {
            this.sustainedVoices.add(voice);
        } else {
            this._releaseVoice(voice, 0.42);
        }
    }

    setSustain(isDown) {
        this.sustainDown = !!isDown;
        if (!this.sustainDown) {
            this.sustainedVoices.forEach(v => this._releaseVoice(v, 0.45));
            this.sustainedVoices.clear();
        }
    }

    playThud() {
        if (this.muted) return;
        try {
            this.unlockAudioContext();
            if (!this.audioCtx) return;
            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(115, now);
            osc.frequency.exponentialRampToValueAtTime(58, now + 0.16);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } catch (e) {}
    }

    playSequence(items, { interval = 420, duration = 0.65, onStep = null, onDone = null, ignoreMute = false } = {}) {
        this.clearSequence();
        if (!items || !items.length) return;

        items.forEach((item, idx) => {
            const freq = typeof item === 'number' ? item : item.freq;
            const delayMs = idx * interval;

            const timer = setTimeout(() => {
                this.playNote(freq, duration, 0, { ignoreMute });
                if (onStep) onStep(item, idx);
            }, delayMs);
            this.activeSequenceTimers.push(timer);

            if (onStep) {
                const offTimer = setTimeout(() => {
                    onStep(item, idx, false);
                }, delayMs + Math.min(interval - 50, 350));
                this.activeSequenceTimers.push(offTimer);
            }
        });

        if (onDone) {
            const endTimer = setTimeout(() => {
                onDone();
            }, items.length * interval);
            this.activeSequenceTimers.push(endTimer);
        }
    }

    clearSequence() {
        this.activeSequenceTimers.forEach(clearTimeout);
        this.activeSequenceTimers = [];
    }

    isMuted() {
        return this.muted;
    }

    setMuted(val) {
        this.muted = !!val;
        this.muteListeners.forEach(fn => fn(this.muted));
    }

    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    onMuteChange(fn) {
        this.muteListeners.add(fn);
        return () => this.muteListeners.delete(fn);
    }

    getStatus() {
        const total = SAMPLE_NAMES.length;
        if (this.sampleBuffers.length === total) {
            return `Piano sound: Salamander Grand ✓ (${this.sampleBuffers.length}/${total} cached)`;
        } else if (this.sampleBuffers.length > 0) {
            return `Piano sound: Salamander Grand (${this.sampleBuffers.length}/${total} samples)`;
        } else if (this.fetchedCount === 0 && this.failedCount >= total) {
            return 'Piano sound: built-in synth (samples could not load)';
        } else if (this.fetchedCount > 0) {
            return 'Piano sound: samples cached, tap any key to enable';
        } else {
            return 'Piano sound: loading Salamander Grand…';
        }
    }

    onStatusChange(fn) {
        this.statusListeners.add(fn);
        fn(this.getStatus());
        return () => this.statusListeners.delete(fn);
    }

    _notifyStatus() {
        const text = this.getStatus();
        this.statusListeners.forEach(fn => fn(text));
    }
}

export const audio = new AudioEngine();
export const AUDIO_ATTRIBUTION = 'Piano samples: Salamander Grand Piano by Alexander Holm (CC BY 3.0)';
