/** Card/set creation, bulk-paste parsing, and import/export. Pure functions. */
import { DEFAULT_SETTINGS } from '../types';
import type { AppData, Card, LearnSession, Level, StudySet } from '../types';
import { normalizeAnswer } from './learn';

export const uid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function makeCard(term: string, definition: string, now: number = Date.now()): Card {
  return {
    id: uid(),
    term: term.trim(),
    definition: definition.trim(),
    starred: false,
    level: 0,
    seen: false,
    correct: 0,
    incorrect: 0,
    missedAt: null,
    known: null,
    createdAt: now,
  };
}

export function makeSet(title: string, cards: Card[] = [], now: number = Date.now()): StudySet {
  return {
    id: uid(),
    title: title.trim() || 'Untitled set',
    cards,
    settings: { ...DEFAULT_SETTINGS },
    session: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function isDuplicateTerm(term: string, cards: readonly Card[], ignoreId?: string): boolean {
  const key = normalizeAnswer(term);
  if (!key) return false;
  return cards.some((c) => c.id !== ignoreId && normalizeAnswer(c.term) === key);
}

/* ------------------------------------------------------------------ */
/* Bulk paste                                                          */
/* ------------------------------------------------------------------ */

export interface ParsedRow {
  line: number;
  raw: string;
  term: string;
  definition: string;
  ok: boolean;
}

/** One card per line; each line is split at the FIRST occurrence of the separator. */
export function parseBulk(text: string, separator: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const at = separator ? raw.indexOf(separator) : -1;
    const term = at < 0 ? raw.trim() : raw.slice(0, at).trim();
    const definition = at < 0 ? '' : raw.slice(at + separator.length).trim();
    rows.push({ line: i + 1, raw, term, definition, ok: at >= 0 && !!term && !!definition });
  });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Export / import                                                     */
/* ------------------------------------------------------------------ */

export function exportSetJson(set: StudySet): string {
  const { session: _session, ...rest } = set;
  return JSON.stringify(
    { app: 'StudyLoop', version: 1, exportedAt: new Date().toISOString(), set: rest },
    null,
    2,
  );
}

export function exportAllJson(data: AppData): string {
  return JSON.stringify(
    {
      app: 'StudyLoop',
      version: 1,
      exportedAt: new Date().toISOString(),
      sets: data.sets.map(({ session: _session, ...rest }) => rest),
    },
    null,
    2,
  );
}

const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

/** Tab-separated text, one card per line (pastes straight back into bulk import). */
export function exportSetTsv(set: StudySet): string {
  return set.cards.map((c) => `${oneLine(c.term)}\t${oneLine(c.definition)}`).join('\n');
}

export function fileSlug(title: string): string {
  return title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'set';
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

function coerceCard(raw: unknown, freshIds: boolean, now: number): Card | null {
  if (!isObj(raw)) return null;
  const term = typeof raw.term === 'string' ? raw.term.trim() : '';
  const definition = typeof raw.definition === 'string' ? raw.definition.trim() : '';
  if (!term && !definition) return null;
  const level = raw.level === 1 || raw.level === 2 ? (raw.level as Level) : 0;
  return {
    id: !freshIds && typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    term,
    definition,
    starred: raw.starred === true,
    level,
    seen: raw.seen === true || level > 0,
    correct: Math.floor(num(raw.correct)),
    incorrect: Math.floor(num(raw.incorrect)),
    missedAt: typeof raw.missedAt === 'number' ? raw.missedAt : null,
    known: typeof raw.known === 'boolean' ? raw.known : null,
    createdAt: num(raw.createdAt, now),
  };
}

function coerceSession(raw: unknown, ids: Set<string>): LearnSession | null {
  if (!isObj(raw) || !Array.isArray(raw.queue)) return null;
  const phase = raw.phase;
  if (phase !== 'question' && phase !== 'summary' && phase !== 'complete') return null;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ids.has(x)) : [];
  const queue = list(raw.queue);
  if (phase === 'question' && queue.length === 0) return null;
  return {
    round: Math.floor(num(raw.round, 1)),
    phase,
    queue,
    roundCards: list(raw.roundCards),
    missed: list(raw.missed),
    step: Math.floor(num(raw.step)),
    undo: null,
  };
}

/** Validate anything set-shaped. `freshIds` is used for imports so nothing collides. */
export function coerceSet(raw: unknown, freshIds: boolean, now: number = Date.now()): StudySet | null {
  if (!isObj(raw) || !Array.isArray(raw.cards)) return null;
  const cards = raw.cards
    .map((c) => coerceCard(c, freshIds, now))
    .filter((c): c is Card => c !== null);
  const s = isObj(raw.settings) ? raw.settings : {};
  const roundSize = Math.floor(num(s.roundSize, DEFAULT_SETTINGS.roundSize));
  return {
    id: !freshIds && typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Imported set',
    cards,
    settings: {
      answerWith:
        s.answerWith === 'definition' || s.answerWith === 'both' ? s.answerWith : 'term',
      questionTypes:
        s.questionTypes === 'mc' || s.questionTypes === 'written' ? s.questionTypes : 'both',
      shuffle: s.shuffle !== false,
      roundSize: Math.min(50, Math.max(1, roundSize)),
      starredOnly: s.starredOnly === true,
    },
    session: freshIds ? null : coerceSession(raw.session, new Set(cards.map((c) => c.id))),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

/** Accepts a single-set export, a full backup, a bare set, or a bare array of cards. */
export function parseImport(text: string): StudySet[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  let candidates: unknown[];
  if (Array.isArray(json)) {
    candidates = json.some((x) => isObj(x) && Array.isArray(x.cards)) ? json : [{ cards: json }];
  } else if (isObj(json) && Array.isArray(json.sets)) {
    candidates = json.sets;
  } else if (isObj(json) && isObj(json.set)) {
    candidates = [json.set];
  } else {
    candidates = [json];
  }
  const sets = candidates
    .map((c) => coerceSet(c, true))
    .filter((s): s is StudySet => s !== null && s.cards.length > 0);
  if (sets.length === 0) throw new Error('No study sets with cards were found in that file.');
  return sets;
}
