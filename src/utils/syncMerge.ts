import type { StoreData, PendingWrite } from '../store/storage';
import type { StudentRubric } from '../types';

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
        key: 'folders',
        entity: 'folder',
        getId: (f: { id: string }) => f.id,
        getUpdatedAt: (f: { updatedAt?: string }) => f.updatedAt,
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
    {
        key: 'notificationDismissals',
        entity: 'notificationDismissal',
        getId: (d: { id: string }) => d.id,
        getUpdatedAt: (d: { dismissedAt?: string }) => d.dismissedAt,
    },
    {
        // Immutable/append-only records — no getUpdatedAt needed since a given id is
        // never re-written, so there's no conflict to resolve by recency.
        key: 'comparativeMatchups',
        entity: 'comparativeMatchup',
        getId: (m: { id: string }) => m.id,
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

function gradeTime(sr: StudentRubric): number {
    return parseTime(sr.updatedAt) ?? parseTime(sr.gradedAt) ?? Number.NEGATIVE_INFINITY;
}

/**
 * Fields another actor can author independently of the teacher's grade — the student's own
 * self-assessment, and the submission the grade follows. Folding two records must not erase them
 * just because the record that wins on edit time happens not to carry them.
 */
const INDEPENDENTLY_AUTHORED: readonly (keyof StudentRubric)[] = [
    'submittedAt',
    'selfAssessmentLevels',
    'selfAssessmentReflection',
    'selfAssessedAt',
];

export interface DedupeOptions {
    /**
     * Ids whose queued write is still an upsert, i.e. the cloud has never acknowledged the row.
     * Those ids are the ones a local save minted, so they must never supply the retained id.
     */
    unconfirmedIds?: ReadonlySet<string>;
}

/**
 * A grade saved before the student's existing grade has loaded (offline boot, late hydrate, the
 * async IndexedDB cache merge) gets a fresh id, so one student can end up with two live grades on
 * the same rubric. Collapse each such set into one record: the most recent edit wins the content,
 * but the id of the established record survives so the cloud row, storage paths and links already
 * pointing at it keep resolving. Peer reviews (including second-marker grades), separate rounds and
 * soft-deleted grades are never merged. `dropped` lists the records that were folded away, so
 * callers can delete them remotely.
 */
export function dedupeStudentRubrics(
    records: StudentRubric[],
    opts: DedupeOptions = {}
): {
    records: StudentRubric[];
    dropped: StudentRubric[];
} {
    const { unconfirmedIds } = opts;
    const groups = new Map<string, StudentRubric[]>();
    for (const sr of records) {
        if (sr.isPeerReview || sr.deletedAt) continue;
        const key = `${sr.studentId}\u0000${sr.rubricId}\u0000${sr.round ?? ''}`;
        const group = groups.get(key);
        if (group) group.push(sr);
        else groups.set(key, [sr]);
    }

    const replacements = new Map<string, StudentRubric>();
    const dropped: StudentRubric[] = [];
    for (const group of groups.values()) {
        if (group.length < 2) continue;
        const byAge = [...group].sort((a, b) => gradeTime(a) - gradeTime(b) || a.id.localeCompare(b.id));
        const newest = byAge[byAge.length - 1];
        // Which id survives is a question of provenance first and age second: a row whose creation
        // the cloud never confirmed is the locally minted duplicate, and letting it supply the id
        // would delete the established row instead — taking its storage paths and links with it.
        const keeper = [...group].sort(
            (a, b) =>
                Number(unconfirmedIds?.has(a.id) ?? false) - Number(unconfirmedIds?.has(b.id) ?? false) ||
                gradeTime(a) - gradeTime(b) ||
                a.id.localeCompare(b.id)
        )[0];
        // Winning content under the surviving id, then whatever the winner lacks that a sibling
        // carries: a self-assessment saved on either copy must outlive the fold. Newest first, so
        // the most recent value of an independently authored field is the one kept.
        const folded: StudentRubric = { ...newest, id: keeper.id };
        for (const sr of [...byAge].reverse()) {
            if (sr.id === newest.id) continue;
            for (const field of INDEPENDENTLY_AUTHORED) {
                if (folded[field] === undefined && sr[field] !== undefined) {
                    Object.assign(folded, { [field]: sr[field] });
                }
            }
        }
        replacements.set(keeper.id, folded);
        dropped.push(...byAge.filter((sr) => sr.id !== keeper.id));
    }
    if (dropped.length === 0) return { records, dropped };

    const droppedIds = new Set(dropped.map((sr) => sr.id));
    return {
        records: records.filter((sr) => !droppedIds.has(sr.id)).map((sr) => replacements.get(sr.id) ?? sr),
        dropped,
    };
}
