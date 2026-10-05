import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

import { EssayAdapter } from '../EssayAdapter';
import { TestAdapter } from '../TestAdapter';

const SESSION = { access_token: 'real-token', user: { id: 'u1', email: 'a@example.com' } };

function fakeClient() {
    return {
        auth: {
            getSession: vi.fn(async () => ({ data: { session: SESSION } })),
            signInAnonymously: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
        },
        from: vi.fn(),
    };
}

function configure(url: string) {
    localStorage.setItem('rm_supabase_config', JSON.stringify({ supabaseUrl: url, supabaseAnonKey: 'anon' }));
}

describe('student adapters and untrusted project URLs', () => {
    beforeEach(() => {
        localStorage.clear();
        createClient.mockReset();
        createClient.mockImplementation(() => fakeClient());
        vi.unstubAllGlobals();
    });

    it('EssayAdapter refuses a project URL that is not the configured one and creates no client', () => {
        configure('https://proj.supabase.co');
        expect(() => new EssayAdapter('https://proj.evil.example', 'k', 'key1')).toThrow();
        expect(createClient).not.toHaveBeenCalled();
    });

    it('TestAdapter refuses a project URL that is not the configured one and creates no client', () => {
        configure('https://proj.supabase.co');
        expect(() => new TestAdapter('https://proj.evil.example', 'k')).toThrow();
        expect(createClient).not.toHaveBeenCalled();
    });

    it('EssayAdapter keys the stored session by host and only opens the default-key client on a configured device', () => {
        configure('https://proj.supabase.co');
        new EssayAdapter('https://proj.supabase.co', 'k', 'key1');
        expect(createClient).toHaveBeenCalledTimes(2);
        const isolated = createClient.mock.calls[0][2] as { auth: { storageKey: string } };
        expect(isolated.auth.storageKey).toBe('rm_student_auth:proj.supabase.co:key1');

        createClient.mockClear();
        localStorage.clear();
        new EssayAdapter('https://other.example', 'k', 'key1');
        expect(createClient).toHaveBeenCalledTimes(1);
        const other = createClient.mock.calls[0][2] as { auth: { storageKey: string } };
        expect(other.auth.storageKey).toBe('rm_student_auth:other.example:key1');
    });

    it('TestAdapter keys the stored session by host', () => {
        new TestAdapter('https://abc.supabase.co', 'k');
        const opts = createClient.mock.calls[0][2] as { auth: { storageKey: string } };
        expect(opts.auth.storageKey).toBe('rm_student_test_auth:abc.supabase.co');
    });

    it('EssayAdapter.submitEssay posts only to the project it was built for, whatever the assignment says', async () => {
        configure('https://proj.supabase.co');
        const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchSpy);
        const adapter = new EssayAdapter('https://proj.supabase.co', 'anon', 'key1');
        await adapter.submitEssay(
            {
                teacherKey: 'key1',
                supabaseUrl: 'https://proj.evil.example',
                supabaseAnonKey: 'other-key',
            } as never,
            'sub1',
            '<p>x</p>',
            'a@example.com',
            'u1',
            1
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
        expect(url.startsWith('https://proj.supabase.co/functions/v1/')).toBe(true);
        expect(init.headers.apikey).toBe('anon');
    });
});
