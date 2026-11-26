import React, { useMemo, useState } from 'react';
import { BookOpen, Mic, MicOff, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TiptapEditor, { type TiptapEditorHandle } from '../Editor/TiptapEditor';
import type { CommentBankItem } from '../../types';
import { FeedbackAudioPlayer } from './FeedbackAudioPlayer';
import { usePriorCommentSearch } from '../../hooks/usePriorCommentSearch';
import type { PriorCommentSource, RankedPriorComment } from '../../utils/commentRecall';

const CHIP_COUNT = 6;
const RESULT_COUNT = 6;

function truncate(text: string, max = 42): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/**
 * Per-criterion comment editor for the grading grid's detail panel: TipTap editor,
 * quick-insert chips (the teacher's most-used bank comments), a "browse all" button
 * that opens the full CommentBankModal, audio feedback (Phase 40 directive 4), and a
 * phrase search over every comment the teacher has already written (#887).
 */
export default function CommentComposer({
    value,
    onChange,
    editorRef,
    commentBank,
    pastFeedback,
    onInsertChip,
    onInsertPriorComment,
    onBrowseAll,
    audioRecording,
    audioDataUrl,
    audioStoragePath,
    onStartAudio,
    onStopAudio,
    onRemoveAudio,
}: {
    value: string;
    onChange: (html: string) => void;
    editorRef: React.Ref<TiptapEditorHandle>;
    commentBank: CommentBankItem[];
    /** Criterion comments from earlier grades, already stripped of markup and labelled. */
    pastFeedback?: PriorCommentSource[];
    onInsertChip: (item: CommentBankItem) => void;
    /** Absent where no editor can take an insert — the search field is then not rendered. */
    onInsertPriorComment?: (comment: RankedPriorComment) => void;
    onBrowseAll: () => void;
    audioRecording: boolean;
    audioDataUrl?: string;
    audioStoragePath?: string;
    onStartAudio: () => void;
    onStopAudio: () => void;
    onRemoveAudio: () => void;
}) {
    const { t } = useTranslation();
    const [priorQuery, setPriorQuery] = useState('');

    const quickItems = useMemo(() => {
        return [...commentBank]
            .sort((a, b) => {
                const usage = (b.usageCount ?? 0) - (a.usageCount ?? 0);
                if (usage !== 0) return usage;
                const used = (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
                if (used !== 0) return used;
                return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
            })
            .slice(0, CHIP_COUNT);
    }, [commentBank]);

    const priorSources = useMemo<PriorCommentSource[]>(
        () => [
            ...commentBank.map((item) => ({
                id: item.id,
                text: item.text,
                source: 'bank' as const,
                label: item.tags.length > 0 ? item.tags.join(' · ') : undefined,
            })),
            ...(pastFeedback ?? []),
        ],
        [commentBank, pastFeedback]
    );

    const { results: priorResults, searching: priorSearching } = usePriorCommentSearch(
        priorQuery,
        priorSources,
        RESULT_COUNT
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                    }}
                >
                    {t('gradeStudent.quick_comments_label')}
                </span>
                {quickItems.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        {t('gradeStudent.quick_comments_empty')}
                    </span>
                ) : (
                    quickItems.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '3px 9px', borderRadius: 999 }}
                            title={item.text}
                            onClick={() => onInsertChip(item)}
                        >
                            {truncate(item.text)}
                        </button>
                    ))
                )}
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', fontSize: '0.75rem' }}
                    onClick={onBrowseAll}
                    title={t('gradeStudent.comment_open_bank')}
                >
                    <BookOpen size={14} /> {t('gradeStudent.comment_open_bank')}
                </button>
            </div>

            {onInsertPriorComment && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label
                            htmlFor="prior-comment-search"
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color: 'var(--text-muted)',
                            }}
                        >
                            {t('gradeStudent.prior_comments_label')}
                        </label>
                        {priorSearching && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                {t('gradeStudent.prior_comments_searching')}
                            </span>
                        )}
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search
                            size={14}
                            aria-hidden
                            style={{
                                position: 'absolute',
                                left: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)',
                            }}
                        />
                        <input
                            id="prior-comment-search"
                            type="search"
                            className="input"
                            value={priorQuery}
                            onChange={(e) => setPriorQuery(e.target.value)}
                            placeholder={t('gradeStudent.prior_comments_placeholder')}
                            autoComplete="off"
                            style={{ paddingLeft: 30, width: '100%', fontSize: '0.8rem' }}
                        />
                    </div>
                    {priorQuery.trim().length >= 2 &&
                        (priorResults.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                {priorSearching
                                    ? t('gradeStudent.prior_comments_searching')
                                    : t('gradeStudent.prior_comments_empty')}
                            </span>
                        ) : (
                            <ul
                                aria-label={t('gradeStudent.prior_comments_label')}
                                style={{
                                    listStyle: 'none',
                                    margin: 0,
                                    padding: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                }}
                            >
                                {priorResults.map((item) => (
                                    <li key={`${item.source}:${item.id}`}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            title={item.text}
                                            onClick={() => onInsertPriorComment?.(item)}
                                            style={{
                                                width: '100%',
                                                justifyContent: 'flex-start',
                                                alignItems: 'baseline',
                                                gap: 8,
                                                textAlign: 'left',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    flex: 1,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {truncate(item.text, 90)}
                                            </span>
                                            <span
                                                style={{
                                                    flexShrink: 0,
                                                    fontSize: '0.68rem',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {item.label ??
                                                    t(
                                                        item.source === 'bank'
                                                            ? 'gradeStudent.prior_comments_bank_badge'
                                                            : 'gradeStudent.prior_comments_feedback_badge'
                                                    )}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ))}
                </div>
            )}

            <TiptapEditor
                ref={editorRef}
                content={value || ''}
                onChange={onChange}
                placeholder={t('gradeStudent.comment_placeholder')}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {audioRecording ? (
                    <button type="button" className="btn btn-danger btn-sm pulse" onClick={onStopAudio}>
                        <MicOff size={13} /> {t('gradeStudent.audio_stop')}
                    </button>
                ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onStartAudio}>
                        <Mic size={13} /> {t('gradeStudent.audio_record')}
                    </button>
                )}
                <FeedbackAudioPlayer
                    audioDataUrl={audioDataUrl}
                    audioStoragePath={audioStoragePath}
                    onRemove={onRemoveAudio}
                />
            </div>
        </div>
    );
}
