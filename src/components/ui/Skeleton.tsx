import React from 'react';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '1rem', borderRadius = 'var(--radius)', style }: SkeletonProps) {
    return <div className="skeleton" style={{ width, height: height, borderRadius, ...style }} aria-hidden="true" />;
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

export function ChartSkeleton({ height = '260px' }: { height?: string }) {
    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} aria-hidden="true">
            <Skeleton width="40%" height="1rem" />
            <Skeleton height={height} />
        </div>
    );
}

// Page-shaped fallbacks for the lazy-route Suspense boundary. Each mirrors the
// real page shell (topbar bar + .page-content) so there is no layout jump when
// the chunk resolves.

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <div
            role="status"
            aria-label="Loading"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
            <div className="topbar" aria-hidden="true">
                <Skeleton width="180px" height="1rem" />
            </div>
            <div className="page-content">{children}</div>
        </div>
    );
}

export function ListPageSkeleton() {
    return (
        <PageShell>
            <Skeleton width="40%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div className="card">
                {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                ))}
            </div>
        </PageShell>
    );
}

export function BuilderPageSkeleton() {
    return (
        <PageShell>
            <Skeleton width="35%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
                <div className="card" style={{ flex: 1, minWidth: '280px', minHeight: '360px', gap: '16px' }}>
                    <SkeletonText lines={3} />
                    <Skeleton height="220px" style={{ marginTop: '16px' }} />
                </div>
            </div>
        </PageShell>
    );
}

export function DashboardSkeleton() {
    return (
        <PageShell>
            <Skeleton width="30%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '16px',
                    marginBottom: '20px',
                }}
            >
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <ChartSkeleton />
                <ChartSkeleton />
            </div>
        </PageShell>
    );
}
