import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { TestQuestion } from '../../../types';
import ClozeAnswer from '../ClozeAnswer';
import ClozeGapEditor from '../ClozeGapEditor';
import { speakableQuestionText } from '../StudentQuestionCard';

const base: TestQuestion = {
    id: 'q',
    type: 'cloze',
    points: 2,
    prompt: '<p>The <strong>{{cat}}</strong> sat on <em>the {{mat}}</em>.</p><ul><li>Then {{ran}}</li></ul>',
};

describe('formatted cloze for students', () => {
    it('keeps the formatting around each typed gap and records answers by gap number', () => {
        const onChange = vi.fn();
        const { container } = render(<ClozeAnswer question={base} value="" onChange={onChange} code="c" />);
        expect(container.querySelector('strong input')).not.toBeNull();
        expect(container.querySelector('em input')).not.toBeNull();
        expect(container.querySelector('ul li input')).not.toBeNull();
        expect(container.querySelectorAll('input')).toHaveLength(3);

        fireEvent.change(container.querySelectorAll('input')[1], { target: { value: 'rug' } });
        expect(JSON.parse(onChange.mock.calls[0][0])).toEqual({ 1: 'rug' });
        expect(container.textContent).toContain('The ');
    });

    it('names each gap and switches off mobile autocorrect', () => {
        const { container } = render(<ClozeAnswer question={base} value="" onChange={vi.fn()} code="c" />);
        const first = container.querySelector('input') as HTMLInputElement;
        expect(first).toHaveAttribute('aria-label');
        expect(first).toHaveAttribute('autocapitalize', 'off');
        expect(first).toHaveAttribute('spellcheck', 'false');
    });

    it('shows a dropdown per gap, with each choice once', () => {
        const q: TestQuestion = {
            ...base,
            type: 'cloze-dropdown',
            prompt: '<p>It is <strong>{{=big|small|small}}</strong>.</p>',
        };
        const { container } = render(<ClozeAnswer question={q} value="" onChange={vi.fn()} code="c" />);
        const options = [...container.querySelectorAll('strong select option')].map((o) => o.textContent);
        expect(options.filter((o) => o === 'small')).toHaveLength(1);
        expect(options).toContain('big');
    });

    it('places a word-bank tile into a gap that sits inside formatting', () => {
        const onChange = vi.fn();
        const q: TestQuestion = {
            ...base,
            type: 'cloze-bank',
            prompt: '<p>The <strong>{{cat}}</strong> sat.</p>',
            bankDistractors: ['dog'],
        };
        render(<ClozeAnswer question={q} value="" onChange={onChange} code="c" />);
        fireEvent.click(screen.getByRole('button', { name: 'cat' }));
        fireEvent.click(document.querySelector('strong button') as HTMLElement);
        expect(JSON.parse(onChange.mock.calls[0][0])).toEqual({ 0: 'cat' });
    });

    it('never injects markup from the prompt', () => {
        const q = { ...base, prompt: '<p>Hi <script>alert(1)</script><img src=x onerror="alert(1)"> {{a}}</p>' };
        const { container } = render(<ClozeAnswer question={q} value="" onChange={vi.fn()} code="c" />);
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelectorAll('input')).toHaveLength(1);
    });

    it('is read aloud as plain text with the gaps blanked', () => {
        expect(speakableQuestionText(base, 'blank')).toBe('The blank sat on the blank.\nThen blank');
    });
});

describe('cloze editor formatting toolbar', () => {
    const props = {
        allowDropdown: false,
        insertGapLabel: '+ gap',
        insertDropdownGapLabel: '+ dropdown',
    };

    it('offers the formatting buttons next to the gap buttons', async () => {
        const onChange = vi.fn();
        render(<ClozeGapEditor value="The {{cat}} sat." onChange={onChange} {...props} />);
        const editorEl = await waitFor(() => document.querySelector('.cloze-gap-editor-content') as HTMLElement);
        expect(editorEl).not.toBeNull();
        const bold = screen.getByRole('button', { name: /bold/i });
        expect(bold).toHaveAttribute('aria-pressed', 'false');
        for (const name of [/italic/i, /underline/i, /superscript/i, /subscript/i, /bullet/i, /numbered/i, /\+ gap/]) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        // Formatting nothing leaves an unformatted prompt untouched.
        fireEvent.mouseDown(bold);
        fireEvent.click(bold);
        expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('<'));
    });
});
