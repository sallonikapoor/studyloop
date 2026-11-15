import { countLevels } from '../lib/learn';
import type { Card } from '../types';

export function ProgressBar({ cards, compact }: { cards: readonly Card[]; compact?: boolean }) {
  const { notStudied, familiar, mastered, total } = countLevels(cards);
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  const label = `${notStudied} not studied, ${familiar} familiar, ${mastered} mastered`;
  return (
    <div className="progress-wrap">
      <div className="progress" role="img" aria-label={label}>
        <span className="seg l2" style={{ width: pct(mastered) }} />
        <span className="seg l1" style={{ width: pct(familiar) }} />
        <span className="seg l0" style={{ width: pct(notStudied) }} />
      </div>
      {!compact && (
        <div className="legend">
          <span><i className="dot l0" /> Not studied <b>{notStudied}</b></span>
          <span><i className="dot l1" /> Familiar <b>{familiar}</b></span>
          <span><i className="dot l2" /> Mastered <b>{mastered}</b></span>
        </div>
      )}
    </div>
  );
}

export const LEVEL_NAMES = ['Not studied', 'Familiar', 'Mastered'] as const;
