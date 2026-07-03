import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import './i18n';
import { logEvent } from './services/logging/clientLogger';
import { setupPwaUpdatePrompt } from './pwa';

setupPwaUpdatePrompt();

// Student-facing pages below are outside AppProvider, so the theme effect in
// AppContext never runs for them — set data-theme here so they aren't stuck on
// the dark :root default in index.css regardless of the saved preference.
try {
    const raw = localStorage.getItem('rm_settings');
    const theme = raw ? (JSON.parse(raw).theme ?? 'light') : 'light';
    document.documentElement.setAttribute('data-theme', theme);
} catch {
    document.documentElement.setAttribute('data-theme', 'light');
}

// Student-facing pages are outside AppProvider — they work from URL-encoded data only
const StudentFeedbackPage = lazy(() => import('./pages/StudentFeedbackPage'));
const RubricPreviewPage = lazy(() => import('./pages/RubricPreviewPage'));
const StudentEssayPage = lazy(() => import('./pages/StudentEssayPage'));
const StudentTestPage = lazy(() => import('./pages/StudentTestPage'));

function handleUnhandledRejection(event: PromiseRejectionEvent) {
    console.error('[unhandled rejection]', event.reason);
    logEvent('error', 'unhandled_rejection', { message: String(event.reason) }, 'error');
}
window.removeEventListener('unhandledrejection', handleUnhandledRejection);
window.addEventListener('unhandledrejection', handleUnhandledRejection);

const root = ReactDOM.createRoot(document.getElementById('root')!);

const STUDENT_ROUTES = ['/feedback/', '/preview/', '/essay/', '/test/'];
const TAB_LOCK = 'rubricmaker-active-tab';

function isStudentRoute() {
    const hash = window.location.hash.replace('#', '');
    return STUDENT_ROUTES.some((r) => hash.startsWith(r));
}

const router = createHashRouter([
    { path: '/feedback/:code', element: <StudentFeedbackPage /> },
    { path: '/preview/:code', element: <RubricPreviewPage /> },
    { path: '/essay/:code', element: <StudentEssayPage /> },
    { path: '/test/:code', element: <StudentTestPage /> },
    {
        path: '*',
        element: (
            <ToastProvider>
                <AppProvider>
                    <App />
                </AppProvider>
            </ToastProvider>
        ),
    },
]);

function renderApp() {
    root.render(
        <React.StrictMode>
            <Suspense fallback={null}>
                <RouterProvider router={router} />
            </Suspense>
        </React.StrictMode>
    );
}

function renderBlocked() {
    root.render(
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                gap: '16px',
                fontFamily: 'system-ui, sans-serif',
                color: '#64748b',
                padding: '24px',
                textAlign: 'center',
                background: '#f8fafc',
            }}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: '#334155' }}>
                RubricMaker is already open
            </h1>
            <p style={{ margin: 0, maxWidth: '380px', lineHeight: '1.6', fontSize: '15px' }}>
                To prevent data conflicts, only one tab can run RubricMaker at a time. Close the other tab or window,
                then reload this page.
            </p>
            <button
                onClick={() => window.location.reload()}
                style={{
                    marginTop: '8px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                }}
            >
                Reload
            </button>
        </div>
    );
}

if (isStudentRoute() || !('locks' in navigator)) {
    renderApp();
} else {
    navigator.locks.request(TAB_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
            renderBlocked();
            return;
        }
        renderApp();
        // Hold the lock until the tab is closed (never-resolving promise)
        return new Promise<void>(() => {});
    });
}
