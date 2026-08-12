import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TableOfContentsSidebar from './TableOfContentsSidebar';
import type { TableOfContentData } from '@tiptap/extension-table-of-contents';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function tocItem(
    overrides: Partial<{
        id: string;
        level: number;
        textContent: string;
        isActive: boolean;
        dom: HTMLHeadingElement;
    }> = {}
) {
    const dom = document.createElement('h1');
    dom.scrollIntoView = vi.fn();
    // The item type carries Tiptap/ProseMirror internals (editor, node, ...) the
    // sidebar never reads — only the outline fields below matter here.
    return {
        dom,
        id: 'h1',
        level: 1,
        textContent: 'Introduction',
        isActive: false,
        ...overrides,
    } as unknown as TableOfContentData[number];
}

describe('TableOfContentsSidebar', () => {
    it('renders nothing when the outline is empty', () => {
        const { container } = render(<TableOfContentsSidebar data={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lists the headings with the table-of-contents title', () => {
        render(
            <TableOfContentsSidebar
                data={[tocItem({ id: 'h1' }), tocItem({ id: 'h2', level: 2, textContent: 'Body', isActive: true })]}
            />
        );
        expect(screen.getByText('editor.tableOfContents')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Introduction' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Body' })).toBeInTheDocument();
    });

    it('scrolls the target heading into view when a row is clicked', () => {
        const dom = document.createElement('h1');
        dom.scrollIntoView = vi.fn();
        render(<TableOfContentsSidebar data={[tocItem({ dom })]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Introduction' }));
        expect(dom.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });

    it('falls back to the untitled key for empty headings', () => {
        render(<TableOfContentsSidebar data={[tocItem({ textContent: '' })]} />);
        expect(screen.getByRole('button', { name: 'editor.untitledHeading' })).toBeInTheDocument();
    });
});
