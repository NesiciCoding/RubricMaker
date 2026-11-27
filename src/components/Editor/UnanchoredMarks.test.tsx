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

describe('UnanchoredMarks', () => {
    it('names the list and explains why the marks are not drawn', () => {
        render(<UnanchoredMarks marks={[mark()]} onDelete={vi.fn()} />);

        const list = screen.getByRole('group', { name: 'proofMarks.unanchored.label' });
        expect(within(list).getByText('proofMarks.unanchored.hint')).toBeInTheDocument();
    });

    it('lists each stale mark with its instruction and the teacher note', () => {
        render(
            <UnanchoredMarks
                marks={[mark({ note: 'wrong word' }), mark({ id: 'm2', symbolId: 'ital' })]}
                onDelete={vi.fn()}
            />
        );

        const rows = screen.getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]!).getByText('proofMarks.sp.label')).toBeInTheDocument();
        expect(within(rows[0]!).getByText('wrong word')).toBeInTheDocument();
        expect(within(rows[1]!).getByText('proofMarks.ital.label')).toBeInTheDocument();
    });

    it('deletes a stale mark from its own row', () => {
        const onDelete = vi.fn();
        render(<UnanchoredMarks marks={[mark()]} onDelete={onDelete} />);

        fireEvent.click(screen.getByRole('button', { name: /proofMarks.edit.delete/ }));

        expect(onDelete).toHaveBeenCalledWith(mark());
    });
});
