import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import NewsFlashTimeline from '../NewsFlashTimeline';
import type { NewsFlash } from '../../../types';

const onOpen = vi.fn();
const onScrollToSection = vi.fn();

const base = (overrides: Partial<NewsFlash>): NewsFlash => ({
    id: 'f1',
    title: 'Flash',
    summary: 'Teaser',
    kind: 'article',
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
});

const contentFlash: NewsFlash = base({ id: 'f1', title: 'With content', content: '<p>Body</p>', cefrLevel: 'B1' });
const bareFlash: NewsFlash = base({ id: 'f2', title: 'Bare', kind: 'book', tags: ['exam'] });
const urlFlash: NewsFlash = base({ id: 'f3', title: 'Linked url', url: 'https://example.com' });
const deckFlash: NewsFlash = base({
    id: 'f4',
    title: 'Deck link',
    linkedResourceType: 'flashcardDeck',
    linkedResourceId: 'd1',
});
const orphanDeckFlash: NewsFlash = base({ id: 'f5', title: 'Orphan deck', linkedResourceType: 'flashcardDeck' });
const testFlash: NewsFlash = base({ id: 'f6', title: 'Test link', linkedResourceType: 'test' });
const rubricFlash: NewsFlash = base({ id: 'f7', title: 'Rubric link', linkedResourceType: 'rubric' });

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

describe('NewsFlashTimeline', () => {
    it('expands and collapses a flash with content', () => {
        render(
            <NewsFlashTimeline
                studentId="s1"
                flashes={[contentFlash]}
                readFlashIds={new Set()}
                onOpen={onOpen}
                onScrollToSection={onScrollToSection}
            />
        );
        const toggle = screen.getByRole('button', { name: 'With content' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(toggle);
        expect(onOpen).toHaveBeenCalledWith(contentFlash);
        expect(screen.getByText('newsFlashes.collapse_article')).toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(toggle);
        expect(screen.getByText('newsFlashes.read_article')).toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('marks a content-less flash open without expanding', () => {
        render(
            <NewsFlashTimeline
                studentId="s1"
                flashes={[bareFlash]}
                readFlashIds={new Set()}
                onOpen={onOpen}
                onScrollToSection={onScrollToSection}
            />
        );
        const toggle = screen.getByRole('button', { name: 'Bare' });
        expect(toggle).not.toHaveAttribute('aria-expanded');
        fireEvent.click(toggle);
        expect(onOpen).toHaveBeenCalledWith(bareFlash);
        expect(screen.queryByText('newsFlashes.collapse_article')).not.toBeInTheDocument();
        expect(screen.queryByText('newsFlashes.read_article')).not.toBeInTheDocument();
    });

    it('omits optional decorations when they are absent', () => {
        render(
            <NewsFlashTimeline
                studentId="s1"
                flashes={[bareFlash]}
                readFlashIds={new Set(['f2'])}
                onOpen={onOpen}
                onScrollToSection={onScrollToSection}
            />
        );
        expect(screen.getByText('Bare')).toBeInTheDocument();
        expect(screen.queryByText('B1')).not.toBeInTheDocument();
        expect(screen.queryByText('newsFlashes.open_link')).not.toBeInTheDocument();
        // Read flash → no unread dot.
        expect(screen.queryByLabelText('newsFlashes.unread_label')).not.toBeInTheDocument();
    });

    it('renders every linked-resource variant', () => {
        render(
            <MemoryRouter>
                <NewsFlashTimeline
                    studentId="s1"
                    flashes={[urlFlash, deckFlash, orphanDeckFlash, testFlash, rubricFlash]}
                    readFlashIds={new Set()}
                    onOpen={onOpen}
                    onScrollToSection={onScrollToSection}
                />
            </MemoryRouter>
        );
        expect(screen.getByText('newsFlashes.open_link')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.linked_flashcardDeck')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.linked_test')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.linked_rubric')).toBeInTheDocument();
    });

    it('scrolls to the work and feedback sections via the linked buttons', () => {
        render(
            <NewsFlashTimeline
                studentId="s1"
                flashes={[testFlash, rubricFlash]}
                readFlashIds={new Set()}
                onOpen={onOpen}
                onScrollToSection={onScrollToSection}
            />
        );
        fireEvent.click(screen.getByText('newsFlashes.linked_test'));
        expect(onScrollToSection).toHaveBeenCalledWith('portal-section-work');
        fireEvent.click(screen.getByText('newsFlashes.linked_rubric'));
        expect(onScrollToSection).toHaveBeenCalledWith('portal-section-feedback');
    });
});
