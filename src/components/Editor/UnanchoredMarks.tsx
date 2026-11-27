import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentMark } from '../../types';
import { getSymbol } from '../../data/proofMarks';
import MarkGlyph from './MarkGlyph';

const BUTTON: React.CSSProperties = {
    padding: '2px 8px',
    border: '1px solid rgba(153, 27, 27, 0.3)',
    borderRadius: 4,
    background: '#fef2f2',
    color: 'var(--page-mark-ink, #991b1b)',
    font: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
};

export interface UnanchoredMarksProps {
    marks: DocumentMark[];
    onDelete: (mark: DocumentMark) => void;
    dir?: 'ltr' | 'rtl';
}

/**
 * Marks whose stored anchor no longer matches the document (out of bounds, or the words under it
 * changed) cannot be drawn on the page, and drawing them anyway would put feedback on the wrong
 * sentence. They are listed here with their instruction and note instead of disappearing, and can
 * be deleted — deletion is reversible through the same toast undo as a placed mark.
 */
export default function UnanchoredMarks({ marks, onDelete, dir = 'ltr' }: UnanchoredMarksProps) {
    const { t } = useTranslation();

    return (
        <section
            role="group"
            aria-label={t('proofMarks.unanchored.label')}
            dir={dir}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 8,
                maxWidth: 420,
                border: '1px solid rgba(153, 27, 27, 0.25)',
                borderRadius: 6,
                background: 'var(--bg-elevated, #fff)',
                color: 'var(--text, #111827)',
            }}
        >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{t('proofMarks.unanchored.label')}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{t('proofMarks.unanchored.hint')}</p>

            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {marks.map((mark) => {
                    const symbol = getSymbol(mark.symbolId);
                    const label = t(symbol.labelKey);
                    return (
                        <li
                            key={mark.id}
                            data-mark-id={mark.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}
                        >
                            <span aria-hidden="true">
                                <MarkGlyph id={symbol.glyph} size={14} />
                            </span>
                            <span>{label}</span>
                            {mark.note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mark.note}</span>}
                            <button
                                type="button"
                                onClick={() => onDelete(mark)}
                                aria-label={`${t('proofMarks.edit.delete')}: ${label}`}
                                style={BUTTON}
                            >
                                {t('proofMarks.edit.delete')}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
