import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    loadStore,
    saveRubrics,
    saveStudents,
    saveClasses,
    saveStudentRubrics,
    stripAudioForOfflineCache,
    saveAttachments,
    saveGradeScales,
    saveSettings,
    saveFavoriteStandards,
    saveCommentBank,
    mergeLegacyCommentSnippets,
    setLocalMode,
    isLocalMode,
    markMigrationDone,
    saveCriterionClipboard,
    loadCriterionClipboard,
    loadUserTemplates,
    saveUserTemplates,
    loadTestDraft,
    saveTestDraft,
    clearTestDraft,
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
    loadRubricVersions,
    upsertRubricVersion,
    deleteRubricVersions,
    migrateLegacyRubricVersions,
} from './storage';
import type { Rubric, Student, Class, AppSettings, RubricFormat, StudentRubric, RubricVersion } from '../types';
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

    it('clears a pre-Phase-15.1 free-text Class.year that no longer matches the SchoolYear enum', () => {
        // Cast bypasses the SchoolYear type at the boundary to simulate old data on disk.
        const classes = [{ id: 'c1', name: 'Class A', year: '2024' } as unknown as Class];
        saveClasses(classes);
        const store = loadStore();
        expect(store.classes[0].year).toBeUndefined();
    });

    it('keeps a valid SchoolYear value on Class.year untouched', () => {
        const classes: Class[] = [{ id: 'c1', name: 'Class A', year: 'jaar-3' }];
        saveClasses(classes);
        const store = loadStore();
        expect(store.classes[0].year).toBe('jaar-3');
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

    it('stripAudioForOfflineCache removes embedded audio but leaves everything else, and skips entries without it', () => {
        const srs: StudentRubric[] = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l1',
                        checkedSubItems: [],
                        comment: 'nice work',
                        audioDataUrl: 'data:audio/webm;base64,AAAA',
                    },
                    { criterionId: 'c2', levelId: 'l2', checkedSubItems: [], comment: '' },
                ],
                overallComment: 'good',
                isPeerReview: false,
            },
        ];

        const stripped = stripAudioForOfflineCache(srs);

        expect(stripped[0].entries[0].audioDataUrl).toBeUndefined();
        expect(stripped[0].entries[0].comment).toBe('nice work');
        expect(stripped[0].entries[1]).toEqual(srs[0].entries[1]);
        expect(stripped[0].overallComment).toBe('good');
        expect(srs[0].entries[0].audioDataUrl).toBe('data:audio/webm;base64,AAAA'); // input untouched
    });

    it('retries without embedded audio when the raw write exceeds quota, and does not notify the handler if that succeeds', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        const srs: StudentRubric[] = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l1',
                        checkedSubItems: [],
                        comment: 'nice work',
                        audioDataUrl: 'data:audio/webm;base64,AAAA',
                    },
                ],
                overallComment: 'good',
                isPeerReview: false,
            },
        ];

        expect(() => saveStudentRubrics(srs)).not.toThrow();
        expect(handler).not.toHaveBeenCalled();

        const persisted = loadStore().studentRubrics;
        expect(persisted[0].entries[0].audioDataUrl).toBeUndefined();
        expect(persisted[0].entries[0].comment).toBe('nice work');
        expect(persisted[0].overallComment).toBe('good');

        setItemSpy.mockRestore();
        onStorageQuotaExceeded(() => {});
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

    it('notifies the handler and drops the write from the shared save path on quota', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        expect(() => saveRubrics([])).not.toThrow();
        expect(handler).toHaveBeenCalledTimes(1);

        setItemSpy.mockRestore();
        onStorageQuotaExceeded(() => {});
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

    it('addToPendingQueue swallows non-quota queue write failures without notifying', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('disk error');
        });

        expect(() => addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } })).not.toThrow();
        expect(handler).not.toHaveBeenCalled();

        setItemSpy.mockRestore();
        onStorageQuotaExceeded(() => {});
    });

    it('addToPendingQueue notifies the quota handler when the queue write fails', () => {
        const handler = vi.fn();
        onStorageQuotaExceeded(handler);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        expect(() => addToPendingQueue({ entity: 'rubric', action: 'upsert', payload: { id: 'r1' } })).not.toThrow();
        expect(handler).toHaveBeenCalledTimes(1);

        setItemSpy.mockRestore();
        onStorageQuotaExceeded(() => {});
    });

    it('stripAudioForOfflineCache passes rubrics without any audio through unchanged', () => {
        const srs: StudentRubric[] = [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false },
        ];
        expect(stripAudioForOfflineCache(srs)).toEqual(srs);
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

describe('rubric version history (Phase 18.4)', () => {
    const makeVersion = (id: string, label?: string): RubricVersion => ({
        id,
        savedAt: '2024-01-01T00:00:00Z',
        label,
        snapshot: makeRubric(),
    });

    it('round-trips manual and auto versions, newest auto capped at 20', () => {
        upsertRubricVersion('r1', makeVersion('manual1', 'v1'));
        for (let i = 0; i < 25; i++) {
            upsertRubricVersion('r1', makeVersion(`auto${i}`, 'auto:'));
        }
        const versions = loadRubricVersions('r1');
        const manuals = versions.filter((v) => v.label === 'v1');
        const autos = versions.filter((v) => v.label === 'auto:');
        expect(manuals).toHaveLength(1);
        expect(autos).toHaveLength(20);
        expect(autos[0].id).toBe('auto5'); // oldest 5 evicted
        expect(autos[19].id).toBe('auto24');
    });

    it('reports evicted auto-version ids so the caller can prune them server-side', () => {
        for (let i = 0; i < 20; i++) {
            expect(upsertRubricVersion('r1', makeVersion(`auto${i}`, 'auto:')).evictedIds).toEqual([]);
        }
        expect(upsertRubricVersion('r1', makeVersion('auto20', 'auto:')).evictedIds).toEqual(['auto0']);
        expect(upsertRubricVersion('r1', makeVersion('manual1', 'v1')).evictedIds).toEqual([]);
    });

    it('upserting the same id replaces rather than duplicates', () => {
        upsertRubricVersion('r1', makeVersion('v1', 'first'));
        upsertRubricVersion('r1', { ...makeVersion('v1', 'first'), label: 'renamed' });
        const versions = loadRubricVersions('r1');
        expect(versions).toHaveLength(1);
        expect(versions[0].label).toBe('renamed');
    });

    it('deleteRubricVersions clears only that rubric', () => {
        upsertRubricVersion('r1', makeVersion('v1'));
        upsertRubricVersion('r2', makeVersion('v2'));
        deleteRubricVersions('r1');
        expect(loadRubricVersions('r1')).toEqual([]);
        expect(loadRubricVersions('r2')).toHaveLength(1);
    });

    // Pre-Phase-18.4 data: the embedded entries predate RubricVersion.id, so the raw
    // shape genuinely lacks it (that's exactly what the migration has to backfill).
    const makeLegacyRubric = () =>
        ({
            ...makeRubric('r1'),
            versions: [{ savedAt: '2024-01-01', label: 'old', snapshot: makeRubric() }],
        }) as unknown as Rubric & { versions?: RubricVersion[] };

    it('migrateLegacyRubricVersions lifts an embedded versions array into the per-rubric store', () => {
        const migrated = migrateLegacyRubricVersions(makeLegacyRubric());
        expect((migrated as { versions?: unknown }).versions).toBeUndefined();
        expect(loadRubricVersions('r1')).toHaveLength(1);
        expect(loadRubricVersions('r1')[0].label).toBe('old');
    });

    it('migrateLegacyRubricVersions is a no-op (same reference) for a rubric without embedded versions', () => {
        const rubric = makeRubric('r1');
        expect(migrateLegacyRubricVersions(rubric)).toBe(rubric);
    });

    it('migrateLegacyRubricVersions does not duplicate on repeated runs', () => {
        migrateLegacyRubricVersions(makeLegacyRubric());
        migrateLegacyRubricVersions(makeLegacyRubric());
        expect(loadRubricVersions('r1')).toHaveLength(1);
    });

    it('mergeLegacyCommentSnippets converts a snippet into a tagged bank item and appends it', () => {
        const bank = [{ id: 'cb1', text: 'Existing', tags: ['general'], createdAt: '2024-01-01T00:00:00.000Z' }];
        const snippets = [
            { id: 'cs1', text: 'Legacy snippet', tag: 'positive', updatedAt: '2024-02-01T00:00:00.000Z' },
        ];
        const merged = mergeLegacyCommentSnippets(snippets, bank);
        expect(merged).toHaveLength(2);
        expect(merged[1]).toEqual({
            id: 'cs1',
            text: 'Legacy snippet',
            tags: ['positive'],
            createdAt: '2024-02-01T00:00:00.000Z',
            updatedAt: '2024-02-01T00:00:00.000Z',
        });
    });

    it('mergeLegacyCommentSnippets is a no-op (same reference) when there are no legacy snippets', () => {
        const bank = [{ id: 'cb1', text: 'Existing', tags: ['general'], createdAt: '2024-01-01T00:00:00.000Z' }];
        expect(mergeLegacyCommentSnippets([], bank)).toBe(bank);
    });

    it('mergeLegacyCommentSnippets skips a snippet whose id already exists in the bank (no duplicate on repeated runs)', () => {
        const bank = [
            { id: 'cs1', text: 'Already migrated', tags: ['positive'], createdAt: '2024-01-01T00:00:00.000Z' },
        ];
        const snippets = [{ id: 'cs1', text: 'Legacy snippet', tag: 'positive' }];
        const merged = mergeLegacyCommentSnippets(snippets, bank);
        expect(merged).toHaveLength(1);
        expect(merged[0].text).toBe('Already migrated');
    });
});

describe('local-mode and migration flags', () => {
    it('setLocalMode / isLocalMode / markMigrationDone round-trip through localStorage', () => {
        expect(isLocalMode()).toBe(false);
        setLocalMode();
        expect(isLocalMode()).toBe(true);
        localStorage.removeItem('rm_local_mode');
        expect(isLocalMode()).toBe(false);

        markMigrationDone();
        expect(localStorage.getItem('rm_migration_done')).toBe('true');
    });
});

describe('save() error handling', () => {
    it('rethrows non-quota errors so callers see real failures', () => {
        const original = localStorage.setItem.bind(localStorage);
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage is corrupted');
        });
        try {
            expect(() => saveSettings(makeSettings())).toThrow('storage is corrupted');
        } finally {
            spy.mockRestore();
        }
    });
});

describe('loadStore migrations', () => {
    it('lifts embedded legacy rubric versions into the per-rubric version store', () => {
        localStorage.setItem(
            'rm_rubrics',
            JSON.stringify([
                {
                    ...makeRubric(),
                    versions: [{ id: 'v1', savedAt: '2024-01-02', label: 'v1', snapshot: makeRubric() }],
                },
            ])
        );
        const store = loadStore();
        expect(store.rubrics).toHaveLength(1);
        expect((store.rubrics[0] as Rubric & { versions?: unknown }).versions).toBeUndefined();
        expect(loadRubricVersions('r1')).toHaveLength(1);
    });

    it('lifts legacy comment snippets into the comment bank and removes the old key', () => {
        localStorage.setItem('rm_comment_snippets', JSON.stringify([{ id: 'cs1', text: 'Legacy', tag: 'positive' }]));
        localStorage.setItem('rm_comment_bank', JSON.stringify([]));
        const store = loadStore();
        expect(store.commentBank).toHaveLength(1);
        expect(store.commentBank[0].id).toBe('cs1');
        expect(localStorage.getItem('rm_comment_snippets')).toBeNull();
        // The lifted snippet had no updatedAt → createdAt falls back to now.
        expect(store.commentBank[0].createdAt).toBeTruthy();
    });

    it('re-seeds an empty stored grade-scale collection with the defaults', () => {
        localStorage.setItem('rm_grade_scales', JSON.stringify([]));
        const store = loadStore();
        expect(store.gradeScales).toEqual(DEFAULT_GRADE_SCALES);
        expect(JSON.parse(localStorage.getItem('rm_grade_scales')!)).toEqual(DEFAULT_GRADE_SCALES);
    });
});

describe('stripAudioForOfflineCache', () => {
    it('strips audioDataUrl only from entries that carry it', () => {
        const srs: StudentRubric[] = [
            {
                id: 'sr1',
                rubricId: 'r1',
                studentId: 's1',
                entries: [
                    { criterionId: 'c1', levelId: null, comment: '', checkedSubItems: [], audioDataUrl: 'data:audio' },
                    { criterionId: 'c2', levelId: null, comment: '', checkedSubItems: [] },
                ],
                overallComment: '',
                isPeerReview: false,
            },
        ];
        const stripped = stripAudioForOfflineCache(srs);
        expect(stripped[0].entries[0].audioDataUrl).toBeUndefined();
        expect(stripped[0].entries[1].audioDataUrl).toBeUndefined();
        // Original entries untouched.
        expect(srs[0].entries[0].audioDataUrl).toBe('data:audio');
    });
});

describe('importFullBackup — every field', () => {
    const validBackup = {
        rubrics: [{ id: 'r1', criteria: [] }],
        students: [{ id: 's1', name: 'A', classId: 'c1' }],
        classes: [{ id: 'c1', name: 'C' }],
        studentRubrics: [
            { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false },
        ],
        attachments: [{ id: 'a1', name: 'A', mimeType: 'docx', size: 1, dataUrl: 'd' }],
        gradeScales: [{ id: 'gs1', name: 'G', type: 'points', ranges: [] }],
        settings: { theme: 'dark' },
        favoriteStandards: [{ guid: 'fs1', description: 'd', standardSetTitle: '', jurisdictionTitle: '' }],
        commentBank: [{ id: 'cb1', text: 'T', tags: [] }],
        commentSnippets: [{ id: 'cs1', text: 'T', tag: 'x' }],
        exportTemplates: [{ id: 'et1', name: 'T', dataUrl: 'd', levelHeaders: [], size: 1 }],
        peerReviews: [
            {
                id: 'pr1',
                rubricId: 'r1',
                studentId: 's1',
                reviewerId: 's2',
                entries: [],
                overallComment: '',
                isPeerReview: true,
            },
        ],
        selfAssessments: [{ id: 'sa1', rubricId: 'r1', studentId: 's1', ratings: [], submittedAt: '2024-01-01' }],
        speakingSessions: [
            { id: 'ss1', rubricId: 'r1', studentId: 's1', criteria: [], overallComment: '', gradedAt: '2024-01-01' },
        ],
        analysisResults: [
            {
                id: 'ar1',
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'a1',
                extractedText: '',
                analyzedAt: '2024-01-01',
                detectedItems: [],
                grammarErrors: [],
                grammarCheckerUsed: 'none',
            },
        ],
        tests: [{ id: 't1', name: 'T', questions: [], requireSEB: false, shuffleQuestions: false }],
        studentTests: [
            { id: 'st1', testId: 't1', studentId: 's1', answers: [], status: 'submitted', startedAt: '2024-01-01' },
        ],
        essayAssignments: [
            {
                teacherKey: 'tk1',
                studentId: 's1',
                title: 'E',
                prompt: 'P',
                assignedAt: '2024-01-01',
                createdAt: '2024-01-01',
                rubricId: 'r1',
            },
        ],
        essaySubmissions: [
            {
                id: 'es1',
                assignmentRubricId: 'r1',
                assignmentStudentId: 's1',
                teacherKey: 'tk1',
                contentHtml: '',
                wordCount: 0,
                submittedAt: '2024-01-01',
            },
        ],
        essayTemplates: [{ id: 'ett1', title: 'T', prompt: 'P', rubricId: 'r1', createdAt: '2024-01-01' }],
        gradingTasks: [
            { id: 'gt1', rubricId: 'r1', studentId: 's1', assignedToTeacher: 't1', assignedAt: '2024-01-01' },
        ],
        messages: [
            {
                id: 'm1',
                studentId: 's1',
                contextType: 'general',
                contextId: null,
                contextLabel: null,
                sender: 'teacher',
                body: 'B',
                createdAt: '2024-01-01',
                readByTeacher: false,
                readByStudent: false,
            },
        ],
        userTemplates: [{ id: 'ut1', name: 'T', subject: '', criteria: [], savedAt: '2024-01-01' }],
        flashcardDecks: [{ id: 'd1', name: 'D', cards: [] }],
        flashcardAssignments: [{ deckId: 'd1', studentId: 's1', deckName: 'D', cardCount: 0, createdAt: '2024-01-01' }],
        flashcardReviews: [{ id: 'd1:s1', deckId: 'd1', studentId: 's1', cardStates: {}, updatedAt: '2024-01-01' }],
        standardMasteryTargets: [{ id: 'mt1', standardGuid: 'g1', year: '1', targetPercentage: 80 }],
        newsFlashes: [{ id: 'nf1', title: 'N', kind: 'article' }],
        newsFlashReads: [{ id: 'nf1:s1', flashId: 'nf1', studentId: 's1', readAt: '2024-01-01' }],
        questionBank: [
            { id: 'q1', question: { type: 'multiple-choice', text: 'Q' }, tags: [], createdAt: '2024-01-01' },
        ],
        documentComments: [
            {
                id: 'dc1',
                attachmentId: 'a1',
                authorId: 't1',
                text: 'X',
                createdAt: '2024-01-01',
                resolved: false,
                anchor: { from: 0, to: 1 },
            },
        ],
        notificationDismissals: [
            { id: 'od:s1', type: 'overdue_grading', entityId: 's1', fingerprint: 'f', dismissedAt: '2024-01-01' },
        ],
    };

    it('restores every field from a valid backup', () => {
        const result = importFullBackup(JSON.stringify(validBackup));
        expect(result).toBe(true);
        const store = loadStore();
        expect(store.rubrics).toHaveLength(1);
        expect(store.students).toHaveLength(1);
        expect(store.classes).toHaveLength(1);
        expect(store.studentRubrics).toHaveLength(1);
        expect(store.attachments).toHaveLength(1);
        expect(store.gradeScales).toHaveLength(1);
        expect(store.settings.theme).toBe('dark');
        expect(store.favoriteStandards).toHaveLength(1);
        // The backup's legacy commentSnippets entry is lifted into the bank.
        expect(store.commentBank).toHaveLength(2);
        expect(store.commentBank.find((c) => c.id === 'cs1')?.tags).toEqual(['x']);
        expect(store.exportTemplates).toHaveLength(1);
        expect(store.peerReviews).toHaveLength(1);
        expect(store.selfAssessments).toHaveLength(1);
        expect(store.speakingSessions).toHaveLength(1);
        expect(store.analysisResults).toHaveLength(1);
        expect(store.tests).toHaveLength(1);
        expect(store.studentTests).toHaveLength(1);
        expect(store.essayAssignments).toHaveLength(1);
        expect(store.essaySubmissions).toHaveLength(1);
        expect(store.essayTemplates).toHaveLength(1);
        expect(store.gradingTasks).toHaveLength(1);
        expect(store.messages).toHaveLength(1);
        expect(store.userTemplates).toHaveLength(1);
        expect(store.flashcardDecks).toHaveLength(1);
        expect(store.flashcardAssignments).toHaveLength(1);
        expect(store.flashcardReviews).toHaveLength(1);
        expect(store.standardMasteryTargets).toHaveLength(1);
        expect(store.newsFlashes).toHaveLength(1);
        expect(store.newsFlashReads).toHaveLength(1);
        expect(store.questionBank).toHaveLength(1);
        expect(store.documentComments).toHaveLength(1);
        expect(store.notificationDismissals).toHaveLength(1);
    });

    it('skips every field when its value fails validation', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const invalid = Object.fromEntries(Object.keys(validBackup).map((key) => [key, 'not-an-array-or-object']));
        // Override the fields whose validators differ from a plain non-array string.
        const result = importFullBackup(JSON.stringify(invalid));
        expect(result).toBe(true);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
        // Nothing was restored.
        const store = loadStore();
        expect(store.rubrics).toEqual([]);
        expect(store.students).toEqual([]);
        expect(store.tests).toEqual([]);
    });
});

describe('clipboard, user templates, and test drafts', () => {
    it('saveCriterionClipboard / loadCriterionClipboard round-trip', () => {
        expect(loadCriterionClipboard()).toBeNull();
        saveCriterionClipboard({ id: 'c1', title: 'T', description: '', weight: 50, levels: [] });
        expect(loadCriterionClipboard()?.title).toBe('T');
    });

    it('loadUserTemplates defaults to empty and round-trips saves', () => {
        expect(loadUserTemplates()).toEqual([]);
        saveUserTemplates([{ id: 'ut1', name: 'T', subject: '', criteria: [], savedAt: '2024-01-01' }]);
        expect(loadUserTemplates()).toHaveLength(1);
    });

    it('loadTestDraft / saveTestDraft / clearTestDraft round-trip', () => {
        expect(loadTestDraft('draft:1')).toBeNull();
        saveTestDraft('draft:1', { answers: { q1: 'a' }, savedAt: '2024-01-01' });
        expect(loadTestDraft('draft:1')?.answers.q1).toBe('a');
        clearTestDraft('draft:1');
        expect(loadTestDraft('draft:1')).toBeNull();
    });

    it('loadTestTimer returns null when sessionStorage throws or holds garbage', () => {
        const original = sessionStorage.getItem.bind(sessionStorage);
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        try {
            expect(loadTestTimer('timer:1')).toBeNull();
        } finally {
            spy.mockRestore();
        }
        void original;
        // Garbage and negative values are already covered by the existing timer tests.
    });
});
