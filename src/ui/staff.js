/**
 * Reusable SVG staff renderers.
 *
 *  createCounterStaff(svgEl)  – big interactive staff with glossy counters
 *                               (blue → green when solved, gold while playing, red on a miss).
 *                               Supports treble, bass and grand staff.
 *  renderNotationCard(notes)  – compact standard-notation card (noteheads + stems)
 *                               returned as an SVG string, for ear-training cards.
 */
import { CLEF_FONT, ledgerSteps, staffStep } from '../core/notes.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}, parent = null) {
  const el = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  if (parent) parent.appendChild(el);
  return el;
}

let instanceCount = 0;

/**
 * @param {SVGSVGElement} svg
 * @returns {{ render, setState, refresh, clear }}
 *
 * render({ clef, notes, mobile, isDone(idx), hint, onNoteClick(idx, note) })
 *   clef: 'treble' | 'bass' | 'grand'
 *   hint: when set, only the empty staff + this message is drawn (piano-only mode)
 */
export function createCounterStaff(svg) {
  const uid = `cs${++instanceCount}`;
  const COUNTER = {
    blue:  { fill: `url(#${uid}-blue)`,  stroke: '#93c5fd', r: 16.5 },
    green: { fill: `url(#${uid}-green)`, stroke: '#a7f3d0', r: 16.5 },
    gold:  { fill: `url(#${uid}-gold)`,  stroke: null,      r: 19.5 },
    red:   { fill: '#ef4444',            stroke: '#fecaca', r: 16.5 },
  };
  let circles = [];
  let isDone = () => false;

  function applyState(idx, state) {
    const circle = circles[idx];
    const s = COUNTER[state];
    if (!circle || !s) return;
    circle.setAttribute('fill', s.fill);
    if (s.stroke) circle.setAttribute('stroke', s.stroke);
    circle.setAttribute('r', s.r);
  }

  function drawFiveLines(bottomY, W, spacing) {
    for (let i = 0; i < 5; i++) {
      const y = bottomY - i * spacing;
      svgEl('line', { x1: 35, x2: W - 30, y1: y, y2: y, stroke: '#334155', 'stroke-width': 2 }, svg);
    }
  }

  function clefGlyph(glyph, x, y, size) {
    const t = svgEl('text', { x, y, 'font-size': size, 'font-family': CLEF_FONT, fill: '#2563EB' }, svg);
    t.textContent = glyph;
  }

  function render({ clef = 'treble', notes = [], mobile = false, isDone: done, hint = null, onNoteClick } = {}) {
    svg.innerHTML = '';
    circles = [];
    if (done) isDone = done;

    const W = mobile ? 520 : 820;
    const isGrand = clef === 'grand';
    const spacing = 21;
    const trebleBottomY = isGrand ? 125 : 155;
    const bassBottomY = 275;

    svg.setAttribute('viewBox', `0 0 ${W} ${isGrand ? 330 : 220}`);
    svg.setAttribute('class', isGrand
      ? 'w-full h-auto max-h-60 sm:max-h-64 overflow-visible'
      : 'w-full h-auto max-h-40 sm:max-h-52 overflow-visible');

    // --- staff lines, system bar, clef(s) ---
    if (isGrand) {
      drawFiveLines(trebleBottomY, W, spacing);
      drawFiveLines(bassBottomY, W, spacing);
      svgEl('line', { x1: 35, x2: 35, y1: trebleBottomY - 4 * spacing, y2: bassBottomY, stroke: '#334155', 'stroke-width': 3 }, svg);
      clefGlyph('𝄞', 46, trebleBottomY + 8, 145);
      clefGlyph('𝄢', 50, bassBottomY - 12, 110);
    } else {
      drawFiveLines(trebleBottomY, W, spacing);
      svgEl('line', { x1: 35, x2: 35, y1: trebleBottomY - 4 * spacing, y2: trebleBottomY, stroke: '#334155', 'stroke-width': 2.5 }, svg);
      if (clef === 'treble') clefGlyph('𝄞', 48, trebleBottomY + 8, 148);
      else clefGlyph('𝄢', 52, trebleBottomY - 14, 114);
    }

    if (hint) {
      const t = svgEl('text', {
        x: W / 2, y: isGrand ? 170 : 118, 'text-anchor': 'middle',
        fill: '#64748b', 'font-size': 19, 'font-weight': 600,
      }, svg);
      t.textContent = hint;
      return;
    }

    // --- gradients / shadow ---
    svgEl('defs', {}, svg).innerHTML = `
      <radialGradient id="${uid}-blue" cx="32%" cy="28%" r="65%">
        <stop offset="0%" stop-color="#5da2ff"/><stop offset="56%" stop-color="#1d63dc"/><stop offset="100%" stop-color="#13449e"/>
      </radialGradient>
      <radialGradient id="${uid}-green" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stop-color="#34D399"/><stop offset="60%" stop-color="#10B981"/><stop offset="100%" stop-color="#059669"/>
      </radialGradient>
      <radialGradient id="${uid}-gold" cx="35%" cy="30%" r="65%">
        <stop offset="0%" stop-color="#fef08a"/><stop offset="60%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/>
      </radialGradient>
      <filter id="${uid}-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#1c1108" flood-opacity="0.4"/>
      </filter>`;

    // --- counters ---
    const count = notes.length;
    const noteSpan = mobile ? 290 : 480;
    const maxGap = mobile ? 80 : 115;
    const startX = count === 1 ? (mobile ? 330 : 390) : (mobile ? 185 : 215);
    const spacingX = count === 1 ? 0 : Math.min(maxGap, noteSpan / (count - 1));

    notes.forEach((note, idx) => {
      const cx = startX + idx * spacingX;
      const useBass = clef === 'bass' || (isGrand && note.octave < 4);
      const bottomY = (useBass && isGrand) ? bassBottomY : trebleBottomY;
      const step = staffStep(note, useBass ? 'bass' : 'treble');
      const cy = bottomY - step * (spacing / 2);

      ledgerSteps(step).forEach((ls) => {
        const ly = bottomY - ls * (spacing / 2);
        svgEl('line', { x1: cx - 28, x2: cx + 28, y1: ly, y2: ly, stroke: '#1e293b', 'stroke-width': 2.5 }, svg);
      });

      const g = svgEl('g', { class: 'staff-dot-group', 'data-seq-idx': idx }, svg);
      g.style.cursor = 'pointer';
      if (onNoteClick) g.addEventListener('click', () => onNoteClick(idx, note));

      const done = isDone(idx);
      const circle = svgEl('circle', {
        cx, cy, r: 16.5, 'stroke-width': 2, filter: `url(#${uid}-shadow)`,
        fill: COUNTER[done ? 'green' : 'blue'].fill,
        stroke: COUNTER[done ? 'green' : 'blue'].stroke,
      }, g);
      circles[idx] = circle;
      svgEl('ellipse', { cx: cx - 4, cy: cy - 6, rx: 7, ry: 3.5, fill: 'rgba(255,255,255,0.35)' }, g);

      if (done) {
        const label = svgEl('text', {
          x: cx, y: cy + 6, 'text-anchor': 'middle', fill: '#ffffff',
          'font-family': 'Fredoka, sans-serif', 'font-size': 18, 'font-weight': 700,
        }, g);
        label.textContent = note.letter;
      }
    });
  }

  return {
    render,
    /** state: 'blue' | 'green' | 'gold' | 'red' */
    setState: applyState,
    /** Restore a counter to blue/green based on isDone(). */
    refresh: (idx) => applyState(idx, isDone(idx) ? 'green' : 'blue'),
    clear() { svg.innerHTML = ''; circles = []; },
  };
}

/**
 * Compact standard-notation card (clef + staff + noteheads with stems) as an SVG string.
 * @param {Array} notes  items from ALL_NOTES
 * @param {{clef?: 'treble'|'bass'}} opts
 */
export function renderNotationCard(notes, { clef = 'treble' } = {}) {
  const bottom = 60;
  let h = '<svg viewBox="0 0 200 100" class="w-full h-auto block" aria-hidden="true">';
  for (let i = 0; i < 5; i++) {
    const y = bottom - i * 8;
    h += `<line x1="6" x2="194" y1="${y}" y2="${y}" stroke="#334155" stroke-width="1"/>`;
  }
  h += clef === 'bass'
    ? `<text x="20" y="${bottom - 5}" font-size="43" font-family="${CLEF_FONT}" fill="#0f172a">𝄢</text>`
    : `<text x="18" y="${bottom + 3}" font-size="56" font-family="${CLEF_FONT}" fill="#0f172a">𝄞</text>`;

  const n = notes.length;
  notes.forEach((note, i) => {
    const step = staffStep(note, clef);
    const cx = n === 1 ? 120 : 64 + i * (124 / (n - 1));
    const cy = bottom - step * 4;
    ledgerSteps(step).forEach((k) => {
      const y = bottom - k * 4;
      h += `<line x1="${cx - 9}" x2="${cx + 9}" y1="${y}" y2="${y}" stroke="#334155" stroke-width="1.2"/>`;
    });
    const down = step >= 4;
    const sx = down ? cx - 5 : cx + 5;
    h += `<line x1="${sx}" x2="${sx}" y1="${cy}" y2="${down ? cy + 24 : cy - 24}" stroke="#0f172a" stroke-width="1.4"/>`;
    h += `<ellipse cx="${cx}" cy="${cy}" rx="5.6" ry="4" transform="rotate(-20 ${cx} ${cy})" fill="#0f172a"/>`;
  });
  return h + '</svg>';
}
