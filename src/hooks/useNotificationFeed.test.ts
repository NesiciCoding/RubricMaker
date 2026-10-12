import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EssaySubmission, Message, Rubric, Student, StudentRubric, StudentTest } from '../types';
import { DEFAULT_FORMAT } from '../types';
import { useNotificationFeed } from './useNotificationFeed';

function daysAgo(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString();
}

let mockStudents: Student[] = [];
let mockStudentRubrics: StudentRubric[] = [];
let mockPeerReviews: StudentRubric[] = [];
let mockRubrics: Rubric[] = [];
let mockMessages: Message[] = [];
let mockStudentTests: StudentTest[] = [];
let mockEssaySubmissions: Array<
    Pick<EssaySubmission, 'teacherKey' | 'assignmentStudentId' | 'assignmentRubricId' | 'submittedAt'>
> = [];
let mockNotificationDismissals: Array<{ id: string; type: string; entityId: string; fingerprint: string }> = [];
const mockDismissNotification = vi.fn();
const mockMarkMessageReadByTeacher = vi.fn();

const makeAppContextMock = () => ({
    students: mockStudents,
    studentRubrics: mockStudentRubrics,
    peerReviews: mockPeerReviews,
    rubrics: mockRubrics,
    messages: mockMessages,
    tests: [{ id: 't1', name: 'Unit test' }],
    studentTests: mockStudentTests,
    essaySubmissions: mockEssaySubmissions,
    essayAssignments: [],
    notificationDismissals: mockNotificationDismissals,
    settings: { overdueReminderThreshold: 7 },
    dismissNotification: mockDismissNotification,
    markMessageReadByTeacher: mockMarkMessageReadByTeacher,
});
vi.mock('../context/AppContext', () => ({
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

const rubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'crit1',
            title: 'Argument',
            description: '',
            weight: 100,
            levels: [
                { id: 'lvl1', label: 'Poor', minPoints: 1, maxPoints: 1, description: '', subItems: [] },
                { id: 'lvl2', label: 'Great', minPoints: 4, maxPoints: 4, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 4,
    scoringMode: 'weighted-percentage',
};

const baseline: StudentRubric = {
    id: 'sr-baseline',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'crit1', levelId: 'lvl1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: daysAgo(1),
    isPeerReview: false,
};

const secondMarker: StudentRubric = {
    id: 'sr-second',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'crit1', levelId: 'lvl2', checkedSubItems: [], comment: '' }],
    overallComment: '',
    gradedAt: daysAgo(3),
    isPeerReview: true,
    gradedBy: 'colleague-1',
};

describe('useNotificationFeed', () => {
    beforeEach(() => {
        mockStudents = [];
        mockStudentRubrics = [];
        mockPeerReviews = [];
        mockRubrics = [];
        mockMessages = [];
        mockStudentTests = [];
        mockEssaySubmissions = [];
        mockNotificationDismissals = [];
        mockDismissNotification.mockClear();
        mockMarkMessageReadByTeacher.mockClear();
    });

    it('returns an empty feed when there is nothing to surface', () => {
        const { result } = renderHook(() => useNotificationFeed());
        expect(result.current.items).toEqual([]);
        expect(result.current.count).toBe(0);
    });

    describe('overdue grading', () => {
        const submitted = (id: string, studentId: string, submittedAt: string): StudentTest =>
            ({ id, testId: 't1', studentId, status: 'submitted', submittedAt }) as StudentTest;

        it('surfaces handed-in work waiting past the threshold, one item per test', () => {
            mockStudents = [
                { id: 's1', name: 'Alice', classId: 'c1' },
                { id: 's2', name: 'Bob', classId: 'c1' },
            ];
            mockStudentTests = [submitted('st1', 's1', daysAgo(10)), submitted('st2', 's2', daysAgo(8))];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.overdueItems).toHaveLength(1);
            expect(result.current.overdueItems[0]).toMatchObject({
                title: 'Unit test',
                waitingCount: 2,
                daysSince: 10,
                path: '/tests/t1/results/st1',
            });
            expect(result.current.count).toBe(1);
        });

        it('does not flag students who were graded long ago but have nothing handed in (#665)', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockStudentRubrics = [
                {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    isPeerReview: false,
                    gradedAt: daysAgo(30),
                } as StudentRubric,
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.overdueItems).toHaveLength(0);
        });

        it('hides a dismissed group until more work is handed in', () => {
            mockStudents = [
                { id: 's1', name: 'Alice', classId: 'c1' },
                { id: 's2', name: 'Bob', classId: 'c1' },
            ];
            const first = daysAgo(10);
            mockStudentTests = [submitted('st1', 's1', first)];
            mockNotificationDismissals = [
                { id: 'overdue_grading:test:t1', type: 'overdue_grading', entityId: 'test:t1', fingerprint: first },
            ];
            expect(renderHook(() => useNotificationFeed()).result.current.overdueItems).toHaveLength(0);
            mockStudentTests = [submitted('st1', 's1', first), submitted('st2', 's2', daysAgo(8))];
            expect(renderHook(() => useNotificationFeed()).result.current.overdueItems).toHaveLength(1);
        });

        it('dismiss() calls dismissNotification with the item type, entityId, and fingerprint', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            const submittedAt = daysAgo(10);
            mockStudentTests = [submitted('st1', 's1', submittedAt)];
            const { result } = renderHook(() => useNotificationFeed());
            result.current.dismiss(result.current.overdueItems[0]);
            expect(mockDismissNotification).toHaveBeenCalledWith('overdue_grading', 'test:t1', submittedAt);
        });
    });

    describe('unread messages', () => {
        it('surfaces a thread with an unread student message and counts it', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockMessages = [
                {
                    id: 'm1',
                    studentId: 's1',
                    contextType: 'general',
                    contextId: null,
                    contextLabel: null,
                    sender: 'student',
                    body: 'help',
                    createdAt: daysAgo(1),
                    readByTeacher: false,
                    readByStudent: true,
                },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.messageItems).toHaveLength(1);
            expect(result.current.messageItems[0].unreadCount).toBe(1);
            expect(result.current.count).toBe(1);
        });

        it('does not surface a thread that is already fully read by the teacher', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockMessages = [
                {
                    id: 'm1',
                    studentId: 's1',
                    contextType: 'general',
                    contextId: null,
                    contextLabel: null,
                    sender: 'student',
                    body: 'help',
                    createdAt: daysAgo(1),
                    readByTeacher: true,
                    readByStudent: true,
                },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.messageItems).toHaveLength(0);
        });

        it('markThreadRead marks every unread-by-teacher message in the thread', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockMessages = [
                {
                    id: 'm1',
                    studentId: 's1',
                    contextType: 'general',
                    contextId: null,
                    contextLabel: null,
                    sender: 'student',
                    body: 'first',
                    createdAt: daysAgo(2),
                    readByTeacher: false,
                    readByStudent: true,
                },
                {
                    id: 'm2',
                    studentId: 's1',
                    contextType: 'general',
                    contextId: null,
                    contextLabel: null,
                    sender: 'student',
                    body: 'second',
                    createdAt: daysAgo(1),
                    readByTeacher: false,
                    readByStudent: true,
                },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            result.current.markThreadRead(result.current.messageItems[0]);
            expect(mockMarkMessageReadByTeacher).toHaveBeenCalledWith('m1');
            expect(mockMarkMessageReadByTeacher).toHaveBeenCalledWith('m2');
            expect(mockMarkMessageReadByTeacher).toHaveBeenCalledTimes(2);
        });
    });

    describe('moderation pending', () => {
        it('surfaces a pending second-marker review above the default threshold', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockRubrics = [rubric];
            mockStudentRubrics = [baseline];
            mockPeerReviews = [secondMarker];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.moderationItems).toHaveLength(1);
            expect(result.current.moderationItems[0].studentName).toBe('Alice');
            expect(result.current.moderationItems[0].entityId).toBe('sr-second');
            expect(result.current.count).toBe(1);
        });

        it('hides a moderation item that has been dismissed against its current fingerprint', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockRubrics = [rubric];
            mockStudentRubrics = [baseline];
            mockPeerReviews = [secondMarker];
            mockNotificationDismissals = [
                {
                    id: 'moderation_pending:sr-second',
                    type: 'moderation_pending',
                    entityId: 'sr-second',
                    fingerprint: secondMarker.gradedAt!,
                },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.moderationItems).toHaveLength(0);
        });

        it('dismissAll("overdue_grading") dismisses every currently-visible overdue item', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            const submittedAt = daysAgo(10);
            mockStudentTests = [
                { id: 'st1', testId: 't1', studentId: 's1', status: 'submitted', submittedAt } as StudentTest,
            ];
            const { result } = renderHook(() => useNotificationFeed());
            result.current.dismissAll('overdue_grading');
            expect(mockDismissNotification).toHaveBeenCalledWith('overdue_grading', 'test:t1', submittedAt);
        });

        it('dismissAll("moderation_pending") dismisses every currently-visible moderation item', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockRubrics = [rubric];
            mockStudentRubrics = [baseline];
            mockPeerReviews = [secondMarker];
            const { result } = renderHook(() => useNotificationFeed());
            result.current.dismissAll('moderation_pending');
            expect(mockDismissNotification).toHaveBeenCalledWith(
                'moderation_pending',
                'sr-second',
                secondMarker.gradedAt
            );
        });
    });

    it('keeps unknown or archived students out of the message badge but still lists their moderation items', () => {
        mockMessages = [
            {
                id: 'm1',
                studentId: 'ghost',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'student',
                body: 'hello',
                createdAt: daysAgo(1),
                readByTeacher: false,
                readByStudent: true,
            },
        ];
        mockRubrics = [rubric];
        mockStudentRubrics = [
            {
                id: 'sr-base-ghost',
                rubricId: 'r1',
                studentId: 'ghost',
                entries: [{ criterionId: 'crit1', levelId: 'lvl1', checkedSubItems: [], comment: '' }],
                overallComment: '',
                isPeerReview: false,
            },
        ];
        mockPeerReviews = [
            {
                id: 'sr-ghost',
                rubricId: 'r1',
                studentId: 'ghost',
                entries: [{ criterionId: 'crit1', levelId: 'lvl2', checkedSubItems: [], comment: '' }],
                overallComment: '',
                isPeerReview: true,
                gradedBy: 'colleague-2',
            },
        ];
        const { result } = renderHook(() => useNotificationFeed());

        expect(result.current.messageItems).toHaveLength(0);
        expect(result.current.moderationItems).toHaveLength(1);
        expect(result.current.moderationItems[0].studentName).toBe('ghost');
        expect(result.current.moderationItems[0].pendingDays).toBeNull();
        expect(result.current.moderationItems[0].fingerprint).toBe('');
    });

    it('sorts message threads, overdue students, and moderation items by recency', () => {
        mockStudents = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
            { id: 's3', name: 'Cara', classId: 'c1' },
            { id: 's4', name: 'Dan', classId: 'c1' },
        ];
        mockMessages = [
            {
                id: 'm-old',
                studentId: 's2',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'student',
                body: 'older',
                createdAt: daysAgo(5),
                readByTeacher: false,
                readByStudent: true,
            },
            {
                id: 'm-new',
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'student',
                body: 'newer',
                createdAt: daysAgo(1),
                readByTeacher: false,
                readByStudent: true,
            },
        ];
        mockRubrics = [rubric];
        mockStudentRubrics = [
            baseline,
            {
                id: 'sr-base-s2',
                rubricId: 'r1',
                studentId: 's2',
                entries: [{ criterionId: 'crit1', levelId: 'lvl1', checkedSubItems: [], comment: '' }],
                overallComment: '',
                isPeerReview: false,
            },
            {
                id: 'sr-overdue-1',
                rubricId: 'r1',
                studentId: 's3',
                entries: [],
                overallComment: '',
                isPeerReview: false,
                gradedAt: daysAgo(20),
            } as StudentRubric,
            {
                id: 'sr-overdue-2',
                rubricId: 'r1',
                studentId: 's4',
                entries: [],
                overallComment: '',
                isPeerReview: false,
                gradedAt: daysAgo(30),
            } as StudentRubric,
        ];
        mockPeerReviews = [
            secondMarker,
            {
                id: 'sr-third',
                rubricId: 'r1',
                studentId: 's2',
                entries: [{ criterionId: 'crit1', levelId: 'lvl2', checkedSubItems: [], comment: '' }],
                overallComment: '',
                gradedAt: daysAgo(1),
                isPeerReview: true,
                gradedBy: 'colleague-3',
            },
        ];
        const { result } = renderHook(() => useNotificationFeed());
        expect(result.current.messageItems[0].studentId).toBe('s2');
        expect(result.current.moderationItems[0].studentId).toBe('s1');
        mockStudentTests = [
            {
                id: 'st-new',
                testId: 't1',
                studentId: 's3',
                status: 'submitted',
                submittedAt: daysAgo(8),
            } as StudentTest,
        ];
        mockEssaySubmissions = [
            { teacherKey: 'k1', assignmentStudentId: 's4', assignmentRubricId: 'r9', submittedAt: daysAgo(15) },
        ];
        const { result: withOverdue } = renderHook(() => useNotificationFeed());
        expect(withOverdue.current.overdueItems.map((i) => i.entityId)).toEqual(['essay:k1', 'test:t1']);
    });

    it('markAllMessagesRead marks every thread read', () => {
        mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        mockMessages = [
            {
                id: 'm1',
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'student',
                body: 'help',
                createdAt: daysAgo(1),
                readByTeacher: false,
                readByStudent: true,
            },
        ];
        const { result } = renderHook(() => useNotificationFeed());
        result.current.markAllMessagesRead();
        expect(mockMarkMessageReadByTeacher).toHaveBeenCalledWith('m1');
    });

    it('merges all three sources into one sorted feed', () => {
        mockStudents = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
        ];
        mockRubrics = [rubric];
        mockStudentRubrics = [baseline];
        mockStudentTests = [
            { id: 'st1', testId: 't1', studentId: 's2', status: 'submitted', submittedAt: daysAgo(10) } as StudentTest,
        ];
        mockPeerReviews = [secondMarker];
        mockMessages = [
            {
                id: 'm1',
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'student',
                body: 'help',
                createdAt: daysAgo(1),
                readByTeacher: false,
                readByStudent: true,
            },
        ];
        const { result } = renderHook(() => useNotificationFeed());
        expect(result.current.count).toBe(3);
        expect(result.current.items).toHaveLength(3);
        const types = result.current.items.map((i) => i.type).sort();
        expect(types).toEqual(['moderation_pending', 'overdue_grading', 'unread_message']);
    });
});
