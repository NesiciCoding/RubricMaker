import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    loadTestTimer,
    saveTestTimer,
    clearTestTimer,
    onStorageQuotaExceeded,
    clearLocalData,
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
        expect(store.settings.theme).toBe('light');
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

    it('drops the write and notifies the registered handler when localStorage quota is exceeded', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        expect(() => saveStudentRubrics([])).not.toThrow();
        expect(handler).toHaveBeenCalledTimes(1);

        setItemSpy.mockRestore();
        onStorageQuotaExceeded(() => {});
    });

    it('re-throws non-quota write errors instead of swallowing them', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('disk error');
        });

        expect(() => saveStudentRubrics([])).toThrow('disk error');

        setItemSpy.mockRestore();
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

    it('saveSpeakingSessions persists recording metadata without storing blob data in any rm_* key', () => {
        saveSpeakingSessions([
            {
                id: 'ss2',
                rubricId: 'r1',
                studentId: 's1',
                durationSeconds: 120,
                elapsedSeconds: 60,
                pronunciationMarks: [],
                entries: [],
                overallComment: '',
                gradedAt: '2024-01-01',
                recordings: [
                    {
                        id: 'rec1',
                        mediaType: 'audio',
                        mimeType: 'audio/webm',
                        durationSec: 30,
                        sizeBytes: 12345,
                        createdAt: '2024-01-01T00:00:00.000Z',
                    },
                ],
            },
        ]);
        const saved = loadStore().speakingSessions.find((s) => s.id === 'ss2');
        expect(saved?.recordings?.[0]?.id).toBe('rec1');

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            if (!key.startsWith('rm_')) continue;
            const value = localStorage.getItem(key) ?? '';
            expect(value).not.toContain('blob:');
            expect(value).not.toMatch(/data:(audio|video)\//);
        }
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

    it('returns false when top-level value is an array', () => {
        expect(importFullBackup(JSON.stringify([]))).toBe(false);
    });

    it('returns false when top-level value is a primitive', () => {
        expect(importFullBackup(JSON.stringify(42))).toBe(false);
        expect(importFullBackup(JSON.stringify('string'))).toBe(false);
    });

    it('handles partial backup (only some keys present)', () => {
        const partial = JSON.stringify({ rubrics: [makeRubric('r-partial')] });
        const result = importFullBackup(partial);
        expect(result).toBe(true);
        expect(loadStore().rubrics[0].id).toBe('r-partial');
    });

    it('skips rubrics field when it is not an array', () => {
        saveRubrics([makeRubric('original')]);
        const result = importFullBackup(JSON.stringify({ rubrics: 'not-an-array' }));
        expect(result).toBe(true);
        // rubrics were not overwritten
        expect(loadStore().rubrics[0].id).toBe('original');
    });

    it('skips rubrics field when items are missing id', () => {
        saveRubrics([makeRubric('original')]);
        const result = importFullBackup(JSON.stringify({ rubrics: [{ name: 'no-id', criteria: [] }] }));
        expect(result).toBe(true);
        expect(loadStore().rubrics[0].id).toBe('original');
    });

    it('skips rubrics field when items have non-array criteria', () => {
        saveRubrics([makeRubric('original')]);
        const result = importFullBackup(JSON.stringify({ rubrics: [{ id: 'x', criteria: 'bad' }] }));
        expect(result).toBe(true);
        expect(loadStore().rubrics[0].id).toBe('original');
    });

    it('skips students field when it is not an array of objects with id', () => {
        saveStudents([{ id: 's-orig', name: 'Alice', classId: 'c1' }]);
        const result = importFullBackup(JSON.stringify({ students: [{ name: 'no-id' }] }));
        expect(result).toBe(true);
        expect(loadStore().students[0].id).toBe('s-orig');
    });

    it('skips settings field when it is not a plain object', () => {
        const original = makeSettings();
        saveSettings(original);
        const result = importFullBackup(JSON.stringify({ settings: ['invalid'] }));
        expect(result).toBe(true);
        expect(loadStore().settings.theme).toBe('dark');
    });

    it('imports valid fields even when another field is invalid', () => {
        const result = importFullBackup(
            JSON.stringify({
                rubrics: 'bad',
                students: [{ id: 's-valid', name: 'Bob', classId: 'c1' }],
            })
        );
        expect(result).toBe(true);
        expect(loadStore().students[0].id).toBe('s-valid');
        expect(loadStore().rubrics).toEqual([]);
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

    it('drops the oldest entry when the queue is at capacity', () => {
        for (let i = 0; i < 500; i++) {
            addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: `r${i}` } });
        }
        addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'overflow' } });
        const queue = loadPendingQueue();
        expect(queue).toHaveLength(500);
        expect(queue.some((q) => (q.payload as { id: string }).id === 'r0')).toBe(false);
        expect(queue.some((q) => (q.payload as { id: string }).id === 'overflow')).toBe(true);
    });

    it('fires the quota handler when the queue write hits a full localStorage', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const original = localStorage.setItem.bind(localStorage);
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
            if (key === 'rm_pending_sync') throw new DOMException('full', 'QuotaExceededError');
            original(key, value);
        });
        try {
            addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } });
            expect(handler).toHaveBeenCalledOnce();
        } finally {
            spy.mockRestore();
            onStorageQuotaExceeded(() => {});
        }
    });
});

describe('clearLocalData', () => {
    it('wipes rm_-prefixed data keys but preserves connection settings', () => {
        localStorage.setItem('rm_rubrics', '[]');
        localStorage.setItem('rm_pending_sync', '[]');
        localStorage.setItem('rm_migration_done', 'true');
        localStorage.setItem('rm_last_sync_at', '2024-01-01');
        localStorage.setItem('rm_owner_uid', 'user-a');
        localStorage.setItem('rm_supabase_config', '{"supabaseUrl":"https://x"}');
        localStorage.setItem('rm_local_mode', 'true');
        localStorage.setItem('unrelated_key', 'kept');

        clearLocalData();

        expect(localStorage.getItem('rm_rubrics')).toBeNull();
        expect(localStorage.getItem('rm_pending_sync')).toBeNull();
        expect(localStorage.getItem('rm_migration_done')).toBeNull();
        expect(localStorage.getItem('rm_last_sync_at')).toBeNull();
        expect(localStorage.getItem('rm_owner_uid')).toBeNull();
        expect(localStorage.getItem('rm_supabase_config')).toBe('{"supabaseUrl":"https://x"}');
        expect(localStorage.getItem('rm_local_mode')).toBe('true');
        expect(localStorage.getItem('unrelated_key')).toBe('kept');
    });
});

describe('test timer storage', () => {
    const key = 'rm_test_draft_abc_timer';

    beforeEach(() => {
        sessionStorage.removeItem(key);
    });

    it('round-trips a saved timer value', () => {
        saveTestTimer(key, 120);
        expect(loadTestTimer(key)).toBe(120);
    });

    it('returns null when nothing is stored', () => {
        expect(loadTestTimer(key)).toBeNull();
    });

    it('returns null for a non-numeric stored value instead of NaN', () => {
        sessionStorage.setItem(key, 'not-a-number');
        expect(loadTestTimer(key)).toBeNull();
    });

    it('clearTestTimer removes the stored value', () => {
        saveTestTimer(key, 60);
        clearTestTimer(key);
        expect(loadTestTimer(key)).toBeNull();
    });
});
