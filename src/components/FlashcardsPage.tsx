import { useEffect, useState } from 'react';
import { shuffle } from '../lib/learn';
import { paths } from '../router';
import { useStore } from '../store';
import { NotFound, toggleStar } from './SetPage';

export function FlashcardsPage({ setId }: { setId: string }) {
  const { data, updateSet } = useStore();
  const set = data.sets.find((s) => s.id === setId);

  const [deckIds, setDeckIds] = useState<string[]>(() => set?.cards.map((c) => c.id) ?? []);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = deckIds
    .map((id) => set?.cards.find((c) => c.id === id))
    .filter((c) => c !== undefined);
  const card = deck[index];
  const finished = deck.length > 0 && index >= deck.length;

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(deck.length, i)));
    setFlipped(false);
  };
  const flip = () => setFlipped((f) => !f);
  const mark = (known: boolean) => {
    if (!set || !card) return;
    updateSet(set.id, (s) => ({
      ...s,
      cards: s.cards.map((c) => (c.id === card.id ? { ...c, known } : c)),
    }));
    goTo(index + 1);
  };
  const restart = (ids: string[], shuffled = false) => {
    setDeckIds(shuffled ? shuffle(ids) : ids);
    setIndex(0);
    setFlipped(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const onButton = e.target instanceof HTMLElement && /^(BUTTON|A|INPUT)$/.test(e.target.tagName);
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (e.key === ' ' && onButton) return; // let Space press the focused button
        e.preventDefault();
        if (card) flip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === '1' && card) {
        mark(false);
      } else if (e.key === '2' && card) {
        mark(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!set) return <NotFound />;

  const allIds = set.cards.map((c) => c.id);
  const learningIds = set.cards.filter((c) => c.known === false).map((c) => c.id);
  const knownCount = deck.filter((c) => c.known === true).length;
  const learningCount = deck.filter((c) => c.known === false).length;

  return (
    <>
      <div className="learn-head">
        <a className="back" href={paths.set(set.id)}>
          ← {set.title}
        </a>
        <div className="row">
          <button className="btn small" onClick={() => restart(deckIds, true)} disabled={deck.length < 2}>
            ⤮ Shuffle
          </button>
          <a className="btn small primary" href={paths.learn(set.id)}>
            Learn
          </a>
        </div>
      </div>

      {deck.length === 0 ? (
        <div className="panel center">
          <h2>No cards to show</h2>
          <a className="btn" href={paths.set(set.id)}>
            Back to set
          </a>
        </div>
      ) : finished ? (
        <div className="panel center">
          <h2>End of the deck</h2>
          <p className="muted">
            Know it: <b>{knownCount}</b> · Still learning: <b>{learningCount}</b>
          </p>
          <div className="row center wrap">
            <button className="btn primary" onClick={() => restart(allIds)} autoFocus>
              Start over
            </button>
            <button className="btn" disabled={learningIds.length === 0} onClick={() => restart(learningIds)}>
              Review “still learning” ({learningIds.length})
            </button>
            <a className="btn" href={paths.set(set.id)}>
              Back to set
            </a>
          </div>
        </div>
      ) : (
        card && (
          <>
            <div className="row between flash-top">
              <span className="muted small">
                Card {index + 1} of {deck.length}
                {card.known !== null && (
                  <span className={`tag ${card.known ? 'good-tag' : 'warn-tag'}`}>
                    {card.known ? 'Know it' : 'Still learning'}
                  </span>
                )}
              </span>
              <button
                className={`icon-btn star${card.starred ? ' on' : ''}`}
                onClick={() => updateSet(set.id, toggleStar(card.id))}
                aria-label={card.starred ? 'Unstar' : 'Star'}
                aria-pressed={card.starred}
              >
                {card.starred ? '★' : '☆'}
              </button>
            </div>

            <button
              className={`flashcard${flipped ? ' flipped' : ''}`}
              onClick={flip}
              aria-label={`${flipped ? 'Definition' : 'Term'}: ${flipped ? card.definition : card.term}. Press to flip.`}
            >
              <span className="flash-inner" key={card.id}>
                <span className="face front">
                  <small>Term</small>
                  {card.term}
                </span>
                <span className="face back">
                  <small>Definition</small>
                  {card.definition}
                </span>
              </span>
            </button>

            <div className="flash-controls">
              <button className="btn" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous card">
                ←
              </button>
              <button className="btn learning" onClick={() => mark(false)}>
                Still learning <kbd>1</kbd>
              </button>
              <button className="btn knowit" onClick={() => mark(true)}>
                Know it <kbd>2</kbd>
              </button>
              <button className="btn" onClick={() => goTo(index + 1)} aria-label="Next card">
                →
              </button>
            </div>
            <p className="muted small center-text hint">
              <kbd>Space</kbd> flip · <kbd>←</kbd> <kbd>→</kbd> back / next · <kbd>1</kbd> still learning · <kbd>2</kbd> know it
            </p>
          </>
        )
      )}
    </>
  );
}
