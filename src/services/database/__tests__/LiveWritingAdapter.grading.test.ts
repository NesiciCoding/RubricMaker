import { describe, expect, it, vi } from 'vitest';
import { LiveWritingAdapter } from '../LiveWritingAdapter';
import type { LiveWritingFinalText, LiveWritingSession } from '../../../types';

const session = {
    id: '8f0f7e0e-0000-4000-8000-000000000001',
    title: 'Friday quick-write',
    prompt: 'Write about the sea.',
    currentRound: 1,
} as LiveWritingSession;

const finalText = {
    participantId: '8f0f7e0e-0000-4000-8000-000000000002',
    studentId: 'student-1',
    contentHtml: '<p>The sea was loud.</p>',
    wordCount: 4,
} as LiveWritingFinalText;

function makeClient(studentData: unknown, existingSubmission: { id: string } | null) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });

    const maybeSingle = vi.fn().mockResolvedValue({ data: existingSubmission, error: null });
    const client = {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'teacher-1' } }, error: null }),
        },
        from: vi.fn((table: string) => {
            if (table === 'students') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({ data: { data: studentData }, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'essay_assignments') return { upsert };
            if (table === 'essay_submissions') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({ maybeSingle }),
                    }),
                    insert,
                    update,
                };
            }
            throw new Error(`unexpected table: ${table}`);
        }),
        storage: { from: vi.fn().mockReturnValue({ upload }) },
        rpc,
    };

    return { client: client as never, insert, update, updateEq, upsert, rpc };
}

describe('LiveWritingAdapter.sendFinalTextToGrading', () => {
    it('stores the roster email so the matched student sees the submission in the portal', async () => {
        const { client, insert } = makeClient({ email: '  Student@Example.com ' }, null);
        const adapter = new LiveWritingAdapter(client);

        await adapter.sendFinalTextToGrading(session, finalText, 'rubric-1');

        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                student_email: 'Student@Example.com',
                student_user_id: null,
                assignment_id: expect.stringContaining('lw-'),
            })
        );
    });

    it('repairs the email on a submission that was handed off before the fix', async () => {
        const { client, update, updateEq } = makeClient({ email: 'student@example.com' }, { id: 'existing' });
        const adapter = new LiveWritingAdapter(client);

        await adapter.sendFinalTextToGrading(session, finalText, 'rubric-1');

        expect(update).toHaveBeenCalledWith(expect.objectContaining({ student_email: 'student@example.com' }));
        expect(updateEq).toHaveBeenCalledWith('id', expect.any(String));
    });

    it('leaves the email null when the roster student has no email', async () => {
        const { client, insert } = makeClient({ name: 'No Email' }, null);
        const adapter = new LiveWritingAdapter(client);

        await adapter.sendFinalTextToGrading(session, finalText, 'rubric-1');

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ student_email: null }));
    });
});
