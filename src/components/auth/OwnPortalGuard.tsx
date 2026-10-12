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
    const ownPath = pathname.replace(`/portal/${encodeURIComponent(studentId ?? '')}`, `/portal/${ownStudentId}`);
    return (
        <Navigate
            to={ownPath.startsWith(`/portal/${ownStudentId}`) ? `${ownPath}${search}` : `/portal/${ownStudentId}`}
            replace
        />
    );
}
