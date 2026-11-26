import { describe, it, expect } from 'vitest';
import { makeClient, adapterWithClient } from './supabaseTestUtils';
import type { StudentTest } from '../../../types';

const ME = 'teacher-me';

function firstUpsertPayload(client: unknown) {
    const from = (client as { from: { mock: { results: { value: unknown }[] } } }).from;
    const builder = from.mock.results[0].value as { upsert: { mock: { calls: unknown[][] } } };
    return builder.upsert.mock.calls[0][0];
}

describe('SupabaseAdapter student test writes', () => {
    it('writes the whole submission document, so a review flag survives the sync', async () => {
        const st: StudentTest = {
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [],
            status: 'graded',
            startedAt: '2026-01-01T00:00:00.000Z',
            reviewFlags: ['q1'],
        };
        const client = makeClient({ data: [{ id: 'st1' }], error: null });

        const result = await adapterWithClient(client, ME).upsertStudentTest(st);

        expect(result).toEqual({ success: true });
        expect(firstUpsertPayload(client)).toEqual({ id: 'st1', owner_id: ME, data: st });
    });

    it('reports a failed write instead of swallowing it', async () => {
        const client = makeClient({ data: null, error: { message: 'permission denied' } });

        const result = await adapterWithClient(client, ME).upsertStudentTest({
            id: 'st1',
            testId: 't1',
            studentId: 's1',
            answers: [],
            status: 'in_progress',
            startedAt: '2026-01-01T00:00:00.000Z',
        });

        expect(result).toEqual({ success: false, error: 'permission denied' });
    });
});
