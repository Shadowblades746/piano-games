/**
 * NoteReader — Game Plugin Registry
 * Central registry for all piano practice mini-games.
 * Adding a new mini-game (e.g., Rhythm Tapping, Interval Sight-Reading) only requires:
 *  1. Creating a new game module in `src/games/<your-game>.js`
 *  2. Adding its entry to the `GAMES` array below!
 */

import noteFlashcards from './note-flashcards.js';
import listenMatch from './listen-match.js';

export const GAMES = [
    {
        id: 'note-flashcards',
        title: 'Note Flashcards',
        shortTitle: 'Flashcards',
        icon: '🎯',
        description: 'Sight-reading flashcards with Hoffman blue magnetic counters',
        module: noteFlashcards
    },
    {
        id: 'listen-match',
        title: 'Listen & Match',
        shortTitle: 'Listen & Match',
        icon: '🎧',
        description: 'Ear training: listen to a melody and pick the sheet music',
        module: listenMatch
    }
];

export function getAllGames() {
    return GAMES;
}

export function getGameById(id) {
    return GAMES.find(g => g.id === id) || GAMES[0];
}

export function getDefaultGameId() {
    return GAMES[0].id;
}
