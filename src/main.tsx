import {createRoot} from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App.tsx';
import './index.css';
import { LangProvider } from './i18n';

// /docs is its own page, loaded only when someone opens it, so the main app bundle does not grow.
const DocsPage = lazy(() => import('./docs/DocsPage').then((m) => ({ default: m.DocsPage })));
const onDocs = window.location.pathname.replace(/\/+$/, '') === '/docs';

createRoot(document.getElementById('root')!).render(
  onDocs ? (
    <Suspense fallback={null}>
      <DocsPage />
    </Suspense>
  ) : (
    <LangProvider>
      <App />
    </LangProvider>
  )
);
