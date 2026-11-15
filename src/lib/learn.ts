/**
 * Learn-mode logic. Everything here is pure (no React, no storage):
 * functions take a set and return a new set.
 */
import type { Card, LearnSession, LearnSettings, Level, StudySet } from '../types';

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

/** Lowercase, drop punctuation, collapse whitespace. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’‘`]/g, '') // don't -> dont
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // other punctuation acts as a space
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos we forgive for an answer of this (normalized) length. */
export function allowedTypos(length: number): number {
  if (length <= 3) return 0; // too short: one typo is a different word
  if (length <= 13) return 1;
  return Math.floor(length * 0.15);
}

export type Grade = 'exact' | 'close' | 'wrong';

const digitsOf = (s: string) => s.replace(/\D/g, '');

export function gradeWritten(given: string, expected: string): Grade {
  const g = normalizeAnswer(given);
  const e = normalizeAnswer(expected);
  if (!e) return given.trim() === expected.trim() ? 'exact' : 'wrong';
  if (g === e) return 'exact';
  if (!g) return 'wrong';
  // A wrong digit is a wrong answer (1492 vs 1493), never a typo.
  if (digitsOf(g) !== digitsOf(e)) return 'wrong';
  return levenshtein(g, e) <= allowedTypos(e.length) ? 'close' : 'wrong';
}

/* ------------------------------------------------------------------ */
/* Card progress                                                       */
/* ------------------------------------------------------------------ */

/**
 * Apply one answer to a card.
 * - Correct: up one level (unless `promote` is false - used for same-round retries).
 * - Wrong: down one level, but never below 1 once seen.
 */
export function applyAnswer(card: Card, correct: boolean, now: number, promote = true): Card {
  if (correct) {
    return {
      ...card,
      seen: true,
      correct: card.correct + 1,
      level: promote ? (Math.min(2, card.level + 1) as Level) : card.level,
      missedAt: promote ? null : card.missedAt,
    };
  }
  return {
    ...card,
    seen: true,
    incorrect: card.incorrect + 1,
    level: Math.max(1, card.level - 1) as Level,
    missedAt: now,
  };
}

export interface LevelCounts {
  notStudied: number;
  familiar: number;
  mastered: number;
  total: number;
}

export function countLevels(cards: readonly Card[]): LevelCounts {
  const counts = { notStudied: 0, familiar: 0, mastered: 0, total: cards.length };
  for (const c of cards) {
    if (c.level === 0) counts.notStudied++;
    else if (c.level === 1) counts.familiar++;
    else counts.mastered++;
  }
  return counts;
}

/** The cards learn mode works on (respects "starred only"). */
export function studyPool(set: StudySet): Card[] {
  return set.settings.starredOnly ? set.cards.filter((c) => c.starred) : set.cards;
}

export function hasRemaining(set: StudySet): boolean {
  return studyPool(set).some((c) => c.level < 2);
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

export type QuestionType = 'mc' | 'written';

export interface Question {
  cardId: string;
  type: QuestionType;
  /** Which side the user must produce. */
  answerWith: 'term' | 'definition';
  prompt: string;
  answer: string;
  /** Multiple choice only. */
  options: string[];
}

export function questionTypeFor(card: Card, settings: LearnSettings): QuestionType {
  if (settings.questionTypes === 'mc') return 'mc';
  if (settings.questionTypes === 'written') return 'written';
  return card.level === 0 ? 'mc' : 'written';
}

export function buildQuestion(
  card: Card,
  allCards: readonly Card[],
  settings: LearnSettings,
  rng: Rng = Math.random,
): Question {
  const answerWith =
    settings.answerWith === 'both' ? (rng() < 0.5 ? 'term' : 'definition') : settings.answerWith;
  const side = (c: Card) => (answerWith === 'term' ? c.term : c.definition);
  const answer = side(card);
  const prompt = answerWith === 'term' ? card.definition : card.term;
  const type = questionTypeFor(card, settings);

  let options: string[] = [];
  if (type === 'mc') {
    const used = new Set([normalizeAnswer(answer)]);
    const distractors: string[] = [];
    for (const c of shuffle(allCards.filter((c) => c.id !== card.id), rng)) {
      const text = side(c);
      const key = normalizeAnswer(text);
      if (used.has(key)) continue;
      used.add(key);
      distractors.push(text);
      if (distractors.length === 3) break;
    }
    options = shuffle([answer, ...distractors], rng);
  }
  return { cardId: card.id, type, answerWith, prompt, answer, options };
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

/** A missed card is re-inserted after this many other cards (if available). */
export const REQUEUE_GAP = 3;

/** Pick the cards for the next round: recently missed, then familiar, then new. */
export function selectRoundCards(set: StudySet, rng: Rng = Math.random): string[] {
  const { shuffle: doShuffle, roundSize } = set.settings;
  const remaining = studyPool(set).filter((c) => c.level < 2);
  const missed = remaining
    .filter((c) => c.missedAt != null)
    .sort((a, b) => (b.missedAt ?? 0) - (a.missedAt ?? 0));
  const familiar = remaining.filter((c) => c.missedAt == null && c.level === 1);
  const fresh = remaining.filter((c) => c.missedAt == null && c.level === 0);
  const mix = (cards: Card[]) => (doShuffle ? shuffle(cards, rng) : cards);
  const picked = [...missed, ...mix(familiar), ...mix(fresh)].slice(0, Math.max(1, roundSize));
  return (doShuffle ? shuffle(picked, rng) : picked).map((c) => c.id);
}

/** Start the next round (or mark the session complete if nothing is left). */
export function startRound(set: StudySet, rng: Rng = Math.random): StudySet {
  const ids = selectRoundCards(set, rng);
  const prev = set.session;
  const session: LearnSession = {
    round: (prev?.round ?? 0) + (ids.length ? 1 : 0),
    phase: ids.length ? 'question' : 'complete',
    queue: ids,
    roundCards: ids,
    missed: [],
    step: (prev?.step ?? 0) + 1,
    undo: null,
  };
  return { ...set, session };
}

/**
 * Make sure there is a usable session: start one if none exists, and start a
 * new round if the set was finished but new (unmastered) cards have appeared.
 * Returns the same object when nothing needs to change.
 */
export function ensureSession(set: StudySet, rng: Rng = Math.random): StudySet {
  if (studyPool(set).length === 0) return set;
  const s = set.session;
  if (!s || (s.phase === 'complete' && hasRemaining(set))) return startRound(set, rng);
  return set;
}

/** Record an answer for the current card (queue[0]) and advance the round. */
export function answerCurrent(
  set: StudySet,
  cardId: string,
  correct: boolean,
  now: number = Date.now(),
): StudySet {
  const session = set.session;
  if (!session || session.phase !== 'question' || session.queue[0] !== cardId) return set;
  const card = set.cards.find((c) => c.id === cardId);
  if (!card) return set;

  // A retry of a card already missed this round never promotes it: it has to
  // be answered correctly on the first try in a later round.
  const isRetry = session.missed.includes(cardId);
  const updated = applyAnswer(card, correct, now, !isRetry);
  const rest = session.queue.slice(1);

  let queue = rest;
  if (!correct) {
    const at = Math.min(rest.length, REQUEUE_GAP);
    queue = [...rest.slice(0, at), cardId, ...rest.slice(at)];
  }

  return {
    ...set,
    cards: set.cards.map((c) => (c.id === cardId ? updated : c)),
    session: {
      ...session,
      queue,
      missed: correct || isRetry ? session.missed : [...session.missed, cardId],
      phase: queue.length ? 'question' : 'summary',
      step: session.step + 1,
      undo: correct
        ? null
        : {
            cardId,
            level: card.level,
            seen: card.seen,
            correct: card.correct,
            incorrect: card.incorrect,
            missedAt: card.missedAt,
            queue: session.queue,
            missed: session.missed,
          },
    },
  };
}

/** "Override: I was right": reverse the last wrong answer and count it correct. */
export function overrideLastAnswer(set: StudySet, now: number = Date.now()): StudySet {
  const session = set.session;
  const undo = session?.undo;
  if (!session || !undo) return set;
  const ids = new Set(set.cards.map((c) => c.id));
  if (!ids.has(undo.cardId)) return { ...set, session: { ...session, undo: null } };
  const restored: StudySet = {
    ...set,
    cards: set.cards.map((c) =>
      c.id === undo.cardId
        ? {
            ...c,
            level: undo.level,
            seen: undo.seen,
            correct: undo.correct,
            incorrect: undo.incorrect,
            missedAt: undo.missedAt,
          }
        : c,
    ),
    session: {
      ...session,
      phase: 'question',
      queue: undo.queue.filter((id) => ids.has(id)),
      missed: undo.missed.filter((id) => ids.has(id)),
      undo: null,
    },
  };
  return answerCurrent(restored, undo.cardId, true, now);
}

/** Keep the session consistent when a card is deleted. */
export function removeCardFromSession(session: LearnSession | null, cardId: string): LearnSession | null {
  if (!session) return null;
  const queue = session.queue.filter((id) => id !== cardId);
  const roundCards = session.roundCards.filter((id) => id !== cardId);
  if (session.phase === 'question' && queue.length === 0) {
    if (roundCards.length === 0) return null; // nothing was answered; just rebuild
    return { ...session, queue, roundCards, phase: 'summary', undo: null, step: session.step + 1 };
  }
  return {
    ...session,
    queue,
    roundCards,
    missed: session.missed.filter((id) => id !== cardId),
    undo: session.undo?.cardId === cardId ? null : session.undo,
    // The current question changed if the deleted card was at the front.
    step: session.queue[0] === cardId ? session.step + 1 : session.step,
  };
}

/* ------------------------------------------------------------------ */
/* Restarting                                                          */
/* ------------------------------------------------------------------ */

/** Study everything again. Keeps the lifetime correct/incorrect counts. */
export function restartLearn(set: StudySet): StudySet {
  const pool = new Set(studyPool(set).map((c) => c.id));
  return {
    ...set,
    session: null,
    cards: set.cards.map((c) =>
      pool.has(c.id) ? { ...c, level: 0 as Level, seen: false, missedAt: null } : c,
    ),
  };
}

/** Wipe all progress for the set. */
export function resetProgress(set: StudySet): StudySet {
  return {
    ...set,
    session: null,
    cards: set.cards.map((c) => ({
      ...c,
      level: 0 as Level,
      seen: false,
      correct: 0,
      incorrect: 0,
      missedAt: null,
      known: null,
    })),
  };
}

/** The cards with the most wrong answers, worst first. */
export function mostMissed(set: StudySet, limit = 10): Card[] {
  return studyPool(set)
    .filter((c) => c.incorrect > 0)
    .sort((a, b) => b.incorrect - a.incorrect)
    .slice(0, limit);
}

/** Put the most-missed cards back to "Familiar" so they get practised again. */
export function studyMostMissed(set: StudySet, now: number = Date.now(), limit = 10): StudySet {
  const targets = new Set(mostMissed(set, limit).map((c) => c.id));
  if (targets.size === 0) return set;
  return {
    ...set,
    session: null,
    cards: set.cards.map((c) => (targets.has(c.id) ? { ...c, level: 1 as Level, missedAt: now } : c)),
  };
}
