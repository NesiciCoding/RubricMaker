import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';
import { loadStore } from '../../../store/storage';
import type { Student, StudentRubric } from '../../../types';

const adapter = storageSync.adapter;

afterEach(() => vi.restoreAllMocks());

describe('StorageSync.pushAll', () => {
    it('upserts students before grade rows and reports a failed student upsert', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const order: string[] = [];
        vi.spyOn(adapter, 'upsertStudent').mockImplementation(async () => {
            order.push('student');
            return { success: false, error: 'student rejected' };
        });
        vi.spyOn(adapter, 'upsertStudentRubric').mockImplementation(async () => {
            order.push('grade');
            return { success: true };
        });
        vi.spyOn(adapter, 'saveSettings').mockResolvedValue({ success: true });

        const empty = Object.fromEntries(
            Object.entries(loadStore()).map(([k, v]) => [k, Array.isArray(v) ? [] : v])
        ) as ReturnType<typeof loadStore>;
        const state = {
            ...empty,
            students: [{ id: 's1' } as Student],
            studentRubrics: [{ id: 'g1', studentId: 's1', rubricId: 'r1', entries: [] } as unknown as StudentRubric],
        };
        const result = await storageSync.pushAll(state);

        expect(order).toEqual(['student', 'grade']);
        expect(result).toEqual({ success: false, error: 'student rejected' });
    });

    it('uploads folders on the first push, so local folders reach the cloud (#850)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const upsertFolder = vi.spyOn(adapter, 'upsertFolder').mockResolvedValue({ success: true });
        vi.spyOn(adapter, 'saveSettings').mockResolvedValue({ success: true });

        const empty = Object.fromEntries(
            Object.entries(loadStore()).map(([k, v]) => [k, Array.isArray(v) ? [] : v])
        ) as ReturnType<typeof loadStore>;
        const folder = {
            id: 'f1',
            name: 'Essays',
            kind: 'rubric' as const,
            createdAt: '2024-01-01T00:00:00.000Z',
        };
        const result = await storageSync.pushAll({ ...empty, folders: [folder] });

        expect(upsertFolder).toHaveBeenCalledWith(folder);
        expect(result).toEqual({ success: true });
    });
});
