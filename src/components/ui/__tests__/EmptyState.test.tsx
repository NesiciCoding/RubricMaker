import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookOpen, Search } from 'lucide-react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
    it('renders the shared shell, a decorative icon and a heading', () => {
        const { container } = render(<EmptyState icon={BookOpen} title="No rubrics yet" />);
        const shell = container.firstElementChild as HTMLElement;
        // The shell is the CSS class, not inline layout: one owner for padding, gap and colour.
        expect(shell.className).toBe('empty-state');
        expect(shell.style.display).toBe('');
        expect(screen.getByRole('heading', { name: 'No rubrics yet', level: 3 })).toBeInTheDocument();
        // Announced by the heading, not by the glyph.
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(container.querySelector('svg')).toHaveAttribute('width', '40');
    });

    it('takes a smaller glyph for dense panels', () => {
        const { container } = render(<EmptyState icon={Search} iconSize={28} description="No matches" />);
        expect(container.querySelector('svg')).toHaveAttribute('width', '28');
    });

    it('can sit under an h1 without skipping a level', () => {
        // The student portal's standalone pages head with an h1, so an h3 here is an axe
        // heading-order violation; the caller picks the level that fits its outline.
        render(<EmptyState title="Deck not found" titleLevel={2} />);
        expect(screen.getByRole('heading', { name: 'Deck not found', level: 2 })).toBeInTheDocument();
    });

    it('renders a lone hint as a sentence, with no heading', () => {
        render(<EmptyState description="No results for that search" />);
        expect(screen.getByText('No results for that search')).toHaveClass('text-muted', 'text-sm');
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('puts the message, extra content and the call to action in order', () => {
        const { container } = render(
            <EmptyState
                icon={BookOpen}
                title="No decks yet"
                description="Create your first deck to get started."
                action={{ label: 'New deck', onClick: vi.fn() }}
            >
                <a href="#import">Import instead</a>
            </EmptyState>
        );
        const shell = container.firstElementChild as HTMLElement;
        const order = [...shell.children].map((child) => child.tagName.toLowerCase());
        expect(order).toEqual(['svg', 'h3', 'p', 'a', 'button']);
    });

    it('fires the action and passes padding overrides through', () => {
        const onClick = vi.fn();
        const { container } = render(
            <EmptyState description="No matches" action={{ label: 'Clear search', onClick }} style={{ padding: 32 }} />
        );
        expect((container.firstElementChild as HTMLElement).style.padding).toBe('32px');
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('keeps an extra class alongside the shell', () => {
        const { container } = render(<EmptyState description="Nothing here" className="mt-4" />);
        expect((container.firstElementChild as HTMLElement).className).toBe('empty-state mt-4');
    });
});
