import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EssayAdapter } from '../EssayAdapter';

function anonSession(userId: string) {
    return { user: { id: userId, email: undefined }, access_token: 'tok' };
}

function adapterWithClients(isolatedSession: unknown, portalSession: unknown = null) {
    const adapter = new EssayAdapter('https://example.supabase.co', 'anon-key');
    (adapter as unknown as { client: unknown }).client = {
        auth: {
            getSession: vi.fn(async () => ({ data: { session: isolatedSession } })),
            signInAnonymously: vi.fn(async () => ({ data: { session: isolatedSession }, error: null })),
        },
    };
    (adapter as unknown as { portalClient: unknown }).portalClient = {
        auth: { getSession: vi.fn(async () => ({ data: { session: portalSession } })) },
        from: vi.fn(),
    };
    return adapter;
}

describe('EssayAdapter anonymous session email persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('signInAnonymously persists the typed email', async () => {
        const adapter = adapterWithClients(anonSession('anon1'));
        const result = await adapter.signInAnonymously('student@example.com');
        expect(result.userId).toBe('anon1');
        expect(localStorage.getItem('rm_student_email')).toBe('student@example.com');
    });

    it('getSession falls back to the persisted email for an anonymous session that survived a remount', async () => {
        localStorage.setItem('rm_student_email', 'student@example.com');
        const adapter = adapterWithClients(anonSession('anon1'));
        expect(await adapter.getSession()).toEqual({ userId: 'anon1', email: 'student@example.com' });
    });

    it('getSession returns null email for an anonymous session with nothing persisted', async () => {
        const adapter = adapterWithClients(anonSession('anon1'));
        expect(await adapter.getSession()).toEqual({ userId: 'anon1', email: null });
    });
});
