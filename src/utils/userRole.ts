import type { UserRole } from '../types';

const VALID_ROLES = new Set<string>(['admin', 'teacher', 'student']);

/**
 * The role the app acts on. Settings, the sidebar and the route guards must all read the role
 * through this so they agree (#641). A connected session always has the profile's role written
 * into settings before the app opens, so an unset role means a local profile, whose only user
 * owns the data.
 */
export function resolveUserRole(raw: string | undefined): UserRole {
    if (raw === 'user') return 'teacher';
    if (raw && VALID_ROLES.has(raw)) return raw as UserRole;
    return 'admin';
}

/**
 * The admin area also needs the role to be confirmed when connected: a hydrate that outlives its
 * timeout opens the app before the profile role is written, and the unset-role fallback must not
 * mount the admin workflow (and its admin-only requests) for a teacher in that window.
 */
export function canOpenAdmin(raw: string | undefined, localMode: boolean): boolean {
    return resolveUserRole(raw) === 'admin' && (localMode || raw === 'admin');
}
