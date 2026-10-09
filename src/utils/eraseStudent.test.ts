import { describe, expect, it } from 'vitest';
import type { PendingWrite, StoreData } from '../store/storage';
import { eraseStudentFromStore, pendingWritesForStudent } from './eraseStudent';

function store(overrides: Partial<StoreData>): StoreData {
    const empty = {
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [],
        settings: {},
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: [],
        peerReviews: [],
        selfAssessments: [],
        speakingSessions: [],
        analysisResults: [],
        userTemplates: [],
        tests: [],
        studentTests: [],
        essayAssignments: [],
        essaySubmissions: [],
        essayTemplates: [],
        gradingTasks: [],
        messages: [],
        flashcardDecks: [],
        flashcardAssignments: [],
        flashcardReviews: [],
        standardMasteryTargets: [],
        newsFlashes: [],
        newsFlashReads: [],
        questionBank: [],
        documentComments: [],
        notificationDismissals: [],
        comparativeMatchups: [],
    };
    return { ...empty, ...overrides } as unknown as StoreData;
}

describe('eraseStudentFromStore (#644)', () => {
    const state = store({
        students: [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
        ],
        studentRubrics: [
            { id: 'sr1', studentId: 's1' },
            { id: 'sr2', studentId: 's2' },
        ],
        peerReviews: [{ id: 'pr1', studentId: 's1' }],
        attachments: [{ id: 'a1', studentId: 's1' }, { id: 'a2', studentId: 's2' }, { id: 'a3' }],
        documentComments: [
            { id: 'dc1', attachmentId: 'a1' },
            { id: 'dc2', attachmentId: 'a3' },
        ],
        speakingSessions: [{ id: 'ss1', studentId: 's1', recordings: [{ id: 'rec1' }, { id: 'rec2' }] }],
        selfAssessments: [{ id: 'sa1', studentId: 's1' }],
        analysisResults: [{ id: 'ar1', studentId: 's1' }],
        studentTests: [{ id: 'st1', studentId: 's1' }],
        essayAssignments: [{ teacherKey: 'k', studentId: 's1' }],
        essaySubmissions: [{ id: 'es1', assignmentStudentId: 's1' }],
        gradingTasks: [{ id: 'gt1', studentId: 's1' }],
        messages: [{ id: 'm1', studentId: 's1', body: 'hi' }],
        flashcardDecks: [{ id: 'd1', ownerStudentId: 's1' }, { id: 'd2' }],
        flashcardAssignments: [{ id: 'fa1', studentId: 's1' }],
        flashcardReviews: [{ id: 'fr1', studentId: 's1' }],
        newsFlashReads: [{ id: 'nr1', studentId: 's1' }],
        comparativeMatchups: [
            { id: 'cm1', studentAId: 's2', studentBId: 's1' },
            { id: 'cm2', studentAId: 's2', studentBId: 's3' },
        ],
        rubrics: [{ id: 'r1' }],
    } as unknown as Partial<StoreData>);

    it('removes the student and every record keyed to them, and nothing else', () => {
        const { next } = eraseStudentFromStore(state, 's1');
        expect(next.students.map((s) => s.id)).toEqual(['s2']);
        expect(next.studentRubrics.map((r) => r.id)).toEqual(['sr2']);
        expect(next.attachments.map((a) => a.id)).toEqual(['a2', 'a3']);
        expect(next.documentComments.map((c) => c.id)).toEqual(['dc2']);
        expect(next.comparativeMatchups.map((m) => m.id)).toEqual(['cm2']);
        expect(next.flashcardDecks.map((d) => d.id)).toEqual(['d2']);
        for (const key of [
            'peerReviews',
            'speakingSessions',
            'selfAssessments',
            'analysisResults',
            'studentTests',
            'essayAssignments',
            'essaySubmissions',
            'gradingTasks',
            'messages',
            'flashcardAssignments',
            'flashcardReviews',
            'newsFlashReads',
        ] as const) {
            expect(next[key], key).toEqual([]);
        }
        expect(JSON.stringify(next)).not.toMatch(/"s1"|Alice/);
        expect(next.rubrics).toBe(state.rubrics);
    });

    it('reports the changed collections and the recording blobs to delete', () => {
        const { changed, recordingIds } = eraseStudentFromStore(state, 's1');
        expect(changed.has('students')).toBe(true);
        expect(changed.has('documentComments')).toBe(true);
        expect(changed.has('rubrics')).toBe(false);
        expect(recordingIds).toEqual(['rec1', 'rec2']);
    });

    it('is a no-op for an unknown student', () => {
        const { next, changed } = eraseStudentFromStore(state, 'nobody');
        expect(changed.size).toBe(0);
        expect(next.students).toBe(state.students);
    });
});

describe('pendingWritesForStudent', () => {
    const op = (id: string, entity: string, payload: unknown, entityId?: string): PendingWrite => ({
        id,
        entity,
        action: 'upsert',
        payload,
        entityId,
        queuedAt: '2026-10-09T00:00:00.000Z',
    });

    it('selects every queued write that would push the erased student back', () => {
        const queue = [
            op('w1', 'student', { id: 's1', name: 'Alice' }, 's1'),
            op('w2', 'studentRubric', { id: 'sr1', studentId: 's1' }, 'sr1'),
            op('w3', 'essayBatchAssignment', { teacherKey: 't', studentId: 's1' }, 't:s1'),
            op('w4', 'essayOfflineSubmission', { id: 'es1', assignmentStudentId: 's1' }, 'es1'),
            op('w5', 'flashcardDeck', { id: 'd1', ownerStudentId: 's1' }, 'd1'),
            op('w6', 'comparativeMatchup', { id: 'm1', studentAId: 's2', studentBId: 's1' }, 'm1'),
            op('w7', 'documentComment', { id: 'dc1', attachmentId: 'a1' }, 'dc1'),
            op('k1', 'student', { id: 's2', name: 'Bob' }, 's2'),
            op('k2', 'studentRubric', { id: 'sr2', studentId: 's2' }, 'sr2'),
            op('k3', 'documentComment', { id: 'dc2', attachmentId: 'a2' }, 'dc2'),
            op('k4', 'rubric', { id: 'r1' }, 'r1'),
            op('k5', 'class', null, 'c1'),
        ];
        expect(pendingWritesForStudent(queue, 's1', new Set(['a1']))).toEqual([
            'w1',
            'w2',
            'w3',
            'w4',
            'w5',
            'w6',
            'w7',
        ]);
    });
});
