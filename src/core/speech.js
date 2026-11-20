/**
 * NoteReader — Speech Recognition Module ("Say It Out Loud")
 * Listens for spoken note names (A–G) with fuzzy phonetic mappings.
 */

const SPOKEN_MAP = {
    'a': 'A', 'ay': 'A', 'eh': 'A', 'hey': 'A', 'eight': 'A',
    'b': 'B', 'be': 'B', 'bee': 'B', 'beat': 'B',
    'c': 'C', 'see': 'C', 'sea': 'C', 'si': 'C',
    'd': 'D', 'dee': 'D', 'the': 'D', 'de': 'D',
    'e': 'E', 'ee': 'E', 'he': 'E',
    'f': 'F', 'eff': 'F', 'ef': 'F', 'if': 'F',
    'g': 'G', 'gee': 'G', 'ji': 'G', 'jeep': 'G'
};

class SpeechManager {
    constructor() {
        this.recognition = null;
        this.isListening = false;
        this.processedWordCount = 0;
        this.noteListeners = new Set();
        this.stateListeners = new Set();
    }

    isSupported() {
        return typeof window !== 'undefined' &&
            !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    _initRecognition() {
        if (this.recognition) return this.recognition;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return null;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            this.isListening = true;
            this.processedWordCount = 0;
            this._notifyState(true);
        };

        recognition.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript.trim().toLowerCase();

            const tokens = transcript
                .replace(/[^a-z\s]/g, '')
                .split(/\s+/)
                .flatMap(word => {
                    if (word.length > 1 && /^[a-g]+$/.test(word)) {
                        return word.split('');
                    }
                    return [word];
                });

            if (result.isFinal) {
                for (let i = this.processedWordCount; i < tokens.length; i++) {
                    const mapped = SPOKEN_MAP[tokens[i]];
                    if (mapped) this._notifyNote(mapped);
                }
                this.processedWordCount = 0;
            } else {
                for (let i = this.processedWordCount; i < tokens.length; i++) {
                    const mapped = SPOKEN_MAP[tokens[i]];
                    if (mapped) {
                        this._notifyNote(mapped);
                        this.processedWordCount = i + 1;
                    }
                }
            }
        };

        recognition.onerror = (e) => {
            if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(e.error)) {
                this.stop();
                this._notifyState(false, e.error);
            }
        };

        recognition.onend = () => {
            if (this.isListening) {
                try {
                    recognition.start();
                } catch (err) {
                    this.stop();
                }
            } else {
                this._notifyState(false);
            }
        };

        this.recognition = recognition;
        return recognition;
    }

    start() {
        if (!this.isSupported()) {
            return { ok: false, error: 'unsupported' };
        }
        const rec = this._initRecognition();
        if (!rec) return { ok: false, error: 'init_failed' };

        try {
            rec.start();
            return { ok: true };
        } catch (err) {
            console.warn('Speech start error:', err);
            return { ok: false, error: err.name || 'failed' };
        }
    }

    stop() {
        this.isListening = false;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }
        this._notifyState(false);
    }

    toggle() {
        if (this.isListening) {
            this.stop();
            return false;
        } else {
            const res = this.start();
            return res.ok;
        }
    }

    onNote(fn) {
        this.noteListeners.add(fn);
        return () => this.noteListeners.delete(fn);
    }

    onStateChange(fn) {
        this.stateListeners.add(fn);
        fn({ isListening: this.isListening, error: null });
        return () => this.stateListeners.delete(fn);
    }

    _notifyNote(letter) {
        this.noteListeners.forEach(fn => fn(letter));
    }

    _notifyState(isListening, error = null) {
        this.stateListeners.forEach(fn => fn({ isListening, error }));
    }
}

export const speech = new SpeechManager();
