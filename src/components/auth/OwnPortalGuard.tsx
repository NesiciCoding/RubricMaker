import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Keeps a signed-in student on their own portal: a shared or guessed `/portal/:studentId` link for
 * another student redirects to the same view of their own portal. In Supabase mode RLS already
 * hides other students' data; this closes the gap in local mode, which has no RLS (#669).
 */
export function OwnPortalGuard({ ownStudentId, children }: { ownStudentId: string; children: React.ReactNode }) {
    const { studentId } = useParams();
    const { pathname, search } = useLocation();
    if (studentId === ownStudentId) return <>{children}</>;
    // Route matching is case-insensitive, so take everything after the `/portal/:studentId` segments
    // by position rather than by matching the literal prefix.
    const rest = pathname.split('/').slice(3).filter(Boolean).join('/');
    return <Navigate to={`/portal/${ownStudentId}${rest ? `/${rest}` : ''}${search}`} replace />;
}
