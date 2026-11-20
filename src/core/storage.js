/**
 * NoteReader — Persistent LocalStorage Storage Manager
 * Safely persists user preferences, scores, high scores, streaks, and note statistics.
 */

const PREFIX = 'notereader_';

class StorageManager {
    constructor() {
        this.available = this._checkAvailability();
        this.memoryFallback = new Map();
    }

    _checkAvailability() {
        try {
            const testKey = '__storage_test__';
            window.localStorage.setItem(testKey, testKey);
            window.localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    get(key, defaultValue = null) {
        const fullKey = PREFIX + key;
        try {
            if (this.available) {
                const item = window.localStorage.getItem(fullKey);
                return item !== null ? JSON.parse(item) : defaultValue;
            }
            return this.memoryFallback.has(fullKey) ? this.memoryFallback.get(fullKey) : defaultValue;
        } catch (e) {
            console.warn(`Storage get error for ${key}:`, e);
            return defaultValue;
        }
    }

    set(key, value) {
        const fullKey = PREFIX + key;
        try {
            if (this.available) {
                window.localStorage.setItem(fullKey, JSON.stringify(value));
            } else {
                this.memoryFallback.set(fullKey, value);
            }
            return true;
        } catch (e) {
            console.warn(`Storage set error for ${key}:`, e);
            return false;
        }
    }

    remove(key) {
        const fullKey = PREFIX + key;
        try {
            if (this.available) {
                window.localStorage.removeItem(fullKey);
            } else {
                this.memoryFallback.delete(fullKey);
            }
        } catch (e) {}
    }

    getPreferences() {
        return this.get('user_preferences', {
            activeGameId: 'note-flashcards',
            flashcardLevel: 'pentascale',
            flashcardCount: '5',
            flashcardDisplay: 'both',
            listenLevel: 0,
            synthMuted: false,
            midiMode: 'answer'
        });
    }

    savePreferences(updates) {
        const current = this.getPreferences();
        const merged = { ...current, ...updates };
        this.set('user_preferences', merged);
        return merged;
    }

    getGameStats(gameId) {
        return this.get(`stats_${gameId}`, {
            totalCompleted: 0,
            bestStreak: 0,
            currentStreak: 0,
            firstTryCorrect: 0,
            totalRounds: 0,
            drillHighScore: 0
        });
    }

    saveGameStats(gameId, stats) {
        return this.set(`stats_${gameId}`, stats);
    }

    recordNoteAttempt(noteId, isCorrect) {
        const stats = this.get('note_accuracy', {});
        if (!stats[noteId]) {
            stats[noteId] = { attempts: 0, correct: 0 };
        }
        stats[noteId].attempts += 1;
        if (isCorrect) stats[noteId].correct += 1;
        this.set('note_accuracy', stats);
        return stats[noteId];
    }
}

export const storage = new StorageManager();
