import type { AppSettings, Class, Student, StudentRubric } from '../types';

/**
 * Which classes the roster surfaces show. Admins can read every class in their school (migration
 * 007), so their views default to `mine` — the classes they own or co-teach — and `school` is the
 * opt-in oversight view. Teachers gain nothing from the distinction: RLS already limits them to
 * their own and co-taught classes.
 */
export type RosterScope = 'mine' | 'school';

/** My co-teacher role per class id. `null` means "not loaded yet" (offline, or still fetching). */
export type ClassRoles = Record<string, 'viewer' | 'editor'> | null;

export interface RosterScopeState {
    userId?: string;
    roles: ClassRoles;
    isAdmin: boolean;
    scope: RosterScope;
}

export interface RosterScopeInput {
    classes: Class[];
    students: Student[];
    studentRubrics: StudentRubric[];
}

/**
 * Ownership is unknown in local (offline) mode and on rows cached before ownership was carried, so
 * those count as mine: hiding a teacher's own roster is far worse than briefly showing too much.
 */
export function isClassOwner(cls: Pick<Class, 'ownerId'>, userId: string | undefined): boolean {
    return !userId || cls.ownerId === undefined || cls.ownerId === userId;
}

export function isMyClass(cls: Class, userId: string | undefined, roles: ClassRoles): boolean {
    if (!userId) return true;
    if (cls.ownerId === undefined) return true;
    if (cls.ownerId === userId) return true;
    if (roles === null) return true;
    return roles[cls.id] !== undefined;
}

/**
 * The scope a session actually runs in. The stored preference wins; unset defaults to `mine` when
 * the admin owns or co-teaches at least one class, and to `school` otherwise (a pure administrator
 * would otherwise open an empty app).
 */
export function resolveRosterScope(
    settings: Pick<AppSettings, 'rosterScope'>,
    classes: Class[],
    userId: string | undefined,
    roles: ClassRoles
): RosterScope {
    if (!userId) return 'mine';
    if (settings.rosterScope === 'school') return 'school';
    if (settings.rosterScope === 'mine') return 'mine';
    return classes.some((c) => isMyClass(c, userId, roles)) ? 'mine' : 'school';
}

/**
 * How wide the next roster pull should be. `mine` narrows the *query* (not just the view) to the
 * classes I own or co-teach — the admin SELECT policy (migration 007) otherwise hands back the
 * whole school on every hydrate. Only an explicitly confirmed admin is narrowed: an unset role
 * means "not known yet" (offline, or a hydrate that outlived its timeout), and pulling everything a
 * moment longer beats opening the app without its own roster.
 */
export type RosterFetchMode = 'mine' | 'all';

export function resolveRosterFetch(userRole: string | undefined, scope: RosterScope | undefined): RosterFetchMode {
    return userRole === 'admin' && (scope ?? 'mine') === 'mine' ? 'mine' : 'all';
}

/** Whether this class's management actions are available (owner, or an admin in school scope). */
export function canManageClass(cls: Class, state: RosterScopeState): boolean {
    return isClassOwner(cls, state.userId) || (state.isAdmin && state.scope === 'school');
}

/**
 * A grade can only be written for a student I own or co-teach as an editor — the rule
 * can_grade_student enforces (migration 077). Blocking the attempt up front keeps a doomed grade
 * from becoming a rejected write.
 */
export function canGradeClass(cls: Class | undefined, state: RosterScopeState): boolean {
    if (!cls) return true;
    // The share role is authoritative: a "Can view" class stays read-only even when the row
    // carries no owner (a cached pre-ownership row), which is what migration 096 enforces.
    if (state.roles && state.roles[cls.id] === 'viewer') return false;
    if (isClassOwner(cls, state.userId)) return true;
    if (state.roles === null) return true;
    return state.roles[cls.id] === 'editor';
}

/** Hides nothing but keeps the original array, so an unfiltered scope never re-renders consumers. */
function keepMatches<T>(items: T[], predicate: (item: T) => boolean): T[] {
    const kept = items.filter(predicate);
    return kept.length === items.length ? items : kept;
}

export function scopeRoster(input: RosterScopeInput, state: RosterScopeState): RosterScopeInput {
    const { scope, userId, roles, isAdmin } = state;
    if (!isAdmin || scope === 'school') return input;

    const classes = keepMatches(input.classes, (c) => isMyClass(c, userId, roles));
    const myClassIds = new Set(classes.map((c) => c.id));
    const students = keepMatches(
        input.students,
        (s) => myClassIds.has(s.classId) || (!userId ? true : s.ownerId === undefined || s.ownerId === userId)
    );
    const visibleStudentIds = new Set(students.map((s) => s.id));
    const knownStudentIds = new Set(input.students.map((s) => s.id));
    // A grade whose student is not in the roster at all (an orphan row, or a test fixture that
    // grades without creating the student) is not evidence of someone else's class; keep it.
    const studentRubrics = keepMatches(
        input.studentRubrics,
        (sr) => visibleStudentIds.has(sr.studentId) || !knownStudentIds.has(sr.studentId)
    );

    return { classes, students, studentRubrics };
}
