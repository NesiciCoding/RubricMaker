import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DEFAULT_FORMAT } from '../../types';
import type { AppSettings, Class, Student, StudentTest, Test } from '../../types';
import GrammarOverviewPage from '../GrammarOverviewPage';
import StudentGrammarOverviewPage from '../StudentGrammarOverviewPage';

const settings: AppSettings = {
    defaultGradeScaleId: 'gs1',
    theme: 'dark',
    language: 'en',
    accentColor: '#3b82f6',
    defaultFormat: DEFAULT_FORMAT,
    activeClassId: 'c1',
};

const classes: Class[] = [{ id: 'c1', name: '2V', voTrack: 'havo' }];
const students: Student[] = [
    { id: 's1', name: 'Ava de Vries', classId: 'c1', voTrack: 'havo' },
    { id: 's2', name: 'Noor Yilmaz', classId: 'c1', voTrack: 'havo' },
];

const tests: Test[] = [
    {
        id: 't1',
        name: 'Unit 3',
        requireSEB: false,
        shuffleQuestions: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        questions: [
            {
                id: 'q1',
                prompt: 'She ___ here.',
                type: 'cloze',
                points: 1,
                linkedGrammarItemId: 'gr-present-simple-affirmative',
            },
        ],
    } as Test,
];

const studentTests: StudentTest[] = [
    {
        id: 'st1',
        testId: 't1',
        studentId: 's1',
        answers: [{ questionId: 'q1', response: '', pointsEarned: 1 }],
        status: 'graded',
        startedAt: '2026-01-01T00:00:00.000Z',
    },
    {
        id: 'st2',
        testId: 't1',
        studentId: 's2',
        answers: [{ questionId: 'q1', response: '', pointsEarned: 0 }],
        status: 'graded',
        startedAt: '2026-01-01T00:00:00.000Z',
    },
];

vi.mock('../../context/AppContext', () => {
    // Built on call, not while the factory is hoisted: the fixtures above are not initialised yet then.
    const store = () => ({
        students,
        classes,
        tests,
        studentTests,
        rubrics: [],
        studentRubrics: [],
        settings,
    });
    return {
        useStudents: store,
        useClasses: store,
        useGrading: store,
        useAuthoring: store,
        useAssessment: store,
        useSettings: store,
    };
});

vi.mock('../../context/useStore', () => ({
    useStoreSelector: (
        selector: (state: {
            students: Student[];
            classes: Class[];
            rubrics: never[];
            studentRubrics: never[];
            tests: Test[];
            studentTests: StudentTest[];
        }) => unknown
    ) =>
        selector({
            students,
            classes,
            rubrics: [],
            studentRubrics: [],
            tests,
            studentTests,
        }),
}));

vi.mock('../../components/Layout/Topbar', () => ({
    default: ({ title }: { title: string }) => React.createElement('h1', null, title),
}));

vi.mock('react-i18next', async () => {
    const en = (await import('../../locales/en.json')).default as Record<string, unknown>;
    const lookup = (key: string): unknown =>
        key.split('.').reduce<unknown>((acc, part) => {
            if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
            return undefined;
        }, en);
    const translate = (key: string, params?: Record<string, unknown>): string => {
        const value = lookup(key);
        if (typeof value !== 'string') return key;
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(params?.[name] ?? ''));
    };
    return {
        useTranslation: () => ({ t: translate, i18n: { language: 'en' } }),
        Trans: ({ i18nKey }: { i18nKey: string }) => React.createElement('span', null, i18nKey),
    };
});

function renderClassPage() {
    return render(
        <MemoryRouter initialEntries={['/grammar-overview']}>
            <Routes>
                <Route path="/grammar-overview" element={<GrammarOverviewPage />} />
            </Routes>
        </MemoryRouter>
    );
}

function renderStudentPage(studentId: string) {
    return render(
        <MemoryRouter initialEntries={[`/students/${studentId}/grammar-overview`]}>
            <Routes>
                <Route path="/students/:id/grammar-overview" element={<StudentGrammarOverviewPage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('GrammarOverviewPage', () => {
    it('opens on the class track band and can switch to all levels', () => {
        renderClassPage();

        expect(screen.getAllByText('Grammar standards overview').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Ava de Vries').length).toBeGreaterThan(0);

        // HAVO maps to the B1 band, so the A1 present-simple evidence is filtered out at first.
        expect(screen.getByRole('button', { name: 'B1' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByText('100')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'All' }));

        expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByText('100').length).toBeGreaterThan(0);
        expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
});

describe('StudentGrammarOverviewPage', () => {
    it('starts on the student track band and reveals test evidence when the band widens', () => {
        renderStudentPage('s1');

        expect(screen.getByText('Ava de Vries')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'B1' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'A1–A2' }));

        expect(screen.getByText('Present Simple')).toBeInTheDocument();
        expect(screen.getByText('1/1 · 100%')).toBeInTheDocument();
    });

    it('explains an unknown student', () => {
        renderStudentPage('missing');

        expect(screen.getByText('That student could not be found.')).toBeInTheDocument();
    });
});
