import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../../test-utils/renderWithProviders';
import type { Class, FlashcardDeck, NewsFlash, NewsFlashRead, Rubric, Student, Test } from '../../types';

const mockFlash: NewsFlash = {
    id: 'f1',
    title: 'Grammar Deep Dive',
    summary: 'A summary',
    content: '<p>Full article</p>',
    url: 'https://example.com',
    kind: 'article',
    tags: ['grammar', 'exam'],
    cefrLevel: 'B1',
    linkedResourceType: 'flashcardDeck',
    linkedResourceId: 'd1',
    createdAt: '2024-01-02T00:00:00Z',
};

const mockFlash2: NewsFlash = {
    id: 'f2',
    title: 'Reading Club',
    summary: '',
    kind: 'book',
    tags: [],
    createdAt: '2024-01-01T00:00:00Z',
};

const mockRead: NewsFlashRead = { id: 'f1:s1', flashId: 'f1', studentId: 's1', readAt: '2024-01-03T00:00:00Z' };
const mockStudent1: Student = { id: 's1', name: 'Alice', classId: 'c1' };
const mockStudent2: Student = { id: 's2', name: 'Bob', classId: 'c2' };
const mockDeck: FlashcardDeck = { id: 'd1', name: 'Vocab Deck' } as FlashcardDeck;
const mockTest: Test = { id: 't1', name: 'Grammar Test' } as Test;
const mockRubric: Rubric = { id: 'r1', name: 'Essay Rubric' } as Rubric;
const mockClass: Class = { id: 'c1', name: 'Class A' };

const mockAddNewsFlash = vi.fn();
const mockUpdateNewsFlash = vi.fn();
const mockDeleteNewsFlash = vi.fn();

const mockAppValue: Record<string, unknown> = {
    newsFlashes: [mockFlash, mockFlash2],
    newsFlashReads: [mockRead],
    students: [mockStudent1, mockStudent2],
    studentRubrics: [],
    flashcardDecks: [mockDeck],
    tests: [mockTest],
    rubrics: [mockRubric],
    classes: [mockClass],
    settings: { activeClassId: 'c1' },
    updateSettings: vi.fn(),
    addNewsFlash: mockAddNewsFlash,
    updateNewsFlash: mockUpdateNewsFlash,
    deleteNewsFlash: mockDeleteNewsFlash,
};

vi.mock('../../context/AppContext', () => ({
    useApp: () => mockAppValue,
    useRoster: () => mockAppValue,
    useAuthoring: () => mockAppValue,
    useAssessment: () => mockAppValue,
    useEssays: () => mockAppValue,
    useFlashcards: () => mockAppValue,
    useSettings: () => mockAppValue,
    usePlatform: () => mockAppValue,
}));

vi.mock('../../components/Editor/TiptapEditor', () => ({
    default: ({ onChange }: { onChange: (html: string) => void }) =>
        React.createElement(
            'div',
            { 'data-testid': 'tiptap-mock' },
            React.createElement('button', { onClick: () => onChange('<p>Hello world</p>') }, 'set-content')
        ),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

let NewsFlashesPageComp: React.ComponentType;

function renderPage() {
    return renderWithRouter(<NewsFlashesPageComp />);
}

describe('NewsFlashesPage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mockAppValue.newsFlashes = [mockFlash, mockFlash2];
        const mod = await import('../NewsFlashesPage');
        NewsFlashesPageComp = mod.default;
    });

    it('shows the empty state and opens the create modal', () => {
        mockAppValue.newsFlashes = [];
        renderPage();
        expect(screen.getByText('newsFlashes.no_flashes')).toBeInTheDocument();
        fireEvent.click(screen.getAllByText('newsFlashes.new_flash')[0]);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByLabelText('newsFlashes.field_title')).toBeInTheDocument();
    });

    it('creates a flash with full details and a linked deck', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('newsFlashes.new_flash')[0]);

        fireEvent.change(screen.getByLabelText('newsFlashes.field_title'), { target: { value: 'My Flash' } });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_summary'), { target: { value: 'Teaser' } });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_url'), { target: { value: 'https://x.nl' } });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_kind'), { target: { value: 'video' } });
        fireEvent.change(screen.getByLabelText('cefr.target_level_label'), { target: { value: 'B1' } });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_tags'), { target: { value: 'grammar, exam' } });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_linked_resource'), {
            target: { value: 'flashcardDeck' },
        });
        fireEvent.change(screen.getByLabelText('newsFlashes.field_linked_item'), { target: { value: 'd1' } });

        fireEvent.click(screen.getByText('common.save'));

        expect(mockAddNewsFlash).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'My Flash',
                summary: 'Teaser',
                url: 'https://x.nl',
                kind: 'video',
                tags: ['grammar', 'exam'],
                cefrLevel: 'B1',
                linkedResourceType: 'flashcardDeck',
                linkedResourceId: 'd1',
                content: undefined,
            })
        );
    });

    it('keeps rich-text content when the editor emits HTML', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('newsFlashes.new_flash')[0]);
        fireEvent.change(screen.getByLabelText('newsFlashes.field_title'), { target: { value: 'With body' } });
        fireEvent.click(screen.getByText('set-content'));
        fireEvent.click(screen.getByText('common.save'));
        expect(mockAddNewsFlash).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'With body', content: '<p>Hello world</p>' })
        );
    });

    it('lists tests and rubrics as linked resources', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('newsFlashes.new_flash')[0]);
        const linkedType = screen.getByLabelText('newsFlashes.field_linked_resource');

        fireEvent.change(linkedType, { target: { value: 'test' } });
        expect(screen.getByRole('option', { name: 'Grammar Test' })).toBeInTheDocument();

        fireEvent.change(linkedType, { target: { value: 'rubric' } });
        expect(screen.getByRole('option', { name: 'Essay Rubric' })).toBeInTheDocument();
    });

    it('does not save when the title is empty', () => {
        renderPage();
        fireEvent.click(screen.getAllByText('newsFlashes.new_flash')[0]);
        const saveBtn = screen.getByText('common.save').closest('button');
        expect(saveBtn).toBeDisabled();
        fireEvent.change(screen.getByLabelText('newsFlashes.field_title'), { target: { value: '   ' } });
        expect(saveBtn).toBeDisabled();
        fireEvent.click(saveBtn as HTMLButtonElement);
        expect(mockAddNewsFlash).not.toHaveBeenCalled();
    });

    it('edits an existing flash', () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('newsFlashes.action_edit')[0]);
        expect(screen.getByText('newsFlashes.edit_title')).toBeInTheDocument();
        expect(screen.getByLabelText('newsFlashes.field_title')).toHaveValue('Grammar Deep Dive');

        fireEvent.change(screen.getByLabelText('newsFlashes.field_title'), { target: { value: 'Edited title' } });
        fireEvent.click(screen.getByText('common.save'));

        expect(mockUpdateNewsFlash).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'f1', title: 'Edited title', content: '<p>Full article</p>' })
        );
        expect(mockAddNewsFlash).not.toHaveBeenCalled();
    });

    it('deletes after confirming and keeps the flash when cancelled', async () => {
        renderPage();
        fireEvent.click(screen.getAllByLabelText('newsFlashes.action_delete')[0]);
        expect(screen.getByText('newsFlashes.delete_title')).toBeInTheDocument();

        fireEvent.click(screen.getByText('common.cancel'));
        expect(mockDeleteNewsFlash).not.toHaveBeenCalled();

        fireEvent.click(screen.getAllByLabelText('newsFlashes.action_delete')[0]);
        fireEvent.click(screen.getByText('common.delete'));
        await waitFor(() => expect(mockDeleteNewsFlash).toHaveBeenCalledWith('f1'));
    });

    it('shows linked badges and expands read receipts to student names', () => {
        renderPage();
        expect(screen.getByText('B1')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.linked_flashcardDeck')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.has_full_article')).toBeInTheDocument();
        expect(screen.getAllByText('grammar')).toHaveLength(1);

        fireEvent.click(screen.getByText('newsFlashes.read_receipt_count:{"read":1,"total":2}'));
        expect(screen.getByText('Alice')).toBeInTheDocument();

        // f2 has no readers — expanding shows the none message
        fireEvent.click(screen.getByText('newsFlashes.read_receipt_count:{"read":0,"total":2}'));
        expect(screen.getByText('newsFlashes.read_receipt_none')).toBeInTheDocument();
    });

    it('shows the external link for flashes with a url', () => {
        renderPage();
        expect(screen.getByText('newsFlashes.open_link')).toBeInTheDocument();
        expect(screen.getByText('newsFlashes.open_link').closest('a')).toHaveAttribute('href', 'https://example.com');
    });
});
