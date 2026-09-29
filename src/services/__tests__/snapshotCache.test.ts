import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    putSnapshot,
    getSnapshot,
    clearSnapshots,
    markCloudHydrated,
    isCloudHydrated,
    resetCloudHydratedForTests,
} from '../snapshotCache';
import { saveStudentRubricsCache, loadCachedStudentRubrics } from '../../store/storage';
import { reducer } from '../../context/storeCore';
import type { StudentRubric } from '../../types';
import type { StoreData } from '../../store/storage';

const sr = (id: string, extra: Partial<StudentRubric> = {}): StudentRubric => ({
    id,
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c', levelId: null, comment: '', checkedSubItems: [], audioDataUrl: 'data:audio' }],
    overallComment: '',
    isPeerReview: false,
    ...extra,
});

describe('snapshotCache', () => {
    beforeEach(async () => {
        await clearSnapshots();
        resetCloudHydratedForTests();
        localStorage.clear();
    });

    it('round-trips a snapshot and clears it', async () => {
        expect(await putSnapshot('k', [1, 2])).toBe(true);
        expect(await getSnapshot<number[]>('k')).toEqual([1, 2]);
        await clearSnapshots();
        expect(await getSnapshot('k')).toBeNull();
    });

    it('stores student rubrics in IndexedDB, strips audio and deleted rows, and frees the localStorage copy', async () => {
        localStorage.setItem('rm_student_rubrics', '[]');
        await saveStudentRubricsCache([sr('a'), sr('b', { deletedAt: '2026-01-01' })]);
        expect(localStorage.getItem('rm_student_rubrics')).toBeNull();
        const cached = await loadCachedStudentRubrics();
        expect(cached.map((c) => c.id)).toEqual(['a']);
        expect(cached[0].entries[0].audioDataUrl).toBeUndefined();
    });

    it('never serves a stale snapshot once cloud data has been applied', async () => {
        await saveStudentRubricsCache([sr('a')]);
        markCloudHydrated();
        expect(isCloudHydrated()).toBe(true);
        expect(await loadCachedStudentRubrics()).toEqual([]);
    });

    it('MERGE_CACHED_STUDENT_RUBRICS only adds ids missing from state', () => {
        const state = { studentRubrics: [sr('a', { overallComment: 'live' })] } as StoreData;
        const next = reducer(state, { type: 'MERGE_CACHED_STUDENT_RUBRICS', payload: [sr('a'), sr('b')] });
        expect(next.studentRubrics.map((x) => x.id)).toEqual(['a', 'b']);
        expect(next.studentRubrics[0].overallComment).toBe('live');
        expect(reducer(next, { type: 'MERGE_CACHED_STUDENT_RUBRICS', payload: [sr('b')] })).toBe(next);
    });
});
