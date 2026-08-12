import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message, Rubric, Student, StudentRubric } from '../types';
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
let mockNotificationDismissals: Array<{ id: string; type: string; entityId: string; fingerprint: string }> = [];
const mockDismissNotification = vi.fn();
const mockMarkMessageReadByTeacher = vi.fn();

const makeAppContextMock = () => ({
    students: mockStudents,
    studentRubrics: mockStudentRubrics,
    peerReviews: mockPeerReviews,
    rubrics: mockRubrics,
    messages: mockMessages,
    notificationDismissals: mockNotificationDismissals,
    settings: { overdueReminderThreshold: 7 },
    dismissNotification: mockDismissNotification,
    markMessageReadByTeacher: mockMarkMessageReadByTeacher,
});
vi.mock('../context/AppContext', () => ({
    useApp: () => makeAppContextMock(),
    useRoster: () => makeAppContextMock(),
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
        it('surfaces an overdue student', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockStudentRubrics = [
                {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: false,
                    gradedAt: daysAgo(10),
                } as StudentRubric,
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.overdueItems).toHaveLength(1);
            expect(result.current.overdueItems[0].studentName).toBe('Alice');
            expect(result.current.count).toBe(1);
        });

        it('hides an overdue student whose current fingerprint matches a dismissal', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            const gradedAt = daysAgo(10);
            mockStudentRubrics = [
                {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: false,
                    gradedAt,
                } as StudentRubric,
            ];
            mockNotificationDismissals = [
                { id: 'overdue_grading:s1', type: 'overdue_grading', entityId: 's1', fingerprint: gradedAt },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.overdueItems).toHaveLength(0);
        });

        it('resurfaces a dismissed student once regraded and overdue again (stale fingerprint)', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            mockStudentRubrics = [
                {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: false,
                    gradedAt: daysAgo(20),
                } as StudentRubric,
            ];
            // Dismissed against an older gradedAt than the student's current one.
            mockNotificationDismissals = [
                {
                    id: 'overdue_grading:s1',
                    type: 'overdue_grading',
                    entityId: 's1',
                    fingerprint: daysAgo(30),
                },
            ];
            const { result } = renderHook(() => useNotificationFeed());
            expect(result.current.overdueItems).toHaveLength(1);
        });

        it('dismiss() calls dismissNotification with the item type, entityId, and fingerprint', () => {
            mockStudents = [{ id: 's1', name: 'Alice', classId: 'c1' }];
            const gradedAt = daysAgo(10);
            mockStudentRubrics = [
                {
                    id: 'sr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    entries: [],
                    overallComment: '',
                    isPeerReview: false,
                    gradedAt,
                } as StudentRubric,
            ];
            const { result } = renderHook(() => useNotificationFeed());
            result.current.dismiss(result.current.overdueItems[0]);
            expect(mockDismissNotification).toHaveBeenCalledWith('overdue_grading', 's1', gradedAt);
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

    it('merges all three sources into one sorted feed', () => {
        // A separate student (s2) for the overdue signal — s1's own most-recent grade is
        // `baseline` (1 day ago), which would otherwise suppress its own overdue status.
        mockStudents = [
            { id: 's1', name: 'Alice', classId: 'c1' },
            { id: 's2', name: 'Bob', classId: 'c1' },
        ];
        mockRubrics = [rubric];
        mockStudentRubrics = [
            baseline,
            {
                id: 'sr-overdue',
                rubricId: 'r1',
                studentId: 's2',
                entries: [],
                overallComment: '',
                isPeerReview: false,
                gradedAt: daysAgo(10),
            } as StudentRubric,
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
