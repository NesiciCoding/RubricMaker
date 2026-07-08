import React from 'react';
import { useTranslation } from 'react-i18next';
import { GRAMMAR_CATEGORIES } from '../../data/grammarStandards';

interface Props {
    value: string | undefined;
    onChange: (grammarItemId: string | undefined) => void;
    id?: string;
    'aria-label'?: string;
}

/** A native grouped <select> for tagging a single grammar item (~48 items across ~10 categories — no search/modal needed). */
export default function GrammarItemSelect({ value, onChange, id, 'aria-label': ariaLabel }: Props) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    return (
        <select
            id={id}
            aria-label={ariaLabel ?? t('grammar.item_select_label')}
            className="input"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
        >
            <option value="">{t('grammar.no_item')}</option>
            {GRAMMAR_CATEGORIES.map((cat) => (
                <optgroup key={cat.id} label={lang === 'nl' ? cat.labelNl : cat.labelEn}>
                    {cat.items.map((item) => (
                        <option key={item.id} value={item.id}>
                            {lang === 'nl' ? item.labelNl : item.labelEn} ({item.level})
                        </option>
                    ))}
                </optgroup>
            ))}
        </select>
    );
}
