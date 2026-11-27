import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import type { DocumentMark } from '../../types';
import { getSymbol } from '../../data/proofMarks';
import MarkGlyph from './MarkGlyph';
import type { ProofRailRow } from './useProofRail';
import { placePanel, type PanelAnchor, type PanelBounds, type PanelPlacement } from '../../utils/proofRail';

const ESTIMATED_WIDTH = 260;

export interface ProofMarkPopoverProps {
    row: ProofRailRow;
    /** `anchored` sits beside its chip; `sheet` is the narrow-screen bottom sheet. */
    variant?: 'anchored' | 'sheet';
    /** The chip the panel opens from, in rail-local px. Required when anchored. */
    anchor?: PanelAnchor;
    /** The page, in rail-local px — the panel may not leave it. Required when anchored. */
    bounds?: PanelBounds;
    dir: 'ltr' | 'rtl';
    titleId: string;
    /** Text currently under a mark's anchor, read from the editor; null when it no longer resolves. */
    snippetFor?: (mark: DocumentMark) => string | null;
    onClose: () => void;
}

/**
 * The marks on one rail line, opened from a chip. A Radix dialog with the line as its accessible
 * name, a list of instructions (symbol, what the teacher means, and the word as written → the
 * replacement), and Escape or Close to dismiss it.
 *
 * Radix owns the ARIA and Escape handling, so the panel is one of the shared dialog primitives
 * rather than another hand-rolled overlay. The anchored panel is non-modal — the rail's chips stay
 * reachable while it sits beside one — while the bottom sheet covers the screen on a narrow
 * viewport, so it is modal and traps focus until it closes. The sheet is portalled to <body> so
 * `position: fixed` cannot be captured by an animated ancestor; the anchored panel stays in the
 * rail, whose coordinate space its placement is measured in.
 *
 * Nothing here writes to the document: the panel only reads the anchor's text, so the essay HTML
 * stays free of marks.
 */
export default function ProofMarkPopover({
    row,
    variant = 'anchored',
    anchor,
    bounds,
    dir,
    titleId,
    snippetFor,
    onClose,
}: ProofMarkPopoverProps) {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const sheet = variant === 'sheet';
    const [placement, setPlacement] = useState<PanelPlacement>(() =>
        anchor && bounds
            ? placePanel(anchor, { width: ESTIMATED_WIDTH, height: 0 }, bounds)
            : { side: 'right', left: 0, top: 0, width: ESTIMATED_WIDTH }
    );

    // Measure once the panel exists: its height decides how far up the page it can sit. The bottom
    // sheet is fixed to the viewport, so there is nothing to measure for it.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel || !anchor || !bounds || sheet) return;
        setPlacement(
            placePanel(anchor, { width: panel.offsetWidth || ESTIMATED_WIDTH, height: panel.offsetHeight }, bounds)
        );
    }, [anchor, bounds, sheet]);

    useEffect(() => {
        closeRef.current?.focus();
    }, []);

    const panel = (
        <Dialog.Root open modal={sheet} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Content
                ref={panelRef}
                aria-labelledby={titleId}
                data-testid="proof-mark-panel"
                data-side={sheet ? 'sheet' : placement.side}
                onClick={(event) => event.stopPropagation()}
                style={{
                    ...(sheet
                        ? { position: 'fixed', left: 8, right: 8, bottom: 8, maxHeight: '60vh', overflowY: 'auto' }
                        : { position: 'absolute', top: placement.top, left: placement.left, width: placement.width }),
                    zIndex: sheet ? 60 : 6,
                    pointerEvents: 'auto',
                    background: '#ffffff',
                    color: '#2a261f',
                    border: '1px solid rgba(42, 38, 31, 0.18)',
                    borderRadius: 6,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                    padding: '10px 12px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 12,
                    lineHeight: 1.4,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <Dialog.Title asChild>
                        <h3 id={titleId} style={{ margin: 0, fontSize: 12, fontWeight: 600, flex: 1 }}>
                            {t('proofMarks.panel.title', { count: row.marks.length, line: row.line })}
                        </h3>
                    </Dialog.Title>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label={t('proofMarks.panel.close')}
                        title={t('proofMarks.panel.close')}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 2,
                            color: 'inherit',
                        }}
                    >
                        ×
                    </button>
                </div>

                <ul aria-label={t('proofMarks.panel.listLabel')} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {row.marks.map((mark) => {
                        const symbol = getSymbol(mark.symbolId);
                        const instruction = t(symbol.labelKey);
                        const current = snippetFor?.(mark) ?? null;
                        const replacement = mark.payload?.text ?? null;
                        return (
                            <li
                                key={mark.id}
                                data-mark-id={mark.id}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0' }}
                            >
                                <span
                                    aria-hidden="true"
                                    style={{
                                        display: 'inline-flex',
                                        marginTop: 1,
                                        color: 'var(--page-mark-ink, #991b1b)',
                                    }}
                                >
                                    <MarkGlyph id={symbol.glyph} dir={dir} size={14} />
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontFamily: 'monospace' }}>{symbol.glyph}</span>
                                    {' — '}
                                    {instruction}
                                    {(current || replacement) && (
                                        <span style={{ display: 'block', fontFamily: 'Georgia, serif' }}>
                                            {current}
                                            {current && replacement ? ' → ' : ''}
                                            {replacement}
                                        </span>
                                    )}
                                    {mark.note && (
                                        <span style={{ display: 'block', fontStyle: 'italic' }}>{mark.note}</span>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </Dialog.Content>
        </Dialog.Root>
    );

    // The sheet is fixed to the viewport, so it has to leave the page tree; the anchored panel keeps
    // rendering in the rail, whose coordinate space its placement is measured in.
    return sheet ? createPortal(panel, document.body) : panel;
}
