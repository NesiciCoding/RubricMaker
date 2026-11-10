import React from 'react';

interface AvatarProps {
    name: string;
    size: number;
    fontSize?: string;
    style?: React.CSSProperties;
}

export default function Avatar({ name, size, fontSize, style }: AvatarProps) {
    return (
        <div
            // Decorative initial — every caller renders the full name beside it,
            // so announcing the lone letter would only add noise (Batch 8).
            aria-hidden="true"
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                color: 'var(--accent-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: fontSize ?? `${size * 0.025}rem`,
                fontWeight: 700,
                flexShrink: 0,
                ...style,
            }}
        >
            {(name || '?').charAt(0).toUpperCase()}
        </div>
    );
}
