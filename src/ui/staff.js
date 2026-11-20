/**
 * NoteReader — SVG Musical Staff Renderer
 * Handles rendering treble, bass, and grand staves, ledger lines,
 * Hoffman-style 3D magnetic counters, and standard sheet music notes with stems.
 */

import { CLEF_FONT, noteDiatonic } from '../core/notes.js';

/**
 * Renders the Hoffman Academy style interactive SVG staff for flashcard challenges.
 */
export function renderStaff(svg, {
    clef = 'treble',
    sequence = [],
    displayMode = 'both',
    isRevealed = false,
    completedCount = 0,
    onDotClick = null
} = {}) {
    if (!svg) return;
    svg.innerHTML = '';

    const isMobile = window.innerWidth < 640;
    const W = isMobile ? 520 : 820;
    const isGrand = clef === 'grand';

    svg.setAttribute('viewBox', `0 0 ${W} ${isGrand ? 330 : 220}`);
    svg.setAttribute('class', isGrand
        ? 'w-full h-auto max-h-60 sm:max-h-64 overflow-visible'
        : 'w-full h-auto max-h-40 sm:max-h-52 overflow-visible'
    );

    const lineSpacing = 21;
    const trebleBottomY = isGrand ? 125 : 155;
    const bassBottomY = 275;

    function drawFiveLines(bottomY) {
        for (let i = 0; i < 5; i++) {
            const y = bottomY - i * lineSpacing;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '35');
            line.setAttribute('x2', String(W - 30));
            line.setAttribute('y1', y);
            line.setAttribute('y2', y);
            line.setAttribute('stroke', '#334155');
            line.setAttribute('stroke-width', '2');
            svg.appendChild(line);
        }
    }

    if (isGrand) {
        drawFiveLines(trebleBottomY);
        drawFiveLines(bassBottomY);

        const leftBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leftBar.setAttribute('x1', '35');
        leftBar.setAttribute('x2', '35');
        leftBar.setAttribute('y1', trebleBottomY - 4 * lineSpacing);
        leftBar.setAttribute('y2', bassBottomY);
        leftBar.setAttribute('stroke', '#334155');
        leftBar.setAttribute('stroke-width', '3');
        svg.appendChild(leftBar);

        const trebleClef = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        trebleClef.setAttribute('x', '46');
        trebleClef.setAttribute('y', trebleBottomY + 8);
        trebleClef.setAttribute('font-size', '145');
        trebleClef.setAttribute('font-family', CLEF_FONT);
        trebleClef.setAttribute('fill', '#2563EB');
        trebleClef.textContent = '𝄞';
        svg.appendChild(trebleClef);

        const bassClef = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        bassClef.setAttribute('x', '50');
        bassClef.setAttribute('y', bassBottomY - 12);
        bassClef.setAttribute('font-size', '110');
        bassClef.setAttribute('font-family', CLEF_FONT);
        bassClef.setAttribute('fill', '#2563EB');
        bassClef.textContent = '𝄢';
        svg.appendChild(bassClef);
    } else {
        drawFiveLines(trebleBottomY);

        const leftBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        leftBar.setAttribute('x1', '35');
        leftBar.setAttribute('x2', '35');
        leftBar.setAttribute('y1', trebleBottomY - 4 * lineSpacing);
        leftBar.setAttribute('y2', trebleBottomY);
        leftBar.setAttribute('stroke', '#334155');
        leftBar.setAttribute('stroke-width', '2.5');
        svg.appendChild(leftBar);

        if (clef === 'treble') {
            const clefText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            clefText.setAttribute('x', '48');
            clefText.setAttribute('y', trebleBottomY + 8);
            clefText.setAttribute('font-size', '148');
            clefText.setAttribute('font-family', CLEF_FONT);
            clefText.setAttribute('fill', '#2563EB');
            clefText.textContent = '𝄞';
            svg.appendChild(clefText);
        } else {
            const clefText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            clefText.setAttribute('x', '52');
            clefText.setAttribute('y', trebleBottomY - 14);
            clefText.setAttribute('font-size', '114');
            clefText.setAttribute('font-family', CLEF_FONT);
            clefText.setAttribute('fill', '#2563EB');
            clefText.textContent = '𝄢';
            svg.appendChild(clefText);
        }
    }

    if (displayMode === 'piano' && !isRevealed) {
        const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hint.setAttribute('x', String(W / 2));
        hint.setAttribute('y', isGrand ? '170' : '118');
        hint.setAttribute('text-anchor', 'middle');
        hint.setAttribute('fill', '#64748b');
        hint.setAttribute('font-size', '19');
        hint.setAttribute('font-weight', '600');
        hint.textContent = 'Look at the blue dots on the piano keys above!';
        svg.appendChild(hint);
        return;
    }

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <radialGradient id="blueCounterGrad" cx="32%" cy="28%" r="65%">
            <stop offset="0%" stop-color="#5da2ff"/>
            <stop offset="56%" stop-color="#1d63dc"/>
            <stop offset="100%" stop-color="#13449e"/>
        </radialGradient>
        <radialGradient id="greenCounterGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stop-color="#34D399"/>
            <stop offset="60%" stop-color="#10B981"/>
            <stop offset="100%" stop-color="#059669"/>
        </radialGradient>
        <radialGradient id="goldCounterGrad" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stop-color="#fef08a"/>
            <stop offset="60%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
        </radialGradient>
        <filter id="dotShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#1c1108" flood-opacity="0.4"/>
        </filter>
    `;
    svg.appendChild(defs);

    const count = sequence.length;
    const noteSpan = isMobile ? 290 : 480;
    const maxGap = isMobile ? 80 : 115;
    const startX = count === 1 ? (isMobile ? 330 : 390) : (isMobile ? 185 : 215);
    const spacingX = count === 1 ? 0 : Math.min(maxGap, noteSpan / (count - 1));

    sequence.forEach((note, idx) => {
        const cx = startX + idx * spacingX;

        const useBass = clef === 'bass' || (isGrand && note.octave < 4);
        const activeBottomY = (useBass && isGrand) ? bassBottomY : trebleBottomY;
        const step = noteDiatonic(note) - (useBass ? 18 : 30);
        const cy = activeBottomY - step * (lineSpacing / 2);

        const ledgerSteps = [];
        if (step < 0) for (let ls = -2; ls >= step; ls -= 2) ledgerSteps.push(ls);
        if (step > 8) for (let ls = 10; ls <= step; ls += 2) ledgerSteps.push(ls);
        ledgerSteps.forEach(ls => {
            const ly = activeBottomY - ls * (lineSpacing / 2);
            const ledger = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            ledger.setAttribute('x1', cx - 28);
            ledger.setAttribute('x2', cx + 28);
            ledger.setAttribute('y1', ly);
            ledger.setAttribute('y2', ly);
            ledger.setAttribute('stroke', '#1e293b');
            ledger.setAttribute('stroke-width', '2.5');
            svg.appendChild(ledger);
        });

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'staff-dot-group transition-transform duration-200');
        g.dataset.seqIdx = idx;
        g.style.cursor = 'pointer';

        if (onDotClick) {
            g.addEventListener('click', () => onDotClick(note, idx));
        }

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const isStepCompleted = isRevealed || idx < completedCount;
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', '16.5');
        circle.setAttribute('fill', isStepCompleted ? 'url(#greenCounterGrad)' : 'url(#blueCounterGrad)');
        circle.setAttribute('stroke', isStepCompleted ? '#a7f3d0' : '#93c5fd');
        circle.setAttribute('stroke-width', '2');
        circle.setAttribute('filter', 'url(#dotShadow)');
        g.appendChild(circle);

        const gloss = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        gloss.setAttribute('cx', cx - 4);
        gloss.setAttribute('cy', cy - 6);
        gloss.setAttribute('rx', '7');
        gloss.setAttribute('ry', '3.5');
        gloss.setAttribute('fill', 'rgba(255,255,255,0.35)');
        g.appendChild(gloss);

        if (isStepCompleted) {
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', cx);
            label.setAttribute('y', cy + 6);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('fill', '#ffffff');
            label.setAttribute('font-family', 'Fredoka, sans-serif');
            label.setAttribute('font-size', '18');
            label.setAttribute('font-weight', '700');
            label.textContent = note.letter;
            g.appendChild(label);
        }

        svg.appendChild(g);
    });
}

export function flashWrongStaffDot(svg, idx, isCompleted = false) {
    if (!svg) return;
    const group = svg.querySelector(`.staff-dot-group[data-seq-idx="${idx}"]`);
    if (!group) return;
    const circle = group.querySelector('circle');
    if (!circle) return;

    circle.setAttribute('fill', '#ef4444');
    circle.setAttribute('stroke', '#fecaca');

    setTimeout(() => {
        circle.setAttribute('fill', isCompleted ? 'url(#greenCounterGrad)' : 'url(#blueCounterGrad)');
        circle.setAttribute('stroke', isCompleted ? '#a7f3d0' : '#93c5fd');
    }, 340);
}

export function highlightStaffDot(svg, idx, isActive, isCompleted = false) {
    if (!svg) return;
    const group = svg.querySelector(`.staff-dot-group[data-seq-idx="${idx}"]`);
    if (!group) return;
    const circle = group.querySelector('circle');
    if (!circle) return;

    if (isActive) {
        circle.setAttribute('fill', 'url(#goldCounterGrad)');
        circle.setAttribute('r', '19.5');
    } else {
        circle.setAttribute('fill', isCompleted ? 'url(#greenCounterGrad)' : 'url(#blueCounterGrad)');
        circle.setAttribute('r', '16.5');
    }
}

/**
 * Generates an SVG string of sheet music with traditional notes and stems (for Listen & Match)
 */
export function generateSheetMusicSvg(sequence) {
    const bottom = 60;
    let h = '<svg viewBox="0 0 200 100" class="w-full h-auto block" aria-hidden="true">';
    for (let i = 0; i < 5; i++) {
        const y = bottom - i * 8;
        h += `<line x1="6" x2="194" y1="${y}" y2="${y}" stroke="#334155" stroke-width="1"/>`;
    }
    h += `<text x="18" y="${bottom + 3}" font-size="56" font-family="${CLEF_FONT}" fill="#0f172a">𝄞</text>`;
    const n = sequence.length;
    sequence.forEach((note, i) => {
        const step = noteDiatonic(note) - 30; // bottom line = E4
        const cx = n === 1 ? 120 : 64 + i * (124 / (n - 1));
        const cy = bottom - step * 4;
        const ledgers = [];
        if (step < 0) for (let k = -2; k >= step; k -= 2) ledgers.push(k);
        if (step > 8) for (let k = 10; k <= step; k += 2) ledgers.push(k);
        ledgers.forEach(k => {
            const y = bottom - k * 4;
            h += `<line x1="${cx - 9}" x2="${cx + 9}" y1="${y}" y2="${y}" stroke="#334155" stroke-width="1.2"/>`;
        });
        const down = step >= 4;
        const sx = down ? cx - 5 : cx + 5;
        h += `<line x1="${sx}" x2="${sx}" y1="${cy}" y2="${down ? cy + 24 : cy - 24}" stroke="#0f172a" stroke-width="1.4"/>`;
        h += `<ellipse cx="${cx}" cy="${cy}" rx="5.6" ry="4" transform="rotate(-20 ${cx} ${cy})" fill="#0f172a"/>`;
    });
    h += '</svg>';
    return h;
}
