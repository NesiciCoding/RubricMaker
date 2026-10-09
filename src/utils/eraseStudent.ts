import type { PendingWrite, StoreData } from '../store/storage';

type ListKey = { [K in keyof StoreData]: StoreData[K] extends readonly unknown[] ? K : never }[keyof StoreData];
type Item<K extends ListKey> = StoreData[K] extends readonly (infer T)[] ? T : never;

export interface StudentErasure {
    next: StoreData;
    /** Collections that lost at least one record — the ones whose local caches must be rewritten. */
    changed: Set<keyof StoreData>;
    /** IndexedDB media blob ids (speaking recordings) that belonged to the student. */
    recordingIds: string[];
    /** Attachment ids that belonged to the student — document comments hang off these. */
    attachmentIds: Set<string>;
}

/**
 * Removes a student and every record keyed to them from the local store (#644) — the client-side
 * counterpart of the erase_student() database function (migration 084).
 */
export function eraseStudentFromStore(state: StoreData, studentId: string): StudentErasure {
    const changed = new Set<keyof StoreData>();
    const next: StoreData = { ...state };

    function drop<K extends ListKey>(key: K, isStudents: (item: Item<K>) => boolean) {
        const list = (state[key] ?? []) as unknown as Item<K>[];
        const kept = list.filter((item) => !isStudents(item));
        if (kept.length !== list.length) {
            (next as unknown as Record<string, unknown>)[key] = kept;
            changed.add(key);
        }
    }

    const erasedAttachmentIds = new Set(state.attachments.filter((a) => a.studentId === studentId).map((a) => a.id));
    const recordingIds = state.speakingSessions
        .filter((ss) => ss.studentId === studentId)
        .flatMap((ss) => ss.recordings?.map((r) => r.id) ?? []);

    drop('students', (s) => s.id === studentId);
    drop('studentRubrics', (sr) => sr.studentId === studentId);
    drop('peerReviews', (sr) => sr.studentId === studentId);
    drop('attachments', (a) => a.studentId === studentId);
    drop('documentComments', (c) => erasedAttachmentIds.has(c.attachmentId));
    drop('selfAssessments', (sa) => sa.studentId === studentId);
    drop('speakingSessions', (ss) => ss.studentId === studentId);
    drop('analysisResults', (ar) => ar.studentId === studentId);
    drop('studentTests', (st) => st.studentId === studentId);
    drop('essayAssignments', (ea) => ea.studentId === studentId);
    drop('essaySubmissions', (es) => es.assignmentStudentId === studentId);
    drop('gradingTasks', (gt) => gt.studentId === studentId);
    drop('messages', (m) => m.studentId === studentId);
    drop('flashcardDecks', (d) => d.ownerStudentId === studentId);
    drop('flashcardAssignments', (fa) => fa.studentId === studentId);
    drop('flashcardReviews', (fr) => fr.studentId === studentId);
    drop('newsFlashReads', (r) => r.studentId === studentId);
    drop('comparativeMatchups', (m) => m.studentAId === studentId || m.studentBId === studentId);

    return { next, changed, recordingIds, attachmentIds: erasedAttachmentIds };
}

const STUDENT_LINK_FIELDS = ['studentId', 'assignmentStudentId', 'ownerStudentId', 'studentAId', 'studentBId'];

/**
 * Ids of queued sync writes that belong to an erased student. Flushing them after erasure would
 * push the student's records (and their free text) straight back to the server.
 */
export function pendingWritesForStudent(
    queue: PendingWrite[],
    studentId: string,
    attachmentIds: ReadonlySet<string>
): string[] {
    return queue
        .filter((op) => {
            const payload = (op.payload ?? {}) as Record<string, unknown>;
            if (op.entity === 'student') return (op.entityId ?? payload.id) === studentId;
            if (op.entity === 'documentComment') return attachmentIds.has(payload.attachmentId as string);
            return STUDENT_LINK_FIELDS.some((field) => payload[field] === studentId);
        })
        .map((op) => op.id);
}
