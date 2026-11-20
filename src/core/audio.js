/**
 * Audio engine.
 *  - Salamander Grand Piano samples (Alexander Holm, CC BY 3.0) with persistent
 *    CacheStorage, so return visits load instantly and work offline.
 *  - Velocity-sensitive playback, Note-Off release, Sustain Pedal (CC 64).
 *  - Automatic fallback to a built-in Web Audio synth if samples can't load.
 *  - iOS/Android touch unlock, mute toggle, and a cancellable sequence helper.
 *
 * The attribution required by CC BY 3.0 lives in the footer of index.html.
 */
import { freqToMidi } from './notes.js';
import { storage } from './storage.js';

// ---------- Sample sources (tried in order) ----------
const SAMPLE_BASES = [
  // './assets/salamander/',  // ← self-hosted copy: uncomment after adding the files (see README)
  'https://tonejs.github.io/audio/salamander/',
  'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/salamander/',
];
const SAMPLE_NAMES = ['A1','C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6','Ds6','Fs6','A6','C7'];
const PC = { C: 0, Ds: 3, Fs: 6, A: 9 };
const sampleMidi = (n) => (parseInt(n.slice(-1), 10) + 1) * 12 + PC[n.slice(0, -1)];
const CACHE_NAME = 'notereader-salamander-v1';

// ---------- Module state ----------
let ctx = null;
let primed = false;
let started = false;
let bus = null;
let sustainDown = false;
let fetched = 0;
let failed = 0;
const raw = {};                      // undecoded ArrayBuffers waiting for an AudioContext
const bufs = [];                     // decoded { midi, buffer }
const activeVoices = new Map();      // midi -> voice held by a key
const sustainedVoices = new Set();   // voices kept alive by the pedal
const liveSequences = new Set();

// ---------- Mute ----------
let muted = !!storage.get('muted', false);
const muteListeners = new Set();
export const isMuted = () => muted;
export function setMuted(value) {
  muted = !!value;
  storage.set('muted', muted);
  muteListeners.forEach((fn) => fn(muted));
}
export const toggleMute = () => { setMuted(!muted); return muted; };
export function onMuteChange(fn) {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

// ---------- Sample status (footer text) ----------
const statusListeners = new Set();
export function getStatusText() {
  const total = SAMPLE_NAMES.length;
  if (bufs.length === total) return `Piano sound: Salamander Grand ✓ (${bufs.length}/${total} cached)`;
  if (bufs.length > 0) return `Piano sound: Salamander Grand (${bufs.length}/${total} samples)`;
  if (fetched === 0 && failed >= total) return 'Piano sound: built-in synth (samples could not load)';
  if (fetched > 0) return 'Piano sound: samples cached, tap any key to enable';
  return 'Piano sound: loading Salamander Grand…';
}
export function onStatus(fn) {
  statusListeners.add(fn);
  fn(getStatusText());
  return () => statusListeners.delete(fn);
}
const emitStatus = () => statusListeners.forEach((fn) => fn(getStatusText()));

// ---------- AudioContext + mobile unlock ----------
export const getAudioContext = () => ctx;

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (!primed) {
      // A silent one-sample buffer is what actually unlocks iOS Safari.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      primed = true;
    }
    tryDecode();
  } catch (e) { /* audio is best-effort */ }
}

function tryDecode() {
  if (!ctx) return;
  Object.keys(raw).forEach((name) => {
    const ab = raw[name];
    delete raw[name];
    ctx.decodeAudioData(
      ab,
      (buffer) => { bufs.push({ midi: sampleMidi(name), buffer }); emitStatus(); },
      () => { failed++; emitStatus(); },
    );
  });
}

async function fetchWithCache(name) {
  const cache = ('caches' in window) ? await caches.open(CACHE_NAME).catch(() => null) : null;
  for (const base of SAMPLE_BASES) {
    const url = `${base}${name}.mp3`;
    try {
      if (cache) {
        const hit = await cache.match(url);
        if (hit) return await hit.arrayBuffer();
      }
      const res = await fetch(url);
      if (!res.ok) continue;
      if (cache) cache.put(url, res.clone()).catch(() => {});
      return await res.arrayBuffer();
    } catch (e) { /* try next source */ }
  }
  throw new Error(`Failed to load ${name}`);
}

/** Call once at startup: attaches gesture unlockers and starts sample loading. */
export function initAudio() {
  if (started) return;
  started = true;
  // iOS only unlocks on touchend/click, so listen for all of them (app-lifetime listeners).
  ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, unlock, { passive: true });
  });
  SAMPLE_NAMES.forEach((name) => {
    fetchWithCache(name)
      .then((ab) => { raw[name] = ab; fetched++; emitStatus(); tryDecode(); })
      .catch(() => { failed++; emitStatus(); });
  });
  emitStatus();
}

// ---------- Sampled playback ----------
function getBus() {
  if (bus && bus.ctx === ctx) return bus;
  const input = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 0.88;
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 6500;
  const conv = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 1.9);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  }
  conv.buffer = ir;
  input.connect(dry); dry.connect(ctx.destination);
  input.connect(conv); conv.connect(tone); tone.connect(wet); wet.connect(ctx.destination);
  bus = { ctx, input };
  return bus;
}

function releaseVoice(voice, releaseTime = 0.42) {
  if (!voice || voice.released || !ctx) return;
  voice.released = true;
  const now = ctx.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0005), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseTime);
    voice.src.stop(now + releaseTime + 0.05);
  } catch (e) { /* already stopped */ }
}

function playSampled(freq, duration, delay, velocity, hold) {
  if (!ctx || !bufs.length) return false;
  const midi = freqToMidi(freq);
  const midiRound = Math.round(midi);

  let best = null;
  for (const b of bufs) {
    if (!best || Math.abs(b.midi - midi) < Math.abs(best.midi - midi)) best = b;
  }
  if (!best || Math.abs(best.midi - midi) > 3) return false;

  const t = ctx.currentTime + (delay || 0);
  const src = ctx.createBufferSource();
  src.buffer = best.buffer;
  src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);

  // Velocity-sensitive volume and an opened-up brightness filter.
  const velNorm = Math.max(0.05, Math.min(1, velocity / 127));
  const peakGain = 0.18 + Math.pow(velNorm, 1.35) * 0.82;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3500 + velNorm * 11500, t);

  const g = ctx.createGain();
  g.gain.setValueAtTime(peakGain, t);

  src.connect(filter);
  filter.connect(g);
  g.connect(getBus().input);
  src.start(t);

  const voice = { src, gain: g, released: false };
  if (hold) {
    const prev = activeVoices.get(midiRound);
    if (prev) releaseVoice(prev, 0.12);
    activeVoices.set(midiRound, voice);
    sustainedVoices.delete(voice);
  } else {
    const len = Math.max(duration || 0.65, 0.55) * 1.5;
    g.gain.setValueAtTime(peakGain, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.5);
    src.stop(t + len + 0.55);
  }
  return true;
}

// ---------- Synth fallback ----------
function playSynth(freq, duration, delay) {
  const start = ctx.currentTime + delay;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, start);
  master.gain.linearRampToValueAtTime(0.45, start + 0.015);
  master.gain.exponentialRampToValueAtTime(0.15, start + 0.25);
  master.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  master.connect(ctx.destination);

  [['triangle', 1, 0.55], ['sine', 2, 0.18], ['sine', 3, 0.05]].forEach(([type, mult, level]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, start);
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
}

// ---------- Public API ----------
/**
 * Play one note. opts: { duration, delay, ignoreMute, velocity (1–127), hold }.
 * hold = keep sounding until noteOff(midi) (live MIDI keys).
 */
export function playTone(freq, opts = {}) {
  const { duration = 0.65, delay = 0, ignoreMute = false, velocity = 112, hold = false } = opts;
  if (muted && !ignoreMute) return;
  try {
    unlock();
    if (!ctx) return;
    if (playSampled(freq, duration, delay, velocity, hold)) return;
    playSynth(freq, duration, delay);
  } catch (err) {
    console.warn('Audio playback skipped:', err);
  }
}

/** Release a held MIDI note (honours the sustain pedal). */
export function noteOff(midiNumber) {
  const voice = activeVoices.get(midiNumber);
  if (!voice) return;
  activeVoices.delete(midiNumber);
  if (sustainDown) sustainedVoices.add(voice);
  else releaseVoice(voice, 0.42);
}

/** Sustain pedal (CC 64). */
export function setSustain(isDown) {
  sustainDown = !!isDown;
  if (!sustainDown) {
    sustainedVoices.forEach((v) => releaseVoice(v, 0.45));
    sustainedVoices.clear();
  }
}

/** Short "nope" thud used for wrong MIDI answers. Respects mute. */
export function playThud() {
  if (muted) return;
  try {
    unlock();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.16);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) { /* ignore */ }
}

/**
 * Play notes one after another.
 *   opts: { gap (ms between starts), duration (s), noteLength (ms the step stays "lit"),
 *           ignoreMute, onStep(i, note), onStepEnd(i, note) }
 * Returns { cancel() }. cancel() stops pending notes and fires onStepEnd for any
 * step still lit, so UI highlights are always cleaned up.
 */
export function playSequence(notes, opts = {}) {
  const { gap = 420, duration = 0.65, noteLength = 350, ignoreMute = false, onStep, onStepEnd } = opts;
  const timers = new Set();
  const lit = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };

  const handle = {
    cancel() {
      timers.forEach(clearTimeout);
      timers.clear();
      [...lit].forEach((i) => onStepEnd && onStepEnd(i, notes[i]));
      lit.clear();
      liveSequences.delete(handle);
    },
  };

  notes.forEach((note, i) => {
    const start = () => {
      playTone(note.freq, { duration, ignoreMute });
      lit.add(i);
      if (onStep) onStep(i, note);
    };
    if (i === 0) start(); else later(start, i * gap);
    later(() => { if (lit.delete(i) && onStepEnd) onStepEnd(i, note); }, i * gap + noteLength);
  });
  later(() => liveSequences.delete(handle), (notes.length - 1) * gap + noteLength + 1);

  liveSequences.add(handle);
  return handle;
}

/** Cancel every running sequence and release all held notes (used on game switch). */
export function stopAll() {
  [...liveSequences].forEach((h) => h.cancel());
  activeVoices.forEach((v) => releaseVoice(v, 0.12));
  activeVoices.clear();
  sustainedVoices.forEach((v) => releaseVoice(v, 0.12));
  sustainedVoices.clear();
}
