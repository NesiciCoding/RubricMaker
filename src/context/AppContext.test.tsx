import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import * as storage from '../store/storage';
import type { Rubric, GradeScale } from '../types';

// Mock storage functions so we don't actually write to localStorage/IndexedDB during tests
vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [{ id: 'default-scale', name: 'Default', type: 'letter', ranges: [] }],
        commentSnippets: [],
        settings: {
            defaultGradeScaleId: 'default-scale',
            theme: 'light',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: {
                criterionColWidth: 200,
                levelColWidth: 160,
                fontSize: 14,
                headerColor: '#1e3a5f',
                headerTextColor: '#ffffff',
                accentColor: '#3b82f6',
                fontFamily: 'Inter',
                showWeights: true,
                showPoints: true,
                levelOrder: 'best-first',
            },
        },
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: [],
        peerReviews: [],
    })),
    saveRubrics: vi.fn(),
    saveStudents: vi.fn(),
    saveClasses: vi.fn(),
    saveStudentRubrics: vi.fn(),
    saveAttachments: vi.fn(),
    saveGradeScales: vi.fn(),
    saveCommentSnippets: vi.fn(),
    saveSettings: vi.fn(),
    saveFavoriteStandards: vi.fn(),
    saveCommentBank: vi.fn(),
    saveExportTemplates: vi.fn(),
    savePeerReviews: vi.fn(),
    onStorageQuotaExceeded: vi.fn(),
    exportStore: vi.fn((state) => state),
    importFullBackup: vi.fn(() => true),
}));

// AppContext's DB-reconnect/OTP effects always dynamically import this module — mocked so
// tests don't pull in real @supabase/supabase-js and leave dangling imports past teardown.
vi.mock('../services/database', () => ({
    storageSync: {
        isConnected: () => false,
        getCurrentUserId: () => null,
        adapter: { getClient: () => null },
        onNetworkReconnect: () => () => {},
        onAuthChange: () => () => {},
        configure: () => Promise.resolve(false),
        setToastFn: () => {},
        hydrate: () => Promise.resolve({ data: null, error: null }),
        didWipeLocalData: () => false,
    },
}));

vi.mock('../services/microsoftGraph_deleted_placeholder', () => ({
    graphService: {
        getUserProfile: vi.fn().mockResolvedValue({ displayName: 'Test User' }),
        uploadFile: vi.fn().mockResolvedValue({}),
        downloadFile: vi.fn().mockResolvedValue(
            JSON.stringify({
                rubrics: [],
                students: [],
                classes: [],
                studentRubrics: [],
                attachments: [],
                gradeScales: [],
                commentSnippets: [],
                settings: {
                    theme: 'light',
                    language: 'en',
                    accentColor: '#3b82f6',
                    defaultFormat: {
                        criterionColWidth: 200,
                        levelColWidth: 160,
                        fontSize: 14,
                        headerColor: '#1e3a5f',
                        headerTextColor: '#ffffff',
                        accentColor: '#3b82f6',
                        fontFamily: 'Inter',
                        showWeights: true,
                        showPoints: true,
                        levelOrder: 'best-first',
                    },
                    defaultGradeScaleId: 'default-scale',
                },
                favoriteStandards: [],
                commentBank: [],
                exportTemplates: [],
                peerReviews: [],
            })
        ),
    },
}));

describe('AppContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

    it('should initialize with default loaded state', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        expect(result.current.rubrics).toEqual([]);
        expect(result.current.students).toEqual([]);
        expect(result.current.classes).toEqual([]);
        expect(result.current.gradeScales).toHaveLength(1);
        expect(result.current.settings.theme).toBe('light');
    });

    it('should add a rubric', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        const newRubric: Omit<Rubric, 'id' | 'createdAt' | 'updatedAt'> = {
            name: 'Test Rubric',
            subject: 'Math',
            description: 'Desc',
            criteria: [],
            gradeScaleId: 'default-scale',
            format: result.current.settings.defaultFormat,
            attachmentIds: [],
            totalMaxPoints: 100,
            scoringMode: 'weighted-percentage',
        };

        act(() => {
            const added = result.current.addRubric(newRubric);
            expect(added.id).toBeDefined();
            expect(added.createdAt).toBeDefined();
        });

        expect(result.current.rubrics).toHaveLength(1);
        expect(result.current.rubrics[0].name).toBe('Test Rubric');
        expect(storage.saveRubrics).toHaveBeenCalledWith(result.current.rubrics);
    });

    it('should update a rubric', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addRubric({
                name: 'Old Name',
                subject: '',
                description: '',
                criteria: [],
                gradeScaleId: 'default-scale',
                format: result.current.settings.defaultFormat,
                attachmentIds: [],
                totalMaxPoints: 100,
                scoringMode: 'weighted-percentage',
            });
        });

        const addedRubric = result.current.rubrics[0];

        act(() => {
            result.current.updateRubric({ ...addedRubric, name: 'New Name' });
        });

        expect(result.current.rubrics[0].name).toBe('New Name');
        // UpdatedAt should be newer
        expect(new Date(result.current.rubrics[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
            new Date(addedRubric.createdAt).getTime()
        );
        expect(storage.saveRubrics).toHaveBeenCalled();
    });

    it('should delete a rubric', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        let addedId = '';

        act(() => {
            const added = result.current.addRubric({
                name: 'Delete Me',
                subject: '',
                description: '',
                criteria: [],
                gradeScaleId: 'default-scale',
                format: result.current.settings.defaultFormat,
                attachmentIds: [],
                totalMaxPoints: 100,
                scoringMode: 'weighted-percentage',
            });
            addedId = added.id;
        });

        expect(result.current.rubrics).toHaveLength(1);

        act(() => {
            result.current.deleteRubric(addedId);
        });

        expect(result.current.rubrics).toHaveLength(0);
        expect(storage.saveRubrics).toHaveBeenCalled();
    });

    it('should save and update student rubrics', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const sr = { id: 'sr1', rubricId: 'r1', studentId: 's1', entries: [], overallComment: '', isPeerReview: false };

        act(() => {
            result.current.saveStudentRubric(sr);
        });
        expect(result.current.studentRubrics).toHaveLength(1);

        act(() => {
            result.current.saveStudentRubric({ ...sr, overallComment: 'Updated' });
        });
        expect(result.current.studentRubrics[0].overallComment).toBe('Updated');
        expect(storage.saveStudentRubrics).toHaveBeenCalled();
    });

    it('should create a student rubric with default entries', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric({
                name: 'R1',
                subject: '',
                description: '',
                criteria: [{ id: 'c1', title: 'C1', description: '', weight: 100, levels: [] }],
                gradeScaleId: 'default-scale',
                format: result.current.settings.defaultFormat,
                attachmentIds: [],
                totalMaxPoints: 100,
                scoringMode: 'total-points',
            });
        });

        act(() => {
            result.current.createStudentRubric(result.current.rubrics[0].id, 's1');
        });

        expect(result.current.studentRubrics).toHaveLength(1);
        expect(result.current.studentRubrics[0].entries).toHaveLength(1);
    });

    it('should create group student rubrics sharing one groupId, and propagate scores on save', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric({
                name: 'Group Project',
                subject: '',
                description: '',
                criteria: [{ id: 'c1', title: 'C1', description: '', weight: 100, levels: [] }],
                gradeScaleId: 'default-scale',
                format: result.current.settings.defaultFormat,
                attachmentIds: [],
                totalMaxPoints: 100,
                scoringMode: 'total-points',
            });
        });
        const rubricId = result.current.rubrics[0].id;

        let group: ReturnType<typeof result.current.createGroupStudentRubrics> = [];
        act(() => {
            group = result.current.createGroupStudentRubrics(rubricId, ['s1', 's2', 's3']);
        });

        expect(group).toHaveLength(3);
        expect(new Set(group.map((sr) => sr.groupId)).size).toBe(1);
        expect(result.current.studentRubrics).toHaveLength(3);

        // Grade only the first member; the other two should pick up the same scores/comment.
        act(() => {
            result.current.saveStudentRubric({
                ...group[0],
                entries: [{ criterionId: 'c1', levelId: 'l1', comment: 'nice', checkedSubItems: [] }],
                overallComment: 'Great teamwork',
            });
        });

        for (const sr of result.current.studentRubrics) {
            expect(sr.overallComment).toBe('Great teamwork');
            expect(sr.entries[0].levelId).toBe('l1');
        }
        // Each member keeps its own id/studentId — duplication, not a shared record.
        expect(new Set(result.current.studentRubrics.map((sr) => sr.studentId))).toEqual(new Set(['s1', 's2', 's3']));
    });

    it('should reuse an existing ungrouped StudentRubric instead of creating a duplicate', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        act(() => {
            result.current.addRubric({
                name: 'Group Project',
                subject: '',
                description: '',
                criteria: [{ id: 'c1', title: 'C1', description: '', weight: 100, levels: [] }],
                gradeScaleId: 'default-scale',
                format: result.current.settings.defaultFormat,
                attachmentIds: [],
                totalMaxPoints: 100,
                scoringMode: 'total-points',
            });
        });
        const rubricId = result.current.rubrics[0].id;

        act(() => {
            result.current.createStudentRubric(rubricId, 's1');
        });
        const existingId = result.current.studentRubrics[0].id;

        let group: ReturnType<typeof result.current.createGroupStudentRubrics> = [];
        act(() => {
            group = result.current.createGroupStudentRubrics(rubricId, ['s1', 's2']);
        });

        // No duplicate record for s1 — the pre-existing StudentRubric gets the groupId instead.
        expect(result.current.studentRubrics).toHaveLength(2);
        const s1Record = group.find((sr) => sr.studentId === 's1');
        expect(s1Record?.id).toBe(existingId);
        expect(s1Record?.groupId).toBeDefined();
    });

    it('should merge classes', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        let c1 = '',
            c2 = '';

        act(() => {
            c1 = result.current.addClass({ name: 'Class 1' }).id;
            c2 = result.current.addClass({ name: 'Class 2' }).id;
            result.current.addStudent({ name: 'S1', classId: c1 });
        });

        act(() => {
            result.current.mergeClasses(c1, c2);
        });

        expect(result.current.classes).toHaveLength(1);
        expect(result.current.students[0].classId).toBe(c2);
    });

    it('should manage favorite standards', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const std = { guid: 'std1', description: 'desc', standardSetTitle: '', jurisdictionTitle: '' };

        act(() => {
            result.current.addFavoriteStandard(std);
        });
        expect(result.current.favoriteStandards).toHaveLength(1);
        expect(result.current.isFavoriteStandard('std1')).toBe(true);

        act(() => {
            result.current.removeFavoriteStandard('std1');
        });
        expect(result.current.favoriteStandards).toHaveLength(0);
    });

    it('should manage comment bank items', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addCommentBankItem('Good job', ['tag1']);
        });
        expect(result.current.commentBank).toHaveLength(1);

        const item = result.current.commentBank[0];
        act(() => {
            result.current.updateCommentBankItem({ ...item, text: 'Great job' });
        });
        expect(result.current.commentBank[0].text).toBe('Great job');

        act(() => {
            result.current.deleteCommentBankItem(item.id);
        });
        expect(result.current.commentBank).toHaveLength(0);
    });

    it('should mange grade scales', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addGradeScale({ name: 'New Scale', type: 'points', ranges: [] });
        });
        expect(result.current.gradeScales).toHaveLength(2);

        const scale = result.current.gradeScales[1];
        act(() => {
            result.current.updateGradeScale({ ...scale, name: 'Updated Scale' });
        });
        expect(result.current.gradeScales[1].name).toBe('Updated Scale');

        act(() => {
            result.current.deleteGradeScale(scale.id);
        });
        expect(result.current.gradeScales).toHaveLength(1);
    });

    it('should manage attachments', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addAttachment({ name: 'File 1', mimeType: 'docx', size: 100, dataUrl: 'data' });
        });
        expect(result.current.attachments).toHaveLength(1);

        const att = result.current.attachments[0];
        act(() => {
            result.current.deleteAttachment(att.id);
        });
        expect(result.current.attachments).toHaveLength(0);
    });

    it('should manage comment snippets', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addCommentSnippet('Snippet 1', 'tag1');
        });
        expect(result.current.commentSnippets).toHaveLength(1);

        const snippet = result.current.commentSnippets[0];
        act(() => {
            result.current.updateCommentSnippet({ ...snippet, text: 'New Text' });
        });
        expect(result.current.commentSnippets[0].text).toBe('New Text');

        act(() => {
            result.current.deleteCommentSnippet(snippet.id);
        });
        expect(result.current.commentSnippets).toHaveLength(0);
    });

    it('should manage export templates', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.addExportTemplate({ name: 'Template 1', dataUrl: 'data', levelHeaders: ['H1'], size: 100 });
        });
        expect(result.current.exportTemplates).toHaveLength(1);

        const template = result.current.exportTemplates[0];
        act(() => {
            result.current.deleteExportTemplate(template.id);
        });
        expect(result.current.exportTemplates).toHaveLength(0);
    });

    it('should manage peer reviews', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        const pr = {
            id: 'pr1',
            rubricId: 'r1',
            studentId: 's1',
            reviewerId: 's2',
            entries: [],
            overallComment: '',
            isPeerReview: true,
        };

        act(() => {
            result.current.savePeerReview(pr);
        });
        expect(result.current.peerReviews).toHaveLength(1);

        act(() => {
            result.current.deletePeerReview('pr1');
        });
        expect(result.current.peerReviews).toHaveLength(0);
    });

    it('should retrieve active grade scale', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        let scale: GradeScale | undefined;
        act(() => {
            scale = result.current.getActiveGradeScale();
        });
        expect(scale?.id).toBe('default-scale');
    });

    it('should update settings', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        act(() => {
            result.current.updateSettings({ theme: 'dark' });
        });

        expect(result.current.settings.theme).toBe('dark');
        expect(storage.saveSettings).toHaveBeenCalled();
    });
});
