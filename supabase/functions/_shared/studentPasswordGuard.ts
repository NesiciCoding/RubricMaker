// Authorisation decisions for set-student-password. Kept dependency-free (see seededShuffle.ts) so the
// rules run under vitest as well as in the edge function.

export type Decision = { ok: true } | { ok: false; status: number; error: string };

const DENY_CALLER: Decision = { ok: false, status: 403, error: 'Only teachers can set student passwords' };
const DENY_TARGET: Decision = {
    ok: false,
    status: 403,
    error: 'That account cannot be managed here. If it belongs to this student, ask an administrator to check its role.',
};

export function authorizeCaller(caller: { isAnonymous: boolean; role: string | null }): Decision {
    if (caller.isAnonymous) return DENY_CALLER;
    return caller.role === 'teacher' || caller.role === 'admin' ? { ok: true } : DENY_CALLER;
}

/** `target` is the existing account for the roster email, or null when there is none yet. */
export function authorizeTarget(callerId: string, target: { id: string; role: string | null } | null): Decision {
    if (!target) return { ok: true };
    if (target.id === callerId || target.role !== 'student') return DENY_TARGET;
    return { ok: true };
}

const EMAIL = /^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/;

export function normalizeStudentEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const email = raw.trim().toLowerCase();
    return EMAIL.test(email) ? email : null;
}

/** Makes ilike behave as a case-insensitive equality: % and _ (and the escape character) lose their special meaning. */
export function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

export function validatePassword(raw: unknown): raw is string {
    return typeof raw === 'string' && raw.length >= 8;
}
