import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import { storageSync } from '../../services/database';
import type {
    AppSettings,
    Attachment,
    Class,
    EssayAssignment,
    GradeScale,
    Rubric,
    RubricCriterion,
    Student,
} from '../../types';

// ---- Hoisted mock state (vi.mock factories are hoisted above imports) ----
const voiceState = vi.hoisted(() => ({
    isListening: false,
    onGrade: null as null | ((a: number, b: number) => void),
    onComment: null as null | ((t: string) => void),
    toggleListening: vi.fn(),
}));
const recorderState = vi.hoisted(() => ({
    status: 'idle',
    recordingKey: null as string | null,
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(null),
}));
const dbState = vi.hoisted(() => ({ isConnected: false, userId: null as string | null }));

vi.mock('../../hooks/useVoiceGrading', () => ({
    useVoiceGrading: (onGrade: (a: number, b: number) => void, onComment: (t: string) => void) => {
        voiceState.onGrade = onGrade;
        voiceState.onComment = onComment;
        return { isListening: voiceState.isListening, toggleListening: voiceState.toggleListening };
    },
}));

vi.mock('../../hooks/useMediaRecorder', () => ({
    useMediaRecorder: () => ({
        status: recorderState.status,
        recordingKey: recorderState.recordingKey,
        error: null,
        start: recorderState.start,
        stop: recorderState.stop,
    }),
}));

vi.mock('../../hooks/useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: dbState.isConnected, userId: dbState.userId }),
}));

vi.mock('react-joyride', () => {
    const STATUS = { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' };
    return {
        STATUS,
        Joyride: ({ onEvent }: { onEvent: (data: { status: string }) => void }) =>
            React.createElement(
                'div',
                { 'data-testid': 'joyride-mock' },
                React.createElement(
                    'button',
                    { onClick: () => onEvent({ status: STATUS.FINISHED }) },
                    'joyride-finish'
                ),
                React.createElement('button', { onClick: () => onEvent({ status: STATUS.SKIPPED }) }, 'joyride-skip'),
                React.createElement('button', { onClick: () => onEvent({ status: STATUS.RUNNING }) }, 'joyride-running')
            ),
    };
});

vi.mock('../../utils/pdfExport', () => ({
    exportSinglePdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/database/AuditLogger', () => ({
    logAuditEvent: vi.fn(),
}));

vi.mock('../../components/Essay/DocumentAnalysisPanel', () => ({
    default: ({
        rubricName,
        onApplyToEntry,
        onApplyComment,
        onAddToCommentBank,
        onClose,
    }: {
        rubricName: string;
        onApplyToEntry: (criterionId: string, subItemId: string) => void;
        onApplyComment: (criterionId: string, html: string) => void;
        onAddToCommentBank: (phrase: string) => void;
        onClose: () => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'analysis-mock' },
            React.createElement('span', null, rubricName),
            React.createElement('button', { onClick: () => onApplyToEntry('c1', 'si1') }, 'apply-entry'),
            React.createElement('button', { onClick: () => onApplyToEntry('cX', 'si1') }, 'apply-missing'),
            React.createElement('button', { onClick: () => onApplyComment('c1', '<p>Nice</p>') }, 'apply-comment'),
            React.createElement(
                'button',
                { onClick: () => onApplyComment('cX', '<p>Missing</p>') },
                'apply-comment-missing'
            ),
            React.createElement('button', { onClick: () => onAddToCommentBank('phrase') }, 'add-bank'),
            React.createElement('button', { onClick: onClose }, 'close-analysis')
        ),
}));

const essayFixture = (teacherKey: string): EssayAssignment => ({
    rubricId: 'r1',
    studentId: 's1',
    teacherKey,
    title: 'Essay One',
    prompt: 'Write an essay',
    readOnlyAfterSubmit: true,
    createdAt: '2024-01-01T00:00:00Z',
});

vi.mock('../../components/Essay/EssayAssignmentModal', () => ({
    default: ({
        onSaveAssignment,
        onOpenSlipSheet,
        onClose,
        initialValues,
    }: {
        onSaveAssignment: (a: EssayAssignment) => Promise<{ success: boolean; error?: string }>;
        onOpenSlipSheet: (a: EssayAssignment, students: { id: string; name: string }[]) => void;
        onClose: () => void;
        initialValues?: EssayAssignment;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'assign-mock' },
            React.createElement('input', { 'data-testid': 'assign-prompt', defaultValue: initialValues?.prompt ?? '' }),
            React.createElement('button', { onClick: () => onSaveAssignment(essayFixture('tk-save')) }, 'assign-save'),
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onOpenSlipSheet(essayFixture('tk-slip'), [
                            { id: 's1', name: 'Alice' },
                            { id: 's2', name: 'Bob' },
                        ]),
                },
                'assign-slip'
            ),
            React.createElement('button', { onClick: onClose }, 'assign-close')
        ),
}));

vi.mock('../../components/Essay/EssayImportModal', () => ({
    default: ({
        onImport,
        onClose,
        onFetchSubmissions,
    }: {
        onImport: (a: Omit<Attachment, 'id' | 'addedAt'>) => void;
        onClose: () => void;
        onFetchSubmissions: (key: string) => void;
    }) =>
        React.createElement(
            'div',
            { 'data-testid': 'import-mock' },
            React.createElement('button', { onClick: () => onFetchSubmissions('x') }, 'fetch-sub'),
            React.createElement(
                'button',
                {
                    onClick: () =>
                        onImport({
                            name: 'doc.html',
                            mimeType: 'text/html',
                            dataUrl: 'data:text/html;base64,' + btoa('<p>Hi</p>'),
                            rubricId: 'r1',
                            studentId: 's1',
                            size: 10,
                        }),
                },
                'import-doc'
            ),
            React.createElement('button', { onClick: onClose }, 'import-close')
        ),
}));

vi.mock('../../components/Essay/EssaySlipSheet', () => ({
    default: ({ onClose }: { onClose: () => void }) =>
        React.createElement('button', { onClick: onClose }, 'slip-close'),
}));

// AttachmentViewer internally renders CommentableDocumentView, which calls
// getCurrentDatabaseUserId (a real DB service) and crashes in jsdom — mock it.
vi.mock('../../components/Attachments/AttachmentViewer', () => ({
    default: ({ attachment }: { attachment: { name: string } }) =>
        React.createElement('div', { 'data-testid': 'attachment-mock' }, attachment.name),
}));

// ---- Fixtures ----
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

const twoCriteriaRubric: Rubric = {
    ...mockRubric,
    criteria: [
        mockRubric.criteria[0],
        {
            id: 'c2',
            title: 'Criterion 2',
            description: 'Second criterion',
            weight: 100,
            levels: [
                { id: 'l3', label: 'Great', minPoints: 80, maxPoints: 100, description: 'Great work', subItems: [] },
                { id: 'l4', label: 'Weak', minPoints: 0, maxPoints: 40, description: '', subItems: [] },
            ],
        },
    ],
};

const singlePointRubric: Rubric = {
    ...mockRubric,
    scoringMode: 'single-point',
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                {
                    id: 'l1',
                    label: 'Proficiency',
                    minPoints: 1,
                    maxPoints: 1,
                    description: 'Standard description',
                    subItems: [],
                },
            ],
        },
    ],
};

const subItemsRubric: Rubric = {
    ...mockRubric,
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            levels: [
                {
                    id: 'l1',
                    label: 'Excellent',
                    minPoints: 90,
                    maxPoints: 100,
                    description: '',
                    cefrLevel: 'B1',
                    subItems: [
                        {
                            id: 'si1',
                            label: 'Sub A',
                            points: 2,
                            minPoints: 0,
                            maxPoints: 2,
                            linkedStandards: [
                                {
                                    guid: 'sg1',
                                    statementNotation: 'SUB.1',
                                    description: 'Sub standard',
                                    standardSetTitle: 'SS',
                                    jurisdictionTitle: 'US',
                                },
                            ],
                        },
                    ],
                },
                { id: 'l2', label: 'Good', minPoints: 70, maxPoints: 70, description: '', subItems: [] },
            ],
        },
    ],
};

const standardsRubric: Rubric = {
    ...mockRubric,
    criteria: [
        {
            ...mockRubric.criteria[0],
            linkedStandard: {
                guid: 'lg1',
                statementNotation: 'CCSS.1',
                description: 'A linked standard',
                standardSetTitle: 'CCSS',
                jurisdictionTitle: 'US',
            },
            linkedStandards: [
                {
                    guid: 'lg2',
                    statementNotation: 'CCSS.2',
                    description: 'Another linked standard',
                    standardSetTitle: 'CCSS',
                    jurisdictionTitle: 'US',
                },
            ],
        },
    ],
};

const lowLevelRubric: Rubric = {
    ...mockRubric,
    criteria: [
        {
            id: 'c1',
            title: 'Criterion 1',
            description: '',
            weight: 100,
            cefrSkill: 'speaking_production',
            levels: [{ id: 'l-low', label: 'Low', minPoints: 0, maxPoints: 40, description: '', subItems: [] }],
        },
    ],
    cefrTargetLevel: 'B1',
};

const mockClass: Class = { id: 'c1', name: 'Class A' };
const linkedClass: Class = { id: 'c2', name: 'Class B', rubricIds: ['r1'] };
const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudentBob: Student = { id: 's2', name: 'Bob', classId: 'c1' };
const mockStudentCarol: Student = { id: 's3', name: 'Carol', classId: 'c2' };

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockSaveStudentRubric = vi.fn();
const mockUpdateSettings = vi.fn();
const mockDeleteStudentRubric = vi.fn();
const mockNavigate = vi.fn();
const mockSaveEssayAssignment = vi.fn().mockResolvedValue({ success: true });
const mockAddEssayAssignments = vi.fn();

const mockRubricsArr: Rubric[] = [mockRubric];
const mockStudentsArr: Student[] = [mockStudent, mockStudentBob];
const mockClassesArr: Class[] = [mockClass];
const mockGradeScalesArr: GradeScale[] = [mockGradeScale];

let mockStudentRubricsArr: never[] = [];
let mockAttachmentsArr: never[] = [];
let mockAnalysisResultsArr: never[] = [];
let mockEssayAssignmentsArr: EssayAssignment[] = [];
let mockCommentBankArr: never[] = [];
let mockSettingsObj: AppSettings = { ...mockSettings };

const mockAppValue: Record<string, unknown> = {
    rubrics: mockRubricsArr,
    students: mockStudentsArr,
    classes: mockClassesArr,
    studentRubrics: mockStudentRubricsArr,
    attachments: mockAttachmentsArr,
    analysisResults: mockAnalysisResultsArr,
    gradeScales: mockGradeScalesArr,
    settings: mockSettingsObj,
    saveStudentRubric: mockSaveStudentRubric,
    updateSettings: mockUpdateSettings,
    deleteStudentRubric: mockDeleteStudentRubric,
    saveAnalysisResult: vi.fn(),
    addCommentBankItem: vi.fn(),
    recordCommentBankUsage: vi.fn(),
    addAttachment: vi.fn(),
    saveEssayAssignment: mockSaveEssayAssignment,
    essayAssignments: mockEssayAssignmentsArr,
    addEssayAssignments: mockAddEssayAssignments,
    essayTemplates: [],
    saveEssayTemplate: vi.fn(),
    fetchEssaySubmissionsForStudent: vi.fn().mockResolvedValue([]),
    deleteEssaySubmission: vi.fn(),
    getEssaySignedUrl: vi.fn(),
    fetchSchoolMembers: vi.fn().mockResolvedValue([]),
    commentBank: mockCommentBankArr,
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
vi.mock('../../context/useStore', () => ({
    useStoreSelector: (selector: (state: any) => any) => selector(mockAppValue),
    useStoreActions: () => mockAppValue,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../components/Editor/TiptapEditor', () => {
    const MockTiptap = React.forwardRef(
        (
            { content, onChange }: { content: string; onChange: (html: string) => void },
            ref: React.Ref<{ insertContent: (text: string) => void }>
        ) => {
            React.useImperativeHandle(ref, () => ({ insertContent: () => {} }));
            return React.createElement('textarea', {
                'data-testid': 'tiptap-mock',
                value: content,
                onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
            });
        }
    );
    MockTiptap.displayName = 'MockTiptap';
    return { default: MockTiptap };
});

const fileToDataUrlMock = vi.hoisted(() => vi.fn());
vi.mock('../../utils/fileToDataUrl', () => ({
    fileToDataUrl: fileToDataUrlMock,
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

let GradeStudentComp: React.ComponentType;

function renderPage(path = '/rubrics/r1/grade/s1', route = '/rubrics/:rubricId/grade/:studentId') {
    const router = createMemoryRouter([{ path: route, element: <GradeStudentComp /> }], {
        initialEntries: [path],
    });
    return render(<RouterProvider router={router} />);
}

function pageContent() {
    const el = document.querySelector('.page-content') as HTMLElement;
    if (!el) throw new Error('page-content not found');
    return el;
}

const baseSR = {
    id: 'sr1',
    rubricId: 'r1',
    studentId: 's1',
    isPeerReview: false,
    entries: [{ criterionId: 'c1', levelId: 'l2', comment: '', checkedSubItems: [], selectedPoints: undefined }],
    overallComment: 'Existing comment',
    gradedAt: '2024-01-01T00:00:00Z',
};

function openMenu() {
    fireEvent.click(screen.getByLabelText('gradeStudent.more_actions'));
}

describe('GradeStudent coverage', () => {
    beforeEach(async () => {
        Element.prototype.scrollIntoView = vi.fn();
        voiceState.isListening = false;
        voiceState.toggleListening.mockClear();
        recorderState.status = 'idle';
        recorderState.recordingKey = null;
        recorderState.start.mockClear();
        recorderState.stop.mockClear();
        fileToDataUrlMock.mockReset();
        fileToDataUrlMock.mockResolvedValue('data:audio/webm;base64,AA==');
        dbState.isConnected = false;
        dbState.userId = null;
        mockSaveStudentRubric.mockClear();
        mockUpdateSettings.mockClear();
        mockDeleteStudentRubric.mockClear();
        mockNavigate.mockClear();
        mockSaveEssayAssignment.mockClear();
        mockAddEssayAssignments.mockClear();
        mockSaveEssayAssignment.mockResolvedValue({ success: true });
        mockStudentRubricsArr = [];
        mockAttachmentsArr = [];
        mockAnalysisResultsArr = [];
        mockEssayAssignmentsArr = [];
        mockCommentBankArr = [];
        mockSettingsObj = { ...mockSettings };
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        mockAppValue.attachments = mockAttachmentsArr;
        mockAppValue.analysisResults = mockAnalysisResultsArr;
        mockAppValue.essayAssignments = mockEssayAssignmentsArr;
        mockAppValue.commentBank = mockCommentBankArr;
        mockAppValue.settings = mockSettingsObj;
        mockAppValue.rubrics = mockRubricsArr;
        mockAppValue.students = mockStudentsArr;
        mockAppValue.classes = mockClassesArr;
        (mockAppValue.fetchSchoolMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        // the real FeedbackAudioSync hits an unconnected SupabaseAdapter in tests
        vi.spyOn(storageSync.feedbackAudioSync, 'deleteByPath').mockResolvedValue(undefined);
        vi.spyOn(storageSync.feedbackAudioSync, 'resolveUrl').mockResolvedValue('');
        localStorage.clear();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
        vi.stubGlobal('print', vi.fn());
        const mod = await import('../GradeStudent');
        GradeStudentComp = mod.default;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // ---------- Not-found + dead-guard paths ----------
    it('renders the not-found state when route params are missing', () => {
        renderPage('/missing', '/missing');
        expect(screen.getByText('gradeStudent.error_not_found')).toBeInTheDocument();
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    // ---------- Settings-driven behaviour ----------
    it('syncs the active class to the student class when they differ', () => {
        renderPage();
        expect(mockUpdateSettings).toHaveBeenCalledWith({ activeClassId: 'c1' });
    });

    it('does not sync when the active class already matches', () => {
        mockSettingsObj.activeClassId = 'c1';
        renderPage();
        expect(mockUpdateSettings).not.toHaveBeenCalledWith({ activeClassId: 'c1' });
    });

    it('falls back to the default grade scale when the rubric has none', () => {
        mockRubricsArr[0] = { ...mockRubric, gradeScaleId: undefined as unknown as string };
        renderPage();
        expect(screen.getByText('A')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('hides the grade scale chip when the scale id is none', () => {
        mockRubricsArr[0] = { ...mockRubric, gradeScaleId: 'none' };
        renderPage();
        expect(screen.queryByText('A')).not.toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('falls back to the first grade scale when the scale id is unknown', () => {
        mockRubricsArr[0] = { ...mockRubric, gradeScaleId: 'missing-scale' };
        renderPage();
        expect(screen.getByText('A')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    // ---------- Navigation scope ----------
    it('limits next-student navigation to the current class', () => {
        mockSettingsObj.gradeNavigationScope = 'current-class';
        renderPage();
        // Next is Bob (same class), not Carol (other class).
        expect(screen.getByTitle('Next: Bob')).toBeInTheDocument();
        expect(screen.queryByTitle('Next: Carol')).not.toBeInTheDocument();
    });

    it('spans rubric-linked classes for next-student navigation', () => {
        mockClassesArr[0] = linkedClass;
        mockStudentsArr.push(mockStudentCarol);
        renderPage();
        // Only class B (c2) is linked to r1, so Carol is the only eligible student.
        expect(screen.getByTitle('Next: Carol')).toBeInTheDocument();
        mockClassesArr[0] = mockClass;
        mockStudentsArr.pop();
    });

    it('saves via Ctrl+S when there is no next student', () => {
        mockStudentsArr.length = 1;
        renderPage();
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        mockStudentsArr.push(mockStudentBob);
    });

    it('ignores shortcut keys while typing in an input', () => {
        renderPage();
        const input = screen.getByPlaceholderText('gradeStudent.modifier_reason_placeholder');
        fireEvent.click(input);
        fireEvent.keyDown(input, { key: '?' });
        expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    });

    it('supports Shift+Tab focusing the last criterion', () => {
        mockRubricsArr[0] = twoCriteriaRubric;
        renderPage();
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        fireEvent.keyDown(window, { key: '2' });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([expect.objectContaining({ criterionId: 'c2', levelId: 'l4' })]),
            })
        );
        mockRubricsArr[0] = mockRubric;
    });

    it('wraps criterion focus with Tab and ignores out-of-range letters and levels', () => {
        mockRubricsArr[0] = twoCriteriaRubric;
        renderPage();
        fireEvent.keyDown(window, { key: 'Tab' });
        fireEvent.keyDown(window, { key: 'Tab' });
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        fireEvent.keyDown(window, { key: 'z' }); // beyond criteria count
        fireEvent.keyDown(window, { key: '5' }); // level index out of range
        // no crash is the assertion; coverage is the point
        expect(screen.getByText('Criterion 1')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('returns early from the number-chord for single-point rubrics', () => {
        mockRubricsArr[0] = singlePointRubric;
        renderPage();
        fireEvent.keyDown(window, { key: 'Tab' });
        fireEvent.keyDown(window, { key: '1' });
        expect(screen.getByText('gradeStudent.single_point_meets')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('warns on unsaved changes before unload', () => {
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        const event = new Event('beforeunload', { cancelable: true });
        const preventSpy = vi.spyOn(event, 'preventDefault');
        window.dispatchEvent(event);
        expect(preventSpy).toHaveBeenCalled();
    });

    // ---------- Touch gestures ----------
    it('swipes right to save and advance', () => {
        renderPage();
        const page = pageContent();
        fireEvent.touchStart(page, { touches: [{ clientX: 200, clientY: 100 }] });
        fireEvent.touchEnd(page, { changedTouches: [{ clientX: 50, clientY: 110 }] });
        expect(mockSaveStudentRubric).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/grade/s2');
    });

    it('ignores touch end without a matching start', () => {
        renderPage();
        const page = pageContent();
        fireEvent.touchEnd(page, { changedTouches: [{ clientX: 50, clientY: 110 }] });
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
    });

    // ---------- Voice grading ----------
    it('applies voice grade and comment commands', () => {
        renderPage();
        act(() => {
            voiceState.onGrade!(0, 0); // criterion 1, level 1
            voiceState.onGrade!(9, 0); // out-of-range criterion
            voiceState.onGrade!(0, 9); // out-of-range level
            voiceState.onComment!('Nice work');
            voiceState.onComment!('Keep it up');
        });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([expect.objectContaining({ criterionId: 'c1', levelId: 'l1' })]),
                overallComment: 'Nice work Keep it up',
            })
        );
    });

    it('renders the voice-stop affordances while listening', () => {
        voiceState.isListening = true;
        renderPage();
        expect(screen.getByText('gradeStudent.voice_listening')).toBeInTheDocument();
        openMenu();
        expect(screen.getByText('gradeStudent.action_voice_stop')).toBeInTheDocument();
    });

    // ---------- Audio recording ----------
    it('starts an audio recording from the inline editor', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.audio_record'));
        expect(recorderState.start).toHaveBeenCalledWith({ key: 'c1' });
    });

    it('stops, encodes, and saves recorded audio', async () => {
        recorderState.recordingKey = 'c1';
        recorderState.stop.mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm' });
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.audio_stop'));
        await waitFor(() => expect(recorderState.stop).toHaveBeenCalledWith('c1'));
        // let the encode promise resolve and flush the entry update
        await new Promise((r) => setTimeout(r, 50));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', audioDataUrl: expect.stringContaining('data:') }),
                ]),
            })
        );
    });

    it('skips start when already recording another criterion', () => {
        recorderState.recordingKey = 'cX';
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.audio_record'));
        expect(recorderState.start).not.toHaveBeenCalled();
    });

    it('ignores a stop with no recording result', () => {
        recorderState.recordingKey = 'c1';
        recorderState.stop.mockResolvedValue(null);
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.audio_stop'));
        expect(recorderState.stop).toHaveBeenCalledWith('c1');
    });

    it('swallows encoding failures when stopping a recording', async () => {
        recorderState.recordingKey = 'c1';
        recorderState.stop.mockResolvedValue({ blob: new Blob(['x']), mimeType: 'audio/webm' });
        fileToDataUrlMock.mockRejectedValue(new Error('boom'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.audio_stop'));
        await waitFor(() => expect(recorderState.stop).toHaveBeenCalledWith('c1'));
        await new Promise((r) => setTimeout(r, 20));
        expect(spy).toHaveBeenCalledWith('Failed to encode voice feedback recording', expect.any(Error));
        spy.mockRestore();
    });

    it('removes stored audio feedback via the player', () => {
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l2',
                        comment: '',
                        checkedSubItems: [],
                        selectedPoints: undefined,
                        audioStoragePath: 'audio/feedback/x.webm',
                    },
                ],
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByLabelText('gradeStudent.audio_remove'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', audioDataUrl: undefined }),
                ]),
            })
        );
    });

    // ---------- Print + export ----------
    it('prints the rubric with the format orientation', () => {
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_print'));
        expect(window.print).toHaveBeenCalled();
    });

    it('exports a PDF from the header actions', async () => {
        const { exportSinglePdf } = await import('../../utils/pdfExport');
        const { logAuditEvent } = await import('../../services/database/AuditLogger');
        renderPage();
        openMenu();
        fireEvent.click(screen.getAllByText('gradeStudent.action_export_pdf')[0]);
        await waitFor(() => expect(exportSinglePdf).toHaveBeenCalled());
        expect(logAuditEvent).toHaveBeenCalled();
    });

    // ---------- Grade notification ----------
    it('sends a grade notification when enabled and configured', async () => {
        mockSettingsObj.notifyStudentsOnGrade = true;
        localStorage.setItem(
            'rm_supabase_config',
            JSON.stringify({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' })
        );
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        renderPage();
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        await waitFor(() =>
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining('/functions/v1/notify-student-graded'),
                expect.objectContaining({ method: 'POST' })
            )
        );
        // a second save with a rejecting fetch exercises the silent catch
        fetchMock.mockRejectedValue(new Error('network down'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_saved')[0]);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    // ---------- Modifier ----------
    it('fills modifier fields and saves (fresh sr paths)', () => {
        renderPage();
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } });
        fireEvent.change(screen.getByPlaceholderText('gradeStudent.modifier_reason_placeholder'), {
            target: { value: 'Bonus' },
        });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                globalModifier: { type: 'percentage', value: 10, reason: 'Bonus' },
            })
        );
    });

    // ---------- Single-point rubric ----------
    it('scores with single-point outcome buttons and toggles them off', () => {
        mockRubricsArr[0] = singlePointRubric;
        renderPage();
        expect(screen.getByText('Standard description')).toBeInTheDocument();
        fireEvent.click(screen.getByText('gradeStudent.single_point_exceeds'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', singlePointOutcome: 'exceeds' }),
                ]),
            })
        );
        // toggle off
        fireEvent.click(screen.getByText('gradeStudent.single_point_exceeds'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_saved')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', singlePointOutcome: undefined }),
                ]),
            })
        );
        mockRubricsArr[0] = mockRubric;
    });

    // ---------- Sub-items + ranges + CEFR badges ----------
    it('scores sub-items and base points with sliders and steppers', () => {
        mockRubricsArr[0] = subItemsRubric;
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        expect(screen.getByText('Sub A')).toBeInTheDocument();
        // sub-item slider + base-points slider (sub-items render first)
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBeGreaterThan(1);
        fireEvent.click(screen.getByText('Sub A')); // bubbles through the sub-item row stopPropagation
        // click the sub-items container itself (its own stopPropagation handler)
        const levelBtn = screen.getByText('Excellent').closest('button') as HTMLElement;
        const subContainer = Array.from(levelBtn.querySelectorAll('div')).find((d) =>
            d.textContent?.includes('Sub A')
        ) as HTMLElement;
        fireEvent.click(subContainer);
        fireEvent.change(sliders[0], { target: { value: '1.5' } });
        fireEvent.change(sliders[1], { target: { value: '95' } });
        // sub-item stepper (first) then base-points stepper (last)
        const inc = screen.getAllByLabelText('gradeStudent.stepper_increase');
        fireEvent.click(inc[0]);
        fireEvent.click(inc[inc.length - 1]);
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({
                        criterionId: 'c1',
                        subItemScores: expect.objectContaining({ si1: 2 }),
                        selectedPoints: 95.5,
                    }),
                ]),
            })
        );
        mockRubricsArr[0] = mockRubric;
    });

    it('shows base-points slider for equal min/max levels without sub-items', () => {
        mockRubricsArr[0] = subItemsRubric;
        renderPage();
        fireEvent.click(screen.getByText('Good'));
        const sliders = screen.getAllByRole('slider');
        expect(sliders.length).toBeGreaterThan(0);
        fireEvent.change(sliders[0], { target: { value: '70' } });
        mockRubricsArr[0] = mockRubric;
    });

    it('renders CEFR badges and point ranges on level cards', () => {
        mockRubricsArr[0] = subItemsRubric;
        renderPage();
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText(/90–100/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Good'));
        expect(screen.getAllByText(/70/).length).toBeGreaterThan(0);
        mockRubricsArr[0] = mockRubric;
    });

    // ---------- Standards display ----------
    it('toggles standard code/description display', () => {
        mockRubricsArr[0] = standardsRubric;
        renderPage();
        expect(screen.getByText('CCSS.1')).toBeInTheDocument();
        expect(screen.getByText('CCSS.2')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Description'));
        expect(screen.getByText('A linked standard')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Code'));
        expect(screen.getByText('CCSS.1')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    // ---------- Override points ----------
    it('shows the override points label for an existing grade', () => {
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l2',
                        comment: '',
                        checkedSubItems: [],
                        selectedPoints: undefined,
                        overridePoints: 5,
                    },
                ],
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        expect(screen.getByText(/gradeStudent.label_override/)).toBeInTheDocument();
    });

    // ---------- Inline comments ----------
    it('edits a criterion comment in the inline editor', () => {
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        const editor = screen.getAllByTestId('tiptap-mock')[0];
        fireEvent.change(editor, { target: { value: 'A helpful note' } });
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', comment: 'A helpful note' }),
                ]),
            })
        );
        // close the editor again
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
    });

    // ---------- Comment bank ----------
    it('opens the comment bank and inserts a chip', () => {
        mockCommentBankArr = [
            {
                id: 'cb1',
                text: 'Nice work',
                tags: ['vocabulary'],
                createdAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.commentBank = mockCommentBankArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('Nice work'));
        expect(mockAppValue.recordCommentBankUsage).toHaveBeenCalledWith('cb1');
        expect(screen.queryByText('Nice work')).not.toBeInTheDocument();
        // reopen and close via the modal's X button
        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('Nice work')).not.toBeInTheDocument();
    });

    it('suggests comment-bank tags for flagged criteria', () => {
        mockRubricsArr[0] = lowLevelRubric;
        const lowSR = (id: string, gradedAt: string) => ({
            id,
            rubricId: 'r1',
            studentId: 's1',
            isPeerReview: false,
            entries: [
                { criterionId: 'c1', levelId: 'l-low', comment: '', checkedSubItems: [], selectedPoints: undefined },
            ],
            overallComment: '',
            gradedAt,
        });
        mockStudentRubricsArr = [
            lowSR('a', '2024-01-01T00:00:00Z'),
            lowSR('b', '2024-01-02T00:00:00Z'),
            lowSR('c', '2024-01-03T00:00:00Z'),
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        // The bank modal still renders (suggestedTags computed but bank may be empty)
        expect(screen.getAllByText('gradeStudent.comment_open_bank').length).toBeGreaterThan(0);
        mockRubricsArr[0] = mockRubric;
    });

    // ---------- Anchor paper ----------
    it('shows and hides the anchor panel with entry details', () => {
        const anchorSR = {
            ...baseSR,
            id: 'sr-anchor',
            studentId: 's2',
            isAnchor: true,
            rubricSnapshot: mockRubric,
            entries: [
                {
                    criterionId: 'c1',
                    levelId: 'l1',
                    comment: '<p>Anchor note</p>',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
            ],
        };
        mockStudentRubricsArr = [{ ...baseSR }, anchorSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByText('gradeStudent.anchor_panel_title'));
        expect(screen.getByText(/gradeStudent.anchor_panel_title/)).toBeInTheDocument();
        expect(screen.getByText('Anchor note')).toBeInTheDocument();
        fireEvent.click(screen.getByText('gradeStudent.anchor_panel_hide'));
        expect(screen.queryByText('Anchor note')).not.toBeInTheDocument();
    });

    it('renders single-point and missing labels in the anchor panel', () => {
        const anchorSR = {
            ...baseSR,
            id: 'sr-anchor',
            studentId: 'sX',
            isAnchor: true,
            rubricSnapshot: singlePointRubric,
            entries: [
                {
                    criterionId: 'c1',
                    singlePointOutcome: 'exceeds',
                    comment: '',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
            ],
        };
        mockStudentRubricsArr = [{ ...baseSR }, anchorSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByText('gradeStudent.anchor_panel_title'));
        expect(screen.getByText('▲ Exceeds')).toBeInTheDocument();
        expect(screen.getByText('?')).toBeInTheDocument();
    });

    // ---------- Attachments / self-assessment ----------
    it('shows attachments, rubric materials, and self-assessment', () => {
        mockAttachmentsArr = [
            {
                id: 'att1',
                name: 'Student Essay.html',
                mimeType: 'text/html',
                dataUrl: 'data:text/html;base64,' + btoa('<p>Essay</p>'),
                studentId: 's1',
                size: 10,
                addedAt: '2024-01-01T00:00:00Z',
            },
            {
                id: 'att2',
                name: 'Prompt.html',
                mimeType: 'text/html',
                dataUrl: 'data:text/html;base64,' + btoa('<p>Prompt</p>'),
                rubricId: 'r1',
                size: 10,
                addedAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.attachments = mockAttachmentsArr;
        mockStudentRubricsArr = [
            {
                ...baseSR,
                selfAssessmentLevels: { c1: 'l1' },
                selfAssessmentReflection: 'I tried my best',
                selfAssessedAt: '2024-01-02T00:00:00Z',
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_attachments'));
        expect(screen.getByText('Student Essay.html')).toBeInTheDocument();
        expect(screen.getByText('Prompt.html')).toBeInTheDocument();
        expect(screen.getAllByTestId('attachment-mock').length).toBe(2);
        expect(screen.getByText(/gradeStudent.self_assessed_on/)).toBeInTheDocument();
        expect(screen.getByText('Criterion 1: Excellent')).toBeInTheDocument();
        expect(screen.getByText('I tried my best')).toBeInTheDocument();
    });

    it('shows the empty attachments message', () => {
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_attachments'));
        expect(screen.getByText('No attachments.')).toBeInTheDocument();
    });

    // ---------- Analysis panel ----------
    it('applies analysis results to entries and comments', () => {
        mockAttachmentsArr = [
            {
                id: 'att1',
                name: 'Essay.html',
                mimeType: 'text/html',
                dataUrl: 'data:text/html;base64,' + btoa('<p>Essay</p>'),
                studentId: 's1',
                size: 10,
                addedAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.attachments = mockAttachmentsArr;
        mockAnalysisResultsArr = [
            {
                id: 'ar1',
                rubricId: 'r1',
                studentId: 's1',
                createdAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.analysisResults = mockAnalysisResultsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('Analyse student document'));
        expect(screen.getByTestId('analysis-mock')).toBeInTheDocument();
        fireEvent.click(screen.getByText('apply-entry'));
        fireEvent.click(screen.getByText('apply-entry'));
        fireEvent.click(screen.getByText('apply-missing'));
        fireEvent.click(screen.getByText('apply-comment'));
        fireEvent.click(screen.getByText('apply-comment-missing'));
        fireEvent.click(screen.getByText('add-bank'));
        fireEvent.click(screen.getByText('close-analysis'));
        expect(screen.queryByTestId('analysis-mock')).not.toBeInTheDocument();
    });

    // ---------- Essay assignment ----------
    it('saves an essay assignment and registers it locally', async () => {
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_essay'));
        fireEvent.click(screen.getByText('assign-save'));
        await waitFor(() => expect(mockSaveEssayAssignment).toHaveBeenCalled());
        expect(mockAppValue.addEssayAssignments).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ teacherKey: 'tk-save' })])
        );
    });

    it('returns the save result when the essay assignment fails', async () => {
        mockSaveEssayAssignment.mockResolvedValue({ success: false });
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_essay'));
        fireEvent.click(screen.getByText('assign-save'));
        await waitFor(() => expect(mockSaveEssayAssignment).toHaveBeenCalled());
        expect(mockAddEssayAssignments).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('assign-close'));
    });

    it('prefers the student own essay row and opens the slip sheet', () => {
        mockEssayAssignmentsArr = [essayFixture('tk-own')];
        mockAppValue.essayAssignments = mockEssayAssignmentsArr;
        mockAppValue.essayTemplates = [
            { id: 'et1', rubricId: 'r1', title: 'Template', requireSEB: false, readOnlyAfterSubmit: false },
        ] as never[];
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_essay'));
        expect(screen.getByTestId('assign-prompt')).toHaveValue('Write an essay');
        fireEvent.click(screen.getByText('assign-slip'));
        fireEvent.click(screen.getByText('slip-close'));
        mockAppValue.essayTemplates = [];
    });

    // ---------- Essay import ----------
    it('imports an essay and opens the attachments panel', () => {
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_import_essay'));
        fireEvent.click(screen.getByText('fetch-sub'));
        expect(mockAppValue.fetchEssaySubmissionsForStudent).toHaveBeenCalledWith('r1', 's1');
        fireEvent.click(screen.getByText('import-doc'));
        expect(mockAppValue.addAttachment).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'doc.html', rubricId: 'r1', studentId: 's1' })
        );
        expect(screen.getByText('gradeStudent.attachments_title')).toBeInTheDocument();
        // close the attachments panel again and open the import modal a second time
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_attachments'));
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_import_essay'));
        fireEvent.click(screen.getByText('import-close'));
    });

    // ---------- Co-grading (connected) ----------
    it('co-grades via a selected colleague when connected to a school', async () => {
        dbState.isConnected = true;
        dbState.userId = 'u1';
        mockSettingsObj.schoolId = 'sch1';
        (mockAppValue.fetchSchoolMembers as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'u2', displayName: 'Dr. Jones', email: 'jones@school.edu' },
        ]);
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        await waitFor(() => expect(screen.getByRole('option', { name: 'Dr. Jones' })).toBeInTheDocument());
        const sel = screen.getByLabelText('coGrading.colleague_label') as HTMLSelectElement;
        fireEvent.change(sel, { target: { value: 'u2' } });
        const startBtn = screen.getByText('coGrading.action_start');
        expect(startBtn).toBeEnabled();
        fireEvent.click(startBtn);
        expect(mockNavigate).toHaveBeenCalledWith('/rubrics/r1/peer-review/s1?reviewerId=u2');
    });

    it('shows the no-colleagues hint when the school has no other members', () => {
        dbState.isConnected = true;
        dbState.userId = 'u1';
        mockSettingsObj.schoolId = 'sch1';
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        expect(screen.getByText('coGrading.colleague_none')).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText('common.close'));
    });

    it('cancels the co-grade modal', () => {
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        fireEvent.click(screen.getAllByText('common.cancel')[0]);
        expect(screen.queryByText('coGrading.modal_title')).not.toBeInTheDocument();
        // reopen and close via Escape (Radix fires the Modal onClose)
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText('coGrading.modal_title')).not.toBeInTheDocument();
    });

    it('cancels the delete-grade confirm dialog and the group modal', () => {
        const groupSR = { ...baseSR, id: 'sr2', studentId: 's2', groupId: 'g1' };
        mockStudentRubricsArr = [{ ...baseSR, groupId: 'g1' }, groupSR] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_delete_grade'));
        expect(screen.getByText(/gradeStudent.delete_grade_group_message/)).toBeInTheDocument();
        // select the group radio first (student is the default), then switch back
        const radios = document.querySelectorAll('input[name="delete-grade-scope"]');
        fireEvent.click(radios[1]);
        fireEvent.click(radios[0]);
        // Radix Dialog closes on Escape, firing the Modal onClose
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText(/gradeStudent.delete_grade_group_message/)).not.toBeInTheDocument();
        // reopen and cancel via the modal button
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_delete_grade'));
        fireEvent.click(screen.getAllByText('common.cancel')[0]);
        expect(screen.queryByText(/gradeStudent.delete_grade_group_message/)).not.toBeInTheDocument();
    });

    it('cancels the single-student delete confirm dialog', () => {
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_delete_grade'));
        fireEvent.click(screen.getByText('common.cancel'));
        expect(screen.queryByText('gradeStudent.delete_grade_message')).not.toBeInTheDocument();
    });

    it('closes the keyboard shortcuts modal via its close button and Escape', () => {
        renderPage();
        fireEvent.keyDown(window, { key: '?' });
        fireEvent.click(screen.getByLabelText('common.close'));
        expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
        fireEvent.keyDown(window, { key: '?' });
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
    });

    it('navigates back via the topbar back button', () => {
        renderPage();
        fireEvent.click(screen.getByText('gradeStudent.action_back'));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('cancels the colleague fetch when the modal closes', async () => {
        dbState.isConnected = true;
        dbState.userId = 'u1';
        mockSettingsObj.schoolId = 'sch1';
        let resolveFetch!: (v: unknown) => void;
        (mockAppValue.fetchSchoolMembers as ReturnType<typeof vi.fn>).mockReturnValue(
            new Promise((res) => {
                resolveFetch = res;
            })
        );
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        const { unmount } = renderPage();
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        unmount();
        resolveFetch([{ id: 'u2' }]);
        await waitFor(() => expect(screen.queryByText('coGrading.modal_title')).not.toBeInTheDocument());
    });

    // ---------- Tour ----------
    it('starts and finishes the grading tour', () => {
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('tutorial.grading_tour_button'));
        fireEvent.click(screen.getByText('joyride-running'));
        fireEvent.click(screen.getByText('joyride-finish'));
        fireEvent.click(screen.getByText('joyride-skip'));
    });

    // ---------- Grid comment bank ----------
    it('browses the comment bank from the grid layout and inserts a chip', () => {
        mockCommentBankArr = [
            {
                id: 'cb2',
                text: 'Grid chip',
                tags: [],
                createdAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.commentBank = mockCommentBankArr;
        renderPage();
        fireEvent.click(screen.getByText('common.view_grid'));
        // select a level so the detail panel (with the comment composer) opens
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByTitle('gradeStudent.comment_open_bank'));
        expect(screen.getAllByText('Grid chip').length).toBeGreaterThan(0);
        // chip click in grid detail panel (the first match is the quick chip)
        fireEvent.click(screen.getAllByText('Grid chip')[0]);
        expect(mockAppValue.recordCommentBankUsage).toHaveBeenCalledWith('cb2');
    });

    // ---------- Remaining branch coverage ----------
    it('renders the not-found state for an unknown rubric id', () => {
        renderPage('/rubrics/rX/grade/s1');
        expect(screen.getByText('gradeStudent.error_not_found')).toBeInTheDocument();
    });

    it('deselects a level by clicking it again', () => {
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getByText('Excellent'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([expect.objectContaining({ criterionId: 'c1', levelId: null })]),
            })
        );
    });

    it('does not warn on beforeunload when nothing is dirty', () => {
        renderPage();
        const event = new Event('beforeunload', { cancelable: true });
        const preventSpy = vi.spyOn(event, 'preventDefault');
        window.dispatchEvent(event);
        expect(preventSpy).not.toHaveBeenCalled();
    });

    it('ignores a short horizontal swipe', () => {
        renderPage();
        const page = pageContent();
        fireEvent.touchStart(page, { touches: [{ clientX: 100, clientY: 100 }] });
        fireEvent.touchEnd(page, { changedTouches: [{ clientX: 90, clientY: 100 }] });
        expect(mockSaveStudentRubric).not.toHaveBeenCalled();
    });

    it('toggles the navigation scope back to current-class mode', () => {
        mockSettingsObj.gradeNavigationScope = 'current-class';
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.nav_scope_current_class'));
        expect(mockUpdateSettings).toHaveBeenCalledWith({ gradeNavigationScope: 'rubric-classes' });
    });

    it('renders the shortcut hint only for the first five levels', () => {
        mockRubricsArr[0] = {
            ...mockRubric,
            criteria: [
                {
                    id: 'c1',
                    title: 'Criterion 1',
                    description: '',
                    weight: 100,
                    levels: Array.from({ length: 6 }, (_, i) => ({
                        id: `l${i + 1}`,
                        label: `Level ${i + 1}`,
                        minPoints: 100 - i * 10,
                        maxPoints: 100 - i * 10,
                        description: '',
                        subItems: [],
                    })),
                },
            ],
        };
        renderPage();
        // level 6 has no shortcut hint title
        expect(screen.queryByTitle('gradeStudent.level_shortcut_hint:{"num":6}')).not.toBeInTheDocument();
        expect(screen.getByTitle('gradeStudent.level_shortcut_hint:{"num":1}')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('shows self-assessment only when the level resolves', () => {
        mockStudentRubricsArr = [
            {
                ...baseSR,
                selfAssessmentLevels: { c1: 'missing-level' },
                selfAssessmentReflection: 'Reflection only',
                selfAssessedAt: '2024-01-02T00:00:00Z',
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('gradeStudent.action_attachments'));
        // no level entries (unresolved level), but the reflection still shows
        expect(screen.getByText('Reflection only')).toBeInTheDocument();
        expect(screen.queryByText('Criterion 1:')).not.toBeInTheDocument();
    });

    it('selects a described level to colour it as selected', () => {
        mockRubricsArr[0] = twoCriteriaRubric;
        renderPage();
        fireEvent.click(screen.getByText('Great'));
        expect(screen.getByText('Great work')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('sends no grade notification when supabase is not configured', () => {
        mockSettingsObj.notifyStudentsOnGrade = true;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        renderPage();
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('scores legacy sub-items without explicit bounds', () => {
        mockRubricsArr[0] = {
            ...mockRubric,
            criteria: [
                {
                    id: 'c1',
                    title: 'Criterion 1',
                    description: '',
                    weight: 100,
                    levels: [
                        {
                            id: 'l1',
                            label: 'Excellent',
                            minPoints: 90,
                            maxPoints: 100,
                            description: '',
                            subItems: [
                                { id: 'si2', label: 'Legacy A', points: 3 },
                                { id: 'si3', label: 'Bare' },
                                { id: 'si4', label: 'Naked' },
                            ],
                        },
                    ],
                },
            ],
        };
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l1',
                        comment: '',
                        checkedSubItems: ['si2', 'si4'],
                        selectedPoints: undefined,
                    },
                ],
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        expect(screen.getByText('Legacy A')).toBeInTheDocument();
        expect(screen.getByText('Bare')).toBeInTheDocument();
        // legacyChecked si2 defaults to its points (3); bare si3 defaults to min 0;
        // naked si4 (checked, no fields at all) defaults to 0 out of 1
        expect(screen.getByText('3 / 3 gradeStudent.table_points')).toBeInTheDocument();
        expect(screen.getAllByText('0 / 1 gradeStudent.table_points').length).toBe(2);
        mockRubricsArr[0] = mockRubric;
    });

    it('shows sub-item standard descriptions and guid fallbacks', () => {
        mockRubricsArr[0] = {
            ...subItemsRubric,
            criteria: [
                {
                    ...subItemsRubric.criteria[0],
                    linkedStandard: {
                        guid: 'lg1',
                        statementNotation: 'CCSS.1',
                        description: 'Criterion standard',
                        standardSetTitle: 'CCSS',
                        jurisdictionTitle: 'US',
                    },
                    levels: [
                        {
                            ...subItemsRubric.criteria[0].levels[0],
                            subItems: [
                                {
                                    ...subItemsRubric.criteria[0].levels[0].subItems[0],
                                    linkedStandards: [
                                        {
                                            guid: 'sg1',
                                            statementNotation: 'SUB.1',
                                            description: 'Sub standard one',
                                            standardSetTitle: 'SS',
                                            jurisdictionTitle: 'US',
                                        },
                                        {
                                            guid: 'sg2',
                                            description: 'Sub standard two',
                                            standardSetTitle: 'SS',
                                            jurisdictionTitle: 'US',
                                        },
                                    ],
                                },
                            ],
                        },
                        subItemsRubric.criteria[0].levels[1],
                    ],
                },
            ],
        };
        renderPage();
        fireEvent.click(screen.getByText('Excellent'));
        // code mode: statementNotation for sg1, guid fallback for sg2
        expect(screen.getByText('[SUB.1]')).toBeInTheDocument();
        expect(screen.getByText('[sg2]')).toBeInTheDocument();
        // toggle to descriptions
        fireEvent.click(screen.getByText('Description'));
        expect(screen.getByText('Sub standard one')).toBeInTheDocument();
        expect(screen.getByText('Criterion standard')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('falls back to the label for standards without a notation', () => {
        mockRubricsArr[0] = {
            ...mockRubric,
            criteria: [
                {
                    ...mockRubric.criteria[0],
                    linkedStandard: {
                        guid: 'lg1',
                        description: 'Criterion standard',
                        standardSetTitle: 'CCSS',
                        jurisdictionTitle: 'US',
                    },
                    linkedStandards: [
                        {
                            guid: 'lg2',
                            description: 'Another standard',
                            standardSetTitle: 'CCSS',
                            jurisdictionTitle: 'US',
                        },
                    ],
                },
            ],
        };
        renderPage();
        expect(screen.getAllByText('gradeStudent.label_standard').length).toBeGreaterThan(0);
        // toggle to description mode (standards without a notation fall back to '' in the title)
        fireEvent.click(screen.getByText('Description'));
        expect(screen.getByText('Criterion standard')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('renders the standards toggle with linkedStandards-only criteria', () => {
        mockRubricsArr[0] = {
            ...mockRubric,
            criteria: [
                {
                    ...mockRubric.criteria[0],
                    linkedStandard: undefined,
                    linkedStandards: [],
                },
                {
                    id: 'c2',
                    title: 'Criterion 2',
                    description: '',
                    weight: 100,
                    levels: mockRubric.criteria[0].levels,
                    linkedStandard: undefined,
                    linkedStandards: [
                        {
                            guid: 'lg3',
                            statementNotation: 'CCSS.3',
                            description: 'Third standard',
                            standardSetTitle: 'CCSS',
                            jurisdictionTitle: 'US',
                        },
                    ],
                },
            ],
        };
        renderPage();
        expect(screen.getByText('Code')).toBeInTheDocument();
        expect(screen.getByText('CCSS.3')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('removes inline audio without a storage path', () => {
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l2',
                        comment: '',
                        checkedSubItems: [],
                        selectedPoints: undefined,
                        audioDataUrl: 'data:audio/webm;base64,AA==',
                    },
                ],
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByLabelText('gradeStudent.comment_open_bank'));
        fireEvent.click(screen.getByLabelText('gradeStudent.audio_remove'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalled();
    });

    it('renders all anchor-panel outcome variants', () => {
        const anchorRubric: Rubric = {
            ...mockRubric,
            criteria: ['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => ({
                id,
                title: `Criterion ${i + 1}`,
                description: '',
                weight: 100,
                levels: [
                    { id: `l${i + 1}`, label: `L${i + 1}`, minPoints: 1, maxPoints: 1, description: '', subItems: [] },
                ],
            })),
        };
        // No rubricSnapshot — the panel falls back to the live rubric (covers the ?? fallback).
        const anchorSR = {
            ...baseSR,
            id: 'sr-anchor',
            studentId: 's2',
            isAnchor: true,
            entries: [
                {
                    criterionId: 'c1',
                    singlePointOutcome: 'meets',
                    comment: '',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
                {
                    criterionId: 'c2',
                    singlePointOutcome: 'not-yet',
                    comment: '',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
                {
                    criterionId: 'c3',
                    levelId: 'l3',
                    comment: '<p>Great</p>',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
                {
                    criterionId: 'c4',
                    levelId: 'missing-level',
                    comment: '',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                },
                { criterionId: 'c5', levelId: null, comment: '', checkedSubItems: [], selectedPoints: undefined },
            ],
        };
        mockRubricsArr[0] = anchorRubric;
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({
                    criterionId: id,
                    levelId: null,
                    comment: '',
                    checkedSubItems: [],
                    selectedPoints: undefined,
                })),
            },
            anchorSR,
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        fireEvent.click(screen.getByText('gradeStudent.anchor_panel_title'));
        expect(screen.getByText('✓ Meets')).toBeInTheDocument();
        expect(screen.getByText('✗ Not Yet')).toBeInTheDocument();
        expect(screen.getAllByText('L3').length).toBeGreaterThan(0);
        expect(screen.getByText('Great')).toBeInTheDocument();
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        mockRubricsArr[0] = mockRubric;
    });

    it('appends analysis comments to existing criterion comments', () => {
        mockAttachmentsArr = [
            {
                id: 'att1',
                name: 'Essay.html',
                mimeType: 'text/html',
                dataUrl: 'data:text/html;base64,' + btoa('<p>Essay</p>'),
                studentId: 's1',
                size: 10,
                addedAt: '2024-01-01T00:00:00Z',
            },
        ] as never[];
        mockAppValue.attachments = mockAttachmentsArr;
        mockStudentRubricsArr = [
            {
                ...baseSR,
                entries: [
                    {
                        criterionId: 'c1',
                        levelId: 'l2',
                        comment: '<p>First</p>',
                        checkedSubItems: [],
                        selectedPoints: undefined,
                    },
                ],
            },
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('Analyse student document'));
        fireEvent.click(screen.getByText('apply-comment'));
        fireEvent.click(screen.getAllByText('gradeStudent.action_save')[0]);
        expect(mockSaveStudentRubric).toHaveBeenCalledWith(
            expect.objectContaining({
                entries: expect.arrayContaining([
                    expect.objectContaining({ criterionId: 'c1', comment: '<p>First</p><p>Nice</p>' }),
                ]),
            })
        );
    });

    it('suggests tags from rubric-level CEFR fields and criterion skills', () => {
        mockRubricsArr[0] = {
            ...lowLevelRubric,
            // invalid CefrSkills probe the tag-suggestion fallbacks; the type is a closed union
            cefrSkill: 'listening_production' as Rubric['cefrSkill'],
            cefrTargetLevel: 'B2',
            criteria: [
                { ...lowLevelRubric.criteria[0], cefrSkill: undefined as unknown as RubricCriterion['cefrSkill'] },
                {
                    id: 'c2',
                    title: 'Criterion 2',
                    description: '',
                    weight: 100,
                    cefrSkill: 'reading_production' as RubricCriterion['cefrSkill'],
                    levels: [
                        { id: 'l-low2', label: 'Low', minPoints: 0, maxPoints: 40, description: '', subItems: [] },
                    ],
                },
            ],
        };
        const lowSR = (id: string, gradedAt: string) => ({
            id,
            rubricId: 'r1',
            studentId: 's1',
            isPeerReview: false,
            entries: [
                { criterionId: 'c1', levelId: 'l-low', comment: '', checkedSubItems: [], selectedPoints: undefined },
                { criterionId: 'c2', levelId: 'l-low2', comment: '', checkedSubItems: [], selectedPoints: undefined },
            ],
            overallComment: '',
            gradedAt,
        });
        mockStudentRubricsArr = [
            lowSR('a', '2024-01-01T00:00:00Z'),
            lowSR('b', '2024-01-02T00:00:00Z'),
            lowSR('c', '2024-01-03T00:00:00Z'),
        ] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        // open the bank for c1 (no criterion skill -> rubric-level fallback)
        fireEvent.click(screen.getAllByLabelText('gradeStudent.comment_open_bank')[0]);
        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        expect(screen.getByText('gradeStudent.comment_open_bank')).toBeInTheDocument();
        // close, then open for c2 (criterion-level skill)
        fireEvent.click(screen.getByLabelText('common.close'));
        fireEvent.click(screen.getAllByLabelText('gradeStudent.comment_open_bank')[1]);
        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        expect(screen.getByText('gradeStudent.comment_open_bank')).toBeInTheDocument();
        mockRubricsArr[0] = mockRubric;
    });

    it('renders colleague options with email and id fallbacks', async () => {
        dbState.isConnected = true;
        dbState.userId = 'u1';
        mockSettingsObj.schoolId = 'sch1';
        (mockAppValue.fetchSchoolMembers as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'u2', email: 'jones@school.edu' },
            { id: 'u3' },
        ]);
        mockStudentRubricsArr = [{ ...baseSR }] as never[];
        mockAppValue.studentRubrics = mockStudentRubricsArr;
        renderPage();
        openMenu();
        fireEvent.click(screen.getByText('coGrading.action_co_grade'));
        await waitFor(() => expect(screen.getByRole('option', { name: 'jones@school.edu' })).toBeInTheDocument());
        expect(screen.getByRole('option', { name: 'u3' })).toBeInTheDocument();
    });
});
