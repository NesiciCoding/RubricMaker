import { useCallback } from 'react';
import { useStoreSelector } from '../context/useStore';
import { useRosterScopeValue } from '../context/rosterScopeContext';
import { useMyClassRoles } from './useClassRoles';
import { canGradeClass, canManageClass, type RosterScope } from '../utils/rosterScope';
import type { Class } from '../types';

/** The active scope, and whether the current user may switch it. */
export function useRosterScope(): { scope: RosterScope; canSwitchScope: boolean } {
    const { scope, canSwitchScope } = useRosterScopeValue();
    return { scope, canSwitchScope };
}

/** Per-class permissions used by the roster screens. */
export function useClassAccess(): {
    scope: RosterScope;
    isAdmin: boolean;
    canManageClass: (cls: Class) => boolean;
} {
    const { scope, isAdmin, userId } = useRosterScopeValue();
    const canManage = useCallback(
        (cls: Class) => canManageClass(cls, { scope, isAdmin, userId, roles: null }),
        [scope, isAdmin, userId]
    );
    return { scope, isAdmin, canManageClass: canManage };
}

/**
 * Whether I may write a grade for a student in `classId`. Combines the co-teacher rule (a "Can view"
 * share is read-only) with ownership, so an admin looking at a colleague's class sees a read-only
 * grade instead of one the server will reject (can_grade_student, migration 077).
 */
export function useCanGradeStudentWork(): (classId: string | undefined) => boolean {
    const { scope, isAdmin, userId } = useRosterScopeValue();
    const roles = useMyClassRoles();
    const classes = useStoreSelector((s) => s.classes) ?? [];
    return useCallback(
        (classId: string | undefined) => {
            if (!classId) return true;
            const cls = classes.find((c) => c.id === classId);
            // A class missing from the roster carries no ownership to check, so fall back to the
            // share role alone — exactly the rule that applied before ownership was carried.
            if (!cls) return !roles || roles[classId] !== 'viewer';
            return canGradeClass(cls, { scope, isAdmin, userId, roles });
        },
        [classes, scope, isAdmin, userId, roles]
    );
}
