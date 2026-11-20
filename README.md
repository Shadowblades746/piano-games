# NoteReader 🎵🎹

A production-grade, zero-build piano sight-reading and ear-training suite inspired by the **Hoffman Academy** piano curriculum. Built with standard ES Modules, Web MIDI, Web Speech, and the Salamander Grand Piano sound engine.

---

## 🌟 Key Features

- **Hoffman Sight-Reading Flashcards**: Blue magnetic counter tokens on both piano keys and musical staff with instant auditory and visual feedback.
- **Listen & Match Ear Training**: Hear a piano melody and select the matching sheet music card from 4 choices.
- **Salamander Grand Piano Sound Engine**: Tuned velocity sensitivity, natural Note-Off release, Sustain Pedal (CC 64) tracking, convolution reverb, and persistent `CacheStorage` for fast offline reloads (`CC BY 3.0` by Alexander Holm).
- **Web MIDI API Support**: Seamless plug-and-play with digital pianos (e.g., Yamaha P-125) via USB or Bluetooth MIDI, with Play-to-Answer and Free Play modes.
- **Web Speech API ("Say It Out Loud")**: Automatic speech recognition for note names `A`–`G` with phonetic mapping.
- **Plugin-Style Game Registry**: Adding a new mini-game only requires creating one file and registering it in a single array.
- **Zero-Build Static Architecture**: Deployable directly to Vercel or GitHub Pages without build steps or bundlers.
- **Mobile First**: Native `100dvh` viewport support, notch/safe-area insets, 16px form inputs to prevent iOS auto-zoom, and multi-gesture audio unlocking.

---

## 📁 Project Structure

```text
piano-games/
├── index.html                 # Semantic HTML shell, shared navigation & game mount container
├── vercel.json                # Vercel static routing & caching header configuration
├── README.md                  # Project documentation & plugin guide
├── css/
│   └── styles.css             # Compiled Tailwind CSS + custom tactile Hoffman piano theme
└── src/
    ├── main.js                # App bootstrapper, router, shared top bar & shortcut delegation
    ├── core/
    │   ├── notes.js           # Canonical musical data, diatonic step math, clefs & level ranges
    │   ├── audio.js           # Salamander Grand Piano engine, reverb, synth fallback & mute
    │   ├── midi.js            # Web MIDI API manager, device state & event dispatcher
    │   ├── speech.js          # Web Speech API note listener (A–G) with fuzzy phonetic parsing
    │   └── storage.js         # LocalStorage persistence for user preferences, scores & stats
    ├── ui/
    │   ├── staff.js           # Reusable SVG musical staff renderer (treble, bass, grand & sheet cards)
    │   ├── keyboard.js        # Responsive overhead piano keyboard with Hoffman blue counters
    │   └── toast.js           # Accessible non-blocking toast notifications
    └── games/
        ├── registry.js        # Central game registry & catalog
        ├── note-flashcards.js # Game 1: Hoffman sight-reading flashcard challenge
        └── listen-match.js    # Game 2: Listen & Match ear-training game
```

---

## 🔌 How to Add a New Mini-Game (Plugin Architecture)

To add a new mini-game (e.g. *Interval Training*, *Rhythm Tapping*, or *Key Signatures*):

### Step 1: Create `src/games/my-game.js`
Create a self-contained module exporting the game lifecycle interface:

```javascript
// src/games/my-game.js
export default {
    id: 'my-game',
    title: 'My Piano Game',
    shortTitle: 'My Game',
    icon: '✨',
    description: 'Practice new piano skills',

    mount(container, context) {
        // 1. Render DOM into container
        container.innerHTML = `
            <div class="max-w-4xl mx-auto p-4 text-[#fdf6e7]">
                <h2 class="text-xl font-bold">My Piano Game</h2>
            </div>
        `;

        // 2. Access shared services
        const { audio, midi, storage, showToast, onScoreEarned } = context;

        // 3. Play note or subscribe to MIDI
        this.unsubMidi = midi.on('noteon', ({ pitchName, midi }) => {
            showToast(`Played ${pitchName}`);
            onScoreEarned(1);
        });
    },

    unmount() {
        // Clean up timers, MIDI subscriptions, audio sequences
        if (this.unsubMidi) this.unsubMidi();
    },

    handleKeyDown(event) {
        // Optional game-specific keyboard shortcuts
        if (event.key === ' ') {
            // handle spacebar
        }
    }
};
```

### Step 2: Register in `src/games/registry.js`
Import and add your game to the `GAMES` array:

```javascript
import noteFlashcards from './note-flashcards.js';
import listenMatch from './listen-match.js';
import myGame from './my-game.js'; // <-- 1. Import

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
        shortTitle: 'Listen',
        icon: '🎧',
        description: 'Ear training: listen to a melody and pick the sheet music',
        module: listenMatch
    },
    {
        id: 'my-game',               // <-- 2. Register
        title: 'My Piano Game',
        shortTitle: 'My Game',
        icon: '✨',
        description: 'Practice new piano skills',
        module: myGame
    }
];
```

That's it! NoteReader's navigation shell and URL router (`#game=my-game`) will automatically generate the tab button and manage mounting, unmounting, and keyboard delegation.

---

## 🚀 Deploying to Vercel

Because NoteReader is built with zero-build static ES Modules, deployment takes less than a minute:

### Option A: Via GitHub (Recommended)
1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Refactor NoteReader into modular multi-file architecture"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Log into [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Leave all build settings at their defaults (Framework Preset: **Other**, Build Command: empty, Output Directory: empty).
5. Click **"Deploy"**.

### Option B: Via Vercel CLI
```bash
npm i -g vercel
vercel
```

---

## 🎹 Keyboard Shortcuts

### Global / Sight-Reading Flashcards
- `A` – `G`: Play tone and submit letter answer
- `→` (Right Arrow) or `Enter`: Advance to next pattern
- `Space`: Reveal answer & replay audio pattern
- `Esc`: Reset / clear current inputs

### Listen & Match (Ear Training)
- `1` – `4`: Select sheet music card 1, 2, 3, or 4
- `R` or `Space`: Replay melody
- `N` or `Enter`: Skip to next melody

---

## 📄 License & Attribution
- Piano sound samples: **Salamander Grand Piano** by Alexander Holm ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)).
- NoteReader educational design inspired by the Joseph Hoffman piano pedagogy ([Hoffman Academy](https://www.hoffmanacademy.com/)).
