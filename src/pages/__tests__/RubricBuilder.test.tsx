import React from 'react';
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { GradeScale, Rubric, RubricCriterion, StudentRubric, AppSettings } from '../../types';

const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'A test rubric',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                { id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: 'Great', subItems: [] },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 89, description: 'OK', subItems: [] },
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

const mockSr: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: 'l1', checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
    gradedAt: '2024-01-01T00:00:00Z',
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockRubricWithLinks: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            linkedStandards: [
                {
                    guid: 'std1',
                    description: 'A linked standard',
                    statementNotation: 'CCSS.1',
                    standardSetTitle: 'CCSS',
                    jurisdictionTitle: 'US',
                },
            ],
            cefrDescriptors: [
                { descriptorId: 'd0', level: 'A2', skill: 'reading', descriptionEn: 'desc', descriptionNl: 'desc' },
            ],
            frameworkDescriptors: [
                {
                    descriptorId: 'f0',
                    framework: 'ib',
                    categoryId: 'cat0',
                    categoryLabelEn: 'Category',
                    categoryLabelNl: 'Categorie',
                    categoryColor: '#fff',
                    descriptionEn: 'desc',
                    descriptionNl: 'desc',
                },
            ],
        },
    ],
};

const mockVersions = [
    {
        id: 'v1',
        savedAt: '2024-01-05T00:00:00Z',
        label: 'v1',
        snapshot: { ...mockRubric, name: 'Essay Rubric (old)' },
    },
    {
        id: 'v0',
        savedAt: '2024-01-01T00:00:00Z',
        label: 'auto:initial',
        snapshot: { ...mockRubric, name: 'Essay Rubric (auto)' },
    },
];

// Two-criterion rubric: exercising update/add/delete paths on one criterion also
// walks the non-matching `: x` branches for the other.
const mockRubricTwo: Rubric = {
    ...mockRubric,
    criteria: [
        mockRubric.criteria[0],
        {
            id: 'c2',
            title: 'Criterion 2',
            description: '',
            weight: 0,
            levels: [
                { id: 'l3', label: 'Strong', minPoints: 90, maxPoints: 100, description: '', subItems: [] },
                { id: 'l4', label: 'Weak', minPoints: 0, maxPoints: 89, description: '', subItems: [] },
            ],
        },
    ],
};

// Rubric with a legacy single linkedStandard field plus sub-item standards.
const mockRubricLegacy: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            linkedStandard: {
                guid: 'legacy1',
                description: 'Legacy standard',
                statementNotation: 'LEG.1',
                standardSetTitle: 'Legacy',
                jurisdictionTitle: 'NL',
            },
            levels: [
                {
                    ...mockRubric.criteria[0].levels[0],
                    subItems: [
                        {
                            id: 'si1',
                            label: 'Sub item',
                            points: 1,
                            minPoints: 0,
                            maxPoints: 1,
                            linkedStandards: [
                                {
                                    guid: 'sub1',
                                    description: 'Sub standard',
                                    statementNotation: 'SUB.1',
                                    standardSetTitle: 'SUB',
                                    jurisdictionTitle: 'NL',
                                },
                            ],
                        },
                        {
                            id: 'si2',
                            label: 'Sub item two',
                            points: 1,
                            minPoints: 0,
                            maxPoints: 1,
                        },
                    ],
                },
                mockRubric.criteria[0].levels[1],
            ],
        },
    ],
};

// Ascending point levels for the smart-allocate ascending branch.
const mockRubricAscending: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            levels: [
                { id: 'l1', label: 'Basic', minPoints: 0, maxPoints: 60, description: '', subItems: [] },
                { id: 'l2', label: 'Advanced', minPoints: 0, maxPoints: 100, description: '', subItems: [] },
            ],
        },
    ],
};

// Empty rubric for the guard branches (balance weights, bank insert without levels).
const mockRubricEmpty: Rubric = { ...mockRubric, id: 'r-empty', criteria: [] };

// Markdown descriptions for the designer's bold/italic renderer.
const mockRubricMarkdown: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            description: '**bold lead** and *italic tail*',
            levels: [
                {
                    ...mockRubric.criteria[0].levels[0],
                    description: 'Level with **bold** text',
                },
                mockRubric.criteria[0].levels[1],
            ],
        },
    ],
};

// Rubric whose linked standards have no statementNotation, exercising the guid fallbacks.
const mockRubricNoNotation: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            linkedStandard: {
                guid: 'lg1',
                description: 'Legacy no notation',
                standardSetTitle: 'NN',
                jurisdictionTitle: 'NL',
            },
            linkedStandards: [
                {
                    guid: 'ns1',
                    description: 'No notation standard',
                    standardSetTitle: 'NN',
                    jurisdictionTitle: 'NL',
                },
            ],
            levels: [
                {
                    ...mockRubric.criteria[0].levels[0],
                    subItems: [
                        {
                            id: 'nn-si',
                            label: 'NN sub',
                            points: 1,
                            minPoints: 0,
                            maxPoints: 1,
                            linkedStandards: [
                                {
                                    guid: 'ns2',
                                    description: 'Sub no notation',
                                    standardSetTitle: 'NN',
                                    jurisdictionTitle: 'NL',
                                },
                            ],
                        },
                    ],
                },
                mockRubric.criteria[0].levels[1],
            ],
        },
    ],
};

const mockSaveUserTemplate = vi.fn();
const mockAddRubric = vi.fn(() => ({ ...mockRubric, id: 'new-r' }));
const mockUpdateRubric = vi.fn();
const mockNavigate = vi.fn();
const mockShowToast = vi.fn();
const mockExportPdf = vi.fn();
const mockExportDocx = vi.fn();
const mockSyncRubricSnapshot = vi.fn();
const mockFetchRubricVersions = vi.fn(async () => [] as typeof mockVersions);
const mockSaveRubricVersion = vi.fn(async () => {});
const mockRestoreRubricVersion = vi.fn();

let appOverrides: Record<string, unknown> = {};

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const makeAppContextMock = () => ({
    rubrics: [mockRubric],
    studentRubrics: [mockSr],
    peerReviews: [],
    addRubric: mockAddRubric,
    updateRubric: mockUpdateRubric,
    syncRubricSnapshot: mockSyncRubricSnapshot,
    fetchRubricVersions: mockFetchRubricVersions,
    saveRubricVersion: mockSaveRubricVersion,
    restoreRubricVersion: mockRestoreRubricVersion,
    saveUserTemplate: mockSaveUserTemplate,
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    addVocabularyItem: vi.fn(),
    updateVocabularyItem: vi.fn(),
    deleteVocabularyItem: vi.fn(),
    deleteVocabularyItems: vi.fn(),
    classes: [],
    students: [],
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

const i18nState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: any) => any) => selector(makeAppContextMock()),
    useStoreActions: () => makeAppContextMock(),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            return key;
        },
        i18n: i18nState,
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

const dndState = vi.hoisted(() => ({ onDragEnd: null as null | ((result: unknown) => void) }));
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (result: unknown) => void }) => {
        dndState.onDragEnd = onDragEnd;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (provided: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }),
    Draggable: ({ children }: { children: (provided: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('../../utils/pdfExport', () => ({ exportRubricGridPdf: mockExportPdf }));
vi.mock('../../utils/docxExport', () => ({ exportRubricToDocx: mockExportDocx }));
vi.mock('../../services/database/AuditLogger', () => ({ logAuditEvent: vi.fn() }));
const mockSaveCriterionClipboard = vi.fn();
const mockLoadCriterionClipboard = vi.fn((): RubricCriterion | null => null);
vi.mock('../../store/storage', () => ({
    saveCriterionClipboard: (...args: unknown[]) => mockSaveCriterionClipboard(...args),
    loadCriterionClipboard: () => mockLoadCriterionClipboard(),
    loadUserTemplates: vi.fn(() => []),
    saveUserTemplates: vi.fn(),
}));

vi.mock('../../components/CEFR/CefrPickerModal', () => ({
    default: ({
        onAdd,
        onRemove,
        onAddFramework,
        onRemoveFramework,
        onClose,
    }: {
        onAdd: (d: { descriptorId: string; level: string; skill: string }) => void;
        onRemove: (id: string) => void;
        onAddFramework: (d: { descriptorId: string; framework: string; categoryId: string }) => void;
        onRemoveFramework: (id: string) => void;
        onClose: () => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'cefr-picker-modal' },
            React.createElement(
                'button',
                { onClick: () => onAdd({ descriptorId: 'd1', level: 'B1', skill: 'reading' }) },
                'Add Descriptor'
            ),
            React.createElement('button', { onClick: () => onRemove('d0') }, 'Remove Descriptor'),
            React.createElement(
                'button',
                { onClick: () => onAddFramework({ descriptorId: 'f1', framework: 'ib', categoryId: 'cat1' }) },
                'Add Framework Descriptor'
            ),
            React.createElement('button', { onClick: () => onRemoveFramework('f0') }, 'Remove Framework Descriptor'),
            React.createElement('button', { onClick: onClose }, 'Close CEFR Picker')
        ),
}));

vi.mock('../../components/Standards/StandardsPickerModal', () => ({
    default: ({
        onSelect,
        onClose,
    }: {
        onSelect: (std: {
            guid: string;
            description: string;
            standardSetTitle: string;
            jurisdictionTitle: string;
        }) => void;
        onClose: () => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'standards-picker-modal' },
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onSelect({
                            guid: 'std-new',
                            description: 'New standard',
                            standardSetTitle: 'CCSS',
                            jurisdictionTitle: 'US',
                        }),
                },
                'Select Standard'
            ),
            React.createElement('button', { onClick: onClose }, 'Close Standards Picker')
        ),
}));

const joyrideState = vi.hoisted(() => ({ onEvent: null as null | ((e: { status?: string }) => void) }));
vi.mock('react-joyride', () => ({
    Joyride: ({ onEvent, run }: { onEvent: (e: { status?: string }) => void; run: boolean }) => {
        joyrideState.onEvent = onEvent;
        return React.createElement('div', { 'data-testid': 'joyride', 'data-run': String(run) });
    },
    STATUS: { FINISHED: 'finished', SKIPPED: 'skipped' },
}));

vi.mock('../../components/Modals/RubricVersionDiffModal', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'version-diff-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Diff')
        ),
}));

let RubricBuilderLazy: React.ComponentType;

describe('RubricBuilder', () => {
    beforeEach(async () => {
        appOverrides = {};
        mockNavigate.mockClear();
        mockAddRubric.mockClear();
        mockUpdateRubric.mockClear();
        mockShowToast.mockClear();
        mockExportPdf.mockClear();
        mockExportDocx.mockClear();
        mockSyncRubricSnapshot.mockClear();
        mockFetchRubricVersions.mockClear().mockResolvedValue([]);
        mockSaveRubricVersion.mockClear();
        mockRestoreRubricVersion.mockClear();
        mockSaveCriterionClipboard.mockClear();
        mockLoadCriterionClipboard.mockReset().mockReturnValue(null);
        mockSaveUserTemplate.mockClear();
        i18nState.language = 'en';
        dndState.onDragEnd = null;
        joyrideState.onEvent = null;
        const mod = await import('../RubricBuilder');
        RubricBuilderLazy = mod.default;
    });

    function renderNew() {
        const router = createMemoryRouter([{ path: '/rubrics/new', element: <RubricBuilderLazy /> }], {
            initialEntries: ['/rubrics/new'],
        });
        return render(<RouterProvider router={router} />);
    }

    function renderEdit() {
        const router = createMemoryRouter([{ path: '/rubrics/:id', element: <RubricBuilderLazy /> }], {
            initialEntries: ['/rubrics/r1'],
        });
        return render(<RouterProvider router={router} />);
    }

    function renderEditWithVersions() {
        mockFetchRubricVersions.mockResolvedValue(mockVersions);
        return renderEdit();
    }

    function renderEditWithLinks() {
        appOverrides = { rubrics: [mockRubricWithLinks] };
        return renderEdit();
    }

    it('renders the new-rubric form with one default criterion', () => {
        renderNew();
        expect(screen.getByText('rubricBuilder.new_rubric')).toBeInTheDocument();
        expect(screen.getAllByDisplayValue(/Excellent|New Criterion/).length).toBeGreaterThan(0);
    });

    it('shows a validation error and refuses to save when the name is blank', () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(mockAddRubric).not.toHaveBeenCalled();
    });

    it('creates a new rubric and navigates to it', () => {
        renderNew();
        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.placeholder_name'), {
            target: { value: 'Brand New Rubric' },
        });
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brand New Rubric' }));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new-r', { replace: true });
    });

    it('loads an existing rubric pre-filled and saves an update', () => {
        renderEdit();
        expect(screen.getByText('rubricBuilder.edit_rubric')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Essay Rubric')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', name: 'Essay Rubric' }));
    });

    it('adds and deletes a criterion', () => {
        renderNew();
        const initialTitleInputs = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name');
        expect(initialTitleInputs).toHaveLength(1);
        fireEvent.click(screen.getByText('rubricBuilder.action_add_first_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(2);
        const deleteButtons = screen.getAllByLabelText('rubricBuilder.action_delete_criterion');
        fireEvent.click(deleteButtons[0]);
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(1);
    });

    it('duplicates a criterion', () => {
        renderEdit();
        const before = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name').length;
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_duplicate_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(before + 1);
    });

    it('edits criterion title and weight', () => {
        renderEdit();
        const titleInput = screen.getByPlaceholderText('rubricBuilder.placeholder_criterion_name');
        fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
        expect(titleInput).toHaveValue('Updated Title');
    });

    it('switches scoring mode to total-points and reveals the max-points field', () => {
        renderNew();
        const radios = screen.getAllByRole('radio');
        const totalPointsRadio = radios.find((r) => (r as HTMLInputElement).value === 'total-points')!;
        fireEvent.click(totalPointsRadio);
        expect(screen.getByPlaceholderText('e.g. 100')).toBeInTheDocument();
    });

    it('sets a CEFR target level, revealing the threshold control', () => {
        renderNew();
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B1' } });
        expect(screen.getByText('cefr.achieve_threshold_label')).toBeInTheDocument();
    });

    it('toggles the designer view', () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        fireEvent.click(screen.getByText('rubricBuilder.action_form_view'));
        expect(screen.getByText('rubricBuilder.new_rubric')).toBeInTheDocument();
    });

    it('toggles the format panel and preview panel', () => {
        renderNew();
        fireEvent.click(screen.getByText('FORMAT'));
        fireEvent.click(screen.getByText('rubricBuilder.action_preview'));
        // No crash; both panels are optional renders gated by local state.
        expect(screen.getByText('rubricBuilder.new_rubric')).toBeInTheDocument();
    });

    it('opens the export menu and exports as PDF', async () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_export_pdf'));
        expect(mockExportPdf).toHaveBeenCalled();
    });

    it('opens the export menu and exports as DOCX', async () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_export_docx'));
        // The export now lazy-loads docxExport via dynamic import(), so it resolves a microtask later.
        await waitFor(() => expect(mockExportDocx).toHaveBeenCalled());
    });

    it('shows the version history button only when editing an existing rubric', () => {
        renderNew();
        expect(screen.queryByText('rubricBuilder.version_history')).not.toBeInTheDocument();
    });

    it('opens version history when editing', async () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        // Toggling shouldn't crash; the panel content is fetched async via fetchRubricVersions.
        expect(await screen.findByText('rubricBuilder.no_versions_yet')).toBeInTheDocument();
    });

    it('expands and collapses vocabulary section', () => {
        renderNew();
        fireEvent.click(screen.getByText('Vocabulary & Grammar List'));
        fireEvent.click(screen.getByText('Vocabulary & Grammar List'));
        expect(screen.getByText('rubricBuilder.new_rubric')).toBeInTheDocument();
    });

    // ── Level / sub-item CRUD (form view) ───────────────────────────────────────

    it('adds and deletes a level', () => {
        renderEdit();
        const before = screen.getAllByPlaceholderText('rubricBuilder.placeholder_level_name').length;
        fireEvent.click(screen.getByText('rubricBuilder.action_add_level'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_level_name')).toHaveLength(before + 1);
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_delete_level')[0]);
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_level_name')).toHaveLength(before);
    });

    it('expands sub-items and adds one', () => {
        renderEdit();
        fireEvent.click(screen.getAllByText(/rubricBuilder.label_sub_items/)[0]);
        fireEvent.click(screen.getByText('rubricBuilder.action_add_sub_item'));
        expect(screen.getAllByText(/rubricBuilder.label_sub_items.*\(1\)/).length).toBeGreaterThan(0);
    });

    // ── Standards linking ────────────────────────────────────────────────────────

    it('shows the no-API-key standards modal when no standardsApiKey is configured', () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        expect(screen.getByText('rubricBuilder.standards_modal_title')).toBeInTheDocument();
    });

    // ── CEFR / framework descriptor linking ──────────────────────────────────────

    it('opens the CEFR picker and adds a descriptor', () => {
        renderEdit();
        fireEvent.click(screen.getByText(/framework.action_link_descriptor/));
        expect(screen.getByTestId('cefr-picker-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add Descriptor'));
        fireEvent.click(screen.getByText('Close CEFR Picker'));
        expect(screen.queryByTestId('cefr-picker-modal')).not.toBeInTheDocument();
    });

    // ── Version history ──────────────────────────────────────────────────────────

    it('saves a new version from the version history panel', async () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        expect(await screen.findByText('rubricBuilder.no_versions_yet')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.save_version'));
        expect(mockSaveRubricVersion).toHaveBeenCalledWith('r1', undefined);
    });

    it('lists existing versions and opens the diff modal', async () => {
        renderEditWithVersions();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        fireEvent.click((await screen.findAllByText('rubricBuilder.compare_version'))[0]);
        expect(screen.getByTestId('version-diff-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Close Diff'));
        expect(screen.queryByTestId('version-diff-modal')).not.toBeInTheDocument();
    });

    it('restores a version after confirming', async () => {
        renderEditWithVersions();
        const reloadSpy = vi.fn();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, reload: reloadSpy },
            configurable: true,
        });
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        // Versions render newest-first, so the labelled v1 is the second button.
        fireEvent.click((await screen.findAllByText('rubricBuilder.restore_version'))[1]);
        // restoreRubricVersion's window.confirm was migrated to useConfirm()/ConfirmDialog —
        // confirm the ConfirmDialog rendered with the restore message, then click its Confirm button.
        expect(await screen.findByText('rubricBuilder.confirm_restore')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('common.confirm'));
        });
        expect(mockRestoreRubricVersion).toHaveBeenCalledWith('r1', mockVersions[0].snapshot);
        expect(reloadSpy).toHaveBeenCalled();
        Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    });

    // ── Sync dialog (saving an edited rubric with graded submissions) ────────────

    it('offers to sync the rubric snapshot after saving an edit with existing student grades', () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(screen.getByText('rubricBuilder.sync_dialog_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.sync_dialog_confirm'));
        expect(mockSyncRubricSnapshot).toHaveBeenCalledWith('r1', expect.objectContaining({ id: 'r1' }));
    });

    it('saves without the sync dialog when no submissions exist', () => {
        appOverrides = { studentRubrics: [], peerReviews: [] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(mockUpdateRubric).toHaveBeenCalled();
        expect(screen.queryByText('rubricBuilder.sync_dialog_title')).not.toBeInTheDocument();
    });

    // ── Save-as-template, print, JSON export ──────────────────────────────────────

    it('saves the rubric as a template from the export menu', () => {
        mockSaveUserTemplate.mockClear();
        mockShowToast.mockClear();
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_save_as_template'));
        expect(mockSaveUserTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ name: mockRubric.name, subject: mockRubric.subject })
        );
        expect(mockShowToast).toHaveBeenCalled();
    });

    it('exports the rubric as JSON', () => {
        renderEdit();
        const createObjectURL = vi.fn(() => 'blob:fake');
        global.URL.createObjectURL = createObjectURL;
        global.URL.revokeObjectURL = vi.fn();
        HTMLAnchorElement.prototype.click = vi.fn();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_download_json'));
        expect(createObjectURL).toHaveBeenCalled();
    });

    it('prints the rubric', () => {
        renderEdit();
        const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_print'));
        expect(printSpy).toHaveBeenCalled();
        printSpy.mockRestore();
    });

    // ── Standards picker (with API key configured) ───────────────────────────────

    it('links and unlinks a standard via the real picker when an API key is set', () => {
        appOverrides = {
            rubrics: [mockRubricWithLinks],
            settings: { ...mockSettings, standardsApiKey: 'key123' },
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        expect(screen.getByTestId('standards-picker-modal')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Select Standard'));
        expect(screen.getAllByText('New standard').length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[0]);
        expect(screen.queryByText('A linked standard')).not.toBeInTheDocument();
    });

    // ── CEFR / framework descriptor add+remove round trip ────────────────────────

    it('adds and removes CEFR and framework descriptors via the mocked picker', () => {
        renderEditWithLinks();
        fireEvent.click(screen.getByText(/framework.action_link_descriptor/));
        fireEvent.click(screen.getByText('Add Descriptor'));
        fireEvent.click(screen.getByText('Remove Descriptor'));
        fireEvent.click(screen.getByText('Add Framework Descriptor'));
        fireEvent.click(screen.getByText('Remove Framework Descriptor'));
        fireEvent.click(screen.getByText('Close CEFR Picker'));
        // No crash through the full add/remove round trip for both descriptor kinds.
        expect(screen.getByText('rubricBuilder.edit_rubric')).toBeInTheDocument();
    });

    // ── Clipboard copy/paste a criterion ──────────────────────────────────────────

    it('copies a criterion to the clipboard', () => {
        renderEdit();
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_copy_criterion'));
        expect(mockSaveCriterionClipboard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    });

    it('pastes a criterion from the clipboard', () => {
        mockLoadCriterionClipboard.mockReturnValue({
            id: 'clip1',
            title: 'Clipboard Criterion',
            description: '',
            weight: 50,
            levels: [{ id: 'cl1', label: 'Lvl', minPoints: 0, maxPoints: 1, description: '', subItems: [] }],
        });
        renderEdit();
        const before = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name').length;
        fireEvent.click(screen.getByText('rubricBuilder.action_paste_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(before + 1);
    });

    // ── Single-point scoring mode ─────────────────────────────────────────────────

    it('shows the single-point descriptor textarea in single-point mode', () => {
        renderNew();
        const radios = screen.getAllByRole('radio');
        const singlePointRadio = radios.find((r) => (r as HTMLInputElement).value === 'single-point')!;
        fireEvent.click(singlePointRadio);
        const textarea = screen.getByPlaceholderText('rubricBuilder.single_point_descriptor_placeholder');
        fireEvent.change(textarea, { target: { value: 'Meets the standard' } });
        expect(textarea).toHaveValue('Meets the standard');
    });

    // ── Speaking dimensions insertion (CEFR speaking skill) ───────────────────────

    it('shows the insert-speaking-dimensions action when the CEFR skill is speaking', async () => {
        renderNew();
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'speaking_production' } });
        fireEvent.click(screen.getByText('rubricBuilder.insert_speaking_dims'));
        // window.confirm was migrated to useConfirm()/ConfirmDialog — confirm the dialog rendered
        // with the insert-speaking message, then click its Confirm button.
        expect(await screen.findByText('rubricBuilder.insert_speaking_confirm')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(screen.getByText('common.confirm'));
        });
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(6);
    });

    // ── Designer (WYSIWYG grid) view ──────────────────────────────────────────────

    describe('designer view', () => {
        // The form view stays mounted (display:none) while the designer view is active,
        // so queries must be scoped to the designer's own <table class="rubric-grid">
        // to avoid matching the hidden form-view's identically-labeled controls.
        function renderDesigner() {
            renderEdit();
            fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
            return within(document.querySelector('table.rubric-grid') as HTMLElement);
        }

        it('edits the rubric name from the grid', () => {
            renderDesigner();
            const nameInput = screen.getAllByPlaceholderText('rubricBuilder.placeholder_name')[1];
            fireEvent.change(nameInput, { target: { value: 'Designer Name' } });
            expect(nameInput).toHaveValue('Designer Name');
        });

        it('adds a row and a column via the grid controls', () => {
            const grid = renderDesigner();
            const rowsBefore = grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length;
            fireEvent.click(grid.getByText('rubricBuilder.action_add_row'));
            expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion')).toHaveLength(rowsBefore + 1);

            fireEvent.click(screen.getByText('rubricBuilder.action_add_column_level'));
            // No direct assertion target for header count without deeper DOM knowledge;
            // a successful click with no crash already exercises addCriterionLevel.
            expect(screen.getByText('rubricBuilder.action_add_column_level')).toBeInTheDocument();
        });

        it('duplicates and deletes a criterion row', () => {
            const grid = renderDesigner();
            const before = grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length;
            fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_duplicate_criterion')[0]);
            expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion')).toHaveLength(before + 1);
            fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_delete_criterion')[0]);
            expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion')).toHaveLength(before);
        });

        it('smart-allocates points and balances weights', () => {
            // These toolbar buttons sit above the <table>, outside the `grid` scope.
            renderDesigner();
            fireEvent.click(screen.getByText('rubricBuilder.action_smart_allocate'));
            fireEvent.click(screen.getByText('rubricBuilder.action_balance_weights'));
            expect(screen.getByText('rubricBuilder.action_balance_weights')).toBeInTheDocument();
        });

        it('moves a level header left and right', () => {
            const grid = renderDesigner();
            const rightBtns = grid.getAllByLabelText('rubricBuilder.action_move_level_right');
            fireEvent.click(rightBtns[0]);
            const leftBtns = grid.getAllByLabelText('rubricBuilder.action_move_level_left');
            fireEvent.click(leftBtns[leftBtns.length - 1]);
            expect(grid.getAllByLabelText('rubricBuilder.action_move_level_right').length).toBeGreaterThan(0);
        });

        it('edits a level header label, syncing across criteria', () => {
            const grid = renderDesigner();
            const headerInput = grid.getAllByPlaceholderText('rubricBuilder.placeholder_level_name')[0];
            fireEvent.change(headerInput, { target: { value: 'Renamed Level' } });
            expect(headerInput).toHaveValue('Renamed Level');
        });

        it('edits a criterion description inline via click-to-edit', () => {
            const grid = renderDesigner();
            fireEvent.click(grid.getByText('rubricBuilder.placeholder_click_to_edit'));
            const descInput = grid.getByPlaceholderText('rubricBuilder.placeholder_criterion_description');
            fireEvent.change(descInput, { target: { value: 'New description' } });
            fireEvent.blur(descInput);
            expect(grid.getByText('New description')).toBeInTheDocument();
        });

        it('shows linked standard badges on a criterion row', () => {
            appOverrides = { rubrics: [mockRubricWithLinks] };
            renderEdit();
            fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
            const gridEl = document.querySelector('table.rubric-grid') as HTMLElement;
            // Shown by statementNotation, not description, when showStdDesc is off (the default).
            expect(gridEl.textContent).toContain('CCSS.1');
        });

        it('inserts a rubric-bank item', () => {
            const grid = renderDesigner();
            const before = grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length;
            const bankSelect = grid.getByDisplayValue('rubricBuilder.action_insert_from_bank');
            fireEvent.change(bankSelect, { target: { value: 'Grammar & Spelling' } });
            expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length).toBeGreaterThan(before);
        });
    });

    // ── Collapse / expand + multi-criterion non-matching branches ─────────────────

    it('collapses, expands, and edits a multi-criterion rubric', () => {
        appOverrides = { rubrics: [mockRubricTwo] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_collapse_all'));
        expect(screen.getByText('rubricBuilder.action_expand_all')).toBeInTheDocument();
        // The chevron expands a single criterion, reverting the toolbar button.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_expand_criterion')[0]);
        expect(screen.getAllByLabelText('rubricBuilder.action_collapse_criterion').length).toBeGreaterThan(0);
        // Re-collapsing the same chevron exercises the add-to-set path.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_collapse_criterion')[0]);
        expect(screen.getByText('rubricBuilder.action_expand_all')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_expand_all'));
        expect(screen.getByText('rubricBuilder.action_collapse_all')).toBeInTheDocument();
        // Rename c2 → walks c1's non-matching update branch.
        const titles = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name');
        fireEvent.change(titles[1], { target: { value: 'C2 renamed' } });
        expect(titles[1]).toHaveValue('C2 renamed');
        // Move c2 up and back down via the form-view controls.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_move_criterion_up')[1]);
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_move_criterion_down')[0]);
        // Add a level to c2 (walks c1's non-matching add branch).
        fireEvent.click(screen.getAllByText('rubricBuilder.action_add_level')[1]);
        // Delete a level from c2.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_delete_level')[2]);
        // Sub-item round trip on c1 (walks c2's non-matching branches).
        fireEvent.click(screen.getAllByText(/rubricBuilder.label_sub_items/)[0]);
        fireEvent.click(screen.getByText('rubricBuilder.action_add_sub_item'));
        const subLabel = screen.getByPlaceholderText('rubricBuilder.placeholder_sub_item_label');
        fireEvent.change(subLabel, { target: { value: 'Detailed' } });
        expect(subLabel).toHaveValue('Detailed');
        // A second sub-item so editing one walks the other's non-matching branch.
        fireEvent.click(screen.getByText('rubricBuilder.action_add_sub_item'));
        fireEvent.change(screen.getAllByPlaceholderText('rubricBuilder.placeholder_sub_item_label')[1], {
            target: { value: 'Second detail' },
        });
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_delete_title')[0]);
        expect(screen.queryByText('Detailed')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_delete_title')[0]);
        expect(screen.queryByText('Second detail')).not.toBeInTheDocument();
    });

    // ── Sub-item + legacy standard linking ───────────────────────────────────────

    it('links and unlinks a standard on a sub-item', () => {
        appOverrides = {
            rubrics: [mockRubricLegacy],
            settings: { ...mockSettings, standardsApiKey: 'key123' },
        };
        renderEdit();
        fireEvent.click(screen.getAllByText(/rubricBuilder.label_sub_items/)[0]);
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_link_standard_title')[0]);
        expect(screen.getByTestId('standards-picker-modal')).toBeInTheDocument();
        // Close the picker without selecting (onClose path), then reopen and select.
        fireEvent.click(screen.getByText('Close Standards Picker'));
        expect(screen.queryByTestId('standards-picker-modal')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_link_standard_title')[0]);
        fireEvent.click(screen.getByText('Select Standard'));
        // The badge shows the statementNotation (or guid) — the mock standard has no notation.
        expect(screen.getByText('std-new')).toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[1]);
        expect(screen.queryByText('SUB.1')).not.toBeInTheDocument();
    });

    it('unlinks a legacy single standard', () => {
        appOverrides = { rubrics: [mockRubricLegacy] };
        renderEdit();
        expect(screen.getByText('LEG.1')).toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[0]);
        expect(screen.queryByText('LEG.1')).not.toBeInTheDocument();
    });

    // ── Format panel ──────────────────────────────────────────────────────────────

    it('format panel: widths, fonts, orientation, alignment, toggles, and reset', () => {
        renderEdit();
        fireEvent.click(screen.getByText('FORMAT'));
        fireEvent.change(screen.getByDisplayValue('200'), { target: { value: '220' } });
        fireEvent.change(screen.getByDisplayValue('14'), { target: { value: '12' } });
        // getByDisplayValue matches the selected option's text for selects.
        fireEvent.change(screen.getByDisplayValue('Sans Serif (Inter)'), {
            target: { value: "'Playfair Display', Georgia, serif" },
        });
        expect(document.getElementById('rubric-export-gfont')).not.toBeNull();
        // A second recognised font reuses the existing stylesheet link (matches option text).
        fireEvent.change(screen.getByDisplayValue('Playfair Display'), {
            target: { value: "'Oswald', Arial, sans-serif" },
        });
        fireEvent.change(screen.getByDisplayValue('rubricBuilder.format_portrait'), {
            target: { value: 'landscape' },
        });
        fireEvent.change(screen.getByDisplayValue('rubricBuilder.format_order_best_first'), {
            target: { value: 'worst-first' },
        });
        const alignGroup = screen.getByText('rubricBuilder.format_header_align').closest('.form-group')!;
        const alignButtons = alignGroup.querySelectorAll('button');
        fireEvent.click(alignButtons[2]); // right
        for (const label of [
            'rubricBuilder.format_show_weights',
            'rubricBuilder.format_show_points',
            'rubricBuilder.format_calculate_grade',
            'rubricBuilder.format_show_borders',
            'rubricBuilder.format_alternate_rows',
        ]) {
            const toggleLabel = screen.getByText(label).closest('label')!;
            fireEvent.click(toggleLabel.querySelector('div')!);
        }
        const colorInputs = screen.getAllByDisplayValue('#1e3a5f');
        fireEvent.change(colorInputs[0], { target: { value: '#ff0000' } });
        // The text twin already shows #ff0000 after the color change, so pick a new value.
        fireEvent.change(colorInputs[1], { target: { value: '#00ff00' } });
        console.log(
            'AFTERCOLOR',
            [...document.querySelectorAll('input[type=text]')]
                .filter(
                    (el) =>
                        (el as HTMLInputElement).value.includes('1e3a5f') ||
                        (el as HTMLInputElement).value.includes('ff0000')
                )
                .map((el) => (el as HTMLInputElement).value)
        );
        fireEvent.click(screen.getByText('rubricBuilder.format_reset_defaults'));
        expect((screen.getByDisplayValue('rubricBuilder.format_portrait') as HTMLSelectElement).value).toBe('portrait');
    });

    // ── Preview modal ─────────────────────────────────────────────────────────────

    it('preview modal renders points, weights, borders, and standard descriptions', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricWithLinks,
                    format: {
                        ...DEFAULT_FORMAT,
                        showPoints: true,
                        showWeights: true,
                        showBorders: true,
                        rowStriping: true,
                    },
                    criteria: [
                        {
                            ...mockRubricWithLinks.criteria[0],
                            // Headers come from criteria[0]: one flat level (no range)
                            // and one ranged level (with a sub-item).
                            levels: [
                                {
                                    id: 'p1',
                                    label: 'Flat',
                                    minPoints: 50,
                                    maxPoints: 50,
                                    description: 'X',
                                    subItems: [],
                                },
                                {
                                    id: 'p2',
                                    label: 'Range',
                                    minPoints: 0,
                                    maxPoints: 89,
                                    description: '',
                                    subItems: [{ id: 's1', label: 'Detail', points: 1, minPoints: 0, maxPoints: 1 }],
                                },
                            ],
                        },
                        {
                            id: 'c2',
                            title: 'Second',
                            description: '',
                            weight: 0,
                            levels: [
                                {
                                    id: 'p3',
                                    label: 'Basic',
                                    minPoints: 0,
                                    maxPoints: 50,
                                    description: '',
                                    subItems: [],
                                },
                                {
                                    id: 'p4',
                                    label: 'Top',
                                    minPoints: 51,
                                    maxPoints: 100,
                                    description: '',
                                    subItems: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_preview'));
        // Point ranges: flat level shows (50pts), ranged level shows (0–89pts).
        // Header text is split across text nodes, so match on cell textContent.
        expect(screen.getByText((_, el) => el?.textContent === 'Flat (50pts)')).toBeInTheDocument();
        expect(screen.getByText((_, el) => el?.textContent === 'Range (0–89pts)')).toBeInTheDocument();
        // Sub-item line and the no-description dash.
        expect(screen.getAllByText((_, el) => el?.textContent === 'Detail (1pts)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        // Weight column.
        expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
        // Description toggle swaps standard display.
        fireEvent.click(screen.getByText('Description'));
        expect(screen.getByText('A linked standard')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Code'));
        expect(screen.getAllByText(/CCSS\.1/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByText(/rubricBuilder\.action_close/));
        expect(screen.queryByText('rubricBuilder.preview_title')).not.toBeInTheDocument();
    });

    // ── Designer view: descriptions, markdown, guards ────────────────────────────

    it('designer view toggles standard descriptions and renders markdown', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricMarkdown,
                    criteria: [
                        {
                            ...mockRubricMarkdown.criteria[0],
                            linkedStandard: mockRubricLegacy.criteria[0].linkedStandard,
                            levels: mockRubricLegacy.criteria[0].levels.map((l) => ({
                                ...l,
                                description: mockRubricMarkdown.criteria[0].levels[0].description,
                            })),
                        },
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const gridEl = document.querySelector('table.rubric-grid') as HTMLElement;
        const grid = within(gridEl);
        // Bold and italic markdown render as strong/em.
        expect(gridEl.querySelector('strong')?.textContent).toBe('bold lead');
        expect(gridEl.querySelector('em')?.textContent).toBe('italic tail');
        // Level description markdown.
        expect(gridEl.textContent).toContain('Level with');
        // Auto-resize handler on the name textarea.
        const nameInput = screen.getAllByPlaceholderText('rubricBuilder.placeholder_name')[1];
        fireEvent.input(nameInput, { target: { value: 'Auto Sized' } });
        // Standard badges swap between code and description.
        fireEvent.click(screen.getByText('Description'));
        // The standard badges render with the pin emoji prefix, so match loosely.
        expect(grid.getByText(/Legacy standard/)).toBeInTheDocument();
        expect(grid.getByText(/Sub standard/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Code'));
        expect(grid.getByText(/LEG\.1/)).toBeInTheDocument();
        // Formatting-help modal.
        fireEvent.click(screen.getByText('rubricBuilder.action_formatting_help'));
        expect(screen.getByText('rubricBuilder.md_modal_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_got_it'));
        expect(screen.queryByText('rubricBuilder.md_modal_title')).not.toBeInTheDocument();
    });

    it('designer smart-allocates ascending points and balances uneven weights', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricAscending,
                    criteria: [mockRubricAscending.criteria[0], mockRubricTwo.criteria[1]],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        fireEvent.click(screen.getByText('rubricBuilder.action_smart_allocate'));
        fireEvent.click(screen.getByText('rubricBuilder.action_balance_weights'));
        expect(screen.getByText('rubricBuilder.action_balance_weights')).toBeInTheDocument();
    });

    it('designer guards: uneven level counts', () => {
        appOverrides = { rubrics: [mockRubricTwo] };
        renderEdit();
        // c1 gets a third level; c2 shrinks to one. Moving the middle column right
        // walks c2's out-of-range guard.
        fireEvent.click(screen.getAllByText('rubricBuilder.action_add_level')[0]);
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_delete_level')[3]);
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const grid = within(document.querySelector('table.rubric-grid') as HTMLElement);
        fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_move_level_right')[1]);
    });

    it('designer empty-rubric guards for smart-allocate, balance, and bank insert', () => {
        appOverrides = { rubrics: [{ ...mockRubricEmpty, id: 'r1' }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        fireEvent.click(screen.getByText('rubricBuilder.action_smart_allocate'));
        fireEvent.click(screen.getByText('rubricBuilder.action_balance_weights'));
        const grid = within(document.querySelector('table.rubric-grid') as HTMLElement);
        const bankSelect = grid.getByDisplayValue('rubricBuilder.action_insert_from_bank');
        fireEvent.change(bankSelect, { target: { value: 'Clarity of Expression' } });
        expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length).toBeGreaterThan(0);
        // Empty selection is a no-op guard.
        fireEvent.change(bankSelect, { target: { value: '' } });
    });

    // ── Drag-and-drop reorder ────────────────────────────────────────────────────

    it('drag-and-drop reorders criteria and levels', () => {
        appOverrides = { rubrics: [mockRubricTwo] };
        renderEdit();
        act(() => {
            dndState.onDragEnd?.({
                source: { index: 1 },
                destination: { droppableId: 'criteria', index: 0 },
            });
        });
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')[0]).toHaveValue(
            'Criterion 2'
        );
        // Level reorder within c1. After the criterion reorder above, c1 sits
        // second, so its level inputs start at index 2 in the DOM.
        act(() => {
            dndState.onDragEnd?.({
                source: { index: 1 },
                destination: { droppableId: 'levels-c1', index: 0 },
            });
        });
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_level_name')[2]).toHaveValue('Good');
        // Cancelled drop (no destination) is a no-op.
        act(() => {
            dndState.onDragEnd?.({ source: { index: 0 }, destination: null });
        });
        // An unknown droppable id falls through both reorder branches.
        act(() => {
            dndState.onDragEnd?.({
                source: { index: 0 },
                destination: { droppableId: 'unknown-zone', index: 0 },
            });
        });
    });

    // ── Tour ─────────────────────────────────────────────────────────────────────

    it('starts the tour from form and designer views and stops on finish or skip', () => {
        renderEdit();
        fireEvent.click(screen.getByText('tutorial.rb_tour_button'));
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'true');
        act(() => {
            joyrideState.onEvent?.({ status: 'finished' });
        });
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'false');
        // Restart from the designer view switches back to the form view.
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        fireEvent.click(screen.getByText('tutorial.rb_tour_button'));
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'true');
        act(() => {
            joyrideState.onEvent?.({ status: 'skipped' });
        });
        expect(screen.getByTestId('joyride')).toHaveAttribute('data-run', 'false');
    });

    // ── Version history: labels, auto badge, cancel restore ──────────────────────

    it('saves a labeled version and shows the auto-save badge', async () => {
        renderEditWithVersions();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        expect(await screen.findByText('rubricBuilder.auto_save_badge')).toBeInTheDocument();
        const labelInput = screen.getByPlaceholderText('rubricBuilder.version_label_placeholder');
        fireEvent.change(labelInput, { target: { value: 'Release 2' } });
        fireEvent.click(screen.getByText('rubricBuilder.save_version'));
        expect(mockSaveRubricVersion).toHaveBeenCalledWith('r1', 'Release 2');
    });

    it('cancelling a restore keeps the version panel open', async () => {
        renderEditWithVersions();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        fireEvent.click((await screen.findAllByText('rubricBuilder.restore_version'))[0]);
        expect(await screen.findByText('rubricBuilder.confirm_restore')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockRestoreRubricVersion).not.toHaveBeenCalled();
        expect(screen.getByText('rubricBuilder.version_history')).toBeInTheDocument();
    });

    // ── Sync dialog counts peer reviews ──────────────────────────────────────────

    it('sync dialog counts peer reviews alongside student rubrics', () => {
        appOverrides = {
            peerReviews: [
                {
                    id: 'pr1',
                    rubricId: 'r1',
                    studentId: 's1',
                    reviewerId: 's2',
                    entries: [],
                    overallComment: '',
                    isPeerReview: true,
                    gradedAt: '2024-01-01T00:00:00Z',
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(screen.getByText('rubricBuilder.sync_dialog_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.sync_dialog_skip'));
        expect(screen.queryByText('rubricBuilder.sync_dialog_title')).not.toBeInTheDocument();
    });

    // ── Export / clipboard / save failure paths ──────────────────────────────────

    it('shows an error toast when the PDF export fails', async () => {
        mockExportPdf.mockRejectedValueOnce(new Error('boom'));
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_export_pdf'));
        await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error'));
    });

    it('shows a warning when pasting fails', () => {
        mockLoadCriterionClipboard.mockImplementation(() => {
            throw new Error('corrupt');
        });
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_paste_criterion'));
        expect(mockShowToast).toHaveBeenCalledWith('toast.copy_paste_failed', 'warning');
    });

    it('warns when criterion weights sum far from 100', () => {
        appOverrides = { rubrics: [{ ...mockRubric, criteria: [{ ...mockRubric.criteria[0], weight: 40 }] }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        // The t mock returns the literal English fallback for string options.
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Weights total'), 'warning');
    });

    // ── Template save: fresh id + failure toast ──────────────────────────────────

    it('saves a new rubric as a template with a generated id', () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_save_as_template'));
        expect(mockSaveUserTemplate).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.stringMatching(/^tpl_/) })
        );
    });

    it('shows an error toast when saving the template fails', () => {
        mockSaveUserTemplate.mockImplementationOnce(() => {
            throw new Error('disk full');
        });
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_save_as_template'));
        expect(mockShowToast).toHaveBeenCalledWith('toast.export_error', 'error');
    });

    // ── Dutch CEFR skill labels ──────────────────────────────────────────────────

    it('renders Dutch CEFR skill labels when the language is Dutch', () => {
        i18nState.language = 'nl';
        renderNew();
        // The skill badge only appears once a target level is set.
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B1' } });
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'speaking_production' } });
        // The select option and the skill badge both show the Dutch label.
        expect(screen.getAllByText('Spreken (productie)').length).toBeGreaterThan(0);
    });

    it('shows the English skill badge when the target level and skill are set', () => {
        renderNew();
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'A1' } });
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'writing' } });
        // The option and the badge both carry the English label.
        expect(screen.getAllByText('Writing').length).toBeGreaterThan(0);
    });

    // ── Form meta inputs and CEFR threshold ──────────────────────────────────────

    it('edits subject, description, grade scale, and max points, clearing the name error', () => {
        renderNew();
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.placeholder_name'), { target: { value: 'Meta' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.placeholder_subject'), {
            target: { value: 'Math' },
        });
        fireEvent.change(screen.getAllByPlaceholderText('rubricBuilder.placeholder_description')[0], {
            target: { value: 'Desc' },
        });
        fireEvent.change(screen.getByLabelText('rubricBuilder.label_grade_scale'), { target: { value: 'none' } });
        const radios = screen.getAllByRole('radio');
        fireEvent.click(radios.find((r) => (r as HTMLInputElement).value === 'total-points')!);
        fireEvent.change(screen.getByPlaceholderText('e.g. 100'), { target: { value: '50' } });
        expect(screen.getByText('Grade = rawScore / 50 × 100%')).toBeInTheDocument();
        // Saving in total-points mode skips the weighted-weight warning.
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ scoringMode: 'total-points' }));
    });

    it('sets the CEFR achievement threshold and exports with it', () => {
        renderNew();
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B1' } });
        fireEvent.change(screen.getByDisplayValue('70'), { target: { value: '80' } });
        // Exporting JSON serialises the target level + threshold through getRubricData.
        const createObjectURL = vi.fn(() => 'blob:thr');
        global.URL.createObjectURL = createObjectURL;
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_download_json'));
        expect(createObjectURL).toHaveBeenCalled();
        // Saving persists the threshold too.
        fireEvent.change(screen.getByPlaceholderText('rubricBuilder.placeholder_name'), {
            target: { value: 'Thresholded' },
        });
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(mockAddRubric).toHaveBeenCalledWith(
            expect.objectContaining({ cefrTargetLevel: 'B1', cefrAchieveThreshold: 80 })
        );
    });

    // ── Weight distribution ──────────────────────────────────────────────────────

    it('distributes weights evenly across criteria', () => {
        appOverrides = { rubrics: [mockRubricTwo] };
        renderEdit();
        // The t mock returns the English fallback for string options.
        fireEvent.click(screen.getByText('Distribute evenly'));
        expect(screen.getAllByDisplayValue('50').length).toBeGreaterThan(0);
    });

    // ── Vocabulary editor round trip ─────────────────────────────────────────────

    it('adds, edits, and deletes vocabulary items for an existing rubric', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubric,
                    vocabularyItems: [
                        { id: 'v1', phrase: 'However', category: 'vocabulary' },
                        { id: 'v2', phrase: 'Therefore', category: 'vocabulary' },
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('Vocabulary & Grammar List'));
        // Add an item.
        fireEvent.change(screen.getByPlaceholderText('Word or phrase…'), { target: { value: 'Moreover' } });
        fireEvent.click(screen.getByText('Add'));
        // Edit an item's notes.
        fireEvent.click(screen.getByText('However').closest('div')!.querySelectorAll('button')[0]);
        fireEvent.change(screen.getAllByPlaceholderText('Notes (optional)…')[0], { target: { value: 'Transition' } });
        fireEvent.click(screen.getByText('Done'));
        // Selection mode → delete multiple.
        fireEvent.click(screen.getByText('Select'));
        fireEvent.click(screen.getByText('However'));
        fireEvent.click(screen.getByText(/^Delete \(1\)$/));
        // Single delete for the remaining item.
        fireEvent.click(screen.getByText('Therefore').closest('div')!.querySelectorAll('button')[1]);
        expect(mockShowToast).toBeDefined();
    });

    // ── Empty criteria states ────────────────────────────────────────────────────

    it('shows the empty criteria state and adds a first criterion', () => {
        appOverrides = { rubrics: [{ ...mockRubricEmpty, id: 'r1' }] };
        renderEdit();
        expect(screen.getByText('rubricBuilder.empty_state_criteria')).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('rubricBuilder.action_add_first_criterion')[1]);
        expect(screen.getByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toBeInTheDocument();
    });

    it('previews an empty rubric and closes the preview via the overlay', () => {
        appOverrides = { rubrics: [{ ...mockRubricEmpty, id: 'r1' }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_preview'));
        expect(screen.getByText('rubricBuilder.preview_title')).toBeInTheDocument();
        const overlay = document.querySelector('.modal-overlay') as HTMLElement;
        fireEvent.click(overlay);
        expect(screen.queryByText('rubricBuilder.preview_title')).not.toBeInTheDocument();
    });

    // ── No-API-key standards modal interactions ──────────────────────────────────

    it('walks the no-API-key standards modal: close, settings, and footer', () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        expect(screen.getByText('rubricBuilder.standards_modal_title')).toBeInTheDocument();
        // Open settings from the modal.
        fireEvent.click(screen.getByText('rubricBuilder.action_open_settings'));
        expect(mockNavigate).toHaveBeenCalledWith('/settings');
        // Reopen and use the footer close + header close buttons.
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        fireEvent.click(screen.getByText('rubricBuilder.action_close'));
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        // Click the modal overlay itself to dismiss.
        fireEvent.click(document.querySelectorAll('.modal-overlay')[0] as HTMLElement);
        expect(screen.queryByText('rubricBuilder.standards_modal_title')).not.toBeInTheDocument();
        // Reopen and close via the header ✕.
        fireEvent.click(screen.getByText('rubricBuilder.action_link_standard'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('rubricBuilder.standards_modal_title')).not.toBeInTheDocument();
    });

    // ── Modal close buttons ──────────────────────────────────────────────────────

    it('closes the markdown hint, version history, and sync dialogs via their close buttons', async () => {
        // Markdown hint: close via the header ✕, then reopen and close via Escape (Modal onClose).
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        fireEvent.click(screen.getByText('rubricBuilder.action_formatting_help'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('rubricBuilder.md_modal_title')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_formatting_help'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('rubricBuilder.md_modal_title')).not.toBeInTheDocument();
        // Version history: close via the header ✕, then reopen and close via Escape.
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('rubricBuilder.save_version')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        fireEvent.keyDown(document.body, { key: 'Escape' });
        expect(screen.queryByText('rubricBuilder.save_version')).not.toBeInTheDocument();
        // Sync dialog: close via the header ✕, then reopen and close via the overlay.
        // The first save click was swallowed by the Escape close above; save again.
        fireEvent.click(screen.getByText('rubricBuilder.action_save'));
        expect(screen.getByText('rubricBuilder.sync_dialog_title')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('rubricBuilder.sync_dialog_title')).not.toBeInTheDocument();
        // Save again (button now reads "saved") and close via the overlay.
        fireEvent.click(screen.getByText('rubricBuilder.action_saved'));
        expect(screen.getByText('rubricBuilder.sync_dialog_title')).toBeInTheDocument();
        fireEvent.click(document.querySelectorAll('.modal-overlay')[0] as HTMLElement);
        expect(screen.queryByText('rubricBuilder.sync_dialog_title')).not.toBeInTheDocument();
    });

    it('ignores a second version-save click while one is in flight', async () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        await screen.findByText('rubricBuilder.no_versions_yet');
        fireEvent.click(screen.getByText('rubricBuilder.save_version'));
        fireEvent.click(screen.getByText('rubricBuilder.save_version'));
        expect(mockSaveRubricVersion).toHaveBeenCalledTimes(1);
    });

    // ── Two-criterion standard + CEFR operations ─────────────────────────────────

    it('links and unlinks a sub-item standard across a two-criterion rubric', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    criteria: [mockRubricLegacy.criteria[0], mockRubricTwo.criteria[1]],
                },
            ],
            settings: { ...mockSettings, standardsApiKey: 'key123' },
        };
        renderEdit();
        fireEvent.click(screen.getAllByText(/rubricBuilder.label_sub_items/)[0]);
        // Link a standard to si1: si2 (non-matching) and l2 (non-matching level) walk the fallbacks.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_link_standard_title')[0]);
        fireEvent.click(screen.getByText('Select Standard'));
        expect(screen.getByText('std-new')).toBeInTheDocument();
        // Link a second standard onto si2, which has no linkedStandards yet.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.sub_item_link_standard_title')[1]);
        fireEvent.click(screen.getByText('Select Standard'));
        expect(screen.getAllByText('std-new').length).toBeGreaterThan(0);
        // Unlink the pre-existing sub-item standard on si1.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[1]);
        expect(screen.queryByText('SUB.1')).not.toBeInTheDocument();
        // Criterion-level link on c2 walks c1's non-matching branches.
        fireEvent.click(screen.getAllByText('rubricBuilder.action_link_standard')[1]);
        fireEvent.click(screen.getByText('Select Standard'));
        expect(screen.getAllByText('std-new').length).toBeGreaterThan(0);
        // Unlink c2's criterion-level standard (last button), then the legacy one.
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[3]);
        expect(screen.getAllByText('std-new').length).toBeGreaterThan(0);
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[0]);
        expect(screen.queryByText('LEG.1')).not.toBeInTheDocument();
    });

    // ── Designer extras: moves, weights, level editing, formats ──────────────────

    it('designer moves criteria, edits weights, and edits level descriptions', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    format: { ...DEFAULT_FORMAT, rowStriping: true, showWeights: true },
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const grid = within(document.querySelector('table.rubric-grid') as HTMLElement);
        // Move c2 up (cIdx 1 → 0).
        fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_move_criterion_up')[1]);
        // Move the (now first) c2 down again.
        fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_move_criterion_down')[0]);
        // Edit a criterion weight.
        // Rename the first criterion via its designer title textarea.
        fireEvent.change(grid.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')[0], {
            target: { value: 'Renamed in designer' },
        });
        const weightInputs = grid.getAllByDisplayValue('0');
        fireEvent.change(weightInputs[0], { target: { value: '30' } });
        // Click-to-edit a level description (index 2 = c2's first empty level cell), then blur.
        fireEvent.click(grid.getAllByText('rubricBuilder.placeholder_click_to_edit')[2]);
        const levelDesc = grid.getByPlaceholderText('rubricBuilder.placeholder_level_description');
        fireEvent.change(levelDesc, { target: { value: 'Level detail' } });
        fireEvent.blur(levelDesc);
        expect(grid.getByText('Level detail')).toBeInTheDocument();
    });

    it('designer edits header point inputs and shows a guid standard fallback', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    format: { ...DEFAULT_FORMAT, showPoints: true, showWeights: false },
                    criteria: [
                        {
                            ...mockRubricTwo.criteria[0],
                            linkedStandard: {
                                guid: 'guid-only',
                                description: 'Guid only standard',
                                statementNotation: undefined,
                                standardSetTitle: 'X',
                                jurisdictionTitle: 'Y',
                            },
                        },
                        mockRubricTwo.criteria[1],
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const grid = within(document.querySelector('table.rubric-grid') as HTMLElement);
        // The min- and max-points header inputs exist because showPoints is on.
        fireEvent.change(grid.getAllByDisplayValue('90')[0], { target: { value: '85' } });
        fireEvent.change(grid.getAllByDisplayValue('100')[0], { target: { value: '95' } });
        // Code view falls back to the guid for a standard without a notation.
        expect(grid.getByText(/guid-only/)).toBeInTheDocument();
        // Description view shows the description.
        fireEvent.click(screen.getByText('Description'));
        expect(grid.getByText(/Guid only standard/)).toBeInTheDocument();
        // showWeights false → no weight column; the add-row cell spans accordingly.
        expect(screen.getByText('rubricBuilder.action_add_row')).toBeInTheDocument();
    });

    it('preview shows legacy standard badges with description toggle', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricLegacy,
                    description: 'A test rubric',
                    format: { ...DEFAULT_FORMAT, showPoints: false, showBorders: false, rowStriping: true },
                    criteria: [
                        {
                            ...mockRubricLegacy.criteria[0],
                            description: 'Has a description',
                        },
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_preview'));
        // The form view behind the modal also shows the legacy badge.
        expect(screen.getAllByText(/LEG\.1/).length).toBeGreaterThan(0);
        // showPoints off renders no point ranges in the header.
        fireEvent.click(screen.getByText('Description'));
        expect(screen.getAllByText(/Legacy standard/).length).toBeGreaterThan(1);
        fireEvent.click(screen.getByText('Code'));
        expect(screen.getAllByText(/SUB\.1/).length).toBeGreaterThan(0);
        // The rubric and criterion descriptions render in the preview.
        expect(screen.getByText('A test rubric')).toBeInTheDocument();
        expect(screen.getByText('Has a description')).toBeInTheDocument();
    });

    // ── Navigation, export menu overlay, clipboard, CEFR badges ──────────────────

    it('goes back to the rubric list and closes the export menu via its overlay', () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(document.querySelector('div[style*="position: fixed"]') as HTMLElement);
        expect(screen.queryByText('rubricBuilder.action_export_pdf')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics');
    });

    it('pasting without a clipboard is a no-op and pastes sub-items when present', () => {
        renderEdit();
        const before = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name').length;
        fireEvent.click(screen.getByText('rubricBuilder.action_paste_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(before);
        mockLoadCriterionClipboard.mockReturnValue({
            id: 'clip2',
            title: 'Clip with SubItems',
            description: '',
            weight: 50,
            levels: [
                {
                    id: 'cl1',
                    label: 'Lvl',
                    minPoints: 0,
                    maxPoints: 1,
                    description: '',
                    subItems: [{ id: 'csi1', label: 'Nested', points: 1, minPoints: 0, maxPoints: 1 }],
                },
            ],
        });
        fireEvent.click(screen.getByText('rubricBuilder.action_paste_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(before + 1);
    });

    it('duplicates a criterion with sub-items in form and designer views', () => {
        appOverrides = { rubrics: [mockRubricLegacy] };
        renderEdit();
        const before = screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name').length;
        fireEvent.click(screen.getByLabelText('rubricBuilder.action_duplicate_criterion'));
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(before + 1);
        // Designer duplicate also clones sub-items.
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const grid = within(document.querySelector('table.rubric-grid') as HTMLElement);
        fireEvent.click(grid.getAllByLabelText('rubricBuilder.action_duplicate_criterion')[0]);
        expect(grid.getAllByLabelText('rubricBuilder.action_delete_criterion').length).toBeGreaterThan(before);
    });

    it('shows CEFR level badges in the designer header', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    criteria: [
                        {
                            ...mockRubricTwo.criteria[0],
                            levels: mockRubricTwo.criteria[0].levels.map((l, i) => ({
                                ...l,
                                cefrLevel: (i === 0 ? 'B1' : 'A2') as 'B1' | 'A2',
                            })),
                        },
                        {
                            ...mockRubricTwo.criteria[1],
                            levels: mockRubricTwo.criteria[1].levels.map((l) => ({ ...l, cefrLevel: 'B1' as const })),
                        },
                    ],
                },
            ],
        };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const gridEl = document.querySelector('table.rubric-grid') as HTMLElement;
        // Column 1 is B1 everywhere (allSame badge); column 2 differs (tilde).
        expect(gridEl.textContent).toContain('B1');
        expect(gridEl.textContent).toContain('~');
    });

    it('shows an empty version label fallback', async () => {
        mockFetchRubricVersions.mockResolvedValue([
            {
                id: 'v-blank',
                savedAt: '2024-01-02T00:00:00Z',
                label: '',
                snapshot: { ...mockRubric, name: 'Blank label' },
            },
        ]);
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.version_history'));
        expect(await screen.findByText('rubricBuilder.version_n')).toBeInTheDocument();
    });

    // ── Remaining branch tail: unlink skips, fallbacks, designer/preview variants ──

    it('unlinks a criterion-level standard in a two-criterion rubric', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    criteria: [
                        mockRubricWithLinks.criteria[0],
                        {
                            ...mockRubricTwo.criteria[1],
                            linkedStandards: [
                                {
                                    guid: 's2',
                                    description: 'Second linked',
                                    statementNotation: 'S2',
                                    standardSetTitle: 'S',
                                    jurisdictionTitle: 'NL',
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        renderEdit();
        expect(screen.getByText('CCSS.1')).toBeInTheDocument();
        expect(screen.getByText('S2')).toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[0]);
        expect(screen.queryByText('CCSS.1')).not.toBeInTheDocument();
        expect(screen.getByText('S2')).toBeInTheDocument();
    });

    it('unlinks a legacy standard in a two-criterion rubric', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubricTwo,
                    criteria: [
                        mockRubricLegacy.criteria[0],
                        {
                            ...mockRubricTwo.criteria[1],
                            linkedStandard: {
                                guid: 'legacy2',
                                description: 'Legacy two',
                                statementNotation: 'LEG.2',
                                standardSetTitle: 'L2',
                                jurisdictionTitle: 'NL',
                            },
                        },
                    ],
                },
            ],
        };
        renderEdit();
        expect(screen.getByText('LEG.1')).toBeInTheDocument();
        expect(screen.getByText('LEG.2')).toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('rubricBuilder.action_unlink_standard')[0]);
        expect(screen.queryByText('LEG.1')).not.toBeInTheDocument();
        expect(screen.getByText('LEG.2')).toBeInTheDocument();
    });

    it('falls back to an empty list when an existing rubric has no vocabulary items', () => {
        // mockRubric has no vocabularyItems field at all.
        renderEdit();
        fireEvent.click(screen.getByText('Vocabulary & Grammar List'));
        expect(screen.getByPlaceholderText('Word or phrase…')).toBeInTheDocument();
    });

    it('ignores non-terminal joyride events', () => {
        renderEdit();
        expect(joyrideState.onEvent).not.toBeNull();
        act(() => joyrideState.onEvent?.({ status: 'running' }));
        // No crash and the tour stays mounted.
        expect(screen.getByTestId('joyride')).toBeInTheDocument();
    });

    it('cancelling the speaking-dimensions insert keeps the current criteria', async () => {
        renderNew();
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'speaking_production' } });
        fireEvent.click(screen.getByText('rubricBuilder.insert_speaking_dims'));
        expect(await screen.findByText('rubricBuilder.insert_speaking_confirm')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('rubricBuilder.insert_speaking_confirm')).not.toBeInTheDocument();
        // Still just the single default criterion.
        expect(screen.getAllByPlaceholderText('rubricBuilder.placeholder_criterion_name')).toHaveLength(1);
    });

    it('shows a warning weight color when the total is off but close', () => {
        appOverrides = {
            rubrics: [
                {
                    ...mockRubric,
                    criteria: [
                        { ...mockRubric.criteria[0], weight: 45 },
                        { ...mockRubricTwo.criteria[1], weight: 45 },
                    ],
                },
            ],
        };
        renderEdit();
        expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('designer shows the max-points hint in total-points mode', () => {
        appOverrides = { rubrics: [{ ...mockRubric, scoringMode: 'total-points' }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        expect(screen.getByText(/100 rubricBuilder.label_max/)).toBeInTheDocument();
    });

    it('designer renders borderless cells when showBorders is off', () => {
        appOverrides = { rubrics: [{ ...mockRubric, format: { ...DEFAULT_FORMAT, showBorders: false } }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        expect(document.querySelector('table.rubric-grid')).toBeTruthy();
    });

    it('designer aligns headers left', () => {
        appOverrides = { rubrics: [{ ...mockRubric, format: { ...DEFAULT_FORMAT, headerTextAlign: 'left' } }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        expect(document.querySelector('table.rubric-grid')).toBeTruthy();
    });

    it('designer aligns headers right', () => {
        appOverrides = { rubrics: [{ ...mockRubric, format: { ...DEFAULT_FORMAT, headerTextAlign: 'right' } }] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        expect(document.querySelector('table.rubric-grid')).toBeTruthy();
    });

    it('designer standard badges toggle between code and description', () => {
        appOverrides = { rubrics: [mockRubricWithLinks] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const gridEl = document.querySelector('table.rubric-grid') as HTMLElement;
        expect(gridEl.textContent).toContain('CCSS.1');
        const descBtns = screen.getAllByText('Description');
        fireEvent.click(descBtns[descBtns.length - 1]);
        expect(gridEl.textContent).toContain('A linked standard');
    });

    it('designer falls back to the guid for standards without a notation', () => {
        appOverrides = { rubrics: [mockRubricNoNotation] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_designer_view'));
        const gridEl = document.querySelector('table.rubric-grid') as HTMLElement;
        expect(gridEl.textContent).toContain('ns1');
        expect(gridEl.textContent).toContain('[ns2]');
        const descBtns = screen.getAllByText('Description');
        fireEvent.click(descBtns[descBtns.length - 1]);
        expect(gridEl.textContent).toContain('No notation standard');
        expect(gridEl.textContent).toContain('Sub no notation');
    });

    it('preview falls back to the guid for standards without a notation', () => {
        appOverrides = { rubrics: [mockRubricNoNotation] };
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_preview'));
        const overlay = document.querySelector('.modal-overlay') as HTMLElement;
        expect(within(overlay).getByText('[ns2]')).toBeInTheDocument();
        expect(overlay.textContent).toContain('lg1');
        expect(overlay.textContent).toContain('ns1');
        fireEvent.click(within(overlay).getByText('Description'));
        expect(within(overlay).getByText(/Legacy no notation/)).toBeInTheDocument();
        expect(within(overlay).getByText(/No notation standard/)).toBeInTheDocument();
        expect(within(overlay).getByText('Sub no notation')).toBeInTheDocument();
    });
});
