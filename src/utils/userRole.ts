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
