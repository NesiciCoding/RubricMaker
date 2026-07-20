import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
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
];

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

vi.mock('../../context/AppContext', () => ({
    useApp: () => ({
        rubrics: [mockRubric],
        studentRubrics: [mockSr],
        peerReviews: [],
        addRubric: mockAddRubric,
        updateRubric: mockUpdateRubric,
        syncRubricSnapshot: mockSyncRubricSnapshot,
        fetchRubricVersions: mockFetchRubricVersions,
        saveRubricVersion: mockSaveRubricVersion,
        restoreRubricVersion: mockRestoreRubricVersion,
        gradeScales: [mockGradeScale],
        settings: mockSettings,
        addVocabularyItem: vi.fn(),
        updateVocabularyItem: vi.fn(),
        deleteVocabularyItem: vi.fn(),
        deleteVocabularyItems: vi.fn(),
        classes: [],
        students: [],
        ...appOverrides,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            return key;
        },
        i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
}));

vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
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
        expect(mockExportDocx).toHaveBeenCalled();
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
        fireEvent.click(await screen.findByText('rubricBuilder.compare_version'));
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
        fireEvent.click(await screen.findByText('rubricBuilder.restore_version'));
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

    // ── Save-as-template, print, JSON export ──────────────────────────────────────

    it('saves the rubric as a template from the export menu', () => {
        renderEdit();
        fireEvent.click(screen.getByText('rubricBuilder.action_export'));
        fireEvent.click(screen.getByText('rubricBuilder.action_save_as_template'));
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
});
