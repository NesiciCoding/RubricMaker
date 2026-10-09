import { describe, expect, it, vi } from 'vitest';
import { adapterWithClient } from './supabaseTestUtils';

type Obj = { bucket_id: string; name: string };

function makeClient(opts: {
    objects?: Obj[];
    listError?: { message: string };
    removeError?: string;
    rlsKeeps?: string[];
    eraseErrors?: Record<string, string>;
    eraseError?: { message: string };
}) {
    const calls: string[] = [];
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${fn}`);
        if (fn === 'student_storage_objects') return { data: opts.objects ?? [], error: opts.listError ?? null };
        if (opts.eraseError) return { data: null, error: opts.eraseError };
        return { data: { deleted: {}, errors: opts.eraseErrors ?? {}, args }, error: null };
    });
    const storage = {
        from: (bucket: string) => ({
            remove: async (paths: string[]) => {
                calls.push(`remove:${bucket}:${paths.length}`);
                if (bucket === opts.removeError) return { data: null, error: { message: 'network down' } };
                // RLS-skipped objects come back missing from data, without an error.
                const data = paths.filter((p) => !(opts.rlsKeeps ?? []).includes(p)).map((name) => ({ name }));
                return { data, error: null };
            },
        }),
    };
    return { client: { from: vi.fn(), rpc, storage }, calls, rpc };
}

// #644: erase one student's files and rows; leftovers are recorded, never silently dropped.
describe('SupabaseAdapter.eraseStudentData', () => {
    it('removes the student files before erasing the rows', async () => {
        const { client, calls, rpc } = makeClient({
            objects: [
                { bucket_id: 'attachments', name: 'u1/a.pdf' },
                { bucket_id: 'feedback-audio', name: 'u1/f.webm' },
            ],
        });
        const result = await adapterWithClient(client).eraseStudentData('s1');
        expect(result).toEqual({ success: true, failed: [], leftoverFiles: [] });
        expect(calls).toEqual([
            'rpc:student_storage_objects',
            'remove:attachments:1',
            'remove:feedback-audio:1',
            'rpc:erase_student',
        ]);
        expect(rpc).toHaveBeenLastCalledWith('erase_student', { p_student_id: 's1', p_storage_failures: [] });
    });

    it('passes files Storage RLS kept (another grader’s folder) to the audit log and reports them', async () => {
        const { client, rpc } = makeClient({
            objects: [
                { bucket_id: 'feedback-audio', name: 'u1/mine.webm' },
                { bucket_id: 'feedback-audio', name: 'u2/theirs.webm' },
            ],
            rlsKeeps: ['u2/theirs.webm'],
        });
        const result = await adapterWithClient(client).eraseStudentData('s1');
        expect(result.success).toBe(true);
        expect(result.leftoverFiles).toEqual([{ bucket: 'feedback-audio', name: 'u2/theirs.webm' }]);
        expect(rpc).toHaveBeenLastCalledWith('erase_student', {
            p_student_id: 's1',
            p_storage_failures: [{ bucket: 'feedback-audio', name: 'u2/theirs.webm' }],
        });
    });

    it('stops before touching rows when listing or removing files fails', async () => {
        const listed = makeClient({ listError: { message: 'Only the student’s teacher can erase this student' } });
        expect(await adapterWithClient(listed.client).eraseStudentData('s1')).toMatchObject({
            success: false,
            failed: ['storage'],
        });
        expect(listed.calls).toEqual(['rpc:student_storage_objects']);

        const removed = makeClient({ objects: [{ bucket_id: 'scans', name: 'u1/x' }], removeError: 'scans' });
        expect(await adapterWithClient(removed.client).eraseStudentData('s1')).toMatchObject({
            success: false,
            failed: ['storage:scans'],
        });
        expect(removed.calls).not.toContain('rpc:erase_student');
    });

    it('reports tables the database could not erase', async () => {
        const { client } = makeClient({ eraseErrors: { messages: 'permission denied' } });
        expect(await adapterWithClient(client).eraseStudentData('s1')).toMatchObject({
            success: false,
            failed: ['messages'],
        });
        const stopped = makeClient({ eraseErrors: { messages: 'permission denied', students: 'skipped' } });
        expect(await adapterWithClient(stopped.client).eraseStudentData('s1')).toMatchObject({
            success: false,
            error: 'messages',
            failed: ['messages'],
        });
        const failing = makeClient({ eraseError: { message: 'boom' } });
        expect(await adapterWithClient(failing.client).eraseStudentData('s1')).toMatchObject({
            success: false,
            error: 'boom',
            failed: ['database'],
        });
    });
});
