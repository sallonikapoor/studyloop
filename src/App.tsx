import { FlashcardsPage } from './components/FlashcardsPage';
import { HomePage } from './components/HomePage';
import { LearnPage } from './components/LearnPage';
import { SetPage } from './components/SetPage';
import { paths, useRoute } from './router';
import { useStore } from './store';

export function App() {
  const route = useRoute();
  const { data, toggleTheme, saveFailed } = useStore();
  const dark = data.theme === 'dark';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={paths.home}>
          <span className="brand-mark" aria-hidden="true">↻</span> StudyLoop
        </a>
        <button
          className="btn ghost small"
          onClick={toggleTheme}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '☀ Light' : '☾ Dark'}
        </button>
      </header>
      {saveFailed && (
        <div className="banner" role="alert">
          Your browser refused to save (storage may be full or blocked). Export your sets as a backup.
        </div>
      )}
      <main className="container">
        {route.page === 'home' && <HomePage />}
        {route.page === 'set' && <SetPage key={route.id} setId={route.id} />}
        {route.page === 'learn' && <LearnPage key={route.id} setId={route.id} />}
        {route.page === 'flashcards' && <FlashcardsPage key={route.id} setId={route.id} />}
      </main>
    </div>
  );
}
