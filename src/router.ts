import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home' }
  | { page: 'set' | 'learn' | 'flashcards'; id: string };

export function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/set\/([^/]+)(?:\/(learn|flashcards))?\/?$/);
  if (!m) return { page: 'home' };
  return { page: (m[2] as 'learn' | 'flashcards' | undefined) ?? 'set', id: decodeURIComponent(m[1]) };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseRoute(hash);
}

export const paths = {
  home: '#/',
  set: (id: string) => `#/set/${encodeURIComponent(id)}`,
  learn: (id: string) => `#/set/${encodeURIComponent(id)}/learn`,
  flashcards: (id: string) => `#/set/${encodeURIComponent(id)}/flashcards`,
};

export function go(path: string) {
  window.location.hash = path;
}
