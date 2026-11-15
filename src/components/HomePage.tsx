import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { exportAllJson, parseImport } from '../lib/cards';
import { download } from '../lib/download';
import { go, paths } from '../router';
import { useStore } from '../store';
import { ProgressBar } from './ProgressBar';

export function HomePage() {
  const { data, createSet, addSets } = useStore();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    go(paths.set(createSet(title)));
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const sets = parseImport(await file.text());
      addSets(sets);
      const cards = sets.reduce((n, s) => n + s.cards.length, 0);
      setMessage({ ok: true, text: `Imported ${sets.length} set${sets.length === 1 ? '' : 's'} (${cards} cards).` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Import failed.' });
    }
  };

  return (
    <>
      <h1>Your study sets</h1>

      <form className="panel row wrap" onSubmit={create}>
        <input
          className="input grow"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New set name, e.g. Bio Ch. 4"
          aria-label="New set name"
        />
        <button className="btn primary" type="submit" disabled={!title.trim()}>
          + Create set
        </button>
      </form>

      {data.sets.length === 0 ? (
        <p className="empty">No sets yet. Create one above or import a JSON backup.</p>
      ) : (
        <div className="set-grid">
          {data.sets.map((set) => (
            <a key={set.id} className="set-tile" href={paths.set(set.id)}>
              <h3>{set.title}</h3>
              <p className="muted small">
                {set.cards.length} card{set.cards.length === 1 ? '' : 's'}
              </p>
              <ProgressBar cards={set.cards} compact />
            </a>
          ))}
        </div>
      )}

      <div className="row wrap backup">
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import from JSON
        </button>
        <button
          className="btn"
          disabled={data.sets.length === 0}
          onClick={() =>
            download(`studyloop-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAllJson(data), 'application/json')
          }
        >
          Back up all sets (JSON)
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={importFile} />
        {message && (
          <span className={message.ok ? 'ok' : 'warn'} role="status">
            {message.text}
          </span>
        )}
      </div>
      <p className="muted small">
        Everything is stored in this browser only. Export a backup now and then so you can’t lose it.
      </p>
    </>
  );
}
