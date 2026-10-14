import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Student, StudentRubric, StudentTest } from '../../types';
import { useConfirm } from '../useConfirm';
import { usePendingGrading } from '../usePendingGrading';
import { useDbStatus } from '../useDbStatus';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mutable state consumed by the AppContext mock (usePendingGrading)
let mockStudents: Student[] = [];
let mockStudentRubrics: StudentRubric[] = [];
let mockStudentTests: StudentTest[] = [];
let mockThreshold = 7;

const makeAppContextMock = () => ({
    students: mockStudents,
    studentRubrics: mockStudentRubrics,
    studentTests: mockStudentTests,
    settings: { overdueReminderThreshold: mockThreshold },
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

// Mutable unsub functions so we can verify cleanup
let mockUnsubSync = vi.fn();
let mockUnsubAuth = vi.fn();
let capturedAuthCallback: ((user: unknown) => void) | null = null;
let capturedSyncCallback: (() => void) | null = null;

vi.mock('../../services/database', () => ({
    storageSync: {
        subscribe: vi.fn((cb: () => void) => {
            capturedSyncCallback = cb;
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

// ─── usePendingGrading ────────────────────────────────────────────────────────

function daysAgo(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString();
}

describe('usePendingGrading', () => {
    beforeEach(() => {
        mockStudents = [];
        mockStudentRubrics = [];
        mockStudentTests = [];
        mockThreshold = 7;
    });

    it('returns no groups when nothing has been handed in', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentRubrics = [{ id: 'sr1', rubricId: 'r1', studentId: 's1', gradedAt: daysAgo(30) } as StudentRubric];
        const { result } = renderHook(() => usePendingGrading());
        expect(result.current.pendingGroups).toEqual([]);
    });

    it('returns the configured threshold, defaulting to 7', () => {
        mockThreshold = 14;
        expect(renderHook(() => usePendingGrading()).result.current.threshold).toBe(14);
        mockThreshold = undefined as unknown as number;
        expect(renderHook(() => usePendingGrading()).result.current.threshold).toBe(7);
    });

    it('groups submitted tests that waited past the threshold', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockStudentTests = [
            { id: 'st1', testId: 't1', studentId: 's1', status: 'submitted', submittedAt: daysAgo(9) } as StudentTest,
        ];
        const { result } = renderHook(() => usePendingGrading());
        expect(result.current.pendingGroups).toHaveLength(1);
        expect(result.current.pendingGroups[0]).toMatchObject({ key: 'test:t1', studentIds: ['s1'] });
    });
});

// ─── useDbStatus ─────────────────────────────────────────────────────────────

describe('useDbStatus', () => {
    beforeEach(() => {
        mockUnsubSync = vi.fn();
        mockUnsubAuth = vi.fn();
        capturedAuthCallback = null;
        capturedSyncCallback = null;
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

    it('re-renders when a storage sync event fires', () => {
        const { result } = renderHook(() => useDbStatus());
        act(() => {
            capturedSyncCallback!();
        });
        expect(result.current.isConnected).toBe(false);
    });

    it('calls both unsub functions on unmount', () => {
        const { unmount } = renderHook(() => useDbStatus());
        unmount();
        expect(mockUnsubSync).toHaveBeenCalled();
        expect(mockUnsubAuth).toHaveBeenCalled();
    });
});
