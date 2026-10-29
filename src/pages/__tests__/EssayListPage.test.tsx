import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, EssayAssignment, EssaySubmission, Rubric, Student } from '../../types';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];
const mockStudents: Student[] = [{ id: 's1', name: 'Alice', classId: 'c1' }];

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 0,
    scoringMode: 'weighted-percentage',
};

const mockAssignment: EssayAssignment = {
    rubricId: 'r1',
    studentId: 's1',
    teacherKey: 'tk1',
    title: 'My Essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
};

const mockSubmission: EssaySubmission = {
    id: 'sub1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'tk1',
    contentHtml: '<p>hi</p>',
    wordCount: 1,
    submittedAt: '2024-01-02T00:00:00Z',
};

const mockNavigate = vi.fn();
const mockDeleteEssayGroup = vi.fn();
const mockUpdateEssayGroup = vi.fn();
const mockAddFolder = vi.fn();
const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();

let appOverrides: Record<string, unknown> = {};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const makeAppContextMock = () => ({
    essayAssignments: [mockAssignment],
    essaySubmissions: [mockSubmission],
    rubrics: [mockRubric],
    deleteEssayGroup: mockDeleteEssayGroup,
    updateEssayGroup: mockUpdateEssayGroup,
    folders: [] as { id: string; name: string; kind: string; createdAt: string }[],
    addFolder: mockAddFolder,
    updateFolder: mockUpdateFolder,
    deleteFolder: mockDeleteFolder,
    students: mockStudents,
    classes: mockClasses,
    settings: mockSettings,
    studentRubrics: [],
    ...appOverrides,
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppContextMock(),
    useStudents: () => makeAppContextMock(),
    useClasses: () => makeAppContextMock(),
    useGrading: () => makeAppContextMock(),
    useAuthoring: () => makeAppContextMock(),
    useAssessment: () => makeAppContextMock(),
    useEssays: () => makeAppContextMock(),
    useFlashcards: () => makeAppContextMock(),
    useSettings: () => makeAppContextMock(),
    usePlatform: () => makeAppContextMock(),
}));

let mockOnlineSubmissions = new Map<string, Set<string>>();
vi.mock('../../hooks/useOnlineEssaySubmissions', () => ({
    useOnlineEssaySubmissions: () => mockOnlineSubmissions,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
        i18n: { language: 'en' },
    }),
}));

describe('EssayListPage', () => {
    beforeEach(() => {
        appOverrides = {};
        mockOnlineSubmissions = new Map();
        mockNavigate.mockClear();
        mockDeleteEssayGroup.mockClear();
        mockUpdateEssayGroup.mockClear();
        mockAddFolder.mockClear();
        mockDeleteFolder.mockClear();
    });

    it('shows the empty state when there are no essays', async () => {
        appOverrides = { essayAssignments: [] };
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        expect(screen.getByText('essays.no_essays')).toBeInTheDocument();
    });

    it('lists an essay group and navigates to edit it', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        expect(screen.getByText('My Essay')).toBeInTheDocument();
        // The edit button calls navigate(); the monitor action is a <Link> and doesn't.
        fireEvent.click(screen.getAllByText('tests.action_edit')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/essays/tk1');
    });

    it('navigates to the new essay builder', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        fireEvent.click(screen.getByText('essays.new_essay'));
        expect(mockNavigate).toHaveBeenCalledWith('/essays/new');
    });

    it('deletes an essay group after confirming', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        // handleDelete() awaits confirm() — act flushes the resulting state update.
        await act(async () => {
            fireEvent.click(screen.getByTitle('tests.action_delete'));
        });
        // ConfirmDialog uses t('common.delete') as the confirmLabel (our mock returns the key).
        const confirmBtn = screen.getByText('common.delete');
        expect(confirmBtn).toBeInTheDocument();
        // Clicking confirm resolves the useConfirm() Promise; act flushes the continuation.
        await act(async () => {
            fireEvent.click(confirmBtn);
        });
        expect(mockDeleteEssayGroup).toHaveBeenCalledWith('tk1');
    });

    it('says how many submissions go with the essay in the delete dialog (#710)', async () => {
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        await act(async () => {
            fireEvent.click(screen.getByTitle('tests.action_delete'));
        });
        expect(screen.getByText(/^essays\.delete_essay_warning/)).toHaveTextContent('"count":1');
    });

    it('counts online hand-ins in the delete dialog the same way as the group card (#710)', async () => {
        appOverrides = { essaySubmissions: [] };
        mockOnlineSubmissions = new Map([['tk1', new Set(['s1'])]]);
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);
        expect(screen.getByText('1/1')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByTitle('tests.action_delete'));
        });
        expect(screen.getByText(/^essays\.delete_essay_warning/)).toHaveTextContent('"count":1');
    });
});

describe('EssayListPage folders', () => {
    const folder = { id: 'f1', name: 'Term 1', kind: 'essay', createdAt: '2024-01-01T00:00:00Z' };
    const secondEssay: EssayAssignment = {
        ...mockAssignment,
        studentId: 's2',
        teacherKey: 'tk2',
        title: 'Second Essay',
    };

    beforeEach(() => {
        appOverrides = {};
        mockOnlineSubmissions = new Map();
        mockAddFolder.mockReset();
        mockUpdateFolder.mockReset();
        mockDeleteFolder.mockReset();
    });

    it('counts the essays in a folder and filters the list when its tile is clicked', async () => {
        appOverrides = {
            essayAssignments: [{ ...mockAssignment, folderId: 'f1' }, secondEssay],
            folders: [folder],
        };
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);

        expect(screen.getByText('folders.items_count:{"count":1}')).toBeInTheDocument();
        expect(screen.getByText('Second Essay')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Term 1'));

        expect(screen.getByText('My Essay')).toBeInTheDocument();
        expect(screen.queryByText('Second Essay')).not.toBeInTheDocument();
    });

    it('says the folder is empty instead of showing the list-wide empty state', async () => {
        appOverrides = { essayAssignments: [secondEssay], folders: [folder] };
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);

        fireEvent.click(screen.getByText('Term 1'));

        expect(screen.getByText('folders.empty')).toBeInTheDocument();
        expect(screen.queryByText('essays.no_essays')).not.toBeInTheDocument();
    });

    it('creates an essay folder from the folder bar', async () => {
        mockAddFolder.mockReturnValue({ ...folder, id: 'f-new', name: 'Term 2' });
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);

        fireEvent.click(screen.getByText('folders.new_folder'));
        fireEvent.change(screen.getByLabelText('folders.folder_name'), { target: { value: 'Term 2' } });
        fireEvent.click(screen.getByText('folders.create'));

        // The kind keeps the essay tree separate from the rubric and test trees.
        expect(mockAddFolder).toHaveBeenCalledWith({ name: 'Term 2', kind: 'essay', displayOrder: 0 });
    });

    it('deletes a folder without touching the essays inside it', async () => {
        appOverrides = {
            essayAssignments: [{ ...mockAssignment, folderId: 'f1' }],
            folders: [folder],
        };
        const { default: EssayListPage } = await import('../EssayListPage');
        renderWithRouter(<EssayListPage />);

        fireEvent.click(screen.getByLabelText('folders.delete'));
        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });

        expect(mockDeleteFolder).toHaveBeenCalledWith('f1', 'essay');
        expect(mockDeleteEssayGroup).not.toHaveBeenCalled();
    });
});
