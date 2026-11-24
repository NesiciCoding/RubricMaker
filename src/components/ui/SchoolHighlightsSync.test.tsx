import { render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolHighlightsSync } from './SchoolHighlightsSync';
import { StoreProvider, createSelectorStore } from '../../context/useStore';
import type { StoreData } from '../../context/storeCore';
import * as lazyDb from '../../services/database/lazyDb';
import * as logger from '../../services/logging/clientLogger';

vi.mock('../../services/database/lazyDb', () => ({ getDb: vi.fn(), loadDb: vi.fn() }));
vi.mock('../../services/logging/clientLogger', () => ({ logError: vi.fn() }));

const FIRST_PUSH_MS = 45_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function makeState(
    over: Omit<Partial<StoreData>, 'settings'> & { settings?: Partial<StoreData['settings']> } = {}
): StoreData {
    const { settings, ...rest } = over;
    return {
        students: [{ id: 's1', name: 'Alice', classId: 'c1' }],
        classes: [{ id: 'c1', name: 'Class', year: 'jaar-2' }],
        tests: [],
        studentTests: [],
        rubrics: [],
        studentRubrics: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        selfAssessments: [],
        settings: { userRole: 'teacher', ...settings },
        ...rest,
    } as unknown as StoreData;
}

function mount(state: StoreData) {
    const store = createSelectorStore(() => state, vi.fn());
    return render(
        <StoreProvider store={store}>
            <SchoolHighlightsSync />
        </StoreProvider>
    );
}

describe('SchoolHighlightsSync', () => {
    const push = vi.fn();
    const forTeacher = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        push.mockReset().mockResolvedValue(undefined);
        forTeacher.mockReset().mockReturnValue({ push });
        vi.mocked(logger.logError).mockReset();
        vi.mocked(lazyDb.getDb).mockReturnValue({
            SchoolHighlightsAdapter: { forTeacher },
            storageSync: { getCurrentUserId: () => 'teacher-1' },
        } as never);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const flush = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    it('pushes the signed-in teacher’s snapshot after the first delay', async () => {
        mount(makeState());
        await flush(FIRST_PUSH_MS - 1);
        expect(push).not.toHaveBeenCalled();
        await flush(2);
        expect(push).toHaveBeenCalledTimes(1);
        const [ownerId, snapshot, today] = push.mock.calls[0];
        expect(ownerId).toBe('teacher-1');
        expect(snapshot.studentCount).toBe(1);
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('does not push again when nothing changed', async () => {
        mount(makeState());
        await flush(FIRST_PUSH_MS + 1);
        await flush(SIX_HOURS_MS);
        expect(push).toHaveBeenCalledTimes(1);
    });

    it('does nothing once the teacher opted out', async () => {
        mount(makeState({ settings: { shareSchoolHighlights: false } }));
        await flush(FIRST_PUSH_MS + 1);
        expect(forTeacher).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });

    it('does nothing for a student session', async () => {
        mount(makeState({ settings: { userRole: 'student' } }));
        await flush(FIRST_PUSH_MS + 1);
        expect(push).not.toHaveBeenCalled();
    });

    it('does nothing without a database connection', async () => {
        forTeacher.mockReturnValue(null);
        mount(makeState());
        await flush(FIRST_PUSH_MS + 1);
        expect(push).not.toHaveBeenCalled();
    });

    it('skips an empty roster', async () => {
        mount(makeState({ students: [] }));
        await flush(FIRST_PUSH_MS + 1);
        expect(push).not.toHaveBeenCalled();
    });

    it('logs a failed push and retries on the next interval', async () => {
        push.mockRejectedValueOnce(new Error('rls'));
        mount(makeState());
        await flush(FIRST_PUSH_MS + 1);
        expect(logger.logError).toHaveBeenCalledWith('school_highlights_push_failed', expect.any(Error));
        await flush(SIX_HOURS_MS);
        expect(push).toHaveBeenCalledTimes(2);
    });

    it('stops its timers on unmount', async () => {
        const { unmount } = mount(makeState());
        unmount();
        await flush(FIRST_PUSH_MS + SIX_HOURS_MS);
        expect(push).not.toHaveBeenCalled();
    });
});
