import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComparativeGradingDefault from '../ComparativeGrading';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Attachment, Class, GradeScale, Rubric, Student, StudentRubric } from '../../types';

// ---- Hoisted mock state ----
const joyrideState = vi.hoisted(() => ({ onEvent: null as null | ((d: { status: string }) => void) }));

vi.mock('react-joyride', () => {
    const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' };
    return {
        STATUS,
        Joyride: ({ onEvent }: { onEvent: (d: { status: string }) => void }) => {
            joyrideState.onEvent = onEvent;
            return React.createElement('div', { 'data-testid': 'joyride-mock' });
        },
    };
});

vi.mock('../../components/Attachments/AttachmentViewer', () => ({
    default: () => React.createElement('div', null, 'attachment-mock'),
}));

const subItem = (
    id: string,
    label: string,
    extra: Partial<{ minPoints: number; maxPoints: number; points: number }> = {}
) => ({
    id,
    label,
    ...extra,
});

const level = (
    id: string,
    label: string,
    minPoints: number,
    maxPoints: number,
    subItems: { id: string; label: string; minPoints?: number; maxPoints?: number; points?: number }[] = []
) => ({ id, label, minPoints, maxPoints, description: '', subItems });

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: 'A test rubric',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: 'Has a description',
            weight: 100,
            levels: [
                level('l1', 'Excellent', 90, 100, [
                    subItem('si1', 'Clarity', { minPoints: 0, maxPoints: 10 }),
                    subItem('si2', 'Legacy', { points: 5 }),
                    subItem('si3', 'Bare'),
                ]),
                level('l2', 'Good', 75, 75),
                level('l3', 'Basic', 0, 50, [subItem('si4', 'Fixed-sub', { minPoints: 1, maxPoints: 1 })]),
                level('l5', 'Zero', 0, 0),
            ],
        },
        {
            id: 'c2',
            title: 'Criterion 2',
            description: '',
            weight: 0,
            levels: [level('l4', 'Yes', 5, 5)],
        },
        {
            id: 'c3',
            title: 'Empty Levels',
            description: '',
            weight: 0,
            levels: [],
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

const makeClass = (id: string, name: string, extra: Partial<Class> = {}): Class => ({
    id,
    name,
    rubricIds: ['r1'],
    ...extra,
});
const makeStudent = (id: string, name: string, classId: string): Student => ({ id, name, classId });

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
    ranges: [{ min: 0, max: 100, label: 'A', color: '#22c55e' }],
};

const mockAttachment = (id: string, studentId: string): Attachment => ({
    id,
    name: `${id}.txt`,
    mimeType: 'text/plain',
    dataUrl: 'data:text/plain;base64,aGk=',
    studentId,
    size: 2,
    addedAt: '2024-01-01T00:00:00Z',
});

const blankEntries = (r: Rubric) =>
    r.criteria.map((c) => ({ criterionId: c.id, levelId: null as string | null, comment: '', checkedSubItems: [] }));

// ---- Mutable but reference-stable fixtures (the page's useMemo/useEffect deps rely on stable refs) ----
let rubricsArr: Rubric[];
let studentsArr: Student[];
let classesArr: Class[];
let studentRubricsArr: StudentRubric[];
let attachmentsArr: Attachment[];
let settingsObj: AppSettings;
let gradeScalesArr: GradeScale[];

function makeAppValue() {
    return {
        rubrics: rubricsArr,
        students: studentsArr,
        classes: classesArr,
        studentRubrics: studentRubricsArr,
        attachments: attachmentsArr,
        saveStudentRubric: mockSaveStudentRubric,
        gradeScales: gradeScalesArr,
        settings: settingsObj,
    };
}

const mockSaveStudentRubric = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../context/AppContext', () => ({
    useRoster: () => makeAppValue(),
    useStudents: () => makeAppValue(),
    useClasses: () => makeAppValue(),
    useGrading: () => makeAppValue(),
    useAuthoring: () => makeAppValue(),
    useAssessment: () => makeAppValue(),
    useEssays: () => makeAppValue(),
    useFlashcards: () => makeAppValue(),
    useSettings: () => makeAppValue(),
    usePlatform: () => makeAppValue(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

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

function renderAt(path: string) {
    const router = createMemoryRouter(
        [{ path: '/grade-comparative/:classId/:rubricId', element: <ComparativeGradingDefault /> }],
        { initialEntries: [path] }
    );
    return render(<RouterProvider router={router} />);
}

describe('ComparativeGrading coverage', () => {
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rubricsArr = [mockRubric];
        studentsArr = [
            makeStudent('s1', 'Alice', 'c1'),
            makeStudent('s2', 'Bob', 'c1'),
            makeStudent('s3', 'Carol', 'c1'),
            makeStudent('s4', 'Dana', 'c2'),
        ];
        classesArr = [
            makeClass('c1', 'Class A', { year: 'jaar-1' }),
            makeClass('c2', 'Class B'),
            makeClass('c3', 'Class C'),
        ];
        studentRubricsArr = [];
        attachmentsArr = [];
        settingsObj = { ...mockSettings };
        gradeScalesArr = [mockGradeScale];
        mockSaveStudentRubric.mockClear();
        mockNavigate.mockClear();
        joyrideState.onEvent = null;
        vi.spyOn(window, 'print').mockImplementation(() => {});
        mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        mathRandomSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it('shows the generic page title for an unknown rubric and navigates back', () => {
        renderAt('/grade-comparative/all/zzz');
        expect(screen.getByText('comparativeGrading.page_title')).toBeInTheDocument();
        // the student-picker topbar also falls back to the generic title (72 false)
        fireEvent.click(screen.getByRole('button', { name: /Class A/ }));
        expect(screen.getByText('comparativeGrading.page_title')).toBeInTheDocument();
        fireEvent.click(screen.getByText('common.back')); // back to the class picker (77)
        fireEvent.click(screen.getByText('common.back')); // leave the picker (146)
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('shows the no-classes empty state when nothing is linked', () => {
        classesArr = [];
        renderAt('/grade-comparative/all/r1');
        expect(screen.getByText('comparativeGrading.no_classes')).toBeInTheDocument();
    });

    it('shows a year-tagged scope, the student-picker back button, and the no-students state', () => {
        renderAt('/grade-comparative/all/r1');
        fireEvent.click(screen.getByRole('button', { name: /Class A/ }));
        // single-class scope label includes the school year
        expect(screen.getByText(/Jaar 1/)).toBeInTheDocument();
        expect(screen.getByText(/Alice/)).toBeInTheDocument();
        // back returns to the class picker
        fireEvent.click(screen.getByText('common.back'));
        expect(screen.getByText('comparativeGrading.select_class_title')).toBeInTheDocument();
        // empty class → no-students hint, then random start navigates without a start id
        fireEvent.click(screen.getByRole('button', { name: /Class C/ }));
        expect(screen.getByText('comparativeGrading.no_students')).toBeInTheDocument();
        fireEvent.click(screen.getByText('comparativeGrading.action_start_random'));
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/c3/r1', { replace: true });
    });

    it('opens the combined-scope picker and starts a session from a specific student', () => {
        renderAt('/grade-comparative/all/r1');
        fireEvent.click(screen.getByText('comparativeGrading.all_classes'));
        // combined scope label lists every linked class
        expect(screen.getByText(/Class A, Class B, Class C/)).toBeInTheDocument();
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        // combined picker rows show the student's class
        expect(screen.getByText('(Class B)')).toBeInTheDocument();
        // clicking a student navigates with a start id
        const aliceBtn = screen.getAllByText('Alice').find((el) => el.tagName === 'BUTTON');
        fireEvent.click(aliceBtn!);
        expect(mockNavigate).toHaveBeenCalledWith('/grade-comparative/__combined__/r1?start=s1', { replace: true });
    });

    it('renders the rubric-not-found state for an unknown rubric in a session', () => {
        renderAt('/grade-comparative/c1/zzz');
        expect(screen.getByText('comparativeGrading.rubric_not_found')).toBeInTheDocument();
    });

    it('shows the not-enough-students error with both actions', () => {
        renderAt('/grade-comparative/c3/r1');
        expect(screen.getByText('comparativeGrading.not_enough_students')).toBeInTheDocument();
        // clean state before any edit: the beforeunload guard returns early
        fireEvent(window, new Event('beforeunload'));
        fireEvent.click(screen.getByText('comparativeGrading.go_to_students'));
        expect(mockNavigate).toHaveBeenCalledWith('/students');
        // the error screen has a topbar back button and an in-card back button
        fireEvent.click(screen.getAllByText('comparativeGrading.action_back')[0]);
        fireEvent.click(screen.getAllByText('comparativeGrading.action_back')[1]);
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('reuses an existing rubric result for the start anchor', () => {
        const existingSr: StudentRubric = {
            id: 'sr1',
            rubricId: 'r1',
            studentId: 's1',
            entries: blankEntries(mockRubric),
            overallComment: '',
            isPeerReview: false,
            gradedAt: '2024-01-01T00:00:00Z',
        };
        // start anchor without a saved result → getEmptySR falls through to a blank SR
        const first = renderAt('/grade-comparative/c1/r1?start=s1');
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
        first.unmount();
        // start anchor with a saved result → the existing SR is reused
        studentRubricsArr = [existingSr];
        renderAt('/grade-comparative/c1/r1?start=s1');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    });

    it('falls back to a random anchor when the start id is not in the class', () => {
        renderAt('/grade-comparative/c1/r1?start=nope');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });

    it('runs the full criterion-comparison matrix', () => {
        renderAt('/grade-comparative/c1/r1');
        const aBetter = () => screen.getAllByText('comparativeGrading.action_a_better')[0];
        const bBetter = () => screen.getAllByText('comparativeGrading.action_b_better')[0];
        const equal = () => screen.getAllByText('comparativeGrading.action_equal')[0];
        // DOM order: c1-A, c1-B, c2-A, c2-B, c3-A, c3-B (selects stay addressable after values change)
        const sel = (i: number) => document.querySelectorAll('select.comparative-level-select')[i] as HTMLSelectElement;
        const setLevel = (i: number, v: string) => fireEvent.change(sel(i), { target: { value: v } });

        // inherit-branch: only B has a level → A_BETTER copies B's level (353 false → 357/358)
        setLevel(1, 'l1');
        fireEvent.click(aBetter());
        // inherit-branch: only A has a level → B_BETTER copies A's level (359/360)
        setLevel(1, '');
        setLevel(0, 'l1');
        fireEvent.click(bBetter());
        // fresh-session EQUAL with both unset starts at the middle level (353 true → 373)
        fireEvent.click(equal());
        // A_BETTER when both at middle raises A (364 true → 365 true)
        setLevel(0, 'l2');
        setLevel(1, 'l2');
        fireEvent.click(aBetter());
        // A_BETTER when A is already ahead is a no-op (364 false)
        fireEvent.click(aBetter());
        // B_BETTER when both at middle raises B (369 true → 370 true)
        setLevel(0, 'l2');
        setLevel(1, 'l2');
        fireEvent.click(bBetter());
        // B_BETTER when B is already ahead is a no-op (369 false)
        fireEvent.click(bBetter());
        // both at the top → A_BETTER pushes B down (365 false → 366 true)
        setLevel(0, 'l1');
        setLevel(1, 'l1');
        fireEvent.click(aBetter());
        // both at the top → B_BETTER pushes A down (370 false → 371 true)
        setLevel(0, 'l1');
        setLevel(1, 'l1');
        fireEvent.click(bBetter());
        // manual level updates on both sides (395/402 + 399/406)
        setLevel(0, 'l3');
        setLevel(1, 'l3');
        // a criterion with no levels short-circuits (344)
        fireEvent.click(screen.getAllByText('comparativeGrading.action_a_better')[2]);
        // single-level criterion: top clamp branches are no-ops (365/366 false, 370/371 false)
        fireEvent.click(screen.getAllByText('comparativeGrading.action_a_better')[1]);
        fireEvent.click(screen.getAllByText('comparativeGrading.action_b_better')[1]);
    });

    it('saves and keeps the anchor student for the next matchup', () => {
        renderAt('/grade-comparative/c1/r1');
        fireEvent.click(screen.getAllByText('comparativeGrading.action_equal')[0]);
        fireEvent.click(screen.getByText('comparativeGrading.action_save_next'));
        expect(mockSaveStudentRubric).toHaveBeenCalledTimes(2);
        // second save uses the keepSrA path and saves again
        fireEvent.click(screen.getByText('comparativeGrading.action_save_next'));
        expect(mockSaveStudentRubric).toHaveBeenCalledTimes(4);
    });

    it('warns on beforeunload only after edits', () => {
        renderAt('/grade-comparative/c1/r1');
        // clean state: the handler returns early (243 false)
        fireEvent(window, new Event('beforeunload'));
        // make an edit → dirty → preventDefault + returnValue (244-245)
        const selects = screen.getAllByDisplayValue('comparativeGrading.select_level');
        fireEvent.change(selects[0], { target: { value: 'l1' } });
        const evt = new Event('beforeunload', { cancelable: true });
        fireEvent(window, evt);
    });

    it('completes the session when the per-student limit is reached', () => {
        settingsObj = { ...mockSettings, comparativeMatchupLimit: 1 };
        renderAt('/grade-comparative/c1/r1');
        expect(screen.getByText(/comparativeGrading.per_student_limit/)).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('comparativeGrading.action_equal')[0]);
        // after this matchup every student is at the limit → eligible pool is too small
        fireEvent.click(screen.getByText('comparativeGrading.action_save_next'));
        expect(screen.getByText('comparativeGrading.session_complete_title')).toBeInTheDocument();
        // continue re-picks and lands on the same completion screen
        fireEvent.click(screen.getByText('comparativeGrading.action_continue'));
        expect(screen.getByText('comparativeGrading.session_complete_title')).toBeInTheDocument();
        // the completion topbar back button
        fireEvent.click(screen.getByText('common.back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
        // and the in-card back button
        fireEvent.click(screen.getByText('comparativeGrading.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('sorts the progress panel with a count-less student second', () => {
        // first matchup picks Bob vs Carol, leaving Alice count-less and second in the sort input
        mathRandomSpy.mockReturnValue(0.5);
        renderAt('/grade-comparative/c1/r1');
        fireEvent.click(screen.getByText(/comparativeGrading.student_progress_count/));
        expect(screen.getByText(/0 \/ 2/)).toBeInTheDocument();
    });

    it('adjusts the matchup limit from the input during a session', () => {
        renderAt('/grade-comparative/c1/r1');
        const input = screen.getByTitle('comparativeGrading.per_student_limit_hint');
        fireEvent.change(input, { target: { value: '2' } });
        // negative inputs clamp to zero; a zero value trips the || 0 fallback
        fireEvent.change(input, { target: { value: '-3' } });
        fireEvent.change(input, { target: { value: '0' } });
    });

    it('compares sub-items across all comparison modes and clamps', () => {
        renderAt('/grade-comparative/c1/r1');
        // put both students on the shared level with sub-items
        const selects = screen.getAllByDisplayValue('comparativeGrading.select_level');
        fireEvent.change(selects[0], { target: { value: 'l1' } });
        fireEvent.change(selects[1], { target: { value: 'l1' } });
        const equalSub = () => screen.getAllByLabelText('comparativeGrading.equal_on_sub')[0];
        const aBetterSub = () => screen.getAllByLabelText('comparativeGrading.a_better_on_sub')[0];
        const bBetterSub = () => screen.getAllByLabelText('comparativeGrading.b_better_on_sub')[0];
        const ranges = () => document.querySelectorAll('input[type="range"]');

        // legacy and bare sub-items fall back through the points/one chains
        expect(screen.getAllByText(/\/5/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/\/1/).length).toBeGreaterThan(0);

        // first sub-item write sees no existing subItemScores (442 right side)
        fireEvent.change(ranges()[0], { target: { value: '3' } });
        // EQUAL averages (448-449)
        fireEvent.click(equalSub());
        // A_BETTER when equal raises A (451/452 true)
        fireEvent.click(aBetterSub());
        // A_BETTER when A is already ahead is a no-op (451 false)
        fireEvent.click(aBetterSub());
        // B_BETTER when equal raises B (456/457 true)
        fireEvent.click(bBetterSub());
        // B_BETTER when B is already ahead is a no-op (456 false)
        fireEvent.click(bBetterSub());
        // push both to the max via the range sliders → A_BETTER clamps B down (452 false → 453)
        fireEvent.change(ranges()[0], { target: { value: '10' } });
        fireEvent.change(ranges()[4], { target: { value: '10' } });
        fireEvent.click(aBetterSub());
        // restore B to max → B_BETTER clamps A down (457 false → 458)
        fireEvent.change(ranges()[4], { target: { value: '10' } });
        fireEvent.click(bBetterSub());
        // a second write to A's sub-item reads back the existing subItemScores (442 left side)
        fireEvent.change(ranges()[0], { target: { value: '7' } });
        // touch every range slider so both per-level points sliders (1006/1286) update too
        document.querySelectorAll('input[type="range"]').forEach((r) => {
            fireEvent.change(r, { target: { value: String(Number((r as HTMLInputElement).min) + 5) } });
        });
        // a fixed min===max sub-item (si4 on l3) hits the no-op clamp fall-throughs (466/473)
        const levelSelects = document.querySelectorAll('select.comparative-level-select');
        fireEvent.change(levelSelects[0], { target: { value: 'l3' } });
        fireEvent.change(levelSelects[1], { target: { value: 'l3' } });
        fireEvent.click(screen.getAllByLabelText('comparativeGrading.a_better_on_sub')[0]);
        fireEvent.click(screen.getAllByLabelText('comparativeGrading.b_better_on_sub')[0]);
    });

    it('compares a sub-item on untouched entries so the `?? {}` fallbacks run', () => {
        renderAt('/grade-comparative/c1/r1');
        // a fresh session has no subItemScores on any entry; the l3 fixed sub-item renders compare buttons
        const levelSelects = document.querySelectorAll('select.comparative-level-select');
        fireEvent.change(levelSelects[0], { target: { value: 'l3' } });
        fireEvent.change(levelSelects[1], { target: { value: 'l3' } });
        // compareSubItem then reads `eA?.subItemScores ?? {}` (460 right side) with nothing stored yet
        fireEvent.click(screen.getAllByLabelText('comparativeGrading.a_better_on_sub')[0]);
        fireEvent.click(screen.getAllByLabelText('comparativeGrading.b_better_on_sub')[0]);
    });

    it('toggles comments and edits per-criterion and overall comments', () => {
        renderAt('/grade-comparative/c1/r1');
        // open then close the comment panel (467-474)
        const toggleComment = () => screen.getAllByTitle('comparativeGrading.toggle_comments')[0];
        fireEvent.click(toggleComment());
        const commentBoxes = screen.getAllByPlaceholderText('comparativeGrading.comment_placeholder');
        expect(commentBoxes.length).toBe(2);
        fireEvent.change(commentBoxes[0], { target: { value: 'A comment' } });
        fireEvent.change(commentBoxes[1], { target: { value: 'B comment' } });
        fireEvent.click(toggleComment());
        // overall feedback textareas
        const overalls = screen.getAllByPlaceholderText('comparativeGrading.overall_feedback_placeholder');
        fireEvent.change(overalls[0], { target: { value: 'Overall A' } });
        fireEvent.change(overalls[1], { target: { value: 'Overall B' } });
    });

    it('renders attachments, the progress panel, the tour, print, and back', () => {
        attachmentsArr = [mockAttachment('at1', 's1'), mockAttachment('at2', 's2')];
        renderAt('/grade-comparative/c1/r1');
        // attachments columns render for both students
        expect(screen.getAllByText('attachment-mock').length).toBe(2);
        // progress panel toggles open and lists all session students with per-student counts
        fireEvent.click(screen.getByText(/comparativeGrading.student_progress_count/));
        expect(screen.getByText('Carol')).toBeInTheDocument();
        expect(screen.getByText(/0 \/ 2/)).toBeInTheDocument();
        fireEvent.click(screen.getByText(/comparativeGrading.student_progress_count/));
        // tour start + finish/skip handlers
        fireEvent.click(screen.getByText('tutorial.cg_tour_button'));
        expect(joyrideState.onEvent).not.toBeNull();
        joyrideState.onEvent!({ status: 'finished' });
        joyrideState.onEvent!({ status: 'skipped' });
        joyrideState.onEvent!({ status: 'running' });
        fireEvent.click(screen.getByText('common.print'));
        expect(window.print).toHaveBeenCalled();
        fireEvent.click(screen.getAllByText('common.back')[0]);
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('renders the fixed-level points slider conditions for every level shape', () => {
        renderAt('/grade-comparative/c1/r1');
        const selects = screen.getAllByDisplayValue('comparativeGrading.select_level');
        // l2 (fixed 75-75, no sub-items) shows the points slider
        fireEvent.change(selects[0], { target: { value: 'l2' } });
        // l3 (fixed 50-50 WITH sub-items) hides the points slider (min===max && subItems non-empty)
        fireEvent.change(selects[0], { target: { value: 'l3' } });
        // l1 (range 90-100 with sub-items) shows both sub-item ranges and the points slider
        fireEvent.change(selects[0], { target: { value: 'l1' } });
        expect(document.querySelectorAll('input[type="range"]').length).toBeGreaterThan(0);
    });

    it('falls back to the first grade scale and to a null scale', () => {
        // unknown scale id → gradeScales[0]
        rubricsArr = [{ ...mockRubric, id: 'r1', gradeScaleId: 'zzz' }];
        const { unmount } = renderAt('/grade-comparative/c1/r1');
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        unmount();
        // 'none' scale → null scale
        rubricsArr = [{ ...mockRubric, id: 'r1', gradeScaleId: 'none' }];
        renderAt('/grade-comparative/c1/r1');
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    });
});
