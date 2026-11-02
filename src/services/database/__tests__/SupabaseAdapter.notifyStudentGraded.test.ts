import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseAdapter } from '../SupabaseAdapter';
import { adapterWithClient } from './supabaseTestUtils';

function connected(session: { access_token: string } | null) {
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session } }) } };
    const adapter = adapterWithClient(client);
    Object.assign(adapter as unknown as Record<string, unknown>, {
        activeUrl: 'https://db.example.nl',
        activeKey: 'anon-key',
    });
    return adapter;
}

describe('SupabaseAdapter.notifyStudentGraded', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('authenticates with the teacher session token, not the anon key', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        await connected({ access_token: 'teacher-jwt' }).notifyStudentGraded('s1', 'Essay');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://db.example.nl/functions/v1/notify-student-graded');
        expect(init.headers.Authorization).toBe('Bearer teacher-jwt');
        expect(init.headers.apikey).toBe('anon-key');
        expect(JSON.parse(init.body)).toMatchObject({ studentId: 's1', rubricName: 'Essay' });
    });

    it('does nothing without a session or a connection', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await connected(null).notifyStudentGraded('s1', 'Essay');
        await new SupabaseAdapter().notifyStudentGraded('s1', 'Essay');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('swallows network errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(connected({ access_token: 't' }).notifyStudentGraded('s1', 'Essay')).resolves.toBeUndefined();
    });
});
