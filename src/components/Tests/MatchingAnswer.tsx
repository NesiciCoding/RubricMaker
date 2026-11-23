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

/** Pick the right-hand partner for each left-hand item from a shuffled dropdown. */
export default function MatchingAnswer({ question, value, onChange, code, lang }: Props) {
    const { t } = useTranslation();
    const labelBase = useId();
    const pairs = question.matchingPairs ?? [];
    const distractors = question.matchingDistractors;
    const choices = useMemo(
        () =>
            seededShuffle(
                [
                    ...pairs.map((p) => ({ id: p.id, right: p.right })),
                    ...(distractors ?? []).filter(Boolean).map((right, i) => ({ id: `distractor-${i}`, right })),
                ],
                `${code}-${question.id}`
            ),
        [pairs, distractors, code, question.id]
    );
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setAnswer(leftId: string, chosenId: string) {
        onChange(JSON.stringify(withAnswer(answers, leftId, chosenId)));
    }

    return (
        <div lang={lang ?? 'en'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pairs.map((pair) => (
                <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span id={`${labelBase}-${pair.id}`} style={{ flex: 1, color: 'var(--text)' }}>
                        {pair.left}
                    </span>
                    <select
                        aria-labelledby={`${labelBase}-${pair.id}`}
                        value={answers[pair.id] ?? ''}
                        onChange={(e) => setAnswer(pair.id, e.target.value)}
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
                        <option value="">{t('tests.taking.matching_select_placeholder')}</option>
                        {choices.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.right}
                            </option>
                        ))}
                    </select>
                </div>
            ))}
        </div>
    );
}
