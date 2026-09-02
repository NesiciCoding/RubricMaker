import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DocumentAnalysisPanel from '../DocumentAnalysisPanel';
import type {
    Attachment,
    CefrLevel,
    VocabularyItem,
    DetectedItem,
    DocumentAnalysisResult,
    RubricCriterion,
    GrammarError,
    LinkedFrameworkDescriptor,
} from '../../../types';

const { UnsupportedFormatError } = vi.hoisted(() => ({
    UnsupportedFormatError: class UnsupportedFormatError extends Error {},
}));

const mocks = vi.hoisted(() => ({
    extractText: vi.fn(),
    analyseVocabulary: vi.fn(),
    checkGrammar: vi.fn(),
    profileText: vi.fn(),
    buildPersistedVocabProfile: vi.fn(() => ({
        levelCounts: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
        contentTokenCount: 0,
        offListCount: 0,
        awlCount: 0,
        nawlCount: 0,
        highlightWords: [],
        academicWords: [],
    })),
    estimateLevelFromCounts: vi.fn(() => 'A1'),
    profileGrammar: vi.fn(),
    evaluateGrammar: vi.fn(),
    buildGrammarComment: vi.fn(),
}));

const langState = vi.hoisted(() => ({ lang: 'en' }));

vi.mock('../../../utils/textExtraction', () => ({
    UnsupportedFormatError,
    extractText: mocks.extractText,
}));
vi.mock('../../../utils/vocabularyAnalyser', () => ({ analyseVocabulary: mocks.analyseVocabulary }));
vi.mock('../../../utils/grammarChecker', () => ({
    checkGrammar: mocks.checkGrammar,
    profileGrammar: mocks.profileGrammar,
    LT_ATTRIBUTION_URL: 'https://languagetool.org',
}));
vi.mock('../../../utils/cefrVocabularyProfiler', () => ({
    profileText: mocks.profileText,
    buildPersistedVocabProfile: mocks.buildPersistedVocabProfile,
    estimateLevelFromCounts: mocks.estimateLevelFromCounts,
}));
vi.mock('../../../utils/textLevelVerdict', () => ({
    computeTargetVerdict: vi.fn(() => ({
        targetLevel: 'B1',
        coveragePercent: 100,
        aboveTargetWords: [],
        verdict: 'suitable',
    })),
}));
vi.mock('../../../utils/grammarQualification', () => ({
    evaluateGrammar: mocks.evaluateGrammar,
    buildGrammarComment: mocks.buildGrammarComment,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: string | Record<string, unknown>) => {
            if (typeof opts === 'string') return opts;
            if (opts && typeof opts === 'object') return `${key}:${JSON.stringify(opts)}`;
            return key;
        },
        i18n: { language: langState.lang },
    }),
}));

const attachmentDoc: Attachment = {
    id: 'a1',
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dataUrl: 'data:application/octet-stream;base64,AA==',
    studentId: 's1',
    size: 100,
    addedAt: '2025-01-01T00:00:00Z',
};

const attachmentAudio: Attachment = {
    id: 'a2',
    name: 'recording.mp3',
    mimeType: 'audio/mpeg',
    dataUrl: 'data:audio/mpeg;base64,AA==',
    studentId: 's1',
    size: 200,
    addedAt: '2025-01-01T00:00:00Z',
};

const vocabItems: VocabularyItem[] = [
    {
        id: 'v1',
        phrase: 'essay',
        category: 'vocabulary',
        linkedCriterionId: 'c1',
        linkedSubItemId: 'si1',
    },
    {
        id: 'v2',
        phrase: 'however',
        // unknown category (older data) exercises the CATEGORY_COLORS fallback
        category: 'custom' as VocabularyItem['category'],
        linkedCriterionId: 'c2',
        linkedSubItemId: 'si2',
    },
    { id: 'v3', phrase: 'absent', category: 'discourse' },
    { id: 'v4', phrase: 'rarely', category: 'other' },
];

const detected: DetectedItem[] = [
    { vocabularyItemId: 'v1', found: true, occurrences: 3, contexts: ['ctx one', 'ctx two', 'ctx three', 'ctx four'] },
    { vocabularyItemId: 'v2', found: true, occurrences: 1, contexts: [] },
    { vocabularyItemId: 'v3', found: false, occurrences: 0, contexts: [] },
    // no matching vocabulary item — exercises the null render arm
    { vocabularyItemId: 'v9', found: true, occurrences: 1, contexts: [] },
];

const grammarDescriptor = (id: string, en: string, nl: string): LinkedFrameworkDescriptor => ({
    descriptorId: id,
    framework: 'grammar',
    categoryId: 'g',
    categoryLabelEn: 'Grammar',
    categoryLabelNl: 'Grammatica',
    categoryColor: '#fff',
    descriptionEn: en,
    descriptionNl: nl,
});

const criteria: RubricCriterion[] = [
    {
        id: 'c1',
        title: 'Task completion',
        description: '',
        weight: 50,
        levels: [],
        frameworkDescriptors: [grammarDescriptor('g1', 'Uses past tense', 'Gebruikt verleden tijd')],
    },
    // no grammar descriptors — exercises the grammarQual null filter arm
    { id: 'c2', title: 'Vocabulary range', description: '', weight: 50, levels: [] },
];

const errors: GrammarError[] = [
    { message: 'Missing comma', offset: 0, length: 1, suggestions: ['Add comma'] },
    { message: 'Long sentence', offset: 5, length: 3, suggestions: [] },
];

const baseResult: DocumentAnalysisResult = {
    id: 'dr1',
    studentId: 's1',
    rubricId: 'r1',
    attachmentId: 'a1',
    extractedText: 'Original extracted text.',
    analyzedAt: '2025-01-02T00:00:00Z',
    detectedItems: detected,
    grammarErrors: errors,
    grammarCheckerUsed: 'languagetool',
    grammarTextTruncated: true,
};

const zeroCounts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 } as Record<CefrLevel, number>;

function renderPanel(props: Partial<React.ComponentProps<typeof DocumentAnalysisPanel>> = {}) {
    const defaults = {
        studentId: 's1',
        rubricId: 'r1',
        rubricName: 'My Rubric',
        vocabularyItems: vocabItems,
        criteria,
        studentAttachments: [attachmentDoc],
        onClose: vi.fn(),
        onSaveResult: vi.fn(),
        onApplyToEntry: vi.fn(),
    };
    return render(<DocumentAnalysisPanel {...defaults} {...props} />);
}

function setDefaultMocks() {
    mocks.analyseVocabulary.mockReturnValue(detected);
    mocks.checkGrammar.mockResolvedValue({ errors, source: 'languagetool', textWasTruncated: true });
    mocks.profileText.mockReturnValue({
        estimatedLevel: 'B1',
        levelCounts: { A1: 5, A2: 3, B1: 4, B2: 0, C1: 0, C2: 0 },
        highlightWords: [{ word: 'essay', level: 'B1' }],
        offListPercent: 0,
        academic: { awlPercent: 0, nawlPercent: 0, academicWords: [] },
    });
    mocks.profileGrammar.mockReturnValue({
        estimatedLevel: 'B2',
        detectedStructures: [
            { shorthand: 'cond', label: 'Conditional', level: 'B2', count: 2 },
            { shorthand: 'past', label: 'Past simple', level: 'A2', count: 1 },
        ],
    });
    mocks.evaluateGrammar.mockReturnValue({
        items: [
            {
                descriptorId: 'g1',
                descriptionEn: 'Uses past tense',
                descriptionNl: 'Gebruikt verleden tijd',
                categoryLabelEn: 'Grammar',
                categoryLabelNl: 'Grammatica',
                autoDetectable: true,
                found: true,
                occurrences: 3,
            },
            {
                descriptorId: 'g2',
                descriptionEn: 'Uses passive',
                descriptionNl: 'Gebruikt passief',
                categoryLabelEn: 'Grammar',
                categoryLabelNl: 'Grammatica',
                autoDetectable: false,
                found: false,
                occurrences: 0,
            },
            {
                descriptorId: 'g3',
                descriptionEn: 'Uses conditionals',
                descriptionNl: 'Gebruikt conditionals',
                categoryLabelEn: 'Grammar',
                categoryLabelNl: 'Grammatica',
                autoDetectable: true,
                found: false,
                occurrences: 0,
            },
        ],
        autoDetectableCount: 2,
        foundCount: 1,
        passed: false,
    });
    mocks.buildGrammarComment.mockReturnValue('<p>grammar comment</p>');
}

beforeEach(() => {
    setDefaultMocks();
    langState.lang = 'en';
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('DocumentAnalysisPanel coverage', () => {
    it('runs a full attachment analysis and renders every result section', async () => {
        const onSaveResult = vi.fn();
        const { container } = renderPanel({ onSaveResult });

        // select phase
        expect(screen.getByText('Document Analysis')).toBeInTheDocument();
        expect(screen.getByText('My Rubric')).toBeInTheDocument();
        expect(screen.getByText('Source document')).toBeInTheDocument();
        expect(screen.getByText('Privacy notice')).toBeInTheDocument();
        expect(screen.getByDisplayValue('essay.docx')).toBeInTheDocument();
        const runBtn = screen.getByRole('button', { name: /Extract & Analyse/ });
        expect((runBtn as HTMLButtonElement).disabled).toBe(false);

        mocks.extractText.mockResolvedValue('The essay text.');
        fireEvent.click(runBtn);

        expect(mocks.extractText).toHaveBeenCalledWith(attachmentDoc, expect.any(Function));
        // summary bar
        expect(await screen.findByText('however')).toBeInTheDocument();
        expect(screen.getAllByText('essay').length).toBeGreaterThan(0); // phrase + notable-words chip
        expect(screen.getByText('/ 4 items found')).toBeInTheDocument();
        expect(screen.getByText(/2 grammar issues/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'LanguageTool' })).toHaveAttribute('href', 'https://languagetool.org');
        expect(screen.getByTitle(/only the first 20 KB/)).toBeInTheDocument();
        expect(screen.getByText('Apply all found')).toBeInTheDocument();

        // detected items
        expect(screen.getByText('however')).toBeInTheDocument();
        expect(screen.getByText('absent')).toBeInTheDocument();
        expect(screen.getByText('×3')).toBeInTheDocument();
        expect(screen.getByText('"ctx one"')).toBeInTheDocument();
        expect(screen.queryByText('"ctx four"')).not.toBeInTheDocument(); // contexts sliced to 3
        expect(screen.getByText('→ Task completion')).toBeInTheDocument();

        // CEFR profile panel
        expect(screen.getByText('CEFR Text Profile')).toBeInTheDocument();
        expect(screen.getByText('Vocabulary level distribution')).toBeInTheDocument();
        expect(screen.getByText('Notable words:')).toBeInTheDocument();
        expect(screen.getByText('Grammar structures')).toBeInTheDocument();
        expect(screen.getByText('Conditional')).toBeInTheDocument();
        expect(screen.getByText(/Vocabulary levels based on CEFR-J/)).toBeInTheDocument();
        expect(screen.getByText(/Academic vocabulary from the AWL/)).toBeInTheDocument();

        // grammar qualification
        expect(screen.getByText('Task completion')).toBeInTheDocument();
        expect(screen.getByText('1/2')).toBeInTheDocument();
        expect(screen.getByText(/✔ Uses past tense \(3×\)/)).toBeInTheDocument();
        expect(screen.getByText(/⊘ Uses passive/)).toBeInTheDocument();
        expect(screen.getByText(/✘ Uses conditionals/)).toBeInTheDocument();

        // grammar errors
        expect(screen.getByText('Missing comma')).toBeInTheDocument();
        expect(screen.getByText('Suggestion: Add comma')).toBeInTheDocument();
        expect(screen.getByText('Long sentence')).toBeInTheDocument();

        // extracted text toggle
        expect(screen.queryByText('The essay text.')).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Extracted text'));
        expect(screen.getByText('The essay text.')).toBeInTheDocument();

        // re-analyse returns to the select phase
        fireEvent.click(screen.getByText('Re-analyse'));
        expect(screen.getByRole('button', { name: /Extract & Analyse/ })).toBeInTheDocument();
        expect(screen.getByText('Privacy notice')).toBeInTheDocument();
        expect(screen.queryByText('Apply all found')).not.toBeInTheDocument();

        const saved = onSaveResult.mock.calls[0][0] as DocumentAnalysisResult;
        expect(saved.attachmentId).toBe('a1');
        expect(saved.extractedText).toBe('The essay text.');
        expect(saved.grammarCheckerUsed).toBe('languagetool');
        expect(saved.grammarTextTruncated).toBe(true);
        expect(saved.detectedItems).toEqual(detected);
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('applies sub-items, adds to bank, applies comments, and re-analyses from an existing result', async () => {
        const onApplyToEntry = vi.fn();
        const onAddToCommentBank = vi.fn();
        const onApplyComment = vi.fn();
        renderPanel({
            existingResult: baseResult,
            onApplyToEntry,
            onAddToCommentBank,
            onApplyComment,
        });

        // done phase without analysis — no selector / privacy / retry
        expect(screen.queryByRole('button', { name: /Extract & Analyse/ })).not.toBeInTheDocument();
        expect(screen.queryByText('Privacy notice')).not.toBeInTheDocument();
        expect(screen.getByText('Apply all found')).toBeInTheDocument();

        // apply a single linked sub-item
        fireEvent.click(screen.getAllByText('Apply')[0]);
        expect(onApplyToEntry).toHaveBeenCalledWith('c1', 'si1');
        expect(screen.getByText('Applied')).toBeInTheDocument();
        const appliedBtn = screen.getByText('Applied').closest('button');
        expect((appliedBtn as HTMLButtonElement).disabled).toBe(true);

        // apply all — v1 already applied, v2 gets applied, v9/v3 skipped
        fireEvent.click(screen.getByText('Apply all found'));
        expect(onApplyToEntry).toHaveBeenCalledWith('c2', 'si2');
        expect(onApplyToEntry).toHaveBeenCalledTimes(2);

        // add to comment bank
        fireEvent.click(screen.getAllByText('Add to bank')[0]);
        expect(onAddToCommentBank).toHaveBeenCalledWith('essay');
        expect(screen.getByText('Added')).toBeInTheDocument();
        expect((screen.getByText('Added').closest('button') as HTMLButtonElement).disabled).toBe(true);

        // apply grammar comment
        fireEvent.click(screen.getByText('analysis.apply_comment'));
        expect(onApplyComment).toHaveBeenCalledWith('c1', '<p>grammar comment</p>');
        expect(screen.getByText('analysis.comment_applied')).toBeInTheDocument();
        expect((screen.getByText('analysis.comment_applied').closest('button') as HTMLButtonElement).disabled).toBe(
            true
        );

        // extracted text pre
        fireEvent.click(screen.getByText('Extracted text'));
        expect(screen.getByText('Original extracted text.')).toBeInTheDocument();

        // re-analyse keeps the existing attachment selected
        fireEvent.click(screen.getByText('Re-analyse'));
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('a1');
    });

    it('supports transcript mode and reports extraction/grammar failures', async () => {
        const onSaveResult = vi.fn();
        const onClose = vi.fn();

        // no attachments — placeholder option and disabled analyse
        const r1 = renderPanel({ studentAttachments: [], onSaveResult, onClose });
        expect(screen.getByText('No attachments for this student')).toBeInTheDocument();
        expect((screen.getByRole('button', { name: /Extract & Analyse/ }) as HTMLButtonElement).disabled).toBe(true);
        r1.unmount();

        // transcript mode
        const r2 = renderPanel({ studentAttachments: [], onSaveResult, onClose });
        fireEvent.click(screen.getByTitle(/Paste a transcript instead/));
        const textarea = screen.getByPlaceholderText(/Paste the student's transcript here/);
        expect((screen.getByRole('button', { name: /Extract & Analyse/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(textarea, { target: { value: '   Spoken words here.   ' } });
        fireEvent.click(screen.getByRole('button', { name: /Extract & Analyse/ }));

        expect(await screen.findByText('however')).toBeInTheDocument();
        expect(mocks.extractText).not.toHaveBeenCalled();
        expect(mocks.checkGrammar).toHaveBeenCalledTimes(1);
        const saved = onSaveResult.mock.calls[0][0] as DocumentAnalysisResult;
        expect(saved.attachmentId).toBe('transcript');
        expect(saved.extractedText).toBe('Spoken words here.');
        r2.unmount();

        // unsupported format error
        const r3 = renderPanel({ onSaveResult, onClose });
        mocks.extractText.mockRejectedValueOnce(new UnsupportedFormatError('Unsupported format'));
        fireEvent.click(screen.getByRole('button', { name: /Extract & Analyse/ }));
        expect(await screen.findByText('Unsupported format')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry Analysis/ })).toBeInTheDocument();
        // generic Error on retry
        mocks.checkGrammar.mockRejectedValueOnce(new Error('LT down'));
        fireEvent.click(screen.getByRole('button', { name: /Retry Analysis/ }));
        expect(await screen.findByText('LT down')).toBeInTheDocument();
        r3.unmount();

        // non-Error rejection
        const r4 = renderPanel({ onSaveResult, onClose });
        mocks.extractText.mockRejectedValueOnce('boom');
        fireEvent.click(screen.getByRole('button', { name: /Extract & Analyse/ }));
        expect(await screen.findByText('An unexpected error occurred.')).toBeInTheDocument();
        r4.unmount();
    });

    it('warns for audio/video attachments and when the rubric has no vocabulary items', () => {
        // audio/video note + disabled analyse
        const r1 = renderPanel({ studentAttachments: [attachmentDoc, attachmentAudio] });
        expect((screen.getByRole('button', { name: /Extract & Analyse/ }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a2' } });
        expect(screen.getByText(/Audio and video files cannot be automatically transcribed/)).toBeInTheDocument();
        expect((screen.getByRole('button', { name: /Extract & Analyse/ }) as HTMLButtonElement).disabled).toBe(true);
        r1.unmount();

        // no vocabulary items note
        const r2 = renderPanel({ vocabularyItems: [] });
        expect(screen.getByText(/This rubric has no vocabulary items yet/)).toBeInTheDocument();
        r2.unmount();
    });

    it('shows the analysing progress state while extraction is pending', async () => {
        let resolveExtract: (v: string) => void = () => undefined;
        mocks.extractText.mockReturnValueOnce(
            new Promise<string>((res) => {
                resolveExtract = res;
            })
        );
        renderPanel({});

        fireEvent.click(screen.getByRole('button', { name: /Extract & Analyse/ }));
        expect(screen.getByText('Analysing…')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        expect(screen.queryByText('Source document')).not.toBeInTheDocument();
        expect(screen.queryByText('Privacy notice')).not.toBeInTheDocument();

        await act(async () => resolveExtract('Text.'));
        expect(await screen.findByText('however')).toBeInTheDocument();
    });

    it('renders the done state with zero found items, compromise source, and many grammar errors', async () => {
        const manyErrors: GrammarError[] = Array.from({ length: 21 }, (_, i) => ({
            message: `Error ${i}`,
            offset: i,
            length: 1,
            suggestions: i === 0 ? ['Fix it', 'Or this'] : [],
        }));
        const zeroResult: DocumentAnalysisResult = {
            ...baseResult,
            extractedText: '',
            detectedItems: [{ vocabularyItemId: 'v3', found: false, occurrences: 0, contexts: [] }],
            grammarErrors: manyErrors,
            grammarCheckerUsed: 'compromise',
            grammarTextTruncated: false,
        };
        renderPanel({ existingResult: zeroResult, vocabularyItems: [vocabItems[2]] });

        // summary — zero found, compromise source, no truncation badge, no apply-all
        expect(screen.getByText('/ 1 items found')).toBeInTheDocument();
        expect(screen.getByText(/21 grammar issues/)).toBeInTheDocument();
        expect(screen.getByText('compromise.js')).toBeInTheDocument();
        expect(screen.queryByText('LanguageTool')).not.toBeInTheDocument();
        expect(screen.queryByTitle(/only the first 20 KB/)).not.toBeInTheDocument();
        expect(screen.queryByText('Apply all found')).not.toBeInTheDocument();

        // no CEFR profile (empty text), no grammar qualification (no grammar descriptors)
        expect(screen.queryByText('CEFR Text Profile')).not.toBeInTheDocument();
        expect(screen.queryByText('analysis.grammar_qualification')).not.toBeInTheDocument();

        // no apply / bank buttons for unlinked, not-found items
        expect(screen.queryByText('Apply')).not.toBeInTheDocument();
        expect(screen.queryByText('Add to bank')).not.toBeInTheDocument();

        // grammar errors — suggestions join and the +N overflow line
        expect(screen.getByText('Suggestion: Fix it, Or this')).toBeInTheDocument();
        expect(screen.getByText('+1 more issues not shown')).toBeInTheDocument();
        expect(screen.getByText('Error 19')).toBeInTheDocument();
        expect(screen.queryByText('Error 20')).not.toBeInTheDocument();

        // extracted text fallback
        fireEvent.click(screen.getByText('Extracted text'));
        expect(screen.getByText('(no text extracted)')).toBeInTheDocument();
    });

    it('renders Dutch grammar qualification and the empty CEFR profile, and collapses the panel', async () => {
        langState.lang = 'nl';
        mocks.evaluateGrammar.mockImplementation((linked: { descriptorId: string }[]) => {
            if (linked.some((d) => d.descriptorId === 'g1')) {
                return {
                    items: [
                        {
                            descriptorId: 'g1',
                            descriptionEn: 'Uses past tense',
                            descriptionNl: 'Gebruikt verleden tijd',
                            categoryLabelEn: 'Grammar',
                            categoryLabelNl: 'Grammatica',
                            autoDetectable: true,
                            found: true,
                            occurrences: 2,
                        },
                    ],
                    autoDetectableCount: 1,
                    foundCount: 1,
                    passed: true,
                };
            }
            // second grammar criterion: mixed items exercise the Dutch ⊘/✘ arms
            return {
                items: [
                    {
                        descriptorId: 'g2',
                        descriptionEn: 'Uses passive',
                        descriptionNl: 'Gebruikt passief',
                        categoryLabelEn: 'Grammar',
                        categoryLabelNl: 'Grammatica',
                        autoDetectable: false,
                        found: false,
                        occurrences: 0,
                    },
                    {
                        descriptorId: 'g3',
                        descriptionEn: 'Uses conditionals',
                        descriptionNl: 'Gebruikt conditionals',
                        categoryLabelEn: 'Grammar',
                        categoryLabelNl: 'Grammatica',
                        autoDetectable: true,
                        found: false,
                        occurrences: 0,
                    },
                ],
                autoDetectableCount: 1,
                foundCount: 0,
                passed: false,
            };
        });
        mocks.profileText.mockReturnValue({
            estimatedLevel: 'A1',
            levelCounts: zeroCounts,
            highlightWords: [],
            offListPercent: 0,
            academic: { awlPercent: 0, nawlPercent: 0, academicWords: [] },
        });
        mocks.profileGrammar.mockReturnValue({ estimatedLevel: 'A1', detectedStructures: [] });
        renderPanel({
            existingResult: { ...baseResult, extractedText: 'Hallo wereld.' },
            onApplyComment: undefined,
            criteria: [
                ...criteria,
                {
                    id: 'c3',
                    title: 'Grammar accuracy',
                    description: '',
                    weight: 50,
                    levels: [],
                    frameworkDescriptors: [
                        grammarDescriptor('g2', 'Uses passive', 'Gebruikt passief'),
                        grammarDescriptor('g3', 'Uses conditionals', 'Gebruikt conditionals'),
                    ],
                },
            ],
        });

        // Dutch item descriptions (passed = green arm)
        expect(screen.getByText(/✔ Gebruikt verleden tijd \(2×\)/)).toBeInTheDocument();
        expect(screen.getByText('1/1')).toBeInTheDocument();
        // mixed second criterion — Dutch ⊘/✘ arms
        expect(screen.getByText(/⊘ Gebruikt passief/)).toBeInTheDocument();
        expect(screen.getByText(/✘ Gebruikt conditionals/)).toBeInTheDocument();
        expect(screen.getByText('0/1')).toBeInTheDocument();

        // empty CEFR profile arms
        expect(screen.getByText('No vocabulary matched the CEFR-J wordlist.')).toBeInTheDocument();
        expect(screen.getByText('No advanced grammar structures detected.')).toBeInTheDocument();
        expect(screen.queryByText('Notable words:')).not.toBeInTheDocument();

        // collapse the CEFR panel
        fireEvent.click(screen.getByText('CEFR Text Profile'));
        expect(screen.queryByText('Vocabulary level distribution')).not.toBeInTheDocument();
    });

    it('closes on overlay click but not on inner clicks', () => {
        const onClose = vi.fn();
        const { container } = renderPanel({ onClose });
        const overlay = container.querySelector('.modal-overlay');
        fireEvent.click(overlay as Element);
        expect(onClose).toHaveBeenCalledTimes(1);

        // inner click stops propagation
        fireEvent.click(screen.getByText('Document Analysis'));
        expect(onClose).toHaveBeenCalledTimes(1);

        // the X close button
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
