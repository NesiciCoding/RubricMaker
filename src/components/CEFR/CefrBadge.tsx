import React from 'react';
import { CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import { cambridgeExamForLevel } from '../../data/cambridgeExams';
import type { CefrLevel } from '../../types';

interface Props {
    level: CefrLevel;
    size?: 'sm' | 'md' | 'lg';
    /** Show full descriptor text next to the badge */
    showLabel?: boolean;
    label?: string;
    /** Show the matching Cambridge exam short label (e.g. "FCE") next to the badge */
    showCambridgeLabel?: boolean;
    style?: React.CSSProperties;
}

const SIZE_MAP = {
    sm: { fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700 },
    md: { fontSize: 12, padding: '2px 8px', borderRadius: 5, fontWeight: 700 },
    lg: { fontSize: 14, padding: '4px 12px', borderRadius: 6, fontWeight: 700 },
};

export default function CefrBadge({ level, size = 'md', showLabel, label, showCambridgeLabel, style }: Props) {
    const color = CEFR_LEVEL_COLORS[level];
    const sizeStyle = SIZE_MAP[size];
    const cambridgeExam = showCambridgeLabel ? cambridgeExamForLevel(level) : null;

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
            <span
                style={{
                    ...sizeStyle,
                    background: color,
                    color: '#fff',
                    display: 'inline-block',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                }}
            >
                {level}
            </span>
            {showLabel && label && (
                <span style={{ fontSize: sizeStyle.fontSize, color: 'var(--text-muted)' }}>{label}</span>
            )}
            {cambridgeExam && (
                <span
                    style={{
                        fontSize: sizeStyle.fontSize - 1,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    · {cambridgeExam.shortLabel}
                </span>
            )}
        </span>
    );
}
