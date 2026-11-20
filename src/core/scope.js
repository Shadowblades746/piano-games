/**
 * Scope: a disposable bag for everything a game creates while mounted.
 * main.js disposes a game's scope on every switch, so listeners, timers and
 * subscriptions can never leak into the next game, even if a game forgets
 * to clean up in unmount().
 */
export function createScope() {
  const disposers = [];
  const timeouts = new Set();
  const intervals = new Set();
  let disposed = false;

  return {
    /** addEventListener that is automatically removed on dispose. */
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      disposers.push(() => target.removeEventListener(type, handler, options));
    },
    /** Register any cleanup function, e.g. an unsubscribe returned by midi.on(). */
    add(disposer) {
      if (typeof disposer === 'function') disposers.push(disposer);
      return disposer;
    },
    timeout(fn, ms) {
      if (disposed) return 0;
      const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
      timeouts.add(id);
      return id;
    },
    interval(fn, ms) {
      if (disposed) return 0;
      const id = setInterval(fn, ms);
      intervals.add(id);
      return id;
    },
    clear(id) {
      clearTimeout(id); clearInterval(id);
      timeouts.delete(id); intervals.delete(id);
    },
    dispose() {
      disposed = true;
      timeouts.forEach(clearTimeout); timeouts.clear();
      intervals.forEach(clearInterval); intervals.clear();
      while (disposers.length) {
        try { disposers.pop()(); } catch (err) { console.error('[scope] cleanup failed', err); }
      }
    },
  };
}
