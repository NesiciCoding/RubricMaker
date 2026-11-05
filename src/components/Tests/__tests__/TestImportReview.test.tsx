import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TestImportReview from '../TestImportReview';
import type { DocumentReview } from '../../../utils/import/draftImport';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    }),
}));

const review = (extra: Partial<DocumentReview> = {}): DocumentReview => ({
    title: 'Vocabulary and grammar test',
    confidence: 'high',
    sections: [
        { title: 'Assignment 1 | TO BE', items: 7, points: 7 },
        { title: 'Assignment 2 | TO HAVE', items: 7, points: 7 },
    ],
    types: { cloze: 14, 'short-answer': 4 },
    points: 14,
    notes: [],
    readNotes: [],
    ...extra,
});

describe('TestImportReview', () => {
    it('summarises questions, sections and points', () => {
        render(<TestImportReview review={review()} />);

        expect(screen.getByText('importTest.review_title')).toBeInTheDocument();
        expect(screen.getByText(/importTest\.import_meta_questions.*"count":18/)).toBeInTheDocument();
        expect(screen.getByText(/importTest\.import_meta_sections.*"count":2/)).toBeInTheDocument();
        expect(screen.getByText(/importTest\.import_meta_points.*"count":14/)).toBeInTheDocument();
    });

    it('shows the confidence as something a teacher can act on', () => {
        render(<TestImportReview review={review({ confidence: 'medium' })} />);

        expect(screen.getByText('importTest.review_confidence_medium')).toBeInTheDocument();
    });

    it('lists every assignment with what it holds', () => {
        render(<TestImportReview review={review()} />);

        expect(screen.getByText(/Assignment 1 \| TO BE — importTest\.review_section_row/)).toBeInTheDocument();
        expect(screen.getByText(/Assignment 2 \| TO HAVE/)).toBeInTheDocument();
        expect(screen.getAllByText(/"questions":7,"points":7/)).toHaveLength(2);
    });

    it('shows the question types it inferred, by their own labels', () => {
        render(<TestImportReview review={review()} />);

        expect(screen.getByText('importTest.review_types')).toBeInTheDocument();
        expect(screen.getByText('tests.question_type_cloze · 14')).toBeInTheDocument();
        expect(screen.getByText('tests.question_type_short_answer · 4')).toBeInTheDocument();
    });

    it('passes on the key’s grading notes', () => {
        render(
            <TestImportReview review={review({ notes: [{ item: 'Assignment 8 · 1', note: 'minimaal 5 woorden' }] })} />
        );

        expect(screen.getByText('importTest.review_notes')).toBeInTheDocument();
        expect(screen.getByText('Assignment 8 · 1: minimaal 5 woorden')).toBeInTheDocument();
    });

    it('says what the reader could not do with the file', () => {
        render(<TestImportReview review={review({ readNotes: [{ key: 'pdf_no_text_layer' }] })} />);

        expect(screen.getByText('importTest.read_note_pdf_no_text_layer')).toBeInTheDocument();
    });

    it('keeps the panel short when there is nothing to warn about', () => {
        render(<TestImportReview review={review({ notes: [], readNotes: [] })} />);

        expect(screen.queryByText('importTest.review_notes')).toBeNull();
        expect(screen.queryByText(/importTest\.read_note_/)).toBeNull();
    });
});
