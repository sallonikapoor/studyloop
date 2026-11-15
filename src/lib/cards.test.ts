import { describe, expect, it } from 'vitest';
import {
  exportAllJson,
  exportSetJson,
  exportSetTsv,
  isDuplicateTerm,
  makeCard,
  makeSet,
  parseBulk,
  parseImport,
} from './cards';

describe('parseBulk', () => {
  it('splits tab-separated lines and skips blank ones', () => {
    const rows = parseBulk('hola\thello\n\nadiós\tgoodbye\r\n', '\t');
    expect(rows.map((r) => [r.term, r.definition, r.ok])).toEqual([
      ['hola', 'hello', true],
      ['adiós', 'goodbye', true],
    ]);
  });

  it('splits on the first occurrence of a custom separator', () => {
    const [row] = parseBulk('cell - the basic unit - of life', ' - ');
    expect(row).toMatchObject({ term: 'cell', definition: 'the basic unit - of life', ok: true });
    expect(parseBulk('a,b,c', ',')[0]).toMatchObject({ term: 'a', definition: 'b,c' });
  });

  it('flags lines that cannot be split', () => {
    const rows = parseBulk('no separator here\nterm\t\n\tdef', '\t');
    expect(rows.map((r) => r.ok)).toEqual([false, false, false]);
    expect(rows[0].line).toBe(1);
  });
});

describe('duplicates', () => {
  it('matches terms ignoring case and punctuation', () => {
    const cards = [makeCard('Mitochondria', 'x')];
    expect(isDuplicateTerm(' mitochondria. ', cards)).toBe(true);
    expect(isDuplicateTerm('nucleus', cards)).toBe(false);
    expect(isDuplicateTerm('Mitochondria', cards, cards[0].id)).toBe(false);
  });
});

describe('export / import', () => {
  const set = makeSet('Bio Ch. 4', [
    { ...makeCard('a', 'first\tdef'), level: 2, seen: true, correct: 3, starred: true },
    makeCard('b', 'second'),
  ]);

  it('exports tab-separated text that bulk import can read back', () => {
    const tsv = exportSetTsv(set);
    expect(tsv).toBe('a\tfirst def\nb\tsecond');
    expect(parseBulk(tsv, '\t').every((r) => r.ok)).toBe(true);
  });

  it('round-trips a set through JSON, keeping progress and issuing new ids', () => {
    const [back] = parseImport(exportSetJson(set));
    expect(back.title).toBe('Bio Ch. 4');
    expect(back.id).not.toBe(set.id);
    expect(back.cards).toHaveLength(2);
    expect(back.cards[0]).toMatchObject({ term: 'a', level: 2, correct: 3, starred: true });
    expect(back.cards[0].id).not.toBe(set.cards[0].id);
  });

  it('imports a full backup and a bare card array', () => {
    const backup = exportAllJson({ version: 1, theme: 'light', sets: [set, set] });
    expect(parseImport(backup)).toHaveLength(2);
    const bare = parseImport('[{"term":"x","definition":"y"}]');
    expect(bare[0].cards[0]).toMatchObject({ term: 'x', definition: 'y', level: 0 });
  });

  it('rejects junk', () => {
    expect(() => parseImport('not json')).toThrow();
    expect(() => parseImport('{"hello":1}')).toThrow();
  });
});
