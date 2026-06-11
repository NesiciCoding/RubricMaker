import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VocabularyListEditor from '../Vocabulary/VocabularyListEditor';
import { lookupWord } from '../../services/cambridgeApi';
import type { VocabularyItem, RubricCriterion } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

vi.mock('../../services/cambridgeApi', () => ({
    lookupWord: vi.fn(),
}));

const mockCriteria: RubricCriterion[] = [
    {
        id: 'crit1',
        title: 'Vocabulary range',
        description: '',
        weight: 100,
        levels: [],
    },
];

const makeItem = (overrides: Partial<VocabularyItem> = {}): VocabularyItem => ({
    id: 'v1',
    phrase: 'good morning',
    category: 'vocabulary',
    ...overrides,
});

const baseProps = {
    rubricId: 'r1',
    criteria: mockCriteria,
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onDeleteMultiple: vi.fn(),
};

describe('VocabularyListEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows empty state when there are no items', () => {
        render(<VocabularyListEditor {...baseProps} items={[]} />);
        expect(screen.getByText('No items yet. Add phrases below.')).toBeInTheDocument();
    });

    it('renders existing items with category and notes', () => {
        const items = [makeItem({ notes: 'Use in greetings', linkedCriterionId: 'crit1' })];
        render(<VocabularyListEditor {...baseProps} items={items} />);
        expect(screen.getByText('good morning')).toBeInTheDocument();
        expect(screen.getByText('Use in greetings')).toBeInTheDocument();
        expect(screen.getAllByText('Vocabulary range').length).toBeGreaterThan(0);
    });

    it('filters items by category', () => {
        const items = [
            makeItem({ id: 'v1', phrase: 'good morning', category: 'vocabulary' }),
            makeItem({ id: 'v2', phrase: 'past tense', category: 'grammar' }),
        ];
        render(<VocabularyListEditor {...baseProps} items={items} />);
        expect(screen.getByText('good morning')).toBeInTheDocument();
        expect(screen.getByText('past tense')).toBeInTheDocument();

        fireEvent.click(screen.getByText(/grammar \(1\)/i));
        expect(screen.queryByText('good morning')).toBeNull();
        expect(screen.getByText('past tense')).toBeInTheDocument();

        fireEvent.click(screen.getByText(/^All/));
        expect(screen.getByText('good morning')).toBeInTheDocument();
    });

    it('adds a new item via the add form', () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const phraseInput = screen.getByPlaceholderText('Word or phrase…');
        fireEvent.change(phraseInput, { target: { value: 'see you later' } });
        fireEvent.click(screen.getByRole('button', { name: /add/i }));
        expect(onAdd).toHaveBeenCalledWith({
            phrase: 'see you later',
            category: 'vocabulary',
            linkedCriterionId: undefined,
            notes: undefined,
        });
    });

    it('adds a new item by pressing Enter in the phrase field', () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const phraseInput = screen.getByPlaceholderText('Word or phrase…');
        fireEvent.change(phraseInput, { target: { value: 'how are you' } });
        fireEvent.keyDown(phraseInput, { key: 'Enter' });
        expect(onAdd).toHaveBeenCalled();
    });

    it('does not add an item with an empty phrase', () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const addBtn = screen.getByRole('button', { name: /add/i });
        expect(addBtn).toBeDisabled();
        fireEvent.click(addBtn);
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('enters edit mode and updates item fields inline', () => {
        const onUpdate = vi.fn();
        const items = [makeItem()];
        render(<VocabularyListEditor {...baseProps} items={items} onUpdate={onUpdate} />);

        const editBtns = screen.getAllByRole('button');
        const editBtn = editBtns.find((b) => b.querySelector('.lucide-chevron-down'));
        expect(editBtn).toBeTruthy();
        fireEvent.click(editBtn!);

        const phraseInput = screen.getByDisplayValue('good morning');
        fireEvent.change(phraseInput, { target: { value: 'good evening' } });
        expect(onUpdate).toHaveBeenCalledWith({ ...items[0], phrase: 'good evening' });

        fireEvent.click(screen.getByRole('button', { name: /done/i }));
        expect(screen.queryByDisplayValue('good evening')).toBeNull();
    });

    it('deletes an item via the delete button', () => {
        const onDelete = vi.fn();
        const items = [makeItem()];
        render(<VocabularyListEditor {...baseProps} items={items} onDelete={onDelete} />);
        const deleteBtns = screen.getAllByRole('button');
        const deleteBtn = deleteBtns.find((b) => b.querySelector('.lucide-trash-2'));
        fireEvent.click(deleteBtn!);
        expect(onDelete).toHaveBeenCalledWith('v1');
    });

    it('supports multi-select mode and bulk delete', () => {
        const onDeleteMultiple = vi.fn();
        const items = [makeItem({ id: 'v1', phrase: 'good morning' }), makeItem({ id: 'v2', phrase: 'good evening' })];
        render(<VocabularyListEditor {...baseProps} items={items} onDeleteMultiple={onDeleteMultiple} />);

        fireEvent.click(screen.getByRole('button', { name: /select/i }));
        expect(screen.getByText('0 / 2')).toBeInTheDocument();

        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
        expect(screen.getByText('1 / 2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /select all|deselect all/i }));
        expect(screen.getByText('2 / 2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /delete \(2\)/i }));
        expect(onDeleteMultiple).toHaveBeenCalledWith(['v1', 'v2']);
        expect(screen.queryByText('2 / 2')).toBeNull();
    });

    it('exits selection mode via cancel', () => {
        const items = [makeItem()];
        render(<VocabularyListEditor {...baseProps} items={items} />);
        fireEvent.click(screen.getByRole('button', { name: /select/i }));
        expect(screen.getByText('0 / 1')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(screen.queryByText('0 / 1')).toBeNull();
    });

    it('does not add an item when phrase is only whitespace, even via Enter', () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const phraseInput = screen.getByPlaceholderText('Word or phrase…');
        fireEvent.change(phraseInput, { target: { value: '   ' } });
        fireEvent.keyDown(phraseInput, { key: 'Enter' });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('ignores CSV change events with no selected file', () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(fileInput, 'files', { value: [] });
        fireEvent.change(fileInput);
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('opens the CSV file picker when the import button is clicked', () => {
        render(<VocabularyListEditor {...baseProps} items={[]} />);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const clickSpy = vi.spyOn(fileInput, 'click');
        fireEvent.click(screen.getByRole('button', { name: /import csv/i }));
        expect(clickSpy).toHaveBeenCalled();
    });

    it('toggles an item selection on and off', () => {
        const items = [makeItem({ id: 'v1' })];
        render(<VocabularyListEditor {...baseProps} items={items} />);
        fireEvent.click(screen.getByRole('button', { name: /select/i }));
        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);
        expect(screen.getByText('1 / 1')).toBeInTheDocument();
        fireEvent.click(checkbox);
        expect(screen.getByText('0 / 1')).toBeInTheDocument();
    });

    it('toggles selection by clicking the card in selection mode', () => {
        const items = [makeItem({ id: 'v1' })];
        const { container } = render(<VocabularyListEditor {...baseProps} items={items} />);
        fireEvent.click(screen.getByRole('button', { name: /select/i }));
        const card = container.querySelector('.card') as HTMLElement;
        fireEvent.click(card);
        expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });

    it('deselects all when clicking select-all twice', () => {
        const items = [makeItem({ id: 'v1' }), makeItem({ id: 'v2' })];
        render(<VocabularyListEditor {...baseProps} items={items} />);
        fireEvent.click(screen.getByRole('button', { name: /select/i }));
        const selectAllBtn = screen.getByRole('button', { name: /select all|deselect all/i });
        fireEvent.click(selectAllBtn);
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /deselect all/i }));
        expect(screen.getByText('0 / 2')).toBeInTheDocument();
    });

    it('updates category, linked criterion, and notes while editing inline', () => {
        const onUpdate = vi.fn();
        const items = [makeItem()];
        render(<VocabularyListEditor {...baseProps} items={items} onUpdate={onUpdate} />);

        const editBtns = screen.getAllByRole('button');
        const editBtn = editBtns.find((b) => b.querySelector('.lucide-chevron-down'));
        fireEvent.click(editBtn!);

        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'grammar' } });
        expect(onUpdate).toHaveBeenCalledWith({ ...items[0], category: 'grammar' });

        fireEvent.change(selects[1], { target: { value: 'crit1' } });
        expect(onUpdate).toHaveBeenCalledWith({ ...items[0], linkedCriterionId: 'crit1' });

        const notesInputs = screen.getAllByPlaceholderText('Notes (optional)…');
        fireEvent.change(notesInputs[0], { target: { value: 'remember tone' } });
        expect(onUpdate).toHaveBeenCalledWith({ ...items[0], notes: 'remember tone' });
    });

    it('changes category, linked criterion, and notes in the add form', () => {
        render(<VocabularyListEditor {...baseProps} items={[]} />);

        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'discourse' } });
        expect((selects[0] as HTMLSelectElement).value).toBe('discourse');

        fireEvent.change(selects[1], { target: { value: 'crit1' } });
        expect((selects[1] as HTMLSelectElement).value).toBe('crit1');

        const notesInput = screen.getByPlaceholderText('Notes (optional)…');
        fireEvent.change(notesInput, { target: { value: 'add context' } });
        expect((notesInput as HTMLInputElement).value).toBe('add context');
    });

    it('imports items from a CSV file', async () => {
        const onAdd = vi.fn();
        render(<VocabularyListEditor {...baseProps} items={[]} onAdd={onAdd} />);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['hello,extra\nworld\n'], 'words.csv', { type: 'text/csv' });

        Object.defineProperty(fileInput, 'files', { value: [file] });
        fireEvent.change(fileInput);

        await vi.waitFor(() => expect(onAdd).toHaveBeenCalled());
        expect(onAdd).toHaveBeenCalledWith({ phrase: 'hello', category: 'vocabulary' });
        expect(onAdd).toHaveBeenCalledWith({ phrase: 'world', category: 'vocabulary' });
    });

    describe('Cambridge lookup', () => {
        function enterEditMode(items: VocabularyItem[], extraProps: Record<string, unknown> = {}) {
            render(<VocabularyListEditor {...baseProps} items={items} {...extraProps} />);
            const editBtns = screen.getAllByRole('button');
            const editBtn = editBtns.find((b) => b.querySelector('.lucide-chevron-down'));
            fireEvent.click(editBtn!);
        }

        it('does not show the Look up button when no cambridgeApiKey is set', () => {
            enterEditMode([makeItem()]);
            expect(screen.queryByRole('button', { name: 'cambridge.lookup_button' })).toBeNull();
        });

        it('shows the Look up button when cambridgeApiKey is set', () => {
            enterEditMode([makeItem()], { cambridgeApiKey: 'key123' });
            expect(screen.getByRole('button', { name: 'cambridge.lookup_button' })).toBeInTheDocument();
        });

        it('fills empty cefrLevel and definition fields from a successful lookup', async () => {
            const onUpdate = vi.fn();
            (lookupWord as ReturnType<typeof vi.fn>).mockResolvedValue({
                level: 'B2',
                definition: 'a friendly greeting',
            });
            const items = [makeItem()];
            enterEditMode(items, { cambridgeApiKey: 'key123', onUpdate });

            fireEvent.click(screen.getByRole('button', { name: 'cambridge.lookup_button' }));

            await waitFor(() =>
                expect(onUpdate).toHaveBeenCalledWith({
                    ...items[0],
                    cefrLevel: 'B2',
                    definition: 'a friendly greeting',
                })
            );
        });

        it('does not overwrite an existing cefrLevel or definition', async () => {
            const onUpdate = vi.fn();
            (lookupWord as ReturnType<typeof vi.fn>).mockResolvedValue({
                level: 'B2',
                definition: 'a friendly greeting',
            });
            const items = [makeItem({ cefrLevel: 'A1', definition: 'existing definition' })];
            enterEditMode(items, { cambridgeApiKey: 'key123', onUpdate });

            fireEvent.click(screen.getByRole('button', { name: 'cambridge.lookup_button' }));

            await waitFor(() =>
                expect(onUpdate).toHaveBeenCalledWith({
                    ...items[0],
                    cefrLevel: 'A1',
                    definition: 'existing definition',
                })
            );
        });

        it('shows an error toast when the lookup fails', async () => {
            const onUpdate = vi.fn();
            (lookupWord as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const items = [makeItem()];
            enterEditMode(items, { cambridgeApiKey: 'key123', onUpdate });

            fireEvent.click(screen.getByRole('button', { name: 'cambridge.lookup_button' }));

            await waitFor(() => expect(lookupWord).toHaveBeenCalledWith('good morning', 'key123'));
            expect(onUpdate).not.toHaveBeenCalled();
        });

        it('shows an error toast and does not update when the lookup throws', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const onUpdate = vi.fn();
            (lookupWord as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
            const items = [makeItem()];
            enterEditMode(items, { cambridgeApiKey: 'key123', onUpdate });

            fireEvent.click(screen.getByRole('button', { name: 'cambridge.lookup_button' }));

            await waitFor(() => expect(lookupWord).toHaveBeenCalledWith('good morning', 'key123'));
            await waitFor(() => expect(consoleError).toHaveBeenCalled());
            expect(onUpdate).not.toHaveBeenCalled();
            consoleError.mockRestore();
        });
    });
});
