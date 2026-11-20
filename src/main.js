/**
 * App shell: shared header (MIDI status, drill timer, ★ score, 🔥 streak, game switcher),
 * hash router, MIDI→piano bridge, keyboard-shortcut delegation and game lifecycle.
 *
 * Lifecycle guarantee: switching games always runs  game.unmount() → scope.dispose() →
 * audio.stopAll()  before the next game mounts, so timers, audio sequences, mic recognition,
 * MIDI subscriptions and key handlers from an inactive game can never keep running.
 */
import { GAMES, DEFAULT_GAME_ID, getGame } from './games/registry.js';
import * as audio from './core/audio.js';
import { midi } from './core/midi.js';
import { midiToFreq } from './core/notes.js';
import { createScope } from './core/scope.js';
import { storage } from './core/storage.js';
import { showToast } from './ui/toast.js';

const $ = (id) => document.getElementById(id);
const PILL = 'inline-flex items-center gap-1 bg-[#3d2a1f] hover:bg-[#4e3729] border border-[#5e4332] rounded-full px-2.5 py-1 text-xs font-medium text-[#f5ecd8] transition cursor-pointer';

// ==========================================
// Score & streak (shared across games)
// ==========================================
const session = { score: 0, streak: 0 };

function renderScore() {
  $('scoreDisplay').textContent = session.score;
  $('streakDisplay').textContent = session.streak;
}

const score = {
  get total() { return session.score; },
  award(points = 1) { session.score += points; storage.addScore(points); renderScore(); },
  hit() { session.streak += 1; storage.noteBestStreak(session.streak); renderScore(); },
  miss() { if (session.streak) { session.streak = 0; renderScore(); } },
};

// ==========================================
// 2-minute drill timer (keeps running while you switch games)
// ==========================================
const DRILL_SECONDS = 120;
const drill = { left: DRILL_SECONDS, running: false, interval: null, startScore: 0 };

function toggleDrillTimer() {
  const display = $('timerDisplay');
  if (drill.running) {
    clearInterval(drill.interval);
    Object.assign(drill, { running: false, left: DRILL_SECONDS });
    display.textContent = '2:00';
    showToast('2-minute drill timer reset.');
    return;
  }
  Object.assign(drill, { running: true, left: DRILL_SECONDS, startScore: session.score });
  display.textContent = '2:00';
  showToast('2-minute daily drill started! Go!');

  drill.interval = setInterval(() => {
    drill.left -= 1;
    display.textContent = `${Math.floor(drill.left / 60)}:${String(drill.left % 60).padStart(2, '0')}`;
    if (drill.left <= 0) {
      clearInterval(drill.interval);
      drill.running = false;
      display.textContent = 'Done!';
      const done = session.score - drill.startScore;
      showToast(`Time's up! You completed ${done} card${done === 1 ? '' : 's'}!`);
    }
  }, 1000);
}

// ==========================================
// MIDI status pill + MIDI → piano sound bridge
// ==========================================
function renderMidiStatus(s) {
  const dot = $('midiStatusDot');
  const label = $('midiStatusLabel');
  const btn = $('midiConnectBtn');
  if (!s.supported) {
    dot.className = 'w-2 h-2 rounded-full bg-[#8c6d56] shrink-0';
    label.textContent = 'MIDI Unavailable';
    btn.classList.add('opacity-60');
  } else if (s.connected) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0';
    label.textContent = s.deviceName || 'MIDI Connected';
    btn.classList.remove('border-[#5e4332]', 'text-[#f5ecd8]', 'bg-[#3d2a1f]');
    btn.classList.add('border-emerald-400/50', 'text-emerald-200', 'bg-emerald-950/80');
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-amber-300/80 shrink-0';
    label.textContent = s.hasAccess ? 'No MIDI Device' : 'Connect MIDI';
    btn.classList.remove('border-emerald-400/50', 'text-emerald-200', 'bg-emerald-950/80');
    btn.classList.add('border-[#5e4332]', 'text-[#f5ecd8]', 'bg-[#3d2a1f]');
  }
}

async function connectMidiFromButton() {
  const { reason } = await midi.connect();
  const msg = {
    unsupported: 'Web MIDI is not supported on this browser (works in Chrome/Edge on Desktop & Android).',
    denied: 'MIDI access denied. Check browser permissions for MIDI devices.',
    'no-device': 'No MIDI keyboard detected yet—plug in your Yamaha P-125 via USB and it will auto-connect!',
  }[reason];
  if (msg) showToast(msg);
}

function initMidiShell() {
  midi.on('status', (s) => {
    renderMidiStatus(s);
    if (s.event === 'connected') showToast(`🎹 Connected: ${s.deviceName}! Play the notes on your piano.`);
    else if (s.event === 'disconnected') showToast('MIDI keyboard disconnected.');
  });
  // The shell owns piano sound for live MIDI so every game gets it (respects mute).
  midi.on('noteon', ({ note, velocity }) => audio.playTone(midiToFreq(note), { duration: 4, velocity, hold: true }));
  midi.on('noteoff', ({ note }) => audio.noteOff(note));
  midi.on('sustain', ({ down }) => audio.setSustain(down));

  $('midiConnectBtn').addEventListener('click', connectMidiFromButton);
  midi.autoConnect();   // only if permission was already granted → no prompt on load
}

// ==========================================
// Game lifecycle + router
// ==========================================
let active = null;        // { id, instance, scope, headerNodes }
let previousId = null;
let loadToken = 0;

function teardown() {
  if (!active) return;
  const a = active;
  active = null;
  try { if (a.instance.unmount) a.instance.unmount(); } catch (err) { console.error('[unmount]', err); }
  a.scope.dispose();
  audio.stopAll();
  a.headerNodes.forEach((n) => n.remove());
  $('gameRoot').replaceChildren();
}

function makeContext(def, scope, headerNodes) {
  return {
    id: def.id,
    scope,
    score,
    storage: storage.namespace(def.id),
    navigate: go,
    goBack() { if (active && active.id !== DEFAULT_GAME_ID) go(previousId && previousId !== active.id ? previousId : DEFAULT_GAME_ID); },
    addHeaderButton({ icon = '', label = '', title = '', onClick } = {}) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = PILL;
      btn.title = title;
      btn.innerHTML = `${icon}${label ? `<span class="hidden sm:inline">${label}</span>` : ''}`;
      if (onClick) scope.listen(btn, 'click', onClick);
      $('headerActions').appendChild(btn);
      headerNodes.push(btn);
      return btn;
    },
  };
}

async function show(id) {
  if (active && active.id === id) return;
  const def = getGame(id);
  if (!def) return;

  const outgoing = active && active.id;
  teardown();
  if (outgoing) previousId = outgoing;
  const token = ++loadToken;
  markNav(id);

  let mod;
  try {
    mod = await def.load();
  } catch (err) {
    console.error('[load]', err);
    showToast('Could not load that game. Check your connection and try again.');
    return;
  }
  if (token !== loadToken) return;   // user already navigated elsewhere while loading

  const scope = createScope();
  const headerNodes = [];
  try {
    const instance = mod.default(makeContext(def, scope, headerNodes));
    active = { id, instance, scope, headerNodes };
    instance.mount($('gameRoot'));
    storage.set('lastGame', id);
    document.title = `${def.title} · NoteReader`;
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('[mount]', err);
    teardown();
    scope.dispose();
    showToast('Something went wrong starting that game.');
  }
}

function go(id) {
  if (location.hash === `#/${id}`) show(id);
  else location.hash = `#/${id}`;   // hashchange → route()
}

function route() {
  const fromHash = location.hash.replace(/^#\/?/, '');
  const saved = storage.get('lastGame');
  const id = [fromHash, saved].find(getGame) || DEFAULT_GAME_ID;
  if (fromHash !== id) history.replaceState(null, '', `#/${id}`);
  show(id);
}

// ==========================================
// Game switcher (header nav)
// ==========================================
function renderNav() {
  const nav = $('gameNav');
  nav.replaceChildren();
  GAMES.forEach((g) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'game-tab';
    b.dataset.game = g.id;
    b.title = g.title;
    b.innerHTML = `<span aria-hidden="true">${g.icon}</span><span></span>`;
    b.lastChild.textContent = g.shortTitle || g.title;
    b.addEventListener('click', () => go(g.id));
    nav.appendChild(b);
  });
}

function markNav(id) {
  $('gameNav').querySelectorAll('.game-tab').forEach((b) => {
    if (b.dataset.game === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// ==========================================
// Global input delegation
// ==========================================
function initGlobalInput() {
  // One keydown listener for the whole app; only the active game ever sees events.
  window.addEventListener('keydown', (e) => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const inField = ['SELECT', 'INPUT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable;
    if ((inField || e.repeat) && e.key !== 'Escape') return;
    if (active.instance.onKeyDown) active.instance.onKeyDown(e);
  });

  // Don't leave focus on mouse/touch-clicked buttons so Space/Enter shortcuts keep working.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });
}

// ==========================================
// Boot
// ==========================================
function boot() {
  audio.initAudio();
  audio.onStatus((text) => { const el = $('pianoStatus'); if (el) el.textContent = text; });

  renderNav();
  renderScore();
  $('drillTimerBtn').addEventListener('click', toggleDrillTimer);
  initMidiShell();
  initGlobalInput();

  window.addEventListener('hashchange', route);
  route();
}

boot();
