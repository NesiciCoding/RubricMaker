import { describe, expect, it } from 'vitest';
import { authErrorKey } from './authErrors';

describe('authErrorKey', () => {
    it('maps known Supabase auth error codes to locale keys', () => {
        expect(authErrorKey('anonymous_provider_disabled')).toBe('auth.errors.anonymous_disabled');
        expect(authErrorKey('invalid_credentials')).toBe('auth.errors.invalid_credentials');
        expect(authErrorKey('email_not_confirmed')).toBe('auth.errors.email_not_confirmed');
        expect(authErrorKey('user_banned')).toBe('auth.errors.user_banned');
        expect(authErrorKey('over_request_rate_limit')).toBe('auth.errors.rate_limited');
        expect(authErrorKey('over_email_send_rate_limit')).toBe('auth.errors.rate_limited');
    });

    it('returns null for unknown or missing codes', () => {
        expect(authErrorKey('something_else')).toBeNull();
        expect(authErrorKey(undefined)).toBeNull();
    });
});
