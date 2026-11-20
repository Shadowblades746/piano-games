/**
 * NoteReader — Web MIDI Manager
 * Handles USB / Bluetooth MIDI connections (e.g. Yamaha P-125), hot-plugging,
 * note/sustain routing, and event subscriptions for mini-games.
 */

import { MIDI_PITCH_CLASSES, getNoteByMidi, midiNumberToFreq } from './notes.js';
import { audio } from './audio.js';

class MidiManager {
    constructor() {
        this.access = null;
        this.connected = false;
        this.deviceName = '';
        this.mode = 'answer'; // 'answer' (play-to-answer) or 'free' (free-play)
        this.directAudio = true; // plays sound directly through audio engine

        this.listeners = {
            noteon: new Set(),
            noteoff: new Set(),
            sustain: new Set(),
            statechange: new Set()
        };

        this._checkAutoConnect();
    }

    isSupported() {
        return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
    }

    _checkAutoConnect() {
        if (!this.isSupported()) return;
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'midi' })
                .then(p => {
                    if (p.state === 'granted') {
                        this.requestAccess(false);
                    }
                })
                .catch(() => {});
        }
    }

    async requestAccess(userTriggered = false) {
        if (!this.isSupported()) {
            this._notifyStateChange();
            return { ok: false, error: 'unsupported' };
        }

        try {
            if (!this.access) {
                this.access = await navigator.requestMIDIAccess({ sysex: false });
                this.access.onstatechange = () => this._bindInputs();
            }
            this._bindInputs();
            return {
                ok: true,
                connected: this.connected,
                deviceName: this.deviceName
            };
        } catch (err) {
            this._notifyStateChange();
            return { ok: false, error: err.name || 'denied' };
        }
    }

    _bindInputs() {
        if (!this.access) return;
        const inputs = Array.from(this.access.inputs.values());
        const activeInputs = inputs.filter(inp => inp.state === 'connected');

        activeInputs.forEach(input => {
            input.onmidimessage = (e) => this._handleMidiMessage(e);
        });

        const wasConnected = this.connected;
        this.connected = activeInputs.length > 0;
        this.deviceName = this.connected ? (activeInputs[0].name || 'USB MIDI Piano') : '';

        this._notifyStateChange({ wasConnected });
    }

    _handleMidiMessage(event) {
        const [status, data1, data2] = event.data;
        const command = status & 0xf0;

        if (command === 0x90 && data2 > 0) {
            // Note On
            const midiNumber = data1;
            const velocity = data2;
            const pitchName = MIDI_PITCH_CLASSES[midiNumber % 12];
            const noteObj = getNoteByMidi(midiNumber);

            if (this.directAudio && !audio.isMuted()) {
                audio.playNote(midiNumberToFreq(midiNumber), 4.0, 0, {
                    velocity,
                    holdUntilNoteOff: true
                });
            }

            const payload = {
                midi: midiNumber,
                pitchName,
                velocity,
                noteObj,
                mode: this.mode
            };

            this.listeners.noteon.forEach(fn => fn(payload));
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
            // Note Off
            const midiNumber = data1;
            const pitchName = MIDI_PITCH_CLASSES[midiNumber % 12];

            if (this.directAudio) {
                audio.stopNote(midiNumber);
            }

            const payload = { midi: midiNumber, pitchName };
            this.listeners.noteoff.forEach(fn => fn(payload));
        } else if (command === 0xb0 && data1 === 64) {
            // Sustain Pedal (CC 64)
            const isDown = data2 >= 64;
            if (this.directAudio) {
                audio.setSustain(isDown);
            }
            this.listeners.sustain.forEach(fn => fn({ isDown, value: data2 }));
        }
    }

    setMode(mode) {
        if (mode === 'answer' || mode === 'free') {
            this.mode = mode;
            this._notifyStateChange();
        }
    }

    toggleMode() {
        this.setMode(this.mode === 'answer' ? 'free' : 'answer');
        return this.mode;
    }

    on(event, fn) {
        if (this.listeners[event]) {
            this.listeners[event].add(fn);
            return () => this.listeners[event].delete(fn);
        }
        return () => {};
    }

    _notifyStateChange(extra = {}) {
        const state = {
            isSupported: this.isSupported(),
            hasAccess: !!this.access,
            connected: this.connected,
            deviceName: this.deviceName,
            mode: this.mode,
            ...extra
        };
        this.listeners.statechange.forEach(fn => fn(state));
    }

    getState() {
        return {
            isSupported: this.isSupported(),
            hasAccess: !!this.access,
            connected: this.connected,
            deviceName: this.deviceName,
            mode: this.mode
        };
    }
}

export const midi = new MidiManager();
