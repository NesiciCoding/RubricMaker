import { beforeEach, describe, expect, it } from 'vitest';
import { hasConfiguredProject, isAllowedSupabaseUrl } from '../trustedSupabaseUrl';

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
