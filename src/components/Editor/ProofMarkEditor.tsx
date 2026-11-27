import React, { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentMark } from '../../types';
import { getSymbol, PROOF_MARK_IDS } from '../../data/proofMarks';
import type { MarkEditInput } from '../../utils/proofMarkEdit';
import { formattingTargetFor } from '../../utils/markOperations';
import type { TextRange } from '../../utils/proofRail';
import MarkGlyph from './MarkGlyph';

const FIELD: React.CSSProperties = {
    boxSizing: 'border-box',
    width: '100%',
    padding: '3px 6px',
    border: '1px solid rgba(153, 27, 27, 0.3)',
    borderRadius: 4,
    background: '#fef2f2',
    color: 'var(--page-mark-ink, #991b1b)',
    font: 'inherit',
    fontSize: 12,
};

const LABEL: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
};

const BUTTON: React.CSSProperties = {
    padding: '3px 8px',
    border: '1px solid rgba(153, 27, 27, 0.3)',
    borderRadius: 4,
    background: '#fef2f2',
    color: 'var(--page-mark-ink, #991b1b)',
    font: 'inherit',
    fontSize: 11,
    cursor: 'pointer',
};

/** Only these symbols carry a replacement word; the note is the only free text the rest have. */
const WRITES_TEXT = new Set(['insertText', 'replaceRange']);

export interface ProofMarkEditorProps {
    marks: DocumentMark[];
    /** The range "move here" would re-anchor the mark to; null disables it. */
    selection: TextRange | null;
    canUndo: boolean;
    onEdit: (mark: DocumentMark, input: MarkEditInput) => void;
    onMove: (mark: DocumentMark) => void;
    onDelete: (mark: DocumentMark) => void;
    /**
     * Applies the mark to the document. Omitted when the surface cannot save the changed HTML —
     * an accept button that survives only until reload would claim a save that never happened.
     */
    onAccept?: (mark: DocumentMark) => void;
    onReject: (mark: DocumentMark) => void;
    /** The one batch action; omitted for the same reason as `onAccept`. */
    onAcceptAllFormatting?: () => void;
    /** Formatting marks on this page; 0 disables the one batch action. */
    formattingMarkCount: number;
    onUndo: () => void;
    onDismiss: () => void;
    dir?: 'ltr' | 'rtl';
}

interface MarkRowProps extends Omit<
    ProofMarkEditorProps,
    'marks' | 'canUndo' | 'onUndo' | 'onDismiss' | 'dir' | 'onAcceptAllFormatting' | 'formattingMarkCount'
> {
    mark: DocumentMark;
}

function MarkRow({ mark, selection, onEdit, onMove, onDelete, onAccept, onReject }: MarkRowProps) {
    const { t } = useTranslation();
    const fieldId = useId();
    const symbol = getSymbol(mark.symbolId);
    const label = t(symbol.labelKey);
    const formatting = formattingTargetFor(mark);
    const [note, setNote] = useState(mark.note ?? '');
    const [text, setText] = useState(mark.payload?.text ?? '');

    useEffect(() => setNote(mark.note ?? ''), [mark.note]);
    useEffect(() => setText(mark.payload?.text ?? ''), [mark.payload?.text]);

    const commitNote = () => onEdit(mark, { note });
    const commitText = () => onEdit(mark, { text });

    return (
        <div
            data-mark-id={mark.id}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 6,
                border: '1px solid rgba(153, 27, 27, 0.15)',
                borderRadius: 4,
            }}
        >
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                <span aria-hidden="true">
                    <MarkGlyph id={symbol.glyph} size={14} />
                </span>
                {label}
            </p>

            <label htmlFor={`${fieldId}-symbol`} style={LABEL}>
                {t('proofMarks.edit.symbol')}
                <select
                    id={`${fieldId}-symbol`}
                    value={symbol.id}
                    onChange={(event) => onEdit(mark, { symbolId: event.target.value })}
                    style={FIELD}
                >
                    {PROOF_MARK_IDS.map((id) => (
                        <option key={id} value={id}>
                            {t(getSymbol(id).labelKey)}
                        </option>
                    ))}
                </select>
            </label>

            <label htmlFor={`${fieldId}-note`} style={LABEL}>
                {t('proofMarks.edit.note')}
                <input
                    id={`${fieldId}-note`}
                    type="text"
                    value={note}
                    placeholder={t('proofMarks.edit.notePlaceholder')}
                    onChange={(event) => setNote(event.target.value)}
                    onBlur={commitNote}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        commitNote();
                    }}
                    style={FIELD}
                />
            </label>

            {symbol.operation && WRITES_TEXT.has(symbol.operation) && (
                <label htmlFor={`${fieldId}-text`} style={LABEL}>
                    {t('proofMarks.edit.replacement')}
                    <input
                        id={`${fieldId}-text`}
                        type="text"
                        value={text}
                        placeholder={t('proofMarks.edit.replacementPlaceholder')}
                        onChange={(event) => setText(event.target.value)}
                        onBlur={commitText}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            commitText();
                        }}
                        style={FIELD}
                    />
                </label>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => onMove(mark)}
                    disabled={!selection}
                    title={selection ? undefined : t('proofMarks.edit.noSelection')}
                    style={BUTTON}
                >
                    {t('proofMarks.edit.moveHere')}
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(mark)}
                    aria-label={`${t('proofMarks.edit.delete')}: ${label}`}
                    style={BUTTON}
                >
                    {t('proofMarks.edit.delete')}
                </button>
            </div>

            {formatting && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em' }}>
                        {t(`proofMarks.apply.status.${mark.status}`)}
                    </span>
                    {onAccept && (
                        <button
                            type="button"
                            onClick={() => onAccept(mark)}
                            disabled={mark.status === 'accepted'}
                            aria-label={`${t('proofMarks.apply.accept')}: ${label}`}
                            style={BUTTON}
                        >
                            {t('proofMarks.apply.accept')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onReject(mark)}
                        disabled={mark.status === 'rejected'}
                        aria-label={`${t('proofMarks.apply.reject')}: ${label}`}
                        style={BUTTON}
                    >
                        {t('proofMarks.apply.reject')}
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * The mark editor for the marks the rail line currently selects: change the symbol, write the
 * teacher's note or the corrected word, move the mark to the current selection, delete it, and undo
 * the last mark change. It is deliberately its own surface rather than the BubbleMenu — the marks
 * belong to the rail, and the popover's undo must not read as the editor's Ctrl+Z.
 */
export default function ProofMarkEditor({
    marks,
    selection,
    canUndo,
    onEdit,
    onMove,
    onDelete,
    onAccept,
    onReject,
    onAcceptAllFormatting,
    formattingMarkCount,
    onUndo,
    onDismiss,
    dir = 'ltr',
}: ProofMarkEditorProps) {
    const { t } = useTranslation();

    return (
        <section
            role="group"
            aria-label={t('proofMarks.edit.label')}
            dir={dir}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: 8,
                maxWidth: 420,
                border: '1px solid rgba(153, 27, 27, 0.25)',
                borderRadius: 6,
                background: 'var(--bg-elevated, #fff)',
                color: 'var(--text, #111827)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{t('proofMarks.edit.label')}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={onUndo} disabled={!canUndo} style={BUTTON}>
                        {t('proofMarks.edit.undo')}
                    </button>
                    <button type="button" onClick={onDismiss} aria-label={t('proofMarks.edit.close')} style={BUTTON}>
                        ✕
                    </button>
                </div>
            </div>

            {onAcceptAllFormatting && (
                <button
                    type="button"
                    onClick={onAcceptAllFormatting}
                    disabled={formattingMarkCount === 0}
                    title={formattingMarkCount === 0 ? t('proofMarks.apply.noFormatting') : undefined}
                    style={BUTTON}
                >
                    {t('proofMarks.apply.acceptAll')}
                </button>
            )}

            {marks.map((mark) => (
                <MarkRow
                    key={mark.id}
                    mark={mark}
                    selection={selection}
                    onEdit={onEdit}
                    onMove={onMove}
                    onDelete={onDelete}
                    onAccept={onAccept}
                    onReject={onReject}
                />
            ))}
        </section>
    );
}
