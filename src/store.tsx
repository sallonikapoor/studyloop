import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { makeSet } from './lib/cards';
import { STORAGE_KEY, loadData, saveData } from './storage';
import type { AppData, StudySet } from './types';

interface Store {
  data: AppData;
  saveFailed: boolean;
  /** Apply a pure update to one set. Returning the same object is a no-op. */
  updateSet: (id: string, fn: (set: StudySet) => StudySet) => void;
  createSet: (title: string) => string;
  addSets: (sets: StudySet[]) => void;
  deleteSet: (id: string) => void;
  toggleTheme: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [saveFailed, setSaveFailed] = useState(false);

  // Persist after every change (this is what saves progress after each answer).
  useEffect(() => {
    setSaveFailed(!saveData(data));
  }, [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = data.theme;
  }, [data.theme]);

  // Stay in sync if the app is open in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) setData(loadData());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateSet = useCallback((id: string, fn: (set: StudySet) => StudySet) => {
    setData((d) => {
      const current = d.sets.find((s) => s.id === id);
      if (!current) return d;
      const next = fn(current);
      if (next === current) return d;
      const stamped = { ...next, updatedAt: Date.now() };
      return { ...d, sets: d.sets.map((s) => (s.id === id ? stamped : s)) };
    });
  }, []);

  const createSet = useCallback((title: string) => {
    const set = makeSet(title);
    setData((d) => ({ ...d, sets: [set, ...d.sets] }));
    return set.id;
  }, []);

  const addSets = useCallback((sets: StudySet[]) => {
    setData((d) => ({ ...d, sets: [...sets, ...d.sets] }));
  }, []);

  const deleteSet = useCallback((id: string) => {
    setData((d) => ({ ...d, sets: d.sets.filter((s) => s.id !== id) }));
  }, []);

  const toggleTheme = useCallback(() => {
    setData((d) => ({ ...d, theme: d.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const store = useMemo(
    () => ({ data, saveFailed, updateSet, createSet, addSets, deleteSet, toggleTheme }),
    [data, saveFailed, updateSet, createSet, addSets, deleteSet, toggleTheme],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
