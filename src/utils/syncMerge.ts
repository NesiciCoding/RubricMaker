import type { StoreData, PendingWrite } from '../store/storage';

export interface MergeCollectionOptions<T> {
    getId(x: T): string;
    getUpdatedAt?(x: T): string | undefined;
    pendingIds: Set<string>;
    deletedIds?: Set<string>;
}

function parseTime(value: string | undefined): number | null {
    if (!value) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
}

export function mergeCollection<T>(local: T[], remote: T[], opts: MergeCollectionOptions<T>): T[] {
    const { getId, getUpdatedAt, pendingIds, deletedIds } = opts;
    const localById = new Map(local.map((x) => [getId(x), x]));
    const result: T[] = [];
    const seen = new Set<string>();

    for (const remoteItem of remote) {
        const id = getId(remoteItem);
        seen.add(id);
        if (deletedIds?.has(id)) continue;

        const localItem = localById.get(id);
        if (!localItem) {
            result.push(remoteItem);
            continue;
        }
        if (pendingIds.has(id)) {
            result.push(localItem);
            continue;
        }
        const localTime = getUpdatedAt ? parseTime(getUpdatedAt(localItem)) : null;
        const remoteTime = getUpdatedAt ? parseTime(getUpdatedAt(remoteItem)) : null;
        if (localTime !== null && remoteTime !== null && localTime > remoteTime) {
            result.push(localItem);
        } else {
            result.push(remoteItem);
        }
    }

    for (const localItem of local) {
        const id = getId(localItem);
        if (seen.has(id)) continue;
        if (pendingIds.has(id)) result.push(localItem);
    }

    return result;
}

interface PendingIndex {
    upserts: Set<string>;
    deletes: Set<string>;
}

function pendingIdsFor(queue: PendingWrite[], entity: string): PendingIndex {
    // Only the last queued action per id reflects the user's current intent
    // (e.g. a delete followed by a re-add must count as an upsert).
    const lastActionById = new Map<string, PendingWrite['action']>();
    for (const op of queue) {
        if (op.entity !== entity) continue;
        // entityId is authoritative when present (every pushOne call site passes it now,
        // including upserts) — required for entities like essayBatchAssignment whose
        // payload has no id/guid field to fall back to.
        const payloadId =
            (op.payload as { id?: string; guid?: string } | null)?.id ?? (op.payload as { guid?: string } | null)?.guid;
        const id = op.entityId ?? payloadId;
        if (!id) continue;
        lastActionById.set(id, op.action);
    }
    const upserts = new Set<string>();
    const deletes = new Set<string>();
    for (const [id, action] of lastActionById) {
        if (action === 'delete') deletes.add(id);
        else upserts.add(id);
    }
    return { upserts, deletes };
}

type CollectionKey = Exclude<keyof StoreData, 'settings'>;

interface CollectionSpec {
    key: CollectionKey;
    entity: string;
    getId(x: never): string;
    getUpdatedAt?(x: never): string | undefined;
}

const COLLECTIONS: CollectionSpec[] = [
    {
        key: 'rubrics',
        entity: 'rubric',
        getId: (r: { id: string }) => r.id,
        getUpdatedAt: (r: { updatedAt?: string }) => r.updatedAt,
    },
    {
        key: 'classes',
        entity: 'class',
        getId: (c: { id: string }) => c.id,
        getUpdatedAt: (c: { updatedAt?: string }) => c.updatedAt,
    },
    {
        key: 'students',
        entity: 'student',
        getId: (s: { id: string }) => s.id,
        getUpdatedAt: (s: { updatedAt?: string }) => s.updatedAt,
    },
    {
        key: 'studentRubrics',
        entity: 'studentRubric',
        getId: (sr: { id: string }) => sr.id,
        getUpdatedAt: (sr: { updatedAt?: string }) => sr.updatedAt,
    },
    {
        key: 'peerReviews',
        entity: 'peerReview',
        getId: (sr: { id: string }) => sr.id,
        getUpdatedAt: (sr: { updatedAt?: string }) => sr.updatedAt,
    },
    { key: 'attachments', entity: 'attachment', getId: (a: { id: string }) => a.id },
    {
        key: 'gradeScales',
        entity: 'gradeScale',
        getId: (gs: { id: string }) => gs.id,
        getUpdatedAt: (gs: { updatedAt?: string }) => gs.updatedAt,
    },
    {
        key: 'commentBank',
        entity: 'commentBankItem',
        getId: (cb: { id: string }) => cb.id,
        getUpdatedAt: (cb: { updatedAt?: string }) => cb.updatedAt,
    },
    { key: 'exportTemplates', entity: 'exportTemplate', getId: (et: { id: string }) => et.id },
    { key: 'favoriteStandards', entity: 'favoriteStandard', getId: (fs: { guid: string }) => fs.guid },
    {
        key: 'selfAssessments',
        entity: 'selfAssessment',
        getId: (sa: { id: string }) => sa.id,
        getUpdatedAt: (sa: { updatedAt?: string }) => sa.updatedAt,
    },
    {
        key: 'speakingSessions',
        entity: 'speakingSession',
        getId: (ss: { id: string }) => ss.id,
        getUpdatedAt: (ss: { updatedAt?: string }) => ss.updatedAt,
    },
    {
        key: 'analysisResults',
        entity: 'analysisResult',
        getId: (ar: { id: string }) => ar.id,
        getUpdatedAt: (ar: { updatedAt?: string }) => ar.updatedAt,
    },
    {
        key: 'tests',
        entity: 'test',
        getId: (t: { id: string }) => t.id,
        getUpdatedAt: (t: { updatedAt?: string }) => t.updatedAt,
    },
    {
        key: 'studentTests',
        entity: 'studentTest',
        getId: (st: { id: string }) => st.id,
        getUpdatedAt: (st: { updatedAt?: string }) => st.updatedAt,
    },
    { key: 'essayTemplates', entity: 'essayTemplate', getId: (et: { id: string }) => et.id },
    { key: 'gradingTasks', entity: 'gradingTask', getId: (gt: { id: string }) => gt.id },
    { key: 'messages', entity: 'message', getId: (m: { id: string }) => m.id },
    {
        key: 'essayAssignments',
        entity: 'essayBatchAssignment',
        getId: (a: { teacherKey: string; studentId: string }) => `${a.teacherKey}:${a.studentId}`,
    },
    { key: 'essaySubmissions', entity: 'essayOfflineSubmission', getId: (s: { id: string }) => s.id },
    { key: 'userTemplates', entity: 'userTemplate', getId: (ut: { id: string }) => ut.id },
    {
        key: 'flashcardDecks',
        entity: 'flashcardDeck',
        getId: (d: { id: string }) => d.id,
        getUpdatedAt: (d: { updatedAt?: string }) => d.updatedAt,
    },
    {
        key: 'flashcardAssignments',
        entity: 'flashcardAssignment',
        getId: (a: { deckId: string; studentId: string }) => `${a.deckId}:${a.studentId}`,
    },
    {
        key: 'flashcardReviews',
        entity: 'flashcardReview',
        getId: (r: { id: string }) => r.id,
        getUpdatedAt: (r: { updatedAt?: string }) => r.updatedAt,
    },
    {
        key: 'newsFlashes',
        entity: 'newsFlash',
        getId: (f: { id: string }) => f.id,
        getUpdatedAt: (f: { updatedAt?: string }) => f.updatedAt,
    },
    { key: 'newsFlashReads', entity: 'newsFlashRead', getId: (r: { id: string }) => r.id },
    {
        key: 'standardMasteryTargets',
        entity: 'standardMasteryTarget',
        getId: (t: { id: string }) => t.id,
        getUpdatedAt: (t: { updatedAt?: string }) => t.updatedAt,
    },
    {
        key: 'questionBank',
        entity: 'questionBankItem',
        getId: (q: { id: string }) => q.id,
        getUpdatedAt: (q: { updatedAt?: string }) => q.updatedAt,
    },
    {
        key: 'documentComments',
        entity: 'documentComment',
        getId: (c: { id: string }) => c.id,
        getUpdatedAt: (c: { updatedAt?: string }) => c.updatedAt,
    },
] as CollectionSpec[];

export function mergeStoreData(local: StoreData, remote: Partial<StoreData>, pendingQueue: PendingWrite[]): StoreData {
    const merged: StoreData = { ...local };

    for (const spec of COLLECTIONS) {
        const remoteCollection = remote[spec.key];
        if (remoteCollection === undefined) continue;
        const { upserts, deletes } = pendingIdsFor(pendingQueue, spec.entity);
        (merged[spec.key] as unknown) = mergeCollection(local[spec.key] as unknown[], remoteCollection as unknown[], {
            getId: spec.getId as (x: unknown) => string,
            getUpdatedAt: spec.getUpdatedAt as ((x: unknown) => string | undefined) | undefined,
            pendingIds: upserts,
            deletedIds: deletes,
        });
    }

    const hasPendingSettingsWrite = pendingQueue.some((op) => op.entity === 'settings' && op.action === 'upsert');
    if (remote.settings !== undefined && !hasPendingSettingsWrite) {
        merged.settings = remote.settings;
    }

    return merged;
}
