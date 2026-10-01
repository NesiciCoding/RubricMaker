import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nanoid } from '../../utils/nanoid';
import type { MatrixColumn, MatrixRow, TestQuestion } from '../../types';
import HelpPopover from './HelpPopover';

interface Props {
    question: TestQuestion;
    update: (patch: Partial<TestQuestion>) => void;
    partialCreditToggle: React.ReactNode;
}

export const defaultMatrixColumns = (): MatrixColumn[] => [
    { id: nanoid(), text: '' },
    { id: nanoid(), text: '' },
];

export const defaultMatrixRows = (columns: MatrixColumn[]): MatrixRow[] => [
    { id: nanoid(), text: '', correctColumnId: columns[0].id },
    { id: nanoid(), text: '', correctColumnId: columns[0].id },
];

export default function MatrixEditor({ question, update, partialCreditToggle }: Props) {
    const { t } = useTranslation();
    const columns = question.matrixColumns ?? [];
    const rows = question.matrixRows ?? [];

    const setColumn = (id: string, text: string) =>
        update({ matrixColumns: columns.map((c) => (c.id === id ? { ...c, text } : c)) });
    const removeColumn = (id: string) => {
        const remaining = columns.filter((c) => c.id !== id);
        update({
            matrixColumns: remaining,
            matrixRows: rows.map((r) => (r.correctColumnId === id ? { ...r, correctColumnId: remaining[0].id } : r)),
        });
    };
    const setRow = (id: string, patch: Partial<MatrixRow>) =>
        update({ matrixRows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label>
                    {t('tests.matrix_columns_label')}{' '}
                    <HelpPopover title={t('tests.help.matrix_teacher_title')}>
                        {t('tests.help.matrix_teacher_body')}
                    </HelpPopover>
                </label>
                {columns.map((col) => (
                    <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="text"
                            value={col.text}
                            onChange={(e) => setColumn(col.id, e.target.value)}
                            placeholder={t('tests.matrix_column_placeholder')}
                            aria-label={t('tests.matrix_column_placeholder')}
                            style={{ flex: 1 }}
                        />
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('tests.remove_option')}
                            style={{ color: 'var(--red)' }}
                            disabled={columns.length <= 2}
                            onClick={() => removeColumn(col.id)}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => update({ matrixColumns: [...columns, { id: nanoid(), text: '' }] })}
                >
                    <Plus size={14} /> {t('tests.matrix_add_column')}
                </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label>{t('tests.matrix_rows_label')}</label>
                {rows.map((row) => (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="text"
                            value={row.text}
                            onChange={(e) => setRow(row.id, { text: e.target.value })}
                            placeholder={t('tests.matrix_row_placeholder')}
                            aria-label={t('tests.matrix_row_placeholder')}
                            style={{ flex: 1, minWidth: 0 }}
                        />
                        <select
                            value={row.correctColumnId}
                            onChange={(e) => setRow(row.id, { correctColumnId: e.target.value })}
                            aria-label={t('tests.matrix_row_answer_label')}
                            style={{ width: 'auto', maxWidth: '40%', flexShrink: 0 }}
                        >
                            {columns.map((col, i) => (
                                <option key={col.id} value={col.id}>
                                    {col.text || `#${i + 1}`}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            aria-label={t('tests.remove_option')}
                            style={{ color: 'var(--red)' }}
                            disabled={rows.length <= 1}
                            onClick={() => update({ matrixRows: rows.filter((r) => r.id !== row.id) })}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                        update({
                            matrixRows: [...rows, { id: nanoid(), text: '', correctColumnId: columns[0]?.id ?? '' }],
                        })
                    }
                >
                    <Plus size={14} /> {t('tests.matrix_add_row')}
                </button>
            </div>
            {partialCreditToggle}
        </div>
    );
}
