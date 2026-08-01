import React from 'react';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
    icon?: React.ReactNode;
}

interface Props<T extends string> {
    options: SegmentedOption<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    size?: 'sm' | 'md';
}

/**
 * Pill-shaped segmented control (Option B design-system convention): the active option gets the
 * accent fill, inactive options stay transparent. Implemented as a group of toggle buttons with
 * `aria-pressed` rather than a `role="tablist"`, matching how the Phase 31 a11y work settled tab
 * semantics elsewhere (a tablist would need matching `role="tab"` + focus management + tabpanels).
 */
export default function SegmentedToggle<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    size = 'md',
}: Props<T>) {
    const pad = size === 'sm' ? '5px 10px' : '7px 14px';
    const fontSize = size === 'sm' ? '0.8rem' : '0.85rem';
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            style={{
                display: 'inline-flex',
                gap: 2,
                padding: 2,
                borderRadius: 999,
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
            }}
        >
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(opt.value)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: pad,
                            fontSize,
                            fontWeight: 600,
                            lineHeight: 1,
                            borderRadius: 999,
                            border: 'none',
                            cursor: 'pointer',
                            background: active ? 'var(--accent)' : 'transparent',
                            color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
                            transition: 'background var(--transition), color var(--transition)',
                        }}
                    >
                        {opt.icon}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
