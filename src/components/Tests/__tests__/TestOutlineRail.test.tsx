import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestOutlineRail from '../TestOutlineRail';
import type { TestQuestion, TestSection } from '../../../types';
import type { BuilderInsights } from '../../../utils/builderItemAnalysis';

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

describe('TestOutlineRail as a tree', () => {
    it('keeps one tab stop and walks the outline with the arrow keys', () => {
        renderRail({ activeId: 'q1' });
        expect(screen.getByRole('tree')).toBeInTheDocument();
        const first = screen.getByTestId('outline-question-q1');
        const second = screen.getByTestId('outline-question-q2');
        expect(first).toHaveAttribute('tabindex', '0');
        expect(second).toHaveAttribute('tabindex', '-1');

        first.focus();
        fireEvent.keyDown(first, { key: 'ArrowDown' });
        expect(second).toHaveFocus();
        fireEvent.keyDown(second, { key: 'End' });
        expect(screen.getByTestId('outline-question-q3')).toHaveFocus();
        fireEvent.keyDown(screen.getByTestId('outline-question-q3'), { key: 'Home' });
        expect(first).toHaveFocus();
    });

    it('opens with Enter and steps out to the section with Left', () => {
        const onSelectSection = vi.fn();
        const { onSelect } = renderRail({ activeId: 'q2', onSelectSection });
        const second = screen.getByTestId('outline-question-q2');
        fireEvent.keyDown(second, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('q2');

        second.focus();
        fireEvent.keyDown(second, { key: 'ArrowLeft' });
        expect(screen.getByTestId('outline-section-s1')).toHaveFocus();
    });

    it('collapses and expands a section by key and by its chevron', () => {
        renderRail({ onSelectSection: vi.fn() });
        const header = screen.getByTestId('outline-section-s1');
        expect(header).toHaveAttribute('aria-expanded', 'true');
        expect(header).toHaveAttribute('role', 'treeitem');

        header.focus();
        fireEvent.keyDown(header, { key: 'ArrowLeft' });
        expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('outline-question-q2')).not.toBeInTheDocument();
        expect(header).toHaveFocus();

        fireEvent.keyDown(header, { key: 'ArrowRight' });
        expect(screen.getByTestId('outline-question-q2')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('outline-section-toggle-s1'));
        expect(screen.queryByTestId('outline-question-q3')).not.toBeInTheDocument();
    });
});

describe('TestOutlineRail tab stop', () => {
    it('keeps exactly one tab stop when a section and a question are both open', () => {
        renderRail({ activeId: 'q2', activeSectionId: 's1', onSelectSection: vi.fn() });
        const tabbable = screen.getByRole('tree').querySelectorAll('[tabindex="0"]');
        expect(tabbable).toHaveLength(1);
        // The open question wins over its section.
        expect(tabbable[0]).toBe(screen.getByTestId('outline-question-q2'));
    });

    it('falls back to the selected section when no question is open', () => {
        renderRail({ activeId: null, activeSectionId: 's1', onSelectSection: vi.fn() });
        const tabbable = screen.getByRole('tree').querySelectorAll('[tabindex="0"]');
        expect(tabbable).toHaveLength(1);
        expect(tabbable[0]).toBe(screen.getByTestId('outline-section-s1'));
    });

    it('falls back to the first row when nothing is selected', () => {
        renderRail();
        const tabbable = screen.getByRole('tree').querySelectorAll('[tabindex="0"]');
        expect(tabbable).toHaveLength(1);
        expect(tabbable[0]).toBe(screen.getByTestId('outline-question-q1'));
    });

    it('moves the tab stop to a mounted row when the open question is hidden by a collapsed section', () => {
        renderRail({ activeId: 'q2', activeSectionId: null, onSelectSection: vi.fn() });
        fireEvent.click(screen.getByTestId('outline-section-toggle-s1'));
        const tabbable = screen.getByRole('tree').querySelectorAll('[tabindex="0"]');
        expect(tabbable).toHaveLength(1);
        expect(screen.queryByTestId('outline-question-q2')).not.toBeInTheDocument();
    });

    it('offers the question menu on right-click and keeps the rail read-only without one', () => {
        const duplicate = vi.fn();
        const questionMenu = (q: TestQuestion) => [{ key: 'dup', label: `dup ${q.id}`, onSelect: duplicate }];
        renderRail({ questionMenu });
        fireEvent.contextMenu(screen.getByText('Second question'));
        fireEvent.click(screen.getByRole('menuitem', { name: 'dup q2' }));
        expect(duplicate).toHaveBeenCalledOnce();
    });

    it('gives each row a touch-only menu button that opens the same menu', () => {
        const questionMenu = (q: TestQuestion) => [{ key: 'x', label: `act ${q.id}`, onSelect: vi.fn() }];
        renderRail({ questionMenu });
        const buttons = screen.getAllByRole('button', { name: 'tests.outline_menu_label' });
        expect(buttons).toHaveLength(questions.length);
        expect(buttons[0]).toHaveClass('menu-touch-only');
        fireEvent.click(buttons[0]);
        expect(screen.getByRole('menuitem', { name: 'act q1' })).toBeInTheDocument();
    });

    it('opens no menu when the rail has none', () => {
        renderRail();
        fireEvent.contextMenu(screen.getByText('Second question'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'tests.outline_menu_label' })).not.toBeInTheDocument();
    });
});

describe('TestOutlineRail item insights', () => {
    const insights: BuilderInsights = {
        byQuestion: new Map([
            [
                'q1',
                {
                    questionId: 'q1',
                    sampleSize: 9,
                    pValue: 0.2,
                    discrimination: 0.1,
                    readings: ['too_hard', 'weak_discrimination'],
                },
            ],
            [
                'q2',
                {
                    questionId: 'q2',
                    sampleSize: 9,
                    pValue: 0.6,
                    discrimination: 0.5,
                    readings: [],
                },
            ],
        ]),
        needsReviewIds: new Set(['q1']),
        classes: ['3A', '3B'],
        sample: 9,
        minSample: 5,
        hasData: true,
    };

    it('badges only the questions that need review', () => {
        renderRail({ insights });
        expect(screen.getByTestId('outline-reading-q1')).toHaveTextContent('tests.builder_insight.reading_too_hard');
        expect(screen.queryByTestId('outline-reading-q2')).toBeNull();
    });

    it('filters the outline to questions that need review', () => {
        renderRail({ insights, activeId: 'q1' });
        fireEvent.click(screen.getByTestId('outline-needs-review'));
        expect(screen.getByText('First question')).toBeInTheDocument();
        expect(screen.queryByText('Second question')).toBeNull();
        expect(screen.getByTestId('outline-insight')).toHaveTextContent('tests.builder_insight.title');
    });

    it("shows the focused question's numbers and the classes they came from", () => {
        renderRail({ insights, activeId: 'q1' });
        const card = screen.getByTestId('outline-insight');
        expect(card).toHaveTextContent('0.20');
        expect(card).toHaveTextContent('0.10');
        expect(card).toHaveTextContent('tests.builder_insight.classes');
    });

    it('hides the review toggle until there are enough sittings', () => {
        renderRail({ insights: { ...insights, hasData: false, byQuestion: new Map(), sample: 2 } });
        expect(screen.queryByTestId('outline-needs-review')).toBeNull();
        expect(screen.queryByTestId('outline-insight')).toBeNull();
    });
});
