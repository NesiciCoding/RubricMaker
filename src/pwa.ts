import { registerSW } from 'virtual:pwa-register';
import { setUpdateAvailable } from './pwaUpdateStore';

// HashRouter never triggers a full-page navigation, and browsers only check
// a service worker for updates on navigation — so on a tab left open (or
// only ever hash-navigated), this app's SW could go days without noticing a
// new deploy exists. Poll registration.update() ourselves so onNeedRefresh
// actually fires.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function setupPwaUpdatePrompt() {
    const updateSW = registerSW({
        onNeedRefresh() {
            setUpdateAvailable(updateSW);
        },
        onRegisteredSW(_url, registration) {
            if (!registration) return;
            setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
        },
    });
}
