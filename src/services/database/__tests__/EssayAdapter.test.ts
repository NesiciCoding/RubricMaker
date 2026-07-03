import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EssayAdapter } from '../EssayAdapter';

function anonSession(userId: string) {
    return { user: { id: userId, email: undefined }, access_token: 'tok' };
}

function adapterWithClients(isolatedSession: unknown, portalSession: unknown = null, assignmentKey = 'assign1') {
    const adapter = new EssayAdapter('https://example.supabase.co', 'anon-key', assignmentKey);
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

    it('signInAnonymously persists the typed email under an assignment-scoped key', async () => {
        const adapter = adapterWithClients(anonSession('anon1'));
        const result = await adapter.signInAnonymously('student@example.com');
        expect(result.userId).toBe('anon1');
        expect(localStorage.getItem('rm_student_email:assign1')).toBe('student@example.com');
    });

    it('getSession falls back to the persisted email for an anonymous session that survived a remount', async () => {
        localStorage.setItem('rm_student_email:assign1', 'student@example.com');
        const adapter = adapterWithClients(anonSession('anon1'));
        expect(await adapter.getSession()).toEqual({ userId: 'anon1', email: 'student@example.com' });
    });

    it('getSession returns null email for an anonymous session with nothing persisted', async () => {
        const adapter = adapterWithClients(anonSession('anon1'));
        expect(await adapter.getSession()).toEqual({ userId: 'anon1', email: null });
    });

    it('clearStoredEmail removes the persisted email so a later remount re-shows the gate', async () => {
        const adapter = adapterWithClients(anonSession('anon1'));
        await adapter.signInAnonymously('student@example.com');
        expect(localStorage.getItem('rm_student_email:assign1')).toBe('student@example.com');

        adapter.clearStoredEmail();

        expect(localStorage.getItem('rm_student_email:assign1')).toBeNull();
        expect(await adapter.getSession()).toEqual({ userId: 'anon1', email: null });
    });

    it('scopes the stored email per assignment so one assignment cannot see another', async () => {
        const adapterA = adapterWithClients(anonSession('anon1'), null, 'assignA');
        const adapterB = adapterWithClients(anonSession('anon2'), null, 'assignB');

        await adapterA.signInAnonymously('student@example.com');

        expect(await adapterB.getSession()).toEqual({ userId: 'anon2', email: null });
        expect(localStorage.getItem('rm_student_email:assignB')).toBeNull();
        expect(localStorage.getItem('rm_student_email:assignA')).toBe('student@example.com');
    });
});
