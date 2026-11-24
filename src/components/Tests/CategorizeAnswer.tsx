import ItemImage from './ItemImage';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { seededShuffle } from '../../utils/seededShuffle';
import { withAnswer } from '../../utils/answerMap';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Put each shuffled item into one of the named categories. */
export default function CategorizeAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const labelBase = useId();
    const items = question.categorizeItems ?? [];
    const categories = question.categories ?? [];
    const shuffledItems = useMemo(() => seededShuffle(items, `${code}-${question.id}`), [items, code, question.id]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setAnswer(itemId: string, categoryId: string) {
        onChange(JSON.stringify(withAnswer(answers, itemId, categoryId)));
    }

    return (
        <div lang={lang ?? 'en'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shuffledItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ItemImage url={item.imageUrl} alt={item.text} />
                    <span id={`${labelBase}-${item.id}`} style={{ flex: 1, color: 'var(--text)' }}>
                        {item.text}
                    </span>
                    <select
                        aria-labelledby={`${labelBase}-${item.id}`}
                        value={answers[item.id] ?? ''}
                        onChange={(e) => setAnswer(item.id, e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                        }}
                    >
                        <option value="">{t('tests.taking.categorize_select_placeholder')}</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.label}
                            </option>
                        ))}
                    </select>
                </div>
            ))}
        </div>
    );
}
