import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RotateCcw, Trash2, MessageSquare } from 'lucide-react';
import type { DocumentComment } from '../../types';

interface CommentSidebarProps {
    comments: DocumentComment[];
    activeCommentId: string | null;
    currentUserId: string | null;
    onSelect: (id: string) => void;
    onResolve: (id: string, resolved: boolean) => void;
    onDelete: (id: string) => void;
}

export default function CommentSidebar({
    comments,
    activeCommentId,
    currentUserId,
    onSelect,
    onResolve,
    onDelete,
}: CommentSidebarProps) {
    const { t } = useTranslation();

    if (comments.length === 0) {
        return (
            <div
                className="text-xs text-muted"
                style={{ padding: 12, textAlign: 'center' }}
                data-testid="comment-sidebar-empty"
            >
                {t('attachments.comments_empty')}
            </div>
        );
    }

    const sorted = [...comments].sort((a, b) => a.anchor.from - b.anchor.from);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((c) => {
                const isActive = c.id === activeCommentId;
                const isMine = currentUserId !== null && c.authorId === currentUserId;
                return (
                    <div
                        key={c.id}
                        data-testid="comment-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(c.id)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onSelect(c.id);
                            }
                        }}
                        style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                            background: isActive ? 'var(--bg-elevated)' : 'var(--bg-body)',
                            cursor: 'pointer',
                            opacity: c.resolved ? 0.6 : 1,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <MessageSquare size={12} className="text-purple" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                {isMine ? t('attachments.comment_author_you') : t('attachments.comment_author_teacher')}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', lineHeight: 1.4, marginBottom: 6 }}>{c.text}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onResolve(c.id, !c.resolved);
                                }}
                            >
                                {c.resolved ? (
                                    <>
                                        <RotateCcw size={12} /> {t('attachments.comment_reopen')}
                                    </>
                                ) : (
                                    <>
                                        <Check size={12} /> {t('attachments.comment_resolve')}
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.72rem', padding: '2px 8px', color: 'var(--red)' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(c.id);
                                }}
                            >
                                <Trash2 size={12} /> {t('attachments.comment_delete')}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
