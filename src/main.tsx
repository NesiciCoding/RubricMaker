import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import './i18n';
// import { MsalProvider } from '@azure/msal-react';
// import { msalInstance } from './services/msalConfig';

// Student-facing pages are outside AppProvider — they work from URL-encoded data only
const StudentFeedbackPage = lazy(() => import('./pages/StudentFeedbackPage'));
const RubricPreviewPage = lazy(() => import('./pages/RubricPreviewPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {/* MsalProvider disabled — Azure integration not in use */}
        <HashRouter>
            <Suspense fallback={null}>
                <Routes>
                    <Route path="/feedback/:code" element={<StudentFeedbackPage />} />
                    <Route path="/preview/:code" element={<RubricPreviewPage />} />
                    <Route path="*" element={
                        <AppProvider>
                            <ToastProvider>
                                <App />
                            </ToastProvider>
                        </AppProvider>
                    } />
                </Routes>
            </Suspense>
        </HashRouter>
    </React.StrictMode>
);
