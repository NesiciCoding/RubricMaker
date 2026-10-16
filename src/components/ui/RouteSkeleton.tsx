import React from 'react';
import { useLocation } from 'react-router-dom';
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
} from './Skeleton';

export type SkeletonShape = React.ComponentType;

// Ordered most-specific-first; the first match wins. Every route in App.tsx has an
// explicit entry so nothing silently falls back to the list shape; add new routes here.
export const ROUTE_SKELETON_RULES: ReadonlyArray<readonly [RegExp, SkeletonShape]> = [
    [/^\/$/, DashboardSkeleton],

    [/^\/rubrics$/, TablePageSkeleton],
    [/^\/rubrics\/new$/, BuilderPageSkeleton],
    [/^\/rubrics\/[^/]+\/peer-review\//, GradingSkeleton],
    [/^\/rubrics\/[^/]+\/self-assess\//, GradingSkeleton],
    [/^\/rubrics\/[^/]+\/grade\//, GradingSkeleton],
    [/^\/rubrics\/[^/]+/, BuilderPageSkeleton],

    [/^\/peer-analytics\//, DashboardSkeleton],
    [/^\/speaking\//, GradingSkeleton],
    [/^\/grade-comparative\//, GradingSkeleton],

    [/^\/students$/, TablePageSkeleton],
    [/^\/students\/[^/]+\/learning-path/, ListPageSkeleton],
    [/^\/students\/[^/]+/, DashboardSkeleton],

    [/^\/cefr-overview/, DashboardSkeleton],
    [/^\/vocabulary/, DashboardSkeleton],

    [/^\/tests$/, TablePageSkeleton],
    [/^\/tests\/new$/, BuilderPageSkeleton],
    [/^\/tests\/[^/]+\/results\//, DashboardSkeleton],
    [/^\/tests\/[^/]+\/monitor/, DashboardSkeleton],
    [/^\/tests\/[^/]+/, BuilderPageSkeleton],

    [/^\/essays$/, ListPageSkeleton],
    [/^\/essays\/new$/, BuilderPageSkeleton],
    [/^\/essays\/[^/]+\/monitor/, DashboardSkeleton],
    [/^\/essays\/[^/]+/, BuilderPageSkeleton],

    [/^\/flashcards$/, ListPageSkeleton],
    [/^\/flashcards\/[^/]+/, BuilderPageSkeleton],
    [/^\/news-flashes/, ListPageSkeleton],

    [/^\/portal\/[^/]+\/flashcards\//, FlashcardCardSkeleton],
    [/^\/portal\//, PortalSkeleton],

    [/^\/attachments/, TablePageSkeleton],
    [/^\/export/, TablePageSkeleton],
    [/^\/statistics/, DashboardSkeleton],
    [/^\/activity-dashboard/, DashboardSkeleton],
    [/^\/moderation/, ListPageSkeleton],
    [/^\/notifications/, ListPageSkeleton],
    [/^\/messages/, ListPageSkeleton],
    [/^\/comments/, ListPageSkeleton],
    [/^\/question-bank/, ListPageSkeleton],

    [/^\/marketplace/, CardGridSkeleton],

    [/^\/settings/, TabbedPageSkeleton],
    [/^\/admin/, TabbedPageSkeleton],
    [/^\/docs/, TabbedPageSkeleton],
    [/^\/privacy/, DocumentSkeleton],
];

export function getRouteSkeleton(pathname: string): SkeletonShape {
    const match = ROUTE_SKELETON_RULES.find(([re]) => re.test(pathname));
    return match ? match[1] : ListPageSkeleton;
}

export default function RouteSkeleton() {
    const { pathname } = useLocation();
    const match = ROUTE_SKELETON_RULES.find(([re]) => re.test(pathname));
    const Shape = match ? match[1] : ListPageSkeleton;
    return <Shape />;
}
