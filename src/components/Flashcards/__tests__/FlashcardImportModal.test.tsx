import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FlashcardImportModal from '../FlashcardImportModal';
import { UnsupportedFlashcardFileError } from '../../../utils/flashcardImport';
import type { ParsedFlashcard } from '../../../utils/flashcardImport';

const mockParseFlashcardFile = vi.fn();

vi.mock('../../../utils/flashcardImport', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../utils/flashcardImport')>();
    return {
        ...actual,
        parseFlashcardFile: (...args: unknown[]) => mockParseFlashcardFile(...args),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

function selectFile(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
}

const cards: ParsedFlashcard[] = Array.from({ length: 10 }, (_, i) => ({
    front: `front ${i}`,
    back: `back ${i}`,
}));

describe('FlashcardImportModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockParseFlashcardFile.mockResolvedValue(cards);
    });

    it('renders the title and file chooser', () => {
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        expect(screen.getByText('flashcards.import_title')).toBeInTheDocument();
        expect(screen.getByText('flashcards.import_choose_file')).toBeInTheDocument();
    });

    it('parses a file and previews the first eight cards with the overflow note', async () => {
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        selectFile(new File(['x'], 'deck.csv'));

        await waitFor(() => expect(mockParseFlashcardFile).toHaveBeenCalled());
        expect(screen.getByText('flashcards.import_preview:{"count":10}')).toBeInTheDocument();
        expect(screen.getByText('front 0')).toBeInTheDocument();
        expect(screen.getByText('front 7')).toBeInTheDocument();
        expect(screen.queryByText('front 8')).not.toBeInTheDocument();
        expect(screen.getByText('flashcards.import_more_rows:{"count":2}')).toBeInTheDocument();
    });

    it('confirms the import with the parsed cards and closes', async () => {
        const onImport = vi.fn();
        const onClose = vi.fn();
        render(<FlashcardImportModal onImport={onImport} onClose={onClose} />);
        selectFile(new File(['x'], 'deck.csv'));

        fireEvent.click(await screen.findByText('flashcards.import_confirm:{"count":10}'));
        expect(onImport).toHaveBeenCalledWith(cards);
        expect(onClose).toHaveBeenCalled();
    });

    it('shows the no-cards message when the file parses to an empty list', async () => {
        mockParseFlashcardFile.mockResolvedValue([]);
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        selectFile(new File(['x'], 'empty.csv'));

        await waitFor(() => expect(screen.getByText('flashcards.import_no_cards')).toBeInTheDocument());
        expect(screen.queryByText(/import_preview/)).not.toBeInTheDocument();
    });

    it('shows the targeted hint for legacy .xls files', async () => {
        mockParseFlashcardFile.mockRejectedValue(new UnsupportedFlashcardFileError('xls'));
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        selectFile(new File(['x'], 'old.xls'));

        await waitFor(() => expect(screen.getByText('flashcards.import_xls_unsupported')).toBeInTheDocument());
    });

    it('shows a generic failure message for other parse errors', async () => {
        mockParseFlashcardFile.mockRejectedValue(new Error('boom'));
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        selectFile(new File(['x'], 'bad.csv'));

        await waitFor(() => expect(screen.getByText('flashcards.import_failed')).toBeInTheDocument());
    });

    it('disables the chooser and shows the parsing label while a file is being parsed', async () => {
        let resolve!: (v: ParsedFlashcard[]) => void;
        mockParseFlashcardFile.mockImplementation(() => new Promise<ParsedFlashcard[]>((r) => (resolve = r)));
        render(<FlashcardImportModal onImport={vi.fn()} onClose={vi.fn()} />);
        selectFile(new File(['x'], 'deck.csv'));

        expect(screen.getByText('flashcards.import_parsing')).toBeInTheDocument();
        expect(screen.getByText('flashcards.import_parsing')).toBeDisabled();

        resolve(cards);
        await waitFor(() => expect(screen.getByText(/import_preview/)).toBeInTheDocument());
    });

    it('closes via the header close button', () => {
        const onClose = vi.fn();
        render(<FlashcardImportModal onImport={vi.fn()} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
        expect(onClose).toHaveBeenCalled();
    });
});
