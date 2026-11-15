# StudyLoop

A personal flashcard app with an adaptive **Learn** mode. Type in your own terms and definitions, study them in short rounds until every card is mastered, and add new terms whenever you like — even in the middle of a session.

No accounts, no server. Everything is stored in your browser (localStorage).

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (normally http://localhost:5173).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm test` | Run the unit tests (Vitest) |
| `npm run build` | Type-check and build a static copy into `dist/` |
| `npm run preview` | Serve the built copy |

**On your phone:** run `npm run dev -- --host` and open the "Network" address it prints from a phone on the same Wi-Fi. Each browser keeps its own data, so move sets between devices with Export / Import.

## How it works

### Sets and cards
- Create, rename and delete sets from the home page and the set page.
- Add cards with the term/definition form. Enter in the definition box adds the card and jumps back to the term box.
- **Bulk import:** paste one card per line. The default separator is Tab (the format most flashcard tools export); comma, ` - `, semicolon or any custom separator also work. You see a preview before anything is added.
- Edit, delete, star and search cards on the set page. Editing keeps the card's progress. Duplicate terms get a warning.

### Learn mode
Each card has a level: **Not studied → Familiar → Mastered**.

- New cards get a multiple-choice question (keys `1`–`4`). Familiar cards get a written question.
- A correct answer moves the card up a level. A wrong answer moves it down a level, but never back to "Not studied".
- A missed card comes back later in the same round. Getting it right on that retry clears it from the round but does not level it up — it has to be answered correctly first time in a later round.
- Rounds hold up to 7 cards (adjustable): recently missed cards first, then Familiar cards, then new ones.
- Written answers ignore capitalisation, spacing and punctuation, and forgive small typos (1 typo for answers of 4–13 characters, about 15% of the length for longer ones, none for answers of 3 characters or fewer, and never a wrong digit). A forgiven typo shows "Correct (watch the spelling)".
- After a wrong written answer you can press **I was actually right** to count it as correct.
- Wrong answers wait for Enter / Continue. Correct answers move on by themselves.
- **+ Add term** is always available in learn mode. New cards join the next round; if the set was already finished, only the new cards are studied.
- Progress is saved after every answer, so closing the tab mid-round loses nothing.
- **Settings** (⚙): answer with term / definition / both, question types, shuffle, round size, starred cards only, reset progress.

### Flashcards mode
`Space` (or click) flips, `←` `→` move, `1` marks "still learning", `2` marks "know it".

### Backup
- Set page: **Export JSON** (includes progress) and **Export text** (tab-separated, pastes straight back into bulk import).
- Home page: **Back up all sets** and **Import from JSON**. Importing always adds new sets; it never overwrites existing ones.

Clearing your browser's site data deletes your sets, so export a backup now and then.

## Project layout

```
src/
  types.ts            Data model: StudySet, Card, LearnSettings, LearnSession
  storage.ts          localStorage load/save and the sample set
  store.tsx           App state (React context) with autosave
  router.ts           Tiny hash router
  lib/
    learn.ts          Learn-mode logic: grading, levels, round building (no UI)
    cards.ts          Card creation, bulk-paste parsing, import/export
    learn.test.ts     Unit tests
    cards.test.ts     Unit tests
  components/         HomePage, SetPage, LearnPage, FlashcardsPage, dialogs, forms
```
