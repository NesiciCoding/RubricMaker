import React from 'react';
import { useTranslation } from 'react-i18next';

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

// Media box: holds the footprint of an image, video, audio bar or document page while
// its bytes load (IndexedDB blobs, base64 attachments, converter output). Pass
// `aspectRatio` for pictures/pages, or `height` for a fixed-height strip such as an
// audio player.
export function MediaBoxSkeleton({
    aspectRatio,
    height = '4rem',
    label,
}: {
    aspectRatio?: string;
    height?: string;
    label?: string;
}) {
    const { t } = useTranslation();
    return (
        <div
            role="status"
            aria-label={label ?? t('a11y.loading')}
            aria-busy="true"
            style={{
                width: '100%',
                height: aspectRatio ? undefined : height,
                aspectRatio,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
            }}
        >
            <Skeleton width="35%" height="1.5rem" />
        </div>
    );
}

// `height` sizes the whole placeholder, not just the plot area: card padding, the title and
// the gap would otherwise push a fixed-height fallback (the portal's 200px/340px chart slots)
// past the height it is reserving, shifting the page when the real chart lands.
export function ChartSkeleton({ height = '260px' }: { height?: string }) {
    return (
        <div
            className="card"
            style={{ height, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'hidden' }}
            aria-hidden="true"
        >
            <Skeleton width="40%" height="1rem" style={{ flexShrink: 0 }} />
            <Skeleton height="100%" style={{ flex: 1, minHeight: 0 }} />
        </div>
    );
}

// Page-shaped fallbacks for the lazy-route Suspense boundary. Each mirrors the
// real page shell (topbar bar + .page-content) so there is no layout jump when
// the chunk resolves.

// The status wrapper shared by every shape: one `role="status"` per skeleton so a
// screen reader hears a single "Loading" announcement for the page, never one per block.
function SkeletonFrame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    const { t } = useTranslation();
    return (
        <div
            role="status"
            aria-label={t('a11y.loading')}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, ...style }}
        >
            {children}
        </div>
    );
}

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <SkeletonFrame>
            <div className="topbar" aria-hidden="true">
                <Skeleton width="180px" height="1rem" />
            </div>
            <div className="page-content">{children}</div>
        </SkeletonFrame>
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

// Student profile: avatar header, tab strip, stat cards, then the chart stack —
// /students/:id and /students/:id/cefr-overview.
export function ProfilePageSkeleton() {
    return (
        <PageShell>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <Skeleton width="72px" height="72px" borderRadius="50%" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Skeleton width="30%" height="1.5rem" />
                    <Skeleton width="45%" height="0.875rem" />
                </div>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} width={i === 0 ? '96px' : '84px'} height="2.25rem" borderRadius="999px" />
                ))}
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '16px',
                    marginBottom: '20px',
                }}
            >
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <ChartSkeleton />
                <ChartSkeleton height="200px" />
            </div>
        </PageShell>
    );
}

// In-place table placeholder for a tab that is already mounted: a header strip plus N
// rows, with column widths that mirror the real table so nothing reflows on arrival.
// `label` carries the tab's own loading string as the status name.
export function TableSkeleton({
    rows = 5,
    columnWidths = ['45%', '30%', '18%'],
    label,
}: {
    rows?: number;
    columnWidths?: string[];
    label?: string;
}) {
    const { t } = useTranslation();
    const rowStyle: React.CSSProperties = {
        display: 'flex',
        gap: '12px',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
    };
    return (
        <div role="status" aria-label={label ?? t('a11y.loading')} aria-busy="true" style={{ overflowX: 'auto' }}>
            <div style={{ ...rowStyle, padding: '8px 12px' }} aria-hidden="true">
                {columnWidths.map((width, i) => (
                    <Skeleton key={i} width={width} height="0.75rem" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} style={rowStyle} aria-hidden="true">
                    {columnWidths.map((width, i) => (
                        <Skeleton key={i} width={width} height="0.875rem" />
                    ))}
                </div>
            ))}
        </div>
    );
}

// Header row plus N rows — rubrics, students, tests, attachments, export.
export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <PageShell>
            <Skeleton width="30%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div className="card">
                <div
                    style={{
                        display: 'flex',
                        gap: '1rem',
                        paddingBottom: '0.75rem',
                        borderBottom: '1px solid var(--border)',
                    }}
                    aria-hidden="true"
                >
                    <Skeleton height="0.75rem" width="24%" />
                    <Skeleton height="0.75rem" width="18%" />
                    <Skeleton height="0.75rem" width="34%" />
                    <Skeleton height="0.75rem" width="14%" />
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                    <SkeletonRow key={i} />
                ))}
            </div>
        </PageShell>
    );
}

// auto-fill card grid — marketplace, flashcards, docs cards.
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
    return (
        <PageShell>
            <Skeleton width="35%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '16px',
                }}
            >
                {Array.from({ length: count }).map((_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        </PageShell>
    );
}

// Tab strip plus a body — settings, docs, admin. Pass `children` for a body that
// is not the default form/section blocks (e.g. docs uses a card grid).
export function TabbedPageSkeleton({ children }: { children?: React.ReactNode }) {
    return (
        <PageShell>
            <Skeleton width="28%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }} aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} width="92px" height="2rem" />
                ))}
            </div>
            {children ?? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            )}
        </PageShell>
    );
}

// Long-form text — privacy, docs content.
export function DocumentSkeleton({ paragraphs = 6 }: { paragraphs?: number }) {
    return (
        <PageShell>
            <Skeleton width="45%" height="1.75rem" style={{ marginBottom: '24px' }} />
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Array.from({ length: paragraphs }).map((_, i) => (
                    <SkeletonText key={i} lines={i % 2 === 0 ? 4 : 3} />
                ))}
            </div>
        </PageShell>
    );
}

// Criteria × levels grid plus a comment/score side panel — grade, peer-review,
// self-assess, speaking, comparative grading.
export function GradingSkeleton() {
    return (
        <PageShell>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <Skeleton width="2.5rem" height="2.5rem" borderRadius="50%" style={{ flexShrink: 0 }} />
                <Skeleton width="220px" height="1.25rem" />
            </div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div
                    className="card"
                    style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                    {Array.from({ length: 5 }).map((_, row) => (
                        <div
                            key={row}
                            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}
                            aria-hidden="true"
                        >
                            {Array.from({ length: 4 }).map((_, col) => (
                                <Skeleton key={col} height={row === 0 ? '1rem' : '56px'} />
                            ))}
                        </div>
                    ))}
                </div>
                <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 }}>
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            </div>
        </PageShell>
    );
}

// Student header, tab strip, section cards — the student portal (rendered outside
// the app shell, so no topbar).
export function PortalSkeleton() {
    return (
        <SkeletonFrame>
            <div className="page-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <Skeleton width="2.75rem" height="2.75rem" borderRadius="50%" style={{ flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <Skeleton width="180px" height="1.25rem" />
                        <Skeleton width="120px" height="0.875rem" />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }} aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} width="84px" height="2rem" />
                    ))}
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '16px',
                    }}
                >
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
            </div>
        </SkeletonFrame>
    );
}

// Title, timer pill, question/editor blocks — the public /test and /essay pages.
// Rendered outside AppProvider, with no sidebar or topbar shell.
export function StudentTaskSkeleton() {
    return (
        <SkeletonFrame
            style={{
                flex: 'initial',
                minHeight: '100vh',
                background: 'var(--bg)',
                padding: '24px 16px',
                alignItems: 'center',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '900px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <Skeleton width="240px" height="1.5rem" />
                    <Skeleton width="96px" height="2rem" borderRadius="999px" />
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Skeleton width="55%" height="1rem" />
                    <SkeletonText lines={2} />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Skeleton width="70%" height="0.95rem" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} aria-hidden="true">
                            {Array.from({ length: 3 }).map((_, j) => (
                                <Skeleton key={j} height="2.25rem" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </SkeletonFrame>
    );
}

// Static sidebar frame for the boot skeleton — a logo bar plus nav-item bars, sized to
// the real sidebar so nothing shifts when the app shell mounts. Decorative (aria-hidden).
export function SidebarSkeleton() {
    return (
        <aside
            className="sidebar"
            aria-hidden="true"
            style={{ flexDirection: 'column', flexShrink: 0, padding: '12px' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px 18px' }}>
                <Skeleton width="32px" height="32px" borderRadius="8px" />
                <Skeleton width="110px" height="1rem" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} height="2.25rem" />
                ))}
            </div>
        </aside>
    );
}

// Rubric grid for the public share pages (/feedback, /preview) — rendered outside the app
// shell, so a centered document column instead of the sidebar layout.
export function RubricGridSkeleton() {
    return (
        <SkeletonFrame style={{ flex: 'initial', minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
            <div
                style={{
                    width: '100%',
                    maxWidth: '900px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}
            >
                <Skeleton width="45%" height="1.75rem" />
                <Skeleton width="65%" height="1rem" />
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Skeleton width="40%" height="1rem" />
                            <SkeletonText lines={2} />
                        </div>
                    ))}
                </div>
            </div>
        </SkeletonFrame>
    );
}

// In-page section skeleton: N rows inside the site card, wrapped in a single status
// region so an async section reads as loading before its empty state can show.
// `label` lets a mounted tab keep its own loading string ("Loading members…") as
// the status name instead of the generic one.
export function InlineSkeleton({ rows = 3, label }: { rows?: number; label?: string }) {
    const { t } = useTranslation();
    return (
        <div className="card" role="status" aria-label={label ?? t('a11y.loading')} aria-busy="true">
            {Array.from({ length: rows }).map((_, i) => (
                <SkeletonRow key={i} />
            ))}
        </div>
    );
}

// Live monitor: a presence/summary strip above an auto-fill grid of student tiles —
// the /tests/:id/monitor and /essays/:id/monitor route fallback, and the in-page
// assignment/teacher-key loading state (no app-shell topbar there, the real one shows).
function MonitorGridSkeletonBody() {
    return (
        <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }} aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} width="104px" height="2rem" borderRadius="999px" />
                ))}
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '12px',
                }}
            >
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Skeleton width="40%" height="1rem" />
                            <Skeleton width="72px" height="1.25rem" borderRadius="999px" />
                        </div>
                        <Skeleton width="80%" height="0.75rem" />
                        <Skeleton height="2rem" />
                    </div>
                ))}
            </div>
        </>
    );
}

export function MonitorGridSkeleton() {
    return (
        <PageShell>
            <Skeleton width="30%" height="1.5rem" style={{ marginBottom: '20px' }} />
            <MonitorGridSkeletonBody />
        </PageShell>
    );
}

// In-page variant of the monitor skeleton: same shapes inside its own status region,
// so an already-mounted monitor (title in the topbar) can read as loading without the
// app-shell frame and without flashing a premature empty state.
export function InlineMonitorSkeleton() {
    return (
        <SkeletonFrame>
            <MonitorGridSkeletonBody />
        </SkeletonFrame>
    );
}

// Test results: header card (title, student line, stat row) plus one card per question —
// the /tests/:testId/results/:studentTestId route fallback.
export function TestResultsSkeleton({ questions = 5 }: { questions?: number }) {
    return (
        <PageShell>
            <div
                className="card"
                style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}
            >
                <Skeleton width="40%" height="1.5rem" />
                <Skeleton width="30%" height="0.875rem" />
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }} aria-hidden="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <Skeleton width="72px" height="0.75rem" />
                            <Skeleton width="96px" height="1.5rem" />
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Array.from({ length: questions }).map((_, i) => (
                    <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <Skeleton width="15%" height="0.75rem" />
                        <Skeleton width="65%" height="1rem" />
                        <SkeletonText lines={2} />
                    </div>
                ))}
            </div>
        </PageShell>
    );
}

// Flashcard study card (progress bar, large card, rating-button row) — the
// /portal/:id/flashcards/:deckId loading state and route fallback.
// `fullPage` is for the route fallback, where the skeleton *is* the page and has to fill the
// viewport. The study page renders it below its own header, where a 100vh minimum would only
// add a scrollbar for the length of the deck fetch, so it asks for the content-height variant.
export function FlashcardCardSkeleton({ fullPage = true }: { fullPage?: boolean } = {}) {
    return (
        <SkeletonFrame
            style={{
                flex: 'initial',
                ...(fullPage ? { minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' } : {}),
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '640px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                }}
            >
                <Skeleton width="40%" height="0.9rem" />
                <div
                    className="card"
                    style={{
                        minHeight: '280px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        justifyContent: 'center',
                    }}
                >
                    <Skeleton width="60%" height="1.25rem" />
                    <SkeletonText lines={2} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }} aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height="2.5rem" style={{ flex: 1 }} />
                    ))}
                </div>
            </div>
        </SkeletonFrame>
    );
}
