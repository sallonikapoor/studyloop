import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../types';
import type { Card, LearnSettings, StudySet } from '../types';
import { makeCard, makeSet } from './cards';
import {
  allowedTypos,
  answerCurrent,
  applyAnswer,
  buildQuestion,
  countLevels,
  ensureSession,
  gradeWritten,
  levenshtein,
  normalizeAnswer,
  overrideLastAnswer,
  questionTypeFor,
  removeCardFromSession,
  restartLearn,
  selectRoundCards,
  startRound,
  studyMostMissed,
} from './learn';

let n = 0;
const card = (term: string, definition = `def of ${term}`, extra: Partial<Card> = {}): Card => ({
  ...makeCard(term, definition, 1000),
  id: `c${++n}-${term}`,
  ...extra,
});

const setOf = (cards: Card[], settings: Partial<LearnSettings> = {}): StudySet => ({
  ...makeSet('Test', cards, 1000),
  settings: { ...DEFAULT_SETTINGS, shuffle: false, ...settings },
});

const byId = (set: StudySet, id: string) => set.cards.find((c) => c.id === id)!;

/** Answer the current card and return the new set. */
const answer = (set: StudySet, correct: boolean, now = 5000) =>
  answerCurrent(set, set.session!.queue[0], correct, now);

/** Answer everything left in the round correctly. */
const finishRound = (set: StudySet) => {
  let s = set;
  let guard = 0;
  while (s.session!.phase === 'question' && guard++ < 500) s = answer(s, true);
  return s;
};

describe('normalizeAnswer', () => {
  it('ignores capitalization and surrounding / extra spaces', () => {
    expect(normalizeAnswer('  The   Mitochondria ')).toBe('the mitochondria');
  });

  it('ignores punctuation', () => {
    expect(normalizeAnswer('Hello, world!')).toBe('hello world');
    expect(normalizeAnswer("don't")).toBe('dont');
    expect(normalizeAnswer('well-known')).toBe('well known');
    expect(normalizeAnswer('red / green,blue')).toBe('red green blue');
  });

  it('keeps accented and non-latin letters', () => {
    expect(normalizeAnswer('¿Qué?')).toBe('qué');
    expect(normalizeAnswer('日本語!')).toBe('日本語');
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abcd', 'abdc')).toBe(2);
  });
});

describe('gradeWritten', () => {
  it('accepts exact answers regardless of formatting', () => {
    expect(gradeWritten('  mitochondria', 'Mitochondria')).toBe('exact');
    expect(gradeWritten('powerhouse of the cell', 'Powerhouse of the cell.')).toBe('exact');
    expect(gradeWritten('red green blue', 'red, green / blue')).toBe('exact');
  });

  it('allows one typo in short answers', () => {
    expect(allowedTypos(7)).toBe(1);
    expect(gradeWritten('osmosiss', 'osmosis')).toBe('close');
    expect(gradeWritten('osmsis', 'osmosis')).toBe('close');
    expect(gradeWritten('ozmozis', 'osmosis')).toBe('wrong'); // 2 typos
  });

  it('allows no typos in very short answers', () => {
    expect(gradeWritten('el', 'la')).toBe('wrong');
    expect(gradeWritten('dns', 'dna')).toBe('wrong');
  });

  it('allows about 15% typos in longer answers', () => {
    const expected = 'the powerhouse of the cell'; // 26 chars -> 3 typos
    expect(allowedTypos(expected.length)).toBe(3);
    expect(gradeWritten('teh powerhouse of teh cell', expected)).toBe('wrong'); // 4 edits
    expect(gradeWritten('the powrhouse of the cel', expected)).toBe('close'); // 2 edits
    expect(gradeWritten('the nucleus of the atom', expected)).toBe('wrong');
  });

  it('requires the full answer, not just one part', () => {
    expect(gradeWritten('red', 'red, green, blue')).toBe('wrong');
  });

  it('never treats a wrong number as a typo', () => {
    expect(gradeWritten('1493', '1492')).toBe('wrong');
    expect(gradeWritten('world war 1', 'world war 2')).toBe('wrong');
  });

  it('treats a missing accent as a near miss', () => {
    expect(gradeWritten('corazon', 'corazón')).toBe('close');
  });

  it('rejects empty answers', () => {
    expect(gradeWritten('   ', 'osmosis')).toBe('wrong');
  });
});

describe('applyAnswer (level changes)', () => {
  it('moves up one level per correct answer, capped at mastered', () => {
    const c0 = card('a');
    const c1 = applyAnswer(c0, true, 1);
    expect(c1.level).toBe(1);
    expect(c1.seen).toBe(true);
    const c2 = applyAnswer(c1, true, 2);
    expect(c2.level).toBe(2);
    expect(applyAnswer(c2, true, 3).level).toBe(2);
    expect(c2.correct).toBe(2);
  });

  it('drops a level on a wrong answer, but never below 1 once seen', () => {
    expect(applyAnswer(card('a', 'x', { level: 2, seen: true }), false, 9).level).toBe(1);
    expect(applyAnswer(card('a', 'x', { level: 1, seen: true }), false, 9).level).toBe(1);
    const missedNew = applyAnswer(card('a'), false, 9);
    expect(missedNew.level).toBe(1); // out of the "new" pool
    expect(missedNew.incorrect).toBe(1);
    expect(missedNew.missedAt).toBe(9);
  });

  it('does not promote when promote=false (same-round retry)', () => {
    const c = applyAnswer(card('a', 'x', { level: 1, seen: true, missedAt: 5 }), true, 9, false);
    expect(c.level).toBe(1);
    expect(c.correct).toBe(1);
    expect(c.missedAt).toBe(5);
  });
});

describe('questions', () => {
  it('uses multiple choice for new cards and written for familiar ones', () => {
    expect(questionTypeFor(card('a'), DEFAULT_SETTINGS)).toBe('mc');
    expect(questionTypeFor(card('a', 'x', { level: 1 }), DEFAULT_SETTINGS)).toBe('written');
  });

  it('respects the question type setting', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(questionTypeFor(card('a', 'x', { level: 1 }), { ...s, questionTypes: 'mc' })).toBe('mc');
    expect(questionTypeFor(card('a'), { ...s, questionTypes: 'written' })).toBe('written');
  });

  it('builds 4 unique options including the answer', () => {
    const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => card(t));
    const q = buildQuestion(cards[0], cards, DEFAULT_SETTINGS);
    expect(q.type).toBe('mc');
    expect(q.prompt).toBe('def of a'); // default: answer with the term
    expect(q.answer).toBe('a');
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain('a');
  });

  it('shows fewer options when the set is small and skips duplicate texts', () => {
    const cards = [card('a'), card('b'), card('B ')];
    const q = buildQuestion(cards[0], cards, DEFAULT_SETTINGS);
    expect(q.options).toHaveLength(2);
    const solo = [card('only')];
    expect(buildQuestion(solo[0], solo, DEFAULT_SETTINGS).options).toEqual(['only']);
  });

  it('can ask for the definition instead', () => {
    const cards = [card('a'), card('b')];
    const q = buildQuestion(cards[0], cards, { ...DEFAULT_SETTINGS, answerWith: 'definition' });
    expect(q.prompt).toBe('a');
    expect(q.answer).toBe('def of a');
  });
});

describe('round building', () => {
  it('limits a round to the round size', () => {
    const set = setOf(Array.from({ length: 12 }, (_, i) => card(`t${i}`)));
    expect(selectRoundCards(set)).toHaveLength(7);
    expect(selectRoundCards(setOf(set.cards, { roundSize: 3 }))).toHaveLength(3);
  });

  it('prioritises recently missed, then familiar, then new cards', () => {
    const fresh = card('fresh');
    const familiar = card('familiar', 'x', { level: 1, seen: true });
    const missedOld = card('missedOld', 'x', { level: 1, seen: true, missedAt: 10 });
    const missedNew = card('missedNew', 'x', { level: 1, seen: true, missedAt: 20 });
    const mastered = card('mastered', 'x', { level: 2, seen: true });
    const set = setOf([fresh, familiar, mastered, missedOld, missedNew]);
    expect(selectRoundCards(set)).toEqual([missedNew.id, missedOld.id, familiar.id, fresh.id]);
    expect(selectRoundCards(setOf(set.cards, { roundSize: 2 }))).toEqual([missedNew.id, missedOld.id]);
  });

  it('only uses starred cards when "starred only" is on', () => {
    const a = card('a', 'x', { starred: true });
    const set = setOf([a, card('b'), card('c')], { starredOnly: true });
    expect(selectRoundCards(set)).toEqual([a.id]);
  });

  it('shuffling keeps the same cards', () => {
    const set = setOf(['a', 'b', 'c', 'd'].map((t) => card(t)), { shuffle: true });
    expect([...selectRoundCards(set)].sort()).toEqual(set.cards.map((c) => c.id).sort());
  });
});

describe('answering within a round', () => {
  it('a missed card comes back later in the same round, not immediately', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((t) => card(t));
    let set = startRound(setOf(cards));
    const first = set.session!.queue[0];

    set = answer(set, false);
    const queue = set.session!.queue;
    expect(queue).toContain(first);
    expect(queue[0]).not.toBe(first);
    expect(queue.indexOf(first)).toBe(3); // after three other cards
    expect(queue).toHaveLength(5); // still 5 questions to go
    expect(set.session!.missed).toEqual([first]);
    expect(set.session!.phase).toBe('question');
  });

  it('the round only ends once the missed card is answered correctly', () => {
    const cards = ['a', 'b'].map((t) => card(t));
    let set = startRound(setOf(cards));
    const [a, b] = set.session!.queue;
    set = answer(set, false); // miss a -> queue [b, a]
    expect(set.session!.queue).toEqual([b, a]);
    set = answer(set, true); // b correct
    set = answer(set, false); // miss a again -> still queued
    expect(set.session!.queue).toEqual([a]);
    expect(set.session!.phase).toBe('question');
    set = answer(set, true);
    expect(set.session!.phase).toBe('summary');
    expect(set.session!.missed).toEqual([a]);
    expect(byId(set, a).incorrect).toBe(2);
  });

  it('a same-round retry does not promote; the next round does', () => {
    const cards = ['a', 'b'].map((t) => card(t));
    let set = startRound(setOf(cards));
    const a = set.session!.queue[0];
    set = answer(set, false);
    expect(byId(set, a).level).toBe(1);
    set = finishRound(set);
    expect(byId(set, a).level).toBe(1); // retry was correct but no promotion
    expect(byId(set, a).missedAt).not.toBeNull();

    set = startRound(set);
    expect(set.session!.queue[0]).toBe(a); // recently missed goes first
    set = answer(set, true);
    expect(byId(set, a).level).toBe(2);
    expect(byId(set, a).missedAt).toBeNull();
  });

  it('saves progress on every answer (card + session change together)', () => {
    let set = startRound(setOf(['a', 'b', 'c'].map((t) => card(t))));
    const a = set.session!.queue[0];
    set = answer(set, true);
    expect(byId(set, a).level).toBe(1);
    expect(set.session!.queue).toHaveLength(2);
    // Simulate closing the tab: the set round-trips through JSON unchanged.
    const reloaded: StudySet = JSON.parse(JSON.stringify(set));
    expect(reloaded.session!.queue).toEqual(set.session!.queue);
    expect(answer(reloaded, true).session!.queue).toHaveLength(1);
  });

  it('ignores answers for a card that is not the current one', () => {
    const set = startRound(setOf(['a', 'b'].map((t) => card(t))));
    expect(answerCurrent(set, set.session!.queue[1], true)).toBe(set);
  });

  it('"I was actually right" turns the last miss into a correct answer', () => {
    let set = startRound(setOf(['a', 'b', 'c'].map((t) => card(t, 'x', { level: 1, seen: true }))));
    const a = set.session!.queue[0];
    set = answer(set, false);
    expect(byId(set, a).incorrect).toBe(1);
    set = overrideLastAnswer(set);
    expect(byId(set, a)).toMatchObject({ level: 2, correct: 1, incorrect: 0, missedAt: null });
    expect(set.session!.queue).not.toContain(a);
    expect(set.session!.missed).toEqual([]);
    expect(overrideLastAnswer(set)).toBe(set); // nothing left to undo
  });

  it('deleting the current card moves on without breaking the round', () => {
    const set = startRound(setOf(['a', 'b'].map((t) => card(t))));
    const [a, b] = set.session!.queue;
    const session = removeCardFromSession(set.session, a)!;
    expect(session.queue).toEqual([b]);
    expect(session.phase).toBe('question');
    expect(removeCardFromSession(session, b)).toBeNull();
  });
});

describe('full flow', () => {
  it('takes cards from not studied to mastered over rounds', () => {
    let set = ensureSession(setOf(['a', 'b', 'c'].map((t) => card(t))));
    expect(set.session!.round).toBe(1);
    set = finishRound(set);
    expect(countLevels(set.cards)).toMatchObject({ notStudied: 0, familiar: 3, mastered: 0 });
    set = finishRound(startRound(set));
    expect(countLevels(set.cards)).toMatchObject({ mastered: 3 });
    set = startRound(set);
    expect(set.session!.phase).toBe('complete');
    expect(ensureSession(set)).toBe(set);
  });
});

describe('adding cards mid-session', () => {
  it('does not disturb the current round and includes new cards in the next one', () => {
    let set = startRound(setOf(['a', 'b', 'c'].map((t) => card(t))));
    const queueBefore = set.session!.queue;
    set = answer(set, true);

    const added = card('new');
    set = { ...set, cards: [...set.cards, added] };
    expect(set.session!.queue).toEqual(queueBefore.slice(1)); // place kept
    expect(ensureSession(set)).toBe(set);

    set = finishRound(set);
    set = startRound(set);
    expect(set.session!.queue).toContain(added.id);
    expect(set.session!.queue).toHaveLength(4);
  });

  it('picks up only the new cards after the set was finished', () => {
    const done = ['a', 'b'].map((t) => card(t, 'x', { level: 2, seen: true, correct: 2 }));
    let set = startRound(setOf(done));
    expect(set.session!.phase).toBe('complete');

    const added = [card('new1'), card('new2')];
    set = ensureSession({ ...set, cards: [...set.cards, ...added] });
    expect(set.session!.phase).toBe('question');
    expect([...set.session!.queue].sort()).toEqual(added.map((c) => c.id).sort());
    expect(done.every((d) => byId(set, d.id).level === 2)).toBe(true); // old progress kept
  });
});

describe('restarting', () => {
  it('restartLearn resets levels but keeps lifetime counts', () => {
    const set = restartLearn(setOf([card('a', 'x', { level: 2, seen: true, correct: 4, incorrect: 2 })]));
    expect(set.cards[0]).toMatchObject({ level: 0, correct: 4, incorrect: 2 });
    expect(set.session).toBeNull();
  });

  it('studyMostMissed re-opens only the cards that were missed', () => {
    const hard = card('hard', 'x', { level: 2, seen: true, incorrect: 3 });
    const easy = card('easy', 'x', { level: 2, seen: true, incorrect: 0 });
    const set = startRound(studyMostMissed(setOf([hard, easy]), 99));
    expect(set.session!.queue).toEqual([hard.id]);
    expect(byId(set, easy.id).level).toBe(2);
  });
});
