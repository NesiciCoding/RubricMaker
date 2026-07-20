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
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
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
