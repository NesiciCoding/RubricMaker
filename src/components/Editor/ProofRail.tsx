import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MarkStatus } from '../../types';
import { getGlyph, getSymbol } from '../../data/proofMarks';
import MarkGlyph from './MarkGlyph';
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

/** The four contrast-guarded mark inks; status is never drawn with opacity. */
const INK: Record<MarkStatus, string> = {
    noted: '#991b1b',
    proposed: '#991b1b',
    accepted: '#08473e',
    rejected: '#534d45',
};

export interface ProofRailProps {
    rows: ProofRailRow[];
    box: ProofRailBox;
    dir?: 'ltr' | 'rtl';
    /** Line whose marks are currently highlighted in the text. */
    activeLine: number | null;
    onSelectLine: (line: number | null) => void;
}

export default function ProofRail({ rows, box, dir = 'ltr', activeLine, onSelectLine }: ProofRailProps) {
    const { t } = useTranslation();

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

            {rows.map((row) => {
                const primary = row.marks[0];
                if (!primary) return null;

                const symbol = getSymbol(primary.symbolId);
                const count = row.marks.length;
                const grouped = count > 1 || row.multiLine;
                const width = grouped
                    ? GROUPED_CHIP_WIDTH
                    : getGlyph(primary.symbolId).kind === 'letter'
                      ? LETTER_CHIP_WIDTH
                      : STROKE_CHIP_WIDTH;
                const active = activeLine === row.line;
                const symbols = row.marks.map((mark) => t(getSymbol(mark.symbolId).labelKey)).join('; ');
                const label = `${t('proofMarks.rail.chipLabel', { count, line: row.line, symbols })}${
                    row.multiLine ? ` — ${t('proofMarks.rail.spansLines')}` : ''
                }`;

                return (
                    <button
                        key={row.id}
                        type="button"
                        data-mark-line={row.line}
                        data-mark-ids={row.ids.join(' ')}
                        aria-label={label}
                        title={label}
                        aria-pressed={active}
                        onClick={() => onSelectLine(active ? null : row.line)}
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
                            background: '#fef2f2',
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
        </div>
    );
}
