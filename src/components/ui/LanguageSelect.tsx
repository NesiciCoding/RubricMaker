import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../context/AppContext';
import { UI_LANGUAGES, chosenUiLanguage, displayedUiLanguage } from '../../utils/uiLanguage';
import { resetLanguageDetectorCache } from '../../utils/languageDetectorCache';

const AUTO_VALUE = 'auto';

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
            resetLanguageDetectorCache();
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
