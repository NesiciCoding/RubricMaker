import type {
    Rubric, Student, Class, StudentRubric, Attachment,
    GradeScale, CommentSnippet, AppSettings, RubricFormat, LinkedStandard, CommentBankItem
} from '../types';
import { DEFAULT_FORMAT } from '../types';

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

const DEFAULT_SETTINGS: AppSettings = {
    defaultGradeScaleId: 'letter-10',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

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

function save<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
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
}

export function loadStore(): StoreData {
    return {
        rubrics: load<Rubric[]>(KEYS.rubrics, []),
        students: load<Student[]>(KEYS.students, []),
        classes: load<Class[]>(KEYS.classes, [{ id: 'default', name: 'Default Class' }]),
        studentRubrics: load<StudentRubric[]>(KEYS.studentRubrics, []),
        attachments: load<Attachment[]>(KEYS.attachments, []),
        gradeScales: load<GradeScale[]>(KEYS.gradeScales, DEFAULT_GRADE_SCALES),
        commentSnippets: load<CommentSnippet[]>(KEYS.commentSnippets, []),
        settings: load<AppSettings>(KEYS.settings, DEFAULT_SETTINGS),
        favoriteStandards: load<LinkedStandard[]>(KEYS.favoriteStandards, []),
        commentBank: load<CommentBankItem[]>(KEYS.commentBank, []),
    };
}

export function saveRubrics(rubrics: Rubric[]) { save(KEYS.rubrics, rubrics); }
export function saveStudents(students: Student[]) { save(KEYS.students, students); }
export function saveClasses(classes: Class[]) { save(KEYS.classes, classes); }
export function saveStudentRubrics(srs: StudentRubric[]) { save(KEYS.studentRubrics, srs); }
export function saveAttachments(atts: Attachment[]) { save(KEYS.attachments, atts); }
export function saveGradeScales(scales: GradeScale[]) { save(KEYS.gradeScales, scales); }
export function saveCommentSnippets(snips: CommentSnippet[]) { save(KEYS.commentSnippets, snips); }
export function saveSettings(settings: AppSettings) { save(KEYS.settings, settings); }
export function saveFavoriteStandards(favs: LinkedStandard[]) { save(KEYS.favoriteStandards, favs); }
export function saveCommentBank(items: CommentBankItem[]) { save(KEYS.commentBank, items); }

// ─── Full Backup / Restore ─────────────────────────────────────────────────────

export function exportFullBackup(): string {
    return JSON.stringify(loadStore(), null, 2);
}

export function importFullBackup(json: string): boolean {
    try {
        const data: Partial<StoreData> = JSON.parse(json);
        if (data.rubrics) saveRubrics(data.rubrics);
        if (data.students) saveStudents(data.students);
        if (data.classes) saveClasses(data.classes);
        if (data.studentRubrics) saveStudentRubrics(data.studentRubrics);
        if (data.attachments) saveAttachments(data.attachments);
        if (data.gradeScales) saveGradeScales(data.gradeScales);
        if (data.commentSnippets) saveCommentSnippets(data.commentSnippets);
        if (data.settings) saveSettings(data.settings);
        if (data.favoriteStandards) saveFavoriteStandards(data.favoriteStandards);
        if (data.commentBank) saveCommentBank(data.commentBank);
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
