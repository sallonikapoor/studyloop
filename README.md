# StudyLoop

[![Deploy to GitHub Pages](https://github.com/sallonikapoor/studyloop/actions/workflows/deploy.yml/badge.svg)](https://github.com/sallonikapoor/studyloop/actions/workflows/deploy.yml)

A personal flashcard app with an adaptive **Learn** mode. Enter your own terms and definitions, study them in short rounds until every card is mastered, and add new terms at any time — even in the middle of a study session.

**Live app: https://sallonikapoor.github.io/studyloop/**

No accounts and no server. All data stays in your browser.

## Features

- **Study sets** — create, rename and delete sets; add, edit, star, search and delete cards.
- **Fast card entry** — press Enter in the definition box to add a card and jump straight back to the term box.
- **Bulk import** — paste one card per line (tab-separated by default, or comma, ` - `, semicolon, or a custom separator) and preview the split before confirming.
- **Adaptive Learn mode** — cards move from *Not studied* to *Familiar* to *Mastered* through multiple-choice and written questions, in rounds that prioritise what you missed.
- **Forgiving answer checking** — ignores capitalisation, spacing and punctuation, tolerates small typos, and offers an "I was actually right" override.
- **Add terms mid-session** — new cards join the next round without losing your place.
- **Automatic saving** — progress is stored after every answer, so you can close the tab mid-round and resume later.
- **Flashcards mode** — flip, navigate, and mark cards "know it" or "still learning".
- **Backup and restore** — export to JSON or tab-separated text; import from JSON.
- **Keyboard friendly, responsive, light and dark themes.**

## Getting started

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/sallonikapoor/studyloop.git
cd studyloop
npm install
npm run dev
```

Open the address printed in the terminal (normally http://localhost:5173). A sample set is included so you can try it immediately.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm test` | Run the unit tests (Vitest) |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the built site locally |

To open the local server from a phone on the same Wi-Fi, run `npm run dev -- --host` and use the "Network" address it prints.

## How Learn mode works

Each card has a level: **Not studied → Familiar → Mastered**.

| Situation | What happens |
| --- | --- |
| New card | Multiple-choice question (keys `1`–`4`) |
| Familiar card | Written question |
| Correct answer | Card moves up one level |
| Wrong answer | Card moves down one level, but never back to *Not studied*; it returns later in the same round |
| Correct on a same-round retry | Card leaves the round but is not promoted — it must be answered correctly first time in a later round |

- **Rounds** hold up to 7 cards (adjustable): recently missed cards first, then Familiar cards, then new ones. Each round ends with a summary.
- **Typo tolerance** for written answers: one typo for answers of 4–13 characters, about 15% of the length for longer answers, none for answers of 3 characters or fewer, and never a wrong digit. Accepted near-misses show "Correct (watch the spelling)".
- **Wrong answers** wait for Enter or Continue; correct answers advance automatically.
- **Finishing a set** offers a restart, a session on your most-missed cards, or a return to the set. Cards added afterwards are studied on their own without resetting earlier progress.
- **Settings**: answer with term, definition or both; question types; shuffle; round size; starred cards only; reset progress.

### Flashcards shortcuts

| Key | Action |
| --- | --- |
| `Space` | Flip the card |
| `←` / `→` | Previous / next card |
| `1` | Mark "still learning" |
| `2` | Mark "know it" |

## Your data

Sets and progress are stored in your browser's localStorage. That means:

- Each browser and each device keeps its own copy. The hosted app and a local copy do not share data.
- Clearing site data deletes your sets.

Use **Export JSON** on a set, or **Back up all sets** on the home page, to keep a backup or move sets between devices. Importing always adds new sets and never overwrites existing ones.

## Tech stack

- [React 18](https://react.dev) and [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vitejs.dev) for development and builds
- [Vitest](https://vitest.dev) for unit tests
- No runtime dependencies beyond React

## Project structure

```
src/
  types.ts            Data model: StudySet, Card, LearnSettings, LearnSession
  storage.ts          localStorage load/save and the sample set
  store.tsx           App state (React context) with autosave
  router.ts           Minimal hash router
  lib/
    learn.ts          Learn-mode logic: grading, levels, round building (no UI code)
    cards.ts          Card creation, bulk-paste parsing, import/export
    *.test.ts         Unit tests
  components/         Home, set, learn and flashcards pages; dialogs and forms
.github/workflows/
  deploy.yml          Tests, builds and publishes to GitHub Pages on every push to main
```

The learn-mode rules live entirely in `src/lib/learn.ts` as pure functions, separate from the UI, and are covered by the unit tests.

## Deployment

Every push to `main` runs the tests, builds the app and publishes it to GitHub Pages through the workflow in `.github/workflows/deploy.yml`.
