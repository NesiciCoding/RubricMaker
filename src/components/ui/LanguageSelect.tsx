import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../context/AppContext';
import { UI_LANGUAGES, chosenUiLanguage, displayedUiLanguage } from '../../utils/uiLanguage';

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
    const value = chosenUiLanguage(settings) ?? displayedUiLanguage(i18n.language);

    return (
        <select
            id={id}
            className={className}
            style={style}
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => updateSettings({ language: e.target.value, languageChosen: true })}
        >
            {UI_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                    {t(`settings.language_${code}`)}
                </option>
            ))}
        </select>
    );
}
