import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';
import type { StudentRubric } from '../../../types';

const adapter = storageSync.adapter;

function sr(id: string): StudentRubric {
    return {
        id,
        rubricId: 'r1',
        studentId: 's' + id,
        entries: [],
        overallComment: '',
        isPeerReview: false,
    } as StudentRubric;
}

afterEach(() => vi.restoreAllMocks());

describe('StorageSync.pushMany', () => {
    it('collapses a bulk studentRubric upsert into a single array upsert', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'upsertStudentRubrics').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'upsertStudentRubric').mockResolvedValue({ success: true });

        await storageSync.pushMany('studentRubric', 'upsert', [sr('1'), sr('2'), sr('3')], ['1', '2', '3']);

        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch.mock.calls[0][0]).toHaveLength(3);
        expect(single).not.toHaveBeenCalled();
    });

    it('collapses a bulk studentRubric delete into a single .in() delete', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'deleteStudentRubrics').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'deleteStudentRubric').mockResolvedValue({ success: true });

        await storageSync.pushMany('studentRubric', 'delete', [], ['1', '2']);

        expect(batch).toHaveBeenCalledWith(['1', '2']);
        expect(single).not.toHaveBeenCalled();
    });

    it('falls back to per-row for an entity without a batch path', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const single = vi.spyOn(adapter, 'upsertRubric').mockResolvedValue({ success: true });

        await storageSync.pushMany('rubric', 'upsert', [{ id: 'a' }, { id: 'b' }], ['a', 'b']);

        expect(single).toHaveBeenCalledTimes(2);
    });

    it('falls back to per-row when the batch upsert fails (retry semantics preserved)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertStudentRubrics').mockResolvedValue({ success: false, error: 'boom' });
        const single = vi.spyOn(adapter, 'upsertStudentRubric').mockResolvedValue({ success: true });

        await storageSync.pushMany('studentRubric', 'upsert', [sr('1'), sr('2')], ['1', '2']);

        expect(single).toHaveBeenCalledTimes(2);
    });
});
