import { describe, it, expect, beforeEach } from 'vitest';
import {
    loadStore,
    saveRubrics,
    saveStudents,
    saveClasses,
    saveStudentRubrics,
    saveAttachments,
    saveGradeScales,
    saveCommentSnippets,
    saveSettings,
    saveFavoriteStandards,
    saveCommentBank,
    saveExportTemplates,
    savePeerReviews,
    saveSelfAssessments,
    saveSpeakingSessions,
    saveAnalysisResults,
    exportStore,
    exportFullBackup,
    importFullBackup,
    updateDefaultFormat,
    DEFAULT_GRADE_SCALES,
    loadPendingQueue,
    addToPendingQueue,
    removePendingWrites,
} from './storage';
import type { Rubric, Student, Class, AppSettings, RubricFormat } from '../types';
import { DEFAULT_FORMAT } from '../types';

const makeRubric = (id = 'r1'): Rubric => ({
    id,
    name: 'Test',
    subject: 'Math',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
});

const makeSettings = (): AppSettings => ({
    defaultGradeScaleId: 'letter-10',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
});

beforeEach(() => {
    localStorage.clear();
});

describe('DEFAULT_GRADE_SCALES', () => {
    it('contains at least 3 default scales', () => {
        expect(DEFAULT_GRADE_SCALES.length).toBeGreaterThanOrEqual(3);
    });
});

describe('loadStore', () => {
    it('returns defaults when localStorage is empty', () => {
        const store = loadStore();
        expect(store.rubrics).toEqual([]);
        expect(store.students).toEqual([]);
        expect(store.classes).toHaveLength(1);
        expect(store.classes[0].name).toBe('Default Class');
        expect(store.gradeScales).toEqual(DEFAULT_GRADE_SCALES);
        expect(store.settings.theme).toBe('dark');
    });

    it('loads previously saved rubrics', () => {
        const rubrics = [makeRubric('r1'), makeRubric('r2')];
        saveRubrics(rubrics);
        const store = loadStore();
        expect(store.rubrics).toHaveLength(2);
        expect(store.rubrics[0].id).toBe('r1');
    });

    it('gracefully handles corrupted localStorage data', () => {
        localStorage.setItem('rm_rubrics', 'not-json{{{');
        const store = loadStore();
        expect(store.rubrics).toEqual([]);
    });
});

describe('save functions', () => {
    it('saveRubrics persists and loadStore reads back', () => {
        saveRubrics([makeRubric()]);
        expect(loadStore().rubrics[0].id).toBe('r1');
    });

    it('saveStudents persists', () => {
        const students: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];
        saveStudents(students);
        expect(loadStore().students[0].name).toBe('Alice');
    });

    it('saveClasses persists', () => {
        const classes: Class[] = [{ id: 'c1', name: 'Class A' }];
        saveClasses(classes);
        expect(loadStore().classes[0].name).toBe('Class A');
    });

    it('saveStudentRubrics persists', () => {
        saveStudentRubrics([
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [],
                overallComment: '',
                isPeerReview: false,
            },
        ]);
        expect(loadStore().studentRubrics[0].id).toBe('sr1');
    });

    it('saveAttachments persists', () => {
        saveAttachments([
            {
                id: 'a1',
                name: 'file.pdf',
                mimeType: 'application/pdf',
                dataUrl: 'data:...',
                size: 1000,
                addedAt: '2024-01-01',
            },
        ]);
        expect(loadStore().attachments[0].id).toBe('a1');
    });

    it('saveGradeScales persists', () => {
        saveGradeScales([{ id: 'gs1', name: 'Test', type: 'letter', ranges: [] }]);
        expect(loadStore().gradeScales[0].id).toBe('gs1');
    });

    it('saveCommentSnippets persists', () => {
        saveCommentSnippets([{ id: 'cs1', text: 'Great!', tag: 'positive' }]);
        expect(loadStore().commentSnippets[0].text).toBe('Great!');
    });

    it('saveSettings persists', () => {
        const settings = { ...makeSettings(), theme: 'light' as const };
        saveSettings(settings);
        expect(loadStore().settings.theme).toBe('light');
    });

    it('saveFavoriteStandards persists', () => {
        saveFavoriteStandards([
            {
                guid: 'g1',
                description: 'Standard 1',
                standardSetTitle: 'CCSS',
                jurisdictionTitle: 'US',
            },
        ]);
        expect(loadStore().favoriteStandards[0].guid).toBe('g1');
    });

    it('saveCommentBank persists', () => {
        saveCommentBank([
            {
                id: 'cb1',
                text: 'Well done',
                tags: ['positive'],
                createdAt: '2024-01-01',
            },
        ]);
        expect(loadStore().commentBank[0].id).toBe('cb1');
    });

    it('saveExportTemplates persists', () => {
        saveExportTemplates([
            {
                id: 'et1',
                name: 'Template A',
                dataUrl: 'data:...',
                levelHeaders: [],
                size: 100,
                addedAt: '2024-01-01',
            },
        ]);
        expect(loadStore().exportTemplates[0].id).toBe('et1');
    });

    it('savePeerReviews persists', () => {
        savePeerReviews([
            {
                id: 'pr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [],
                overallComment: '',
                isPeerReview: true,
            },
        ]);
        expect(loadStore().peerReviews[0].id).toBe('pr1');
    });

    it('saveSelfAssessments persists', () => {
        saveSelfAssessments([
            {
                id: 'sa1',
                rubricId: 'r1',
                studentId: 's1',
                ratings: [],
                submittedAt: '2024-01-01',
            },
        ]);
        expect(loadStore().selfAssessments[0].id).toBe('sa1');
    });

    it('saveSpeakingSessions persists', () => {
        saveSpeakingSessions([
            {
                id: 'ss1',
                rubricId: 'r1',
                studentId: 's1',
                criteria: [],
                overallComment: '',
                gradedAt: '2024-01-01',
            } as any,
        ]);
        expect(loadStore().speakingSessions[0].id).toBe('ss1');
    });

    it('saveAnalysisResults persists', () => {
        saveAnalysisResults([
            {
                id: 'ar1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'a1',
                extractedText: 'text',
                analyzedAt: '2024-01-01',
                detectedItems: [],
                grammarErrors: [],
                grammarCheckerUsed: 'none',
            },
        ]);
        expect(loadStore().analysisResults[0].id).toBe('ar1');
    });
});

describe('exportStore', () => {
    it('returns the passed state unchanged', () => {
        const state = loadStore();
        expect(exportStore(state)).toBe(state);
    });
});

describe('exportFullBackup', () => {
    it('returns valid JSON string', () => {
        const json = exportFullBackup();
        expect(() => JSON.parse(json)).not.toThrow();
    });

    it('includes all keys', () => {
        const data = JSON.parse(exportFullBackup());
        expect(data).toHaveProperty('rubrics');
        expect(data).toHaveProperty('students');
        expect(data).toHaveProperty('classes');
        expect(data).toHaveProperty('settings');
    });
});

describe('importFullBackup', () => {
    it('restores data from valid JSON', () => {
        saveRubrics([makeRubric('r1')]);
        const backup = exportFullBackup();

        localStorage.clear();
        const result = importFullBackup(backup);
        expect(result).toBe(true);
        expect(loadStore().rubrics[0].id).toBe('r1');
    });

    it('returns false on invalid JSON', () => {
        const result = importFullBackup('not-json');
        expect(result).toBe(false);
    });

    it('handles partial backup (only some keys present)', () => {
        const partial = JSON.stringify({ rubrics: [makeRubric('r-partial')] });
        const result = importFullBackup(partial);
        expect(result).toBe(true);
        expect(loadStore().rubrics[0].id).toBe('r-partial');
    });
});

describe('updateDefaultFormat', () => {
    it('updates the defaultFormat in settings', () => {
        saveSettings(makeSettings());
        const newFormat: RubricFormat = { ...DEFAULT_FORMAT, fontSize: 18 };
        updateDefaultFormat(newFormat);
        expect(loadStore().settings.defaultFormat.fontSize).toBe(18);
    });

    it('works when no settings previously saved (uses defaults)', () => {
        const newFormat: RubricFormat = { ...DEFAULT_FORMAT, theme: 'light' } as any;
        updateDefaultFormat(newFormat);
        expect(loadStore().settings.defaultFormat).toMatchObject({ fontSize: newFormat.fontSize });
    });
});

describe('pending sync queue', () => {
    it('loadPendingQueue returns empty array when nothing queued', () => {
        expect(loadPendingQueue()).toEqual([]);
    });

    it('loadPendingQueue returns empty array on corrupted data', () => {
        localStorage.setItem('rm_pending_sync', 'not-json{{{');
        expect(loadPendingQueue()).toEqual([]);
    });

    it('addToPendingQueue persists an upsert op', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1', name: 'Test' } });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ entity: 'rubric', action: 'upsert' });
        expect(queue[0].id).toBeTruthy();
        expect(queue[0].queuedAt).toBeTruthy();
    });

    it('addToPendingQueue persists a delete op', () => {
        addToPendingQueue({ entity: 'student', action: 'delete', payload: null, entityId: 's1' });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ entity: 'student', action: 'delete', entityId: 's1' });
    });

    it('addToPendingQueue deduplicates by entity+id (last write wins)', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1', name: 'First' } });
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1', name: 'Second' } });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(1);
        expect((queue[0].payload as { name: string }).name).toBe('Second');
    });

    it('addToPendingQueue keeps distinct entities separate', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
        addToPendingQueue({ entity: 'student', action: 'upsert', payload: { id: 's1' } });
        expect(loadPendingQueue()).toHaveLength(2);
    });

    it('addToPendingQueue replaces upsert with delete for same entity+id', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
        addToPendingQueue({ entity: 'rubric', action: 'delete', payload: null, entityId: 'r1' });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0].action).toBe('delete');
    });

    it('removePendingWrites removes entries by id', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
        addToPendingQueue({ entity: 'student', action: 'upsert', payload: { id: 's1' } });
        const [first, second] = loadPendingQueue();
        removePendingWrites([first.id]);
        const remaining = loadPendingQueue();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(second.id);
    });

    it('removePendingWrites with unknown id is a no-op', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
        removePendingWrites(['nonexistent-id']);
        expect(loadPendingQueue()).toHaveLength(1);
    });

    it('removePendingWrites with empty array leaves queue unchanged', () => {
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
        removePendingWrites([]);
        expect(loadPendingQueue()).toHaveLength(1);
    });

    it('settings singleton op is deduplicated correctly', () => {
        addToPendingQueue({ entity: 'settings', action: 'upsert', payload: { theme: 'dark' } });
        addToPendingQueue({ entity: 'settings', action: 'upsert', payload: { theme: 'light' } });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(1);
        expect((queue[0].payload as { theme: string }).theme).toBe('light');
    });
});
