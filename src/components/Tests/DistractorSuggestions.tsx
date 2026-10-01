import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestDistractors, type DistractorSuggestion } from '../../utils/distractorSuggestions';

interface Props {
    answer: string;
    /** Words already used as options, hidden from the chips */
    exclude?: string[];
    onPick: (word: string) => void;
    /** Defaults to distractor suggestions; the word-formation aid passes derived forms instead */
    suggest?: (answer: string) => DistractorSuggestion[];
    buttonLabel?: string;
}

export default function DistractorSuggestions({
    answer,
    exclude = [],
    onPick,
    suggest = suggestDistractors,
    buttonLabel,
}: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const word = answer.trim();
    if (!word) return null;
    const taken = new Set(exclude.map((w) => w.trim().toLowerCase()));
    const suggestions = open ? suggest(word).filter((s) => !taken.has(s.word)) : [];
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
                {buttonLabel ?? t('tests.distractors_button')}
            </button>
            {open && (
                <span className="text-muted text-xs">
                    {suggestions.length ? t('tests.distractors_for', { answer: word }) : t('tests.distractors_none')}
                </span>
            )}
            {suggestions.map((s) => (
                <button
                    key={s.word}
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title={t(`tests.distractor_source_${s.source}`)}
                    onClick={() => onPick(s.word)}
                >
                    {s.word}
                </button>
            ))}
        </div>
    );
}
