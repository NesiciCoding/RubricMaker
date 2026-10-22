import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../context/AppContext';
import { UI_LANGUAGES, chosenUiLanguage, displayedUiLanguage } from '../../utils/uiLanguage';

const AUTO_VALUE = 'auto';
// The default lookupLocalStorage key i18next-browser-languagedetector caches a resolved language
// under — must be cleared before re-detecting, or detect() just reads the stale cached choice back.
const LANGUAGE_DETECTOR_CACHE_KEY = 'i18nextLng';

interface LanguageSelectProps {
    id?: string;
    /** Accessible name when no visible <label htmlFor={id}> names the control. */
    ariaLabel?: string;
    className?: string;
    style?: CSSProperties;
}

export default function LanguageSelect({ id, ariaLabel, className, style }: LanguageSelectProps) {
    const { t, i18n } = useTranslation();
    const { settings, updateSettings } = useSettings();
    const chosen = chosenUiLanguage(settings);
    const displayed = displayedUiLanguage(i18n.language);
    const value = chosen ?? AUTO_VALUE;

    function handleChange(next: string) {
        if (next === AUTO_VALUE) {
            try {
                localStorage.removeItem(LANGUAGE_DETECTOR_CACHE_KEY);
            } catch {
                // Private-mode/blocked storage — detect() still runs, just without a cache to clear.
            }
            updateSettings({ languageChosen: false });
            void i18n.changeLanguage();
            return;
        }
        updateSettings({ language: next, languageChosen: true });
    }

    return (
        <select
            id={id}
            className={className}
            style={style}
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
        >
            <option value={AUTO_VALUE}>
                {t('settings.language_auto', { language: t(`settings.language_${displayed}`) })}
            </option>
            {UI_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                    {t(`settings.language_${code}`)}
                </option>
            ))}
        </select>
    );
}
