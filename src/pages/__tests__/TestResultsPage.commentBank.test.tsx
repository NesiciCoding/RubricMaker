import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, GradeScale, Test as RmTest, StudentTest, Student, CommentBankItem } from '../../types';
import type { StoreData } from '../../store/storage';

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

const mockTest: RmTest = {
    id: 't1',
    name: 'Quiz',
    questions: [{ id: 'q-open', prompt: 'Explain', type: 'open', points: 6 }],
    requireSEB: false,
    shuffleQuestions: false,
    gradeScaleId: 'gs1',
    createdAt: '2026-01-01T00:00:00.000Z',
};

const mockStudent: Student = { id: 's1', name: 'Alice', classId: 'c1' };

const mockStudentTest: StudentTest = {
    id: 'st1',
    testId: 't1',
    studentId: 's1',
    answers: [{ questionId: 'q-open', response: 'My reasoning' }],
    status: 'submitted',
    startedAt: '2026-01-01T09:00:00.000Z',
    submittedAt: '2026-01-01T09:30:00.000Z',
};

const bankItem: CommentBankItem = { id: 'cb1', text: 'Great work', tags: [], createdAt: '2026-01-01T00:00:00.000Z' };

const mockRecordUsage = vi.fn();
const mockAddItem = vi.fn();

const mockUseApp = {
    tests: [mockTest],
    studentTests: [mockStudentTest],
    students: [mockStudent],
    studentRubrics: [],
    gradeScales: [mockGradeScale],
    settings: mockSettings,
    classes: [{ id: 'c1', name: 'Class 1' }],
    updateSettings: vi.fn(),
    saveStudentTest: vi.fn(),
    recordCommentBankUsage: mockRecordUsage,
    addCommentBankItem: mockAddItem,
};

vi.mock('../../context/AppContext', () => ({
    useRoster: () => mockUseApp,
    useStudents: () => mockUseApp,
    useClasses: () => mockUseApp,
    useGrading: () => mockUseApp,
    useAuthoring: () => mockUseApp,
    useAssessment: () => mockUseApp,
    useEssays: () => mockUseApp,
    useFlashcards: () => mockUseApp,
    useSettings: () => mockUseApp,
    usePlatform: () => mockUseApp,
}));

vi.mock('../../context/useStore', () => ({
    useStoreSelector: <T,>(selector: (state: StoreData) => T): T => selector(mockUseApp as unknown as StoreData),
    useStoreActions: () => mockUseApp,
}));

// Isolate TestResultsPage's wiring from CommentBankManager internals: the stub
// exposes one button that fires onSelect with a known bank item.
vi.mock('../../components/Comments/CommentBankModal', () => ({
    default: ({ onSelect }: { onSelect?: (item: CommentBankItem) => void }) => (
        <button onClick={() => onSelect?.(bankItem)}>pick-bank-item</button>
    ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/tests/t1/results/st1']}>
            <Routes>
                <Route path="/tests/:testId/results/:studentTestId" element={<TestResultsPage />} />
            </Routes>
        </MemoryRouter>
    );
}

let TestResultsPage: React.ComponentType;

describe('TestResultsPage comment bank', () => {
    beforeEach(async () => {
        mockRecordUsage.mockClear();
        mockAddItem.mockClear();
        TestResultsPage = (await import('../TestResultsPage')).default;
    });

    it('inserts a bank comment into the question feedback and records usage', () => {
        renderPage();
        fireEvent.click(screen.getByText('tests.results.insert_comment'));
        fireEvent.click(screen.getByText('pick-bank-item'));

        const feedback = screen.getByLabelText('tests.results.feedback_label') as HTMLTextAreaElement;
        expect(feedback.value).toContain('Great work');
        expect(mockRecordUsage).toHaveBeenCalledWith('cb1');
    });

    it('saves typed feedback back to the comment bank', () => {
        renderPage();
        const feedback = screen.getByLabelText('tests.results.feedback_label') as HTMLTextAreaElement;
        fireEvent.change(feedback, { target: { value: 'Nice argument' } });
        fireEvent.click(screen.getByText('tests.results.save_as_comment'));

        expect(mockAddItem).toHaveBeenCalledWith('Nice argument', []);
    });
});
