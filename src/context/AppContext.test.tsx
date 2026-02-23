import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppProvider, useApp } from './AppContext';
import * as storage from '../store/storage';
import type { Rubric, Student, Class, GradeScale } from '../types';

// Mock storage functions so we don't actually write to localStorage/IndexedDB during tests
vi.mock('../store/storage', () => ({
    loadStore: vi.fn(() => ({
        rubrics: [],
        students: [],
        classes: [],
        studentRubrics: [],
        attachments: [],
        gradeScales: [
            { id: 'default-scale', name: 'Default', type: 'letter', ranges: [] }
        ],
        commentSnippets: [],
        settings: {
            defaultGradeScaleId: 'default-scale',
            theme: 'light',
            language: 'en',
            accentColor: '#3b82f6',
            defaultFormat: {
                criterionColWidth: 200, levelColWidth: 160, fontSize: 14,
                headerColor: '#1e3a5f', headerTextColor: '#ffffff', accentColor: '#3b82f6',
                fontFamily: 'Inter', showWeights: true, showPoints: true, levelOrder: 'best-first'
            }
        },
        favoriteStandards: [],
        commentBank: [],
        exportTemplates: []
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
}));

describe('AppContext', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
        <AppProvider>{children}</AppProvider>
    );

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
            scoringMode: 'weighted-percentage'
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
                name: 'Old Name', subject: '', description: '', criteria: [],
                gradeScaleId: 'default-scale', format: result.current.settings.defaultFormat,
                attachmentIds: [], totalMaxPoints: 100, scoringMode: 'weighted-percentage'
            });
        });

        const addedRubric = result.current.rubrics[0];

        act(() => {
            result.current.updateRubric({ ...addedRubric, name: 'New Name' });
        });

        expect(result.current.rubrics[0].name).toBe('New Name');
        // UpdatedAt should be newer
        expect(new Date(result.current.rubrics[0].updatedAt).getTime())
            .toBeGreaterThanOrEqual(new Date(addedRubric.createdAt).getTime());
        expect(storage.saveRubrics).toHaveBeenCalled();
    });

    it('should delete a rubric', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        let addedId = '';

        act(() => {
            const added = result.current.addRubric({
                name: 'Delete Me', subject: '', description: '', criteria: [],
                gradeScaleId: 'default-scale', format: result.current.settings.defaultFormat,
                attachmentIds: [], totalMaxPoints: 100, scoringMode: 'weighted-percentage'
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

    it('should add, update, and delete a student', () => {
        const { result } = renderHook(() => useApp(), { wrapper });

        // Add
        let studentId = '';
        act(() => {
            const s = result.current.addStudent({ name: 'Alice', classId: 'c1' });
            studentId = s.id;
        });
        expect(result.current.students).toHaveLength(1);
        expect(result.current.students[0].name).toBe('Alice');
        expect(storage.saveStudents).toHaveBeenCalled();

        // Update
        act(() => {
            result.current.updateStudent({ id: studentId, name: 'Alice Smith', classId: 'c1' });
        });
        expect(result.current.students[0].name).toBe('Alice Smith');
        expect(storage.saveStudents).toHaveBeenCalled();

        // Delete
        act(() => {
            result.current.deleteStudent(studentId);
        });
        expect(result.current.students).toHaveLength(0);
        expect(storage.saveStudents).toHaveBeenCalled();
    });

    it('should delete a class and optionally its students', () => {
        const { result } = renderHook(() => useApp(), { wrapper });
        let classId1 = '';
        let classId2 = '';

        act(() => {
            classId1 = result.current.addClass({ name: 'Class 1' }).id;
            classId2 = result.current.addClass({ name: 'Class 2' }).id;

            result.current.addStudent({ name: 'S1', classId: classId1 });
            result.current.addStudent({ name: 'S2', classId: classId1 });
            result.current.addStudent({ name: 'S3', classId: classId2 });
        });

        expect(result.current.classes).toHaveLength(2);
        expect(result.current.students).toHaveLength(3);

        // Delete without students
        act(() => {
            result.current.deleteClass(classId2, false);
        });
        expect(result.current.classes).toHaveLength(1);
        expect(result.current.students).toHaveLength(3); // S3 is orphaned but alive

        // Delete with students
        act(() => {
            result.current.deleteClass(classId1, true);
        });
        expect(result.current.classes).toHaveLength(0);
        expect(result.current.students).toHaveLength(1); // Only S3 remains
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
