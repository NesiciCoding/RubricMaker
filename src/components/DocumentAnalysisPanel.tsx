import React, { useState, useCallback } from 'react';
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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment, VocabularyItem, DocumentAnalysisResult, DetectedItem, RubricCriterion } from '../types';
import { extractText, UnsupportedFormatError } from '../utils/textExtraction';
import { analyseVocabulary } from '../utils/vocabularyAnalyser';
import { checkGrammar, LT_ATTRIBUTION_URL } from '../utils/grammarChecker';
import { nanoid } from '../utils/nanoid';

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
}

type Phase = 'select' | 'analysing' | 'done' | 'error';

const CATEGORY_COLORS: Record<string, string> = {
    vocabulary: 'var(--accent)',
    grammar: 'var(--green)',
    discourse: 'var(--yellow)',
    other: 'var(--purple)',
};

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
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ maxWidth: 720, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <ScanSearch size={20} style={{ color: 'var(--accent)' }} />
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0 }}>{t('analysis.title', 'Document Analysis')}</h3>
                        <p className="text-xs text-muted" style={{ margin: 0 }}>
                            {rubricName}
                        </p>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
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
                                    (useTranscriptMode && !transcript.trim()) ||
                                    vocabularyItems.length === 0
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
                                                    {detected.found &&
                                                        vocabItem.linkedSubItemId &&
                                                        vocabItem.linkedCriterionId && (
                                                            <button
                                                                className={`btn btn-sm ${alreadyApplied ? 'btn-ghost' : 'btn-secondary'}`}
                                                                style={{ flexShrink: 0, fontSize: 12 }}
                                                                onClick={() => applySubItem(vocabItem, detected)}
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
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

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
