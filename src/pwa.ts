import { registerSW } from 'virtual:pwa-register';
import i18n from './i18n';

// ponytail: a confirm() dialog is the whole UI here — a new version is rare
// enough that a blocking native prompt beats wiring a toast action button.
export function setupPwaUpdatePrompt() {
    const updateSW = registerSW({
        onNeedRefresh() {
            if (window.confirm(i18n.t('pwa.update_available_confirm'))) {
                updateSW();
            }
        },
    });
}
