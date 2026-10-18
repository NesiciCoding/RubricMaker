import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import RouteSkeleton, { getRouteSkeleton, type SkeletonShape } from '../RouteSkeleton';
import {
    ListPageSkeleton,
    BuilderPageSkeleton,
    DashboardSkeleton,
    TablePageSkeleton,
    CardGridSkeleton,
    TabbedPageSkeleton,
    DocumentSkeleton,
    GradingSkeleton,
    PortalSkeleton,
    FlashcardCardSkeleton,
    MonitorGridSkeleton,
    TestResultsSkeleton,
    ProfilePageSkeleton,
} from '../Skeleton';

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<RouteSkeleton />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('getRouteSkeleton', () => {
    // Every route in App.tsx, mapped to the shape it should show while its chunk loads.
    const CASES: Array<[string, SkeletonShape]> = [
        ['/', DashboardSkeleton],

        ['/rubrics', TablePageSkeleton],
        ['/rubrics/new', BuilderPageSkeleton],
        ['/rubrics/r1', BuilderPageSkeleton],
        ['/rubrics/r1/grade/s1', GradingSkeleton],
        ['/rubrics/r1/peer-review/s1', GradingSkeleton],
        ['/rubrics/r1/self-assess/s1', GradingSkeleton],
        ['/speaking/r1/s1', GradingSkeleton],
        ['/grade-comparative/c1/r1', GradingSkeleton],
        ['/peer-analytics/r1', DashboardSkeleton],

        ['/students', TablePageSkeleton],
        ['/students/s1', ProfilePageSkeleton],
        ['/students/s1/cefr-overview', ProfilePageSkeleton],
        ['/students/s1/learning-path', ListPageSkeleton],
        ['/cefr-overview', DashboardSkeleton],
        ['/vocabulary', DashboardSkeleton],

        ['/tests', TablePageSkeleton],
        ['/tests/new', BuilderPageSkeleton],
        ['/tests/t1', BuilderPageSkeleton],
        ['/tests/t1/results/st1', TestResultsSkeleton],
        ['/tests/t1/monitor', MonitorGridSkeleton],

        ['/essays', ListPageSkeleton],
        ['/essays/new', BuilderPageSkeleton],
        ['/essays/key1', BuilderPageSkeleton],
        ['/essays/a1/monitor', MonitorGridSkeleton],

        ['/flashcards', ListPageSkeleton],
        ['/flashcards/d1', BuilderPageSkeleton],
        ['/news-flashes', ListPageSkeleton],

        ['/portal/s1', PortalSkeleton],
        ['/portal/s1/flashcards/d1', FlashcardCardSkeleton],

        ['/attachments', TablePageSkeleton],
        ['/export', TablePageSkeleton],
        ['/statistics', DashboardSkeleton],
        ['/activity-dashboard', DashboardSkeleton],
        ['/moderation', ListPageSkeleton],
        ['/notifications', ListPageSkeleton],
        ['/messages', ListPageSkeleton],
        ['/comments', ListPageSkeleton],
        ['/question-bank', ListPageSkeleton],

        ['/marketplace', CardGridSkeleton],

        ['/settings', TabbedPageSkeleton],
        ['/admin', TabbedPageSkeleton],
        ['/docs', TabbedPageSkeleton],
        ['/privacy', DocumentSkeleton],
    ];

    it.each(CASES)('resolves %s to its intended shape', (path, shape) => {
        expect(getRouteSkeleton(path)).toBe(shape);
    });

    it('falls back to the list shape for an unknown route', () => {
        expect(getRouteSkeleton('/unknown-route')).toBe(ListPageSkeleton);
    });
});

describe('RouteSkeleton', () => {
    it('renders a status region for the current path', () => {
        renderAt('/');
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders a skeleton for a rubrics builder path', () => {
        const { container } = renderAt('/rubrics/r1');
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    });

    it('renders a skeleton for the statistics path', () => {
        const { container } = renderAt('/statistics');
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    });

    it('renders a skeleton for a student profile path', () => {
        const { container } = renderAt('/students/s1');
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    });

    it('renders a list skeleton for an unknown path', () => {
        const { container } = renderAt('/unknown-route');
        expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    });
});
