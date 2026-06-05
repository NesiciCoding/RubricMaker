import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EssayImportModal from '../Essay/EssayImportModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../utils/essaySubmissionCode', () => ({
    decodeEssaySubmission: vi.fn(),
}));

import { decodeEssaySubmission } from '../../utils/essaySubmissionCode';
const mockDecode = vi.mocked(decodeEssaySubmission);

const baseProps = {
    rubricId: 'r1',
    studentId: 's1',
    studentName: 'Alice',
    onImport: vi.fn(),
    onClose: vi.fn(),
};

const validSubmission = {
    id: 'sub-1',
    assignmentRubricId: 'r1',
    assignmentStudentId: 's1',
    teacherKey: 'teacher-1',
    contentHtml: '<p>Hello world</p>',
    wordCount: 2,
    submittedAt: '2024-03-01T10:00:00Z',
};

describe('EssayImportModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders student name in header', () => {
        render(<EssayImportModal {...baseProps} />);
        expect(screen.getByText(/Import essay — Alice/)).toBeInTheDocument();
    });

    it('renders textarea for submission code', () => {
        render(<EssayImportModal {...baseProps} />);
        expect(screen.getByPlaceholderText(/Paste the student's submission code/i)).toBeInTheDocument();
    });

    it('import button is disabled when code is empty', () => {
        render(<EssayImportModal {...baseProps} />);
        const btn = screen.getByRole('button', { name: /import essay/i });
        expect(btn).toBeDisabled();
    });

    it('import button becomes enabled after typing code', () => {
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'some-code' } });
        const btn = screen.getByRole('button', { name: /import essay/i });
        expect(btn).not.toBeDisabled();
    });

    it('shows error when decode returns null', () => {
        mockDecode.mockReturnValue(null);
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'bad-code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Invalid submission code/i)).toBeInTheDocument();
    });

    it('shows error when rubricId does not match', () => {
        mockDecode.mockReturnValue({ ...validSubmission, assignmentRubricId: 'r-other' });
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/different student or rubric/i)).toBeInTheDocument();
        expect(baseProps.onImport).not.toHaveBeenCalled();
    });

    it('shows error when studentId does not match', () => {
        mockDecode.mockReturnValue({ ...validSubmission, assignmentStudentId: 's-other' });
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'code' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/different student or rubric/i)).toBeInTheDocument();
    });

    it('calls onImport with correct attachment on valid submission', () => {
        mockDecode.mockReturnValue(validSubmission);
        render(<EssayImportModal {...baseProps} />);
        fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
            target: { value: 'valid-code' },
        });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(baseProps.onImport).toHaveBeenCalledWith(
            expect.objectContaining({
                mimeType: 'text/html',
                rubricId: 'r1',
                studentId: 's1',
            })
        );
    });

    it('shows success state after valid import', () => {
        mockDecode.mockReturnValue(validSubmission);
        render(<EssayImportModal {...baseProps} />);
        fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
            target: { value: 'valid-code' },
        });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Essay imported successfully/i)).toBeInTheDocument();
        expect(screen.getByText(/2 words/i)).toBeInTheDocument();
    });

    it('close button calls onClose', () => {
        render(<EssayImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /close/i }));
    });

    it('cancel button calls onClose', () => {
        render(<EssayImportModal {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(baseProps.onClose).toHaveBeenCalled();
    });

    it('typing clears existing error', () => {
        mockDecode.mockReturnValue(null);
        render(<EssayImportModal {...baseProps} />);
        const textarea = screen.getByPlaceholderText(/Paste the student's submission code/i);
        fireEvent.change(textarea, { target: { value: 'bad' } });
        fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        expect(screen.getByText(/Invalid submission code/i)).toBeInTheDocument();
        fireEvent.change(textarea, { target: { value: 'updated' } });
        expect(screen.queryByText(/Invalid submission code/i)).not.toBeInTheDocument();
    });

    describe('word limit status badges', () => {
        function importWith(wordLimitStatus: 'ok' | 'under' | 'over' | undefined) {
            mockDecode.mockReturnValue({ ...validSubmission, wordLimitStatus });
            render(<EssayImportModal {...baseProps} />);
            fireEvent.change(screen.getByPlaceholderText(/Paste the student's submission code/i), {
                target: { value: 'code' },
            });
            fireEvent.click(screen.getByRole('button', { name: /import essay/i }));
        }

        it('shows over-limit badge after importing an over-limit submission', () => {
            importWith('over');
            // t('essay.word_limit_over') returns the key verbatim; EssayImportModal uses useTranslation
            expect(screen.getByText(/essay\.word_limit_over/i)).toBeInTheDocument();
        });

        it('shows under-limit badge after importing an under-limit submission', () => {
            importWith('under');
            expect(screen.getByText(/essay\.word_limit_under/i)).toBeInTheDocument();
        });

        it('shows no limit badge when status is "ok"', () => {
            importWith('ok');
            expect(screen.queryByText(/essay\.word_limit_over/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/essay\.word_limit_under/i)).not.toBeInTheDocument();
        });

        it('shows no limit badge for legacy submissions without a status', () => {
            importWith(undefined);
            expect(screen.queryByText(/essay\.word_limit_over/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/essay\.word_limit_under/i)).not.toBeInTheDocument();
        });
    });
});
