import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';
import './i18n';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './services/msalConfig';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <MsalProvider instance={msalInstance}>
            <HashRouter>
                <AppProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </AppProvider>
            </HashRouter>
        </MsalProvider>
    </React.StrictMode>
);
