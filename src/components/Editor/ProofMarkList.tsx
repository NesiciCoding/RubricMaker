import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentMark } from '../../types';
import { getSymbol } from '../../data/proofMarks';
import MarkGlyph from './MarkGlyph';
import ProofMarkPopover from './ProofMarkPopover';
import type { ProofRailRow } from './useProofRail';

/**
 * How many marks a paragraph shows before the list asks for "show all". Two keeps a marked essay
 * scannable on a phone without hiding the shape of the marking: a paragraph with six marks still
 * reads as "six", because the count is on the toggle and the overflow line.
 */
export const COLLAPSED_PER_PARAGRAPH = 2;

/** Paragraph number for a row; 0 when the measurement could not read one. */
function blockOf(row: ProofRailRow): number {
    return row.block ?? 0;
}

export interface ProofMarkListProps {
    /** The same rows the rail draws; only the presentation differs. */
    rows: ProofRailRow[];
    dir?: 'ltr' | 'rtl';
    activeLine: number | null;
    onSelectLine: (line: number | null) => void;
    snippetFor?: (mark: DocumentMark) => string | null;
    /** `print` renders every mark, never collapses and opens no panel. */
    variant?: 'screen' | 'print';
}

interface ListItem {
    row: ProofRailRow;
    mark: DocumentMark;
}

/**
 * The marks below the essay, for when the margin rail cannot fit (a narrow screen, or the compact
 * editor) and for paper. It consumes the rail's rows, so the two renderers can never disagree about
 * which marks exist or on which line they sit.
 */
export default function ProofMarkList({
    rows,
    dir = 'ltr',
    activeLine,
    onSelectLine,
    snippetFor,
    variant = 'screen',
}: ProofMarkListProps) {
    const { t } = useTranslation();
    const [showAll, setShowAll] = useState(false);
    const [focusIndex, setFocusIndex] = useState(0);
    // The trigger is the exact item that opened the panel, so focus can go back to it — a line can
    // hold several items.
    const [open, setOpen] = useState<{ rowId: string; triggerKey: string } | null>(null);
    const itemRefs = useRef(new Map<string, HTMLButtonElement>());
    const interactive = variant === 'screen';
    const collapsed = interactive && !showAll;

    const groups = useMemo(() => {
        const byBlock = new Map<number, ListItem[]>();
        for (const row of rows) {
            for (const mark of row.marks) {
                const key = blockOf(row);
                const items = byBlock.get(key);
                if (items) items.push({ row, mark });
                else byBlock.set(key, [{ row, mark }]);
            }
        }
        return [...byBlock.entries()].sort(([a], [b]) => a - b).map(([block, items]) => ({ block, items }));
    }, [rows]);

    // Roving focus across the rendered items, in reading order — the same one-tab-stop model as the
    // rail, so a long list does not add a tab stop per mark.
    const orderedKeys = useMemo(() => {
        const keys: string[] = [];
        for (const group of groups) {
            const items = collapsed ? group.items.slice(0, COLLAPSED_PER_PARAGRAPH) : group.items;
            for (const item of items) keys.push(`${item.row.id}:${item.mark.id}`);
        }
        return keys;
    }, [groups, collapsed]);

    useEffect(() => {
        setFocusIndex((index) => Math.min(index, Math.max(0, orderedKeys.length - 1)));
    }, [orderedKeys.length]);

    const total = rows.reduce((sum, row) => sum + row.marks.length, 0);
    const canCollapse = groups.some((group) => group.items.length > COLLAPSED_PER_PARAGRAPH);
    const openRow = open ? (rows.find((row) => row.id === open.rowId) ?? null) : null;

    const focusItem = (index: number) => {
        const next = Math.min(Math.max(index, 0), Math.max(0, orderedKeys.length - 1));
        setFocusIndex(next);
        const key = orderedKeys[next];
        if (key) itemRefs.current.get(key)?.focus();
    };

    const closePanel = () => {
        const trigger = open ? itemRefs.current.get(open.triggerKey) : null;
        setOpen(null);
        trigger?.focus();
    };

    return (
        <section
            data-testid={interactive ? 'proof-mark-list' : 'proof-mark-list-print'}
            className={
                interactive ? 'proof-mark-list proof-mark-list--screen' : 'proof-mark-list proof-mark-list--print'
            }
            aria-label={t('proofMarks.list.label')}
            style={{ marginTop: 12 }}
        >
            <span
                role="status"
                aria-live="polite"
                style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                }}
            >
                {interactive && total > 0 ? t('proofMarks.rail.summary', { count: total, lines: rows.length }) : ''}
            </span>

            <h3 className="proof-mark-list-title" style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>
                {t('proofMarks.list.title', { count: total })}
            </h3>

            <ol className="proof-mark-list-groups" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {groups.map((group) => {
                    const visible = collapsed ? group.items.slice(0, COLLAPSED_PER_PARAGRAPH) : group.items;
                    const hidden = group.items.length - visible.length;
                    return (
                        <li key={group.block} className="proof-mark-list-group" style={{ padding: '2px 0' }}>
                            <p className="proof-mark-list-para" style={{ margin: 0, fontSize: 11, color: '#6b6357' }}>
                                {t('proofMarks.list.paragraph', { index: group.block })}
                            </p>
                            <ul
                                className="proof-mark-list-items"
                                aria-label={t('proofMarks.panel.listLabel')}
                                style={{ margin: 0, padding: 0, listStyle: 'none' }}
                            >
                                {visible.map(({ row, mark }) => {
                                    const symbol = getSymbol(mark.symbolId);
                                    const instruction = t(symbol.labelKey);
                                    const current = snippetFor?.(mark) ?? null;
                                    const replacement = mark.payload?.text ?? null;
                                    const active = activeLine === row.line;
                                    const refKey = `${row.id}:${mark.id}`;
                                    const position = orderedKeys.indexOf(refKey);
                                    const isOpen = open?.rowId === row.id;
                                    const label = t('proofMarks.rail.chipLabel', {
                                        count: 1,
                                        line: row.line,
                                        symbols: instruction,
                                    });

                                    return (
                                        <li key={refKey}>
                                            <button
                                                ref={(node) => {
                                                    if (node) itemRefs.current.set(refKey, node);
                                                    else itemRefs.current.delete(refKey);
                                                }}
                                                type="button"
                                                className="proof-mark-list-item"
                                                data-mark-id={mark.id}
                                                data-mark-line={row.line}
                                                data-active={active ? 'true' : 'false'}
                                                aria-label={label}
                                                aria-pressed={active}
                                                aria-haspopup={interactive ? 'dialog' : undefined}
                                                aria-expanded={interactive ? isOpen : undefined}
                                                tabIndex={interactive ? (position === focusIndex ? 0 : -1) : -1}
                                                onFocus={() => {
                                                    if (interactive) setFocusIndex(position);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (!interactive) return;
                                                    if (event.key === 'ArrowDown') {
                                                        event.preventDefault();
                                                        focusItem(position + 1);
                                                    } else if (event.key === 'ArrowUp') {
                                                        event.preventDefault();
                                                        focusItem(position - 1);
                                                    } else if (event.key === 'Home') {
                                                        event.preventDefault();
                                                        focusItem(0);
                                                    } else if (event.key === 'End') {
                                                        event.preventDefault();
                                                        focusItem(orderedKeys.length - 1);
                                                    }
                                                }}
                                                onClick={() => {
                                                    if (!interactive) return;
                                                    if (isOpen) {
                                                        closePanel();
                                                        return;
                                                    }
                                                    setOpen({ rowId: row.id, triggerKey: refKey });
                                                    if (activeLine !== row.line) onSelectLine(row.line);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'baseline',
                                                    gap: 6,
                                                    width: '100%',
                                                    padding: '4px 2px',
                                                    border: 'none',
                                                    borderRadius: 4,
                                                    background: isOpen ? '#fde8e8' : 'transparent',
                                                    color: '#2a261f',
                                                    font: 'inherit',
                                                    fontSize: 12,
                                                    lineHeight: 1.35,
                                                    textAlign: 'start',
                                                    cursor: interactive ? 'pointer' : 'default',
                                                }}
                                            >
                                                <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                                                    <MarkGlyph id={symbol.glyph} dir={dir} size={13} />
                                                </span>
                                                <span aria-hidden="true" style={{ fontFamily: 'monospace' }}>
                                                    {symbol.glyph}
                                                </span>
                                                <span className="proof-mark-list-text" style={{ minWidth: 0 }}>
                                                    {current}
                                                    {current && replacement ? ' → ' : ''}
                                                    {replacement}
                                                    {!current && !replacement && instruction}
                                                    <span className="proof-mark-list-instruction">
                                                        {' — '}
                                                        {instruction}
                                                    </span>
                                                    {mark.note && (
                                                        <span
                                                            className="proof-mark-list-note"
                                                            style={{ display: 'block', fontStyle: 'italic' }}
                                                        >
                                                            {mark.note}
                                                        </span>
                                                    )}
                                                </span>
                                                {row.marks.length > 1 && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="proof-mark-list-line-count"
                                                        style={{ marginInlineStart: 'auto', fontSize: 10 }}
                                                    >
                                                        {row.marks.length}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            {hidden > 0 && (
                                <p className="proof-mark-list-more" style={{ margin: 0, fontSize: 11 }}>
                                    {t('proofMarks.list.more', { count: hidden })}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>

            {interactive && canCollapse && (
                <button
                    type="button"
                    className="proof-mark-list-toggle"
                    onClick={() => setShowAll((value) => !value)}
                    style={{
                        marginTop: 6,
                        padding: '4px 8px',
                        border: '1px solid rgba(153, 27, 27, 0.3)',
                        borderRadius: 4,
                        background: '#fef2f2',
                        color: '#991b1b',
                        font: 'inherit',
                        fontSize: 12,
                        cursor: 'pointer',
                    }}
                >
                    {showAll ? t('proofMarks.list.showFewer') : t('proofMarks.list.showAll', { count: total })}
                </button>
            )}

            {interactive && openRow && openRow.marks[0] && (
                <ProofMarkPopover
                    key={openRow.id}
                    variant="sheet"
                    row={openRow}
                    dir={dir}
                    titleId={`proof-mark-list-title-${openRow.id}`}
                    snippetFor={snippetFor}
                    onClose={closePanel}
                />
            )}
        </section>
    );
}
