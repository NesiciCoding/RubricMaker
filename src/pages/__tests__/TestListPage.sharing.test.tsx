import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Folder, Test as RmTest } from '../../types';

const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    materialSharing: { visibility: 'coteachers', access: 'view' },
};

const folder: Folder = {
    id: 'f1',
    name: 'Unit 3',
    kind: 'test',
    createdAt: '2026-01-01',
    sharing: { visibility: 'school', access: 'edit' },
};
const filed: RmTest = {
    id: 't1',
    name: 'Filed quiz',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00Z',
    folderId: 'f1',
};
const loose: RmTest = { ...filed, id: 't2', name: 'Loose quiz', folderId: undefined };

const mockUpdateTest = vi.fn();
const mockUpdateFolder = vi.fn();
const mockAddTest = vi.fn((t: Partial<RmTest>) => ({ ...t, id: 'copy' }));
const mockShowToast = vi.fn();
const mockNavigate = vi.fn();

const app = {
    tests: [filed, loose],
    folders: [folder],
    students: [],
    classes: [],
    gradeScales: [],
    questionBank: [],
    studentRubrics: [],
    studentTests: [],
    settings,
    exportTemplates: [],
    addTest: mockAddTest,
    updateTest: mockUpdateTest,
    deleteTest: vi.fn(),
    saveStudentTest: vi.fn(),
    addFolder: vi.fn(),
    updateFolder: mockUpdateFolder,
    deleteFolder: vi.fn(),
    updateSettings: vi.fn(),
};

vi.mock('../../context/AppContext', () => {
    const domain = () => app;
    return {
        useRoster: domain,
        useStudents: domain,
        useClasses: domain,
        useGrading: domain,
        useAuthoring: domain,
        useAssessment: domain,
        useEssays: domain,
        useFlashcards: domain,
        useSettings: domain,
        usePlatform: domain,
    };
});
vi.mock('../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: never) => T): T => selector(app as never),
    useStoreActions: () => app,
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));
vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: true, status: 'idle', lastSyncAt: null, userId: 'me', currentUser: null }),
}));
vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: () => ({
        status: 'ready',
        connected: true,
        items: [
            {
                item: {
                    ...loose,
                    id: 'theirs',
                    name: 'Colleague quiz',
                    folderId: 'gone',
                    questions: [{ id: 'q1', type: 'open', prompt: 'Why?', points: 1 }],
                },
                ownerId: 'ann',
                ownerName: 'Ann',
                access: 'view',
            },
        ],
        folders: [],
        refresh: vi.fn(),
        save: vi.fn(),
    }),
}));
vi.mock('../../services/database', () => ({ loadSupabaseConfig: vi.fn(() => null) }));
vi.mock('../../components/Tests/TestAssignmentModal', () => ({
    default: ({ test, ownerId, onClose }: { test: RmTest; ownerId?: string; onClose: () => void }) => (
        <div role="dialog" aria-label="assign">
            {`${test.id}:${ownerId ?? 'me'}`}
            <button onClick={onClose}>close-assign</button>
        </div>
    ),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Droppable: ({ children }: { children: (p: unknown, snap: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

async function renderPage() {
    const { default: TestListPage } = await import('../TestListPage');
    return render(
        <MemoryRouter>
            <TestListPage />
        </MemoryRouter>
    );
}

describe('TestListPage sharing', () => {
    beforeEach(() => {
        mockUpdateTest.mockClear();
        mockUpdateFolder.mockClear();
        mockAddTest.mockClear();
        mockShowToast.mockClear();
    });

    it('badges each test with its effective sharing: folder for filed tests, the default otherwise', async () => {
        await renderPage();
        expect(screen.getAllByTitle('sharing.badge_school · sharing.badge_editable')).toHaveLength(1);
        expect(screen.getAllByTitle('sharing.badge_coteachers')).toHaveLength(1);
    });

    it('sets a test’s own sharing from its share button', async () => {
        await renderPage();
        fireEvent.click(screen.getAllByRole('button', { name: 'sharing.action_share' })[1]);
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByLabelText(/sharing.inherit_default/)).toBeChecked();
        fireEvent.click(within(dialog).getByLabelText(/sharing.visibility_private/));
        expect(mockUpdateTest).toHaveBeenCalledWith(
            expect.objectContaining({ id: 't2', sharing: { visibility: 'private', access: 'view' } })
        );
        fireEvent.click(within(dialog).getByText('common.done'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shares a whole folder from its tile', async () => {
        await renderPage();
        const folderShare = screen.getByRole('button', { name: 'sharing.folder_share' });
        expect(folderShare).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(folderShare);
        fireEvent.click(within(screen.getByRole('dialog')).getByLabelText(/sharing.inherit_default/));
        expect(mockUpdateFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', sharing: undefined }));
    });

    it('lists a colleague’s test unfiled when its folder is not shared, and duplicates it', async () => {
        await renderPage();
        expect(screen.getByText('sharing.shared_with_me')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Colleague quiz'));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/theirs');
        fireEvent.click(screen.getByRole('button', { name: /sharing.duplicate_named/ }));
        const copy = mockAddTest.mock.calls[0][0] as Partial<RmTest>;
        expect(copy.folderId).toBeUndefined();
        expect(copy).not.toHaveProperty('id');
        expect(mockShowToast.mock.calls[0][0]).toMatch(/^sharing.duplicated_toast/);
        mockShowToast.mock.calls[0][2].action.onClick();
        expect(mockNavigate).toHaveBeenCalledWith('/tests/copy');
    });

    it('assigns a colleague’s test under its owner and opens its score sheet', async () => {
        await renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'tests.action_assign: Colleague quiz' }));
        expect(screen.getByRole('dialog', { name: 'assign' })).toHaveTextContent('theirs:ann');
        fireEvent.click(screen.getByText('close-assign'));
        expect(screen.queryByRole('dialog', { name: 'assign' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'tests.scoreSheet.action_open: Colleague quiz' }));
        expect(mockNavigate).toHaveBeenCalledWith('/tests/theirs/scores');
    });
});
