/** Tiny shared helpers (no app state). */

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Fisher–Yates; returns a new array. */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** True on narrow (phone-sized) viewports. Matches the original 640px breakpoint. */
export const isMobileViewport = () => window.innerWidth < 640;
