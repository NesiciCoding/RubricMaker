import { render, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchoolHighlightsSync } from './SchoolHighlightsSync';
import { StoreProvider, createSelectorStore } from '../../context/useStore';
import type { StoreData } from '../../context/storeCore';
import * as lazyDb from '../../services/database/lazyDb';
import * as logger from '../../services/logging/clientLogger';
import { isQuarantined } from '../../test-utils/quarantine';

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
    const fetchOwnStudentIds = vi.fn();
    const forTeacher = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers();
        // Pinned well clear of a UTC day boundary: the component dedupes pushes by calendar day
        // (`today + JSON.stringify(snapshot)`), and these tests advance the fake clock by 6+ hours,
        // so starting from the real wall clock made "nothing changed" cross midnight UTC — and
        // register as a second push — whenever a run happened to start late in the UTC day.
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
        push.mockReset().mockResolvedValue(undefined);
        fetchOwnStudentIds.mockReset().mockResolvedValue(new Set(['s1']));
        forTeacher.mockReset().mockReturnValue({ push, fetchOwnStudentIds });
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

    it.skipIf(isQuarantined('does not push again when nothing changed'))(
        'does not push again when nothing changed',
        async () => {
            mount(makeState());
            await flush(FIRST_PUSH_MS + 1);
            await flush(SIX_HOURS_MS);
            expect(push).toHaveBeenCalledTimes(1);
        }
    );

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

    it('pushes an empty snapshot so an earlier roster stops counting', async () => {
        mount(makeState({ students: [] }));
        await flush(FIRST_PUSH_MS + 1);
        expect(push).toHaveBeenCalledTimes(1);
        expect(push.mock.calls[0][1].studentCount).toBe(0);
    });

    it('re-checks consent after the idle wait', async () => {
        const state = makeState();
        const store = createSelectorStore(() => state, vi.fn());
        let release: () => void = () => {};
        vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
            release = cb;
        });
        render(
            <StoreProvider store={store}>
                <SchoolHighlightsSync />
            </StoreProvider>
        );
        await flush(FIRST_PUSH_MS + 1);
        state.settings = { ...state.settings, shareSchoolHighlights: false };
        await act(async () => release());
        vi.unstubAllGlobals();
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

    it('counts only the students the teacher owns, not shared-class ones', async () => {
        fetchOwnStudentIds.mockResolvedValue(new Set(['s1']));
        mount(
            makeState({
                students: [
                    { id: 's1', name: 'Mine', classId: 'c1' },
                    { id: 's2', name: 'Shared', classId: 'c1' },
                ] as StoreData['students'],
            })
        );
        await flush(FIRST_PUSH_MS + 1);
        expect(push.mock.calls[0][1].studentCount).toBe(1);
    });

    it('sends nothing when the owned student ids cannot be fetched', async () => {
        fetchOwnStudentIds.mockRejectedValueOnce(new Error('network'));
        mount(makeState());
        await flush(FIRST_PUSH_MS + 1);
        expect(push).not.toHaveBeenCalled();
        expect(logger.logError).toHaveBeenCalled();
    });

    it('stops its timers on unmount', async () => {
        const { unmount } = mount(makeState());
        unmount();
        await flush(FIRST_PUSH_MS + SIX_HOURS_MS);
        expect(push).not.toHaveBeenCalled();
    });
});
