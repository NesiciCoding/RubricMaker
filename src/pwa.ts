import { registerSW } from 'virtual:pwa-register';

// ponytail: a confirm() dialog is the whole UI here — a new version is rare
// enough that a blocking native prompt beats wiring a toast action button.
export function setupPwaUpdatePrompt() {
    const updateSW = registerSW({
        onNeedRefresh() {
            if (window.confirm('A new version of RubricMaker is available. Reload now?')) {
                updateSW();
            }
        },
    });
}
