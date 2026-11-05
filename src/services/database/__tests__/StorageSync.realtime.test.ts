import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { storageSync } from '../StorageSync';

// Co-teaching (#1061): student_rubrics/student_tests realtime no longer filters by grader/owner
// (RLS alone decides what's delivered, same as their unscoped fetches — see hydratePartial.test.ts
// for fetchStudentRubrics/fetchStudentTests themselves), and rubrics/tests/folders get a SECOND
// owner_id<>me binding that feeds useSharedMaterials instead of hydratePartial. Only the singleton
// is exported, so these spy on it directly, like hydratePartial.test.ts.
const adapter = storageSync.adapter;

type Binding = { event: string; table: string; filter?: string; handler: () => void };

function fakeChannel() {
    const bindings: Binding[] = [];
    const channel = {
        on: vi.fn((event: string, config: { table: string; filter?: string }, handler: () => void) => {
            bindings.push({ event, table: config.table, filter: config.filter, handler });
            return channel;
        }),
        subscribe: vi.fn(() => channel),
    };
    return { channel, bindings };
}

function connectFakeClient() {
    const { channel, bindings } = fakeChannel();
    const removeChannel = vi.fn();
    vi.spyOn(adapter, 'getClient').mockReturnValue({
        channel: vi.fn(() => channel),
        removeChannel,
    } as never);
    vi.spyOn(adapter, 'getCurrentUserId').mockReturnValue('me');
    return { bindings, removeChannel };
}

describe('StorageSync realtime subscriptions (co-teaching, 095/096)', () => {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).stopRealtimeSync();
    });
    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).stopRealtimeSync();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('subscribes student_rubrics and student_tests with no filter at all', () => {
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const sr = bindings.filter((b) => b.table === 'student_rubrics');
        const st = bindings.filter((b) => b.table === 'student_tests');
        expect(sr).toHaveLength(1);
        expect(st).toHaveLength(1);
        expect(sr[0].filter).toBeUndefined();
        expect(st[0].filter).toBeUndefined();
    });

    it('subscribes classes and students with no filter, so a co-teacher sees roster changes', () => {
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        for (const table of ['classes', 'students']) {
            const forTable = bindings.filter((b) => b.table === table);
            expect(forTable).toHaveLength(1);
            expect(forTable[0].filter).toBeUndefined();
        }
    });

    it('routes a colleague’s student change (e.g. a new track) to a students refresh', () => {
        vi.useFakeTimers();
        const { bindings } = connectFakeClient();
        const onRealtime = vi.fn();
        const unsubscribe = storageSync.onRealtimeChange(onRealtime);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        bindings.find((b) => b.table === 'students')!.handler();
        vi.runAllTimers();

        expect(onRealtime).toHaveBeenCalledWith(['students']);
        unsubscribe();
    });

    it('keeps the owner-scoped filter on rows that only ever belong to the signed-in user', () => {
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const scalesBindings = bindings.filter((b) => b.table === 'grade_scales');
        expect(scalesBindings).toHaveLength(1);
        expect(scalesBindings[0].filter).toBe('owner_id=eq.me');
    });

    it('adds a second owner_id<>me binding for rubrics/tests/folders alongside the owner-scoped one', () => {
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        for (const table of ['rubrics', 'tests', 'folders']) {
            const forTable = bindings.filter((b) => b.table === table);
            expect(forTable.map((b) => b.filter).sort()).toEqual(['owner_id=eq.me', 'owner_id=neq.me']);
        }
    });

    it('routes an owned rubric change to onRealtimeChange (hydratePartial path), not onSharedMaterialChange', () => {
        vi.useFakeTimers();
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const onRealtimeChange = vi.fn();
        const onSharedMaterialChange = vi.fn();
        storageSync.onRealtimeChange(onRealtimeChange);
        storageSync.onSharedMaterialChange(onSharedMaterialChange);

        const owned = bindings.find((b) => b.table === 'rubrics' && b.filter === 'owner_id=eq.me');
        owned?.handler();
        vi.advanceTimersByTime(900);

        expect(onRealtimeChange).toHaveBeenCalledWith(['rubrics']);
        expect(onSharedMaterialChange).not.toHaveBeenCalled();
    });

    it('routes a colleague’s rubric change to onSharedMaterialChange, not onRealtimeChange', () => {
        vi.useFakeTimers();
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const onRealtimeChange = vi.fn();
        const onSharedMaterialChange = vi.fn();
        storageSync.onRealtimeChange(onRealtimeChange);
        storageSync.onSharedMaterialChange(onSharedMaterialChange);

        const shared = bindings.find((b) => b.table === 'rubrics' && b.filter === 'owner_id=neq.me');
        shared?.handler();
        vi.advanceTimersByTime(900);

        expect(onSharedMaterialChange).toHaveBeenCalledWith(['rubrics']);
        expect(onRealtimeChange).not.toHaveBeenCalled();
    });

    it('debounces several shared-material changes into a single notification', () => {
        vi.useFakeTimers();
        const { bindings } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const onSharedMaterialChange = vi.fn();
        storageSync.onSharedMaterialChange(onSharedMaterialChange);

        const rubricsShared = bindings.find((b) => b.table === 'rubrics' && b.filter === 'owner_id=neq.me');
        const testsShared = bindings.find((b) => b.table === 'tests' && b.filter === 'owner_id=neq.me');
        rubricsShared?.handler();
        testsShared?.handler();
        vi.advanceTimersByTime(900);

        expect(onSharedMaterialChange).toHaveBeenCalledTimes(1);
        expect(onSharedMaterialChange.mock.calls[0][0].sort()).toEqual(['rubrics', 'tests']);
    });

    it('stopRealtimeSync clears the pending shared-material debounce along with the channel', () => {
        vi.useFakeTimers();
        const { bindings, removeChannel } = connectFakeClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).startRealtimeSync();

        const onSharedMaterialChange = vi.fn();
        storageSync.onSharedMaterialChange(onSharedMaterialChange);
        const shared = bindings.find((b) => b.table === 'rubrics' && b.filter === 'owner_id=neq.me');
        shared?.handler();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (storageSync as any).stopRealtimeSync();
        vi.advanceTimersByTime(900);

        expect(onSharedMaterialChange).not.toHaveBeenCalled();
        expect(removeChannel).toHaveBeenCalledTimes(1);
    });
});
