import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestInspector from '../TestInspector';
import type { Test, TestQuestion } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts && Object.keys(opts).length > 0 ? `${key} ${JSON.stringify(opts)}` : key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('../TestA4Preview', () => ({
    default: ({ test }: { test: Test }) => <div data-testid="a4-preview-mock">{test.name}</div>,
}));

const test: Test = {
    id: 't1',
    name: 'Unit test',
    questions: [],
    sections: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

const question: TestQuestion = {
    id: 'q1',
    type: 'short-answer',
    prompt: '<p>Write the past tense of “go”.</p>',
    points: 2,
    imageUrl: 'https://example.com/verbs.png',
    audioUrl: 'https://example.com/verbs.mp3',
    hint: 'It is an irregular verb.',
};

function renderInspector(overrides: Partial<React.ComponentProps<typeof TestInspector>> = {}) {
    const onPrintTextChange = vi.fn();
    const result = render(
        <TestInspector
            test={test}
            onPrintTextChange={onPrintTextChange}
            question={question}
            questionNumber={1}
            questionCount={3}
            {...overrides}
        />
    );
    return { onPrintTextChange, rerender: result.rerender };
}

describe('TestInspector', () => {
    it('opens on the paper and keeps the A4 preview mounted', () => {
        renderInspector();
        expect(screen.getByRole('tab', { name: /tests.inspector_paper/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /tests.inspector_question/ })).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByTestId('a4-pane')).toBeInTheDocument();
        expect(screen.getByTestId('a4-preview-mock')).toHaveTextContent('Unit test');
    });

    it('switches to the student view of the open question', () => {
        renderInspector();
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));

        expect(screen.getByRole('tab', { name: /tests.inspector_question/ })).toHaveAttribute('aria-selected', 'true');
        expect(document.getElementById('test-inspector-paper')).toHaveAttribute('hidden');
        expect(document.getElementById('test-inspector-question')).not.toHaveAttribute('hidden');

        const view = screen.getByTestId('inspector-student-view');
        expect(view).toHaveTextContent('Write the past tense of “go”.');
        expect(view).toHaveTextContent(/tests\.points_total/);
        expect(view).toHaveTextContent('tests.inspector_preview_note');
        // The student's answer surface is mounted, ready to be clicked through.
        expect(view.querySelector('input[type="text"]')).not.toBeNull();
    });

    it('shows the image, audio stimulus and hint a student meets before answering', () => {
        renderInspector();
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));
        const view = screen.getByTestId('inspector-student-view');

        const image = view.querySelector('img') as HTMLImageElement;
        expect(image).not.toBeNull();
        expect(image.src).toBe('https://example.com/verbs.png');
        expect(image.alt).toBe('tests.taking.question_image_alt');

        const audio = view.querySelector('audio') as HTMLAudioElement;
        expect(audio).not.toBeNull();
        expect(audio.getAttribute('src')).toBe('https://example.com/verbs.mp3');
        expect(audio.getAttribute('aria-label')).toBe('tests.taking.question_audio_alt');

        // The hint stays behind the same toggle a student uses, and opens on demand only.
        expect(view).not.toHaveTextContent('It is an irregular verb.');
        const hintButton = within(view).getByRole('button', { name: /tests.taking.hint_show/ });
        expect(hintButton).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(hintButton);
        expect(view).toHaveTextContent('It is an irregular verb.');
        expect(within(view).getByRole('button', { name: /tests.taking.hint_hide/ })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });

    it('keeps a picked answer and the opened hint when the tab is switched back to', () => {
        renderInspector();
        const tabs = screen.getAllByRole('tab');
        fireEvent.click(tabs[1]);
        fireEvent.click(
            within(screen.getByTestId('inspector-student-view')).getByRole('button', { name: /hint_show/ })
        );
        fireEvent.click(tabs[0]);
        fireEvent.click(tabs[1]);
        expect(screen.getByTestId('inspector-student-view')).toHaveTextContent('It is an irregular verb.');
    });

    it('keeps the preview answer local, so nothing is written back to the test', () => {
        const { onPrintTextChange } = renderInspector();
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));
        const input = screen
            .getByTestId('inspector-student-view')
            .querySelector('input[type="text"]') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'went' } });
        expect(input.value).toBe('went');
        expect(onPrintTextChange).not.toHaveBeenCalled();
    });

    it('drops a preview answer that belonged to the previous question type', () => {
        const onPrintTextChange = vi.fn();
        const props = { test, onPrintTextChange, question, questionNumber: 1, questionCount: 3 };
        const { rerender } = render(<TestInspector {...props} />);
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));
        const input = screen
            .getByTestId('inspector-student-view')
            .querySelector('input[type="text"]') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'went' } });

        // Same id, new type: `went` would make the multiple-response surface parse a non-JSON value.
        rerender(
            <TestInspector
                {...props}
                question={{
                    ...question,
                    type: 'multiple-response',
                    options: [{ id: 'a', text: 'Option A', isCorrect: true }],
                }}
            />
        );
        const boxes = screen.getByTestId('inspector-student-view').querySelectorAll('input[type="checkbox"]');
        expect(boxes).toHaveLength(1);
        expect((boxes[0] as HTMLInputElement).checked).toBe(false);
    });

    it('shows the cloze instruction instead of the keyed prompt', () => {
        renderInspector({ question: { ...question, type: 'cloze', prompt: '<p>He {{went}} home.</p>' } });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));
        const view = screen.getByTestId('inspector-student-view');
        expect(view).not.toHaveTextContent('{{went}}');
        expect(view).toHaveTextContent('tests.taking.cloze_instruction');
    });

    it('moves between the tabs with the arrow keys, wrapping at the ends', () => {
        renderInspector();
        const paper = screen.getByRole('tab', { name: /tests.inspector_paper/ });
        paper.focus();

        fireEvent.keyDown(paper, { key: 'ArrowRight' });
        const studentTab = screen.getByRole('tab', { name: /tests.inspector_question/ });
        expect(studentTab).toHaveAttribute('aria-selected', 'true');
        expect(studentTab).toHaveFocus();
        expect(document.getElementById('test-inspector-question')).not.toHaveAttribute('hidden');

        fireEvent.keyDown(studentTab, { key: 'ArrowRight' });
        const answersTab = screen.getByRole('tab', { name: /tests.inspector_answers/ });
        expect(answersTab).toHaveAttribute('aria-selected', 'true');
        expect(answersTab).toHaveFocus();
        expect(document.getElementById('test-inspector-answers')).not.toHaveAttribute('hidden');

        fireEvent.keyDown(answersTab, { key: 'ArrowRight' });
        expect(paper).toHaveAttribute('aria-selected', 'true');
        expect(paper).toHaveFocus();

        fireEvent.keyDown(paper, { key: 'ArrowLeft' });
        expect(answersTab).toHaveAttribute('aria-selected', 'true');
        expect(answersTab).toHaveFocus();

        fireEvent.keyDown(answersTab, { key: 'Home' });
        expect(paper).toHaveAttribute('aria-selected', 'true');
        expect(paper).toHaveFocus();

        fireEvent.keyDown(paper, { key: 'End' });
        expect(answersTab).toHaveAttribute('aria-selected', 'true');
        expect(answersTab).toHaveFocus();
    });

    it('leaves other keys to the browser', () => {
        renderInspector();
        const paper = screen.getByRole('tab', { name: /tests.inspector_paper/ });
        paper.focus();
        fireEvent.keyDown(paper, { key: 'Tab' });
        expect(paper).toHaveAttribute('aria-selected', 'true');
        expect(paper).toHaveFocus();
    });

    it('asks for a question when none is open', () => {
        renderInspector({ question: null, questionNumber: undefined });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_question/ }));
        expect(screen.getByTestId('inspector-student-view')).toHaveTextContent('tests.inspector_no_question');
        expect(screen.queryByTestId('a4-preview-mock')).toBeInTheDocument();
    });

    it('shows the answer key, hint and explanation of the open question', () => {
        renderInspector({
            question: {
                ...question,
                expectedAnswers: ['went', 'gone'],
                explanation: '<p>“Go” is irregular.</p>',
            },
        });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));

        const panel = screen.getByTestId('inspector-answers');
        expect(panel).toHaveTextContent('tests.inspector_answers_key');
        expect(panel).toHaveTextContent('went / gone');
        expect(panel).toHaveTextContent('tests.inspector_answers_hint');
        expect(panel).toHaveTextContent('It is an irregular verb.');
        expect(panel).toHaveTextContent('tests.inspector_answers_explanation');
        expect(panel).toHaveTextContent('“Go” is irregular.');
    });

    it('says a hand-graded question has no single answer instead of showing an empty key', () => {
        renderInspector({ question: { ...question, type: 'open', hint: undefined } });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));

        const panel = screen.getByTestId('inspector-answers');
        expect(panel).toHaveTextContent('tests.inspector_answers_none');
        expect(panel).not.toHaveTextContent('tests.inspector_answers_hint');
        expect(panel).not.toHaveTextContent('tests.inspector_answers_explanation');
    });

    it('asks for a question on the key tab too', () => {
        renderInspector({ question: null, questionNumber: undefined });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));
        expect(screen.getByTestId('inspector-answers')).toHaveTextContent('tests.inspector_no_question');
    });

    it('lists a cloze key per gap instead of reprinting the sentence', () => {
        renderInspector({
            question: {
                ...question,
                type: 'cloze',
                hint: undefined,
                prompt: '<p>Yesterday he {{went|goes}} to school and {{saw|seen}} his teacher.</p>',
            },
        });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));

        const panel = screen.getByTestId('inspector-answers');
        expect(panel).toHaveTextContent('1. went / goes');
        expect(panel).toHaveTextContent('2. saw / seen');
        expect(panel).not.toHaveTextContent('to school and');
    });

    it('marks a choice answer by its letter, then the option text', () => {
        renderInspector({
            question: {
                ...question,
                type: 'multiple-response',
                expectedAnswers: undefined,
                options: [
                    { id: 'o1', text: 'went', isCorrect: true },
                    { id: 'o2', text: 'goed', isCorrect: false },
                    { id: 'o3', text: 'saw', isCorrect: true },
                ],
            },
        });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));
        expect(screen.getByTestId('inspector-answers')).toHaveTextContent('A, C — went, saw');
    });

    it('names a missing key instead of calling an auto-scored question hand-graded', () => {
        renderInspector({ question: { ...question, expectedAnswers: [], hint: undefined } });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));
        const panel = screen.getByTestId('inspector-answers');
        expect(panel).toHaveTextContent('tests.inspector_answers_missing');
        expect(panel).not.toHaveTextContent('tests.inspector_answers_none');
    });

    it('translates a true/false key rather than printing English', () => {
        renderInspector({
            question: { ...question, type: 'true-false', correctBoolean: false, expectedAnswers: undefined },
        });
        fireEvent.click(screen.getByRole('tab', { name: /tests.inspector_answers/ }));
        expect(screen.getByTestId('inspector-answers')).toHaveTextContent('tests.true_false_false');
    });
});
