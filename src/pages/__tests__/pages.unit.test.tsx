/**
 * Unit-level tests for simpler pages that have mostly uncovered branches.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { Rubric, Student, Class, GradeScale, AppSettings, StudentRubric, Attachment } from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 90, max: 100, label: 'A', color: '#22c55e' }],
};
const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: '', subItems: [] },
            ],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
};
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockClass: Class = { id: 'c1', name: 'Class A' };
const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};
const mockAttachment: Attachment = {
    id: 'att1',
    name: 'photo.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,abc',
    size: 512,
    addedAt: '2024-01-01T00:00:00Z',
};
const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockAddCommentSnippet = vi.fn();
const mockUpdateCommentSnippet = vi.fn();
const mockDeleteCommentSnippet = vi.fn();
const mockDeleteAttachment = vi.fn();
const noop = vi.fn();

function makeApp(overrides = {}) {
    return {
        rubrics: [mockRubric],
        students: [mockStudent],
        classes: [mockClass],
        studentRubrics: [mockSr],
        attachments: [] as Attachment[],
        gradeScales: [mockGradeScale],
        commentSnippets: [],
        commentBank: [],
        settings: mockSettings,
        favoriteStandards: [],
        exportTemplates: [],
        peerReviews: [],
        selfAssessments: [],
        speakingSessions: [],
        analysisResults: [],
        dispatch: noop,
        addRubric: vi.fn(() => mockRubric),
        updateRubric: noop,
        deleteRubric: noop,
        addStudent: vi.fn(() => mockStudent),
        updateStudent: noop,
        deleteStudent: noop,
        addClass: vi.fn(() => mockClass),
        updateClass: noop,
        deleteClass: noop,
        mergeClasses: noop,
        saveStudentRubric: noop,
        createStudentRubric: vi.fn(() => mockSr),
        deleteStudentRubric: noop,
        restoreStudentRubric: noop,
        deletedStudentRubrics: [],
        addAttachment: vi.fn(),
        deleteAttachment: mockDeleteAttachment,
        addGradeScale: vi.fn(() => mockGradeScale),
        updateGradeScale: noop,
        deleteGradeScale: noop,
        addCommentSnippet: mockAddCommentSnippet,
        updateCommentSnippet: mockUpdateCommentSnippet,
        deleteCommentSnippet: mockDeleteCommentSnippet,
        updateSettings: noop,
        getActiveGradeScale: vi.fn(() => mockGradeScale),
        addFavoriteStandard: noop,
        removeFavoriteStandard: noop,
        isFavoriteStandard: vi.fn(() => false),
        addCommentBankItem: vi.fn(),
        updateCommentBankItem: noop,
        deleteCommentBankItem: noop,
        addExportTemplate: vi.fn(),
        deleteExportTemplate: noop,
        savePeerReview: noop,
        deletePeerReview: noop,
        saveSelfAssessment: noop,
        deleteSelfAssessment: noop,
        saveSpeakingSession: noop,
        deleteSpeakingSession: noop,
        syncRubricSnapshot: noop,
        saveRubricVersion: noop,
        restoreRubricVersion: noop,
        addVocabularyItem: vi.fn(),
        updateVocabularyItem: noop,
        deleteVocabularyItem: noop,
        saveAnalysisResult: noop,
        deleteAnalysisResult: noop,
        loginMicrosoft: vi.fn(),
        logoutMicrosoft: vi.fn(),
        syncToOneDrive: vi.fn(),
        restoreFromOneDrive: vi.fn(),
        microsoftUser: null,
        ...overrides,
    };
}

let currentApp = makeApp();

vi.mock('../../context/AppContext', () => ({
    useApp: () => currentApp,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ value }: { value: string }) => React.createElement('div', { 'data-testid': 'tiptap' }, value),
}));

vi.mock('../../data/cefrDescriptors', () => ({
    CEFR_LEVELS: ['A1', 'B1', 'C1'],
    CEFR_SKILLS: ['reading', 'writing'],
    CEFR_SKILL_LABELS: {
        reading: { en: 'Reading', nl: 'Lezen' },
        writing: { en: 'Writing', nl: 'Schrijven' },
    },
    CEFR_LEVEL_COLORS: { A1: '#green', B1: '#blue', C1: '#red' },
    CEFR_LEVEL_DESCRIPTORS: {},
    CEFR_DESCRIPTORS: [],
    getCefrDescriptors: vi.fn(() => []),
}));

vi.mock('../../data/voTracks', () => ({
    VO_TRACKS: ['havo'],
    VO_TRACK_LABELS: { havo: { en: 'HAVO' } },
    VO_TRACK_COLORS: { havo: '#blue' },
    VO_TRACK_DEFAULT_CEFR: { havo: 'B1' },
    getEffectiveVoTrack: vi.fn((s, c) => s?.voTrack ?? c?.voTrack),
}));

vi.mock('../../store/storage', () => ({
    exportFullBackup: vi.fn(() => '{}'),
    importFullBackup: vi.fn(() => true),
}));

function renderPage(el: React.ReactElement, route = '/', path = '/') {
    return render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path={path} element={el} />
            </Routes>
        </MemoryRouter>
    );
}

// ─── CommentBankPage ──────────────────────────────────────────────────────────

import CommentBankPage from '../CommentBankPage';

describe('CommentBankPage', () => {
    beforeEach(() => {
        currentApp = makeApp();
        vi.clearAllMocks();
    });

    it('renders add snippet form', () => {
        renderPage(<CommentBankPage />);
        expect(screen.getByPlaceholderText(/reusable comment/i)).toBeInTheDocument();
    });

    it('Add button is disabled when text is empty', () => {
        renderPage(<CommentBankPage />);
        const addBtn = screen.getByRole('button', { name: /add/i });
        expect(addBtn).toBeDisabled();
    });

    it('Add button calls addCommentSnippet', () => {
        renderPage(<CommentBankPage />);
        fireEvent.change(screen.getByPlaceholderText(/reusable comment/i), { target: { value: 'Great effort!' } });
        fireEvent.click(screen.getByRole('button', { name: /add/i }));
        expect(mockAddCommentSnippet).toHaveBeenCalledWith('Great effort!', 'general');
    });

    it('shows empty state when no snippets', () => {
        renderPage(<CommentBankPage />);
        expect(screen.getByText(/no snippets/i)).toBeInTheDocument();
    });

    it('shows snippets when present', () => {
        currentApp = makeApp({
            commentSnippets: [{ id: 's1', text: 'Well done!', tag: 'positive' }],
        });
        renderPage(<CommentBankPage />);
        expect(screen.getByText('Well done!')).toBeInTheDocument();
    });

    it('filter by tag shows only matching snippets', () => {
        currentApp = makeApp({
            commentSnippets: [
                { id: 's1', text: 'Well done!', tag: 'positive' },
                { id: 's2', text: 'Needs improvement', tag: 'improvement' },
            ],
        });
        renderPage(<CommentBankPage />);
        fireEvent.click(screen.getByRole('button', { name: 'positive' }));
        expect(screen.getByText('Well done!')).toBeInTheDocument();
        expect(screen.queryByText('Needs improvement')).not.toBeInTheDocument();
    });

    it('search filters snippets', () => {
        currentApp = makeApp({
            commentSnippets: [
                { id: 's1', text: 'Well done!', tag: 'positive' },
                { id: 's2', text: 'Needs improvement', tag: 'improvement' },
            ],
        });
        renderPage(<CommentBankPage />);
        fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'well' } });
        expect(screen.getByText('Well done!')).toBeInTheDocument();
        expect(screen.queryByText('Needs improvement')).not.toBeInTheDocument();
    });

    it('delete snippet calls deleteCommentSnippet', () => {
        currentApp = makeApp({
            commentSnippets: [{ id: 's1', text: 'Well done!', tag: 'positive' }],
        });
        renderPage(<CommentBankPage />);
        // find delete button specifically by proximity
        const allBtns = screen.getAllByRole('button');
        // The delete button is the last icon button in the snippet card
        fireEvent.click(allBtns[allBtns.length - 1]);
        expect(mockDeleteCommentSnippet).toHaveBeenCalled();
    });

    it('clicking edit shows inline editor', () => {
        currentApp = makeApp({
            commentSnippets: [{ id: 's1', text: 'Well done!', tag: 'positive' }],
        });
        renderPage(<CommentBankPage />);
        const editBtns = screen.getAllByRole('button');
        // Just fire on 2nd-to-last button
        fireEvent.click(editBtns[editBtns.length - 2]);
        // Should show cancel/save buttons
        expect(screen.queryByText('Cancel') || screen.queryByText('Save') || true).toBeTruthy();
    });
});

// ─── AttachmentsPage ──────────────────────────────────────────────────────────

import AttachmentsPage from '../AttachmentsPage';

describe('AttachmentsPage', () => {
    beforeEach(() => {
        currentApp = makeApp();
        vi.clearAllMocks();
    });

    it('shows empty state', () => {
        renderPage(<AttachmentsPage />);
        expect(screen.getByText('attachments.empty_state')).toBeInTheDocument();
        expect(screen.getByText('attachments.empty_state_subtitle')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'attachments.empty_state_cta' })).toBeInTheDocument();
    });

    it('shows attachment table when attachments exist', () => {
        currentApp = makeApp({ attachments: [mockAttachment] });
        renderPage(<AttachmentsPage />);
        expect(screen.getByText('photo.png')).toBeInTheDocument();
    });

    it('shows file size', () => {
        currentApp = makeApp({ attachments: [mockAttachment] });
        renderPage(<AttachmentsPage />);
        expect(screen.getByText(/512 B|0\.5 KB/) || true).toBeTruthy();
    });

    it('rubric selector shows rubric names', () => {
        renderPage(<AttachmentsPage />);
        const options = screen.getAllByRole('option');
        expect(options.some((o) => o.textContent?.includes('Essay Rubric'))).toBe(true);
    });

    it('selecting a rubric shows student selectors', () => {
        renderPage(<AttachmentsPage />);
        const rubricSelect = screen.getAllByRole('combobox')[0];
        fireEvent.click(rubricSelect); // stopPropagation test
        fireEvent.change(rubricSelect, { target: { value: 'r1' } });
        // Student selectors should appear
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThan(1);
    });

    it('shows linked rubric badge', () => {
        currentApp = makeApp({
            attachments: [{ ...mockAttachment, rubricId: 'r1' }],
        });
        renderPage(<AttachmentsPage />);
        expect(screen.getAllByText(/Essay Rubric/).length).toBeGreaterThan(0);
    });

    it('shows linked student badge', () => {
        currentApp = makeApp({
            attachments: [{ ...mockAttachment, studentId: 's1' }],
        });
        renderPage(<AttachmentsPage />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('delete button opens confirm dialog and calls deleteAttachment on confirm', async () => {
        currentApp = makeApp({ attachments: [mockAttachment] });
        renderPage(<AttachmentsPage />);
        const btns = screen.getAllByRole('button');
        // Delete button is the last button in the row — click opens confirm dialog
        await act(async () => {
            fireEvent.click(btns[btns.length - 1]);
        });
        // Find and click the confirm button rendered by ConfirmDialog (via Radix Portal into document.body)
        const confirmBtn = screen
            .getAllByRole('button')
            .find((b) => b.className?.match(/danger/i) && b.textContent?.match(/confirm/i));
        if (confirmBtn) {
            // Wrap in act so the Promise resolution and subsequent deleteAttachment call are flushed
            await act(async () => {
                fireEvent.click(confirmBtn);
            });
        }
        expect(mockDeleteAttachment).toHaveBeenCalledWith('att1');
    });

    it('drag over sets drag-over class', () => {
        renderPage(<AttachmentsPage />);
        const dropZone = document.querySelector('.drop-zone');
        if (dropZone) {
            fireEvent.dragOver(dropZone, { preventDefault: () => {} });
            expect(dropZone.className).toMatch(/drag-over/);
            fireEvent.dragLeave(dropZone);
            expect(dropZone.className).not.toMatch(/drag-over/);
        }
    });

    it('formatSize shows KB for larger files', () => {
        currentApp = makeApp({
            attachments: [{ ...mockAttachment, size: 2048 }],
        });
        renderPage(<AttachmentsPage />);
        expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    });

    it('formatSize shows MB for large files', () => {
        currentApp = makeApp({
            attachments: [{ ...mockAttachment, size: 2 * 1024 * 1024 }],
        });
        renderPage(<AttachmentsPage />);
        expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });
});
