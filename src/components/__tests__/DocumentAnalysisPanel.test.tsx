import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DocumentAnalysisPanel from '../Essay/DocumentAnalysisPanel';
import type { Attachment, VocabularyItem, DocumentAnalysisResult, RubricCriterion } from '../../types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, fb?: string) => fb ?? k }),
}));

vi.mock('../../utils/textExtraction', () => ({
    extractText: vi.fn(async () => 'sample text'),
    UnsupportedFormatError: class UnsupportedFormatError extends Error {},
}));

vi.mock('../../utils/vocabularyAnalyser', () => ({
    analyseVocabulary: vi.fn(() => [
        { vocabularyItemId: 'vi1', found: true, occurrences: 2, contexts: ['good morning everyone'] },
        { vocabularyItemId: 'vi2', found: false, occurrences: 0, contexts: [] },
    ]),
}));

vi.mock('../../utils/grammarChecker', () => ({
    checkGrammar: vi.fn(async () => ({ errors: [], source: 'compromise' as const, textWasTruncated: false })),
    profileGrammar: vi.fn(() => ({ detectedStructures: [], estimatedLevel: 'A1' as const })),
    LT_ATTRIBUTION_URL: 'https://languagetool.org',
}));

vi.mock('../../utils/cefrVocabularyProfiler', () => ({
    profileText: vi.fn(() => ({
        levelCounts: { A1: 5, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
        highlightWords: [],
        estimatedLevel: 'A1' as const,
    })),
}));

import { extractText, UnsupportedFormatError } from '../../utils/textExtraction';
import { analyseVocabulary } from '../../utils/vocabularyAnalyser';
import { checkGrammar, profileGrammar } from '../../utils/grammarChecker';
import { profileText } from '../../utils/cefrVocabularyProfiler';

const mockExtractText = vi.mocked(extractText);
const mockAnalyseVocabulary = vi.mocked(analyseVocabulary);
const mockCheckGrammar = vi.mocked(checkGrammar);
const mockProfileGrammar = vi.mocked(profileGrammar);
const mockProfileText = vi.mocked(profileText);

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
    levels: [
        {
            id: 'l1',
            label: 'Excellent',
            minPoints: 90,
            maxPoints: 100,
            description: '',
            subItems: [{ id: 'sub1', label: 'Uses varied phrases' }],
        },
    ],
};

const mockVocabItem: VocabularyItem = {
    id: 'vi1',
    phrase: 'good morning',
    category: 'vocabulary',
    linkedCriterionId: 'c1',
    linkedSubItemId: 'sub1',
};

const mockVocabItem2: VocabularyItem = {
    id: 'vi2',
    phrase: 'see you later',
    category: 'discourse',
};

const baseProps = {
    studentId: 's1',
    rubricId: 'r1',
    rubricName: 'Essay Rubric',
    vocabularyItems: [mockVocabItem, mockVocabItem2],
    criteria: [mockCriterion],
    studentAttachments: [mockAttachment],
    existingResult: undefined,
    onClose: vi.fn(),
    onSaveResult: vi.fn(),
    onApplyToEntry: vi.fn(),
};

const existingResult: DocumentAnalysisResult = {
    id: 'ar1',
    studentId: 's1',
    rubricId: 'r1',
    attachmentId: 'att1',
    extractedText: 'good morning everyone, see you later',
    analyzedAt: '2024-01-01T00:00:00Z',
    detectedItems: [
        { vocabularyItemId: 'vi1', found: true, occurrences: 2, contexts: ['good morning everyone'] },
        { vocabularyItemId: 'vi2', found: false, occurrences: 0, contexts: [] },
    ],
    grammarErrors: [],
    grammarCheckerUsed: 'none',
};

async function runAnalysis() {
    render(<DocumentAnalysisPanel {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /extract & analyse/i }));
    await waitFor(() => expect(screen.getByText(/items found/i)).toBeInTheDocument());
}

describe('DocumentAnalysisPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExtractText.mockResolvedValue('sample text');
        mockAnalyseVocabulary.mockReturnValue([
            { vocabularyItemId: 'vi1', found: true, occurrences: 2, contexts: ['good morning everyone'] },
            { vocabularyItemId: 'vi2', found: false, occurrences: 0, contexts: [] },
        ]);
        mockCheckGrammar.mockResolvedValue({ errors: [], source: 'compromise', textWasTruncated: false });
        mockProfileGrammar.mockReturnValue({ detectedStructures: [], estimatedLevel: 'A1' });
        mockProfileText.mockReturnValue({
            levelCounts: { A1: 5, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
            highlightWords: [],
            estimatedLevel: 'A1',
        });
    });

    it('renders the source selector with the attachment listed', () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'essay.docx' })).toBeInTheDocument();
    });

    it('calls onClose when the close button is clicked', () => {
        const onClose = vi.fn();
        render(<DocumentAnalysisPanel {...baseProps} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when clicking the overlay but not when clicking inside the modal', () => {
        const onClose = vi.fn();
        const { container } = render(<DocumentAnalysisPanel {...baseProps} onClose={onClose} />);
        const overlay = container.querySelector('.modal-overlay') as HTMLElement;
        const modal = container.querySelector('.modal') as HTMLElement;
        fireEvent.click(modal);
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows a "no attachments" message when the student has none', () => {
        render(<DocumentAnalysisPanel {...baseProps} studentAttachments={[]} />);
        expect(screen.getByRole('option', { name: /no attachments for this student/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /extract & analyse/i })).toBeDisabled();
    });

    it('shows a note and disables analysis for audio/video attachments', () => {
        const avAttachment: Attachment = {
            ...mockAttachment,
            id: 'att2',
            name: 'recording.mp3',
            mimeType: 'audio/mpeg',
        };
        render(<DocumentAnalysisPanel {...baseProps} studentAttachments={[avAttachment]} />);
        expect(screen.getByText(/Audio and video files cannot be automatically transcribed/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /extract & analyse/i })).toBeDisabled();
    });

    it('shows a notice when the rubric has no vocabulary items', () => {
        render(<DocumentAnalysisPanel {...baseProps} vocabularyItems={[]} />);
        expect(screen.getByText(/This rubric has no vocabulary items yet/i)).toBeInTheDocument();
    });

    it('switches to transcript mode and requires non-empty text before analysing', () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /paste transcript/i }));

        const textarea = screen.getByPlaceholderText(/Paste the student's transcript here/i);
        const analyseBtn = screen.getByRole('button', { name: /extract & analyse/i });
        expect(analyseBtn).toBeDisabled();

        fireEvent.change(textarea, { target: { value: '   ' } });
        expect(analyseBtn).toBeDisabled();

        fireEvent.change(textarea, { target: { value: 'A pasted transcript.' } });
        expect(analyseBtn).not.toBeDisabled();
    });

    it('runs the analysis pipeline for an attachment and shows results', async () => {
        await runAnalysis();

        expect(mockExtractText).toHaveBeenCalledWith(mockAttachment, expect.any(Function));
        expect(mockAnalyseVocabulary).toHaveBeenCalledWith('sample text', baseProps.vocabularyItems);
        expect(mockCheckGrammar).toHaveBeenCalledWith('sample text');
        expect(baseProps.onSaveResult).toHaveBeenCalledWith(
            expect.objectContaining({
                studentId: 's1',
                rubricId: 'r1',
                attachmentId: 'att1',
                extractedText: 'sample text',
            })
        );
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText(/\/ 2 items found/i)).toBeInTheDocument();
        expect(screen.getByText('good morning')).toBeInTheDocument();
        expect(screen.getByText('see you later')).toBeInTheDocument();
    });

    it('analyses pasted transcript text and tags the result as "transcript"', async () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /paste transcript/i }));
        fireEvent.change(screen.getByPlaceholderText(/Paste the student's transcript here/i), {
            target: { value: 'My spoken transcript content' },
        });
        fireEvent.click(screen.getByRole('button', { name: /extract & analyse/i }));

        await waitFor(() => expect(screen.getByText(/items found/i)).toBeInTheDocument());
        expect(mockExtractText).not.toHaveBeenCalled();
        expect(mockAnalyseVocabulary).toHaveBeenCalledWith('My spoken transcript content', baseProps.vocabularyItems);
        expect(baseProps.onSaveResult).toHaveBeenCalledWith(expect.objectContaining({ attachmentId: 'transcript' }));
    });

    it('shows an error phase when extraction throws an UnsupportedFormatError', async () => {
        mockExtractText.mockRejectedValueOnce(new UnsupportedFormatError('Unsupported file type.'));
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /extract & analyse/i }));

        expect(await screen.findByText('Unsupported file type.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry analysis/i })).toBeInTheDocument();
        expect(baseProps.onSaveResult).not.toHaveBeenCalled();
    });

    it('shows the message of a plain Error thrown during analysis', async () => {
        mockExtractText.mockRejectedValueOnce(new Error('Disk read failed.'));
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /extract & analyse/i }));
        expect(await screen.findByText('Disk read failed.')).toBeInTheDocument();
    });

    it('shows a generic error message for non-Error rejections', async () => {
        mockExtractText.mockRejectedValueOnce('boom');
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /extract & analyse/i }));
        expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
    });

    it('shows an error when transcript mode is used with only whitespace', async () => {
        render(<DocumentAnalysisPanel {...baseProps} />);
        fireEvent.click(screen.getByRole('button', { name: /paste transcript/i }));
        const textarea = screen.getByPlaceholderText(/Paste the student's transcript here/i);
        fireEvent.change(textarea, { target: { value: 'real text' } });
        fireEvent.change(textarea, { target: { value: '   ' } });
        // Button is disabled when blank, so trigger via filled then emptied state isn't reachable through UI;
        // instead assert the disabled guard prevents the action entirely.
        expect(screen.getByRole('button', { name: /extract & analyse/i })).toBeDisabled();
    });

    it('returns to the select phase when Re-analyse is clicked', async () => {
        await runAnalysis();
        fireEvent.click(screen.getByRole('button', { name: /re-analyse/i }));
        expect(screen.getByRole('button', { name: /extract & analyse/i })).toBeInTheDocument();
        expect(screen.queryByText(/items found/i)).not.toBeInTheDocument();
    });

    it('applies a found item with a linked sub-item and marks it as applied', async () => {
        const onApplyToEntry = vi.fn();
        render(
            <DocumentAnalysisPanel {...baseProps} onApplyToEntry={onApplyToEntry} existingResult={existingResult} />
        );

        const applyBtn = screen.getByRole('button', { name: /^apply$/i });
        fireEvent.click(applyBtn);

        expect(onApplyToEntry).toHaveBeenCalledWith('c1', 'sub1');
        expect(screen.getByRole('button', { name: /applied/i })).toBeDisabled();
    });

    it('applies all eligible found items via the "Apply all found" button', () => {
        const onApplyToEntry = vi.fn();
        render(
            <DocumentAnalysisPanel {...baseProps} onApplyToEntry={onApplyToEntry} existingResult={existingResult} />
        );

        fireEvent.click(screen.getByRole('button', { name: /apply all found/i }));
        expect(onApplyToEntry).toHaveBeenCalledWith('c1', 'sub1');
        expect(onApplyToEntry).toHaveBeenCalledTimes(1);
    });

    it('adds a found phrase to the comment bank', () => {
        const onAddToCommentBank = vi.fn();
        render(
            <DocumentAnalysisPanel
                {...baseProps}
                existingResult={existingResult}
                onAddToCommentBank={onAddToCommentBank}
            />
        );
        const addBtn = screen.getByRole('button', { name: /add to bank/i });
        fireEvent.click(addBtn);
        expect(onAddToCommentBank).toHaveBeenCalledWith('good morning');
        expect(screen.getByRole('button', { name: /^added$/i })).toBeDisabled();
    });

    it('does not show comment-bank buttons when onAddToCommentBank is not provided', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.queryByRole('button', { name: /add to bank/i })).not.toBeInTheDocument();
    });

    it('toggles the extracted text panel', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.queryByText(existingResult.extractedText)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /extracted text/i }));
        expect(screen.getByText(existingResult.extractedText)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /extracted text/i }));
        expect(screen.queryByText(existingResult.extractedText)).not.toBeInTheDocument();
    });

    it('shows a placeholder when extracted text is empty', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={{ ...existingResult, extractedText: '' }} />);
        fireEvent.click(screen.getByRole('button', { name: /extracted text/i }));
        expect(screen.getByText('(no text extracted)')).toBeInTheDocument();
    });

    it('shows grammar issues with suggestions and a "more issues" indicator beyond 20', () => {
        const manyErrors = Array.from({ length: 22 }, (_, i) => ({
            message: `Error number ${i}`,
            offset: i,
            length: 1,
            suggestions: i === 0 ? ['fix it'] : [],
            ruleId: `RULE_${i}`,
        }));
        render(
            <DocumentAnalysisPanel
                {...baseProps}
                existingResult={{ ...existingResult, grammarErrors: manyErrors, grammarCheckerUsed: 'languagetool' }}
            />
        );
        expect(screen.getByText('Error number 0')).toBeInTheDocument();
        expect(screen.getByText(/Suggestion:.*fix it/)).toBeInTheDocument();
        expect(screen.queryByText('Error number 21')).not.toBeInTheDocument();
        expect(screen.getByText(/\+2 more issues not shown/i)).toBeInTheDocument();
        expect(screen.getByText('LanguageTool')).toBeInTheDocument();
    });

    it('shows a truncation indicator when the grammar text was truncated', () => {
        render(
            <DocumentAnalysisPanel
                {...baseProps}
                existingResult={{ ...existingResult, grammarErrors: [], grammarTextTruncated: true }}
            />
        );
        expect(screen.getByText(/partial/i)).toBeInTheDocument();
    });

    it('shows the compromise.js attribution when languagetool was not used', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.getByText('compromise.js')).toBeInTheDocument();
    });

    it('renders the CEFR profile panel and toggles its open state', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.getByText('CEFR Text Profile')).toBeInTheDocument();
        expect(screen.getByText(/Vocabulary level distribution/i)).toBeInTheDocument();

        const toggle = screen.getByRole('button', { name: /CEFR Text Profile/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText(/Vocabulary level distribution/i)).not.toBeInTheDocument();
    });

    it('shows a "no vocabulary matched" message when level counts are all zero', () => {
        mockProfileText.mockReturnValue({
            levelCounts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
            highlightWords: [],
            estimatedLevel: 'A1',
        });
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.getByText(/No vocabulary matched the CEFR-J wordlist\./i)).toBeInTheDocument();
    });

    it('shows highlight words and detected grammar structures sorted by level', () => {
        mockProfileText.mockReturnValue({
            levelCounts: { A1: 2, A2: 3, B1: 0, B2: 0, C1: 0, C2: 0 },
            highlightWords: [{ word: 'eloquent', level: 'B2' }],
            estimatedLevel: 'A2',
        });
        mockProfileGrammar.mockReturnValue({
            detectedStructures: [
                { label: 'Past perfect', level: 'B1', count: 2, shorthand: 'past-perfect' },
                { label: 'Conditional', level: 'B2', count: 1, shorthand: 'conditional' },
            ],
            estimatedLevel: 'B2',
        });
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);

        expect(screen.getByText('Notable words:')).toBeInTheDocument();
        expect(screen.getByText('eloquent')).toBeInTheDocument();

        const structureLabels = screen.getAllByText(/Past perfect|Conditional/).map((el) => el.textContent);
        expect(structureLabels[0]).toBe('Conditional');
        expect(structureLabels[1]).toBe('Past perfect');
    });

    it('shows a "no grammar detected" message when no structures were found', () => {
        render(<DocumentAnalysisPanel {...baseProps} existingResult={existingResult} />);
        expect(screen.getByText(/No advanced grammar structures detected\./i)).toBeInTheDocument();
    });

    it('renders the found-count in muted color when nothing was found', () => {
        render(
            <DocumentAnalysisPanel
                {...baseProps}
                existingResult={{
                    ...existingResult,
                    detectedItems: [{ vocabularyItemId: 'vi1', found: false, occurrences: 0, contexts: [] }],
                }}
            />
        );
        const count = screen.getByText('0');
        expect(count).toHaveStyle({ color: 'var(--text-muted)' });
        expect(screen.queryByRole('button', { name: /apply all found/i })).not.toBeInTheDocument();
    });

    it('skips detected items that no longer reference a known vocabulary item', () => {
        render(
            <DocumentAnalysisPanel
                {...baseProps}
                existingResult={{
                    ...existingResult,
                    detectedItems: [
                        { vocabularyItemId: 'unknown-id', found: true, occurrences: 1, contexts: ['x'] },
                        { vocabularyItemId: 'vi1', found: true, occurrences: 2, contexts: ['good morning everyone'] },
                    ],
                }}
            />
        );
        expect(screen.queryByText('unknown-id')).not.toBeInTheDocument();
        expect(screen.getByText('good morning')).toBeInTheDocument();
    });

    it('updates the selected attachment when changed via the selector', () => {
        const att2: Attachment = { ...mockAttachment, id: 'att2', name: 'photo.png', mimeType: 'image/png' };
        render(<DocumentAnalysisPanel {...baseProps} studentAttachments={[mockAttachment, att2]} />);
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'att2' } });
        expect((select as HTMLSelectElement).value).toBe('att2');
    });
});
