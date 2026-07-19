import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import EssayEditor from './EssayEditor';
import CommentSidebar from './CommentSidebar';
import { CommentHighlight } from './commentDecorations';
import { useApp } from '../../context/AppContext';

interface CommentableDocumentViewProps {
    content: string;
    attachmentId: string;
}

const noop = () => {};

/**
 * Read-only, paginated document view (essay HTML or Mammoth-converted DOCX HTML) with
 * inline anchored comments layered on top via a view-only ProseMirror decoration plugin
 * (see commentDecorations.ts) — comments never touch the document's own schema/HTML.
 * Only used from AttachmentViewer's grading-side (commentable) views.
 */
export default function CommentableDocumentView({ content, attachmentId }: CommentableDocumentViewProps) {
    const { t } = useTranslation();
    const {
        documentComments,
        addDocumentComment,
        resolveDocumentComment,
        deleteDocumentComment,
        getCurrentDatabaseUserId,
    } = useApp();
    const [editor, setEditor] = useState<Editor | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentUserId = useMemo(() => getCurrentDatabaseUserId() ?? 'local', [getCurrentDatabaseUserId]);
    const comments = useMemo(
        () => documentComments.filter((c) => c.attachmentId === attachmentId),
        [documentComments, attachmentId]
    );

    const onCommentClick = useCallback((id: string) => setActiveCommentId(id), []);
    const extraExtensions = useMemo(() => [CommentHighlight.configure({ onCommentClick })], [onCommentClick]);

    useEffect(() => {
        if (editor) editor.commands.setDocumentComments(comments);
    }, [editor, comments]);

    useEffect(() => {
        if (editor) editor.commands.setActiveDocumentComment(activeCommentId);
    }, [editor, activeCommentId]);

    const scrollToComment = useCallback((id: string) => {
        setActiveCommentId(id);
        const el = containerRef.current?.querySelector(`[data-comment-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    const handleAddComment = useCallback(() => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const text = window.prompt(t('attachments.comment_prompt'));
        if (!text || !text.trim()) return;
        addDocumentComment({ attachmentId, authorId: currentUserId, text: text.trim(), anchor: { from, to } });
    }, [editor, attachmentId, currentUserId, addDocumentComment, t]);

    return (
        <div ref={containerRef}>
            {editor && (
                <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleAddComment}>
                        {t('attachments.comment_add')}
                    </button>
                </BubbleMenu>
            )}
            <EssayEditor
                content={content}
                onChange={noop}
                editable={false}
                defaultPageMode
                allowPageMode={false}
                extraExtensions={extraExtensions}
                onEditorReady={setEditor}
            />
            <div style={{ marginTop: 10 }}>
                <CommentSidebar
                    comments={comments}
                    activeCommentId={activeCommentId}
                    currentUserId={currentUserId}
                    onSelect={scrollToComment}
                    onResolve={resolveDocumentComment}
                    onDelete={deleteDocumentComment}
                />
            </div>
        </div>
    );
}
