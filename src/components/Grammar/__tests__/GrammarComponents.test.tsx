import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Rubric, Student, StudentTest, Test } from '../../../types';
import { DEFAULT_FORMAT } from '../../../types';
import type { GrammarCategoryClassRow, GrammarCategoryRow } from '../../../utils/grammarStandardAggregator';
import { GrammarAccuracyBar, GrammarScoreBadge, GrammarStatusText } from '../GrammarScoreBadge';
import GrammarBandFilter from '../GrammarBandFilter';
import GrammarOverviewMatrix from '../GrammarOverviewMatrix';
import GrammarCategoryAccordion from '../GrammarCategoryAccordion';
import GrammarStandardsPanel from '../GrammarStandardsPanel';
import RubricGrammarPanel from '../RubricGrammarPanel';

vi.mock('react-i18next', async () => {
    const en = (await import('../../../locales/en.json')).default as Record<string, unknown>;
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

const ITEM = 'gr-present-simple-affirmative';

const category: GrammarCategoryClassRow = {
    categoryId: 'present-simple',
    labelEn: 'Present Simple',
    labelNl: 'Tegenwoordige tijd',
    color: '#3b82f6',
    levels: ['A1'],
    assessedCount: 1,
    standardCount: 1,
    classPct: 80,
    status: 'secure',
    standards: [],
};

const student: Student = { id: 's1', name: 'Ava de Vries', classId: 'c1' };
const otherStudent: Student = { id: 's2', name: 'Noor Yilmaz', classId: 'c1' };

const taggedTest = {
    id: 't1',
    name: 'Unit 3',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [{ id: 'q1', prompt: 'She ___ here.', type: 'cloze', points: 1, linkedGrammarItemId: ITEM }],
} as Test;

const untaggedTest = {
    id: 't2',
    name: 'Unit 4',
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [{ id: 'q9', prompt: 'No grammar tag', type: 'cloze', points: 1 }],
} as Test;

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

describe('GrammarScoreBadge / status text / bar', () => {
    it('renders the rounded score, a dash without evidence, and a unitless variant', () => {
        const { rerender } = render(<GrammarScoreBadge pct={82.4} />);
        expect(screen.getByText('82%')).toBeInTheDocument();

        rerender(<GrammarScoreBadge pct={82.4} suffix={false} />);
        expect(screen.getByText('82')).toBeInTheDocument();

        rerender(<GrammarScoreBadge pct={null} />);
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('labels each status and widths the accuracy bar', () => {
        const { rerender } = render(<GrammarStatusText status="needs-work" />);
        expect(screen.getByText('Needs work')).toBeInTheDocument();

        rerender(<GrammarStatusText status="no-evidence" />);
        expect(screen.getByText('Not assessed')).toBeInTheDocument();

        const { container } = render(<GrammarAccuracyBar pct={40} />);
        expect(container.querySelector('.bar span')).toHaveStyle({ width: '40%' });
    });
});

describe('GrammarBandFilter', () => {
    it('marks the active band and reports a switch', () => {
        const onChange = vi.fn();
        render(<GrammarBandFilter value="b1" onChange={onChange} ariaLabel="Band" />);

        expect(screen.getByRole('button', { name: 'B1' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(onChange).toHaveBeenCalledWith('all');
    });
});

describe('GrammarOverviewMatrix', () => {
    it('renders a percentage per student and opens the student view', () => {
        const onOpenStudent = vi.fn();
        render(
            <GrammarOverviewMatrix
                categories={[category]}
                students={[
                    {
                        studentId: 's1',
                        name: 'Ava de Vries',
                        meta: '2V · HAVO',
                        categoryPct: new Map([['present-simple', 92]]),
                    },
                ]}
                lang="en"
                onOpenStudent={onOpenStudent}
            />
        );

        expect(screen.getByText('Ava de Vries')).toBeInTheDocument();
        expect(screen.getByText('92')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Ava de Vries/ }));
        expect(onOpenStudent).toHaveBeenCalledWith('s1');
    });
});

describe('GrammarCategoryAccordion', () => {
    const categoryRow: GrammarCategoryRow = {
        categoryId: 'past-simple',
        labelEn: 'Past Simple',
        labelNl: 'Verleden tijd',
        color: '#8b5cf6',
        levels: ['A1', 'A2'],
        assessedCount: 1,
        standardCount: 2,
        combinedPct: 66,
        status: 'developing',
        standards: [
            {
                itemId: 'gr-past-simple-regular',
                level: 'A1',
                labelEn: 'Regular verbs (-ed)',
                labelNl: 'Regelmatige werkwoorden',
                categoryId: 'past-simple',
                categoryLabelEn: 'Past Simple',
                categoryLabelNl: 'Verleden tijd',
                categoryColor: '#8b5cf6',
                testAttempts: 2,
                testCorrect: 1,
                testAccuracyPct: 50,
                writingInstances: 0,
                writingAvgPct: null,
                combinedPct: 50,
                status: 'developing',
            },
            {
                itemId: 'gr-past-simple-irregular',
                level: 'A2',
                labelEn: 'Irregular verbs',
                labelNl: 'Onregelmatige werkwoorden',
                categoryId: 'past-simple',
                categoryLabelEn: 'Past Simple',
                categoryLabelNl: 'Verleden tijd',
                categoryColor: '#8b5cf6',
                testAttempts: 0,
                testCorrect: 0,
                testAccuracyPct: null,
                writingInstances: 0,
                writingAvgPct: null,
                combinedPct: null,
                status: 'no-evidence',
            },
        ],
    };

    it('shows the category score, test evidence and the not-assessed row', () => {
        render(<GrammarCategoryAccordion categories={[categoryRow]} lang="en" />);

        expect(screen.getByText('Past Simple')).toBeInTheDocument();
        expect(screen.getByText('A1–A2 · 2 standards')).toBeInTheDocument();
        expect(screen.getByText('Regular verbs (-ed)')).toBeInTheDocument();
        expect(screen.getByText('1/2 · 50%')).toBeInTheDocument();
        expect(screen.getByText('Irregular verbs')).toBeInTheDocument();
        expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(0);
    });
});

describe('GrammarStandardsPanel', () => {
    it('shows the empty state and opens the builder when nothing is tagged', () => {
        const onOpenBuilder = vi.fn();
        render(
            <GrammarStandardsPanel
                test={untaggedTest}
                studentTests={[]}
                students={[student]}
                lang="en"
                onOpenBuilder={onOpenBuilder}
            />
        );

        expect(screen.getByText('This test has no grammar standards tagged.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open in builder' }));
        expect(onOpenBuilder).toHaveBeenCalled();
    });

    it('sorts the weakest standard first and names who missed it', () => {
        render(
            <GrammarStandardsPanel
                test={taggedTest}
                studentTests={studentTests}
                students={[student, otherStudent]}
                lang="en"
                focusStudentId="s1"
            />
        );

        expect(screen.getByText('50% · 1/2 correct')).toBeInTheDocument();
        expect(screen.getByText(/This student:/)).toBeInTheDocument();
        expect(screen.getByText('1 of 1 standards secure for this student')).toBeInTheDocument();
        expect(screen.getByText('Missed by')).toBeInTheDocument();
        expect(screen.getByText(/Noor Yilmaz/)).toBeInTheDocument();
    });

    it('renders a summary when no student has answered the tagged questions yet', () => {
        const breakdownSafeTest = {
            ...taggedTest,
            questions: [
                { id: 'q1', prompt: 'x', type: 'cloze', points: 1, linkedGrammarItemId: ITEM },
                { id: 'q2', prompt: 'y', type: 'cloze', points: 1, linkedGrammarItemId: ITEM },
            ],
        } as Test;

        render(<GrammarStandardsPanel test={breakdownSafeTest} studentTests={[]} students={[]} lang="en" />);
        expect(screen.getByText('Grammar standards in this test')).toBeInTheDocument();
        expect(
            screen.getByText(
                '2 of 2 questions tagged · 0 grammar standards · class accuracy shown; expand a standard to see who missed it.'
            )
        ).toBeInTheDocument();
        expect(screen.getByText('0 of 0 secure')).toBeInTheDocument();
    });
});

describe('RubricGrammarPanel', () => {
    const rubric: Rubric = {
        id: 'r1',
        name: 'Writing task',
        subject: 'English',
        description: '',
        criteria: [
            {
                id: 'c1',
                title: 'Sentence control',
                description: '',
                weight: 100,
                levels: [{ id: 'l1', label: 'Good', minPoints: 0, maxPoints: 10, description: '', subItems: [] }],
                frameworkDescriptors: [
                    {
                        descriptorId: ITEM,
                        framework: 'grammar',
                        categoryId: 'present-simple',
                        categoryLabelEn: 'Present Simple',
                        categoryLabelNl: 'Tegenwoordige tijd',
                        categoryColor: '#3b82f6',
                        descriptionEn: 'Affirmative (I work, she works)',
                        descriptionNl: 'Bevestigend',
                        level: 'A1',
                    },
                ],
            },
        ],
        gradeScaleId: 'gs1',
        format: DEFAULT_FORMAT,
        attachmentIds: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        totalMaxPoints: 10,
        scoringMode: 'weighted-percentage',
    };

    it('shows the linked standard with its criterion percentage', () => {
        render(
            <RubricGrammarPanel
                rubric={rubric}
                entries={[
                    {
                        criterionId: 'c1',
                        levelId: 'l1',
                        selectedPoints: 8,
                        checkedSubItems: [],
                        comment: '',
                    },
                ]}
                lang="en"
            />
        );

        expect(screen.getByText('Affirmative (I work, she works)')).toBeInTheDocument();
        expect(screen.getByText('Linked on Sentence control')).toBeInTheDocument();
        expect(screen.getByText('80')).toBeInTheDocument();
        expect(screen.getByText('Grammar standards in this rubric')).toBeInTheDocument();
    });

    it('explains when no standards are linked', () => {
        render(
            <RubricGrammarPanel
                rubric={{ ...rubric, criteria: [{ ...rubric.criteria[0], frameworkDescriptors: [] }] }}
                entries={[]}
                lang="en"
            />
        );

        expect(screen.getByText("No grammar standards are linked to this rubric's criteria yet.")).toBeInTheDocument();
    });
});
