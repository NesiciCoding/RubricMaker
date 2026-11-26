import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProofMarkList from './ProofMarkList';
import type { ProofRailRow } from './useProofRail';
import type { DocumentMark } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}|${JSON.stringify(values)}` : key),
    }),
}));

const makeMark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 'u1',
    symbolId: 'sp',
    anchor: { from: 1, to: 8 },
    status: 'noted',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

const makeRow = (overrides: Partial<ProofRailRow> = {}): ProofRailRow => ({
    id: '9',
    line: 9,
    ids: ['m1'],
    center: 100,
    top: 90,
    drift: 0,
    stacked: false,
    overflow: false,
    multiLine: false,
    block: 2,
    marks: [makeMark()],
    ...overrides,
});

/** Three marks in ¶2, one in ¶3 — the data set both renderers are checked against. */
const ROWS: ProofRailRow[] = [
    makeRow({
        ids: ['m1', 'm2', 'm3'],
        marks: [
            makeMark({ payload: { text: 'receive' } }),
            makeMark({ id: 'm2', symbolId: 'del' }),
            makeMark({ id: 'm3', symbolId: 'caps' }),
        ],
    }),
    makeRow({
        id: '12',
        line: 12,
        ids: ['m4'],
        block: 3,
        marks: [makeMark({ id: 'm4', symbolId: 'comma' })],
    }),
];

const snippetFor = (mark: DocumentMark) => (mark.id === 'm1' ? 'recieve' : null);

function renderList(overrides: Partial<React.ComponentProps<typeof ProofMarkList>> = {}) {
    return render(
        <ProofMarkList rows={ROWS} activeLine={null} onSelectLine={vi.fn()} snippetFor={snippetFor} {...overrides} />
    );
}

describe('ProofMarkList', () => {
    it('lists every mark under its paragraph, with the word and its replacement', () => {
        renderList();

        expect(screen.getByRole('region', { name: 'proofMarks.list.label' })).toBeInTheDocument();
        expect(screen.getByRole('heading').textContent).toBe('proofMarks.list.title|{"count":4}');
        const paragraphs = screen.getAllByText(/proofMarks\.list\.paragraph/);
        expect(paragraphs).toHaveLength(2);
        expect(paragraphs[0].textContent).toBe('proofMarks.list.paragraph|{"index":2}');

        const item = document.querySelector('[data-mark-id="m1"]');
        expect(item?.textContent).toContain('recieve');
        expect(item?.textContent).toContain('receive');
        expect(item?.tagName).toBe('BUTTON');
    });

    it('collapses a paragraph to two marks and expands on demand', () => {
        renderList();

        // ¶2 has three marks, so one is held back; ¶3 has one and is untouched.
        expect(document.querySelectorAll('button[data-mark-id]')).toHaveLength(3);
        expect(screen.getByText('proofMarks.list.more|{"count":1}')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.list.showAll|{"count":4}' }));

        expect(document.querySelectorAll('button[data-mark-id]')).toHaveLength(4);
        expect(screen.queryByText('proofMarks.list.more|{"count":1}')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'proofMarks.list.showFewer' })).toBeInTheDocument();
    });

    it('opens the line in the bottom sheet from a list item, and Escape returns focus', () => {
        renderList();

        const item = document.querySelector<HTMLButtonElement>('button[data-mark-id="m1"]');
        expect(item).not.toBeNull();
        expect(item).toHaveAttribute('aria-haspopup', 'dialog');
        fireEvent.click(item as HTMLButtonElement);

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('data-side', 'sheet');
        expect(dialog).toHaveStyle({ position: 'fixed' });
        expect(item).toHaveAttribute('aria-expanded', 'true');

        fireEvent.keyDown(dialog, { key: 'Escape' });

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(item).toHaveFocus();
    });

    it('selects the line in the text when a list item is opened', () => {
        const onSelectLine = vi.fn();
        renderList({ onSelectLine });

        fireEvent.click(document.querySelector('button[data-mark-id="m4"]') as HTMLButtonElement);

        expect(onSelectLine).toHaveBeenCalledWith(12);
    });

    it('renders every mark for print, without the toggle or a panel', () => {
        renderList({ variant: 'print' });

        expect(screen.getByTestId('proof-mark-list-print')).toBeInTheDocument();
        expect(document.querySelectorAll('button[data-mark-id]')).toHaveLength(4);
        expect(screen.queryByRole('button', { name: /proofMarks\.list\.showAll/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /proofMarks\.list\.showFewer/ })).not.toBeInTheDocument();

        // The instruction is in the markup for both variants; only print shows it (CSS).
        expect(document.querySelector('.proof-mark-list-instruction')?.textContent).toContain('proofMarks.sp.label');

        fireEvent.click(document.querySelector('button[data-mark-id="m1"]') as HTMLButtonElement);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the same marks through both renderers from one data set', () => {
        const { unmount } = renderList();
        fireEvent.click(screen.getByRole('button', { name: 'proofMarks.list.showAll|{"count":4}' }));
        const screenIds = [...document.querySelectorAll('[data-mark-id]')].map((el) => el.getAttribute('data-mark-id'));
        unmount();

        renderList({ variant: 'print' });
        const printIds = [...document.querySelectorAll('[data-mark-id]')].map((el) => el.getAttribute('data-mark-id'));

        expect(screenIds).toEqual(['m1', 'm2', 'm3', 'm4']);
        expect(printIds).toEqual(screenIds);
    });
});

describe('ProofMarkList a11y', () => {
    it('passes axe with the bottom sheet open', async () => {
        const { axe } = await import('jest-axe');
        const { container } = renderList();

        fireEvent.click(document.querySelector('button[data-mark-id="m1"]') as HTMLButtonElement);

        const results = (await axe(container, {
            rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
        })) as unknown as { violations: { id: string; nodes: { target: unknown[] }[] }[] };
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual(
            []
        );
    });
});
