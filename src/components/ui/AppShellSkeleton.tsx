import React from 'react';
import { useTranslation } from 'react-i18next';
import RouteSkeleton from './RouteSkeleton';
import { SidebarSkeleton, DashboardSkeleton } from './Skeleton';

// Boot shell shown while the session is checked and the hydrated data loads: the real
// sidebar frame beside a page-shaped skeleton for the route the user is heading to, plus
// one status line naming the current step. The content skeleton is aria-hidden so the
// status line is the only region announced.
export function AppShellSkeleton({ statusText }: { statusText?: string }) {
    const { t } = useTranslation();
    return (
        <div className="app-layout">
            <SidebarSkeleton />
            <main className="main-area" aria-busy="true">
                <div
                    role="status"
                    aria-live="polite"
                    style={{ padding: '12px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                >
                    {statusText ?? t('a11y.loading')}
                </div>
                <div aria-hidden="true">
                    <RouteSkeleton />
                </div>
            </main>
        </div>
    );
}

// Router-free variant for the top-level Suspense fallback in main.tsx, which renders
// outside RouterProvider and so cannot use RouteSkeleton.
export function BootShellSkeleton() {
    return (
        <div className="app-layout">
            <SidebarSkeleton />
            <main className="main-area">
                <DashboardSkeleton />
            </main>
        </div>
    );
}
