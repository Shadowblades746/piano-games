# NoteReader

Piano sight-reading and ear-training practice suite. Static ES modules — no framework, no runtime CDN scripts, no backend.

## Structure

```
index.html              Shell: header (MIDI, 2-min timer, ★ score, 🔥 streak, game tabs), #gameRoot, footer attribution
css/input.css           SOURCE styles (custom components + Tailwind directives)
css/styles.css          BUILT stylesheet the page loads (committed → no build on Vercel)
src/main.js             Bootstrap, hash router, header controls, MIDI→piano bridge, key delegation, game lifecycle
src/core/notes.js       ALL_NOTES, staff-step/ledger math, freq⇄MIDI, level presets
src/core/audio.js       Salamander sampler (CacheStorage), velocity, note-off, CC64 sustain, sequences, mute, synth fallback
src/core/midi.js        Web MIDI manager + event emitter (noteon / noteoff / sustain / status)
src/core/speech.js      A–G voice listener with start/stop/destroy
src/core/storage.js     localStorage wrapper: prefs, totals, per-note stats (getWeakNotes)
src/core/scope.js       Disposable bag for listeners/timers/subscriptions
src/core/util.js        Small helpers
src/ui/staff.js         Counter staff (treble/bass/grand) + compact notation cards
src/ui/keyboard.js      Responsive piano keyboard with counters and press highlights
src/ui/toast.js         Toast helper
src/games/registry.js   THE list of games
src/games/_template.js  Starter for a new game
src/games/note-flashcards.js   Game 1
src/games/listen-match.js      Game 2
```

## Run locally

Any static server works (ES modules need http://, not file://):

```bash
npx serve .          # or: python3 -m http.server 8000
```

## Deploy to Vercel (via GitHub)

1. `git init && git add . && git commit -m "NoteReader" ` and push to a GitHub repo.
2. vercel.com → **Add New → Project** → import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Deploy.

`vercel.json` only adds security/cache headers (including `Permissions-Policy: midi=(self), microphone=(self)`).
Web MIDI and the microphone require HTTPS, which Vercel provides.

## Add a game

1. Copy `src/games/_template.js` → `src/games/my-game.js`.
2. Add one line to `GAMES` in `src/games/registry.js`.

The tab, `#/my-game` route, lazy loading, keyboard routing and cleanup come for free. Everything you register through
`ctx.scope` (listeners, timers, `midi.on(...)` unsubscribes) is disposed automatically when the player switches games;
`audio.stopAll()` also runs, so nothing leaks between games.

## Styles

`css/styles.css` is prebuilt. If you use a Tailwind class that is not in it yet, run once:

```bash
npm install
npm run build:css      # or: npm run watch:css
```

and commit the updated `css/styles.css`. Custom styles live in `css/input.css`.

## Optional: self-host the piano samples

Download the 22 Salamander `.mp3` files (A1 … C7, same names as the CDN) into `assets/salamander/` and uncomment the
first entry of `SAMPLE_BASES` in `src/core/audio.js`. The CDN entries stay as fallbacks.

## Attribution

Piano samples: Salamander Grand Piano by Alexander Holm, CC BY 3.0 (credited in the footer — keep it).
