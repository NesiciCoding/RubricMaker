import { beforeEach, describe, expect, it } from 'vitest';
import { carryOverLegacySession, hasConfiguredProject, isAllowedSupabaseUrl } from '../trustedSupabaseUrl';

function configure(url: string) {
    localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: 'anon' }));
}

describe('isAllowedSupabaseUrl', () => {
    beforeEach(() => localStorage.clear());

    it('accepts any well-formed URL on a device with no configured project', () => {
        expect(hasConfiguredProject()).toBe(false);
        expect(isAllowedSupabaseUrl('https://abc.supabase.co')).toBe(true);
    });

    it('rejects missing and malformed URLs', () => {
        expect(isAllowedSupabaseUrl(undefined)).toBe(false);
        expect(isAllowedSupabaseUrl('')).toBe(false);
        expect(isAllowedSupabaseUrl('not a url')).toBe(false);
    });

    it('only accepts the configured project on a configured device', () => {
        configure('https://proj.supabase.co/');
        expect(hasConfiguredProject()).toBe(true);
        expect(isAllowedSupabaseUrl('https://proj.supabase.co')).toBe(true);
        expect(isAllowedSupabaseUrl('https://proj.supabase.co/')).toBe(true);
        expect(isAllowedSupabaseUrl('https://proj.other.example')).toBe(false);
        expect(isAllowedSupabaseUrl('https://other.example/proj.supabase.co')).toBe(false);
        expect(isAllowedSupabaseUrl('https://proj.supabase.co.other.example')).toBe(false);
        expect(isAllowedSupabaseUrl('http://proj.supabase.co')).toBe(false);
    });
});

describe('carryOverLegacySession', () => {
    beforeEach(() => localStorage.clear());

    it('copies an old session to the host-keyed key for the configured project', () => {
        configure('https://proj.supabase.co');
        localStorage.setItem('old', 'session-json');
        carryOverLegacySession('old', 'new', 'https://proj.supabase.co');
        expect(localStorage.getItem('new')).toBe('session-json');
    });

    it('does not overwrite a newer session', () => {
        configure('https://proj.supabase.co');
        localStorage.setItem('old', 'old-session');
        localStorage.setItem('new', 'new-session');
        carryOverLegacySession('old', 'new', 'https://proj.supabase.co');
        expect(localStorage.getItem('new')).toBe('new-session');
    });

    it('never carries a session to another host or onto an unconfigured device', () => {
        localStorage.setItem('old', 'session-json');
        carryOverLegacySession('old', 'new', 'https://anything.example');
        expect(localStorage.getItem('new')).toBeNull();

        configure('https://proj.supabase.co');
        carryOverLegacySession('old', 'new', 'https://proj.evil.example');
        expect(localStorage.getItem('new')).toBeNull();
    });
});
