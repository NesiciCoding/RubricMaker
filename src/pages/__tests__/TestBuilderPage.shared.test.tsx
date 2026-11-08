import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, MaterialAccess, Test as RmTest } from '../../types';

const colleagueTest: RmTest = {
    id: 'shared-t',
    name: 'Ann’s Quiz',
    questions: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00Z',
    folderId: 'their-folder',
    sharing: { visibility: 'coteachers', access: 'edit' },
};

const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockAddTest = vi.fn((t: Partial<RmTest>) => ({ ...t, id: 'copy-t' }));
const mockUpdateTest = vi.fn();
const mockSave = vi.fn();
const sharedState = vi.hoisted(() => ({
    status: 'ready' as 'idle' | 'loading' | 'ready',
    access: 'edit' as MaterialAccess,
    items: true,
}));

const app = {
    tests: [] as RmTest[],
    students: [],
    classes: [],
    gradeScales: [],
    studentRubrics: [],
    settings,
    questionBank: [],
    addTest: mockAddTest,
    updateTest: mockUpdateTest,
    addSectionBankItem: vi.fn(),
    addFlashcardDeck: vi.fn(),
    updateSettings: vi.fn(),
};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('../../context/AppContext', () => ({
    useRoster: () => app,
    useStudents: () => app,
    useClasses: () => app,
    useGrading: () => app,
    useAuthoring: () => app,
    useAssessment: () => app,
    useEssays: () => app,
    useFlashcards: () => app,
    useSettings: () => app,
    usePlatform: () => app,
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params && 'name' in params ? `${key}:${String(params.name)}` : key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: () => ({
        status: sharedState.status,
        connected: true,
        items: sharedState.items
            ? [{ item: colleagueTest, ownerId: 'ann', ownerName: 'Ann', access: sharedState.access }]
            : [],
        folders: [],
        refresh: vi.fn(),
        save: mockSave,
    }),
}));
vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: true, status: 'idle', lastSyncAt: null, userId: 'me', currentUser: null }),
}));
vi.mock('../../services/database', () => ({ loadSupabaseConfig: vi.fn(() => null) }));
vi.mock('../../components/Tests/TestA4Preview', () => ({ default: () => null }));
vi.mock('../../components/Editor/EssayEditor', () => ({ default: () => null }));

async function renderAt(path: string) {
    const { default: TestBuilderPage } = await import('../TestBuilderPage');
    const router = createMemoryRouter([{ path: '/tests/:id', element: <TestBuilderPage /> }], {
        initialEntries: [path],
    });
    return render(<RouterProvider router={router} />);
}

describe('TestBuilderPage — a colleague’s shared test', () => {
    beforeEach(() => {
        Object.assign(sharedState, { status: 'ready', access: 'edit', items: true });
        mockSave.mockReset().mockResolvedValue({ success: true });
        mockShowToast.mockClear();
        mockAddTest.mockClear();
        mockUpdateTest.mockClear();
        mockNavigate.mockClear();
    });

    it('saves an editable share into the owner’s original', async () => {
        await renderAt('/tests/shared-t');
        expect(screen.getByText('sharing.banner_edit:Ann')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'Renamed quiz' } });
        fireEvent.click(screen.getByText('common.save'));

        await waitFor(() => expect(mockSave).toHaveBeenCalled());
        const saved = mockSave.mock.calls[0][0] as RmTest;
        expect(saved).toMatchObject({ id: 'shared-t', name: 'Renamed quiz', folderId: 'their-folder' });
        expect(mockUpdateTest).not.toHaveBeenCalled();
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('sharing.saved_to_owner:Ann', 'success'));
    });

    it('reports a refused save', async () => {
        mockSave.mockResolvedValue({ success: false, error: 'not_permitted' });
        await renderAt('/tests/shared-t');
        fireEvent.click(screen.getByText('common.save'));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('sharing.save_failed', 'error'));
    });

    it('keeps a view-only share read-only and duplicates it', async () => {
        sharedState.access = 'view';
        await renderAt('/tests/shared-t');
        expect(screen.getByText('common.save').closest('button')).toBeDisabled();
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: 'My version' } });
        fireEvent.click(screen.getByRole('button', { name: /sharing.duplicate/ }));
        const copy = mockAddTest.mock.calls[0][0] as Partial<RmTest>;
        expect(copy).not.toHaveProperty('id');
        expect(copy).not.toHaveProperty('sharing');
        expect(copy.folderId).toBeUndefined();
        expect(copy.name).toBe('My version tests.copy_suffix');
        expect(mockNavigate).toHaveBeenCalledWith('/tests/copy-t');
    });

    it('ignores Ctrl+S on a view-only share', async () => {
        sharedState.access = 'view';
        await renderAt('/tests/shared-t');
        fireEvent.change(screen.getByLabelText('tests.name_label'), { target: { value: '' } });
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(screen.queryByText('tests.name_required')).toBeNull();
        expect(mockSave).not.toHaveBeenCalled();
    });

    it('waits for shared tests to load before reporting not-found', async () => {
        sharedState.status = 'loading';
        sharedState.items = false;
        const { unmount } = await renderAt('/tests/missing');
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
        unmount();
        sharedState.status = 'ready';
        await renderAt('/tests/missing');
        expect(screen.getByText('tests.not_found')).toBeInTheDocument();
    });
});
