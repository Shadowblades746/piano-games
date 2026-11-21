/**
 * GAME REGISTRY — the single place that lists every game.
 *
 * To add a game:
 *   1. Copy src/games/_template.js to src/games/my-game.js and build it.
 *   2. Add ONE line to GAMES below.
 * That's it: the nav tab, #/my-game route, lazy loading, keyboard routing and
 * lifecycle cleanup are all handled by src/main.js.
 *
 * Entry fields:
 *   id          unique, URL-safe slug (used in the #/route and as the storage namespace)
 *   title       full name (tab tooltip / accessibility)
 *   shortTitle  label shown on the nav tab
 *   icon        emoji shown on the nav tab
 *   load        () => import('./file.js')   — loaded only when first opened
 *
 * A game module's default export is a factory: (ctx) => ({ mount(root), unmount(), onKeyDown?(e) }).
 * See _template.js for the full ctx API.
 */
export const GAMES = [
  { id: 'note-flashcards', title: 'Note Flashcards', shortTitle: 'Flashcards', icon: '🎴', load: () => import('./note-flashcards.js') },
  { id: 'listen-match',    title: 'Listen & Match',  shortTitle: 'Listen',     icon: '🎧', load: () => import('./listen-match.js') },
  { id: 'letter-ladders',   title: 'Letter Ladders',  shortTitle: 'Ladders',    icon: '🪜', load: () => import('./letter-ladders.js') },
  // { id: 'interval-reading', title: 'Interval Reading', shortTitle: 'Intervals', icon: '↕️', load: () => import('./interval-reading.js') },
];

export const DEFAULT_GAME_ID = GAMES[0].id;
export const getGame = (id) => GAMES.find((g) => g.id === id) || null;
