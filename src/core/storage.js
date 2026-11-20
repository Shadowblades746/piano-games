/**
 * localStorage wrapper. Every call is try/catch-guarded (Safari private mode,
 * blocked storage, quota) and falls back to an in-memory map for the session.
 */
const PREFIX = 'notereader:v1:';
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) { /* fall through to memory */ }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* memory only */ }
}

export const storage = {
  get: (key, fallback = null) => read(key, fallback),
  set: write,
  update(key, fn, fallback = null) {
    const next = fn(read(key, fallback));
    write(key, next);
    return next;
  },
  remove(key) {
    memory.delete(key);
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  },

  /** Prefixed view so each game keeps its preferences under its own namespace. */
  namespace(name) {
    const k = (key) => `${name}:${key}`;
    return {
      get: (key, fallback = null) => read(k(key), fallback),
      set: (key, value) => write(k(key), value),
      update: (key, fn, fallback = null) => storage.update(k(key), fn, fallback),
      remove: (key) => storage.remove(k(key)),
    };
  },

  // ---- Cross-game progress -------------------------------------------------
  /** Lifetime totals: { score, bestStreak }. */
  addScore(points = 1) {
    return storage.update('totals', (t) => ({ ...t, score: (t.score || 0) + points }), {});
  },
  noteBestStreak(streak) {
    return storage.update('totals', (t) => (
      streak > (t.bestStreak || 0) ? { ...t, bestStreak: streak } : t
    ), {});
  },

  // ---- Per-note stats (feeds weak-note drills / spaced repetition later) ----
  recordNote(noteId, correct) {
    storage.update('noteStats', (s) => {
      const e = s[noteId] || { seen: 0, correct: 0, last: 0 };
      return { ...s, [noteId]: { seen: e.seen + 1, correct: e.correct + (correct ? 1 : 0), last: Date.now() } };
    }, {});
  },
  /** Notes with the lowest accuracy (min 3 attempts), worst first. */
  getWeakNotes(limit = 5) {
    const stats = read('noteStats', {});
    return Object.entries(stats)
      .filter(([, e]) => e.seen >= 3)
      .map(([id, e]) => ({ id, seen: e.seen, accuracy: e.correct / e.seen }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  },
};
