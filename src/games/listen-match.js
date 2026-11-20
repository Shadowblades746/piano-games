/**
 * Game 2 — Listen & Match (ear training).
 * Hear a short melody, tap the sheet music that matches. First-try scoring + streaks.
 * Shortcuts: 1–4 pick a sheet · R replay · N / → next · Esc back.
 */
import { ALL_NOTES, LISTEN_LEVELS, notesBetween } from '../core/notes.js';
import * as audio from '../core/audio.js';
import { storage as appStorage } from '../core/storage.js';
import { pickRandom, shuffle } from '../core/util.js';
import { renderNotationCard } from '../ui/staff.js';

const PILL = 'inline-flex items-center gap-1 bg-[#3d2a1f] border border-[#5e4332] rounded-full px-2.5 py-1 text-xs font-medium text-[#f5ecd8]';

const TEMPLATE = `
<div class="flex-1 w-full max-w-3xl mx-auto flex flex-col gap-3 text-[#fdf6e7]">
  <h2 class="sr-only">Listen &amp; Match</h2>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <select id="listenLevel" aria-label="Difficulty" style="font-size:16px" class="bg-[#fcf8ee] text-[#3d2a1f] border border-[#cbb894] rounded-lg px-2 py-2 font-medium"></select>
      <button id="listenPlayBtn" type="button" class="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer">▶ Replay notes</button>
      <button id="listenNextBtn" type="button" class="h-10 px-4 rounded-xl bg-[#fcf8ee] hover:bg-white text-[#3d2a1f] border border-[#cbb894] text-sm font-semibold cursor-pointer">Next →</button>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="${PILL}" title="First-try correct / rounds played">✓ <span id="listenScore">0/0</span></span>
      <span class="${PILL}" title="Current streak">🔥 <span id="listenStreak">0</span></span>
    </div>
  </div>
  <p id="listenMsg" aria-live="polite" class="text-sm text-amber-100/90 min-h-[2.5rem]"></p>
  <div id="listenGrid" class="grid grid-cols-2 gap-3"></div>
  <p class="hidden sm:block text-xs text-amber-100/60">Shortcuts: 1–4 pick a sheet · R replay · N next · Esc back</p>
</div>`;

// Session totals survive switching games (they reset on page reload).
const session = { firstTry: 0, rounds: 0, streak: 0 };

export default function createListenMatch(ctx) {
  const { scope, storage: prefs } = ctx;
  const round = { seq: [], options: [], correct: 0, done: false, missed: false, advance: null };
  let level = 0;
  let root = null;
  let $ = () => null;
  let handle = null;

  function playSeq(seq) {
    if (handle) handle.cancel();
    handle = audio.playSequence(seq, { gap: 650, duration: 0.9, ignoreMute: true });
  }

  /** A wrong sheet: the melody reversed, or the melody with a few notes swapped. */
  function makeDistractor(answer, pool, lv) {
    if (Math.random() < lv.flip) return [...answer].reverse();
    const seq = [...answer];
    const k = pickRandom(lv.changes);
    shuffle([...seq.keys()]).slice(0, k).forEach((p) => {
      seq[p] = pickRandom(pool.filter((n) => n.id !== seq[p].id));
    });
    return seq;
  }

  function updateStats() {
    $('listenScore').textContent = `${session.firstTry}/${session.rounds}`;
    $('listenStreak').textContent = session.streak;
  }

  function newRound() {
    scope.clear(round.advance);
    const lv = LISTEN_LEVELS[level];
    const pool = notesBetween(lv.from, lv.to);

    let answer;
    do { answer = Array.from({ length: lv.len }, () => pickRandom(pool)); }
    while (new Set(answer.map((n) => n.id)).size < 2);

    const key = (q) => q.map((n) => n.id).join();
    const sets = [answer];
    for (let t = 0; sets.length < 4 && t < 500; t++) {
      const d = makeDistractor(answer, pool, lv);
      if (!sets.some((q) => key(q) === key(d))) sets.push(d);
    }
    const options = shuffle(sets.map((seq, i) => ({ seq, ok: i === 0 })));
    round.seq = answer;
    round.options = options.map((o) => o.seq);
    round.correct = options.findIndex((o) => o.ok);
    round.done = false;
    round.missed = false;

    const grid = $('listenGrid');
    grid.innerHTML = '';
    round.options.forEach((seq, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'relative bg-white rounded-xl border-4 border-transparent shadow-md p-1 sm:p-2 transition active:scale-[0.98] cursor-pointer';
      b.setAttribute('aria-label', `Sheet ${i + 1}`);
      b.innerHTML = `<span class="absolute top-1.5 left-2.5 font-display font-bold text-slate-500 text-sm sm:text-base">${i + 1}</span>${renderNotationCard(seq)}`;
      b.addEventListener('click', () => pick(i));   // dies with the node when the grid is rebuilt
      grid.appendChild(b);
    });
    $('listenMsg').textContent = 'Listen, then tap the sheet that matches.';
    updateStats();
    playSeq(answer);
  }

  function pick(i) {
    if (round.done) return;
    const card = $('listenGrid').children[i];
    if (!card || card.disabled) return;

    if (i === round.correct) {
      round.done = true;
      session.rounds++;
      if (!round.missed) { session.firstTry++; session.streak++; }
      new Set(round.seq.map((n) => n.id)).forEach((id) => appStorage.recordNote(id, !round.missed));
      ctx.score.award(1);
      if (round.missed) ctx.score.miss(); else ctx.score.hit();

      card.classList.replace('border-transparent', 'border-emerald-500');
      card.classList.add('ring-4', 'ring-emerald-300');
      $('listenMsg').textContent = round.missed ? "That's the one!" : 'Correct! 🎉';
      updateStats();
      round.advance = scope.timeout(newRound, 1600);
    } else {
      round.missed = true;
      session.streak = 0;
      ctx.score.miss();
      card.disabled = true;
      card.classList.replace('border-transparent', 'border-red-500');
      card.classList.add('opacity-50', 'shake');
      $('listenMsg').textContent = 'Not quite. That sheet sounds like this. Tap Replay to hear the target again.';
      updateStats();
      playSeq(round.options[i]);
    }
  }

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = TEMPLATE;
    $ = (id) => root.querySelector(`#${id}`);

    const sel = $('listenLevel');
    LISTEN_LEVELS.forEach((l, i) => sel.add(new Option(l.name, i)));
    const saved = prefs.get('level', 0);
    level = Number.isInteger(saved) && LISTEN_LEVELS[saved] ? saved : 0;
    sel.value = level;

    scope.listen(sel, 'change', (e) => {
      level = +e.target.value; prefs.set('level', level);
      e.target.blur(); newRound();
    });
    scope.listen($('listenPlayBtn'), 'click', () => playSeq(round.seq));
    scope.listen($('listenNextBtn'), 'click', newRound);

    newRound();
  }

  function unmount() {
    if (handle) handle.cancel();
    if (root) root.innerHTML = '';
    handle = null;
  }

  function onKeyDown(e) {
    const onButton = e.target.tagName === 'BUTTON';
    if (e.key === 'Escape') { e.preventDefault(); ctx.goBack(); }
    else if (/^[1-4]$/.test(e.key)) pick(+e.key - 1);
    else if (e.key === 'r' || e.key === 'R') playSeq(round.seq);
    else if (e.key === 'n' || e.key === 'N' || e.code === 'ArrowRight') newRound();
    else if (!onButton && e.code === 'Space') { e.preventDefault(); playSeq(round.seq); }
    else if (!onButton && e.code === 'Enter') { e.preventDefault(); newRound(); }
  }

  return { mount, unmount, onKeyDown };
}
