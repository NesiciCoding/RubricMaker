import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestOutlineRail from '../TestOutlineRail';
import type { TestQuestion, TestSection } from '../../../types';

const section: TestSection = { id: 's1', title: 'Part 1 — Reading', content: '' };

const questions: TestQuestion[] = [
    { id: 'q1', prompt: '<p>First question</p>', type: 'multiple-choice', points: 2 },
    { id: 'q2', prompt: '<p>Second question</p>', type: 'short-answer', points: 3, sectionId: 's1' },
    { id: 'q3', prompt: '', type: 'open', points: 4, sectionId: 's1' },
];

function renderRail(overrides: Partial<React.ComponentProps<typeof TestOutlineRail>> = {}) {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const onOpenSettings = vi.fn();
    render(
        <TestOutlineRail
            sections={[section]}
            questions={questions}
            totalPoints={9}
            issuesByQuestion={new Map()}
            onSelect={onSelect}
            onAdd={onAdd}
            onOpenSettings={onOpenSettings}
            {...overrides}
        />
    );
    return { onSelect, onAdd, onOpenSettings };
}

describe('TestOutlineRail', () => {
    it('lists the structure with the numbers the question cards show', () => {
        renderRail();
        expect(screen.getByText('tests.outline_title')).toBeInTheDocument();
        expect(screen.getByText('tests.no_section')).toBeInTheDocument();
        expect(screen.getByText('Part 1 — Reading')).toBeInTheDocument();
        expect(screen.getByText('First question')).toBeInTheDocument();
        expect(screen.getByText('Second question')).toBeInTheDocument();
        // A question with no prompt falls back to its type name instead of a blank row.
        expect(screen.getByText('tests.question_type_open')).toBeInTheDocument();
        // Numbers are the display order the cards use, not the order inside each group.
        const row = screen.getByText('Second question').closest('button');
        expect(row?.textContent).toContain('2');
        expect(screen.getByText('tests.question_type_open').closest('button')?.textContent).toContain('3');
    });

    it('selects the question that was clicked', () => {
        const { onSelect } = renderRail();
        fireEvent.click(screen.getByText('Second question'));
        expect(onSelect).toHaveBeenCalledWith('q2');
    });

    it('marks the open question and adds a new one from the rail', () => {
        const { onAdd } = renderRail({ activeId: 'q2' });
        expect(screen.getByText('Second question').closest('button')).toHaveAttribute('aria-current', 'true');
        expect(screen.getByText('First question').closest('button')).not.toHaveAttribute('aria-current');
        fireEvent.click(screen.getByText('tests.add_question'));
        expect(onAdd).toHaveBeenCalled();
    });

    it('filters the outline by prompt, keeping the numbering of the full test', () => {
        renderRail();
        fireEvent.change(screen.getByLabelText('tests.outline_search_placeholder'), {
            target: { value: 'second' },
        });
        expect(screen.getByText('Second question')).toBeInTheDocument();
        expect(screen.queryByText('First question')).not.toBeInTheDocument();
        // Numbers come from the full display order, not from the filtered list.
        expect(screen.getByText('Second question').closest('button')?.textContent).toContain('2');

        fireEvent.change(screen.getByLabelText('tests.outline_search_placeholder'), {
            target: { value: 'nothing matches this' },
        });
        expect(screen.getByText('tests.outline_no_matches')).toBeInTheDocument();
    });

    it('marks the questions the checks screen is blocking on', () => {
        renderRail({ issuesByQuestion: new Map([['q2', ['missing_correct']]]) });
        expect(screen.getByLabelText('tests.issues_title')).toBeInTheDocument();
    });

    it('shows an empty hint instead of an empty list', () => {
        renderRail({ sections: [], questions: [], totalPoints: 0 });
        expect(screen.getByText('tests.no_questions')).toBeInTheDocument();
        expect(screen.queryByText('tests.no_section')).not.toBeInTheDocument();
    });
    it('opens a section workspace from its heading', () => {
        const onSelectSection = vi.fn();
        renderRail({ onSelectSection, activeSectionId: 's1' });

        const heading = screen.getByTestId('outline-section-s1');
        expect(heading).toHaveAttribute('aria-current', 'true');
        fireEvent.click(heading);
        expect(onSelectSection).toHaveBeenCalledWith('s1');
    });

    it('keeps a section without questions reachable', () => {
        const onSelectSection = vi.fn();
        renderRail({ sections: [{ id: 's2', title: 'Empty part' }], onSelectSection });

        fireEvent.click(screen.getByTestId('outline-section-s2'));
        expect(onSelectSection).toHaveBeenCalledWith('s2');
    });

    it('leaves the uncategorised group without a section to open', () => {
        renderRail({ onSelectSection: vi.fn() });
        expect(screen.queryByTestId('outline-section-__none__')).not.toBeInTheDocument();
    });
});
