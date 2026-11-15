/** 0 = Not studied, 1 = Familiar, 2 = Mastered */
export type Level = 0 | 1 | 2;

export interface Card {
  id: string;
  term: string;
  definition: string;
  starred: boolean;
  level: Level;
  /** Has this card ever been answered in learn mode? */
  seen: boolean;
  correct: number;
  incorrect: number;
  /** Timestamp of the last miss; cleared by the next first-try correct answer. */
  missedAt: number | null;
  /** Flashcards mode: true = know it, false = still learning, null = unmarked. */
  known: boolean | null;
  createdAt: number;
}

export type AnswerWith = 'term' | 'definition' | 'both';
export type QuestionTypes = 'mc' | 'written' | 'both';

export interface LearnSettings {
  answerWith: AnswerWith;
  questionTypes: QuestionTypes;
  shuffle: boolean;
  roundSize: number;
  starredOnly: boolean;
}

/** Progress fields of a card captured before an answer, so it can be undone. */
export interface UndoInfo {
  cardId: string;
  level: Level;
  seen: boolean;
  correct: number;
  incorrect: number;
  missedAt: number | null;
  queue: string[];
  missed: string[];
}

export interface LearnSession {
  round: number;
  phase: 'question' | 'summary' | 'complete';
  /** Card ids still to be answered this round; queue[0] is the current card. */
  queue: string[];
  /** Every card that is part of this round. */
  roundCards: string[];
  /** Cards missed at least once this round. */
  missed: string[];
  /** Increments on every answer / new round. */
  step: number;
  /** Lets "I was actually right" reverse the last wrong answer. */
  undo: UndoInfo | null;
}

export interface StudySet {
  id: string;
  title: string;
  cards: Card[];
  settings: LearnSettings;
  session: LearnSession | null;
  createdAt: number;
  updatedAt: number;
}

export interface AppData {
  version: 1;
  theme: 'light' | 'dark';
  sets: StudySet[];
}

export const DEFAULT_SETTINGS: LearnSettings = {
  answerWith: 'term',
  questionTypes: 'both',
  shuffle: true,
  roundSize: 7,
  starredOnly: false,
};
