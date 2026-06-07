import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const baseProps = {
    linkedDescriptors: [] as LinkedCefrDescriptor[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    linkedFrameworkDescriptors: [] as LinkedFrameworkDescriptor[],
    onAddFramework: vi.fn(),
    onRemoveFramework: vi.fn(),
    onClose: vi.fn(),
};

function levelHeader(text: string) {
    return screen.getByText(text).closest('button')!;
}

const A1_LEVEL_DESC = 'Breakthrough – Can understand and use very basic familiar expressions.';
const B1_LEVEL_DESC =
    'Threshold – Can deal with most situations likely to arise while travelling and can express personal opinions.';

const linkedCefr: LinkedCefrDescriptor = {
    descriptorId: 'r-a1-1',
    level: 'A1',
    skill: 'reading',
    descriptionEn: 'Can understand very short, simple texts, picking up familiar names, words and basic phrases.',
    descriptionNl: 'NL text',
};

describe('CefrPickerModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLang = 'en';
    });

    it('renders the header, title and CEFR tab by default', () => {
        render(<CefrPickerModal {...baseProps} />);
        expect(screen.getByText('framework.picker_title')).toBeInTheDocument();
        expect(screen.getByText('CEFR / ERK')).toBeInTheDocument();
        expect(screen.getByText('IB')).toBeInTheDocument();
        expect(screen.getByText("Bloom's")).toBeInTheDocument();
    });

    it('shows "none selected" in the footer when nothing is linked', () => {
        render(<CefrPickerModal {...baseProps} />);
        expect(screen.getByText('cefr.none_selected')).toBeInTheDocument();
    });

    it('shows the total linked count across CEFR and framework descriptors', () => {
        render(
            <CefrPickerModal
                {...baseProps}
                linkedDescriptors={[linkedCefr]}
                linkedFrameworkDescriptors={[
                    {
                        descriptorId: 'ib-inq-1',
                        framework: 'ib',
                        categoryId: 'inquirers',
                        categoryLabelEn: 'Inquirers',
                        categoryLabelNl: 'NL',
                        categoryColor: '#000',
                        descriptionEn: 'Nurtures curiosity.',
                        descriptionNl: 'NL',
                    },
                ]}
            />
        );
        expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('calls onClose from the close button and the save button', () => {
        const onClose = vi.fn();
        render(<CefrPickerModal {...baseProps} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('renders Dutch descriptions when the active language is Dutch', () => {
        mockLang = 'nl';
        render(<CefrPickerModal {...baseProps} />);
        const search = screen.getByPlaceholderText('cefr.search_placeholder');

        // CEFR: skill label, level header & descriptor text in Dutch, filtered by Dutch search text
        expect(screen.getByRole('button', { name: 'Lezen' })).toBeInTheDocument();
        fireEvent.change(search, { target: { value: 'vertrouwde namen' } });
        fireEvent.click(
            screen
                .getByText('Doorbraak – Kan elementaire vertrouwde uitdrukkingen begrijpen en gebruiken.')
                .closest('button')!
        );
        expect(
            screen.getByText(
                'Kan zeer korte, eenvoudige teksten begrijpen door vertrouwde namen, woorden en eenvoudige zinnen te herkennen.'
            )
        ).toBeInTheDocument();
        fireEvent.change(search, { target: { value: '' } });

        // IB tab label & descriptor text in Dutch, filtered by Dutch search text
        fireEvent.click(screen.getByText('IB'));
        fireEvent.change(search, { target: { value: 'nieuwsgierigheid' } });
        const inquirersHeader = screen.getByRole('button', { name: /Onderzoekers/i });
        fireEvent.click(inquirersHeader);
        expect(
            screen.getByText('Koestert nieuwsgierigheid en stelt betekenisvolle vragen om begrip te verdiepen.')
        ).toBeInTheDocument();
        fireEvent.change(search, { target: { value: '' } });

        // Bloom's tab label & descriptor text in Dutch, filtered by Dutch search text
        fireEvent.click(screen.getByText("Bloom's"));
        fireEvent.change(search, { target: { value: 'sleutelbegrippen' } });
        const onthoudenHeader = screen.getByRole('button', { name: /1\. Onthouden/i });
        fireEvent.click(onthoudenHeader);
        expect(
            screen.getByText('Kan sleutelbegrippen, feiten en definities uit het geheugen reproduceren.')
        ).toBeInTheDocument();
    });

    describe('CEFR tab', () => {
        it('renders level sections expanded by default for B1 and B2', () => {
            render(<CefrPickerModal {...baseProps} />);
            const b1Header = levelHeader(B1_LEVEL_DESC);
            const a1Header = levelHeader(A1_LEVEL_DESC);
            expect(b1Header).toBeInTheDocument();
            expect(a1Header).toBeInTheDocument();
        });

        it('toggles expand/collapse of a level section', () => {
            render(<CefrPickerModal {...baseProps} />);
            const a1Header = levelHeader(A1_LEVEL_DESC);
            // A1 starts collapsed; expand it
            fireEvent.click(a1Header);
            expect(screen.getByText(linkedCefr.descriptionEn)).toBeInTheDocument();
            // Collapse again
            fireEvent.click(a1Header);
            expect(screen.queryByText(linkedCefr.descriptionEn)).not.toBeInTheDocument();
        });

        it('adds and removes a CEFR descriptor when its row is clicked', () => {
            const onAdd = vi.fn();
            const onRemove = vi.fn();
            const { rerender } = render(<CefrPickerModal {...baseProps} onAdd={onAdd} onRemove={onRemove} />);
            fireEvent.click(levelHeader(A1_LEVEL_DESC));
            const row = screen.getByText(linkedCefr.descriptionEn).closest('button')!;
            fireEvent.click(row);
            expect(onAdd).toHaveBeenCalledWith(
                expect.objectContaining({ descriptorId: 'r-a1-1', level: 'A1', skill: 'reading' })
            );

            rerender(
                <CefrPickerModal {...baseProps} linkedDescriptors={[linkedCefr]} onAdd={onAdd} onRemove={onRemove} />
            );
            const linkedRow = screen.getByText(linkedCefr.descriptionEn).closest('button')!;
            fireEvent.click(linkedRow);
            expect(onRemove).toHaveBeenCalledWith('r-a1-1');
        });

        it('shows a linked-count badge on a level section with linked descriptors', () => {
            render(<CefrPickerModal {...baseProps} linkedDescriptors={[linkedCefr]} />);
            const a1Header = levelHeader(A1_LEVEL_DESC);
            expect(within(a1Header).getByText('1')).toBeInTheDocument();
        });

        it('filters by skill', () => {
            render(<CefrPickerModal {...baseProps} />);
            fireEvent.click(levelHeader(A1_LEVEL_DESC));
            expect(screen.getByText(linkedCefr.descriptionEn)).toBeInTheDocument();

            const writingBtn = screen.getByRole('button', { name: 'Writing' });
            fireEvent.click(writingBtn);
            expect(screen.queryByText(linkedCefr.descriptionEn)).not.toBeInTheDocument();

            // Click the same skill again to deselect it
            fireEvent.click(writingBtn);
            expect(screen.getByText(linkedCefr.descriptionEn)).toBeInTheDocument();

            // Select again, then reset via "all skills"
            fireEvent.click(writingBtn);
            fireEvent.click(screen.getByRole('button', { name: 'cefr.all_skills' }));
            expect(screen.getByText(linkedCefr.descriptionEn)).toBeInTheDocument();
        });

        it('filters by level', () => {
            render(<CefrPickerModal {...baseProps} />);
            const a1LevelBtn = screen.getAllByRole('button', { name: 'A1' })[0];
            fireEvent.click(a1LevelBtn);
            // B1 section should no longer be present
            expect(screen.queryByText(B1_LEVEL_DESC)).not.toBeInTheDocument();
            expect(screen.getByText(A1_LEVEL_DESC)).toBeInTheDocument();
            // Click again to deselect
            fireEvent.click(a1LevelBtn);
            expect(screen.getByText(B1_LEVEL_DESC)).toBeInTheDocument();
        });

        it('filters via the search box and shows a no-results message', () => {
            render(<CefrPickerModal {...baseProps} />);
            const search = screen.getByPlaceholderText('cefr.search_placeholder');
            fireEvent.change(search, { target: { value: 'familiar names' } });
            fireEvent.click(levelHeader(A1_LEVEL_DESC));
            expect(screen.getByText(linkedCefr.descriptionEn)).toBeInTheDocument();

            fireEvent.change(search, { target: { value: 'zzzznoresultzzzz' } });
            expect(screen.getByText('cefr.no_results')).toBeInTheDocument();
        });

        it('clears the search and resets expansion when switching tabs', () => {
            render(<CefrPickerModal {...baseProps} />);
            const search = screen.getByPlaceholderText('cefr.search_placeholder');
            fireEvent.change(search, { target: { value: 'familiar' } });
            fireEvent.click(screen.getByText('IB'));
            fireEvent.click(screen.getByText('CEFR / ERK'));
            expect((screen.getByPlaceholderText('cefr.search_placeholder') as HTMLInputElement).value).toBe('');
        });
    });

    describe('IB tab', () => {
        it('lists IB attributes and toggles a descriptor', () => {
            const onAddFramework = vi.fn();
            render(<CefrPickerModal {...baseProps} onAddFramework={onAddFramework} />);
            fireEvent.click(screen.getByText('IB'));

            const inquirersHeader = screen.getByRole('button', { name: /Inquirers/i });
            fireEvent.click(inquirersHeader);

            const row = screen
                .getByText('Nurtures curiosity and asks meaningful questions to deepen understanding.')
                .closest('button')!;
            fireEvent.click(row);
            expect(onAddFramework).toHaveBeenCalledWith(
                expect.objectContaining({ descriptorId: 'ib-inq-1', framework: 'ib', categoryId: 'inquirers' })
            );
        });

        it('removes an already-linked IB descriptor', () => {
            const onRemoveFramework = vi.fn();
            render(
                <CefrPickerModal
                    {...baseProps}
                    linkedFrameworkDescriptors={[
                        {
                            descriptorId: 'ib-inq-1',
                            framework: 'ib',
                            categoryId: 'inquirers',
                            categoryLabelEn: 'Inquirers',
                            categoryLabelNl: 'NL',
                            categoryColor: '#000',
                            descriptionEn: 'Nurtures curiosity.',
                            descriptionNl: 'NL',
                        },
                    ]}
                    onRemoveFramework={onRemoveFramework}
                />
            );
            fireEvent.click(screen.getByText('IB'));
            const inquirersHeader = screen.getByRole('button', { name: /Inquirers/i });
            expect(within(inquirersHeader).getByText('1')).toBeInTheDocument();
            fireEvent.click(inquirersHeader);
            const row = screen
                .getByText('Nurtures curiosity and asks meaningful questions to deepen understanding.')
                .closest('button')!;
            fireEvent.click(row);
            expect(onRemoveFramework).toHaveBeenCalledWith('ib-inq-1');
        });

        it('shows a no-results message when the search matches nothing in the IB tab', () => {
            render(<CefrPickerModal {...baseProps} />);
            fireEvent.click(screen.getByText('IB'));
            fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
                target: { value: 'zzzznoresultzzzz' },
            });
            expect(screen.getByText('cefr.no_results')).toBeInTheDocument();
        });

        it('filters IB descriptors by search text', () => {
            render(<CefrPickerModal {...baseProps} />);
            fireEvent.click(screen.getByText('IB'));
            fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
                target: { value: 'curiosity' },
            });
            const inquirersHeader = screen.getByRole('button', { name: /Inquirers/i });
            fireEvent.click(inquirersHeader);
            expect(
                screen.getByText('Nurtures curiosity and asks meaningful questions to deepen understanding.')
            ).toBeInTheDocument();
        });
    });

    describe("Bloom's tab", () => {
        it('lists Bloom levels and toggles a descriptor', () => {
            const onAddFramework = vi.fn();
            render(<CefrPickerModal {...baseProps} onAddFramework={onAddFramework} />);
            fireEvent.click(screen.getByText("Bloom's"));

            const rememberHeader = screen.getByRole('button', { name: /1\. Remember/i });
            fireEvent.click(rememberHeader);

            const buttons = screen.getAllByRole('button');
            const descriptorRow = buttons.find(
                (b) => b.textContent?.includes("Bloom's — Remember") && b !== rememberHeader
            );
            expect(descriptorRow).toBeTruthy();
            fireEvent.click(descriptorRow!);
            expect(onAddFramework).toHaveBeenCalledWith(
                expect.objectContaining({ framework: 'blooms', categoryId: 'remember' })
            );
        });

        it('shows a no-results message when the search matches nothing in the Bloom tab', () => {
            render(<CefrPickerModal {...baseProps} />);
            fireEvent.click(screen.getByText("Bloom's"));
            fireEvent.change(screen.getByPlaceholderText('cefr.search_placeholder'), {
                target: { value: 'zzzznoresultzzzz' },
            });
            expect(screen.getByText('cefr.no_results')).toBeInTheDocument();
        });

        it('removes an already linked Bloom descriptor', () => {
            const onRemoveFramework = vi.fn();
            render(
                <CefrPickerModal
                    {...baseProps}
                    linkedFrameworkDescriptors={[
                        {
                            descriptorId: 'bl-rem-1',
                            framework: 'blooms',
                            categoryId: 'remember',
                            categoryLabelEn: 'Remember',
                            categoryLabelNl: 'Onthouden',
                            categoryColor: '#ef4444',
                            descriptionEn: 'Can recall key terms, facts, and definitions from memory.',
                            descriptionNl: 'NL',
                        },
                    ]}
                    onRemoveFramework={onRemoveFramework}
                />
            );
            fireEvent.click(screen.getByText("Bloom's"));
            const rememberHeader = screen.getByRole('button', { name: /1\. Remember/i });
            expect(within(rememberHeader).getByText('1')).toBeInTheDocument();
            fireEvent.click(rememberHeader);
            const row = screen
                .getByText('Can recall key terms, facts, and definitions from memory.')
                .closest('button')!;
            fireEvent.click(row);
            expect(onRemoveFramework).toHaveBeenCalledWith('bl-rem-1');
        });
    });
});
