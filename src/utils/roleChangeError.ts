/** Matches the error `protect_role_changes()` (migration 083) raises when the last admin would be demoted. */
export function isLastAdminError(message: string | undefined): boolean {
    return !!message && /last admin/i.test(message);
}
