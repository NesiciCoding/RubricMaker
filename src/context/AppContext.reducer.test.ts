import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reducer } from './AppContext';
import { deleteRubricVersions } from '../store/storage';
import type { StoreData } from '../store/storage';
import { DEFAULT_FORMAT } from '../types';
import type {
    AppSettings,
    Class,
    DocumentComment,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    ExportTemplate,
    FlashcardAssignment,
    FlashcardDeck,
    FlashcardReview,
    GradeScale,
    GradingTask,
    Message,
    NewsFlash,
    NewsFlashRead,
    NotificationDismissal,
    QuestionBankItem,
    Rubric,
    SelfAssessment,
    SpeakingSession,
    StandardMasteryTarget,
    Student,
    StudentRubric,
    StudentTest,
    Test,
    UserTemplate,
    VocabularyItem,
} from '../types';

// The reducer only touches storage when isOffline() is true; jsdom keeps
// navigator.onLine = true and getDb() stays null, so save* is never reached.
// Mocking storage still keeps deleteRubricVersions (called unconditionally by
// DELETE_RUBRIC) deterministic.
vi.mock('../store/storage', () => {
    const names = [
        'loadStore',
        'saveRubrics',
        'saveStudents',
        'saveClasses',
        'saveStudentRubrics',
        'stripAudioForOfflineCache',
        'saveAttachments',
        'saveGradeScales',
        'saveSettings',
        'saveFavoriteStandards',
        'saveCommentBank',
        'saveExportTemplates',
        'savePeerReviews',
        'saveSelfAssessments',
        'saveSpeakingSessions',
        'saveAnalysisResults',
        'saveTests',
        'saveStudentTests',
        'saveEssayAssignments',
        'saveEssaySubmissions',
        'saveEssayTemplates',
        'saveGradingTasks',
        'saveMessages',
        'saveFlashcardDecks',
        'saveFlashcardAssignments',
        'saveFlashcardReviews',
        'saveStandardMasteryTargets',
        'saveNewsFlashes',
        'saveNewsFlashReads',
        'saveQuestionBank',
        'saveDocumentComments',
        'saveNotificationDismissals',
        'saveUserTemplates',
        'importFullBackup',
        'loadPendingQueue',
        'onStorageQuotaExceeded',
        'clearLocalData',
        'sanitizeClassYears',
        'loadRubricVersions',
        'upsertRubricVersion',
        'deleteRubricVersions',
    ];
    return Object.fromEntries(names.map((n) => [n, vi.fn()]));
});

type Action = Parameters<typeof reducer>[1];

// ─── Fixtures ────────────────────────────────────────────────────────────────

const now = '2024-01-01T00:00:00Z';

const rubric: Rubric = {
    id: 'r1',
    name: 'R1',
    subject: 'English',
    description: '',
    criteria: [{ id: 'c1', title: 'C1', description: '', weight: 100, levels: [] }],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};

const student: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const cls: Class = { id: 'c1', name: 'Class A' };
const gradeScale: GradeScale = { id: 'gs1', name: 'Scale', type: 'letter', ranges: [] };
const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'light',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const studentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
};

function makeState(overrides: Partial<StoreData> = {}): StoreData {
    return {
        rubrics: [rubric],
        students: [student],
        classes: [cls],
        studentRubrics: [studentRubric],
        attachments: [],
        gradeScales: [gradeScale],
        settings,
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
        ...overrides,
    };
}

const run = (state: StoreData, action: Action): StoreData => reducer(state, action);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AppContext reducer — rubrics, students, classes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('SET_ALL replaces the whole store', () => {
        const fresh = makeState({ rubrics: [] });
        const next = run(makeState(), { type: 'SET_ALL', payload: fresh });
        expect(next).toBe(fresh);
    });

    it('updates and deletes a rubric', () => {
        let state = makeState();
        state = run(state, { type: 'UPDATE_RUBRIC', payload: { ...rubric, name: 'R2' } });
        expect(state.rubrics[0].name).toBe('R2');

        state = run(state, { type: 'DELETE_RUBRIC', id: 'r1' });
        expect(state.rubrics).toHaveLength(0);
        expect(vi.mocked(deleteRubricVersions)).toHaveBeenCalledWith('r1');
    });

    it('updates, archives, restores, and anonymizes students', () => {
        let state = makeState();
        state = run(state, { type: 'UPDATE_STUDENT', payload: { ...student, name: 'Bobby' } });
        expect(state.students[0].name).toBe('Bobby');

        state = run(state, { type: 'DELETE_STUDENT', id: 's1' });
        expect(state.students[0].archivedAt).toBeDefined();

        state = run(state, { type: 'RESTORE_STUDENT', id: 's1' });
        expect(state.students[0].archivedAt).toBeUndefined();

        state = run(state, { type: 'ANONYMIZE_STUDENT', id: 's1' });
        expect(state.students[0].name).toBe('Student-s1');
        expect(state.students[0].anonymizedAt).toBeDefined();
    });

    it('adds, updates, and deletes classes', () => {
        let state = makeState();
        state = run(state, { type: 'ADD_CLASS', payload: { id: 'c2', name: 'Class B' } });
        expect(state.classes).toHaveLength(2);

        state = run(state, { type: 'UPDATE_CLASS', payload: { ...cls, name: 'Renamed' } });
        expect(state.classes.find((c) => c.id === 'c1')?.name).toBe('Renamed');

        state = run(state, { type: 'DELETE_CLASS', id: 'c2' });
        expect(state.classes).toHaveLength(1);
    });

    it('saves a student rubric as new and updates it', () => {
        let state = makeState({ studentRubrics: [] });
        state = run(state, { type: 'SAVE_STUDENT_RUBRIC', payload: studentRubric });
        expect(state.studentRubrics).toHaveLength(1);

        state = run(state, {
            type: 'SAVE_STUDENT_RUBRIC',
            payload: { ...studentRubric, overallComment: 'Great' },
        });
        expect(state.studentRubrics).toHaveLength(1);
        expect(state.studentRubrics[0].overallComment).toBe('Great');
    });

    it('fans out collaborative entries to group siblings but keeps per-student criteria', () => {
        const collaborativeRubric: Rubric = {
            ...rubric,
            criteria: [
                { id: 'shared', title: 'Shared', description: '', weight: 50, levels: [] },
                { id: 'own', title: 'Own', description: '', weight: 50, levels: [], collaborative: false },
            ],
        };
        const groupLead: StudentRubric = {
            id: 'srA',
            rubricId: 'r1',
            studentId: 's1',
            entries: [
                { criterionId: 'shared', levelId: 'l1', checkedSubItems: [], comment: '' },
                { criterionId: 'own', levelId: 'l1', checkedSubItems: [], comment: '' },
            ],
            overallComment: 'Team',
            groupId: 'g1',
            isPeerReview: false,
        };
        const sibling: StudentRubric = {
            id: 'srB',
            rubricId: 'r1',
            studentId: 's2',
            entries: [
                { criterionId: 'shared', levelId: null, checkedSubItems: [], comment: '' },
                { criterionId: 'own', levelId: null, checkedSubItems: [], comment: '' },
            ],
            overallComment: '',
            groupId: 'g1',
            isPeerReview: false,
        };
        let state = makeState({ rubrics: [collaborativeRubric], studentRubrics: [groupLead, sibling] });
        state = run(state, { type: 'SAVE_STUDENT_RUBRIC', payload: groupLead });

        const nextSibling = state.studentRubrics.find((sr) => sr.id === 'srB')!;
        expect(nextSibling.entries.find((e) => e.criterionId === 'shared')?.levelId).toBe('l1');
        expect(nextSibling.entries.find((e) => e.criterionId === 'own')?.levelId).toBeNull();
        expect(nextSibling.overallComment).toBe('Team');
    });

    it('soft-deletes student rubrics by student and by group scope, and restores them', () => {
        const srB: StudentRubric = { ...studentRubric, id: 'srB', studentId: 's2', groupId: 'g1' };
        let state = makeState({ studentRubrics: [{ ...studentRubric, groupId: 'g1' }, srB] });

        // group scope: both siblings soft-deleted
        state = run(state, { type: 'DELETE_STUDENT_RUBRIC', id: 'sr1', scope: 'group' });
        expect(state.studentRubrics.every((sr) => sr.deletedAt)).toBe(true);

        // student scope: only the target is deleted and detached from the group
        state = makeState({ studentRubrics: [{ ...studentRubric, groupId: 'g1' }, srB] });
        state = run(state, { type: 'DELETE_STUDENT_RUBRIC', id: 'sr1', scope: 'student' });
        expect(state.studentRubrics.find((sr) => sr.id === 'sr1')?.deletedAt).toBeDefined();
        expect(state.studentRubrics.find((sr) => sr.id === 'sr1')?.groupId).toBeUndefined();
        expect(state.studentRubrics.find((sr) => sr.id === 'srB')?.deletedAt).toBeUndefined();

        state = run(state, { type: 'RESTORE_STUDENT_RUBRIC', id: 'sr1' });
        expect(state.studentRubrics.find((sr) => sr.id === 'sr1')?.deletedAt).toBeUndefined();
    });

    it('saves rubric self-assessments only when the student rubric exists', () => {
        let state = makeState();
        state = run(state, {
            type: 'SAVE_RUBRIC_SELF_ASSESSMENT',
            id: 'sr1',
            levels: { c1: 'A1' },
            reflection: 'Reflection',
        });
        expect(state.studentRubrics[0].selfAssessmentLevels).toEqual({ c1: 'A1' });
        expect(state.studentRubrics[0].selfAssessmentReflection).toBe('Reflection');

        const before = state;
        const unchanged = run(state, {
            type: 'SAVE_RUBRIC_SELF_ASSESSMENT',
            id: 'missing',
            levels: {},
            reflection: '',
        });
        expect(unchanged).toBe(before);
    });
});

describe('AppContext reducer — settings, standards, comment bank, templates', () => {
    it('manages attachments', () => {
        let state = makeState();
        const att = { id: 'a1', name: 'F', mimeType: 'docx', dataUrl: 'data', size: 1, addedAt: now };
        state = run(state, { type: 'ADD_ATTACHMENT', payload: att });
        expect(state.attachments).toHaveLength(1);
        state = run(state, { type: 'DELETE_ATTACHMENT', id: 'a1' });
        expect(state.attachments).toHaveLength(0);
    });

    it('adds, updates, and deletes grade scales', () => {
        let state = makeState();
        const gs2: GradeScale = { id: 'gs2', name: 'B', type: 'points', ranges: [] };
        state = run(state, { type: 'ADD_GRADE_SCALE', payload: gs2 });
        expect(state.gradeScales).toHaveLength(2);
        state = run(state, { type: 'UPDATE_GRADE_SCALE', payload: { ...gs2, name: 'C' } });
        expect(state.gradeScales.find((g) => g.id === 'gs2')?.name).toBe('C');
        state = run(state, { type: 'DELETE_GRADE_SCALE', id: 'gs2' });
        expect(state.gradeScales).toHaveLength(1);
    });

    it('updates settings', () => {
        const next = run(makeState(), { type: 'UPDATE_SETTINGS', payload: { theme: 'dark' } });
        expect(next.settings.theme).toBe('dark');
        expect(next.settings.language).toBe('en');
    });

    it('adds favorite standards once and removes them', () => {
        const std = { guid: 'g1', description: 'd', standardSetTitle: 's', jurisdictionTitle: 'j' };
        let state = run(makeState(), { type: 'ADD_FAVORITE_STANDARD', payload: std });
        expect(state.favoriteStandards).toHaveLength(1);

        const before = state;
        expect(run(state, { type: 'ADD_FAVORITE_STANDARD', payload: std })).toBe(before);

        state = run(state, { type: 'REMOVE_FAVORITE_STANDARD', guid: 'g1' });
        expect(state.favoriteStandards).toHaveLength(0);
    });

    it('manages comment bank items and usage counts', () => {
        const item = { id: 'cb1', text: 'Good', tags: ['a'], createdAt: now, updatedAt: now };
        let state = run(makeState(), { type: 'ADD_COMMENT_BANK_ITEM', payload: item });
        state = run(state, { type: 'UPDATE_COMMENT_BANK_ITEM', payload: { ...item, text: 'Better' } });
        expect(state.commentBank[0].text).toBe('Better');
        state = run(state, { type: 'RECORD_COMMENT_BANK_USAGE', id: 'cb1' });
        expect(state.commentBank[0].usageCount).toBe(1);
        expect(state.commentBank[0].lastUsedAt).toBeDefined();
        state = run(state, { type: 'DELETE_COMMENT_BANK_ITEM', id: 'cb1' });
        expect(state.commentBank).toHaveLength(0);
    });

    it('adds and deletes export templates', () => {
        const tpl: ExportTemplate = {
            id: 't1',
            name: 'T',
            dataUrl: 'data',
            levelHeaders: ['H1'],
            size: 1,
            addedAt: now,
        };
        let state = run(makeState(), { type: 'ADD_EXPORT_TEMPLATE', payload: tpl });
        expect(state.exportTemplates).toHaveLength(1);
        state = run(state, { type: 'DELETE_EXPORT_TEMPLATE', id: 't1' });
        expect(state.exportTemplates).toHaveLength(0);
    });
});

describe('AppContext reducer — peer reviews, self assessments, speaking, sync, vocabulary', () => {
    it('saves and deletes peer reviews', () => {
        const pr: StudentRubric = { ...studentRubric, id: 'pr1', isPeerReview: true };
        let state = run(makeState(), { type: 'SAVE_PEER_REVIEW', payload: pr });
        expect(state.peerReviews).toHaveLength(1);
        state = run(state, { type: 'SAVE_PEER_REVIEW', payload: { ...pr, overallComment: 'v2' } });
        expect(state.peerReviews).toHaveLength(1);
        expect(state.peerReviews[0].overallComment).toBe('v2');
        state = run(state, { type: 'DELETE_PEER_REVIEW', id: 'pr1' });
        expect(state.peerReviews).toHaveLength(0);
    });

    it('saves and deletes self assessments', () => {
        const sa: SelfAssessment = { id: 'sa1', rubricId: 'r1', studentId: 's1', ratings: [], submittedAt: now };
        let state = run(makeState(), { type: 'SAVE_SELF_ASSESSMENT', payload: sa });
        expect(state.selfAssessments).toHaveLength(1);
        state = run(state, { type: 'SAVE_SELF_ASSESSMENT', payload: { ...sa, reflection: 'x' } });
        expect(state.selfAssessments[0].reflection).toBe('x');
        state = run(state, { type: 'DELETE_SELF_ASSESSMENT', id: 'sa1' });
        expect(state.selfAssessments).toHaveLength(0);
    });

    it('saves, updates, and deletes speaking sessions', () => {
        const session: SpeakingSession = {
            id: 'ss1',
            rubricId: 'r1',
            studentId: 's1',
            durationSeconds: 60,
            elapsedSeconds: 30,
            pronunciationMarks: [],
            entries: [],
            overallComment: '',
            gradedAt: now,
        };
        let state = run(makeState(), { type: 'SAVE_SPEAKING_SESSION', payload: session });
        state = run(state, { type: 'SAVE_SPEAKING_SESSION', payload: { ...session, overallComment: 'x' } });
        expect(state.speakingSessions[0].overallComment).toBe('x');
        state = run(state, { type: 'DELETE_SPEAKING_SESSION', id: 'ss1' });
        expect(state.speakingSessions).toHaveLength(0);
    });

    it('syncRubricSnapshot appends entries for new criteria in student rubrics and peer reviews', () => {
        const updatedRubric: Rubric = {
            ...rubric,
            criteria: [...rubric.criteria, { id: 'c2', title: 'C2', description: '', weight: 50, levels: [] }],
        };
        const pr: StudentRubric = { ...studentRubric, id: 'pr1', isPeerReview: true };
        let state = makeState({ peerReviews: [pr] });
        state = run(state, { type: 'SYNC_RUBRIC_SNAPSHOT', rubricId: 'r1', updatedRubric });
        expect(state.studentRubrics[0].entries.some((e) => e.criterionId === 'c2')).toBe(true);
        expect(state.studentRubrics[0].rubricSnapshot?.criteria).toHaveLength(2);
        expect(state.peerReviews[0].entries.some((e) => e.criterionId === 'c2')).toBe(true);
    });

    it('restores a rubric version only when the rubric exists', () => {
        const state = run(makeState(), {
            type: 'RESTORE_RUBRIC_VERSION',
            rubricId: 'r1',
            snapshot: { ...rubric, name: 'Restored' },
        });
        expect(state.rubrics[0].name).toBe('Restored');

        const before = state;
        expect(run(state, { type: 'RESTORE_RUBRIC_VERSION', rubricId: 'missing', snapshot: rubric })).toBe(before);
    });

    it('adds, updates, deletes, and batch-deletes vocabulary items', () => {
        let state = makeState();
        const v1: VocabularyItem = { id: 'v1', phrase: 'hello', category: 'vocabulary' };
        const v2: VocabularyItem = { id: 'v2', phrase: 'bye', category: 'grammar' };
        state = run(state, { type: 'ADD_VOCABULARY_ITEM', rubricId: 'r1', payload: v1 });
        state = run(state, { type: 'ADD_VOCABULARY_ITEM', rubricId: 'r1', payload: v2 });
        expect(state.rubrics[0].vocabularyItems).toHaveLength(2);

        state = run(state, { type: 'UPDATE_VOCABULARY_ITEM', rubricId: 'r1', payload: { ...v1, phrase: 'hi' } });
        expect(state.rubrics[0].vocabularyItems!.find((v) => v.id === 'v1')?.phrase).toBe('hi');

        state = run(state, { type: 'DELETE_VOCABULARY_ITEM', rubricId: 'r1', itemId: 'v1' });
        expect(state.rubrics[0].vocabularyItems).toHaveLength(1);

        state = run(state, { type: 'DELETE_VOCABULARY_ITEMS_BATCH', rubricId: 'r1', itemIds: ['v2'] });
        expect(state.rubrics[0].vocabularyItems).toHaveLength(0);
    });
});

describe('AppContext reducer — tests, essays', () => {
    const test1: Test = {
        id: 't1',
        name: 'T',
        questions: [],
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: now,
    };
    const st1: StudentTest = {
        id: 'st1',
        testId: 't1',
        studentId: 's1',
        answers: [],
        status: 'in_progress',
        startedAt: now,
    };

    it('adds, updates, and deletes tests (cascading student tests)', () => {
        let state = run(makeState(), { type: 'ADD_TEST', payload: test1 });
        state = run(state, { type: 'SAVE_STUDENT_TEST', payload: st1 });
        state = run(state, { type: 'UPDATE_TEST', payload: { ...test1, name: 'T2' } });
        expect(state.tests[0].name).toBe('T2');

        state = run(state, { type: 'DELETE_TEST', id: 't1' });
        expect(state.tests).toHaveLength(0);
        expect(state.studentTests).toHaveLength(0);
    });

    it('updates and deletes student tests', () => {
        let state = run(makeState(), { type: 'SAVE_STUDENT_TEST', payload: st1 });
        state = run(state, { type: 'SAVE_STUDENT_TEST', payload: { ...st1, status: 'submitted' } });
        expect(state.studentTests[0].status).toBe('submitted');
        state = run(state, { type: 'DELETE_STUDENT_TEST', id: 'st1' });
        expect(state.studentTests).toHaveLength(0);
    });

    it('adds, patches, and deletes essay assignment groups', () => {
        const assign: EssayAssignment = {
            rubricId: 'r1',
            studentId: 's1',
            teacherKey: 'tk1',
            title: 'Essay',
            readOnlyAfterSubmit: true,
            createdAt: now,
        };
        const sub: EssaySubmission = {
            id: 'es1',
            assignmentRubricId: 'r1',
            assignmentStudentId: 's1',
            teacherKey: 'tk1',
            contentHtml: '<p>x</p>',
            wordCount: 10,
            submittedAt: now,
        };
        let state = run(makeState(), { type: 'ADD_ESSAY_ASSIGNMENTS', payload: [assign] });
        expect(state.essayAssignments).toHaveLength(1);

        state = run(state, { type: 'UPDATE_ESSAY_GROUP', teacherKey: 'tk1', patch: { title: 'Essay v2' } });
        expect(state.essayAssignments[0].title).toBe('Essay v2');

        state = run(state, { type: 'ADD_ESSAY_SUBMISSION', payload: sub });
        state = run(state, {
            type: 'ADD_ESSAY_SUBMISSION',
            payload: { ...sub, wordCount: 20 },
        });
        expect(state.essaySubmissions).toHaveLength(1);
        expect(state.essaySubmissions[0].wordCount).toBe(20);

        state = run(state, { type: 'DELETE_ESSAY_GROUP', teacherKey: 'tk1' });
        expect(state.essayAssignments).toHaveLength(0);
        expect(state.essaySubmissions).toHaveLength(0);
    });

    it('saves, updates, and deletes essay templates', () => {
        const tpl: EssayTemplate = {
            id: 'et1',
            rubricId: 'r1',
            title: 'T',
            requireSEB: false,
            readOnlyAfterSubmit: true,
            createdAt: now,
        };
        let state = run(makeState(), { type: 'SAVE_ESSAY_TEMPLATE', payload: tpl });
        state = run(state, { type: 'SAVE_ESSAY_TEMPLATE', payload: { ...tpl, title: 'T2' } });
        expect(state.essayTemplates[0].title).toBe('T2');
        state = run(state, { type: 'DELETE_ESSAY_TEMPLATE', id: 'et1' });
        expect(state.essayTemplates).toHaveLength(0);
    });
});

describe('AppContext reducer — grading, messages, flashcards, mastery, news', () => {
    it('adds and deletes grading tasks', () => {
        const task: GradingTask = {
            id: 'gt1',
            rubricId: 'r1',
            studentId: 's1',
            assignedToTeacher: 'teacher-1',
            assignedAt: now,
        };
        let state = run(makeState(), { type: 'ADD_GRADING_TASKS', payload: [task, { ...task, id: 'gt2' }] });
        expect(state.gradingTasks).toHaveLength(2);

        // Re-adding with the same id upserts
        state = run(state, { type: 'ADD_GRADING_TASKS', payload: [{ ...task, dueDate: now }] });
        expect(state.gradingTasks).toHaveLength(2);
        expect(state.gradingTasks.find((t) => t.id === 'gt1')?.dueDate).toBe(now);

        state = run(state, { type: 'DELETE_GRADING_TASK', id: 'gt1' });
        expect(state.gradingTasks).toHaveLength(1);
    });

    it('sends, updates, and marks messages read', () => {
        const msg: Message = {
            id: 'm1',
            studentId: 's1',
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'student',
            body: 'hi',
            createdAt: now,
            readByTeacher: false,
            readByStudent: false,
        };
        let state = run(makeState(), { type: 'SEND_MESSAGE', payload: msg });
        state = run(state, { type: 'SEND_MESSAGE', payload: { ...msg, body: 'hi again' } });
        expect(state.messages).toHaveLength(1);
        state = run(state, { type: 'MARK_MESSAGE_READ_BY_TEACHER', id: 'm1' });
        expect(state.messages[0].readByTeacher).toBe(true);
    });

    it('adds, updates, and deletes flashcard decks (cascading assignments and reviews)', () => {
        const deck: FlashcardDeck = { id: 'd1', name: 'Deck', cards: [], createdAt: now };
        const assign: FlashcardAssignment = {
            deckId: 'd1',
            studentId: 's1',
            deckName: 'Deck',
            cardCount: 0,
            createdAt: now,
        };
        const review: FlashcardReview = { id: 'd1:s1', deckId: 'd1', studentId: 's1', cardStates: {}, updatedAt: now };
        let state = run(makeState(), { type: 'ADD_FLASHCARD_DECK', payload: deck });
        state = run(state, { type: 'ADD_FLASHCARD_ASSIGNMENTS', payload: [assign] });
        state = run(state, { type: 'SAVE_FLASHCARD_REVIEW', payload: review });
        state = run(state, { type: 'UPDATE_FLASHCARD_DECK', payload: { ...deck, name: 'Deck2' } });
        expect(state.flashcardDecks[0].name).toBe('Deck2');

        // Re-assigning same deck+student replaces instead of duplicating
        state = run(state, { type: 'ADD_FLASHCARD_ASSIGNMENTS', payload: [{ ...assign, cardCount: 5 }] });
        expect(state.flashcardAssignments).toHaveLength(1);

        state = run(state, { type: 'SAVE_FLASHCARD_REVIEW', payload: { ...review, cardStates: { x: {} } as never } });
        expect(Object.keys(state.flashcardReviews[0].cardStates)).toHaveLength(1);

        state = run(state, { type: 'DELETE_FLASHCARD_DECK', id: 'd1' });
        expect(state.flashcardDecks).toHaveLength(0);
        expect(state.flashcardAssignments).toHaveLength(0);
        expect(state.flashcardReviews).toHaveLength(0);
    });

    it('adds, updates, and deletes standard mastery targets', () => {
        const target: StandardMasteryTarget = {
            id: 'mt1',
            standardGuid: 'g1',
            standardDescription: 'd',
            standardSetTitle: 's',
            year: 'jaar-1',
            targetPercentage: 70,
        };
        let state = run(makeState(), { type: 'ADD_STANDARD_MASTERY_TARGET', payload: target });
        state = run(state, { type: 'UPDATE_STANDARD_MASTERY_TARGET', payload: { ...target, targetPercentage: 80 } });
        expect(state.standardMasteryTargets[0].targetPercentage).toBe(80);
        state = run(state, { type: 'DELETE_STANDARD_MASTERY_TARGET', id: 'mt1' });
        expect(state.standardMasteryTargets).toHaveLength(0);
    });

    it('adds, updates, deletes news flashes and tracks reads', () => {
        const flash: NewsFlash = { id: 'nf1', title: 'N', summary: '', kind: 'article', tags: [], createdAt: now };
        const read: NewsFlashRead = { id: 'nf1:s1', flashId: 'nf1', studentId: 's1', readAt: now };
        let state = run(makeState(), { type: 'ADD_NEWS_FLASH', payload: flash });
        state = run(state, { type: 'SAVE_NEWS_FLASH_READ', payload: read });
        state = run(state, { type: 'UPDATE_NEWS_FLASH', payload: { ...flash, title: 'N2' } });
        expect(state.newsFlashes[0].title).toBe('N2');
        expect(state.newsFlashReads).toHaveLength(1);

        // Re-saving the same read updates in place
        state = run(state, { type: 'SAVE_NEWS_FLASH_READ', payload: { ...read, readAt: '2024-02-01T00:00:00Z' } });
        expect(state.newsFlashReads).toHaveLength(1);

        state = run(state, { type: 'DELETE_NEWS_FLASH', id: 'nf1' });
        expect(state.newsFlashes).toHaveLength(0);
        expect(state.newsFlashReads).toHaveLength(0);
    });
});

describe('AppContext reducer — templates, question bank, comments, notifications', () => {
    it('saves user templates newest-first and deletes them', () => {
        const tpl: UserTemplate = { id: 'ut1', name: 'T', subject: 'English', criteria: [], savedAt: now };
        let state = run(makeState(), { type: 'SAVE_USER_TEMPLATE', payload: tpl });
        state = run(state, { type: 'SAVE_USER_TEMPLATE', payload: { ...tpl, id: 'ut2' } });
        expect(state.userTemplates.map((t) => t.id)).toEqual(['ut2', 'ut1']);

        // Saving the same id again replaces without duplicating
        state = run(state, { type: 'SAVE_USER_TEMPLATE', payload: { ...tpl, id: 'ut2', name: 'T2' } });
        expect(state.userTemplates).toHaveLength(2);
        expect(state.userTemplates[0].name).toBe('T2');

        state = run(state, { type: 'DELETE_USER_TEMPLATE', id: 'ut1' });
        expect(state.userTemplates).toHaveLength(1);
    });

    it('manages question bank items individually and in bulk', () => {
        const item: QuestionBankItem = { id: 'qb1', tags: [], createdAt: now };
        const item2: QuestionBankItem = { id: 'qb2', tags: ['old'], createdAt: now };
        let state = run(makeState(), { type: 'ADD_QUESTION_BANK_ITEM', payload: item });
        state = run(state, { type: 'ADD_QUESTION_BANK_ITEMS', payload: [item2] });
        expect(state.questionBank).toHaveLength(2);

        state = run(state, { type: 'UPDATE_QUESTION_BANK_ITEM', payload: { ...item, tags: ['new'] } });
        expect(state.questionBank.find((i) => i.id === 'qb1')?.tags).toEqual(['new']);

        state = run(state, {
            type: 'BULK_UPDATE_QUESTION_BANK_ITEMS',
            ids: ['qb1', 'qb2'],
            patch: { addTags: ['a', 'b'], removeTags: ['old'], cefrLevel: 'B1' },
        });
        expect(state.questionBank.find((i) => i.id === 'qb1')?.tags).toEqual(['new', 'a', 'b']);
        expect(state.questionBank.find((i) => i.id === 'qb2')?.tags).toEqual(['a', 'b']);
        expect(state.questionBank.find((i) => i.id === 'qb1')?.cefrLevel).toBe('B1');

        // cefrLevel: null clears the facet
        state = run(state, {
            type: 'BULK_UPDATE_QUESTION_BANK_ITEMS',
            ids: ['qb1'],
            patch: { cefrLevel: null },
        });
        expect(state.questionBank.find((i) => i.id === 'qb1')?.cefrLevel).toBeUndefined();

        state = run(state, { type: 'DELETE_QUESTION_BANK_ITEMS', ids: ['qb1', 'qb2'] });
        expect(state.questionBank).toHaveLength(0);

        state = run(state, { type: 'ADD_QUESTION_BANK_ITEM', payload: item });
        state = run(state, { type: 'DELETE_QUESTION_BANK_ITEM', id: 'qb1' });
        expect(state.questionBank).toHaveLength(0);
    });

    it('adds, resolves, and deletes document comments', () => {
        const comment: DocumentComment = {
            id: 'dc1',
            attachmentId: 'a1',
            authorId: 'teacher-1',
            text: 'Nice',
            createdAt: now,
            resolved: false,
            anchor: { from: 0, to: 5 },
        };
        let state = run(makeState(), { type: 'ADD_DOCUMENT_COMMENT', payload: comment });
        state = run(state, { type: 'RESOLVE_DOCUMENT_COMMENT', id: 'dc1', resolved: true });
        expect(state.documentComments[0].resolved).toBe(true);
        state = run(state, { type: 'DELETE_DOCUMENT_COMMENT', id: 'dc1' });
        expect(state.documentComments).toHaveLength(0);
    });

    it('dismisses notifications, upserting by id', () => {
        const dismissal: NotificationDismissal = {
            id: 'overdue_grading:s1',
            type: 'overdue_grading',
            entityId: 's1',
            fingerprint: 'f1',
            dismissedAt: now,
        };
        let state = run(makeState(), { type: 'DISMISS_NOTIFICATION', payload: dismissal });
        state = run(state, {
            type: 'DISMISS_NOTIFICATION',
            payload: { ...dismissal, fingerprint: 'f2' },
        });
        expect(state.notificationDismissals).toHaveLength(1);
        expect(state.notificationDismissals[0].fingerprint).toBe('f2');
    });

    it('returns state unchanged for unknown action types', () => {
        const state = makeState();
        expect(run(state, { type: 'NOT_A_REAL_ACTION' } as never)).toBe(state);
    });
});
