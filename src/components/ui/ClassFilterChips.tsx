import React from 'react';
import type { Class } from '../../types';

interface Props {
    classes: Pick<Class, 'id' | 'name'>[];
    selectedClassId: string;
    onChange: (classId: string) => void;
    ariaLabel: string;
    allLabel?: string;
    allValue?: string;
    counts?: Record<string, number>;
    allCount?: number;
}

const chipStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent)' : 'var(--bg-raised)',
    color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
    whiteSpace: 'nowrap',
});

export default function ClassFilterChips({
    classes,
    selectedClassId,
    onChange,
    ariaLabel,
    allLabel,
    allValue = 'all',
    counts,
    allCount,
}: Props) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            style={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 8,
                alignItems: 'center',
                overflowX: 'auto',
                paddingBottom: 4,
            }}
        >
            {allLabel !== undefined && (
                <button
                    type="button"
                    aria-pressed={selectedClassId === allValue}
                    onClick={() => onChange(allValue)}
                    style={chipStyle(selectedClassId === allValue)}
                >
                    {allLabel}
                    {allCount !== undefined && <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{allCount}</span>}
                </button>
            )}
            {classes.map((c) => (
                <button
                    key={c.id}
                    type="button"
                    aria-pressed={selectedClassId === c.id}
                    onClick={() => onChange(c.id)}
                    style={chipStyle(selectedClassId === c.id)}
                >
                    <span title={c.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                    </span>
                    {counts?.[c.id] !== undefined && (
                        <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{counts[c.id]}</span>
                    )}
                </button>
            ))}
        </div>
    );
}
