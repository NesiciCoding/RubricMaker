import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VocabularyItem } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    }),
}));

import OpenAnswerInsightsPanel from '../OpenAnswerInsightsPanel';

const items = [
    { id: 'v1', phrase: 'moreover', category: 'transition' },
    { id: 'v2', phrase: 'nevertheless', category: 'transition' },
] as unknown as VocabularyItem[];

describe('OpenAnswerInsightsPanel', () => {
    it('shows counts, level verdict and the required-vocabulary checklist without scoring', () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        render(
            <OpenAnswerInsightsPanel
                text="I like school. Moreover, my friends are kind. We play games every day."
                targetLevel="B1"
                vocabularyItems={items}
            />
        );
        expect(screen.getByText(/insights_words.*"words":13/)).toBeInTheDocument();
        expect(screen.getByText(/insights_vocabulary/)).toBeInTheDocument();
        expect(screen.getByText(/insights_verdict.*"level":"B1"/)).toBeInTheDocument();
        expect(screen.getByText(/insights_required_vocab.*"found":1.*"total":2/)).toBeInTheDocument();
        expect(screen.getByText(/✓ moreover/)).toBeInTheDocument();
        expect(screen.getByText(/✗ nevertheless/)).toBeInTheDocument();
        expect(screen.getByText('tests.results.insights_disclaimer')).toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });

    it('renders nothing for an empty answer', () => {
        const { container } = render(<OpenAnswerInsightsPanel text="   " />);
        expect(container).toBeEmptyDOMElement();
    });
});
