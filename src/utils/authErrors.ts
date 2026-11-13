// Supabase Auth error codes (AuthError.code) → locale keys, so students see a clear, translated
// reason instead of GoTrue's raw English message.
const AUTH_ERROR_KEYS: Record<string, string> = {
    anonymous_provider_disabled: 'auth.errors.anonymous_disabled',
    invalid_credentials: 'auth.errors.invalid_credentials',
    email_not_confirmed: 'auth.errors.email_not_confirmed',
    user_banned: 'auth.errors.user_banned',
    over_request_rate_limit: 'auth.errors.rate_limited',
    over_email_send_rate_limit: 'auth.errors.rate_limited',
    weak_password: 'auth.errors.weak_password',
    same_password: 'auth.errors.same_password',
    reauthentication_needed: 'auth.errors.reauthentication_needed',
    session_not_found: 'auth.errors.session_expired',
};

export function authErrorKey(code: string | undefined): string | null {
    return code ? (AUTH_ERROR_KEYS[code] ?? null) : null;
}
