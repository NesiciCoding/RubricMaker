// Kept in its own pure module (no Deno imports) so the anonymous-session edge
// case below is unit-testable from the app's vitest suite — see
// src/__tests__/submitEssayEmail.test.ts. The edge function imports it with the
// explicit `.ts` extension (Deno convention); the vitest test imports it
// extensionless.

export interface ResolvedStudentEmail {
    email: string | null;
    mismatch: boolean;
}

/**
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
    // The auth record wins when it carries a real email (portal login sessions);
    // otherwise the client-supplied value is used (anonymous sessions). A
    // disagreement between the two is flagged so the caller can reject — one
    // student must not be able to claim another's submission slot.
    const normalizedAuth = authEmail ? authEmail : null;
    const mismatch =
        normalizedAuth !== null &&
        bodyEmail !== undefined &&
        bodyEmail !== null &&
        normalizedAuth.toLowerCase() !== bodyEmail.toLowerCase();
    return { email: normalizedAuth ?? bodyEmail ?? null, mismatch };
}
