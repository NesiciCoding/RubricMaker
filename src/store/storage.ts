import type {
    Rubric,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    CommentSnippet,
    AppSettings,
    RubricFormat,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    DocumentAnalysisResult,
    RubricCriterion,
    UserTemplate,
    Test,
    StudentTest,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    GradingTask,
    Message,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
    StandardMasteryTarget,
} from '../types';
import { DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';
import { SCHOOL_YEARS } from '../data/schoolYears';

/**
 * `Class.year` used to be free text; classes carrying a pre-Phase-15.1 value that doesn't match
 * the new SchoolYear enum have it cleared so the class just shows as "year not set" (same as
 * today) rather than crashing type-narrowed code that assumes a valid enum member.
 */
export function sanitizeClassYears(classes: Class[]): Class[] {
    return classes.map((c) => (c.year && !SCHOOL_YEARS.includes(c.year) ? { ...c, year: undefined } : c));
}

// ─── Default Grade Scales ──────────────────────────────────────────────────────

export const DEFAULT_GRADE_SCALES: GradeScale[] = [
    {
        id: 'letter-10',
        name: 'Letter Grades (10-point)',
        type: 'letter',
        ranges: [
            { min: 90, max: 100, label: 'A', color: '#22c55e' },
            { min: 80, max: 89, label: 'B', color: '#84cc16' },
            { min: 70, max: 79, label: 'C', color: '#eab308' },
            { min: 60, max: 69, label: 'D', color: '#f97316' },
            { min: 0, max: 59, label: 'F', color: '#ef4444' },
        ],
    },
    {
        id: 'pass-fail',
        name: 'Pass / Fail',
        type: 'pass-fail',
        ranges: [
            { min: 55, max: 100, label: 'Pass', color: '#22c55e' },
            { min: 0, max: 54, label: 'Fail', color: '#ef4444' },
        ],
    },
    {
        id: 'dutch-10',
        name: 'Dutch Scale (1–10)',
        type: 'custom',
        ranges: [
            { min: 90, max: 100, label: '10', color: '#16a34a' },
            { min: 80, max: 89, label: '9', color: '#22c55e' },
            { min: 70, max: 79, label: '8', color: '#84cc16' },
            { min: 60, max: 69, label: '7', color: '#eab308' },
            { min: 55, max: 59, label: '6', color: '#f97316' },
            { min: 0, max: 54, label: '<6', color: '#ef4444' },
        ],
    },
];

export const DEFAULT_SETTINGS: AppSettings = {
    defaultGradeScaleId: 'letter-10',
    theme: 'light',
    language: 'en',
    accentColor: '',
    defaultFormat: DEFAULT_FORMAT,
};

// ─── Default Comment Bank ──────────────────────────────────────────────────────

const date = new Date().toISOString();

export const DEFAULT_COMMENT_BANK: CommentBankItem[] = [
    {
        id: 'cb-efl-1',
        text: 'Great effort in using new vocabulary in your writing today!',
        tags: ['EFL', 'Vocabulary', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-2',
        text: 'Your pronunciation of tricky sounds is improving steadily.',
        tags: ['EFL', 'Pronunciation', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-3',
        text: 'You communicated your ideas clearly and fluently.',
        tags: ['EFL', 'Fluency', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-4',
        text: 'Excellent use of transition words to connect your thoughts.',
        tags: ['EFL', 'Structure', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-5',
        text: 'Very natural pacing and intonation during your speaking task.',
        tags: ['EFL', 'Fluency', 'Pronunciation'],
        createdAt: date,
    },
    {
        id: 'cb-efl-6',
        text: 'Good job asking questions in English to clarify your understanding.',
        tags: ['EFL', 'Communication', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-efl-7',
        text: 'Remember to double-check subject-verb agreement in your sentences.',
        tags: ['EFL', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-efl-8',
        text: 'Try to incorporate more complex sentence structures into your writing.',
        tags: ['EFL', 'Grammar', 'Structure'],
        createdAt: date,
    },
    {
        id: 'cb-efl-9',
        text: 'Pay close attention to verb tenses when describing past events.',
        tags: ['EFL', 'Grammar', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-efl-10',
        text: 'Try to use more of the target vocabulary words we learned this week.',
        tags: ['EFL', 'Vocabulary', 'Improvement'],
        createdAt: date,
    },

    {
        id: 'cb-ef-1',
        text: 'Excellent job keeping your materials organized and ready for class.',
        tags: ['Exec Functions', 'Organization', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-2',
        text: 'You managed your time well and completed the task within the time limit.',
        tags: ['Exec Functions', 'Time Management', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-3',
        text: "Great focus and attention during today's independent work time.",
        tags: ['Exec Functions', 'Focus', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-4',
        text: 'You showed great resilience and stayed calm when facing a difficult problem.',
        tags: ['Exec Functions', 'Self-Regulation', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-5',
        text: 'Good job taking initiative and starting your work right away without needing reminders.',
        tags: ['Exec Functions', 'Initiative', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-6',
        text: 'You transitioned very smoothly between different activities today.',
        tags: ['Exec Functions', 'Flexibility', 'Positive'],
        createdAt: date,
    },
    {
        id: 'cb-ef-7',
        text: 'Try to break down larger projects into smaller, manageable steps so it feels less overwhelming.',
        tags: ['Exec Functions', 'Planning', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-ef-8',
        text: 'Remember to use your planner to keep track of upcoming deadlines and homework.',
        tags: ['Exec Functions', 'Organization', 'Time Management'],
        createdAt: date,
    },
    {
        id: 'cb-ef-9',
        text: 'Try to pause and double-check your work for small mistakes before turning it in.',
        tags: ['Exec Functions', 'Self-Monitoring', 'Improvement'],
        createdAt: date,
    },
    {
        id: 'cb-ef-10',
        text: 'If you feel yourself getting distracted, try using the strategies we discussed to refocus.',
        tags: ['Exec Functions', 'Focus', 'Self-Regulation'],
        createdAt: date,
    },
];

// ─── Storage Keys ──────────────────────────────────────────────────────────────

const KEYS = {
    rubrics: 'rm_rubrics',
    students: 'rm_students',
    classes: 'rm_classes',
    studentRubrics: 'rm_student_rubrics',
    attachments: 'rm_attachments',
    gradeScales: 'rm_grade_scales',
    commentSnippets: 'rm_comment_snippets',
    settings: 'rm_settings',
    favoriteStandards: 'rm_favorite_standards',
    commentBank: 'rm_comment_bank',
    exportTemplates: 'rm_export_templates',
    peerReviews: 'rm_peer_reviews',
    selfAssessments: 'rm_self_assessments',
    speakingSessions: 'rm_speaking_sessions',
    analysisResults: 'rm_analysis_results',
    userTemplates: 'rm_user_templates',
    tests: 'rm_tests',
    studentTests: 'rm_student_tests',
    essayAssignments: 'rm_essay_assignments',
    essaySubmissions: 'rm_essay_submissions',
    essayTemplates: 'rm_essay_templates',
    gradingTasks: 'rm_grading_tasks',
    messages: 'rm_messages',
    flashcardDecks: 'rm_flashcard_decks',
    flashcardAssignments: 'rm_flashcard_assignments',
    flashcardReviews: 'rm_flashcard_reviews',
    standardMasteryTargets: 'rm_standard_mastery_targets',
};

// ─── Generic helpers ───────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function isQuotaExceededError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'QuotaExceededError';
}

let quotaExceededHandler: (() => void) | null = null;

/** Registers a callback fired whenever a write is dropped due to a full localStorage quota. */
export function onStorageQuotaExceeded(handler: () => void): void {
    quotaExceededHandler = handler;
}

function save<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('[storage] write failed (quota exceeded?):', key, e);
        if (isQuotaExceededError(e)) {
            quotaExceededHandler?.();
            return;
        }
        throw e;
    }
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export interface StoreData {
    rubrics: Rubric[];
    students: Student[];
    classes: Class[];
    studentRubrics: StudentRubric[];
    attachments: Attachment[];
    gradeScales: GradeScale[];
    commentSnippets: CommentSnippet[];
    settings: AppSettings;
    favoriteStandards: LinkedStandard[];
    commentBank: CommentBankItem[];
    exportTemplates: ExportTemplate[];
    peerReviews: StudentRubric[];
    selfAssessments: SelfAssessment[];
    speakingSessions: SpeakingSession[];
    analysisResults: DocumentAnalysisResult[];
    userTemplates: UserTemplate[];
    tests: Test[];
    studentTests: StudentTest[];
    essayAssignments: EssayAssignment[];
    essaySubmissions: EssaySubmission[];
    essayTemplates: EssayTemplate[];
    gradingTasks: GradingTask[];
    messages: Message[];
    flashcardDecks: FlashcardDeck[];
    flashcardAssignments: FlashcardAssignment[];
    flashcardReviews: FlashcardReview[];
    standardMasteryTargets: StandardMasteryTarget[];
}

export function loadStore(): StoreData {
    return {
        rubrics: load<Rubric[]>(KEYS.rubrics, []),
        students: load<Student[]>(KEYS.students, []),
        classes: sanitizeClassYears(load<Class[]>(KEYS.classes, [{ id: 'default', name: 'Default Class' }])),
        studentRubrics: load<StudentRubric[]>(KEYS.studentRubrics, []),
        attachments: load<Attachment[]>(KEYS.attachments, []),
        gradeScales: load<GradeScale[]>(KEYS.gradeScales, DEFAULT_GRADE_SCALES),
        commentSnippets: load<CommentSnippet[]>(KEYS.commentSnippets, []),
        settings: load<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
        favoriteStandards: load<LinkedStandard[]>(KEYS.favoriteStandards, []),
        commentBank: load<CommentBankItem[]>(KEYS.commentBank, DEFAULT_COMMENT_BANK),
        exportTemplates: load<ExportTemplate[]>(KEYS.exportTemplates, []),
        peerReviews: load<StudentRubric[]>(KEYS.peerReviews, []),
        selfAssessments: load<SelfAssessment[]>(KEYS.selfAssessments, []),
        speakingSessions: load<SpeakingSession[]>(KEYS.speakingSessions, []),
        analysisResults: load<DocumentAnalysisResult[]>(KEYS.analysisResults, []),
        userTemplates: load<UserTemplate[]>(KEYS.userTemplates, []),
        tests: load<Test[]>(KEYS.tests, []),
        studentTests: load<StudentTest[]>(KEYS.studentTests, []),
        essayAssignments: load<EssayAssignment[]>(KEYS.essayAssignments, []),
        essaySubmissions: load<EssaySubmission[]>(KEYS.essaySubmissions, []),
        essayTemplates: load<EssayTemplate[]>(KEYS.essayTemplates, []),
        gradingTasks: load<GradingTask[]>(KEYS.gradingTasks, []),
        messages: load<Message[]>(KEYS.messages, []),
        flashcardDecks: load<FlashcardDeck[]>(KEYS.flashcardDecks, []),
        flashcardAssignments: load<FlashcardAssignment[]>(KEYS.flashcardAssignments, []),
        flashcardReviews: load<FlashcardReview[]>(KEYS.flashcardReviews, []),
        standardMasteryTargets: load<StandardMasteryTarget[]>(KEYS.standardMasteryTargets, []),
    };
}

export function saveRubrics(rubrics: Rubric[]) {
    save(KEYS.rubrics, rubrics);
}
export function saveStudents(students: Student[]) {
    save(KEYS.students, students);
}
export function saveClasses(classes: Class[]) {
    save(KEYS.classes, classes);
}
export function saveStudentRubrics(srs: StudentRubric[]) {
    save(KEYS.studentRubrics, srs);
}
export function saveAttachments(atts: Attachment[]) {
    save(KEYS.attachments, atts);
}
export function saveGradeScales(scales: GradeScale[]) {
    save(KEYS.gradeScales, scales);
}
export function saveCommentSnippets(snips: CommentSnippet[]) {
    save(KEYS.commentSnippets, snips);
}
export function saveSettings(settings: AppSettings) {
    save(KEYS.settings, settings);
}
export function saveFavoriteStandards(favs: LinkedStandard[]) {
    save(KEYS.favoriteStandards, favs);
}
export function saveCommentBank(items: CommentBankItem[]) {
    save(KEYS.commentBank, items);
}
export function saveExportTemplates(templates: ExportTemplate[]) {
    save(KEYS.exportTemplates, templates);
}
export function savePeerReviews(reviews: StudentRubric[]) {
    save(KEYS.peerReviews, reviews);
}
export function saveSelfAssessments(sas: SelfAssessment[]) {
    save(KEYS.selfAssessments, sas);
}
export function saveSpeakingSessions(sessions: SpeakingSession[]) {
    save(KEYS.speakingSessions, sessions);
}
export function saveAnalysisResults(results: DocumentAnalysisResult[]) {
    save(KEYS.analysisResults, results);
}
export function saveTests(tests: Test[]) {
    save(KEYS.tests, tests);
}
export function saveStudentTests(studentTests: StudentTest[]) {
    save(KEYS.studentTests, studentTests);
}
export function saveEssayAssignments(assignments: EssayAssignment[]) {
    save(KEYS.essayAssignments, assignments);
}
export function saveEssaySubmissions(submissions: EssaySubmission[]) {
    save(KEYS.essaySubmissions, submissions);
}
export function saveEssayTemplates(templates: EssayTemplate[]) {
    save(KEYS.essayTemplates, templates);
}
export function saveGradingTasks(tasks: GradingTask[]) {
    save(KEYS.gradingTasks, tasks);
}
export function saveFlashcardDecks(decks: FlashcardDeck[]) {
    save(KEYS.flashcardDecks, decks);
}
export function saveFlashcardAssignments(assignments: FlashcardAssignment[]) {
    save(KEYS.flashcardAssignments, assignments);
}
export function saveFlashcardReviews(reviews: FlashcardReview[]) {
    save(KEYS.flashcardReviews, reviews);
}
export function saveStandardMasteryTargets(targets: StandardMasteryTarget[]) {
    save(KEYS.standardMasteryTargets, targets);
}
export function saveMessages(messages: Message[]) {
    save(KEYS.messages, messages);
}

// ─── Local data wipe (user switch / sign-out) ─────────────────────────────────

// Connection settings survive a wipe; everything else under the rm_ prefix
// (entity data, pending queue, migration/tour flags, last-sync marker) goes.
const WIPE_PRESERVED_KEYS = new Set(['rm_supabase_config', 'rm_local_mode']);

export function clearLocalData(): void {
    try {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('rm_') && !WIPE_PRESERVED_KEYS.has(key)) doomed.push(key);
        }
        doomed.forEach((key) => localStorage.removeItem(key));
    } catch {
        // storage unavailable — nothing to wipe
    }
}

// ─── Full Backup / Restore ─────────────────────────────────────────────────────

export function exportStore(state: StoreData): StoreData {
    return state;
}

export function exportFullBackup(): string {
    return JSON.stringify(loadStore(), null, 2);
}

// ─── Backup import validators ──────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Returns true when `v` is an array (including empty) whose every element is a
 * non-null object with a string `id` property. Empty arrays are intentionally
 * accepted — a backup with zero rubrics is a valid partial backup.
 */
function isObjectArray(v: unknown): boolean {
    return (
        Array.isArray(v) &&
        v.every((item) => isPlainObject(item) && typeof (item as Record<string, unknown>).id === 'string')
    );
}

/**
 * Restores app state from a backup JSON string.
 *
 * Each field is validated independently: invalid fields are skipped with a
 * console warning rather than aborting the whole import. The function returns
 * false only when the JSON itself is unparseable or the top-level value is not
 * a plain object.
 */
export function importFullBackup(json: string): boolean {
    try {
        const raw = JSON.parse(json) as unknown;
        if (!isPlainObject(raw)) return false;
        const data = raw as Partial<StoreData>;

        if (data.rubrics !== undefined) {
            // Structural validation: each rubric must have an id and a criteria array.
            // Individual RubricCriterion fields are not validated because backup files
            // are produced by exportFullBackup and are assumed to be structurally sound.
            if (
                isObjectArray(data.rubrics) &&
                (data.rubrics as unknown[]).every((r) => Array.isArray((r as Rubric).criteria))
            )
                saveRubrics(data.rubrics as Rubric[]);
            else console.warn('[importFullBackup] rubrics failed validation — skipped');
        }
        if (data.students !== undefined) {
            if (isObjectArray(data.students)) saveStudents(data.students as Student[]);
            else console.warn('[importFullBackup] students failed validation — skipped');
        }
        if (data.classes !== undefined) {
            if (isObjectArray(data.classes)) saveClasses(data.classes as Class[]);
            else console.warn('[importFullBackup] classes failed validation — skipped');
        }
        if (data.studentRubrics !== undefined) {
            if (isObjectArray(data.studentRubrics)) saveStudentRubrics(data.studentRubrics as StudentRubric[]);
            else console.warn('[importFullBackup] studentRubrics failed validation — skipped');
        }
        if (data.attachments !== undefined) {
            if (isObjectArray(data.attachments)) saveAttachments(data.attachments as Attachment[]);
            else console.warn('[importFullBackup] attachments failed validation — skipped');
        }
        if (data.gradeScales !== undefined) {
            if (isObjectArray(data.gradeScales)) saveGradeScales(data.gradeScales as GradeScale[]);
            else console.warn('[importFullBackup] gradeScales failed validation — skipped');
        }
        if (data.commentSnippets !== undefined) {
            if (isObjectArray(data.commentSnippets)) saveCommentSnippets(data.commentSnippets as CommentSnippet[]);
            else console.warn('[importFullBackup] commentSnippets failed validation — skipped');
        }
        if (data.settings !== undefined) {
            if (isPlainObject(data.settings)) saveSettings(data.settings as AppSettings);
            else console.warn('[importFullBackup] settings failed validation — skipped');
        }
        if (data.favoriteStandards !== undefined) {
            if (
                Array.isArray(data.favoriteStandards) &&
                data.favoriteStandards.every(
                    (s) => isPlainObject(s) && typeof (s as Record<string, unknown>).guid === 'string'
                )
            )
                saveFavoriteStandards(data.favoriteStandards as LinkedStandard[]);
            else console.warn('[importFullBackup] favoriteStandards failed validation — skipped');
        }
        if (data.commentBank !== undefined) {
            if (isObjectArray(data.commentBank)) saveCommentBank(data.commentBank as CommentBankItem[]);
            else console.warn('[importFullBackup] commentBank failed validation — skipped');
        }
        if (data.exportTemplates !== undefined) {
            if (isObjectArray(data.exportTemplates)) saveExportTemplates(data.exportTemplates as ExportTemplate[]);
            else console.warn('[importFullBackup] exportTemplates failed validation — skipped');
        }
        if (data.peerReviews !== undefined) {
            if (isObjectArray(data.peerReviews)) savePeerReviews(data.peerReviews as StudentRubric[]);
            else console.warn('[importFullBackup] peerReviews failed validation — skipped');
        }
        if (data.selfAssessments !== undefined) {
            if (isObjectArray(data.selfAssessments)) saveSelfAssessments(data.selfAssessments as SelfAssessment[]);
            else console.warn('[importFullBackup] selfAssessments failed validation — skipped');
        }
        if (data.speakingSessions !== undefined) {
            if (isObjectArray(data.speakingSessions)) saveSpeakingSessions(data.speakingSessions as SpeakingSession[]);
            else console.warn('[importFullBackup] speakingSessions failed validation — skipped');
        }
        if (data.analysisResults !== undefined) {
            if (isObjectArray(data.analysisResults))
                saveAnalysisResults(data.analysisResults as DocumentAnalysisResult[]);
            else console.warn('[importFullBackup] analysisResults failed validation — skipped');
        }
        if (data.tests !== undefined) {
            if (isObjectArray(data.tests)) saveTests(data.tests as Test[]);
            else console.warn('[importFullBackup] tests failed validation — skipped');
        }
        if (data.studentTests !== undefined) {
            if (isObjectArray(data.studentTests)) saveStudentTests(data.studentTests as StudentTest[]);
            else console.warn('[importFullBackup] studentTests failed validation — skipped');
        }
        if (data.essayAssignments !== undefined) {
            if (
                Array.isArray(data.essayAssignments) &&
                data.essayAssignments.every(
                    (a) =>
                        isPlainObject(a) &&
                        typeof (a as Record<string, unknown>).teacherKey === 'string' &&
                        typeof (a as Record<string, unknown>).studentId === 'string'
                )
            )
                saveEssayAssignments(data.essayAssignments as EssayAssignment[]);
            else console.warn('[importFullBackup] essayAssignments failed validation — skipped');
        }
        if (data.essaySubmissions !== undefined) {
            if (isObjectArray(data.essaySubmissions)) saveEssaySubmissions(data.essaySubmissions as EssaySubmission[]);
            else console.warn('[importFullBackup] essaySubmissions failed validation — skipped');
        }
        if (data.essayTemplates !== undefined) {
            if (isObjectArray(data.essayTemplates)) saveEssayTemplates(data.essayTemplates as EssayTemplate[]);
            else console.warn('[importFullBackup] essayTemplates failed validation — skipped');
        }
        if (data.gradingTasks !== undefined) {
            if (
                Array.isArray(data.gradingTasks) &&
                data.gradingTasks.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        typeof (t as Record<string, unknown>).rubricId === 'string' &&
                        typeof (t as Record<string, unknown>).studentId === 'string' &&
                        typeof (t as Record<string, unknown>).assignedToTeacher === 'string' &&
                        typeof (t as Record<string, unknown>).assignedAt === 'string'
                )
            )
                saveGradingTasks(data.gradingTasks as GradingTask[]);
            else console.warn('[importFullBackup] gradingTasks failed validation — skipped');
        }
        if (data.messages !== undefined) {
            if (
                Array.isArray(data.messages) &&
                data.messages.every(
                    (m) =>
                        isPlainObject(m) &&
                        typeof (m as Record<string, unknown>).id === 'string' &&
                        typeof (m as Record<string, unknown>).studentId === 'string' &&
                        typeof (m as Record<string, unknown>).contextType === 'string' &&
                        typeof (m as Record<string, unknown>).sender === 'string' &&
                        typeof (m as Record<string, unknown>).body === 'string'
                )
            )
                saveMessages(data.messages as Message[]);
            else console.warn('[importFullBackup] messages failed validation — skipped');
        }
        if (data.userTemplates !== undefined) {
            if (
                Array.isArray(data.userTemplates) &&
                data.userTemplates.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        Array.isArray((t as UserTemplate).criteria)
                )
            )
                saveUserTemplates(data.userTemplates as UserTemplate[]);
            else console.warn('[importFullBackup] userTemplates failed validation — skipped');
        }
        if (data.flashcardDecks !== undefined) {
            if (
                isObjectArray(data.flashcardDecks) &&
                (data.flashcardDecks as unknown[]).every((d) => Array.isArray((d as FlashcardDeck).cards))
            )
                saveFlashcardDecks(data.flashcardDecks as FlashcardDeck[]);
            else console.warn('[importFullBackup] flashcardDecks failed validation — skipped');
        }
        if (data.flashcardAssignments !== undefined) {
            if (
                Array.isArray(data.flashcardAssignments) &&
                data.flashcardAssignments.every(
                    (a) =>
                        isPlainObject(a) &&
                        typeof (a as Record<string, unknown>).deckId === 'string' &&
                        typeof (a as Record<string, unknown>).studentId === 'string'
                )
            )
                saveFlashcardAssignments(data.flashcardAssignments as FlashcardAssignment[]);
            else console.warn('[importFullBackup] flashcardAssignments failed validation — skipped');
        }
        if (data.flashcardReviews !== undefined) {
            if (
                Array.isArray(data.flashcardReviews) &&
                data.flashcardReviews.every(
                    (r) =>
                        isPlainObject(r) &&
                        typeof (r as Record<string, unknown>).id === 'string' &&
                        isPlainObject((r as Record<string, unknown>).cardStates)
                )
            )
                saveFlashcardReviews(data.flashcardReviews as FlashcardReview[]);
            else console.warn('[importFullBackup] flashcardReviews failed validation — skipped');
        }
        if (data.standardMasteryTargets !== undefined) {
            if (
                Array.isArray(data.standardMasteryTargets) &&
                data.standardMasteryTargets.every(
                    (t) =>
                        isPlainObject(t) &&
                        typeof (t as Record<string, unknown>).id === 'string' &&
                        typeof (t as Record<string, unknown>).standardGuid === 'string' &&
                        typeof (t as Record<string, unknown>).year === 'string' &&
                        typeof (t as Record<string, unknown>).targetPercentage === 'number'
                )
            )
                saveStandardMasteryTargets(data.standardMasteryTargets as StandardMasteryTarget[]);
            else console.warn('[importFullBackup] standardMasteryTargets failed validation — skipped');
        }
        return true;
    } catch (e) {
        console.error('Import failed', e);
        return false;
    }
}

export function updateDefaultFormat(f: RubricFormat) {
    const s = load<AppSettings>(KEYS.settings, DEFAULT_SETTINGS);
    saveSettings({ ...s, defaultFormat: f });
}

const CLIPBOARD_KEY = 'rubric_criterion_clipboard';

export function saveCriterionClipboard(criterion: RubricCriterion): void {
    save(CLIPBOARD_KEY, criterion);
}

export function loadCriterionClipboard(): RubricCriterion | null {
    return load<RubricCriterion | null>(CLIPBOARD_KEY, null);
}

// ─── Pending Sync Queue ────────────────────────────────────────────────────────

const PENDING_SYNC_KEY = 'rm_pending_sync';

export interface PendingWrite {
    id: string;
    entity: string;
    action: 'upsert' | 'delete';
    payload: unknown;
    entityId?: string;
    queuedAt: string;
}

function pendingKey(op: Pick<PendingWrite, 'entity' | 'action' | 'payload' | 'entityId'>): string {
    // entityId is authoritative when present (every call site passes it, including upserts —
    // required for entities like essayBatchAssignment whose payload has no id/guid field to
    // fall back to). The payload.id fallback only serves callers that predate that change.
    const eid = op.entityId ?? (op.payload as Record<string, unknown> | null)?.id;
    return `${op.entity}:${eid ?? 'singleton'}`;
}

export function loadPendingQueue(): PendingWrite[] {
    try {
        const raw = localStorage.getItem(PENDING_SYNC_KEY);
        return raw ? (JSON.parse(raw) as PendingWrite[]) : [];
    } catch {
        return [];
    }
}

// One entry per entity:id (upserts are deduped), so the cap is only reached after
// ~500 distinct records are touched while pushes keep failing. Drop-oldest at the
// cap; consider a per-entity eviction policy if teachers ever hit it.
const MAX_PENDING_OPS = 500;

export function addToPendingQueue(op: Omit<PendingWrite, 'id' | 'queuedAt'>): void {
    try {
        const queue = loadPendingQueue();
        const key = pendingKey(op);
        const idx = queue.findIndex((q) => pendingKey(q) === key);
        const entry: PendingWrite = {
            ...op,
            id: nanoid(),
            queuedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
            queue[idx] = entry;
        } else {
            if (queue.length >= MAX_PENDING_OPS) {
                console.warn('[storage] pending-sync queue full — dropping oldest entry', queue[0]);
                queue.shift();
                // Same handler as a quota error — the dropped entry is unsynced data loss
                // just like a failed write, and the user has no other way to know.
                quotaExceededHandler?.();
            }
            queue.push(entry);
        }
        localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch (e) {
        // The queued edit now exists only in memory — surface it instead of losing it silently.
        console.error('[storage] pending-sync queue write failed:', e);
        if (isQuotaExceededError(e)) quotaExceededHandler?.();
    }
}

export function removePendingWrites(ids: string[]): void {
    try {
        const idSet = new Set(ids);
        const queue = loadPendingQueue().filter((q) => !idSet.has(q.id));
        localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch {
        // ignore
    }
}

// ─── User templates ────────────────────────────────────────────────────────────

export function loadUserTemplates(): UserTemplate[] {
    return load<UserTemplate[]>(KEYS.userTemplates, []);
}

export function saveUserTemplates(templates: UserTemplate[]): void {
    save(KEYS.userTemplates, templates);
}

// ─── Student test attempt drafts (per-device, not synced) ─────────────────────

export interface TestDraft {
    answers: Record<string, string>;
    savedAt: string;
}

export function loadTestDraft(draftKey: string): TestDraft | null {
    return load<TestDraft | null>(draftKey, null);
}

export function saveTestDraft(draftKey: string, data: TestDraft): void {
    save(draftKey, data);
}

export function clearTestDraft(draftKey: string): void {
    try {
        localStorage.removeItem(draftKey);
    } catch {
        // ignore
    }
}

export function loadTestTimer(timerKey: string): number | null {
    try {
        const raw = sessionStorage.getItem(timerKey);
        if (!raw) return null;
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, parsed);
    } catch {
        return null;
    }
}

export function saveTestTimer(timerKey: string, seconds: number): void {
    try {
        sessionStorage.setItem(timerKey, String(seconds));
    } catch {
        // ignore
    }
}

export function clearTestTimer(timerKey: string): void {
    try {
        sessionStorage.removeItem(timerKey);
    } catch {
        // ignore
    }
}
