import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isDuplicateTerm, makeCard, parseBulk } from '../lib/cards';
import { normalizeAnswer } from '../lib/learn';
import type { Card } from '../types';
import { Dialog } from './Dialog';

interface AddProps {
  existing: readonly Card[];
  onAdd: (cards: Card[]) => void;
}

/** Term box + definition box. Enter in the definition adds and returns to the term box. */
export function AddCardForm({ existing, onAdd, autoFocus }: AddProps & { autoFocus?: boolean }) {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [lastAdded, setLastAdded] = useState('');
  const termRef = useRef<HTMLInputElement>(null);
  const defRef = useRef<HTMLInputElement>(null);
  const duplicate = isDuplicateTerm(term, existing);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return termRef.current?.focus();
    if (!definition.trim()) return defRef.current?.focus();
    onAdd([makeCard(term, definition)]);
    setLastAdded(term.trim());
    setTerm('');
    setDefinition('');
    termRef.current?.focus();
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="add-fields">
        <label>
          <span>Term</span>
          <input
            ref={termRef}
            className="input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. Mitochondria"
            autoFocus={autoFocus}
            autoComplete="off"
          />
        </label>
        <label>
          <span>Definition</span>
          <input
            ref={defRef}
            className="input"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Press Enter to add"
            autoComplete="off"
          />
        </label>
        <button className="btn primary" type="submit">
          Add
        </button>
      </div>
      <div className="form-note" aria-live="polite">
        {duplicate ? (
          <span className="warn">⚠ A card with this term already exists. You can still add it.</span>
        ) : lastAdded ? (
          <span className="ok">✓ Added “{lastAdded}”</span>
        ) : null}
      </div>
    </form>
  );
}

const SEPARATORS = [
  { key: 'tab', label: 'Tab', value: '\t' },
  { key: 'comma', label: 'Comma ( , )', value: ',' },
  { key: 'dash', label: 'Dash with spaces ( - )', value: ' - ' },
  { key: 'semicolon', label: 'Semicolon ( ; )', value: ';' },
  { key: 'custom', label: 'Custom…', value: '' },
];

/** Paste many cards, pick a separator, preview the split, then confirm. */
export function BulkImport({ existing, onAdd }: AddProps) {
  const [text, setText] = useState('');
  const [sepKey, setSepKey] = useState('tab');
  const [custom, setCustom] = useState('');
  const [skipDupes, setSkipDupes] = useState(false);
  const [added, setAdded] = useState(0);

  const separator = sepKey === 'custom' ? custom : SEPARATORS.find((s) => s.key === sepKey)!.value;

  const rows = useMemo(() => {
    const seen = new Set(existing.map((c) => normalizeAnswer(c.term)));
    return parseBulk(text, separator).map((row) => {
      const key = normalizeAnswer(row.term);
      const duplicate = row.ok && !!key && seen.has(key);
      if (row.ok && key) seen.add(key);
      return { ...row, duplicate };
    });
  }, [text, separator, existing]);

  const valid = rows.filter((r) => r.ok);
  const dupes = valid.filter((r) => r.duplicate).length;
  const toAdd = skipDupes ? valid.filter((r) => !r.duplicate) : valid;
  const skipped = rows.length - valid.length;

  const confirm = () => {
    if (toAdd.length === 0) return;
    onAdd(toAdd.map((r) => makeCard(r.term, r.definition)));
    setAdded(toAdd.length);
    setText('');
  };

  return (
    <div className="bulk">
      <label>
        <span>Paste your cards — one per line</span>
        <textarea
          className="input"
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAdded(0);
          }}
          placeholder={'term 1[TAB]definition 1\nterm 2[TAB]definition 2'}
          spellCheck={false}
        />
      </label>
      <div className="row wrap">
        <label className="inline">
          <span>Between term and definition</span>
          <select className="input" value={sepKey} onChange={(e) => setSepKey(e.target.value)}>
            {SEPARATORS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {sepKey === 'custom' && (
          <label className="inline">
            <span>Custom separator</span>
            <input
              className="input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. = or ::"
              style={{ width: '8rem' }}
            />
          </label>
        )}
      </div>

      {added > 0 && rows.length === 0 && (
        <p className="ok" role="status">✓ Added {added} card{added === 1 ? '' : 's'}.</p>
      )}

      {rows.length > 0 && (
        <>
          <p className="muted small">
            Preview: <b>{valid.length}</b> card{valid.length === 1 ? '' : 's'} found
            {skipped > 0 && <>, <span className="warn">{skipped} line{skipped === 1 ? '' : 's'} can’t be split and will be skipped</span></>}
            {dupes > 0 && <>, <span className="warn">{dupes} duplicate term{dupes === 1 ? '' : 's'}</span></>}
            .
          </p>
          <div className="preview">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Definition</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr key={r.line} className={r.ok ? '' : 'bad'}>
                    {r.ok ? (
                      <>
                        <td>
                          {r.term} {r.duplicate && <span className="tag warn-tag">duplicate</span>}
                        </td>
                        <td>{r.definition}</td>
                      </>
                    ) : (
                      <td colSpan={2}>
                        <span className="tag warn-tag">skipped</span> {r.raw}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && <p className="muted small">…and {rows.length - 200} more lines.</p>}
          </div>
          {dupes > 0 && (
            <label className="check">
              <input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} />
              Skip duplicates
            </label>
          )}
        </>
      )}

      <div className="row end">
        <button className="btn primary" onClick={confirm} disabled={toAdd.length === 0}>
          Add {toAdd.length || ''} card{toAdd.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

interface DialogProps extends AddProps {
  onClose: () => void;
  initialTab?: 'one' | 'bulk';
}

/** Popup used on the set page and inside learn mode. */
export function AddCardsDialog({ existing, onAdd, onClose, initialTab = 'one' }: DialogProps) {
  const [tab, setTab] = useState(initialTab);
  return (
    <Dialog title="Add terms" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'one'} className={tab === 'one' ? 'active' : ''} onClick={() => setTab('one')}>
          One at a time
        </button>
        <button role="tab" aria-selected={tab === 'bulk'} className={tab === 'bulk' ? 'active' : ''} onClick={() => setTab('bulk')}>
          Paste a list
        </button>
      </div>
      {tab === 'one' ? (
        <AddCardForm existing={existing} onAdd={onAdd} autoFocus />
      ) : (
        <BulkImport existing={existing} onAdd={onAdd} />
      )}
      <div className="row end">
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
