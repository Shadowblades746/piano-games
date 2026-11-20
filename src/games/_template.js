/**
 * Starter for a new game. Copy to src/games/<your-game>.js, then register it in registry.js.
 * (Files starting with "_" are never loaded by the app.)
 *
 * ctx (provided by src/main.js for every mount):
 *   ctx.scope           listen(target, type, fn, opts) · timeout(fn, ms) · interval(fn, ms) ·
 *                       clear(id) · add(unsubscribeFn)  — everything registered here is torn
 *                       down automatically when the player switches games
 *   ctx.storage         localStorage namespace private to this game: get / set / update / remove
 *   ctx.score           award(points) · hit() (streak +1) · miss() (streak → 0)  → header ★ / 🔥
 *   ctx.addHeaderButton({ icon, label, title, onClick })  → adds a pill to the shared header
 *   ctx.navigate(id) · ctx.goBack()
 *
 * Import what you need directly:
 *   core/audio.js   playTone(freq, opts) · playSequence(notes, opts) · isMuted() · toggleMute()
 *   core/midi.js    midi.on('noteon' | 'noteoff' | 'sustain' | 'status', fn) → unsubscribe
 *   core/speech.js  createLetterListener({ onLetter, … })
 *   core/notes.js   ALL_NOTES, getNote, notesBetween, presets…
 *   ui/staff.js · ui/keyboard.js · ui/toast.js
 */
import * as audio from '../core/audio.js';
import { midi } from '../core/midi.js';
import { ALL_NOTES } from '../core/notes.js';
import { showToast } from '../ui/toast.js';

export default function createMyGame(ctx) {
  const { scope } = ctx;
  let root = null;

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <section class="studio-card rounded-2xl p-4 flex flex-col gap-3">
        <h2 class="font-display font-bold text-lg">My new game</h2>
        <button id="demoBtn" type="button" class="h-11 rounded-xl bg-[#2c1e16] text-[#fdf6e7] font-display font-semibold">Play a note</button>
      </section>`;

    scope.listen(root.querySelector('#demoBtn'), 'click', () => {
      audio.playTone(ALL_NOTES[11].freq);          // C4
      ctx.score.award(1); ctx.score.hit();
    });
    scope.add(midi.on('noteon', ({ note }) => showToast(`MIDI note ${note}`)));
  }

  // Optional extra cleanup. The scope is disposed automatically after this runs.
  function unmount() { if (root) root.innerHTML = ''; }

  // Optional. Receives keydown events (modifiers, form fields and key-repeat already filtered out).
  function onKeyDown(e) { if (e.key === 'Escape') ctx.goBack(); }

  return { mount, unmount, onKeyDown };
}
