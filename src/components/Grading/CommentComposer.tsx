import React, { useMemo } from 'react';
import { BookOpen, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TiptapEditor, { type TiptapEditorHandle } from '../Editor/TiptapEditor';
import type { CommentBankItem } from '../../types';

const CHIP_COUNT = 6;

function truncate(text: string, max = 42): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/**
 * Per-criterion comment editor for the grading grid's detail panel: TipTap editor,
 * quick-insert chips (the teacher's most-used bank comments), a "browse all" button
 * that opens the full CommentBankModal, and audio feedback (Phase 40 directive 4).
 */
export default function CommentComposer({
    value,
    onChange,
    editorRef,
    commentBank,
    onInsertChip,
    onBrowseAll,
    audioRecording,
    audioDataUrl,
    onStartAudio,
    onStopAudio,
    onRemoveAudio,
}: {
    value: string;
    onChange: (html: string) => void;
    editorRef: React.Ref<TiptapEditorHandle>;
    commentBank: CommentBankItem[];
    onInsertChip: (item: CommentBankItem) => void;
    onBrowseAll: () => void;
    audioRecording: boolean;
    audioDataUrl?: string;
    onStartAudio: () => void;
    onStopAudio: () => void;
    onRemoveAudio: () => void;
}) {
    const { t } = useTranslation();

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
                {audioDataUrl && (
                    <>
                        <audio controls src={audioDataUrl} style={{ height: 28, flex: 1 }} />
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={onRemoveAudio}
                            aria-label={t('gradeStudent.audio_remove')}
                            title={t('gradeStudent.audio_remove')}
                        >
                            ✕
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
