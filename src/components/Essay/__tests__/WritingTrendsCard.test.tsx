import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClassWritingTrendsCard, StudentWritingTrendsCard } from '../WritingTrendsCard';
import type { ClassWeakCriterion, Student, WritingCriterionTrend } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const trend: WritingCriterionTrend = {
    studentId: 's1',
    criterionKey: 'grammar',
    name: 'Grammar',
    points: [40, 45, 50].map((score, i) => ({ studentRubricId: `sr${i}`, gradedAt: `2024-0${i + 1}-01`, score })),
    latest: 50,
    previous: 45,
    average: 45,
    slope: 5,
    direction: 'improving',
    persistentWeak: true,
};

describe('StudentWritingTrendsCard', () => {
    it('renders nothing without trends', () => {
        const { container } = render(<StudentWritingTrendsCard trends={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the criterion, direction and weakness badge', () => {
        render(<StudentWritingTrendsCard trends={[trend]} />);
        expect(screen.getByText('Grammar')).toBeInTheDocument();
        expect(screen.getByText(/writingTrends\.direction\.improving/)).toBeInTheDocument();
        expect(screen.getByText('writingTrends.persistentWeak')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute('aria-label', '40, 45, 50');
    });
});

describe('ClassWritingTrendsCard', () => {
    const rows: ClassWeakCriterion[] = [
        {
            criterionKey: 'grammar',
            name: 'Grammar',
            studentCount: 3,
            weakStudentIds: ['a'],
            decliningStudentIds: [],
            averageScore: 55.4,
        },
    ];
    const students = [{ id: 'a', name: 'Ada' }] as Student[];

    it('renders nothing without rows', () => {
        const { container } = render(<ClassWritingTrendsCard rows={[]} students={students} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lists weak students by name and the class average', () => {
        render(<ClassWritingTrendsCard rows={rows} students={students} />);
        expect(screen.getByText('Ada')).toBeInTheDocument();
        expect(screen.getByText('55%')).toBeInTheDocument();
    });
});
