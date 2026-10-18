/** Deterministic local-mode seed used by the audit scripts. */
const now = new Date('2026-10-18T09:00:00.000Z').toISOString();
const uid = (p) => `${p}-a11y-1`;
export const CLASS_ID = uid('class');
export const RUBRIC_ID = uid('rubric');
export const RUBRIC2_ID = uid('rubric2');
export const STUDENT_ID = uid('student');
export const TEST_ID = uid('test');
export const DECK_ID = uid('deck');

const levels = [
    { id: uid('lvl'), label: 'Excellent', minPoints: 4, maxPoints: 4, description: 'Outstanding work', subItems: [] },
    { id: uid('lvl'), label: 'Good', minPoints: 3, maxPoints: 3, description: 'Solid work', subItems: [] },
    { id: uid('lvl'), label: 'Adequate', minPoints: 2, maxPoints: 2, description: 'Acceptable work', subItems: [] },
    { id: uid('lvl'), label: 'Poor', minPoints: 1, maxPoints: 1, description: 'Needs improvement', subItems: [] },
];
const criterion = (title, weight) => ({
    id: uid('crit'),
    title,
    description: 'How well the student meets this criterion',
    weight,
    levels: levels.map((l) => ({ ...l, id: uid('lvl') })),
});
const format = Object.fromEntries(
    [
        'showLevelDescriptions',
        'showCriteriaDescriptions',
        'showPoints',
        'showWeight',
        'showTotal',
        'showGradeScale',
        'showStudentName',
        'showDate',
        'showComments',
        'showOverallComment',
        'showSubject',
        'showFormat',
    ].map((k) => [k, true])
);
const rubric = {
    id: RUBRIC_ID,
    name: 'Argumentative Essay B1',
    subject: 'English',
    description: 'Assessment rubric for a B1 argumentative essay',
    criteria: [criterion('Content', 50), criterion('Organisation', 25), criterion('Language', 25)],
    gradeScaleId: 'letter-10',
    format,
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
    totalMaxPoints: 12,
    scoringMode: 'weighted-percentage',
    cefrTargetLevel: 'B1',
    cefrSkill: 'writing',
};
const rubric2 = {
    ...rubric,
    id: RUBRIC2_ID,
    name: 'Speaking Presentation',
    criteria: [criterion('Fluency', 50), criterion('Pronunciation', 50)],
    cefrSkill: 'speaking',
};

export function buildSeed({ accentColor } = {}) {
    return {
        rm_local_mode: true,
        rm_settings: {
            defaultGradeScaleId: 'letter-10',
            theme: 'light',
            language: 'en',
            accentColor,
            defaultFormat: format,
            hasSeenTutorial: true,
            needsOnboarding: false,
            userRole: 'admin',
            activeClassId: CLASS_ID,
        },
        rm_classes: [
            { id: CLASS_ID, name: 'Class 4A', subject: 'English', year: '2025-2026', rubricIds: [RUBRIC_ID, RUBRIC2_ID] },
            { id: uid('class2'), name: 'Class 4B', subject: 'English', year: '2025-2026', rubricIds: [RUBRIC_ID] },
        ],
        rm_students: [
            { id: STUDENT_ID, name: 'Alice Jansen', email: 'alice@example.com', studentNumber: 'S001', classId: CLASS_ID },
            { id: uid('student2'), name: 'Bram de Vries', email: 'bram@example.com', studentNumber: 'S002', classId: CLASS_ID },
            { id: uid('student3'), name: 'Chloe Martin', classId: CLASS_ID },
            { id: uid('student4'), name: 'Daan Smit', classId: CLASS_ID },
        ],
        rm_rubrics: [rubric, rubric2],
        rm_student_rubrics: [
            {
                id: uid('sr'),
                rubricId: RUBRIC_ID,
                studentId: STUDENT_ID,
                entries: rubric.criteria.map((c) => ({
                    criterionId: c.id,
                    levelId: c.levels[1].id,
                    comment: 'Good structure, could use more evidence.',
                    checkedSubItems: [],
                })),
                overallComment: 'A solid essay.',
                isPeerReview: false,
                gradedAt: now,
            },
        ],
        rm_tests: [
            {
                id: TEST_ID,
                name: 'Unit 3 Reading Test',
                description: 'Reading comprehension and vocabulary',
                questions: [
                    {
                        id: uid('q'),
                        prompt: 'What is the main idea of the passage?',
                        type: 'multiple-choice',
                        points: 2,
                        options: [
                            { id: uid('o'), text: 'The importance of sleep', correct: true },
                            { id: uid('o'), text: 'The history of tea', correct: false },
                        ],
                    },
                    { id: uid('q'), prompt: 'Summarise the second paragraph.', type: 'short-answer', points: 3 },
                ],
                requireSEB: false,
                shuffleQuestions: false,
                gradeScaleId: 'letter-10',
                createdAt: now,
            },
        ],
        rm_flashcard_decks: [
            {
                id: DECK_ID,
                name: 'Unit 3 Vocabulary',
                description: 'Words from unit 3',
                cards: [
                    { id: uid('card'), front: 'ubiquitous', back: 'everywhere', createdAt: now },
                    { id: uid('card'), front: 'meticulous', back: 'very careful', createdAt: now },
                ],
                createdAt: now,
                updatedAt: now,
                deckKind: 'vocabulary',
            },
        ],
        rm_question_bank: [
            {
                id: uid('qb'),
                kind: 'question',
                question: { id: uid('q'), prompt: 'What is the capital of France?', type: 'short-answer', points: 2 },
                tags: ['geography'],
                createdAt: now,
            },
        ],
        rm_comment_bank: [
            { id: uid('cb'), text: 'Well structured argument.', tags: ['structure'], createdAt: now },
            { id: uid('cb'), text: 'Watch your verb tenses.', tags: ['grammar'], createdAt: now },
        ],
        rm_news_flashes: [
            {
                id: uid('nf'),
                title: 'Unit 3 test moved to Friday',
                summary: 'The reading test now takes place on Friday.',
                kind: 'announcement',
                tags: ['tests'],
                createdAt: now,
                updatedAt: now,
            },
        ],
        rm_messages: [
            {
                id: uid('msg'),
                studentId: STUDENT_ID,
                contextType: 'rubric',
                contextId: RUBRIC_ID,
                contextLabel: 'Argumentative Essay B1',
                sender: 'student',
                body: 'Could you explain the feedback on my introduction?',
                createdAt: now,
                readByTeacher: false,
                readByStudent: true,
            },
        ],
    };
}

export const routes = [
    ['/', 'Dashboard'],
    ['/rubrics', 'Rubric list'],
    ['/rubrics/new', 'Rubric builder (new)'],
    [`/rubrics/${RUBRIC_ID}`, 'Rubric builder (edit)'],
    [`/rubrics/${RUBRIC_ID}/grade/${STUDENT_ID}`, 'Grading'],
    [`/rubrics/${RUBRIC_ID}/peer-review/${STUDENT_ID}`, 'Peer review'],
    [`/peer-analytics/${RUBRIC_ID}`, 'Peer analytics'],
    [`/rubrics/${RUBRIC_ID}/self-assess/${STUDENT_ID}`, 'Self assessment'],
    [`/speaking/${RUBRIC2_ID}/${STUDENT_ID}`, 'Speaking session'],
    [`/grade-comparative/${CLASS_ID}/${RUBRIC_ID}`, 'Comparative grading'],
    ['/students', 'Students'],
    [`/students/${STUDENT_ID}`, 'Student profile'],
    [`/students/${STUDENT_ID}/cefr-overview`, 'Student CEFR overview'],
    [`/students/${STUDENT_ID}/learning-path`, 'Student learning path'],
    ['/cefr-overview', 'CEFR overview'],
    ['/vocabulary', 'Vocabulary dashboard'],
    ['/tests', 'Test list'],
    ['/tests/new', 'Test builder (new)'],
    [`/tests/${TEST_ID}`, 'Test builder (edit)'],
    ['/essays', 'Essay list'],
    ['/essays/new', 'Essay builder (new)'],
    ['/flashcards', 'Flashcards'],
    [`/flashcards/${DECK_ID}`, 'Flashcard deck'],
    ['/news-flashes', 'News flashes'],
    [`/portal/${STUDENT_ID}`, 'Student portal'],
    [`/portal/${STUDENT_ID}/flashcards/${DECK_ID}`, 'Student flashcard study'],
    ['/attachments', 'Attachments'],
    ['/export', 'Export'],
    ['/statistics', 'Statistics'],
    ['/activity-dashboard', 'Activity dashboard'],
    ['/moderation', 'Moderation queue'],
    ['/notifications', 'Notifications'],
    ['/messages', 'Messages'],
    ['/comments', 'Comment bank'],
    ['/question-bank', 'Question bank'],
    ['/marketplace', 'Marketplace'],
    ['/settings', 'Settings'],
    ['/admin', 'Admin'],
    ['/docs', 'Docs'],
    ['/privacy', 'Privacy'],
    ['/this-route-does-not-exist', 'Not found'],
];

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'];
