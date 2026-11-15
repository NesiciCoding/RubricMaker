import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestSectionWorkspace from '../TestSectionWorkspace';
import type { TestSection } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../Editor/EssayEditor', () => ({
    default: ({
        content,
        onChange,
        placeholder,
    }: {
        content: string;
        onChange: (html: string) => void;
        placeholder?: string;
    }) => (
        <textarea
            aria-label={placeholder ?? 'passage'}
            value={content}
            onChange={(event) => onChange(event.target.value)}
        />
    ),
}));

vi.mock('../AudioUrlStatus', () => ({ default: () => null }));

vi.mock('../ListeningControlsFields', () => ({
    default: ({ id, onChange }: { id: string; onChange: (patch: object) => void }) => (
        <button type="button" data-testid={`listening-${id}`} onClick={() => onChange({ listeningMode: 'audio' })}>
            listening
        </button>
    ),
}));

const section: TestSection = { id: 's1', title: 'Part 1 — Reading', content: '<p>Passage</p>', audioUrl: '' };

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof TestSectionWorkspace>> = {}) {
    const onPatch = vi.fn();
    const onContentChange = vi.fn();
    const onSaveToBank = vi.fn();
    const onSeedDeck = vi.fn();
    const onAddQuestion = vi.fn();
    const onClose = vi.fn();
    render(
        <TestSectionWorkspace
            section={section}
            targetLevel=""
            questionCount={2}
            onPatch={onPatch}
            onContentChange={onContentChange}
            onSaveToBank={onSaveToBank}
            onSeedDeck={onSeedDeck}
            {...overrides}
        />
    );
    return { onPatch, onContentChange, onSaveToBank, onSeedDeck, onAddQuestion, onClose };
}

describe('TestSectionWorkspace', () => {
    it('keeps the passage folded until it is asked for', () => {
        renderWorkspace();
        expect(screen.getByText('tests.section_passage_label')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByLabelText('tests.section_passage_placeholder')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('tests.section_passage_label'));
        expect(screen.getByText('tests.section_passage_label')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByLabelText('tests.section_passage_placeholder')).toHaveValue('<p>Passage</p>');
    });

    it('opens the passage straight away when the caller asks for it', () => {
        renderWorkspace({ defaultPassageOpen: true });
        expect(screen.getByLabelText('tests.section_passage_placeholder')).toBeInTheDocument();
    });

    it('reports edits instead of keeping them', () => {
        const { onContentChange, onPatch } = renderWorkspace({ defaultPassageOpen: true });
        fireEvent.change(screen.getByLabelText('tests.section_passage_placeholder'), {
            target: { value: '<p>New passage</p>' },
        });
        expect(onContentChange).toHaveBeenCalledWith('<p>New passage</p>');

        fireEvent.change(screen.getByLabelText(/tests.section_audio_label/), {
            target: { value: 'https://example.com/part1.mp3' },
        });
        expect(onPatch).toHaveBeenCalledWith({ audioUrl: 'https://example.com/part1.mp3' });

        fireEvent.click(screen.getByTestId('listening-section-s1'));
        expect(onPatch).toHaveBeenCalledWith({ listeningMode: 'audio' });
    });

    it('saves the section to the bank only once it has questions', () => {
        const { onSaveToBank } = renderWorkspace();
        fireEvent.click(screen.getByText('questionBank.save_section_to_bank'));
        expect(onSaveToBank).toHaveBeenCalled();

        renderWorkspace({ questionCount: 0 });
        const buttons = screen.getAllByText('questionBank.save_section_to_bank');
        expect(buttons[1].closest('button')).toBeDisabled();
    });

    it('stands alone in the rail layout, with a heading, a way back and add-question', () => {
        const onAddQuestion = vi.fn();
        const onClose = vi.fn();
        renderWorkspace({ onAddQuestion, onClose });

        expect(screen.getByRole('heading', { name: 'Part 1 — Reading' })).toBeInTheDocument();
        fireEvent.click(screen.getByText('tests.add_question'));
        expect(onAddQuestion).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('leaves the footer controls to the stacked card', () => {
        renderWorkspace();
        expect(screen.queryByText('tests.add_question')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    });
});
