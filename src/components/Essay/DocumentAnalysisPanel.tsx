import React, { useState, useCallback, useMemo } from 'react';
import {
    X,
    ScanSearch,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ClipboardPaste,
    Check,
    BookOpen,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
    Attachment,
    CefrLevel,
    CefrTextProfile,
    VocabularyItem,
    DocumentAnalysisResult,
    DetectedItem,
    RubricCriterion,
} from '../../types';
import { extractText, UnsupportedFormatError } from '../../utils/textExtraction';
import { analyseVocabulary } from '../../utils/vocabularyAnalyser';
import { checkGrammar, profileGrammar, LT_ATTRIBUTION_URL } from '../../utils/grammarChecker';
import { profileText } from '../../utils/cefrVocabularyProfiler';
import { CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import { nanoid } from '../../utils/nanoid';

const LEVEL_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface Props {
    studentId: string;
    rubricId: string;
    rubricName: string;
    vocabularyItems: VocabularyItem[];
    criteria: RubricCriterion[];
    studentAttachments: Attachment[];
    existingResult?: DocumentAnalysisResult;
    onClose: () => void;
    onSaveResult: (result: DocumentAnalysisResult) => void;
    onApplyToEntry: (criterionId: string, subItemId: string) => void;
    onAddToCommentBank?: (phrase: string) => void;
}

type Phase = 'select' | 'analysing' | 'done' | 'error';

const CATEGORY_COLORS: Record<string, string> = {
    vocabulary: 'var(--accent)',
    grammar: 'var(--green)',
    discourse: 'var(--yellow)',
    other: 'var(--purple)',
};

/**
 * Modal panel that extracts or accepts text, analyses vocabulary and grammar, and presents results with actions.
 *
 * Displays a source selector (attachment or pasted transcript), runs extraction, vocabulary matching, and grammar checking,
 * then shows detected vocabulary items, a CEFR-J text profile (when available), grammar issues, and the extracted text.
 *
 * @param studentId - ID of the student whose attachments are analysed
 * @param rubricId - ID of the rubric used to match vocabulary items
 * @param rubricName - Human-readable rubric title shown in the panel header
 * @param vocabularyItems - Vocabulary items from the rubric used for phrase detection
 * @param criteria - Rubric criteria list used to resolve linked criterion titles
 * @param studentAttachments - Attachments available for the student (used for text extraction)
 * @param existingResult - Optional prior DocumentAnalysisResult to initialise the panel in "done" state
 * @param onClose - Callback invoked when the modal is closed
 * @param onSaveResult - Callback invoked with the new DocumentAnalysisResult after a successful analysis
 * @param onApplyToEntry - Callback invoked to apply a linked rubric sub-item (signature: (criterionId, subItemId) => void)
 * @param onAddToCommentBank - Optional callback invoked with a phrase to add it to a comment bank
 * @returns A React element rendering the document analysis modal
 */
export default function DocumentAnalysisPanel({
    studentId,
    rubricId,
    rubricName,
    vocabularyItems,
    criteria,
    studentAttachments,
    existingResult,
    onClose,
    onSaveResult,
    onApplyToEntry,
    onAddToCommentBank,
}: Props) {
    const { t } = useTranslation();

    const [selectedAttachmentId, setSelectedAttachmentId] = useState(
        existingResult?.attachmentId ?? studentAttachments[0]?.id ?? ''
    );
    const [transcript, setTranscript] = useState('');
    const [useTranscriptMode, setUseTranscriptMode] = useState(false);

    const [phase, setPhase] = useState<Phase>(existingResult ? 'done' : 'select');
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const [result, setResult] = useState<DocumentAnalysisResult | null>(existingResult ?? null);
    const [showText, setShowText] = useState(false);
    const [appliedSubItems, setAppliedSubItems] = useState<Set<string>>(new Set());
    const [addedToBank, setAddedToBank] = useState<Set<string>>(new Set());

    const extractedText = result?.extractedText ?? null;
    const cefrProfile = useMemo<CefrTextProfile | null>(() => {
        if (!extractedText) return null;
        const vocabulary = profileText(extractedText);
        const grammar = profileGrammar(extractedText);
        const vocabIdx = LEVEL_ORDER.indexOf(vocabulary.estimatedLevel);
        const grammarIdx = LEVEL_ORDER.indexOf(grammar.estimatedLevel);
        const overallEstimatedLevel = LEVEL_ORDER[Math.max(vocabIdx, grammarIdx)];
        return { vocabulary, grammar, overallEstimatedLevel };
    }, [extractedText]);

    const selectedAttachment = studentAttachments.find((a) => a.id === selectedAttachmentId);
    const isAudioVideo =
        selectedAttachment?.mimeType.startsWith('audio/') || selectedAttachment?.mimeType.startsWith('video/');

    const handleProgress = useCallback((pct: number, status: string) => {
        setProgress(pct);
        setProgressStatus(status);
    }, []);

    const handleAnalyse = useCallback(async () => {
        setPhase('analysing');
        setProgress(0);
        setErrorMsg('');

        try {
            let text: string;

            if (useTranscriptMode) {
                text = transcript.trim();
                if (!text) throw new Error('Please paste a transcript before analysing.');
            } else {
                if (!selectedAttachment) throw new Error('No attachment selected.');
                text = await extractText(selectedAttachment, handleProgress);
            }

            handleProgress(60, 'Matching vocabulary…');
            const detectedItems = analyseVocabulary(text, vocabularyItems);

            handleProgress(75, 'Checking grammar…');
            const { errors: grammarErrors, source: grammarCheckerUsed, textWasTruncated } = await checkGrammar(text);

            handleProgress(95, 'Saving…');
            const newResult: DocumentAnalysisResult = {
                id: nanoid(),
                studentId,
                rubricId,
                attachmentId: useTranscriptMode ? 'transcript' : selectedAttachment!.id,
                extractedText: text,
                analyzedAt: new Date().toISOString(),
                detectedItems,
                grammarErrors,
                grammarCheckerUsed,
                grammarTextTruncated: textWasTruncated,
            };

            setResult(newResult);
            onSaveResult(newResult);
            handleProgress(100, 'Done');
            setPhase('done');
        } catch (err) {
            const msg =
                err instanceof UnsupportedFormatError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'An unexpected error occurred.';
            setErrorMsg(msg);
            setPhase('error');
        }
    }, [
        selectedAttachment,
        useTranscriptMode,
        transcript,
        vocabularyItems,
        studentId,
        rubricId,
        handleProgress,
        onSaveResult,
    ]);

    function applySubItem(item: VocabularyItem, detected: DetectedItem) {
        if (!item.linkedSubItemId || !item.linkedCriterionId || !detected.found) return;
        onApplyToEntry(item.linkedCriterionId, item.linkedSubItemId);
        setAppliedSubItems((s) => new Set([...s, item.linkedSubItemId!]));
    }

    function applyAll() {
        if (!result) return;
        result.detectedItems.forEach((d) => {
            const vocabItem = vocabularyItems.find((v) => v.id === d.vocabularyItemId);
            if (
                vocabItem?.linkedSubItemId &&
                vocabItem?.linkedCriterionId &&
                d.found &&
                !appliedSubItems.has(vocabItem.linkedSubItemId)
            ) {
                applySubItem(vocabItem, d);
            }
        });
    }

    const foundCount = result?.detectedItems.filter((d) => d.found).length ?? 0;
    const totalCount = result?.detectedItems.length ?? 0;

    return (
        <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-dialog-title"
            onClick={onClose}
        >
            <div
                className="modal"
                style={{ maxWidth: 720, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <ScanSearch size={20} style={{ color: 'var(--accent)' }} />
                    <div style={{ flex: 1 }}>
                        <h3 id="analysis-dialog-title" style={{ margin: 0 }}>
                            {t('analysis.title', 'Document Analysis')}
                        </h3>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                            {rubricName}
                        </p>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close', 'Close')}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Attachment / transcript selector */}
                    {phase !== 'analysing' && (
                        <div className="card" style={{ padding: 14 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                                <label style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>
                                    {t('analysis.source_label', 'Source document')}
                                </label>
                                <button
                                    className={`btn btn-sm ${useTranscriptMode ? 'btn-secondary' : 'btn-ghost'}`}
                                    onClick={() => setUseTranscriptMode((t) => !t)}
                                    title={t('analysis.paste_transcript', 'Paste a transcript instead')}
                                >
                                    <ClipboardPaste size={14} />
                                    {t('analysis.paste_transcript_short', 'Paste transcript')}
                                </button>
                            </div>

                            {useTranscriptMode ? (
                                <textarea
                                    className="input"
                                    style={{ width: '100%', minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
                                    placeholder={t(
                                        'analysis.transcript_placeholder',
                                        "Paste the student's transcript here… (useful for audio/video recordings)"
                                    )}
                                    value={transcript}
                                    onChange={(e) => setTranscript(e.target.value)}
                                />
                            ) : (
                                <>
                                    <select
                                        className="input"
                                        value={selectedAttachmentId}
                                        onChange={(e) => setSelectedAttachmentId(e.target.value)}
                                    >
                                        {studentAttachments.length === 0 && (
                                            <option value="">
                                                {t('analysis.no_attachments', 'No attachments for this student')}
                                            </option>
                                        )}
                                        {studentAttachments.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                            </option>
                                        ))}
                                    </select>
                                    {isAudioVideo && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 8,
                                                alignItems: 'flex-start',
                                                marginTop: 10,
                                                padding: '10px 12px',
                                                background: 'var(--bg)',
                                                borderRadius: 8,
                                                border: '1px solid var(--border)',
                                            }}
                                        >
                                            <AlertTriangle
                                                size={15}
                                                style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }}
                                            />
                                            <p className="text-xs text-muted" style={{ margin: 0 }}>
                                                {t(
                                                    'analysis.audio_video_note',
                                                    'Audio and video files cannot be automatically transcribed (no server-side processing). Use "Paste transcript" to analyse the spoken content.'
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {vocabularyItems.length === 0 && (
                                <div
                                    style={{
                                        marginTop: 10,
                                        padding: '8px 12px',
                                        background: 'var(--bg)',
                                        borderRadius: 8,
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    <p className="text-xs text-muted" style={{ margin: 0 }}>
                                        {t(
                                            'analysis.no_vocab_items',
                                            'This rubric has no vocabulary items yet. Add them in the Rubric Builder → Vocabulary section.'
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Privacy notice + Analyse button */}
                    {phase === 'select' || phase === 'error' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div
                                style={{
                                    padding: '10px 14px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    fontSize: '0.8rem',
                                    color: 'var(--text-muted)',
                                    lineHeight: 1.5,
                                }}
                            >
                                <strong style={{ color: 'var(--text)' }}>
                                    {t('analysis.privacy_heading', 'Privacy notice')}
                                </strong>{' '}
                                {t('analysis.privacy_body', 'Grammar checking is powered by')}{' '}
                                <a
                                    href={LT_ATTRIBUTION_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    LanguageTool
                                </a>
                                .{' '}
                                {t(
                                    'analysis.privacy_detail',
                                    "The extracted text of this document will be sent to LanguageTool's servers (api.languagetool.org) for grammar analysis. Do not use this feature if the document contains sensitive personal data."
                                )}{' '}
                                <a
                                    href="https://languagetool.org/legal/privacy"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: 'var(--accent)' }}
                                >
                                    {t('analysis.privacy_policy_link', 'LanguageTool Privacy Policy')}
                                </a>
                                .
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleAnalyse}
                                disabled={
                                    (!useTranscriptMode && (!selectedAttachment || isAudioVideo)) ||
                                    (useTranscriptMode && !transcript.trim())
                                }
                            >
                                <ScanSearch size={16} />
                                {phase === 'error'
                                    ? t('analysis.retry', 'Retry Analysis')
                                    : t('analysis.run', 'Extract & Analyse')}
                            </button>
                        </div>
                    ) : null}

                    {/* Error */}
                    {phase === 'error' && (
                        <div
                            style={{
                                padding: '12px 16px',
                                background: 'rgba(239,68,68,0.08)',
                                borderRadius: 8,
                                border: '1px solid rgba(239,68,68,0.3)',
                            }}
                        >
                            <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.9rem' }}>{errorMsg}</p>
                        </div>
                    )}

                    {/* Progress */}
                    {phase === 'analysing' && (
                        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                            <p style={{ marginBottom: 12, fontWeight: 600 }} aria-live="polite" aria-atomic="true">
                                {progressStatus || t('analysis.analysing', 'Analysing…')}
                            </p>
                            <div
                                role="progressbar"
                                aria-valuenow={progress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={t('analysis.analysing', 'Analysing…')}
                                style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}
                            >
                                <div
                                    style={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        background: 'var(--accent)',
                                        borderRadius: 4,
                                        transition: 'width 0.3s',
                                    }}
                                />
                            </div>
                            <p className="text-xs text-muted" style={{ marginTop: 8 }} aria-hidden="true">
                                {progress}%
                            </p>
                        </div>
                    )}

                    {/* Results */}
                    {phase === 'done' && result && (
                        <>
                            {/* Summary bar */}
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                }}
                            >
                                <div>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            fontSize: '1.1rem',
                                            color: foundCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
                                        }}
                                    >
                                        {foundCount}
                                    </span>
                                    <span className="text-muted text-xs">
                                        {' '}
                                        / {totalCount} {t('analysis.items_found', 'items found')}
                                    </span>
                                </div>
                                <div className="text-xs text-muted" style={{ marginLeft: 4 }}>
                                    {result.grammarErrors.length} {t('analysis.grammar_issues', 'grammar issues')}
                                    {' · '}
                                    {result.grammarCheckerUsed === 'languagetool' ? (
                                        <a
                                            href={LT_ATTRIBUTION_URL}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ color: 'var(--accent)' }}
                                        >
                                            LanguageTool
                                        </a>
                                    ) : (
                                        <span>compromise.js</span>
                                    )}
                                    {result.grammarTextTruncated && (
                                        <span
                                            title={t(
                                                'analysis.truncated_title',
                                                'Document exceeded 20 KB — only the first 20 KB was checked for grammar'
                                            )}
                                            style={{ marginLeft: 6, color: '#f59e0b', cursor: 'help' }}
                                        >
                                            ⚠ {t('analysis.truncated_short', 'partial')}
                                        </span>
                                    )}
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                    {foundCount > 0 && (
                                        <button className="btn btn-secondary btn-sm" onClick={applyAll}>
                                            <Check size={14} />
                                            {t('analysis.apply_all', 'Apply all found')}
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            setPhase('select');
                                            setResult(null);
                                        }}
                                    >
                                        {t('analysis.re_analyse', 'Re-analyse')}
                                    </button>
                                </div>
                            </div>

                            {/* Vocabulary results */}
                            <div>
                                <h4 style={{ marginBottom: 10, fontSize: '0.9rem' }}>
                                    {t('analysis.vocabulary_results', 'Vocabulary & Grammar Detection')}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {result.detectedItems.map((detected) => {
                                        const vocabItem = vocabularyItems.find(
                                            (v) => v.id === detected.vocabularyItemId
                                        );
                                        if (!vocabItem) return null;
                                        const linkedCriterion = vocabItem.linkedCriterionId
                                            ? criteria.find((c) => c.id === vocabItem.linkedCriterionId)
                                            : null;
                                        const alreadyApplied = vocabItem.linkedSubItemId
                                            ? appliedSubItems.has(vocabItem.linkedSubItemId)
                                            : false;

                                        return (
                                            <div
                                                key={detected.vocabularyItemId}
                                                className="card"
                                                style={{
                                                    padding: '10px 14px',
                                                    borderLeft: `3px solid ${detected.found ? (CATEGORY_COLORS[vocabItem.category] ?? 'var(--accent)') : 'var(--border)'}`,
                                                    opacity: detected.found ? 1 : 0.6,
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <div style={{ paddingTop: 2 }}>
                                                        {detected.found ? (
                                                            <CheckCircle2
                                                                size={16}
                                                                style={{
                                                                    color:
                                                                        CATEGORY_COLORS[vocabItem.category] ??
                                                                        'var(--accent)',
                                                                }}
                                                            />
                                                        ) : (
                                                            <XCircle size={16} style={{ color: 'var(--text-dim)' }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 8,
                                                                flexWrap: 'wrap',
                                                            }}
                                                        >
                                                            <span style={{ fontWeight: 600 }}>{vocabItem.phrase}</span>
                                                            <span className="text-xs text-muted">
                                                                {vocabItem.category}
                                                            </span>
                                                            {detected.found && (
                                                                <span
                                                                    className="text-xs"
                                                                    style={{ color: 'var(--accent)' }}
                                                                >
                                                                    ×{detected.occurrences}
                                                                </span>
                                                            )}
                                                            {linkedCriterion && (
                                                                <span
                                                                    className="text-xs text-muted"
                                                                    style={{ fontStyle: 'italic' }}
                                                                >
                                                                    → {linkedCriterion.title}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {detected.found && detected.contexts.length > 0 && (
                                                            <div
                                                                style={{
                                                                    marginTop: 6,
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 4,
                                                                }}
                                                            >
                                                                {detected.contexts.slice(0, 3).map((ctx, i) => (
                                                                    <p
                                                                        key={i}
                                                                        className="text-xs text-muted"
                                                                        style={{
                                                                            margin: 0,
                                                                            fontStyle: 'italic',
                                                                            lineHeight: 1.5,
                                                                        }}
                                                                    >
                                                                        "{ctx}"
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {detected.found && (
                                                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                                            {vocabItem.linkedSubItemId &&
                                                                vocabItem.linkedCriterionId && (
                                                                    <button
                                                                        className={`btn btn-sm ${alreadyApplied ? 'btn-ghost' : 'btn-secondary'}`}
                                                                        style={{ fontSize: 12 }}
                                                                        onClick={() =>
                                                                            applySubItem(vocabItem, detected)
                                                                        }
                                                                        disabled={alreadyApplied}
                                                                    >
                                                                        {alreadyApplied ? (
                                                                            <>
                                                                                <Check size={13} />{' '}
                                                                                {t('analysis.applied', 'Applied')}
                                                                            </>
                                                                        ) : (
                                                                            t('analysis.apply', 'Apply')
                                                                        )}
                                                                    </button>
                                                                )}
                                                            {onAddToCommentBank && (
                                                                <button
                                                                    className={`btn btn-sm ${addedToBank.has(vocabItem.id) ? 'btn-ghost' : 'btn-secondary'}`}
                                                                    style={{ fontSize: 12 }}
                                                                    onClick={() => {
                                                                        onAddToCommentBank(vocabItem.phrase);
                                                                        setAddedToBank(
                                                                            (s) => new Set([...s, vocabItem.id])
                                                                        );
                                                                    }}
                                                                    disabled={addedToBank.has(vocabItem.id)}
                                                                >
                                                                    {addedToBank.has(vocabItem.id) ? (
                                                                        <>
                                                                            <Check size={13} />{' '}
                                                                            {t('analysis.added_to_bank', 'Added')}
                                                                        </>
                                                                    ) : (
                                                                        t('analysis.add_to_bank', 'Add to bank')
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* CEFR Text Profile */}
                            {cefrProfile && <CefrProfilePanel profile={cefrProfile} />}

                            {/* Grammar errors */}
                            {result.grammarErrors.length > 0 && (
                                <div>
                                    <h4 style={{ marginBottom: 10, fontSize: '0.9rem' }}>
                                        {t('analysis.grammar_errors', 'Grammar Issues')}
                                        <span className="text-xs text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                                            {t('analysis.via', 'via')} {result.grammarCheckerUsed}
                                        </span>
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {result.grammarErrors.slice(0, 20).map((err, i) => (
                                            <div
                                                key={i}
                                                className="card"
                                                style={{ padding: '10px 14px', borderLeft: '3px solid #f59e0b' }}
                                            >
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                                    <AlertTriangle
                                                        size={15}
                                                        style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 2 }}
                                                    />
                                                    <div>
                                                        <p style={{ margin: 0, fontSize: '0.875rem' }}>{err.message}</p>
                                                        {err.suggestions.length > 0 && (
                                                            <p
                                                                className="text-xs text-muted"
                                                                style={{ margin: '4px 0 0' }}
                                                            >
                                                                {t('analysis.suggestion', 'Suggestion')}:{' '}
                                                                {err.suggestions.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {result.grammarErrors.length > 20 && (
                                            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
                                                +{result.grammarErrors.length - 20}{' '}
                                                {t('analysis.more_errors', 'more issues not shown')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Extracted text (collapsible) */}
                            <div className="card" style={{ padding: 14 }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ width: '100%', justifyContent: 'space-between' }}
                                    onClick={() => setShowText((v) => !v)}
                                >
                                    <span>{t('analysis.extracted_text', 'Extracted text')}</span>
                                    {showText ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showText && (
                                    <pre
                                        style={{
                                            marginTop: 10,
                                            padding: 12,
                                            background: 'var(--bg)',
                                            borderRadius: 8,
                                            fontSize: '0.8rem',
                                            lineHeight: 1.6,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            maxHeight: 300,
                                            overflowY: 'auto',
                                        }}
                                    >
                                        {result.extractedText || t('analysis.no_text', '(no text extracted)')}
                                    </pre>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── CEFR Profile sub-panel ───────────────────────────────────────────────────

/**
 * Render a compact, styled badge for a CEFR level.
 *
 * The badge text and accent color reflect the provided CEFR level.
 *
 * @param level - CEFR level identifier (for example, `"A1"`, `"B2"`, `"C1"`)
 * @returns A styled inline element showing the given CEFR level as a colored badge
 */
function CefrLevelBadge({ level }: { level: CefrLevel }) {
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '1px 7px',
                borderRadius: 4,
                fontWeight: 700,
                fontSize: '0.75rem',
                background: CEFR_LEVEL_COLORS[level] + '22',
                color: CEFR_LEVEL_COLORS[level],
                border: `1px solid ${CEFR_LEVEL_COLORS[level]}44`,
            }}
        >
            {level}
        </span>
    );
}

/**
 * Displays a collapsible CEFR-J text profile panel showing vocabulary distribution, notable words, and detected grammar structures.
 *
 * @param profile - CEFR text profile containing vocabulary and grammar profiling data used to render distributions, highlights, and estimated levels.
 * @returns A React element rendering the CEFR profile panel.
 */
function CefrProfilePanel({ profile }: { profile: CefrTextProfile }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(true);

    const { vocabulary, grammar } = profile;
    const total = Object.values(vocabulary.levelCounts).reduce((s, c) => s + c, 0);

    return (
        <div>
            <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'space-between', marginBottom: open ? 10 : 0 }}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BookOpen size={14} />
                    <strong>{t('analysis.cefr_profile', 'CEFR Text Profile')}</strong>
                    <CefrLevelBadge level={profile.overallEstimatedLevel} />
                </span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {open && (
                <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Vocabulary distribution */}
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                            }}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                {t('analysis.vocab_distribution', 'Vocabulary level distribution')}
                            </span>
                            <CefrLevelBadge level={vocabulary.estimatedLevel} />
                        </div>
                        {total > 0 ? (
                            <>
                                {/* Stacked bar */}
                                <div
                                    style={{
                                        display: 'flex',
                                        height: 12,
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        marginBottom: 6,
                                    }}
                                >
                                    {LEVEL_ORDER.map((lvl) => {
                                        const pct = total > 0 ? (vocabulary.levelCounts[lvl] / total) * 100 : 0;
                                        return pct > 0 ? (
                                            <div
                                                key={lvl}
                                                title={`${lvl}: ${vocabulary.levelCounts[lvl]} words (${pct.toFixed(1)}%)`}
                                                style={{ width: `${pct}%`, background: CEFR_LEVEL_COLORS[lvl] }}
                                            />
                                        ) : null;
                                    })}
                                </div>
                                {/* Legend */}
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {LEVEL_ORDER.filter((lvl) => vocabulary.levelCounts[lvl] > 0).map((lvl) => (
                                        <span
                                            key={lvl}
                                            style={{
                                                fontSize: '0.75rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: 2,
                                                    background: CEFR_LEVEL_COLORS[lvl],
                                                    display: 'inline-block',
                                                }}
                                            />
                                            {lvl}: {vocabulary.levelCounts[lvl]}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-muted">
                                {t('analysis.no_vocab_matched', 'No vocabulary matched the CEFR-J wordlist.')}
                            </p>
                        )}

                        {/* Highlight words */}
                        {vocabulary.highlightWords.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <p className="text-xs text-muted" style={{ marginBottom: 6 }}>
                                    {t('analysis.notable_words', 'Notable words:')}
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {vocabulary.highlightWords.map(({ word, level }) => (
                                        <span
                                            key={word}
                                            title={level}
                                            style={{
                                                fontSize: '0.78rem',
                                                padding: '2px 7px',
                                                borderRadius: 4,
                                                background: CEFR_LEVEL_COLORS[level] + '18',
                                                border: `1px solid ${CEFR_LEVEL_COLORS[level]}44`,
                                                color: 'var(--text)',
                                            }}
                                        >
                                            {word}
                                            <span
                                                style={{
                                                    marginLeft: 4,
                                                    fontSize: '0.68rem',
                                                    color: CEFR_LEVEL_COLORS[level],
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {level}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Grammar structures */}
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                            }}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                {t('analysis.grammar_structures', 'Grammar structures')}
                            </span>
                            <CefrLevelBadge level={grammar.estimatedLevel} />
                        </div>
                        {grammar.detectedStructures.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {[...grammar.detectedStructures]
                                    .sort((a, b) => LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level))
                                    .map((s) => (
                                        <div
                                            key={s.shorthand}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                fontSize: '0.82rem',
                                                padding: '4px 0',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                        >
                                            <CefrLevelBadge level={s.level} />
                                            <span style={{ flex: 1 }}>{s.label}</span>
                                            <span className="text-muted text-xs">×{s.count}</span>
                                        </div>
                                    ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted">
                                {t('analysis.no_grammar_detected', 'No advanced grammar structures detected.')}
                            </p>
                        )}
                    </div>

                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                        {t('analysis.cefrj_attribution', 'Vocabulary levels based on CEFR-J (Tono Laboratory, TUFS).')}
                    </p>
                </div>
            )}
        </div>
    );
}
