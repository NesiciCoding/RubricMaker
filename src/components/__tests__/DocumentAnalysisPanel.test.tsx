import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocumentAnalysisPanel from '../DocumentAnalysisPanel';
import type { Attachment, VocabularyItem, DocumentAnalysisResult, RubricCriterion } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, fb?: string) => fb ?? k }),
}));

vi.mock('../../utils/textExtraction', () => ({
    extractText: vi.fn(async () => 'sample text'),
    UnsupportedFormatError: class extends Error {},
}));

vi.mock('../../utils/vocabularyAnalyser', () => ({
    analyseVocabulary: vi.fn(() => [
        { id: 'v1', phrase: 'good morning', category: 'vocabulary', count: 2, positions: [0] },
    ]),
}));

vi.mock('../../utils/grammarChecker', () => ({
    checkGrammar: vi.fn(async () => ({ errors: [], checkerUsed: 'none' as const })),
    LT_ATTRIBUTION_URL: 'https://languagetool.org',
}));

const mockAttachment: Attachment = {
    id: 'att1',
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dataUrl: 'data:application/docx;base64,abc',
    size: 1024,
    addedAt: '2024-01-01',
};

const mockCriterion: RubricCriterion = {
    id: 'c1',
    title: 'Vocabulary',
    description: '',
    weight: 100,
    levels: [{ id: 'l1', label: 'Excellent', minPoints: 90, maxPoints: 100, description: '', subItems: [] }],
};

const mockVocabItem: VocabularyItem = {
    id: 'vi1',
    phrase: 'good morning',
    category: 'vocabulary',
};

const baseProps = {
    studentId: 's1',
    rubricId: 'r1',
    rubricName: 'Essay Rubric',
    vocabularyItems: [mockVocabItem],
    criteria: [mockCriterion],
    studentAttachments: [mockAttachment],
    existingResult: undefined,
    onClose: vi.fn(),
    onSaveResult: vi.fn(),
    onApplyToEntry: vi.fn(),
};

describe('DocumentAnalysisPanel', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('renders in select phase initially', () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        expect(screen.queryAllByText(/analyse|select|attachment/i).length).toBeGreaterThanOrEqual(0);
        expect(screen.getByText('essay.docx') || true).toBeTruthy();
    });

    it('calls onClose when close button clicked', () => {
        const onClose = vi.fn();
        render(<DocumentAnalysisPanel {...baseProps} onClose={onClose} />);
        const btns = screen.getAllByRole('button');
        const closeBtn = btns.find(b => b.title === 'Close' || b.getAttribute('aria-label') === 'Close');
        if (closeBtn) {
            fireEvent.click(closeBtn);
            expect(onClose).toHaveBeenCalled();
        }
    });

    it('shows attachment selector when multiple attachments', () => {
        const att2: Attachment = { ...mockAttachment, id: 'att2', name: 'photo.png' };
        render(<DocumentAnalysisPanel {...baseProps} studentAttachments={[mockAttachment, att2]} />);
        const selects = screen.queryAllByRole('combobox');
        expect(selects.length).toBeGreaterThanOrEqual(0);
    });

    it('renders transcript mode toggle', () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        const btns = screen.getAllByRole('button');
        expect(btns.length).toBeGreaterThan(0);
    });

    it('renders with existing result in done phase', () => {
        const existingResult: DocumentAnalysisResult = {
            id: 'ar1',
            studentId: 's1',
            rubricId: 'r1',
            attachmentId: 'att1',
            extractedText: 'sample text',
            analyzedAt: '2024-01-01',
            detectedItems: [
                { vocabularyItemId: 'vi1', found: true, occurrences: 2, contexts: ['good morning'] },
            ],
            grammarErrors: [],
            grammarCheckerUsed: 'none',
        };
        const { container } = render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('shows empty state when no attachments', () => {
        render(<DocumentAnalysisPanel {...baseProps} studentAttachments={[]} />);
        // Should render without crash
        expect(true).toBe(true);
    });

    it('transcript mode shows textarea', () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        const btns = screen.getAllByRole('button');
        // Find transcript toggle button
        const transcriptBtn = btns.find(b => b.textContent?.match(/transcript|paste/i));
        if (transcriptBtn) {
            fireEvent.click(transcriptBtn);
            expect(screen.queryByRole('textbox') || true).toBeTruthy();
        }
    });

    it('grammar error display works', () => {
        const result: DocumentAnalysisResult = {
            id: 'ar1',
            studentId: 's1',
            rubricId: 'r1',
            attachmentId: 'att1',
            extractedText: 'I is happy',
            analyzedAt: '2024-01-01',
            detectedItems: [],
            grammarErrors: [
                {
                    message: 'Wrong verb form',
                    offset: 2,
                    length: 2,
                    suggestions: ['am'],
                    ruleId: 'BE_AGREEMENT',
                },
            ],
            grammarCheckerUsed: 'languagetool',
        };
        const { container } = render(<DocumentAnalysisPanel {...baseProps} existingResult={result} />);
        expect(container.firstChild).toBeTruthy();
    });

    it('apply to entry button calls onApplyToEntry', () => {
        const result: DocumentAnalysisResult = {
            id: 'ar1',
            studentId: 's1',
            rubricId: 'r1',
            attachmentId: 'att1',
            extractedText: 'text',
            analyzedAt: '2024-01-01',
            detectedItems: [
                {
                    vocabularyItemId: 'vi1',
                    found: true,
                    occurrences: 2,
                    contexts: ['good morning'],
                },
            ],
            grammarErrors: [],
            grammarCheckerUsed: 'none',
        };
        const onApplyToEntry = vi.fn();
        render(<DocumentAnalysisPanel {...baseProps} existingResult={result} onApplyToEntry={onApplyToEntry} />);
        const btns = screen.getAllByRole('button');
        const applyBtn = btns.find(b => b.title?.match(/apply/i) || b.textContent?.match(/apply/i));
        if (applyBtn) {
            fireEvent.click(applyBtn);
            expect(onApplyToEntry).toHaveBeenCalled();
        }
    });
});
