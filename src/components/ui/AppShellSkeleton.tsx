import React from 'react';
import { useTranslation } from 'react-i18next';
import RouteSkeleton from './RouteSkeleton';
import { SidebarSkeleton, DashboardSkeleton } from './Skeleton';

// Both boot variants carry `data-boot-shell` while they own the screen. It is the one
// signal that distinguishes "still booting" from the real app shell, which the offline and
// hydration-timeout e2e specs need because the boot shell renders `.main-area` too.

// Boot shell shown while the session is checked and the hydrated data loads: the real
// sidebar frame beside a page-shaped skeleton for the route the user is heading to, plus
// one status line naming the current step. The content skeleton is aria-hidden so the
// status line is the only region announced, and aria-busy stays on that decorative block —
// marking the status region itself busy would make assistive tech defer the session→hydrate
// update until the shell unmounts, dropping the phase change entirely.
export function AppShellSkeleton({ statusText }: { statusText?: string }) {
    const { t } = useTranslation();
    return (
        <div className="app-layout" data-boot-shell="true">
            <SidebarSkeleton />
            <main className="main-area">
                <div
                    role="status"
                    aria-live="polite"
                    style={{ padding: '12px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                >
                    {statusText ?? t('a11y.loading')}
                </div>
                <div aria-hidden="true" aria-busy="true">
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
        <div className="app-layout" data-boot-shell="true">
            <SidebarSkeleton />
            <main className="main-area">
                <DashboardSkeleton />
            </main>
        </div>
    );
}
