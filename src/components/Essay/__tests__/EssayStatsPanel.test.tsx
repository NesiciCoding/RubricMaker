import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EssayStatsPanel from '../EssayStatsPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

describe('EssayStatsPanel', () => {
    it('shows counts, readability and transition categories', () => {
        render(<EssayStatsPanel text="The cat sat on the mat. However, the dog ran." />);
        expect(screen.getByText('writingStats.title')).toBeInTheDocument();
        expect(screen.getByText('writingStats.category.contrast · 1')).toBeInTheDocument();
        expect(screen.getByText('writingStats.fkGrade')).toBeInTheDocument();
    });

    it('shows the empty transition message and no readability for empty text', () => {
        render(<EssayStatsPanel text="" />);
        expect(screen.getByText('writingStats.noTransitions')).toBeInTheDocument();
        expect(screen.queryByText('writingStats.fkGrade')).toBeNull();
    });
});
