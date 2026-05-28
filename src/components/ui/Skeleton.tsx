import React from 'react';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '1rem', borderRadius = 'var(--radius)', style }: SkeletonProps) {
    return (
        <div
            className="skeleton"
            style={{ width, height: height, borderRadius, ...style }}
            aria-hidden="true"
        />
    );
}

export function SkeletonText({ lines = 3, gap = '0.5rem' }: { lines?: number; gap?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-hidden="true">
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height="0.875rem" />
            ))}
        </div>
    );
}

export function SkeletonCard({ style }: { style?: React.CSSProperties }) {
    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', ...style }}>
            <Skeleton height="1.1rem" width="50%" />
            <SkeletonText lines={2} />
        </div>
    );
}

export function SkeletonRow() {
    return (
        <div
            style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                padding: '0.75rem 0',
                borderBottom: '1px solid var(--border)',
            }}
            aria-hidden="true"
        >
            <Skeleton width="2rem" height="2rem" borderRadius="50%" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <Skeleton height="0.875rem" width="40%" />
                <Skeleton height="0.75rem" width="60%" />
            </div>
        </div>
    );
}
