import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import { i18nReady } from './i18n';
import { logEvent, logMetric, STRESS_TEST_LOGGING_ENABLED } from './services/logging/clientLogger';
import { setupPwaUpdatePrompt } from './pwa';

setupPwaUpdatePrompt();

function reportWebVitals() {
    if (!STRESS_TEST_LOGGING_ENABLED) return;

    try {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav) logMetric('page_load', Math.round(nav.duration));
    } catch {
        // Navigation Timing unsupported
    }

    // FCP and FID fire once per visit by definition, so the observer can log them directly.
    const observe = (type: string, name: string, pick: (entry: PerformanceEntry) => number) => {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) logMetric(name, pick(entry));
            });
            observer.observe({ type, buffered: true });
        } catch {
            // metric unsupported in this browser
        }
    };

    observe('first-contentful-paint', 'fcp', (e) => Math.round(e.startTime));
    observe('first-input', 'fid', (e) => {
        const timing = e as PerformanceEntry & { processingStart?: number };
        return Math.round((timing.processingStart ?? e.startTime) - e.startTime);
    });

    // LCP reports a candidate per render and CLS is a session-window aggregate, so neither
    // should be logged per raw entry: track them and emit one finalized value per visit.
    let lcp: number | undefined;
    let lcpFinalized = false;
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const e = entry as PerformanceEntry & { startTime: number; isFinal?: boolean };
                lcp = e.startTime;
                if (e.isFinal) {
                    logMetric('lcp', Math.round(e.startTime));
                    lcpFinalized = true;
                    observer.disconnect();
                }
            }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
        // metric unsupported in this browser
    }

    let clsMaxSession = 0;
    let clsSessionValue = 0;
    let clsSessionStart = -1;
    let clsLastShift = -1;
    let clsSeen = false;
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const e = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
                if (e.hadRecentInput) continue; // recent-input rule: ignore shifts near user input
                const now = e.startTime;
                // New session window after a >1s gap or once the current window exceeds 5s.
                if (clsLastShift === -1 || now - clsLastShift > 1000 || now - clsSessionStart > 5000) {
                    clsSessionValue = e.value ?? 0;
                    clsSessionStart = now;
                } else {
                    clsSessionValue += e.value ?? 0;
                }
                clsLastShift = now;
                clsSeen = true;
                clsMaxSession = Math.max(clsMaxSession, clsSessionValue);
            }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
        // metric unsupported in this browser
    }

    window.addEventListener(
        'pagehide',
        () => {
            if (lcp !== undefined && !lcpFinalized) logMetric('lcp', Math.round(lcp));
            if (clsSeen) logMetric('cls', Math.round(clsMaxSession * 10000) / 10000);
        },
        { once: true }
    );
}
reportWebVitals();

// Student-facing pages below are outside AppProvider, so the theme effect in
// AppContext never runs for them — set data-theme here so they aren't stuck on
// the dark :root default in index.css regardless of the saved preference.
try {
    const raw = localStorage.getItem('rm_settings');
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const theme =
        parsed && typeof parsed === 'object' && (parsed as { theme?: unknown }).theme === 'dark' ? 'dark' : 'light';
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
    // Student pages need toasts (e.g. the live-monitor nudge check-in banner), so
    // wrap them in ToastProvider like the main app route — without it, the
    // ToastContext default makes showToast a silent no-op.
    {
        path: '/essay/:code',
        element: (
            <ToastProvider>
                <StudentEssayPage />
            </ToastProvider>
        ),
    },
    {
        path: '/test/:code',
        element: (
            <ToastProvider>
                <StudentTestPage />
            </ToastProvider>
        ),
    },
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

function boot() {
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
}

// Wait for the `en` fallback bundle before the first render so no untranslated keys flash.
// `then(boot, boot)` — even if the fetch fails we still boot (a keyed UI beats a blank screen),
// and the locale-load rejection is consumed rather than surfacing as an unhandled rejection.
void i18nReady.then(boot, boot);
