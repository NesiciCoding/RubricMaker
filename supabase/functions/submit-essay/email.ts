// Shared email-resolution logic for submit-essay.
//
// Kept in its own pure module (no Deno imports) so the anonymous-session edge
// case below is unit-testable from the app's vitest suite — see
// src/__tests__/submitEssayEmail.test.ts. The edge function imports it with the
// explicit `.ts` extension (Deno convention); the vitest test imports it
// extensionless.

export interface ResolvedStudentEmail {
    /** The authoritative student email, or null when neither source has one. */
    email: string | null;
    /** True when the auth record and the client disagree (caller rejects with 403). */
    mismatch: boolean;
}

/**
 * Resolve the authoritative student email for a submission.
 *
 * The auth record wins when it carries a real email (portal login sessions);
 * otherwise the client-supplied value is used (anonymous sessions). When both
 * are present but differ, `mismatch` is set so the caller can reject the
 * request — one student must not be able to claim another's submission slot.
 *
 * Guard with a truthiness check, not `??`: a GoTrue anonymous session carries an
 * EMPTY-STRING email claim (not null), and `authEmail ?? bodyEmail` would let that
 * empty string win — silently rejecting every anonymous submission as "Missing
 * required field: studentEmail". That regression is pinned by
 * src/__tests__/submitEssayEmail.test.ts.
 */
export function resolveStudentEmail(
    authEmail: string | null | undefined,
    bodyEmail: string | null | undefined
): ResolvedStudentEmail {
    const normalizedAuth = authEmail ? authEmail : null;
    const mismatch =
        normalizedAuth !== null &&
        bodyEmail !== undefined &&
        bodyEmail !== null &&
        normalizedAuth.toLowerCase() !== bodyEmail.toLowerCase();
    return { email: normalizedAuth ?? bodyEmail ?? null, mismatch };
}
