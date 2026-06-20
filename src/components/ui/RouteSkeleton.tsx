import React from 'react';
import { useLocation } from 'react-router-dom';
import { ListPageSkeleton, BuilderPageSkeleton, DashboardSkeleton } from './Skeleton';

// Ordered most-specific-first; first match wins, default is the list shape.
const RULES: [RegExp, () => React.ReactElement][] = [
    [/^\/$/, DashboardSkeleton],
    [/^\/(statistics|cefr-overview|vocabulary|activity-dashboard|admin)/, DashboardSkeleton],
    [/^\/peer-analytics\//, DashboardSkeleton],
    [/^\/students\/[^/]+/, DashboardSkeleton],
    [/\/(monitor|results)(\/|$)/, DashboardSkeleton],
    [/^\/(rubrics|tests|essays)\/.+/, BuilderPageSkeleton],
    [/^\/(speaking|grade-comparative)\//, BuilderPageSkeleton],
];

export default function RouteSkeleton() {
    const { pathname } = useLocation();
    const match = RULES.find(([re]) => re.test(pathname));
    const Skeleton = match ? match[1] : ListPageSkeleton;
    return <Skeleton />;
}
