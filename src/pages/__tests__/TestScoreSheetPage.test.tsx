import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, GradeScale, Student, StudentTest, Test } from '../../types';
import type { StoreData } from '../../store/storage';
import { resetSharedMaterialsCache } from '../../hooks/useSharedMaterials';

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};
const mockGradeScale: GradeScale = {
    id: 'gs1',
    name: 'Letter',
    type: 'letter',
    ranges: [
        { min: 0, max: 54, label: 'F', color: '#f00' },
        { min: 55, max: 100, label: 'P', color: '#0f0' },
    ],
};
const classes: Class[] = [
    { id: 'c1', name: '2H', year: 'jaar-2', voTrack: 'havo' },
    { id: 'c2', name: 'Mixed' },
];
const baseStudents: Student[] = [
    { id: 's1', name: 'Bram', classId: 'c1' },
    { id: 's2', name: 'Anna', classId: 'c1' },
    { id: 's3', name: 'Chris', classId: 'c2' },
    { id: 's4', name: 'Gone', classId: 'c1', archivedAt: '2026-01-01' },
];
const baseTest: Test = {
    id: 't1',
    name: 'Paper test',
    questions: [
        { id: 'q1', prompt: '1a', type: 'open', points: 2 },
        { id: 'q2', prompt: '1b', type: 'open', points: 4 },
    ],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01',
    scoreOnly: true,
    gradingNorm: { type: 'nterm', n: 1 },
};

const mockSaveStudentTest = vi.fn();
const sharedDb = vi.hoisted(() => ({ connected: false }));
const mockFetchShared = vi.fn();
const mockUpdateShared = vi.fn();
const mockShowToast = vi.fn();
vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: sharedDb.connected, userId: sharedDb.connected ? 'me' : null }),
}));
vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchSharedMaterials: (...a: unknown[]) => mockFetchShared(...a),
            updateSharedMaterial: (...a: unknown[]) => mockUpdateShared(...a),
        },
    },
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
const mockUpdateTest = vi.fn();
const mockDownloadCsv = vi.fn();
let mockState: Record<string, unknown>;

vi.mock('../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockState as unknown as StoreData),
    useStoreActions: () => ({ saveStudentTest: mockSaveStudentTest, updateTest: mockUpdateTest }),
}));
vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
        <div>
            <h1>{title}</h1>
            {actions}
        </div>
    ),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));
vi.mock('../../utils/csvDownload', () => ({ downloadCsv: (...a: unknown[]) => mockDownloadCsv(...a) }));
vi.mock('recharts', () => {
    const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return {
        ResponsiveContainer: Box,
        BarChart: Box,
        Bar: Box,
        XAxis: () => null,
        YAxis: () => null,
        Tooltip: () => null,
        Cell: () => null,
        ReferenceLine: () => null,
    };
});
vi.mock('../../components/Standards/StandardsPickerModal', () => ({
    default: ({ onSelect }: { onSelect: (s: unknown) => void }) => (
        <button
            onClick={() =>
                onSelect({
                    guid: 'g1',
                    description: 'Std',
                    statementNotation: 'STD.1',
                    standardSetTitle: '',
                    jurisdictionTitle: '',
                })
            }
        >
            pick-standard
        </button>
    ),
}));
vi.mock('../../components/CEFR/CefrPickerModal', () => ({
    default: ({
        onAdd,
        onAddFramework,
        onClose,
    }: {
        onAdd: (d: unknown) => void;
        onAddFramework: (d: unknown) => void;
        onClose: () => void;
    }) => (
        <div>
            <button
                onClick={() =>
                    onAdd({
                        descriptorId: 'd1',
                        level: 'B1',
                        skill: 'reading',
                        descriptionEn: 'Reads',
                        descriptionNl: 'Leest',
                    })
                }
            >
                add-cefr
            </button>
            <button
                onClick={() =>
                    onAddFramework({
                        descriptorId: 'gr1',
                        framework: 'grammar',
                        categoryId: 'c',
                        categoryLabelEn: '',
                        categoryLabelNl: '',
                        categoryColor: '',
                        descriptionEn: 'Past simple',
                        descriptionNl: 'Verleden tijd',
                    })
                }
            >
                add-grammar
            </button>
            <button onClick={onClose}>close-cefr</button>
        </div>
    ),
}));

function sheetFor(studentId: string, scores: Record<string, number>, extra: Partial<StudentTest> = {}): StudentTest {
    return {
        id: `st-${studentId}`,
        testId: 't1',
        studentId,
        status: 'graded',
        startedAt: '2026-01-01',
        source: 'manual',
        answers: Object.entries(scores).map(([questionId, pointsEarned]) => ({
            questionId,
            response: '',
            pointsEarned,
        })),
        ...extra,
    };
}

async function renderPage(route = '/tests/t1/scores') {
    const { default: Page } = await import('../TestScoreSheetPage');
    return render(
        <MemoryRouter initialEntries={[route]}>
            <Routes>
                <Route path="/tests/:id/scores" element={<Page />} />
                <Route path="/tests" element={<div>tests-list</div>} />
                <Route path="/tests/:id" element={<div>builder</div>} />
            </Routes>
        </MemoryRouter>
    );
}

beforeEach(() => {
    sharedDb.connected = false;
    resetSharedMaterialsCache();
    mockFetchShared.mockReset().mockResolvedValue({ items: [], folders: [] });
    mockUpdateShared.mockReset().mockResolvedValue({ success: true });
    mockShowToast.mockClear();
    mockSaveStudentTest.mockClear();
    mockUpdateTest.mockClear();
    mockDownloadCsv.mockClear();
    mockState = {
        tests: [baseTest],
        studentTests: [sheetFor('s2', { q1: 2, q2: 3 })],
        students: baseStudents,
        classes,
        settings: mockSettings,
        gradeScales: [mockGradeScale],
    };
});

describe('TestScoreSheetPage', () => {
    it('shows a not-found state for an unknown test', async () => {
        await renderPage('/tests/nope/scores');
        expect(screen.getByText('tests.scoreSheet.not_found')).toBeInTheDocument();
    });

    it('lists the busiest class sorted by name with totals and N-term grades', async () => {
        await renderPage();
        const rows = screen.getAllByRole('row');
        const names = rows.map((r) => within(r).queryByRole('rowheader')?.textContent).filter(Boolean);
        expect(names.slice(0, 2)).toEqual(['Anna', 'Bram']);
        expect(screen.queryByText('Gone')).not.toBeInTheDocument();
        const anna = rows.find((r) => within(r).queryByText('Anna'))!;
        expect(within(anna).getByText('5')).toBeInTheDocument();
        expect(within(anna).getByText('83.3%')).toBeInTheDocument();
        expect(within(anna).getByText('8.5')).toBeInTheDocument();
    });

    it('saves a typed cell on blur and skips over-max values', async () => {
        await renderPage();
        const cell = screen.getByLabelText(/"student":"Bram","question":"1a"/);
        fireEvent.change(cell, { target: { value: '9' } });
        expect(cell).toHaveAttribute('aria-invalid', 'true');
        fireEvent.blur(cell);
        expect(mockSaveStudentTest).not.toHaveBeenCalled();
        fireEvent.change(cell, { target: { value: '1,5' } });
        fireEvent.blur(cell);
        expect(mockSaveStudentTest).toHaveBeenCalledTimes(1);
        const saved = mockSaveStudentTest.mock.calls[0][0] as StudentTest;
        expect(saved).toMatchObject({ studentId: 's1', source: 'manual', rawTotalPoints: 1.5 });
    });

    it('fills a pasted block across students and questions', async () => {
        await renderPage();
        const cell = screen.getByLabelText(/"student":"Anna","question":"1a"/);
        fireEvent.paste(cell, { clipboardData: { getData: () => '1\t4\n2\t2' } });
        expect(mockSaveStudentTest).toHaveBeenCalledTimes(2);
        const byStudent = Object.fromEntries(
            mockSaveStudentTest.mock.calls.map((call) => {
                const st = call[0] as StudentTest;
                return [st.studentId, st.rawTotalPoints];
            })
        );
        expect(byStudent).toEqual({ s2: 5, s1: 4 });
    });

    it('moves between cells with the keyboard and reverts with Escape', async () => {
        await renderPage();
        const first = screen.getByLabelText(/"student":"Anna","question":"1a"/);
        first.focus();
        fireEvent.keyDown(first, { key: 'ArrowDown' });
        expect(document.activeElement).toBe(screen.getByLabelText(/"student":"Bram","question":"1a"/));
        fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
        expect(document.activeElement).toBe(screen.getByLabelText(/"student":"Bram","question":"1b"/));
        fireEvent.keyDown(document.activeElement!, { key: 'Enter', shiftKey: true });
        expect(document.activeElement).toBe(screen.getByLabelText(/"student":"Anna","question":"1b"/));
        const active = document.activeElement as HTMLInputElement;
        fireEvent.change(active, { target: { value: 'x' } });
        fireEvent.keyDown(active, { key: 'Escape' });
        expect(active.value).toBe('3');
        fireEvent.keyDown(active, { key: 'a' });
    });

    it('marks a student absent', async () => {
        await renderPage();
        fireEvent.click(screen.getByLabelText(/absent_label.*Bram/));
        expect(mockSaveStudentTest.mock.calls[0][0]).toMatchObject({ studentId: 's1', absent: true });
    });

    it('switches class and shows an empty state for a class without students', async () => {
        mockState.classes = [...classes, { id: 'c3', name: 'Empty' }];
        await renderPage();
        fireEvent.change(screen.getByLabelText('tests.scoreSheet.class_label'), { target: { value: 'c3' } });
        expect(screen.getByText('tests.scoreSheet.no_students')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.scoreSheet.class_label'), { target: { value: '__results' } });
        expect(screen.getByText('Anna')).toBeInTheDocument();
        expect(screen.queryByText('Bram')).not.toBeInTheDocument();
    });

    it('shows every norm-table column for a student whose track is unknown', async () => {
        mockState.tests = [
            {
                ...baseTest,
                gradingNorm: {
                    type: 'table',
                    tiers: [
                        { id: 'h', year: 'jaar-2', track: 'havo' },
                        { id: 'v', year: 'jaar-2', track: 'vwo' },
                    ],
                    rows: [
                        { minPoints: 0, grades: { h: 1, v: 1 } },
                        { minPoints: 4, grades: { h: 7, v: 6 } },
                    ],
                },
            },
        ];
        mockState.studentTests = [sheetFor('s2', { q1: 2, q2: 3 }), sheetFor('s3', { q1: 2, q2: 2 })];
        await renderPage();
        expect(screen.getByText('7.0')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('tests.scoreSheet.class_label'), { target: { value: 'c2' } });
        expect(screen.getByText(/7 · Jaar 2 · HAVO/)).toBeInTheDocument();
        expect(screen.getByText(/6 · Jaar 2 · VWO/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.scoreSheet.export_csv'));
        const csv = mockDownloadCsv.mock.calls[0][0] as string;
        expect(csv).toContain('Grade (Jaar 2 · HAVO)');
        expect(mockDownloadCsv.mock.calls[0][1]).toBe('Paper_test_scores.csv');
    });

    it('grades lower years with labels and shows the label distribution', async () => {
        mockState.tests = [
            {
                ...baseTest,
                gradingNorm: {
                    type: 'table',
                    tiers: [{ id: 'j2', year: 'jaar-2', passFrom: 'B' }],
                    rows: [
                        { minPoints: 0, grades: { j2: 'IO' } },
                        { minPoints: 4, grades: { j2: 'B' } },
                        { minPoints: 6, grades: { j2: 'E' } },
                    ],
                },
            },
        ];
        mockState.studentTests = [sheetFor('s1', { q1: 1, q2: 1 }), sheetFor('s2', { q1: 2, q2: 3 })];
        await renderPage();
        const anna = screen.getAllByRole('row').find((r) => within(r).queryByText('Anna'))!;
        expect(within(anna).getByText('B')).toBeInTheDocument();
        const bram = screen.getAllByRole('row').find((r) => within(r).queryByText('Bram'))!;
        expect(within(bram).getByText('IO')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.scoreSheet.tab_analysis'));
        expect(screen.getByText('tests.quality.distribution_labels')).toBeInTheDocument();
        expect(screen.getByText('tests.quality.pass_rate')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(screen.queryByText('tests.quality.mean_grade')).not.toBeInTheDocument();
    });

    it('changes the norm and shows its preview', async () => {
        await renderPage();
        fireEvent.change(screen.getByLabelText('tests.norm.n_label'), { target: { value: '1.5' } });
        expect(mockUpdateTest.mock.calls[0][0].gradingNorm).toEqual({ type: 'nterm', n: 1.5 });
        fireEvent.change(document.getElementById('norm-type')!, { target: { value: 'caesura' } });
        expect(mockUpdateTest.mock.calls[1][0].gradingNorm).toEqual({ type: 'caesura', passPoints: 3.5 });
        fireEvent.click(screen.getByText('tests.norm.show_preview'));
        expect(screen.getByText('tests.scoreSheet.col_points')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.norm.hide_preview'));
    });

    it('shows the analysis tab', async () => {
        mockState.studentTests = [sheetFor('s1', { q1: 2, q2: 4 }), sheetFor('s2', { q1: 1, q2: 3 })];
        await renderPage('/tests/t1/scores?tab=analysis');
        expect(screen.getByText('tests.quality.summary_title')).toBeInTheDocument();
        expect(screen.getByText('tests.quality.small_sample')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.scoreSheet.tab_sheet'));
        expect(screen.getByText('tests.scoreSheet.keyboard_hint')).toBeInTheDocument();
    });

    it('edits score-only columns and links descriptors', async () => {
        await renderPage();
        fireEvent.click(screen.getByText('tests.scoreSheet.edit_columns'));
        fireEvent.change(screen.getByLabelText('tests.scoreSheet.test_name_label'), { target: { value: 'Chapter 4' } });
        fireEvent.click(screen.getByText('tests.scoreSheet.add_column'));
        fireEvent.blur(screen.getByLabelText(/column_max.*"n":3/), { target: { value: '5' } });
        fireEvent.click(screen.getByLabelText(/move_down.*"n":1/));
        fireEvent.click(screen.getAllByText('tests.scoreSheet.link_descriptor')[0]);
        fireEvent.click(screen.getByText('add-cefr'));
        fireEvent.click(screen.getByText('add-grammar'));
        fireEvent.click(screen.getByText('close-cefr'));
        fireEvent.click(screen.getAllByText('tests.scoreSheet.link_standard')[0]);
        expect(screen.getByText('tests.standards_api_key_required')).toBeInTheDocument();
        fireEvent.click(screen.getByText('rubricBuilder.action_close'));
        fireEvent.change(screen.getByLabelText('cefr.skill_label'), { target: { value: 'reading' } });
        fireEvent.click(screen.getByText('common.save'));
        const saved = mockUpdateTest.mock.calls[0][0] as Test;
        expect(saved.name).toBe('Chapter 4');
        expect(saved.questions.map((q) => q.prompt)).toEqual(['1b', '1a', '3']);
        expect(saved.questions[2].points).toBe(5);
        expect(saved.questions[0]).toMatchObject({
            linkedCefrDescriptors: [expect.objectContaining({ descriptorId: 'd1' })],
            linkedGrammarItemId: 'gr1',
        });
        expect(saved.cefrSkill).toBe('reading');
    });

    it('links a standard and removes links again', async () => {
        mockState.settings = { ...mockSettings, standardsApiKey: 'key' };
        await renderPage();
        fireEvent.click(screen.getByText('tests.scoreSheet.edit_columns'));
        fireEvent.click(screen.getAllByText('tests.scoreSheet.link_standard')[0]);
        fireEvent.click(screen.getByText('pick-standard'));
        expect(screen.getByText('STD.1')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/unlink.*STD.1/));
        expect(screen.queryByText('STD.1')).not.toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/remove_column.*"n":2/));
        fireEvent.click(screen.getByText('common.save'));
        expect((mockUpdateTest.mock.calls[0][0] as Test).questions).toHaveLength(1);
    });

    it('links to the builder for a regular test', async () => {
        mockState.tests = [{ ...baseTest, scoreOnly: false, gradingNorm: undefined }];
        await renderPage();
        expect(screen.getByText('tests.question_number:{"number":1}')).toBeInTheDocument();
        expect(screen.getByText('P')).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.action_edit'));
        expect(screen.getByText('builder')).toBeInTheDocument();
    });

    it('stamps me as the last editor on a typed score while connected', async () => {
        sharedDb.connected = true;
        await renderPage();
        const cell = await screen.findByLabelText(/"student":"Bram","question":"1a"/);
        fireEvent.change(cell, { target: { value: '1' } });
        fireEvent.blur(cell);
        expect(mockSaveStudentTest).toHaveBeenCalled();
        expect((mockSaveStudentTest.mock.calls[0][0] as StudentTest).lastEditedBy).toBe('me');
    });

    describe('a colleague’s test from a co-taught class', () => {
        function shareTest(access: 'view' | 'edit') {
            sharedDb.connected = true;
            mockState.tests = [];
            mockFetchShared.mockResolvedValue({
                items: [{ item: baseTest, ownerId: 'ann', ownerName: 'Ann', access }],
                folders: [],
            });
        }

        it('waits for the shared list, then shows the sheet with its results', async () => {
            shareTest('view');
            const view = await renderPage();
            expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull();
            expect(await screen.findByLabelText('tests.norm.n_label')).toBeInTheDocument();
            expect(mockFetchShared).toHaveBeenCalledWith('test');
        });

        it('keeps a view-only test’s norm with its owner', async () => {
            shareTest('view');
            await renderPage();
            fireEvent.change(await screen.findByLabelText('tests.norm.n_label'), { target: { value: '1.5' } });
            expect(mockUpdateTest).not.toHaveBeenCalled();
            expect(mockUpdateShared).not.toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith('sharing.test_settings_owner_only', 'info');
        });

        it('saves an editable test’s norm into the original and reports a refusal', async () => {
            shareTest('edit');
            mockUpdateShared.mockResolvedValue({ success: false, error: 'not_permitted' });
            await renderPage();
            fireEvent.change(await screen.findByLabelText('tests.norm.n_label'), { target: { value: '1.5' } });
            expect(mockUpdateShared.mock.calls[0][0]).toBe('test');
            expect(mockUpdateShared.mock.calls[0][1].gradingNorm).toEqual({ type: 'nterm', n: 1.5 });
            expect(mockUpdateTest).not.toHaveBeenCalled();
            await vi.waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('sharing.save_failed', 'error'));
        });
    });
});
