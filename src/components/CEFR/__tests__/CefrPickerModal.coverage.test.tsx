import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CefrPickerModal from '../CefrPickerModal';
import type { LinkedCefrDescriptor, LinkedFrameworkDescriptor } from '../../../types';

let mockLang = 'en';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { count: number }) => {
            if (key === 'framework.selected_count') return `${opts?.count} selected`;
            if (key === 'framework.ib_short') return 'IB';
            if (key === 'framework.blooms_short') return "Bloom's";
            return key;
        },
        i18n: { language: mockLang, changeLanguage: vi.fn() },
    }),
}));

const onAddFramework = vi.fn();
const onRemoveFramework = vi.fn();
const onClose = vi.fn();

const baseProps = {
    linkedDescriptors: [] as LinkedCefrDescriptor[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    linkedFrameworkDescriptors: [] as LinkedFrameworkDescriptor[],
    onAddFramework,
    onRemoveFramework,
    onClose,
};

function openGrammarTab() {
    fireEvent.click(screen.getByText('framework.grammar_short'));
}

describe('CefrPickerModal grammar tab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLang = 'en';
    });

    it('renders the grammar level filter and category sections', () => {
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        expect(screen.getByText('cefr.all_levels')).toBeInTheDocument();
        // Level buttons A1..C2 plus all-levels
        expect(
            screen.getAllByRole('button').filter((b) => /^(A1|A2|B1|B2|C1|C2)$/.test(b.textContent ?? ''))
        ).toHaveLength(6);
        // Categories with matching items render, header collapsed by default
        expect(screen.getByText('Present Simple')).toBeInTheDocument();
    });

    it('filters grammar items by level and clears the level filter', () => {
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        fireEvent.click(screen.getByText('A2'));
        // A2 selection is reflected in the button class
        expect(screen.getByText('A2')).toHaveClass('btn-primary');
        // Some A1-only items disappear from the visible list
        expect(screen.queryByText('Affirmative (I work, she works)')).not.toBeInTheDocument();
        // Clicking the same level again clears the selection
        fireEvent.click(screen.getByText('A2'));
        expect(screen.getByText('A2')).toHaveClass('btn-ghost');
        fireEvent.click(screen.getByText('A2'));
        fireEvent.click(screen.getByText('cefr.all_levels'));
        expect(screen.getByText('cefr.all_levels')).toHaveClass('btn-primary');
    });

    it('expands a category and adds a grammar descriptor', () => {
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        fireEvent.click(screen.getByText('Present Simple'));
        fireEvent.click(screen.getByText('Affirmative (I work, she works)'));
        expect(onAddFramework).toHaveBeenCalledWith(
            expect.objectContaining({
                descriptorId: 'gr-present-simple-affirmative',
                framework: 'grammar',
                categoryId: 'present-simple',
                categoryLabelEn: 'Present Simple',
                level: 'A1',
            })
        );
    });

    it('removes an already-linked grammar descriptor', () => {
        render(
            <CefrPickerModal
                {...baseProps}
                linkedFrameworkDescriptors={[
                    {
                        descriptorId: 'gr-present-simple-affirmative',
                        framework: 'grammar',
                        categoryId: 'present-simple',
                        categoryLabelEn: 'Present Simple',
                        categoryLabelNl: 'Tegenwoordige tijd (Present Simple)',
                        categoryColor: '#3b82f6',
                        descriptionEn: 'Affirmative (I work, she works)',
                        descriptionNl: 'Bevestigend (I work, she works)',
                        level: 'A1',
                    },
                ]}
            />
        );
        openGrammarTab();
        fireEvent.click(screen.getByText('Present Simple'));
        fireEvent.click(screen.getByText('Affirmative (I work, she works)'));
        expect(onRemoveFramework).toHaveBeenCalledWith('gr-present-simple-affirmative');
    });

    it('shows a linked-count badge on a category with linked grammar items', () => {
        render(
            <CefrPickerModal
                {...baseProps}
                linkedFrameworkDescriptors={[
                    {
                        descriptorId: 'gr-present-simple-affirmative',
                        framework: 'grammar',
                        categoryId: 'present-simple',
                        categoryLabelEn: 'Present Simple',
                        categoryLabelNl: 'Tegenwoordige tijd (Present Simple)',
                        categoryColor: '#3b82f6',
                        descriptionEn: 'Affirmative (I work, she works)',
                        descriptionNl: 'Bevestigend (I work, she works)',
                        level: 'A1',
                    },
                ]}
            />
        );
        openGrammarTab();
        expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    });

    it('filters grammar items by search text', () => {
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        fireEvent.click(screen.getByText('Present Simple'));
        expect(screen.getByText('Affirmative (I work, she works)')).toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
            target: { value: 'negative' },
        });
        expect(screen.queryByText('Affirmative (I work, she works)')).not.toBeInTheDocument();
        fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
            target: { value: '' },
        });
        expect(screen.getByText('Affirmative (I work, she works)')).toBeInTheDocument();
    });

    it('shows the no-results empty state when nothing matches in the grammar tab', () => {
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
            target: { value: 'zzzz-no-match' },
        });
        expect(screen.getByText('cefr.no_results')).toBeInTheDocument();
    });

    it('renders Dutch category and item labels when the language is Dutch', () => {
        mockLang = 'nl-NL';
        render(<CefrPickerModal {...baseProps} />);
        openGrammarTab();
        expect(screen.getByText('Tegenwoordige tijd (Present Simple)')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Tegenwoordige tijd (Present Simple)'));
        expect(screen.getByText('Bevestigend (I work, she works)')).toBeInTheDocument();
        // Search matching runs the Dutch label path inside `matches`
        fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
            target: { value: 'bevestigend' },
        });
        expect(screen.getByText('Bevestigend (I work, she works)')).toBeInTheDocument();
    });
});
