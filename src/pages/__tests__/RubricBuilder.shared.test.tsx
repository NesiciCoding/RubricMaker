import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, MaterialAccess, Rubric } from '../../types';

const colleagueRubric: Rubric = {
    id: 'shared-1',
    name: 'Ann’s Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [
        {
            id: 'c1',
            title: 'Argument',
            description: '',
            weight: 100,
            levels: [{ id: 'l1', label: 'Good', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
        },
    ],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: ['their-file'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    totalMaxPoints: 10,
    scoringMode: 'weighted-percentage',
    folderId: 'their-folder',
    sharing: { visibility: 'school', access: 'edit' },
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
const mockAddRubric = vi.fn((r: Partial<Rubric>) => ({ ...r, id: 'copy-1' }));
const mockUpdateRubric = vi.fn();
const mockSave = vi.fn();
const sharedState = vi.hoisted(() => ({
    status: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
    connected: true,
    access: 'edit' as MaterialAccess,
    items: true,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const store = () => ({
    rubrics: [],
    studentRubrics: [],
    peerReviews: [],
    gradeScales: [{ id: 'gs1', name: 'Letter', type: 'letter', ranges: [] }],
    settings,
    addRubric: mockAddRubric,
    updateRubric: mockUpdateRubric,
    syncRubricSnapshot: vi.fn(),
    fetchRubricVersions: vi.fn(async () => []),
    saveRubricVersion: vi.fn(),
    restoreRubricVersion: vi.fn(),
    saveUserTemplate: vi.fn(),
    addVocabularyItem: vi.fn(),
    updateVocabularyItem: vi.fn(),
    deleteVocabularyItem: vi.fn(),
    deleteVocabularyItems: vi.fn(),
});
vi.mock('../../context/useStore', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useStoreSelector: (selector: (s: any) => any) => selector(store()),
    useStoreActions: () => store(),
}));
vi.mock('../../context/AppContext', () => {
    const domain = () => ({ ...store(), classes: [], students: [] });
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
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) =>
            typeof opts === 'object' && opts && 'name' in opts ? `${key}:${String(opts.name)}` : key,
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../hooks/useSharedMaterials', () => ({
    useSharedMaterials: () => ({
        status: sharedState.status,
        connected: sharedState.connected,
        items: sharedState.items
            ? [{ item: colleagueRubric, ownerId: 'ann', ownerName: 'Ann', access: sharedState.access }]
            : [],
        folders: [],
        refresh: vi.fn(),
        save: mockSave,
    }),
}));
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
    Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));
vi.mock('react-joyride', () => ({ default: () => null, Joyride: () => null, STATUS: {}, EVENTS: {}, ACTIONS: {} }));
vi.mock('../../services/database/AuditLogger', () => ({ logAuditEvent: vi.fn() }));

async function renderAt(path: string) {
    const { default: RubricBuilder } = await import('../RubricBuilder');
    const router = createMemoryRouter([{ path: '/rubrics/:id', element: <RubricBuilder /> }], {
        initialEntries: [path],
    });
    return render(<RouterProvider router={router} />);
}

describe('RubricBuilder — a colleague’s shared rubric', () => {
    beforeEach(() => {
        Object.assign(sharedState, { status: 'ready', connected: true, access: 'edit', items: true });
        mockSave.mockReset().mockResolvedValue({ success: true });
        mockShowToast.mockClear();
        mockAddRubric.mockClear();
        mockUpdateRubric.mockClear();
        mockNavigate.mockClear();
    });

    it('saves an editable share into the owner’s original, never into my rubrics', async () => {
        await renderAt('/rubrics/shared-1');
        expect(screen.getByText('sharing.banner_owner:Ann')).toBeInTheDocument();
        expect(screen.getByText('sharing.banner_edit:Ann')).toBeInTheDocument();
        expect(screen.queryByText('rubricBuilder.version_history')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('rubricBuilder.name_label'), { target: { value: 'Renamed' } });
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));

        await waitFor(() => expect(mockSave).toHaveBeenCalled());
        const saved = mockSave.mock.calls[0][0] as Rubric;
        expect(saved.id).toBe('shared-1');
        expect(saved.name).toBe('Renamed');
        expect(saved.folderId).toBe('their-folder');
        expect(mockUpdateRubric).not.toHaveBeenCalled();
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('sharing.saved_to_owner:Ann', 'success'));
    });

    it('reports a refused save', async () => {
        mockSave.mockResolvedValue({ success: false, error: 'not_permitted' });
        await renderAt('/rubrics/shared-1');
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('sharing.save_failed', 'error'));
    });

    it('keeps a view-only share read-only and duplicates it into my library', async () => {
        sharedState.access = 'view';
        await renderAt('/rubrics/shared-1');
        expect(screen.getByText('sharing.banner_view')).toBeInTheDocument();
        expect(screen.getByText('rubricBuilder.action_save').closest('button')).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /sharing.duplicate/ }));
        const copy = mockAddRubric.mock.calls[0][0] as Partial<Rubric>;
        expect(copy).not.toHaveProperty('id');
        expect(copy.folderId).toBeUndefined();
        expect(copy.attachmentIds).toEqual([]);
        expect(copy).not.toHaveProperty('sharing');
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/copy-1');
    });

    it('tells the owner-only vocabulary list apart', async () => {
        await renderAt('/rubrics/shared-1');
        fireEvent.click(screen.getByText('vocabulary.section_title'));
        expect(screen.getByText('sharing.vocabulary_owner_only')).toBeInTheDocument();
    });

    it('shows a loading state while shared rubrics load, then not-found when absent', async () => {
        sharedState.status = 'loading';
        sharedState.items = false;
        const { unmount } = await renderAt('/rubrics/missing');
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
        unmount();

        sharedState.status = 'ready';
        await renderAt('/rubrics/missing');
        expect(screen.getByText('rubricBuilder.not_found')).toBeInTheDocument();
    });
});
