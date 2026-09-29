import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UdGrammarPanel from '../UdGrammarPanel';
import type { UdGrammarState } from '../../../hooks/useUdGrammarProfile';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const empty = { constructionCount: 0, distinct: 0, constructions: [] };

describe('UdGrammarPanel', () => {
    it('shows a loading note', () => {
        render(<UdGrammarPanel state={{ status: 'loading' }} />);
        expect(screen.getByText('grammarProfile.loading')).toBeInTheDocument();
    });

    it('renders nothing when the model is unavailable', () => {
        const { container } = render(<UdGrammarPanel state={{ status: 'unavailable' }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lists detected constructions by level', () => {
        const state: UdGrammarState = {
            status: 'ready',
            profile: {
                sentenceCount: 1,
                tokenCount: 4,
                constructionCount: 2,
                estimatedLevel: { typical: 'A2', reaches: 'A2' },
                bandCounts: { A1: 0, A2: 2, B1: 0, B2: 0, C1: 0, C2: 0 },
                results: {
                    A1: empty,
                    A2: {
                        constructionCount: 2,
                        distinct: 1,
                        constructions: [
                            {
                                id: 'pres_perf',
                                name: 'Present perfect',
                                category: 'Tense & aspect',
                                count: 2,
                                examples: [],
                            },
                        ],
                    },
                    B1: empty,
                    B2: empty,
                    C1: empty,
                    C2: empty,
                },
            },
        };
        render(<UdGrammarPanel state={state} />);
        expect(screen.getByText('Present perfect · 2')).toBeInTheDocument();
        expect(screen.getByText('A2 · 2')).toBeInTheDocument();
        expect(screen.getByText('grammarProfile.notAGrade')).toBeInTheDocument();
    });
});
