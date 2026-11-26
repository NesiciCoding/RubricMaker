import { describe, it, expect, afterEach, vi } from 'vitest';
import { storageSync } from '../StorageSync';
import { adapterWithClient } from './supabaseTestUtils';

const ME = 'admin-me';
const ROSTER = { classIds: ['c-mine', 'c-shared'], studentIds: ['s1', 's2'] };

type Row = Record<string, unknown>;
interface Call {
    table: string;
    ops: Array<{ op: string; args: unknown[] }>;
}

/**
 * Records the filters each query carries, so a test can assert what the server was actually asked
 * for — the point of a `mine` pull is that the school-wide rows never come down the wire.
 */
function makeRecordingClient(tables: Record<string, Row[] | ((call: Call) => Row[])>) {
    const calls: Call[] = [];
    const from = vi.fn((table: string) => {
        const call: Call = { table, ops: [] };
        calls.push(call);
        const spec = tables[table];
        const rows = () => (typeof spec === 'function' ? spec(call) : (spec ?? []));
        const builder: Record<string, unknown> = {};
        for (const op of ['select', 'eq', 'in', 'order', 'neq']) {
            builder[op] = (...args: unknown[]) => {
                call.ops.push({ op, args });
                return builder;
            };
        }
        builder.range = async () => ({ data: rows(), error: null });
        builder.then = (resolve: (value: unknown) => void) => resolve({ data: rows(), error: null });
        return builder;
    });
    return { client: { from }, calls };
}

const filtersOn = (call: Call | undefined, op: string) => call?.ops.filter((o) => o.op === op).map((o) => o.args) ?? [];

const settleMicrotasks = async (rounds = 10) => {
    for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

describe('SupabaseAdapter my roster', () => {
    it('resolves my own and co-taught classes plus their students in one pass', async () => {
        const { client, calls } = makeRecordingClient({
            class_members: [{ class_id: 'c-shared', role: 'editor' }],
            classes: [{ id: 'c-mine' }],
            students: [{ id: 's1' }, { id: 's2' }],
        });

        const roster = await adapterWithClient(client, ME).resolveMyRoster();

        expect([...roster.classIds].sort()).toEqual(['c-mine', 'c-shared']);
        expect(roster.studentIds).toEqual(['s1', 's2']);
        expect(
            filtersOn(
                calls.find((c) => c.table === 'students'),
                'in'
            )
        ).toEqual([['class_id', ['c-shared', 'c-mine']]]);
    });

    it('stops after the class lookup when I teach nothing', async () => {
        const { client, calls } = makeRecordingClient({ class_members: [], classes: [] });

        expect(await adapterWithClient(client, ME).resolveMyRoster()).toEqual({ classIds: [], studentIds: [] });
        expect(calls.some((c) => c.table === 'students')).toBe(false);
    });
});

describe('SupabaseAdapter narrowed fetches', () => {
    afterEach(() => {
        storageSync.setRosterFetch('all');
        vi.restoreAllMocks();
    });

    it('asks only for the classes on my roster', async () => {
        const { client, calls } = makeRecordingClient({
            classes: [{ data: { id: 'c-mine', name: 'Mine' }, owner_id: ME }],
        });

        const classes = await adapterWithClient(client, ME).fetchClasses(ROSTER);

        expect(classes).toEqual([{ id: 'c-mine', name: 'Mine', ownerId: ME }]);
        expect(filtersOn(calls[0], 'in')).toEqual([['id', ROSTER.classIds]]);
    });

    it('asks for every class when no roster is given', async () => {
        const { client, calls } = makeRecordingClient({
            classes: [{ data: { id: 'c-foreign', name: 'Theirs' }, owner_id: 'teacher-3' }],
        });

        await adapterWithClient(client, ME).fetchClasses();

        expect(calls.filter((c) => c.table === 'classes')).toHaveLength(1);
        expect(calls[0].ops.filter((o) => o.op === 'eq' || o.op === 'in')).toEqual([]);
    });

    it('asks only for students in my classes', async () => {
        const { client, calls } = makeRecordingClient({
            students: [{ data: { id: 's1', classId: 'c-mine' }, owner_id: ME }],
        });

        const students = await adapterWithClient(client, ME).fetchStudents(ROSTER);

        expect(students).toEqual([{ id: 's1', classId: 'c-mine', ownerId: ME }]);
        expect(filtersOn(calls[0], 'in')).toEqual([['class_id', ROSTER.classIds]]);
    });

    it('asks only for grades of my students', async () => {
        const { client, calls } = makeRecordingClient({
            student_rubrics: [{ data: { id: 'sr1', studentId: 's1' } }],
        });

        const grades = await adapterWithClient(client, ME).fetchStudentRubrics(ROSTER);

        expect(grades).toEqual([{ id: 'sr1', studentId: 's1' }]);
        const gradeCall = calls.find((c) => c.table === 'student_rubrics');
        expect(filtersOn(gradeCall, 'in')).toEqual([['student_id', ROSTER.studentIds]]);
        expect(filtersOn(gradeCall, 'eq')).toEqual([['is_peer_review', false]]);
    });

    it('sends no student filter for a whole-school pull', async () => {
        const { client, calls } = makeRecordingClient({
            student_rubrics: [{ data: { id: 'sr1', studentId: 's9' } }],
        });

        await adapterWithClient(client, ME).fetchStudentRubrics();

        expect(
            filtersOn(
                calls.find((c) => c.table === 'student_rubrics'),
                'in'
            )
        ).toEqual([]);
    });

    it('queries nothing when my roster is empty', async () => {
        const { client, calls } = makeRecordingClient({});

        const adapter = adapterWithClient(client, ME);
        expect(await adapter.fetchClasses({ classIds: [], studentIds: [] })).toEqual([]);
        expect(await adapter.fetchStudents({ classIds: [], studentIds: [] })).toEqual([]);
        expect(await adapter.fetchStudentRubrics({ classIds: [], studentIds: [] })).toEqual([]);
        expect(calls).toEqual([]);
    });
});

describe('StorageSync roster narrowing', () => {
    afterEach(() => {
        storageSync.setRosterFetch('all');
        vi.restoreAllMocks();
    });

    const silence = () => {
        // Every collection but the ones under test fails without a client; that per-collection
        // isolation is the hydrate's design, not something these tests are about.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    };

    it('narrows the startup hydrate, resolving the roster once', async () => {
        const adapter = storageSync.adapter;
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const resolve = vi.spyOn(adapter, 'resolveMyRoster').mockResolvedValue(ROSTER);
        const fetches = [
            vi.spyOn(adapter, 'fetchClasses').mockResolvedValue([]),
            vi.spyOn(adapter, 'fetchStudents').mockResolvedValue([]),
            vi.spyOn(adapter, 'fetchStudentRubrics').mockResolvedValue([]),
            vi.spyOn(adapter, 'fetchPeerReviews').mockResolvedValue([]),
        ];
        silence();

        storageSync.setRosterFetch('mine');
        await storageSync.hydrate();

        expect(resolve).toHaveBeenCalledTimes(1);
        for (const fetch of fetches) expect(fetch).toHaveBeenCalledWith(ROSTER);
    });

    it('leaves the pull unscoped for a teacher', async () => {
        const adapter = storageSync.adapter;
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const resolve = vi.spyOn(adapter, 'resolveMyRoster').mockResolvedValue(ROSTER);
        const classes = vi.spyOn(adapter, 'fetchClasses').mockResolvedValue([]);
        silence();

        await storageSync.hydrate();

        expect(resolve).not.toHaveBeenCalled();
        expect(classes).toHaveBeenCalledWith(undefined);
    });

    it('falls back to the unscoped pull when the roster lookup fails', async () => {
        const adapter = storageSync.adapter;
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'resolveMyRoster').mockRejectedValue(new Error('offline'));
        const classes = vi.spyOn(adapter, 'fetchClasses').mockResolvedValue([]);
        silence();

        storageSync.setRosterFetch('mine');
        await storageSync.hydrate();

        expect(classes).toHaveBeenCalledWith(undefined);
    });

    it('does not narrow to an empty roster — an admin who teaches nothing sees the school', async () => {
        const adapter = storageSync.adapter;
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'resolveMyRoster').mockResolvedValue({ classIds: [], studentIds: [] });
        const classes = vi.spyOn(adapter, 'fetchClasses').mockResolvedValue([]);
        silence();

        storageSync.setRosterFetch('mine');
        await storageSync.hydrate();

        expect(classes).toHaveBeenCalledWith(undefined);
    });

    it('runs a targeted refresh only after the full pull it overlaps', async () => {
        const adapter = storageSync.adapter;
        const events: string[] = [];
        let releaseHydrate = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseHydrate = resolve;
        });
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        let calls = 0;
        vi.spyOn(adapter, 'fetchClasses').mockImplementation(async () => {
            calls += 1;
            if (calls === 1) {
                events.push('hydrate:start');
                await gate;
                events.push('hydrate:done');
            } else {
                events.push('refresh');
            }
            return [];
        });
        silence();

        const hydrateRun = storageSync.hydrate();
        await settleMicrotasks();
        const refreshRun = storageSync.hydratePartial(new Set(['classes']));
        await settleMicrotasks();

        expect(events).toEqual(['hydrate:start']);

        releaseHydrate();
        await Promise.all([hydrateRun, refreshRun]);

        expect(events).toEqual(['hydrate:start', 'hydrate:done', 'refresh']);
    });
});
