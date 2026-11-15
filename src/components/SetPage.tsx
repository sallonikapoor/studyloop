import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { exportSetJson, exportSetTsv, fileSlug, isDuplicateTerm } from '../lib/cards';
import { download } from '../lib/download';
import { removeCardFromSession } from '../lib/learn';
import { go, paths } from '../router';
import { useStore } from '../store';
import type { Card, StudySet } from '../types';
import { AddCardForm, AddCardsDialog } from './AddCards';
import { ConfirmDialog } from './Dialog';
import { LEVEL_NAMES, ProgressBar } from './ProgressBar';

export function NotFound() {
  return (
    <div className="empty">
      <p>That set doesn’t exist (it may have been deleted).</p>
      <a className="btn" href={paths.home}>
        Back to your sets
      </a>
    </div>
  );
}

export const addCards = (cards: Card[]) => (set: StudySet): StudySet => ({
  ...set,
  cards: [...set.cards, ...cards],
});

export const toggleStar = (cardId: string) => (set: StudySet): StudySet => ({
  ...set,
  cards: set.cards.map((c) => (c.id === cardId ? { ...c, starred: !c.starred } : c)),
});

export function SetPage({ setId }: { setId: string }) {
  const { data, updateSet, deleteSet } = useStore();
  const set = data.sets.find((s) => s.id === setId);

  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; term: string; definition: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDeleteSet, setConfirmDeleteSet] = useState(false);
  const [deleteCard, setDeleteCard] = useState<Card | null>(null);

  const filtered = useMemo(() => {
    if (!set) return [];
    const q = query.trim().toLowerCase();
    if (!q) return set.cards;
    return set.cards.filter(
      (c) => c.term.toLowerCase().includes(q) || c.definition.toLowerCase().includes(q),
    );
  }, [set, query]);

  if (!set) return <NotFound />;

  const update = (fn: (s: StudySet) => StudySet) => updateSet(set.id, fn);

  const saveRename = (e: FormEvent) => {
    e.preventDefault();
    const title = renaming?.trim();
    if (title) update((s) => ({ ...s, title }));
    setRenaming(null);
  };

  const saveEdit = () => {
    if (!editing) return;
    const term = editing.term.trim();
    const definition = editing.definition.trim();
    if (!term || !definition) return;
    // Progress is kept on purpose: only the text changes.
    update((s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === editing.id ? { ...c, term, definition } : c)),
    }));
    setEditing(null);
  };

  const editKeys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  const slug = fileSlug(set.title);

  return (
    <>
      <a className="back" href={paths.home}>
        ← All sets
      </a>

      <div className="set-head">
        {renaming !== null ? (
          <form className="row grow" onSubmit={saveRename}>
            <input
              className="input grow title-input"
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
              aria-label="Set name"
              autoFocus
            />
            <button className="btn primary" type="submit">
              Save
            </button>
            <button className="btn" type="button" onClick={() => setRenaming(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h1>{set.title}</h1>
            <div className="row wrap">
              <button className="btn small" onClick={() => setRenaming(set.title)}>
                Rename
              </button>
              <button className="btn small danger-text" onClick={() => setConfirmDeleteSet(true)}>
                Delete set
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <ProgressBar cards={set.cards} />
        <div className="row wrap study-buttons">
          <a
            className={`btn primary big${set.cards.length ? '' : ' disabled'}`}
            href={set.cards.length ? paths.learn(set.id) : undefined}
            aria-disabled={!set.cards.length}
          >
            ▶ Learn
          </a>
          <a
            className={`btn big${set.cards.length ? '' : ' disabled'}`}
            href={set.cards.length ? paths.flashcards(set.id) : undefined}
            aria-disabled={!set.cards.length}
          >
            Flashcards
          </a>
          <span className="grow" />
          <button
            className="btn small"
            disabled={!set.cards.length}
            onClick={() => download(`${slug}.json`, exportSetJson(set), 'application/json')}
          >
            Export JSON
          </button>
          <button
            className="btn small"
            disabled={!set.cards.length}
            onClick={() => download(`${slug}.txt`, exportSetTsv(set), 'text/plain')}
          >
            Export text (tab-separated)
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="row between">
          <h2>Add a card</h2>
          <button className="btn small" onClick={() => setBulkOpen(true)}>
            Bulk import…
          </button>
        </div>
        <AddCardForm existing={set.cards} onAdd={(cards) => update(addCards(cards))} />
      </div>

      <div className="row between wrap list-head">
        <h2>
          Cards <span className="muted">({set.cards.length})</span>
        </h2>
        <input
          className="input search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms and definitions"
          aria-label="Search cards"
        />
      </div>

      {set.cards.length === 0 ? (
        <p className="empty">No cards yet. Add your first one above, or use Bulk import.</p>
      ) : filtered.length === 0 ? (
        <p className="empty">No cards match “{query}”.</p>
      ) : (
        <ul className="card-list">
          {filtered.map((card) =>
            editing?.id === card.id ? (
              <li key={card.id} className="card-row editing">
                <div className="edit-fields">
                  <input
                    className="input"
                    value={editing.term}
                    onChange={(e) => setEditing({ ...editing, term: e.target.value })}
                    onKeyDown={editKeys}
                    aria-label="Term"
                    autoFocus
                  />
                  <input
                    className="input"
                    value={editing.definition}
                    onChange={(e) => setEditing({ ...editing, definition: e.target.value })}
                    onKeyDown={editKeys}
                    aria-label="Definition"
                  />
                  {isDuplicateTerm(editing.term, set.cards, card.id) && (
                    <span className="warn small">⚠ Another card already uses this term.</span>
                  )}
                </div>
                <div className="row">
                  <button className="btn small primary" onClick={saveEdit}>
                    Save
                  </button>
                  <button className="btn small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
              <li key={card.id} className="card-row">
                <button
                  className={`icon-btn star${card.starred ? ' on' : ''}`}
                  onClick={() => update(toggleStar(card.id))}
                  aria-label={card.starred ? 'Unstar' : 'Star'}
                  aria-pressed={card.starred}
                >
                  {card.starred ? '★' : '☆'}
                </button>
                <div className="card-text">
                  <div className="term">{card.term}</div>
                  <div className="definition">{card.definition}</div>
                </div>
                <div className="card-meta">
                  <span className={`badge l${card.level}`}>{LEVEL_NAMES[card.level]}</span>
                  {card.correct + card.incorrect > 0 && (
                    <span className="muted small" title="Times correct / incorrect">
                      ✓ {card.correct} · ✗ {card.incorrect}
                    </span>
                  )}
                </div>
                <div className="row">
                  <button
                    className="btn small"
                    onClick={() => setEditing({ id: card.id, term: card.term, definition: card.definition })}
                  >
                    Edit
                  </button>
                  <button className="btn small danger-text" onClick={() => setDeleteCard(card)}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      {bulkOpen && (
        <AddCardsDialog
          existing={set.cards}
          initialTab="bulk"
          onAdd={(cards) => update(addCards(cards))}
          onClose={() => setBulkOpen(false)}
        />
      )}
      {confirmDeleteSet && (
        <ConfirmDialog
          title="Delete this set?"
          message={
            <>
              “{set.title}” and its {set.cards.length} card{set.cards.length === 1 ? '' : 's'} will be
              permanently deleted. This can’t be undone.
            </>
          }
          confirmLabel="Delete set"
          onConfirm={() => {
            deleteSet(set.id);
            go(paths.home);
          }}
          onClose={() => setConfirmDeleteSet(false)}
        />
      )}
      {deleteCard && (
        <ConfirmDialog
          title="Delete this card?"
          message={<>“{deleteCard.term}” will be removed along with its progress.</>}
          confirmLabel="Delete card"
          onConfirm={() =>
            update((s) => ({
              ...s,
              cards: s.cards.filter((c) => c.id !== deleteCard.id),
              session: removeCardFromSession(s.session, deleteCard.id),
            }))
          }
          onClose={() => setDeleteCard(null)}
        />
      )}
    </>
  );
}
