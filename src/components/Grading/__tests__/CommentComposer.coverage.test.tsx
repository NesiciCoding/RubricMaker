import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CommentComposer from '../CommentComposer';
import type { CommentBankItem } from '../../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const items: CommentBankItem[] = [
    // highest usage first; long text exercises the truncation path
    {
        id: 'i1',
        text: 'This sentence is definitely longer than forty-two characters so it gets cut.',
        usageCount: 5,
        tags: [],
        createdAt: '2024-01-01',
    },
    // same usage, newer lastUsedAt wins
    { id: 'i2', text: 'B newer used', usageCount: 2, lastUsedAt: '2024-01-02', tags: [], createdAt: '2024-01-01' },
    // same usage + lastUsedAt → createdAt tiebreak (later first)
    { id: 'i3', text: 'C created latest', usageCount: 2, lastUsedAt: '2024-01-01', tags: [], createdAt: '2024-01-02' },
    { id: 'i4', text: 'D created middle', usageCount: 2, lastUsedAt: '2024-01-01', tags: [], createdAt: '2024-01-01' },
    // createdAt missing → the `?? ''` fallback in the final tiebreak (runtime legacy rows)
    {
        id: 'i5',
        text: 'E no created',
        usageCount: 2,
        lastUsedAt: '2024-01-01',
        tags: [] as string[],
    } as CommentBankItem,
    // usageCount missing → the `?? 0` fallback in the primary sort
    { id: 'i6', text: 'F no usage', tags: [] as string[] } as CommentBankItem,
    // fully-bare twin: comparing it against i6 exercises every `?? ''` fallback on both operands
    { id: 'i7', text: 'G also bare', tags: [] as string[] } as CommentBankItem,
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
    const props: React.ComponentProps<typeof CommentComposer> = {
        value: '',
        onChange: vi.fn(),
        editorRef: null,
        commentBank: items,
        onInsertChip: vi.fn(),
        onBrowseAll: vi.fn(),
        audioRecording: false,
        onStartAudio: vi.fn(),
        onStopAudio: vi.fn(),
        onRemoveAudio: vi.fn(),
        ...overrides,
    };
    return render(<CommentComposer {...props} />);
}

describe('CommentComposer coverage', () => {
    it('sorts quick chips by usage, then last-used, then creation date and truncates long text', () => {
        renderComposer();
        const buttons = screen.getAllByRole('button').filter((b) => b.title);
        // usage 5 first, truncated with an ellipsis; full text stays in the title
        expect(buttons[0]).toHaveTextContent(/^This sentence is definitely longer than/);
        expect(buttons[0].textContent).toMatch(/…$/);
        expect(buttons[0].getAttribute('title')).toBe(
            'This sentence is definitely longer than forty-two characters so it gets cut.'
        );
        // remaining chips in comparator order: lastUsedAt, then createdAt, then the fallbacks
        const texts = buttons.slice(1).map((b) => b.textContent as string);
        const idx = (s: string) => texts.findIndex((t) => t.includes(s));
        expect(idx('B newer used')).toBeLessThan(idx('C created latest'));
        expect(idx('C created latest')).toBeLessThan(idx('D created middle'));
        expect(idx('D created middle')).toBeLessThan(idx('E no created'));
        expect(idx('E no created')).toBeLessThan(idx('F no usage'));
        // the seventh bare chip is sliced off by CHIP_COUNT, but its comparator ran
    });

    it('inserts a chip and opens the bank browser', () => {
        const onInsertChip = vi.fn();
        const onBrowseAll = vi.fn();
        renderComposer({ onInsertChip, onBrowseAll });

        fireEvent.click(screen.getByText('B newer used'));
        expect(onInsertChip).toHaveBeenCalledWith(items[1]);

        fireEvent.click(screen.getByText('gradeStudent.comment_open_bank'));
        expect(onBrowseAll).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state when the bank has no items', () => {
        renderComposer({ commentBank: [] });
        expect(screen.getByText('gradeStudent.quick_comments_empty')).toBeInTheDocument();
        expect(screen.queryByText('B newer used')).not.toBeInTheDocument();
    });

    it('toggles audio record/stop and passes audio props through', () => {
        const onStartAudio = vi.fn();
        const onStopAudio = vi.fn();
        const onRemoveAudio = vi.fn();
        const r1 = renderComposer({ onStartAudio, onStopAudio, onRemoveAudio });
        fireEvent.click(screen.getByText('gradeStudent.audio_record'));
        expect(onStartAudio).toHaveBeenCalledTimes(1);
        r1.unmount();

        renderComposer({ onStartAudio, onStopAudio, onRemoveAudio, audioRecording: true });
        fireEvent.click(screen.getByText('gradeStudent.audio_stop'));
        expect(onStopAudio).toHaveBeenCalledTimes(1);
    });
});
