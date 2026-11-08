import React from 'react';

export interface CompletionBarProps {
    value: number;
    max: number;
    /** Visible text under the bar, e.g. "12/20" or "75%". */
    text: string;
    /** Full screen-reader description; the visible text alone is too terse. */
    label: string;
    minWidth?: number;
}

export default function CompletionBar({ value, max, text, label, minWidth = 54 }: CompletionBarProps) {
    const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    return (
        <div style={{ minWidth }}>
            <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={Math.min(value, max)}
                title={label}
                style={{
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ height: '100%', width: `${ratio * 100}%`, background: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, textAlign: 'center' }}>
                {text}
            </div>
        </div>
    );
}
