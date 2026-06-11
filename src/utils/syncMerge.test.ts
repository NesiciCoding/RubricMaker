import { describe, it, expect } from 'vitest';
import { mergeCollection, mergeStoreData } from './syncMerge';
import type { StoreData, PendingWrite } from '../store/storage';
import type { Rubric, Student, LinkedStandard } from '../types';

interface Item {
    id: string;
    label: string;
    updatedAt?: string;
}

function item(id: string, label: string, updatedAt?: string): Item {
    return { id, label, updatedAt };
}

const idOpts = { getId: (x: Item) => x.id, pendingIds: new Set<string>() };
const lwwOpts = (pendingIds: Set<string> = new Set<string>(), deletedIds?: Set<string>) => ({
    getId: (x: Item) => x.id,
    getUpdatedAt: (x: Item) => x.updatedAt,
    pendingIds,
    deletedIds,
});

describe('mergeCollection', () => {
    it('takes remote-only records', () => {
        const local: Item[] = [];
        const remote = [item('a', 'remote-a')];
        const result = mergeCollection(local, remote, idOpts);
        expect(result).toEqual([item('a', 'remote-a')]);
    });

    it('drops local-only records by default', () => {
        const local = [item('a', 'local-a')];
        const remote: Item[] = [];
        const result = mergeCollection(local, remote, idOpts);
        expect(result).toEqual([]);
    });

    it('keeps local-only records when id is in pendingIds', () => {
        const local = [item('a', 'local-a')];
        const remote: Item[] = [];
        const result = mergeCollection(local, remote, { ...idOpts, pendingIds: new Set(['a']) });
        expect(result).toEqual([item('a', 'local-a')]);
    });

    it('remote wins by default when both present and no getUpdatedAt', () => {
        const local = [item('a', 'local-a')];
        const remote = [item('a', 'remote-a')];
        const result = mergeCollection(local, remote, idOpts);
        expect(result).toEqual([item('a', 'remote-a')]);
    });

    it('LWW: local newer wins', () => {
        const local = [item('a', 'local-a', '2024-01-02T00:00:00.000Z')];
        const remote = [item('a', 'remote-a', '2024-01-01T00:00:00.000Z')];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'local-a', '2024-01-02T00:00:00.000Z')]);
    });

    it('LWW: remote newer wins', () => {
        const local = [item('a', 'local-a', '2024-01-01T00:00:00.000Z')];
        const remote = [item('a', 'remote-a', '2024-01-02T00:00:00.000Z')];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'remote-a', '2024-01-02T00:00:00.000Z')]);
    });

    it('LWW: equal timestamps -> remote wins', () => {
        const ts = '2024-01-01T00:00:00.000Z';
        const local = [item('a', 'local-a', ts)];
        const remote = [item('a', 'remote-a', ts)];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'remote-a', ts)]);
    });

    it('LWW: missing local timestamp -> remote wins', () => {
        const local = [item('a', 'local-a', undefined)];
        const remote = [item('a', 'remote-a', '2024-01-01T00:00:00.000Z')];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'remote-a', '2024-01-01T00:00:00.000Z')]);
    });

    it('LWW: missing remote timestamp -> remote wins', () => {
        const local = [item('a', 'local-a', '2024-01-01T00:00:00.000Z')];
        const remote = [item('a', 'remote-a', undefined)];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'remote-a', undefined)]);
    });

    it('LWW: unparseable timestamps -> remote wins', () => {
        const local = [item('a', 'local-a', 'not-a-date')];
        const remote = [item('a', 'remote-a', 'also-not-a-date')];
        const result = mergeCollection(local, remote, lwwOpts());
        expect(result).toEqual([item('a', 'remote-a', 'also-not-a-date')]);
    });

    it('pending overrides LWW: local wins even if remote is newer', () => {
        const local = [item('a', 'local-a', '2024-01-01T00:00:00.000Z')];
        const remote = [item('a', 'remote-a', '2024-01-02T00:00:00.000Z')];
        const result = mergeCollection(local, remote, lwwOpts(new Set(['a'])));
        expect(result).toEqual([item('a', 'local-a', '2024-01-01T00:00:00.000Z')]);
    });

    it('deletedIds excludes the record from the result entirely, even if pending', () => {
        const local = [item('a', 'local-a', '2024-01-02T00:00:00.000Z')];
        const remote = [item('a', 'remote-a', '2024-01-01T00:00:00.000Z')];
        const result = mergeCollection(local, remote, lwwOpts(new Set(['a']), new Set(['a'])));
        expect(result).toEqual([]);
    });

    it('deletedIds does NOT drop a local-only pending record (it only filters the remote loop)', () => {
        const local = [item('a', 'local-a')];
        const remote: Item[] = [];
        const result = mergeCollection(local, remote, {
            ...idOpts,
            pendingIds: new Set(['a']),
            deletedIds: new Set(['a']),
        });
        // 'a' is not in remote, so the local-only loop applies; deletedIds only filters the remote loop.
        // The pendingIds check still applies for local-only records.
        expect(result).toEqual([item('a', 'local-a')]);
    });

    it('handles empty local array', () => {
        const remote = [item('a', 'remote-a'), item('b', 'remote-b')];
        const result = mergeCollection([], remote, idOpts);
        expect(result).toEqual(remote);
    });

    it('handles empty remote array, dropping all local except pending', () => {
        const local = [item('a', 'local-a'), item('b', 'local-b')];
        const result = mergeCollection(local, [], { ...idOpts, pendingIds: new Set(['b']) });
        expect(result).toEqual([item('b', 'local-b')]);
    });

    it('preserves remote ordering, with local-only pending items appended afterward', () => {
        const local = [item('z', 'local-z'), item('a', 'local-a')];
        const remote = [item('a', 'remote-a'), item('b', 'remote-b')];
        const result = mergeCollection(local, remote, { ...idOpts, pendingIds: new Set(['z']) });
        expect(result.map((x) => x.id)).toEqual(['a', 'b', 'z']);
    });

    it('is stable across multiple invocations with the same inputs', () => {
        const local = [item('a', 'local-a', '2024-01-02T00:00:00.000Z'), item('b', 'local-b')];
        const remote = [item('a', 'remote-a', '2024-01-01T00:00:00.000Z'), item('c', 'remote-c')];
        const opts = lwwOpts(new Set(['b']));
        const result1 = mergeCollection(local, remote, opts);
        const result2 = mergeCollection(local, remote, opts);
        expect(result1).toEqual(result2);
        expect(result1.map((x) => x.id)).toEqual(['a', 'c', 'b']);
    });
});

// ─── mergeStoreData fixtures ────────────────────────────────────────────────

function makeRubric(id: string, updatedAt: string): Rubric {
    return {
        id,
        name: `Rubric ${id}`,
        subject: 'Math',
        description: '',
        criteria: [],
        gradeScaleId: 'gs1',
        format: 'analytic',
        attachmentIds: [],
        createdAt: updatedAt,
        updatedAt,
        totalMaxPoints: 100,
        scoringMode: 'weighted-percentage',
    } as unknown as Rubric;
}

function makeStudent(id: string, name: string): Student {
    return { id, name, classId: 'default' };
}

function makeStandard(guid: string, title: string): LinkedStandard {
    return {
        guid,
        description: title,
        standardSetTitle: 'CCSS',
        jurisdictionTitle: 'US',
    };
}

function baseStoreData(overrides: Partial<StoreData> = {}): StoreData {
    return {
        rubrics: [],
        students: [],
        classes: [{ id: 'default', name: 'Default Class' }],
        studentRubrics: [],
        attachments: [],
        gradeScales: [],
        commentSnippets: [],
        settings: {
            defaultGradeScaleId: 'gs1',
            theme: 'light',
            language: 'en',
            accentColor: '#000000',
            defaultFormat: 'analytic',
        },
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: [],
        peerReviews: [],
        selfAssessments: [],
        speakingSessions: [],
        analysisResults: [],
        userTemplates: [],
        ...overrides,
    } as StoreData;
}

function pendingWrite(overrides: Partial<PendingWrite>): PendingWrite {
    return {
        id: 'pw-1',
        entity: 'rubric',
        action: 'upsert',
        payload: null,
        queuedAt: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('mergeStoreData', () => {
    it('protects a local-only rubric when a pending upsert references it', () => {
        const localRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = { rubrics: [] };
        const queue: PendingWrite[] = [pendingWrite({ entity: 'rubric', action: 'upsert', payload: localRubric })];

        const result = mergeStoreData(local, remote, queue);
        expect(result.rubrics).toEqual([localRubric]);
    });

    it('a pending delete prevents a remote record from being resurrected', () => {
        const remoteRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [] });
        const remote: Partial<StoreData> = { rubrics: [remoteRubric] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'rubric', action: 'delete', payload: null, entityId: 'r1' }),
        ];

        const result = mergeStoreData(local, remote, queue);
        expect(result.rubrics).toEqual([]);
    });

    it('a delete followed by a re-add of the same id counts as a pending upsert (last action wins)', () => {
        const readded = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [readded] });
        const remote: Partial<StoreData> = { rubrics: [] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'rubric', action: 'delete', payload: null, entityId: 'r1' }),
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: readded }),
        ];

        const result = mergeStoreData(local, remote, queue);
        expect(result.rubrics).toEqual([readded]);
    });

    it('an upsert followed by a delete of the same id counts as a pending delete (last action wins)', () => {
        const remoteRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [] });
        const remote: Partial<StoreData> = { rubrics: [remoteRubric] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: remoteRubric }),
            pendingWrite({ entity: 'rubric', action: 'delete', payload: null, entityId: 'r1' }),
        ];

        const result = mergeStoreData(local, remote, queue);
        expect(result.rubrics).toEqual([]);
    });

    it('keeps local settings when a settings upsert is queued (offline change not stomped)', () => {
        const local = baseStoreData();
        const remoteSettings = { ...local.settings, theme: 'dark' as const };
        const remote: Partial<StoreData> = { settings: remoteSettings };
        const queue: PendingWrite[] = [pendingWrite({ entity: 'settings', action: 'upsert', payload: local.settings })];

        const result = mergeStoreData(local, remote, queue);
        expect(result.settings).toEqual(local.settings);
    });

    it('rubric LWW works end-to-end via updatedAt: local newer wins', () => {
        const localRubric = makeRubric('r1', '2024-02-01T00:00:00.000Z');
        const remoteRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = { rubrics: [remoteRubric] };

        const result = mergeStoreData(local, remote, []);
        expect(result.rubrics).toEqual([localRubric]);
    });

    it('rubric LWW works end-to-end via updatedAt: remote newer wins', () => {
        const localRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const remoteRubric = makeRubric('r1', '2024-02-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = { rubrics: [remoteRubric] };

        const result = mergeStoreData(local, remote, []);
        expect(result.rubrics).toEqual([remoteRubric]);
    });

    it('non-LWW collection (students) only keeps local-only records when pending', () => {
        const localOnlyPending = makeStudent('s1', 'Pending Student');
        const localOnlyDropped = makeStudent('s2', 'Dropped Student');
        const both = makeStudent('s3', 'Both Student Local');
        const remoteBoth = makeStudent('s3', 'Both Student Remote');
        const remoteOnly = makeStudent('s4', 'Remote Student');

        const local = baseStoreData({ students: [localOnlyPending, localOnlyDropped, both] });
        const remote: Partial<StoreData> = { students: [remoteBoth, remoteOnly] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'student', action: 'upsert', payload: localOnlyPending }),
        ];

        const result = mergeStoreData(local, remote, queue);
        // s2 dropped (local-only, not pending); s3 remote wins (no LWW for students); s4 remote-only kept; s1 kept (pending local-only)
        expect(result.students).toEqual(expect.arrayContaining([remoteBoth, remoteOnly, localOnlyPending]));
        expect(result.students).toHaveLength(3);
        expect(result.students.find((s) => s.id === 's2')).toBeUndefined();
    });

    it('keeps local collection unchanged when remote collection is absent (undefined)', () => {
        const localRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = {}; // rubrics not present at all

        const result = mergeStoreData(local, remote, []);
        expect(result.rubrics).toEqual([localRubric]);
    });

    it('replaces settings when present in remote', () => {
        const local = baseStoreData();
        const remoteSettings = { ...local.settings, theme: 'dark' as const, language: 'nl' };
        const remote: Partial<StoreData> = { settings: remoteSettings };

        const result = mergeStoreData(local, remote, []);
        expect(result.settings).toEqual(remoteSettings);
    });

    it('keeps local settings when absent from remote', () => {
        const local = baseStoreData();
        const remote: Partial<StoreData> = {};

        const result = mergeStoreData(local, remote, []);
        expect(result.settings).toEqual(local.settings);
    });

    it('favoriteStandards: keys by guid; remote-only kept, local-only dropped unless pending', () => {
        const localOnly = makeStandard('guid-local', 'Local Standard');
        const remoteOnly = makeStandard('guid-remote', 'Remote Standard');
        const local = baseStoreData({ favoriteStandards: [localOnly] });
        const remote: Partial<StoreData> = { favoriteStandards: [remoteOnly] };

        const result = mergeStoreData(local, remote, []);
        expect(result.favoriteStandards).toEqual([remoteOnly]);
    });

    it('favoriteStandards: a pending upsert payload with only .guid (no .id) protects the local-only record', () => {
        const localOnly = makeStandard('guid-local', 'Local Standard');
        const local = baseStoreData({ favoriteStandards: [localOnly] });
        const remote: Partial<StoreData> = { favoriteStandards: [] };
        const queue: PendingWrite[] = [
            pendingWrite({
                entity: 'favoriteStandard',
                action: 'upsert',
                payload: { guid: 'guid-local' }, // no .id field, only .guid
            }),
        ];

        const result = mergeStoreData(local, remote, queue);
        expect(result.favoriteStandards).toEqual([localOnly]);
    });

    it('userTemplates (not part of COLLECTIONS) always stays local, even if remote provides it', () => {
        const localTemplates = [{ id: 't1', name: 'Local Template' }] as unknown as StoreData['userTemplates'];
        const local = baseStoreData({ userTemplates: localTemplates });
        // Even if a caller mistakenly includes userTemplates on remote, mergeStoreData
        // doesn't iterate it (not in COLLECTIONS) and settings/collections logic doesn't touch it.
        const remote = { userTemplates: [{ id: 't2', name: 'Remote Template' }] } as unknown as Partial<StoreData>;

        const result = mergeStoreData(local, remote, []);
        expect(result.userTemplates).toEqual(localTemplates);
    });

    it('does not crash on malformed pending queue entries missing entityId and payload', () => {
        const localRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = { rubrics: [] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: null }),
            pendingWrite({ entity: 'rubric', action: 'delete', payload: null, entityId: undefined }),
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: {} }),
            pendingWrite({ entity: 'unknownEntity', action: 'upsert', payload: { id: 'r1' } }),
        ];

        expect(() => mergeStoreData(local, remote, queue)).not.toThrow();
        const result = mergeStoreData(local, remote, queue);
        // None of the malformed entries reference 'r1', so it is dropped (local-only, not pending).
        expect(result.rubrics).toEqual([]);
    });

    it('a well-formed pending entry among malformed ones still protects its record', () => {
        const localRubric = makeRubric('r1', '2024-01-01T00:00:00.000Z');
        const local = baseStoreData({ rubrics: [localRubric] });
        const remote: Partial<StoreData> = { rubrics: [] };
        const queue: PendingWrite[] = [
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: null }),
            pendingWrite({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } }),
        ];

        const result = mergeStoreData(local, remote, queue);
        expect(result.rubrics).toEqual([localRubric]);
    });
});
