import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';
import type { StudentRubric, Student, Class } from '../../../types';

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

function student(id: string): Student {
    return { id, name: 'Student ' + id, classId: 'c1' } as Student;
}

function cls(id: string): Class {
    return { id, name: 'Class ' + id } as Class;
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

    it('collapses a bulk student upsert into a single array upsert (e.g. a CSV roster import)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'upsertStudents').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'upsertStudent').mockResolvedValue({ success: true });

        await storageSync.pushMany('student', 'upsert', [student('1'), student('2')], ['1', '2']);

        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch.mock.calls[0][0]).toHaveLength(2);
        expect(single).not.toHaveBeenCalled();
    });

    it('collapses a bulk student delete into a single .in() delete', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'deleteStudents').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'deleteStudent').mockResolvedValue({ success: true });

        await storageSync.pushMany('student', 'delete', [], ['1', '2']);

        expect(batch).toHaveBeenCalledWith(['1', '2']);
        expect(single).not.toHaveBeenCalled();
    });

    it('falls back to per-row student upserts when the batch upsert fails', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertStudents').mockResolvedValue({ success: false, error: 'boom' });
        const single = vi.spyOn(adapter, 'upsertStudent').mockResolvedValue({ success: true });

        await storageSync.pushMany('student', 'upsert', [student('1'), student('2')], ['1', '2']);

        expect(single).toHaveBeenCalledTimes(2);
    });

    it('collapses a bulk class upsert into a single array upsert', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'upsertClasses').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'upsertClass').mockResolvedValue({ success: true });

        await storageSync.pushMany('class', 'upsert', [cls('1'), cls('2')], ['1', '2']);

        expect(batch).toHaveBeenCalledTimes(1);
        expect(batch.mock.calls[0][0]).toHaveLength(2);
        expect(single).not.toHaveBeenCalled();
    });

    it('collapses a bulk class delete into a single .in() delete', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const batch = vi.spyOn(adapter, 'deleteClasses').mockResolvedValue({ success: true });
        const single = vi.spyOn(adapter, 'deleteClass').mockResolvedValue({ success: true });

        await storageSync.pushMany('class', 'delete', [], ['1', '2']);

        expect(batch).toHaveBeenCalledWith(['1', '2']);
        expect(single).not.toHaveBeenCalled();
    });

    it('falls back to per-row when the batch upsert fails (retry semantics preserved)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertStudentRubrics').mockResolvedValue({ success: false, error: 'boom' });
        const single = vi.spyOn(adapter, 'upsertStudentRubric').mockResolvedValue({ success: true });

        await storageSync.pushMany('studentRubric', 'upsert', [sr('1'), sr('2')], ['1', '2']);

        expect(single).toHaveBeenCalledTimes(2);
    });
});
