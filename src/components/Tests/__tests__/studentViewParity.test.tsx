import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudentQuestionCard from '../StudentQuestionCard';
import TestInspector from '../TestInspector';
import { QUESTION_TYPE_FIXTURES } from '../../../test-utils/questionTypeFixtures';
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
    id: 't-parity',
    name: 'Parity test',
    questions: [],
    sections: [],
    requireSEB: false,
    shuffleQuestions: false,
    createdAt: '2024-01-01T00:00:00Z',
};

/** React's generated ids (useId) differ per mount; strip the attributes that carry them. */
function normalize(html: string): string {
    return html
        .replace(/\s(?:id|for|aria-labelledby|aria-describedby)="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function surfaceOf(root: HTMLElement): HTMLElement {
    const surface = root.querySelector('[data-testid="answer-surface"]');
    if (!(surface instanceof HTMLElement)) throw new Error('the answer surface did not render');
    return surface;
}

/** The media a student sees before answering, as rendered — no playback is asserted. */
function mediaOf(root: HTMLElement): string[] {
    return [...root.querySelectorAll('img, audio')].map((element) => normalize(element.outerHTML));
}

/** The hint toggle's own container: button label before opening, label + hint after. */
function hintOf(root: HTMLElement): { before: string; after: string } | null {
    // By name, not by `[aria-expanded]`: the runner card also renders a HelpPopover toggle.
    const button = within(root).queryByRole('button', { name: /tests\.taking\.hint_/ });
    if (!(button instanceof HTMLButtonElement)) return null;
    const container = button.parentElement;
    if (!container) throw new Error('the hint toggle has no container');
    const before = normalize(container.textContent ?? '');
    fireEvent.click(button);
    return { before, after: normalize(container.textContent ?? '') };
}

interface Snapshot {
    answer: string;
    media: string[];
    hint: { before: string; after: string } | null;
    controls: number;
    /** Markup, so attribute-only labels (placeholders, aria-labels) count as shown. */
    markup: string;
}

function readSurface(root: HTMLElement, unmount: () => void): Snapshot {
    const surface = surfaceOf(root);
    const snapshot: Snapshot = {
        answer: normalize(surface.innerHTML),
        media: mediaOf(root),
        hint: hintOf(root),
        controls: surface.querySelectorAll('input, select, textarea, button, [role="button"]').length,
        markup: normalize(root.innerHTML),
    };
    unmount();
    return snapshot;
}

function readRunner(question: TestQuestion): Snapshot {
    const { container, unmount } = render(
        <StudentQuestionCard question={question} index={0} total={1} value="" onChange={() => {}} code="" lang="en" />
    );
    return readSurface(container, unmount);
}

function readPreview(question: TestQuestion): Snapshot {
    const { container, unmount } = render(
        <TestInspector
            test={test}
            onPrintTextChange={() => {}}
            question={question}
            questionNumber={1}
            questionCount={1}
            lang="en"
        />
    );
    fireEvent.click(within(container).getByRole('tab', { name: /tests\.inspector_question/ }));
    return readSurface(screen.getByTestId('inspector-student-view'), unmount);
}

describe('the builder student view matches the runner card', () => {
    for (const fixture of QUESTION_TYPE_FIXTURES) {
        it(`${fixture.type}: previews the same answer surface, media and hint`, () => {
            const original = JSON.stringify(fixture.question);

            const runner = readRunner(fixture.question);
            const preview = readPreview(fixture.question);

            // Guards against a fixture that parses to nothing and would compare empty-to-empty.
            expect(runner.controls, `${fixture.type} fixture renders no answer control`).toBeGreaterThan(0);

            expect(preview.answer).toBe(runner.answer);
            expect(preview.media).toEqual(runner.media);
            expect(preview.hint).toEqual(runner.hint);

            for (const text of fixture.expectText ?? []) {
                expect(runner.markup, `runner is missing ${text}`).toContain(text);
                expect(preview.markup, `preview is missing ${text}`).toContain(text);
            }

            expect(JSON.stringify(fixture.question)).toBe(original);
        });
    }

    it('counts preview plays locally, so clicking through the preview never edits the test', async () => {
        const dictation = QUESTION_TYPE_FIXTURES.find((fixture) => fixture.type === 'dictation')!;
        const original = JSON.stringify(dictation.question);
        // jsdom has no media pipeline; the play-limit counter only needs play() to resolve.
        const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

        try {
            const onPrintTextChange = vi.fn();
            render(
                <TestInspector
                    test={test}
                    onPrintTextChange={onPrintTextChange}
                    question={dictation.question}
                    questionNumber={1}
                    questionCount={1}
                    lang="en"
                />
            );
            fireEvent.click(screen.getByRole('tab', { name: /tests\.inspector_question/ }));
            const view = screen.getByTestId('inspector-student-view');
            expect(view).toHaveTextContent('"left":2');

            fireEvent.click(within(view).getByRole('button', { name: /tests\.taking\.dictation_play/ }));

            await screen.findByText(/tests\.taking\.audio_plays_left \{"left":1/);
            expect(JSON.stringify(dictation.question)).toBe(original);
            expect(onPrintTextChange).not.toHaveBeenCalled();
        } finally {
            play.mockRestore();
        }
    });

    it('is a real comparison: the runner and preview differ for a type with its own layout', () => {
        const matrix = QUESTION_TYPE_FIXTURES.find((fixture) => fixture.type === 'matrix')!;
        const runner = readRunner(matrix.question);
        const surface = document.createElement('div');
        surface.innerHTML = runner.answer;
        // The matrix surface is a table of radios, not the single-line text input of a short answer.
        expect(surface.querySelectorAll('table input[type="radio"]').length).toBe(4);
        expect(surface.querySelector('input[type="text"]')).toBeNull();
    });
});
