/**
 * Web Speech "say the note letter" listener (A–G).
 *
 *   const listener = createLetterListener({
 *     vocabulary: 'letters' (default) | 'solfege',
 *     onLetter: (token) => …,        // 'A'…'G'  or  'do' 're' 'mi' 'fa' 'sol' 'la' 'ti'
 *     onStart, onStop,               // update your mic button
 *     onError: (code) => …,          // fatal errors only (permission, network…); listener has stopped
 *   });
 *   listener.start();  // → { ok, reason }   reason: 'ok' | 'unsupported' | 'failed'
 *   listener.stop();
 *   listener.destroy();              // always call from unmount()
 */
const SPOKEN_MAP = {
  a: 'A', ay: 'A', eh: 'A', hey: 'A', eight: 'A',
  b: 'B', be: 'B', bee: 'B', beat: 'B',
  c: 'C', see: 'C', sea: 'C', si: 'C',
  d: 'D', dee: 'D', the: 'D', de: 'D',
  e: 'E', ee: 'E', he: 'E',
  f: 'F', eff: 'F', ef: 'F', if: 'F',
  g: 'G', gee: 'G', ji: 'G', jeep: 'G',
};
const SOLFEGE_MAP = {
  do: 'do', doe: 'do', dough: 'do', doh: 'do', toe: 'do',
  re: 're', ray: 're', rey: 're', reh: 're',
  mi: 'mi', me: 'mi', mee: 'mi', mea: 'mi',
  fa: 'fa', fah: 'fa', far: 'fa', fuh: 'fa',
  sol: 'sol', so: 'sol', soul: 'sol', sew: 'sol', sole: 'sol', soh: 'sol',
  la: 'la', lah: 'la', laa: 'la',
  ti: 'ti', tea: 'ti', te: 'ti', tee: 'ti', si: 'ti',
};
const FATAL_ERRORS = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'];

export const isSpeechSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function createLetterListener({ lang = 'en-US', vocabulary = 'letters', onLetter, onStart, onStop, onError } = {}) {
  const solfege = vocabulary === 'solfege';
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  let processed = 0;

  function build() {
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;

    r.onstart = () => {
      if (!listening) { try { r.stop(); } catch (e) { /* ignore */ } return; }
      processed = 0;
      if (onStart) onStart();
    };

    r.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript.trim().toLowerCase();
      // "cab" → c, a, b  (runs of A–G letters are split into single letters)
      const words = transcript.replace(/[^a-z\s]/g, '').split(/\s+/);
      const tokens = solfege
        ? words
        : words.flatMap((w) => (w.length > 1 && /^[a-g]+$/.test(w) ? w.split('') : [w]));

      for (let i = processed; i < tokens.length; i++) {
        const mapped = (solfege ? SOLFEGE_MAP : SPOKEN_MAP)[tokens[i]];
        if (!mapped) continue;
        if (onLetter) onLetter(mapped);
        if (!result.isFinal) processed = i + 1;
      }
      if (result.isFinal) processed = 0;
    };

    r.onerror = (e) => {
      if (FATAL_ERRORS.includes(e.error)) {
        api.stop();
        if (onError) onError(e.error);
      }
    };

    // Chrome ends continuous sessions on its own; restart while we still want to listen.
    r.onend = () => {
      if (!listening) return;
      try { r.start(); } catch (err) { api.stop(); }
    };
    return r;
  }

  const api = {
    get supported() { return !!Ctor; },
    get listening() { return listening; },

    start() {
      if (!Ctor) return { ok: false, reason: 'unsupported' };
      if (listening) return { ok: true, reason: 'ok' };
      try {
        if (!rec) rec = build();
        listening = true;
        rec.start();
        return { ok: true, reason: 'ok' };
      } catch (err) {
        listening = false;
        console.warn(err);
        return { ok: false, reason: 'failed' };
      }
    },

    stop() {
      const was = listening;
      listening = false;
      if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
      if (was && onStop) onStop();
    },

    destroy() {
      listening = false;
      if (rec) {
        rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
        try { rec.abort(); } catch (e) { /* ignore */ }
        rec = null;
      }
    },
  };
  return api;
}
