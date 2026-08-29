import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, DocumentAnalysisResult, Rubric, Student, CefrLevel } from '../../types';
import type { getClassVocabProfile } from '../../utils/vocabProfileAggregator';

type ClassVocabProfile = ReturnType<typeof getClassVocabProfile>;

const mockSettings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
};

const mockStudents: Student[] = [
    { id: 's1', name: 'Alice', classId: 'c1' },
    { id: 's2', name: 'Bob', classId: 'c1' },
];

const mockClasses: Class[] = [{ id: 'c1', name: 'Class A' }];

const mockRubric: Rubric = {
    id: 'r1',
    name: 'Essay Rubric',
    subject: 'English',
    description: '',
    criteria: [],
    gradeScaleId: 'gs1',
    format: DEFAULT_FORMAT,
    attachmentIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    totalMaxPoints: 100,
    scoringMode: 'weighted-percentage',
    vocabularyItems: [{ id: 'v1', phrase: 'phenomenon', category: 'vocabulary', cefrLevel: 'C1' }],
};

const mockAnalysisResults: DocumentAnalysisResult[] = [
    {
        id: 'a1',
        studentId: 's1',
        rubricId: 'r1',
        attachmentId: 'att1',
        extractedText: 'The phenomenon of globalisation has transformed structures.',
        analyzedAt: '2024-01-01T00:00:00Z',
        detectedItems: [],
        grammarErrors: [],
        grammarCheckerUsed: 'none',
    },
];

const mocks = vi.hoisted(() => ({
    getAllClassVocabProfiles: vi.fn(),
    collectVocabExportRows: vi.fn(),
    saveAs: vi.fn(),
}));

vi.mock('../../context/AppContext', () => {
    const makeAppContextMock = () => ({
        rubrics: [mockRubric],
        students: mockStudents,
        classes: mockClasses,
        studentRubrics: [],
        settings: mockSettings,
        analysisResults: mockAnalysisResults,
        updateSettings: vi.fn(),
    });
    return {
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
    };
});

vi.mock('../../utils/vocabProfileAggregator', () => ({
    getAllClassVocabProfiles: mocks.getAllClassVocabProfiles,
    collectVocabExportRows: mocks.collectVocabExportRows,
}));

vi.mock('file-saver', () => ({ saveAs: mocks.saveAs }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

const zeroCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 } as Record<CefrLevel, number>;

const classProfiles: ClassVocabProfile[] = [
    {
        classId: 'c1',
        className: 'Class A',
        levelCounts: zeroCounts,
        levelStats: [],
        totalWords: 10,
        estimatedLevel: 'B1',
        offListPercent: 0,
        awlPercent: 0,
        nawlPercent: 0,
        studentProfiles: [
            {
                studentId: 's1',
                studentName: 'Alice',
                levelCounts: zeroCounts,
                levelStats: [],
                totalWords: 5,
                estimatedLevel: 'B1',
                analysisCount: 2,
                offListPercent: 0,
                awlPercent: 0,
                nawlPercent: 0,
            },
            {
                studentId: 's2',
                studentName: 'Bob',
                levelCounts: zeroCounts,
                levelStats: [],
                totalWords: 5,
                estimatedLevel: 'A2',
                analysisCount: 1,
                offListPercent: 0,
                awlPercent: 0,
                nawlPercent: 0,
            },
        ],
    },
];

beforeEach(() => {
    mocks.getAllClassVocabProfiles.mockReturnValue(classProfiles);
    mocks.collectVocabExportRows.mockReturnValue([
        { word: 'phenomenon', level: 'C1', definition: 'an event', source: 'analysis' },
    ]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('VocabularyDashboardPage coverage', () => {
    it('renders the class and student drill-down with links', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        renderWithRouter(<VocabularyDashboardPage />);

        expect(screen.getByText('vocabProfile.class_distribution_title')).toBeInTheDocument();
        const select = screen.getByLabelText('vocabProfile.label_class_filter');
        fireEvent.change(select, { target: { value: 'c1' } });

        // single-class titles + drill-down table
        expect(screen.getByText('vocabProfile.class_distribution_title_single')).toBeInTheDocument();
        expect(screen.getByText('vocabProfile.student_drilldown_title')).toBeInTheDocument();
        expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
        expect(screen.getAllByText('5')).toHaveLength(2); // totalWords cells
        expect(screen.getAllByText('2').length).toBeGreaterThan(0); // analysisCount cell
        expect(screen.getAllByText('B1').length).toBeGreaterThan(0); // CefrBadge
        expect(screen.getAllByText('A2').length).toBeGreaterThan(0);

        // both drill-down links point at the right routes
        const links = screen.getAllByRole('link');
        expect(links.some((l) => l.getAttribute('href') === '/students/s1/cefr-overview')).toBe(true);
        expect(links.some((l) => l.getAttribute('href') === '/students/s1/learning-path')).toBe(true);
    });

    it('exports CSV for all bands with the fallback suffix', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        renderWithRouter(<VocabularyDashboardPage />);

        fireEvent.click(screen.getByText('vocabProfile.export_csv'));
        expect(mocks.collectVocabExportRows).toHaveBeenCalledWith([mockRubric], mockAnalysisResults, undefined);
        expect(mocks.saveAs).toHaveBeenCalledTimes(1);
        const [blob, filename] = mocks.saveAs.mock.calls[0];
        expect(blob).toBeInstanceOf(Blob);
        expect(filename).toBe('vocabProfile.csv_filename_vocabProfile.csv_band_all.csv');
    });

    it('exports CSV for a specific CEFR band', async () => {
        const { default: VocabularyDashboardPage } = await import('../VocabularyDashboardPage');
        renderWithRouter(<VocabularyDashboardPage />);

        fireEvent.change(screen.getByLabelText('vocabProfile.label_export_band'), { target: { value: 'B1' } });
        fireEvent.click(screen.getByText('vocabProfile.export_csv'));
        expect(mocks.collectVocabExportRows).toHaveBeenCalledWith([mockRubric], mockAnalysisResults, 'B1');
        const [blob, filename] = mocks.saveAs.mock.calls[0];
        expect(blob).toBeInstanceOf(Blob);
        expect(filename).toBe('vocabProfile.csv_filename_B1.csv');
    });
});
