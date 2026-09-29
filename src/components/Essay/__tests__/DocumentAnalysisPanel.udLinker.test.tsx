import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DocumentAnalysisPanel from '../DocumentAnalysisPanel';
import type { DocumentAnalysisResult, RubricCriterion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, fb?: string) => fb ?? k, i18n: { language: 'en' } }),
}));

const mockUdState = vi.hoisted(() => ({ value: { status: 'unavailable' } as unknown }));
vi.mock('../../../hooks/useUdGrammarProfile', () => ({
    useUdGrammarProfile: () => mockUdState.value,
}));
vi.mock('../UdGrammarPanel', () => ({ default: () => null }));
vi.mock('../EssayStatsPanel', () => ({ default: () => null }));

const criterion: RubricCriterion = {
    id: 'c1',
    title: 'Grammar range',
    description: '',
    weight: 100,
    levels: [],
    frameworkDescriptors: [
        {
            descriptorId: 'gr-question-tags',
            framework: 'grammar',
            categoryId: 'questions',
            categoryLabelEn: 'Questions',
            categoryLabelNl: 'Vragen',
            categoryColor: '#000',
            descriptionEn: 'Question tags',
            descriptionNl: 'Vraagtags',
            level: 'B1',
        },
    ],
};

const result: DocumentAnalysisResult = {
    id: 'ar1',
    studentId: 's1',
    rubricId: 'r1',
    attachmentId: 'att1',
    extractedText: "You like tea, don't you?",
    analyzedAt: '2024-01-01T00:00:00Z',
    detectedItems: [],
    grammarErrors: [],
    grammarCheckerUsed: 'none',
};

const props = {
    studentId: 's1',
    rubricId: 'r1',
    rubricName: 'Essay',
    vocabularyItems: [],
    criteria: [criterion],
    studentAttachments: [],
    existingResult: result,
    onClose: vi.fn(),
    onSaveResult: vi.fn(),
    onApplyToEntry: vi.fn(),
};

const ready = (counts: Record<string, number>) => ({
    status: 'ready',
    profile: {
        sentenceCount: 1,
        tokenCount: 5,
        constructionCount: 0,
        estimatedLevel: { typical: '—', reaches: '—' },
        bandCounts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
        results: Object.fromEntries(
            ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => [
                l,
                {
                    constructionCount: 0,
                    distinct: 0,
                    constructions:
                        l === 'B1'
                            ? Object.entries(counts).map(([id, count]) => ({
                                  id,
                                  name: id,
                                  category: '',
                                  count,
                                  examples: [],
                              }))
                            : [],
                },
            ])
        ),
    },
});

describe('DocumentAnalysisPanel grammar linker', () => {
    it('keeps a linked item on manual check while the parser is unavailable', () => {
        mockUdState.value = { status: 'unavailable' };
        render(<DocumentAnalysisPanel {...props} />);
        expect(screen.getByText(/⊘ Question tags/)).toBeInTheDocument();
        expect(screen.queryByText('analysis.grammar_engine_ud')).toBeNull();
    });

    it('checks the linked item against the parse once it is ready', () => {
        mockUdState.value = ready({ tag_question: 1 });
        render(<DocumentAnalysisPanel {...props} />);
        expect(screen.getByText(/✔ Question tags \(1×\)/)).toBeInTheDocument();
        expect(screen.getByText('analysis.grammar_engine_ud')).toBeInTheDocument();
    });

    it('reports not found when the parser saw no such construction', () => {
        mockUdState.value = ready({ pres_simple: 1 });
        render(<DocumentAnalysisPanel {...props} />);
        expect(screen.getByText(/✘ Question tags/)).toBeInTheDocument();
    });
});
