import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DocumentMark } from '../../types';
import UnanchoredMarks from './UnanchoredMarks';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mark = (overrides: Partial<DocumentMark> = {}): DocumentMark => ({
    id: 'm1',
    attachmentId: 'a1',
    authorId: 't1',
    symbolId: 'sp',
    anchor: { from: 900, to: 905 },
    status: 'noted',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

function renderList(overrides: Partial<React.ComponentProps<typeof UnanchoredMarks>> = {}) {
    const props: React.ComponentProps<typeof UnanchoredMarks> = {
        marks: [mark()],
        selection: null,
        onReanchor: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    };
    render(<UnanchoredMarks {...props} />);
    return props;
}

describe('UnanchoredMarks', () => {
    it('names the list and explains why the marks are not drawn', () => {
        renderList();

        const list = screen.getByRole('group', { name: 'proofMarks.unanchored.label' });
        expect(within(list).getByText('proofMarks.unanchored.hint')).toBeInTheDocument();
    });

    it('lists each stale mark with its instruction and the teacher note', () => {
        renderList({ marks: [mark({ note: 'wrong word' }), mark({ id: 'm2', symbolId: 'ital' })] });

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]!).getByText('proofMarks.sp.label')).toBeInTheDocument();
        expect(within(rows[0]!).getByText('wrong word')).toBeInTheDocument();
        expect(within(rows[1]!).getByText('proofMarks.ital.label')).toBeInTheDocument();
    });

    it('deletes a stale mark from its own row', () => {
        const props = renderList();

        fireEvent.click(screen.getByRole('button', { name: /proofMarks.edit.delete/ }));

        expect(props.onDelete).toHaveBeenCalledWith(mark());
    });

    it('disables re-anchoring until there is a selection to move the mark to', () => {
        const props = renderList();
        const reanchor = screen.getByRole('button', { name: /proofMarks.edit.moveHere/ });

        expect(reanchor).toBeDisabled();
        expect(reanchor).toHaveAttribute('title', 'proofMarks.edit.noSelection');
        expect(props.onReanchor).not.toHaveBeenCalled();
    });

    it('re-anchors a stale mark once there is a selection', () => {
        const props = renderList({ selection: { from: 8, to: 12 } });
        const reanchor = screen.getByRole('button', { name: /proofMarks.edit.moveHere/ });

        expect(reanchor).toBeEnabled();
        expect(reanchor).toHaveAccessibleName('proofMarks.edit.moveHere: proofMarks.sp.label');
        fireEvent.click(reanchor);
        expect(props.onReanchor).toHaveBeenCalledWith(mark());
    });
});
