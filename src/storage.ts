import { coerceSet, makeCard, makeSet } from './lib/cards';
import type { AppData, StudySet } from './types';

export const STORAGE_KEY = 'studyloop:v1';

function sampleSet(): StudySet {
  const cards: [string, string][] = [
    ['Mitochondria', 'Organelle that produces most of the cell’s energy (ATP)'],
    ['Nucleus', 'Organelle that holds the cell’s DNA'],
    ['Ribosome', 'Structure that builds proteins from amino acids'],
    ['Chloroplast', 'Organelle where photosynthesis takes place'],
    ['Osmosis', 'Movement of water across a membrane toward higher solute concentration'],
    ['Diffusion', 'Movement of particles from high concentration to low concentration'],
    ['Enzyme', 'Protein that speeds up a chemical reaction'],
    ['Mitosis', 'Cell division that produces two identical daughter cells'],
    ['Photosynthesis', 'Process plants use to turn light, water and carbon dioxide into glucose'],
    ['Cell membrane', 'Thin barrier that controls what enters and leaves the cell'],
  ];
  return makeSet('Sample: Cell Biology', cards.map(([t, d]) => makeCard(t, d)));
}

export function loadData(): AppData {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sets)) {
        return {
          version: 1,
          theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : prefersDark ? 'dark' : 'light',
          sets: (parsed.sets as unknown[])
            .map((s) => coerceSet(s, false))
            .filter((s): s is StudySet => s !== null),
        };
      }
    }
  } catch {
    // fall through to a fresh start
  }
  if (raw) {
    // Unreadable data: keep a copy rather than silently overwriting it.
    try {
      localStorage.setItem(`${STORAGE_KEY}:unreadable-backup`, raw);
    } catch {
      /* ignore */
    }
  }
  return { version: 1, theme: prefersDark ? 'dark' : 'light', sets: [sampleSet()] };
}

/** Returns false if the browser refused to store the data (e.g. storage full). */
export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
