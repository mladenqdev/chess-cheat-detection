import { useEffect, useState } from 'react';
import { ContactPage } from './report/ContactPage';
import { MethodologyPage } from './report/MethodologyPage';
import { ReportPage } from './report/ReportPage';

function usePathRoute(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

const TITLES: Record<string, string> = {
  '/methodology': 'Methodology - Chess Cheat Detection',
  '/contact': 'Contact - Chess Cheat Detection',
};
const DEFAULT_TITLE = 'Chess Cheat Detection - is that account playing like a human?';

export default function App() {
  const path = usePathRoute();

  // old share links used hash routes (#/u/..., #/methodology); map them to real paths
  useEffect(() => {
    const { hash } = window.location;
    if (hash.startsWith('#/')) window.location.replace(hash.slice(1));
  }, []);

  useEffect(() => {
    document.title = TITLES[path] ?? DEFAULT_TITLE;
  }, [path]);

  const page =
    path === '/methodology' ? (
      <MethodologyPage />
    ) : path === '/contact' ? (
      <ContactPage />
    ) : (
      <ReportPage />
    );

  return (
    <div className="app">
      <nav className="topnav">
        <a href="/" className="wordmark">
          chesscheatdetection
        </a>
        <span className="topnav-links">
          <a href="/methodology">methodology</a>
          <a href="/contact">contact</a>
        </span>
      </nav>
      <main>{page}</main>
      <footer className="site-footer muted small">
        <p>
          Found this tool useful?{' '}
          <a href="https://buymeacoffee.com/mladenq" target="_blank" rel="noreferrer">
            Buy me a coffee ☕
          </a>
        </p>
        <p>Not affiliated with lichess or chess.com. Engine analysis runs in your browser.</p>
      </footer>
    </div>
  );
}
