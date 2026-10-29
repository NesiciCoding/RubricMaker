import React from 'react';
import { screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Rubric, Student, StudentRubric } from '../../types';
import { encodeRubricShareCode } from '../../utils/rubricImport';

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'A test rubric',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    displayOrder: 0,
};

const mockRubric2: Rubric = {
    ...mockRubric,
    id: 'r2',
    name: 'Math Rubric',
    subject: 'Math',
    displayOrder: 1,
};

const mockRubric3: Rubric = {
    ...mockRubric,
    id: 'r3',
    name: 'Speaking Rubric',
    subject: 'Speaking',
    cefrTargetLevel: 'B1',
    cefrSkill: 'speaking_production',
    displayOrder: 2,
};

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const mockClass1: Class = { id: 'c1', name: 'Class A', year: 'jaar-2', voTrack: 'havo' };
const mockClass2: Class = { id: 'c2', name: 'Class B' };
const mockStudent1: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c2' };
const mockStudentRubric: StudentRubric = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    entries: [{ criterionId: 'c1', levelId: null, checkedSubItems: [], comment: '' }],
    overallComment: '',
    isPeerReview: false,
};

const mockAddRubric = vi.fn((_r: Rubric) => ({ ...mockRubric, id: 'new-r' }));
const mockAddFolder = vi.fn((f: { name: string; kind: string; parentId?: string }) => ({
    id: 'new-folder',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...f,
}));
const mockUpdateFolder = vi.fn();
const mockDeleteFolder = vi.fn();
const mockFolders = [
    { id: 'year1', name: 'Year 1', kind: 'rubric' as const, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'year2', name: 'Year 2', kind: 'rubric' as const, createdAt: '2026-01-02T00:00:00.000Z' },
    {
        id: 'essays',
        name: 'Essays',
        kind: 'rubric' as const,
        parentId: 'year1',
        createdAt: '2026-01-03T00:00:00.000Z',
    },
];
const mockUpdateRubric = vi.fn();
const mockDeleteRubric = vi.fn();
const mockCreateGroupStudentRubrics = vi.fn(() => [{ studentId: 's1' }]);
const mockNavigate = vi.fn();

const mockDbStatus = vi.hoisted(() => ({ isConnected: false }));
const mockFetchRubricShares = vi.fn().mockResolvedValue([]);
const mockShareRubricWithEmail = vi.fn();
const mockUnshareRubric = vi.fn();
const mockFetchSharedRubrics = vi.fn().mockResolvedValue([]);
const mockFetchSchoolSharedRubrics = vi.fn().mockResolvedValue([]);
const dndOnDragEnd = vi.hoisted(() => ({ handler: null as unknown as (r: unknown) => void }));
const dndOnBeforeCapture = vi.hoisted(() => ({ handler: null as unknown as () => void }));

const mockRubricsArr = [mockRubric, mockRubric2, mockRubric3];
const mockStudentsArr = [mockStudent1, mockStudent2];
const mockClassesArr = [mockClass1, mockClass2];
const mockStudentRubricsArr = [mockStudentRubric];

const mockAppValue = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    settings: mockSettings,
    addRubric: mockAddRubric,
    updateRubric: mockUpdateRubric,
    deleteRubric: mockDeleteRubric,
    createGroupStudentRubrics: mockCreateGroupStudentRubrics,
    userTemplates: [],
    folders: mockFolders,
    addFolder: mockAddFolder,
    updateFolder: mockUpdateFolder,
    deleteFolder: mockDeleteFolder,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
    useRoster: () => mockAppValue,
    useStudents: () => mockAppValue,
    useClasses: () => mockAppValue,
    useGrading: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: mockDbStatus.isConnected }),
}));

vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchRubricShares: (...args: unknown[]) => mockFetchRubricShares(...args),
            shareRubricWithEmail: (...args: unknown[]) => mockShareRubricWithEmail(...args),
            unshareRubric: (...args: unknown[]) => mockUnshareRubric(...args),
            fetchSharedRubrics: (...args: unknown[]) => mockFetchSharedRubrics(...args),
            fetchSchoolSharedRubrics: (...args: unknown[]) => mockFetchSchoolSharedRubrics(...args),
        },
    },
}));

vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({
        children,
        onBeforeCapture,
        onDragEnd,
    }: {
        children: React.ReactNode;
        onBeforeCapture: () => void;
        onDragEnd: (r: unknown) => void;
    }) => {
        dndOnDragEnd.handler = onDragEnd;
        dndOnBeforeCapture.handler = onBeforeCapture;
        return React.createElement(React.Fragment, null, children);
    },
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
    Draggable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
        children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }),
}));

vi.mock('../../components/Rubric/ImportRubricModal', () => ({
    default: ({ onClose, onImport }: { onClose: () => void; onImport: (r: unknown) => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'import-modal' },
            React.createElement('button', { onClick: onClose }, 'Close Import'),
            React.createElement(
                'button',
                { onClick: () => onImport({ name: '', subject: '', description: '', criteria: [] }) },
                'Do Import Empty'
            )
        ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let RubricListComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<RubricListComp />);
}

function cardOf(name: string): HTMLElement {
    return screen.getByText(name).closest('.card') as HTMLElement;
}

async function clickConfirm(action: 'delete' | 'cancel') {
    await act(async () => {
        fireEvent.click(screen.getByText(action === 'delete' ? 'common.delete' : 'common.cancel'));
    });
}

describe('RubricList coverage', () => {
    beforeEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        mockDbStatus.isConnected = false;
        mockSettings.activeClassId = 'c1';
        mockFetchRubricShares.mockResolvedValue([]);
        mockFetchSharedRubrics.mockResolvedValue([]);
        mockFetchSchoolSharedRubrics.mockResolvedValue([]);
        mockAddRubric.mockReturnValue({ ...mockRubric, id: 'new-r' });
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
        const mod = await import('../RubricList');
        RubricListComp = mod.default;
    });

    it('creates a rubric from the empty-state button via the chooser', () => {
        const orig = mockAppValue.rubrics;
        (mockAppValue as Record<string, unknown>).rubrics = [];
        renderPage();
        fireEvent.click(screen.getByText('rubricList.create_rubric'));
        fireEvent.click(screen.getByText('rubricList.chooser_blank_title'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new');
        (mockAppValue as Record<string, unknown>).rubrics = orig;
    });

    it('covers the list-view actions: edit, grade students, compare, duplicate, delete', async () => {
        const { unmount } = renderPage();
        fireEvent.click(screen.getByText('common.view_list'));
        const rows = screen.getAllByRole('row');
        // Edit button navigates without triggering the row click.
        fireEvent.click(within_row(rows[1], 'rubricList.action_edit'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
        fireEvent.click(within_row(rows[1], 'rubricList.grade_students'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
        fireEvent.click(within_row(rows[1], 'rubricList.action_compare'));
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/c1/r1');
        fireEvent.click(within_row(rows[1], 'rubricList.action_duplicate'));
        expect(mockAddRubric).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'rubricList.copy_name:{"name":"Essay Rubric"}' })
        );
        // Delete + confirm removes the rubric.
        fireEvent.click(within_row(rows[1], 'rubricList.action_delete'));
        await clickConfirm('delete');
        unmount();
        expect(mockDeleteRubric).toHaveBeenCalledWith('r1');
    });

    it('cancels a list-view delete and compares with no active class', async () => {
        renderPage();
        fireEvent.click(screen.getByText('common.view_list'));
        const rows = screen.getAllByRole('row');
        fireEvent.click(within_row(rows[1], 'rubricList.action_delete'));
        await clickConfirm('cancel');
        expect(mockDeleteRubric).not.toHaveBeenCalled();

        delete mockSettings.activeClassId;
        fireEvent.click(within_row(rows[1], 'rubricList.action_compare'));
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/all/r1');
    });

    it('covers card hover, dev preview link, and the card action buttons', () => {
        renderPage();
        const card = cardOf('Essay Rubric');
        fireEvent.mouseEnter(card);
        expect(card.style.borderColor).toBe('var(--accent)');
        fireEvent.mouseLeave(card);
        expect(card.style.borderColor).toBe('var(--border)');

        // DEV preview anchor (vitest runs with import.meta.env.DEV === true).
        const devLink = screen.getAllByTitle('rubricList.dev_open_preview')[0];
        fireEvent.click(devLink);

        fireEvent.click(screen.getAllByText('rubricList.edit_rubric')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1');
        fireEvent.click(screen.getAllByText('rubricList.grade_students')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/students');
        fireEvent.click(screen.getAllByTitle('Start Comparative Grading')[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/c1/r1');

        delete mockSettings.activeClassId;
        cleanup();
        renderPage();
        fireEvent.click(screen.getAllByTitle("You'll choose a class on the next screen")[0]);
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/all/r1');
    });

    it('cancels a card delete and renders the CEFR badge', async () => {
        renderPage();
        expect(screen.getByText('Speaking Rubric')).toBeInTheDocument();
        // CEFR badge renders on the B1 rubric card.
        expect(screen.getAllByText('B1').length).toBeGreaterThan(0);

        fireEvent.click(screen.getAllByTitle('rubricList.action_delete')[0]);
        await clickConfirm('cancel');
        expect(mockDeleteRubric).not.toHaveBeenCalled();
    });

    it('hides the speaking launcher when there are no students and resets the select', () => {
        renderPage();
        const selects = screen.getAllByLabelText('rubricList.speaking_select_student');
        // The student options are rendered lazily on first interaction (#670), so open the
        // control before picking a value — matching how a real click/keyboard open behaves.
        fireEvent.mouseDown(selects[0]);
        fireEvent.change(selects[0], { target: { value: 's1' } });
        expect(mockNavigate).toHaveBeenCalledWith('/speaking/r1/s1');
        // Clearing the selection back to the disabled placeholder does not navigate.
        fireEvent.change(selects[0], { target: { value: '' } });
        expect(mockNavigate).toHaveBeenCalledTimes(1);

        const saved = mockStudentsArr.slice();
        mockStudentsArr.length = 0;
        cleanup();
        renderPage();
        expect(screen.queryByLabelText('rubricList.speaking_select_student')).not.toBeInTheDocument();
        mockStudentsArr.splice(0, mockStudentsArr.length, ...saved);
    });

    it('persists drag reordering and bails out for invalid drops', () => {
        renderPage();
        // Move index 1 (r2) to index 0: r2 and r1 shift; r3 keeps displayOrder 2.
        act(() => {
            dndOnDragEnd.handler({
                source: { index: 1, droppableId: 'rubric-list' },
                destination: { index: 0, droppableId: 'rubric-list' },
            });
        });
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2', displayOrder: 0 }));
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', displayOrder: 1 }));
        const r3Calls = mockUpdateRubric.mock.calls.filter((c: unknown[]) => (c[0] as Rubric).id === 'r3');
        expect(r3Calls).toHaveLength(0);

        // Dropping outside the list does nothing.
        mockUpdateRubric.mockClear();
        act(() => {
            dndOnDragEnd.handler({ source: { index: 0, droppableId: 'rubric-list' }, destination: null });
        });
        expect(mockUpdateRubric).not.toHaveBeenCalled();

        // A filtered list is not reorderable.
        fireEvent.change(screen.getByPlaceholderText('rubricList.search_rubrics'), { target: { value: 'Essay' } });
        act(() => {
            dndOnDragEnd.handler({
                source: { index: 0, droppableId: 'rubric-list' },
                destination: { index: 1, droppableId: 'rubric-list' },
            });
        });
        expect(mockUpdateRubric).not.toHaveBeenCalled();
    });

    it('files a rubric on a real drop over a folder tile but not on a cancelled drag', () => {
        renderPage();
        const tile = document.createElement('div');
        tile.setAttribute('data-drop-folder-id', 'f1');
        const label = document.createElement('span');
        tile.appendChild(label);
        document.body.appendChild(tile);
        // jsdom has no layout and therefore no elementFromPoint at all; stand in for the hit test.
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            writable: true,
            value: () => label,
        });

        const dragOverTile = () => {
            act(() => {
                dndOnBeforeCapture.handler();
            });
            act(() => {
                // The listener is registered on window itself, so dispatch there.
                window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
            });
        };

        // Escape ends the drag with CANCEL and no destination; the pointer is still on the tile.
        dragOverTile();
        act(() => {
            dndOnDragEnd.handler({
                source: { index: 0, droppableId: 'rubric-list' },
                destination: null,
                reason: 'CANCEL',
            });
        });
        expect(mockUpdateRubric).not.toHaveBeenCalled();

        dragOverTile();
        act(() => {
            dndOnDragEnd.handler({
                source: { index: 0, droppableId: 'rubric-list' },
                destination: null,
                reason: 'DROP',
            });
        });
        expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', folderId: 'f1' }));

        Reflect.deleteProperty(document, 'elementFromPoint');
        tile.remove();
    });

    it('imports a minimal share code using every fallback field', () => {
        renderPage();
        const minimal = {
            ...mockRubric,
            name: '',
            subject: '',
            description: '',
            gradeScaleId: '',
            format: undefined as never,
            scoringMode: undefined as never,
            totalMaxPoints: undefined as never,
        };
        fireEvent.click(screen.getByText('rubricList.code_import_button'));
        fireEvent.change(screen.getByPlaceholderText('tooltips.paste_share_code'), {
            target: { value: encodeRubricShareCode(minimal) },
        });
        fireEvent.click(screen.getByText('rubricList.code_import_submit'));
        expect(mockAddRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'rubricList.imported_rubric_name',
                subject: '',
                gradeScaleId: 'gs1',
                format: DEFAULT_FORMAT,
                scoringMode: 'weighted-percentage',
                totalMaxPoints: 100,
            })
        );
    });

    it('closes the code-import modal via Escape and the cancel button (#703)', () => {
        renderPage();
        fireEvent.click(screen.getByText('rubricList.code_import_button'));
        const dialog = screen.getByRole('dialog', { name: 'rubricList.code_import_title' });
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.queryByPlaceholderText('tooltips.paste_share_code')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('rubricList.code_import_button'));
        fireEvent.click(within(screen.getByRole('dialog')).getByText('common.cancel'));
        expect(screen.queryByPlaceholderText('tooltips.paste_share_code')).not.toBeInTheDocument();
    });

    it('closes the differentiate modal via overlay, close button, and picks a CEFR level', () => {
        renderPage();
        fireEvent.click(screen.getAllByTitle('voTrack.differentiate_title')[0]);
        fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
        expect(screen.queryByText('voTrack.action_create')).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByTitle('voTrack.differentiate_title')[0]);
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('voTrack.action_create')).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByTitle('voTrack.differentiate_title')[0]);
        fireEvent.click(screen.getByText('A2'));
        fireEvent.click(screen.getByText('voTrack.action_create'));
        expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ cefrTargetLevel: 'A2' }));
    });

    it('filters group-grading students by the active class and toggles selections off', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('rubricList.action_group_grade')[0]);
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Alice')).toBeInTheDocument();
        expect(within(dialog).queryByText('Bob')).not.toBeInTheDocument();

        const checkbox = within(dialog).getAllByRole('checkbox')[0];
        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();

        // Close via the modal header close button.
        fireEvent.click(within(dialog).getByLabelText('common.close'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes the group modal on Escape via the Modal onClose', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('rubricList.action_group_grade')[0]);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('navigates from the shared-with-me and department rows, including keyboard', async () => {
        mockDbStatus.isConnected = true;
        mockFetchSharedRubrics.mockResolvedValue([{ ...mockRubric2, id: 'shared-1', name: 'Shared Rubric' }]);
        mockFetchSchoolSharedRubrics.mockResolvedValue([{ ...mockRubric2, id: 'dept-1', name: 'Dept Rubric' }]);
        renderPage();
        await waitFor(() => expect(screen.getByText('rubricList.shared_with_me')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Dept Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/dept-1');
        fireEvent.keyDown(screen.getByText('Dept Rubric'), { key: 'Enter' });
        fireEvent.keyDown(screen.getByText('Dept Rubric'), { key: ' ' });
        // An unrelated key leaves the row inert.
        fireEvent.keyDown(screen.getByText('Dept Rubric'), { key: 'Tab' });
        expect(mockNavigate).toHaveBeenCalledTimes(3);

        fireEvent.click(screen.getByText('Shared Rubric'));
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/shared-1');
    });

    it('resets the copied icons after the two-second timeout', () => {
        vi.useFakeTimers();
        renderPage();
        const shareBtn = screen.getAllByTitle('tooltips.copy_share_code')[0];
        fireEvent.click(shareBtn);
        expect(shareBtn.style.color).toContain('var(--green');
        const previewBtn = screen.getAllByTitle('tooltips.share_preview')[0];
        fireEvent.click(previewBtn);
        expect(previewBtn.style.color).toContain('var(--green');
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getAllByTitle('tooltips.copy_share_code')[0].style.color).toBe('');
        expect(screen.getAllByTitle('tooltips.share_preview')[0].style.color).toBe('');
        vi.useRealTimers();
    });

    describe('share modal', () => {
        async function openShare() {
            mockDbStatus.isConnected = true;
            cleanup();
            renderPage();
            fireEvent.click(screen.getAllByTitle('rubricList.action_share_colleague')[0]);
            await waitFor(() => expect(mockFetchRubricShares).toHaveBeenCalled());
        }

        it('ignores Enter with an empty email, shares on Enter, and switches the mode', async () => {
            await openShare();
            const emailInput = screen.getByPlaceholderText('rubricList.share_email_placeholder');
            fireEvent.keyDown(emailInput, { key: 'Enter' });
            expect(mockShareRubricWithEmail).not.toHaveBeenCalled();

            fireEvent.change(emailInput, { target: { value: 'a@b.c' } });
            fireEvent.keyDown(emailInput, { key: 'Enter' });
            await waitFor(() => expect(mockShareRubricWithEmail).toHaveBeenCalledWith('r1', 'a@b.c', 'read'));

            const modeSelect = screen.getAllByRole('combobox').at(-1)! as HTMLSelectElement;
            fireEvent.change(modeSelect, { target: { value: 'edit' } });
            fireEvent.change(emailInput, { target: { value: 'x@y.z' } });
            fireEvent.click(screen.getByText('rubricList.share_btn'));
            await waitFor(() => expect(mockShareRubricWithEmail).toHaveBeenCalledWith('r1', 'x@y.z', 'edit'));
        });

        it('shows the thrown error and falls back to displayName/userId in the share list', async () => {
            mockShareRubricWithEmail.mockRejectedValue(new Error('boom'));
            mockFetchRubricShares.mockResolvedValue([
                { userId: 'u2', displayName: 'No Email', mode: 'edit' },
                { userId: 'u3', mode: 'read' },
            ]);
            await openShare();

            fireEvent.change(screen.getByPlaceholderText('rubricList.share_email_placeholder'), {
                target: { value: 'a@b.c' },
            });
            fireEvent.click(screen.getByText('rubricList.share_btn'));
            await waitFor(() => expect(screen.getByText('Error: boom')).toBeInTheDocument());
            expect(screen.getByText('No Email')).toBeInTheDocument();
            expect(screen.getByText('u3')).toBeInTheDocument();
            expect(screen.getByText('edit')).toBeInTheDocument();

            // A failure without an error field falls back to the generic message.
            mockShareRubricWithEmail.mockResolvedValue({ success: false });
            fireEvent.click(screen.getByText('rubricList.share_btn'));
            await waitFor(() => expect(screen.getByText('Unknown error')).toBeInTheDocument());
        });

        it('closes the share modal via overlay, header close, and footer close', async () => {
            await openShare();
            fireEvent.click(document.querySelector('.modal-overlay') as HTMLElement);
            expect(screen.queryByText('rubricList.share_modal_title')).not.toBeInTheDocument();

            await openShare();
            fireEvent.click(screen.getByLabelText('common.close'));
            expect(screen.queryByText('rubricList.share_modal_title')).not.toBeInTheDocument();

            await openShare();
            fireEvent.click(screen.getByText('common.close'));
            expect(screen.queryByText('rubricList.share_modal_title')).not.toBeInTheDocument();
        });
    });
});

it('imports a rubric with empty fields via the import modal fallbacks', () => {
    renderPage();
    fireEvent.click(screen.getByText('rubricList.import_rubric'));
    fireEvent.click(screen.getByText('Do Import Empty'));
    expect(mockAddRubric).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'rubricList.imported_rubric_name', subject: '' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/rubrics/new-r');
});

it('renders the no-subject dash in the list view', () => {
    mockRubricsArr.push({ ...mockRubric3, id: 'r9', name: 'No Subject Rubric', subject: '', displayOrder: 9 });
    renderPage();
    fireEvent.click(screen.getByText('common.view_list'));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    mockRubricsArr.pop();
});

it('creates a subfolder inside the folder that is open', () => {
    renderPage();
    // Walk into the folder; the bar now shows a breadcrumb and offers a subfolder.
    fireEvent.click(screen.getByRole('button', { name: 'Year 1' }));
    expect(screen.getByRole('navigation', { name: 'folders.path_label' })).toBeInTheDocument();
    fireEvent.click(screen.getByText(/folders.new_subfolder/));

    fireEvent.change(screen.getByLabelText('folders.folder_name'), { target: { value: 'Essays' } });
    fireEvent.click(screen.getByText('folders.create'));

    expect(mockAddFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Essays', kind: 'rubric', parentId: 'year1', displayOrder: 0 })
    );
});

it('files a rubric into a folder from its card menu', () => {
    renderPage();
    // The folder tiles come first in the DOM, so the first menu inside a card is after both tiles.
    const menus = screen.getAllByRole('button', { name: 'folders.move_to' });
    fireEvent.click(menus[2]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Year 2' }));
    expect(mockUpdateRubric).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', folderId: 'year2' }));
});

it('moves a folder into another folder from its tile menu', () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'folders.move_to' })[1]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Year 1' }));
    expect(mockUpdateFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'year2', parentId: 'year1' }));
});

it('shows the folder path on a card that is filed away', () => {
    mockRubricsArr.push({ ...mockRubric, id: 'r7', name: 'Filed Rubric', folderId: 'essays', displayOrder: 7 });
    renderPage();
    expect(screen.getByText('Year 1 / Essays')).toBeInTheDocument();
    mockRubricsArr.pop();
});

it('closes the group modal via its cancel button', () => {
    renderPage();
    fireEvent.click(screen.getAllByText('rubricList.action_group_grade')[0]);
    fireEvent.click(screen.getByText('common.cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('regenerates criterion and level ids when differentiating and duplicating a rubric with criteria', () => {
    const withCriteria: Rubric = {
        ...mockRubric,
        id: 'r8',
        name: 'Criterion Rubric',
        displayOrder: 9,
        criteria: [
            {
                id: 'c1',
                title: 'Crit',
                description: '',
                weight: 100,
                levels: [{ id: 'l1', label: 'L', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
            },
        ],
    };
    mockRubricsArr.push(withCriteria);
    renderPage();
    fireEvent.click(screen.getAllByTitle('voTrack.differentiate_title')[3]);
    fireEvent.click(screen.getByText('voTrack.action_create'));
    expect(mockAddRubric).toHaveBeenCalledWith(expect.objectContaining({ name: 'Criterion Rubric (HAVO)' }));
    const diffCall = mockAddRubric.mock.calls.at(-1)![0];
    expect(diffCall.criteria[0].id).not.toBe('c1');
    expect(diffCall.criteria[0].levels[0].id).not.toBe('l1');

    fireEvent.click(screen.getAllByTitle('rubricList.action_duplicate')[3]);
    expect(mockAddRubric).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'rubricList.copy_name:{"name":"Criterion Rubric"}' })
    );
    const dupCall = mockAddRubric.mock.calls.at(-1)![0];
    expect(dupCall.criteria[0].id).not.toBe('c1');
    expect(dupCall.criteria[0].levels[0].id).not.toBe('l1');
    mockRubricsArr.pop();
});

function within_row(row: HTMLElement, title: string): HTMLElement {
    return Array.from(row.querySelectorAll('button')).find((b) => b.getAttribute('title') === title) as HTMLElement;
}
