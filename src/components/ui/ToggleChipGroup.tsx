import React from 'react';

export interface ToggleChipOption<T extends string> {
    value: T;
    label: string;
    /** Active chip color; falls back to the accent fill when unset (used for track badges). */
    activeColor?: string;
}

interface Props<T extends string> {
    /** Visible heading — doubles as the group's accessible name. */
    label: string;
    options: ToggleChipOption<T>[];
    values: T[];
    onToggle: (value: T) => void;
    /** Extra explanation rendered under the chips. */
    hint?: string;
}

/**
 * Multi-select chip group: each chip is a toggle button with `aria-pressed`, so several options can
 * be active at once (a single-select control would be `SegmentedToggle`). Used for the class's
 * school years and VO tracks, where a class may hold several of each.
 */
export default function ToggleChipGroup<T extends string>({ label, options, values, onToggle, hint }: Props<T>) {
    return (
        <div className="form-group">
            <span
                style={{
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                }}
            >
                {label}
            </span>
            <div
                role="group"
                aria-label={label}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
            >
                {options.map((opt) => {
                    const active = values.includes(opt.value);
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onToggle(opt.value)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '5px 12px',
                                borderRadius: 999,
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                lineHeight: 1,
                                cursor: 'pointer',
                                border: '1px solid var(--border)',
                                background: active ? (opt.activeColor ?? 'var(--accent)') : 'var(--bg-raised)',
                                color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
                                transition: 'background var(--transition), color var(--transition)',
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
            {hint && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }} data-testid="toggle-chip-hint">
                    {hint}
                </span>
            )}
        </div>
    );
}
