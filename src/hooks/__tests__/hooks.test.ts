import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Student, StudentRubric } from '../../types';
import { useConfirm } from '../useConfirm';
import { useOverdueStudents } from '../useOverdueStudents';
import { useDbStatus } from '../useDbStatus';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mutable state consumed by useApp mock (useOverdueStudents)
let mockStudents: Student[] = [];
let mockStudentRubrics: StudentRubric[] = [];
let mockThreshold = 7;

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        students: mockStudents,
        studentRubrics: mockStudentRubrics,
        settings: { overdueReminderThreshold: mockThreshold },
    }),
}));

// Mutable unsub functions so we can verify cleanup
let mockUnsubSync = vi.fn();
let mockUnsubAuth = vi.fn();
let capturedAuthCallback: ((user: unknown) => void) | null = null;

vi.mock('../../services/database', () => ({
    storageSync: {
        subscribe: vi.fn((cb: () => void) => {
            void cb; // captured but not triggered in most tests
            return mockUnsubSync;
        }),
        onAuthChange: vi.fn((cb: (user: unknown) => void) => {
            capturedAuthCallback = cb;
            return mockUnsubAuth;
        }),
        isConnected: vi.fn(() => false),
        getStatus: vi.fn(() => 'idle'),
        getLastSyncAt: vi.fn(() => null),
        getCurrentUserId: vi.fn(() => null),
    },
}));

// ─── useConfirm ───────────────────────────────────────────────────────────────

describe('useConfirm', () => {
    it('starts with dialog closed', () => {
        const { result } = renderHook(() => useConfirm());
        expect(result.current.dialogProps.open).toBe(false);
    });

    it('confirm() opens the dialog with the provided options', async () => {
        const { result } = renderHook(() => useConfirm());
        act(() => {
            result.current.confirm({ title: 'Delete?', message: 'Are you sure?' });
        });
        expect(result.current.dialogProps.open).toBe(true);
        expect(result.current.dialogProps.title).toBe('Delete?');
        expect(result.current.dialogProps.message).toBe('Are you sure?');
    });

    it('handleConfirm resolves the promise with true and closes the dialog', async () => {
        const { result } = renderHook(() => useConfirm());
        let confirmPromise: Promise<boolean>;

        act(() => {
            confirmPromise = result.current.confirm({ title: 'T', message: 'M' });
        });

        act(() => {
            result.current.dialogProps.onConfirm();
        });

        expect(await confirmPromise!).toBe(true);
        expect(result.current.dialogProps.open).toBe(false);
    });

    it('handleCancel resolves the promise with false and closes the dialog', async () => {
        const { result } = renderHook(() => useConfirm());
        let confirmPromise: Promise<boolean>;

        act(() => {
            confirmPromise = result.current.confirm({ title: 'T', message: 'M' });
        });

        act(() => {
            result.current.dialogProps.onCancel();
        });

        expect(await confirmPromise!).toBe(false);
        expect(result.current.dialogProps.open).toBe(false);
    });

    it('passes optional confirmLabel, cancelLabel, and danger to dialogProps', async () => {
        const { result } = renderHook(() => useConfirm());
        act(() => {
            result.current.confirm({
                title: 'T',
                message: 'M',
                confirmLabel: 'Yes',
                cancelLabel: 'No',
                danger: false,
            });
        });
        expect(result.current.dialogProps.confirmLabel).toBe('Yes');
        expect(result.current.dialogProps.cancelLabel).toBe('No');
        expect(result.current.dialogProps.danger).toBe(false);
    });

    it('danger defaults to true when not specified', async () => {
        const { result } = renderHook(() => useConfirm());
        act(() => {
            result.current.confirm({ title: 'T', message: 'M' });
        });
        expect(result.current.dialogProps.danger).toBe(true);
    });
});

// ─── useOverdueStudents ───────────────────────────────────────────────────────

function daysAgo(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe('useOverdueStudents', () => {
    beforeEach(() => {
        mockStudents = [];
        mockStudentRubrics = [];
        mockThreshold = 7;
    });

    it('returns an empty array when there are no student rubrics', () => {
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents).toEqual([]);
    });

    it('returns the configured threshold', () => {
        mockThreshold = 14;
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.threshold).toBe(14);
    });

    it('defaults threshold to 7 when setting is absent', () => {
        mockThreshold = undefined as unknown as number;
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.threshold).toBe(7);
    });

    it('ignores rubrics without a gradedAt date', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false } as unknown as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents).toEqual([]);
    });

    it('identifies an overdue student (graded more than threshold days ago)', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(10) } as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents).toHaveLength(1);
        expect(result.current.overdueStudents[0].studentName).toBe('Alice');
        expect(result.current.overdueStudents[0].daysSince).toBeGreaterThanOrEqual(10);
    });

    it('does not flag a student graded within the threshold window', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(3) } as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents).toHaveLength(0);
    });

    it('picks the most recent gradedAt when a student has multiple rubrics', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(20) } as StudentRubric,
            { id: 'sr2', rubricId: 'r2', studentId: 's1', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(2) } as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        // Most recent is 2 days ago — within threshold
        expect(result.current.overdueStudents).toHaveLength(0);
    });

    it('sorts results by daysSince descending', () => {
        mockStudents = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
        ];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(8) } as StudentRubric,
            { id: 'sr2', rubricId: 'r2', studentId: 's2', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(15) } as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents[0].studentName).toBe('Bob');
        expect(result.current.overdueStudents[1].studentName).toBe('Alice');
    });

    it('skips a studentId that has no matching student record', () => {
        mockStudents = [];
        mockStudentRubrics = [
            { id: 'sr1', rubricId: 'r1', studentId: 'ghost', entries: [], overallComment: '', isPeerReview: false, gradedAt: daysAgo(20) } as StudentRubric,
        ];
        const { result } = renderHook(() => useOverdueStudents());
        expect(result.current.overdueStudents).toHaveLength(0);
    });
});

// ─── useDbStatus ─────────────────────────────────────────────────────────────

describe('useDbStatus', () => {
    beforeEach(() => {
        mockUnsubSync = vi.fn();
        mockUnsubAuth = vi.fn();
        capturedAuthCallback = null;
        vi.clearAllMocks();
    });

    it('returns isConnected=false from the mocked storageSync', () => {
        const { result } = renderHook(() => useDbStatus());
        expect(result.current.isConnected).toBe(false);
    });

    it('returns status from storageSync', () => {
        const { result } = renderHook(() => useDbStatus());
        expect(result.current.status).toBe('idle');
    });

    it('returns null lastSyncAt and userId', () => {
        const { result } = renderHook(() => useDbStatus());
        expect(result.current.lastSyncAt).toBeNull();
        expect(result.current.userId).toBeNull();
    });

    it('starts with currentUser=null', () => {
        const { result } = renderHook(() => useDbStatus());
        expect(result.current.currentUser).toBeNull();
    });

    it('updates currentUser when the auth callback fires', () => {
        const { result } = renderHook(() => useDbStatus());
        const fakeUser = { id: 'u1', email: 'a@b.com' };
        act(() => {
            capturedAuthCallback!(fakeUser);
        });
        expect(result.current.currentUser).toEqual(fakeUser);
    });

    it('calls both unsub functions on unmount', () => {
        const { unmount } = renderHook(() => useDbStatus());
        unmount();
        expect(mockUnsubSync).toHaveBeenCalled();
        expect(mockUnsubAuth).toHaveBeenCalled();
    });
});
