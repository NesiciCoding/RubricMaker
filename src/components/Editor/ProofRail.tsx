import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentMark, MarkStatus } from '../../types';
import { getGlyph, getSymbol } from '../../data/proofMarks';
import MarkGlyph from './MarkGlyph';
import ProofMarkPopover from './ProofMarkPopover';
import type { ProofRailBox, ProofRailRow } from './useProofRail';

/**
 * Chip sizes are inherited from the Phase 0 measurement, not re-chosen: 20 px tall inside the
 * 28 px line pitch, one chip per line, so a full page needs no stacking at all. Letter chips get
 * the extra width two letterforms need; a grouped chip carries a count badge.
 */
const CHIP_HEIGHT = 20;
const STROKE_CHIP_WIDTH = 28;
const LETTER_CHIP_WIDTH = 36;
const GROUPED_CHIP_WIDTH = 44;

/**
 * The four contrast-guarded mark inks; status is never drawn with opacity. Noted and proposed read
 * the page-mode mark token so the sheet, the chips and the panel share one declaration; the
 * fallback is the measured light value, for as long as the token is not declared.
 */
const INK: Record<MarkStatus, string> = {
    noted: 'var(--page-mark-ink, #991b1b)',
    proposed: 'var(--page-mark-ink, #991b1b)',
    accepted: '#08473e',
    rejected: '#534d45',
};

const VISUALLY_HIDDEN: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

function chipWidth(row: ProofRailRow): number {
    const primary = row.marks[0];
    if (!primary) return STROKE_CHIP_WIDTH;
    if (row.marks.length > 1 || row.multiLine) return GROUPED_CHIP_WIDTH;
    return getGlyph(primary.symbolId).kind === 'letter' ? LETTER_CHIP_WIDTH : STROKE_CHIP_WIDTH;
}

export interface ProofRailProps {
    rows: ProofRailRow[];
    box: ProofRailBox;
    dir?: 'ltr' | 'rtl';
    /** Line whose marks are currently highlighted in the text. */
    activeLine: number | null;
    onSelectLine: (line: number | null) => void;
    /** Text currently under a mark's anchor, read from the editor; shown in the reveal panel. */
    snippetFor?: (mark: DocumentMark) => string | null;
}

export default function ProofRail({ rows, box, dir = 'ltr', activeLine, onSelectLine, snippetFor }: ProofRailProps) {
    const { t } = useTranslation();
    const [focusIndex, setFocusIndex] = useState(0);
    const [openId, setOpenId] = useState<string | null>(null);
    const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
    const openRow = rows.find((row) => row.id === openId) ?? null;

    // A re-measure can drop the row that was focused or opened; never leave either pointing at
    // a chip that no longer exists.
    useEffect(() => {
        setFocusIndex((index) => Math.min(index, Math.max(0, rows.length - 1)));
    }, [rows.length]);

    useEffect(() => {
        if (openId && !rows.some((row) => row.id === openId)) setOpenId(null);
    }, [rows, openId]);

    useEffect(() => {
        if (openId) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onSelectLine(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [openId, onSelectLine]);

    const openPanel = (row: ProofRailRow) => {
        setOpenId(row.id);
        if (activeLine !== row.line) onSelectLine(row.line);
    };

    // Escape and Close both land here: focus goes back to the chip that opened the panel.
    const closePanel = () => {
        const trigger = openId ? buttonRefs.current.get(openId) : null;
        setOpenId(null);
        trigger?.focus();
    };

    const focusRow = (index: number) => {
        const next = Math.min(Math.max(index, 0), Math.max(0, rows.length - 1));
        setFocusIndex(next);
        const row = rows[next];
        if (row) buttonRefs.current.get(row.id)?.focus();
    };

    const totalMarks = rows.reduce((sum, row) => sum + row.marks.length, 0);
    const bounds = {
        top: -box.top,
        left: -box.left,
        right: box.width - box.left,
        bottom: box.height - box.top,
        width: box.width,
    };

    return (
        <div
            data-testid="proof-rail"
            className="proof-rail"
            role="group"
            aria-label={t('proofMarks.rail.label')}
            style={{
                position: 'absolute',
                top: box.top,
                left: box.left,
                height: box.height,
                width: 72,
                zIndex: 4,
                pointerEvents: 'none',
            }}
        >
            <span role="status" aria-live="polite" style={VISUALLY_HIDDEN}>
                {rows.length > 0 ? t('proofMarks.rail.summary', { count: totalMarks, lines: rows.length }) : ''}
            </span>

            {rows
                .filter((row) => row.stacked)
                .map((row) => (
                    <React.Fragment key={`leader-${row.id}`}>
                        <span
                            aria-hidden="true"
                            className="proof-rail-leader"
                            style={{
                                position: 'absolute',
                                top: row.center,
                                left: -7,
                                width: 1,
                                height: Math.max(0, row.top + CHIP_HEIGHT / 2 - row.center),
                                background: 'rgba(153, 27, 27, 0.35)',
                            }}
                        />
                        <span
                            aria-hidden="true"
                            className="proof-rail-tick"
                            style={{
                                position: 'absolute',
                                top: row.center,
                                left: -9,
                                width: 5,
                                height: 1,
                                background: 'rgba(153, 27, 27, 0.55)',
                            }}
                        />
                    </React.Fragment>
                ))}

            {rows.map((row, index) => {
                const primary = row.marks[0];
                if (!primary) return null;

                const symbol = getSymbol(primary.symbolId);
                const count = row.marks.length;
                const width = chipWidth(row);
                const active = activeLine === row.line;
                const open = openId === row.id;
                const symbols = row.marks.map((mark) => t(getSymbol(mark.symbolId).labelKey)).join('; ');
                const label = `${t('proofMarks.rail.chipLabel', { count, line: row.line, symbols })}${
                    row.multiLine ? ` — ${t('proofMarks.rail.spansLines')}` : ''
                }`;

                return (
                    <button
                        key={row.id}
                        ref={(node) => {
                            if (node) buttonRefs.current.set(row.id, node);
                            else buttonRefs.current.delete(row.id);
                        }}
                        type="button"
                        data-mark-line={row.line}
                        data-mark-ids={row.ids.join(' ')}
                        data-active={active ? 'true' : 'false'}
                        aria-label={label}
                        title={label}
                        aria-pressed={active}
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        // Roving tabindex: one tab stop for the whole rail, arrows move within it.
                        tabIndex={index === focusIndex ? 0 : -1}
                        onFocus={() => setFocusIndex(index)}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                focusRow(index + 1);
                            } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                focusRow(index - 1);
                            } else if (event.key === 'Home') {
                                event.preventDefault();
                                focusRow(0);
                            } else if (event.key === 'End') {
                                event.preventDefault();
                                focusRow(rows.length - 1);
                            }
                        }}
                        onClick={() => {
                            if (open) closePanel();
                            else openPanel(row);
                        }}
                        style={{
                            position: 'absolute',
                            top: row.top,
                            insetInlineStart: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2,
                            width,
                            height: CHIP_HEIGHT,
                            paddingInline: 2,
                            border: '1px solid rgba(153, 27, 27, 0.25)',
                            borderRadius: 4,
                            background: open ? '#fde8e8' : '#fef2f2',
                            color: INK[primary.status],
                            fontFamily: 'Georgia, "Times New Roman", serif',
                            fontSize: 11,
                            lineHeight: 1,
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                        }}
                    >
                        <span
                            aria-hidden="true"
                            style={{
                                display: 'inline-flex',
                                textDecoration: primary.status === 'rejected' ? 'line-through' : undefined,
                            }}
                        >
                            <MarkGlyph id={symbol.glyph} dir={dir} size={14} />
                        </span>
                        {count > 1 && (
                            <span aria-hidden="true" style={{ fontSize: 9 }}>
                                {count}
                            </span>
                        )}
                        {row.multiLine && (
                            <span aria-hidden="true" style={{ fontSize: 10 }}>
                                ↳
                            </span>
                        )}
                    </button>
                );
            })}

            {openRow && openRow.marks[0] && (
                <ProofMarkPopover
                    key={openRow.id}
                    row={openRow}
                    anchor={{ top: openRow.top, left: 0, width: chipWidth(openRow), height: CHIP_HEIGHT }}
                    bounds={bounds}
                    dir={dir}
                    titleId={`proof-rail-title-${openRow.id}`}
                    snippetFor={snippetFor}
                    onClose={closePanel}
                />
            )}
        </div>
    );
}
