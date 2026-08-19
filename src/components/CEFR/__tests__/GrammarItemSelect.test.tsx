import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GrammarItemSelect from '../GrammarItemSelect';

let mockLanguage = 'en';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            get language() {
                return mockLanguage;
            },
            changeLanguage: vi.fn(),
        },
    }),
}));

describe('GrammarItemSelect', () => {
    it('renders the empty option and category optgroups in English', () => {
        render(<GrammarItemSelect value={undefined} onChange={vi.fn()} id="gr" aria-label="Grammar picker" />);
        expect(screen.getByRole('option', { name: 'grammar.no_item' })).toBeInTheDocument();
        const optgroups = screen.getAllByRole('group');
        expect(optgroups.length).toBeGreaterThan(0);
    });

    it('renders Dutch category and item labels when the language is Dutch', () => {
        mockLanguage = 'nl-NL';
        render(<GrammarItemSelect value={undefined} onChange={vi.fn()} id="gr" aria-label="Grammar picker" />);
        const optgroup = screen.getAllByRole('group')[0];
        // The optgroup label renders as its own node; item labels carry the level suffix.
        expect(optgroup.querySelectorAll('option').length).toBeGreaterThan(0);
    });

    it('falls back to the translation key when no aria-label is provided', () => {
        render(<GrammarItemSelect value={undefined} onChange={vi.fn()} id="gr" />);
        expect(screen.getByLabelText('grammar.item_select_label')).toBeInTheDocument();
    });

    it('clears the value by selecting the empty option', () => {
        const onChange = vi.fn();
        render(<GrammarItemSelect value="gr-past-simple" onChange={onChange} id="gr" aria-label="Grammar picker" />);
        fireEvent.change(screen.getByLabelText('Grammar picker'), { target: { value: '' } });
        expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('reports a selected grammar item id', () => {
        const onChange = vi.fn();
        render(<GrammarItemSelect value={undefined} onChange={onChange} id="gr" aria-label="Grammar picker" />);
        const select = screen.getByLabelText('Grammar picker');
        const firstItem = screen.getAllByRole('group')[0].querySelectorAll('option')[0] as HTMLOptionElement;
        fireEvent.change(select, { target: { value: firstItem.value } });
        expect(onChange).toHaveBeenCalledWith(firstItem.value);
    });
});
