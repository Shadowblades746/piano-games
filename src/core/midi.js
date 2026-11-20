/**
 * Web MIDI manager. Auto-connects when permission was already granted,
 * handles hot-plugging, and re-emits messages as simple events any game can
 * subscribe to:
 *
 *   const off = midi.on('noteon',  ({ note, velocity, channel }) => …);
 *   midi.on('noteoff', ({ note, channel }) => …);
 *   midi.on('sustain', ({ down, value, channel }) => …);          // CC 64
 *   midi.on('status',  ({ supported, hasAccess, connected, deviceName, event }) => …);
 *                       // event: 'connected' | 'disconnected' | 'update'
 *
 * on() returns an unsubscribe function; hand it to scope.add() in a game.
 */
const listeners = {
  noteon: new Set(),
  noteoff: new Set(),
  sustain: new Set(),
  status: new Set(),
};

let access = null;
let connected = false;
let deviceName = '';

const supported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

function emit(type, payload) {
  listeners[type].forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(`[midi:${type}]`, err); }
  });
}

const snapshot = (event = 'update') => ({
  supported: supported(), hasAccess: !!access, connected, deviceName, event,
});

function handleMessage(e) {
  const [status, data1, data2] = e.data;
  const command = status & 0xf0;
  const channel = status & 0x0f;
  if (command === 0x90 && data2 > 0) emit('noteon', { note: data1, velocity: data2, channel });
  else if (command === 0x80 || (command === 0x90 && data2 === 0)) emit('noteoff', { note: data1, channel });
  else if (command === 0xb0 && data1 === 64) emit('sustain', { down: data2 >= 64, value: data2, channel });
}

function bindInputs() {
  if (!access) return;
  const inputs = Array.from(access.inputs.values());
  const active = inputs.filter((i) => i.state === 'connected');
  inputs.forEach((i) => { i.onmidimessage = i.state === 'connected' ? handleMessage : null; });

  const was = connected;
  connected = active.length > 0;
  deviceName = connected ? (active[0].name || 'USB MIDI Piano') : '';

  let event = 'update';
  if (!was && connected) event = 'connected';
  else if (was && !connected) event = 'disconnected';
  emit('status', snapshot(event));
}

export const midi = {
  get supported() { return supported(); },
  get connected() { return connected; },
  get deviceName() { return deviceName; },
  get hasAccess() { return !!access; },

  on(type, fn) {
    if (!listeners[type]) throw new Error(`Unknown MIDI event: ${type}`);
    listeners[type].add(fn);
    return () => listeners[type].delete(fn);
  },

  /**
   * Request access and bind inputs.
   * Resolves { ok, reason } where reason ∈ 'ok' | 'unsupported' | 'denied' | 'no-device'.
   */
  async connect() {
    if (!supported()) { emit('status', snapshot()); return { ok: false, reason: 'unsupported' }; }
    try {
      if (!access) {
        access = await navigator.requestMIDIAccess({ sysex: false });
        access.onstatechange = bindInputs;
      }
      bindInputs();
      return connected ? { ok: true, reason: 'ok' } : { ok: false, reason: 'no-device' };
    } catch (err) {
      emit('status', snapshot());
      return { ok: false, reason: 'denied' };
    }
  },

  /** Connect silently only if the user already granted MIDI permission (no prompt on load). */
  async autoConnect() {
    emit('status', snapshot());
    if (!supported() || !navigator.permissions || !navigator.permissions.query) return;
    try {
      const p = await navigator.permissions.query({ name: 'midi' });
      if (p.state === 'granted') await midi.connect();
    } catch (e) { /* permission query unsupported */ }
  },
};
