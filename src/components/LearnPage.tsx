import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  answerCurrent,
  buildQuestion,
  countLevels,
  ensureSession,
  gradeWritten,
  hasRemaining,
  mostMissed,
  overrideLastAnswer,
  resetProgress,
  restartLearn,
  startRound,
  studyMostMissed,
  studyPool,
} from '../lib/learn';
import type { Grade, Question } from '../lib/learn';
import { paths } from '../router';
import { useStore } from '../store';
import type { LearnSettings, StudySet } from '../types';
import { AddCardsDialog } from './AddCards';
import { ConfirmDialog, Dialog } from './Dialog';
import { ProgressBar } from './ProgressBar';
import { NotFound, addCards, toggleStar } from './SetPage';

interface Feedback {
  question: Question;
  given: string;
  grade: Grade;
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
const isControl = (el: EventTarget | null) =>
  el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName);

export function LearnPage({ setId }: { setId: string }) {
  const { data, updateSet } = useStore();
  const set = data.sets.find((s) => s.id === setId);

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [input, setInput] = useState('');
  const [dialog, setDialog] = useState<null | 'add' | 'settings'>(null);
  const timer = useRef<number | undefined>(undefined);
  const feedbackShownAt = useRef(0);

  const session = set?.session ?? null;
  const settings = set?.settings;
  const pool = set ? studyPool(set) : [];

  // Start a round when there is no session, or when new cards arrived after finishing.
  useEffect(() => {
    if (set && ensureSession(set) !== set) updateSet(set.id, (s) => ensureSession(s));
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const currentId = session?.phase === 'question' ? session.queue[0] : undefined;
  const question = useMemo(() => {
    const card = set?.cards.find((c) => c.id === currentId);
    return set && card ? buildQuestion(card, set.cards, set.settings) : null;
    // Rebuilt only when the question changes - not when cards are added mid-question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, session?.step, settings?.answerWith, settings?.questionTypes]);

  const shown = feedback?.question ?? question;
  const shownCard = set?.cards.find((c) => c.id === shown?.cardId);

  const answer = (given: string, grade: Grade) => {
    if (!set || !question || feedback) return;
    const correct = grade !== 'wrong';
    const now = Date.now();
    updateSet(set.id, (s) => answerCurrent(s, question.cardId, correct, now));
    setFeedback({ question, given, grade });
    setInput('');
    feedbackShownAt.current = now;
    if (correct) {
      // Correct answers move on by themselves; near-misses linger so the spelling can be read.
      timer.current = window.setTimeout(() => setFeedback(null), grade === 'close' ? 2200 : 1000);
    }
  };

  const next = () => {
    // Guards against a held-down Enter skipping the correction.
    if (Date.now() - feedbackShownAt.current < 300) return;
    window.clearTimeout(timer.current);
    setFeedback(null);
  };

  const override = () => {
    if (!set) return;
    updateSet(set.id, (s) => overrideLastAnswer(s));
    window.clearTimeout(timer.current);
    setFeedback(null);
  };

  const submitWritten = (e: FormEvent) => {
    e.preventDefault();
    if (!question || !input.trim()) return;
    answer(input, gradeWritten(input, question.answer));
  };

  const continueRound = () => set && updateSet(set.id, (s) => (s.session?.phase === 'summary' ? startRound(s) : s));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (feedback) {
        if (e.key === 'Enter' && feedback.grade === 'wrong' && !isControl(e.target) && !e.repeat) {
          e.preventDefault();
          next();
        }
        return;
      }
      if (session?.phase === 'summary') {
        if (e.key === 'Enter' && !isControl(e.target) && !e.repeat) {
          e.preventDefault();
          continueRound();
        }
        return;
      }
      if (question?.type === 'mc' && !isTyping(e.target)) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= question.options.length) {
          e.preventDefault();
          const option = question.options[n - 1];
          answer(option, option === question.answer ? 'exact' : 'wrong');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!set || !settings) return <NotFound />;

  const update = (fn: (s: StudySet) => StudySet) => updateSet(set.id, fn);
  const counts = countLevels(pool);

  let body;
  if (pool.length === 0) {
    body = (
      <div className="panel center">
        <h2>{settings.starredOnly && set.cards.length > 0 ? 'No starred cards' : 'No cards yet'}</h2>
        <p className="muted">
          {settings.starredOnly && set.cards.length > 0
            ? '“Study starred cards only” is on, but nothing in this set is starred.'
            : 'Add some terms to start learning.'}
        </p>
        <div className="row center wrap">
          <button className="btn primary" onClick={() => setDialog('add')}>
            + Add term
          </button>
          {settings.starredOnly && (
            <button className="btn" onClick={() => setDialog('settings')}>
              Open settings
            </button>
          )}
        </div>
      </div>
    );
  } else if (shown && (feedback || session?.phase === 'question')) {
    body = (
      <div className="panel question">
        <div className="row between">
          <span className="muted small caps">
            {shown.answerWith === 'term' ? 'Definition' : 'Term'}
            {session?.missed.includes(shown.cardId) && !feedback && <span className="tag warn-tag">Let’s try again</span>}
          </span>
          {shownCard && (
            <button
              className={`icon-btn star${shownCard.starred ? ' on' : ''}`}
              onClick={() => update(toggleStar(shownCard.id))}
              aria-label={shownCard.starred ? 'Unstar this card' : 'Star this card'}
              aria-pressed={shownCard.starred}
            >
              {shownCard.starred ? '★' : '☆'}
            </button>
          )}
        </div>
        <p className="prompt">{shown.prompt}</p>

        {shown.type === 'mc' ? (
          <>
            <p className="muted small">Choose the matching {shown.answerWith}</p>
            <div className="options">
              {shown.options.map((option, i) => {
                const state = !feedback
                  ? ''
                  : option === shown.answer
                    ? ' correct'
                    : option === feedback.given
                      ? ' wrong'
                      : ' dim';
                return (
                  <button
                    key={`${i}-${option}`}
                    className={`option${state}`}
                    disabled={!!feedback}
                    onClick={() => answer(option, option === shown.answer ? 'exact' : 'wrong')}
                  >
                    <kbd>{i + 1}</kbd>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : !feedback ? (
          <form className="written" onSubmit={submitWritten}>
            <label>
              <span className="muted small">Type the {shown.answerWith}</span>
              <input
                key={session?.step}
                className="input big-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <div className="row end">
              <button className="btn ghost" type="button" onClick={() => answer('', 'wrong')}>
                Don’t know
              </button>
              <button className="btn primary" type="submit" disabled={!input.trim()}>
                Answer
              </button>
            </div>
          </form>
        ) : null}

        {feedback && (
          <div className={`feedback ${feedback.grade === 'wrong' ? 'bad' : 'good'}`} role="status">
            {feedback.grade === 'exact' && <strong>✓ Correct!</strong>}
            {feedback.grade === 'close' && (
              <>
                <strong>✓ Correct (watch the spelling)</strong>
                <div className="answer-line">
                  <span className="muted small">Exact answer</span>
                  <span>{shown.answer}</span>
                </div>
              </>
            )}
            {feedback.grade === 'wrong' && (
              <>
                <strong>✗ Not quite</strong>
                {shown.type === 'written' && (
                  <div className="answer-line">
                    <span className="muted small">You said</span>
                    <span className="given">{feedback.given.trim() || '(skipped)'}</span>
                  </div>
                )}
                <div className="answer-line">
                  <span className="muted small">Correct answer</span>
                  <span>{shown.answer}</span>
                </div>
                <div className="row wrap end">
                  {shown.type === 'written' && feedback.given.trim() && (
                    <button className="btn" onClick={override}>
                      I was actually right
                    </button>
                  )}
                  <button className="btn primary" onClick={next} autoFocus>
                    Continue <kbd>Enter</kbd>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  } else if (session?.phase === 'summary') {
    const cardOf = (id: string) => set.cards.find((c) => c.id === id);
    const missed = session.missed.map(cardOf).filter((c) => !!c);
    const right = session.roundCards
      .filter((id) => !session.missed.includes(id))
      .map(cardOf)
      .filter((c) => !!c);
    const done = !hasRemaining(set);
    body = (
      <div className="panel">
        <h2>Round {session.round} complete</h2>
        <p className="muted">
          {right.length} right first time, {missed.length} missed · {counts.mastered} of {counts.total} mastered overall
        </p>
        {missed.length > 0 && (
          <>
            <h3 className="bad-text">Missed ({missed.length})</h3>
            <ul className="summary-list">
              {missed.map((c) => (
                <li key={c!.id}>
                  <b>{c!.term}</b>
                  <span>{c!.definition}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {right.length > 0 && (
          <>
            <h3 className="good-text">Got right ({right.length})</h3>
            <ul className="summary-list">
              {right.map((c) => (
                <li key={c!.id}>
                  <b>{c!.term}</b>
                  <span>{c!.definition}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row end">
          <button className="btn primary big" onClick={continueRound} autoFocus>
            {done ? 'Finish' : 'Continue'} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    );
  } else if (session?.phase === 'complete') {
    const hardest = mostMissed(set);
    body = (
      <div className="panel center">
        <div className="trophy" aria-hidden="true">🎉</div>
        <h2>You’ve mastered {counts.total === 1 ? 'the card' : `all ${counts.total} cards`}!</h2>
        <p className="muted">
          {settings.starredOnly ? 'Every starred card' : 'Every card in this set'} is at “Mastered”. Add new terms
          any time and learn mode will pick up just the new ones.
        </p>
        <div className="row center wrap">
          <button className="btn primary" onClick={() => update(restartLearn)}>
            Restart learn mode
          </button>
          <button
            className="btn"
            disabled={hardest.length === 0}
            title={hardest.length === 0 ? 'You never missed a card' : undefined}
            onClick={() => update((s) => studyMostMissed(s))}
          >
            Study the {hardest.length > 1 ? `${hardest.length} cards` : 'card'} I missed most
          </button>
          <a className="btn" href={paths.set(set.id)}>
            Back to set
          </a>
        </div>
      </div>
    );
  } else {
    body = null; // a round is being prepared
  }

  return (
    <>
      <div className="learn-head">
        <a className="back" href={paths.set(set.id)}>
          ← {set.title}
        </a>
        <div className="row">
          {session && session.phase !== 'complete' && pool.length > 0 && (
            <span className="muted small">Round {session.round}</span>
          )}
          <button className="btn small primary" onClick={() => setDialog('add')}>
            + Add term
          </button>
          <button className="btn small" onClick={() => setDialog('settings')}>
            ⚙ Settings
          </button>
        </div>
      </div>

      <ProgressBar cards={pool} />
      {body}

      {dialog === 'add' && (
        <AddCardsDialog
          existing={set.cards}
          onAdd={(cards) => update(addCards(cards))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'settings' && (
        <LearnSettingsDialog set={set} update={update} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{props.label}</legend>
      <div className="segmented">
        {props.options.map((o) => (
          <label key={o.value} className={o.value === props.value ? 'active' : ''}>
            <input
              type="radio"
              name={props.label}
              checked={o.value === props.value}
              onChange={() => props.onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LearnSettingsDialog(props: {
  set: StudySet;
  update: (fn: (s: StudySet) => StudySet) => void;
  onClose: () => void;
}) {
  const { set, update, onClose } = props;
  const s = set.settings;
  const [roundSize, setRoundSize] = useState(String(s.roundSize));
  const [confirmReset, setConfirmReset] = useState(false);
  const starredCount = set.cards.filter((c) => c.starred).length;

  // Changing a setting rebuilds the current round; card progress is untouched.
  const change = (patch: Partial<LearnSettings>) =>
    update((cur) => ({ ...cur, settings: { ...cur.settings, ...patch }, session: null }));

  if (confirmReset) {
    return (
      <ConfirmDialog
        title="Reset progress?"
        message={<>Every card in “{set.title}” goes back to “Not studied” and its right/wrong counts are cleared. Your cards are kept.</>}
        confirmLabel="Reset progress"
        onConfirm={() => update(resetProgress)}
        onClose={() => setConfirmReset(false)}
      />
    );
  }

  return (
    <Dialog title="Learn settings" onClose={onClose}>
      <Segmented
        label="Answer with"
        value={s.answerWith}
        options={[
          { value: 'term', label: 'Term' },
          { value: 'definition', label: 'Definition' },
          { value: 'both', label: 'Both' },
        ]}
        onChange={(answerWith) => change({ answerWith })}
      />
      <Segmented
        label="Question types"
        value={s.questionTypes}
        options={[
          { value: 'both', label: 'Both' },
          { value: 'mc', label: 'Multiple choice' },
          { value: 'written', label: 'Written' },
        ]}
        onChange={(questionTypes) => change({ questionTypes })}
      />
      <label className="field inline-field">
        <span>Cards per round</span>
        <input
          className="input"
          type="number"
          min={1}
          max={50}
          value={roundSize}
          onChange={(e) => {
            setRoundSize(e.target.value);
            const n = Math.floor(Number(e.target.value));
            if (n >= 1 && n <= 50 && n !== s.roundSize) change({ roundSize: n });
          }}
          onBlur={() => setRoundSize(String(s.roundSize))}
          style={{ width: '5.5rem' }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={s.shuffle} onChange={(e) => change({ shuffle: e.target.checked })} />
        Shuffle cards
      </label>
      <label className="check">
        <input type="checkbox" checked={s.starredOnly} onChange={(e) => change({ starredOnly: e.target.checked })} />
        Study starred cards only <span className="muted">({starredCount} starred)</span>
      </label>
      <hr />
      <div className="row between wrap">
        <button className="btn danger-text" onClick={() => setConfirmReset(true)}>
          Reset progress…
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
