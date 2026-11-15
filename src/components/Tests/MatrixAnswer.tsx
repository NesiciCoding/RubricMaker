import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { withAnswer } from '../../utils/answerMap';
import type { TestQuestion } from '../../types';

interface Props {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    /** Effective content language of the question (BCP-47 base code). */
    lang?: string;
}

/** Statements down the side, shared answer options across the top; one radio per row. */
export default function MatrixAnswer({ question, value, onChange, lang }: Props) {
    const { t } = useTranslation();
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);
    const columns = question.matrixColumns ?? [];
    const cell = { padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' as const };

    return (
        <div lang={lang ?? 'en'} style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', color: 'var(--text)' }}>
                <thead>
                    <tr>
                        <th scope="col" style={{ ...cell, textAlign: 'left' }}>
                            <span className="sr-only">{t('tests.taking.matrix_statement')}</span>
                        </th>
                        {columns.map((col) => (
                            <th key={col.id} scope="col" style={cell}>
                                {col.text}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(question.matrixRows ?? []).map((row) => (
                        <tr key={row.id}>
                            <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>
                                {row.text}
                            </th>
                            {columns.map((col) => (
                                <td key={col.id} style={cell}>
                                    <input
                                        type="radio"
                                        name={`${question.id}-${row.id}`}
                                        aria-label={`${row.text} — ${col.text}`}
                                        checked={answers[row.id] === col.id}
                                        onChange={() => onChange(JSON.stringify(withAnswer(answers, row.id, col.id)))}
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
