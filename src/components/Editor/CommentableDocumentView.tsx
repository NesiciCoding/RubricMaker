import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import EssayEditor from './EssayEditor';
import CommentSidebar from './CommentSidebar';
import { CommentHighlight } from './commentDecorations';
import { MarkCues } from './markCues';
import ProofRail from './ProofRail';
import { useProofRail } from './useProofRail';
import ProofMarkPalette from './ProofMarkPalette';
import type { DocumentMark } from '../../types';
import type { ProofMarkId } from '../../data/proofMarks';
import { draftProofMark } from '../../utils/proofMarkDraft';
import { useAssessment, usePlatform } from '../../context/AppContext';

interface CommentableDocumentViewProps {
    content: string;
    attachmentId: string;
    /** Proofreading marks to draw on this document; empty until the persistence layer supplies them. */
    marks?: readonly DocumentMark[];
    /**
     * Stores a mark the palette created. Without it the surface has nowhere to write a mark, so the
     * palette is not offered rather than offering a control that silently does nothing.
     */
    onCreateMark?: (mark: Omit<DocumentMark, 'id' | 'createdAt'>) => void;
}

const noop = () => {};
const NO_MARKS: readonly DocumentMark[] = [];
const NO_IDS: string[] = [];

/**
 * Read-only, paginated document view (essay HTML or Mammoth-converted DOCX HTML) with
 * inline anchored comments layered on top via a view-only ProseMirror decoration plugin
 * (see commentDecorations.ts) — comments never touch the document's own schema/HTML.
 * Only used from AttachmentViewer's grading-side (commentable) views.
 */
export default function CommentableDocumentView({
    content,
    attachmentId,
    marks: allMarks = NO_MARKS,
    onCreateMark,
}: CommentableDocumentViewProps) {
    const { t } = useTranslation();
    const { documentComments, addDocumentComment, resolveDocumentComment, deleteDocumentComment } = useAssessment();
    const { getCurrentDatabaseUserId } = usePlatform();

    const [editor, setEditor] = useState<Editor | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [shell, setShell] = useState<HTMLDivElement | null>(null);
    const [activeLine, setActiveLine] = useState<number | null>(null);

    // A callback ref, not `containerRef.current`: the rail hook needs the element itself, and refs
    // are not a render input, so reading `.current` would leave the first render measuring nothing.
    const setContainer = useCallback((node: HTMLDivElement | null) => {
        containerRef.current = node;
        setShell(node);
    }, []);

    const currentUserId = useMemo(() => getCurrentDatabaseUserId() ?? 'local', [getCurrentDatabaseUserId]);
    const comments = useMemo(
        () => documentComments.filter((c) => c.attachmentId === attachmentId),
        [documentComments, attachmentId]
    );

    const marks = useMemo(
        () => allMarks.filter((mark) => mark.attachmentId === attachmentId),
        [allMarks, attachmentId]
    );

    const onCommentClick = useCallback((id: string) => setActiveCommentId(id), []);
    const extraExtensions = useMemo(() => [CommentHighlight.configure({ onCommentClick }), MarkCues], [onCommentClick]);

    const { rows, box, dir } = useProofRail({ editor, pageElement: shell, marks });
    const activeMarkIds = useMemo(() => rows.find((row) => row.line === activeLine)?.ids ?? NO_IDS, [rows, activeLine]);

    useEffect(() => {
        setActiveLine(null);
    }, [attachmentId]);

    useEffect(() => {
        if (editor) editor.commands.setDocumentComments(comments);
    }, [editor, comments]);

    useEffect(() => {
        if (editor) editor.commands.setActiveDocumentComment(activeCommentId);
    }, [editor, activeCommentId]);

    useEffect(() => {
        if (editor) editor.commands.setDocumentMarks([...marks]);
    }, [editor, marks]);

    useEffect(() => {
        if (editor) editor.commands.setActiveDocumentMarks(activeMarkIds);
    }, [editor, activeMarkIds]);

    const scrollToComment = useCallback((id: string) => {
        setActiveCommentId(id);
        const el = containerRef.current?.querySelector(`[data-comment-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    const handleAddComment = useCallback(() => {
        /* v8 ignore next -- editor is always initialized before the menu can render */
        if (!editor) return;
        const { from, to } = editor.state.selection;
        /* v8 ignore next -- the bubble menu only shows for a non-empty selection */
        if (from === to) return;
        const text = window.prompt(t('attachments.comment_prompt'));
        if (!text || !text.trim()) return;
        addDocumentComment({ attachmentId, authorId: currentUserId, text: text.trim(), anchor: { from, to } });
    }, [editor, attachmentId, currentUserId, addDocumentComment, t]);

    const handlePlaceMark = useCallback(
        (symbolId: ProofMarkId) => {
            /* v8 ignore next -- the palette only renders once the editor is ready */
            if (!editor || !onCreateMark) return;
            const { from, to } = editor.state.selection;
            const draft = draftProofMark({
                attachmentId,
                authorId: currentUserId,
                symbolId,
                selection: { from, to },
                text: editor.state.doc.textBetween(from, to, ' ', ' '),
            });
            if (draft.ok) onCreateMark(draft.mark);
        },
        [editor, onCreateMark, attachmentId, currentUserId]
    );

    return (
        <div ref={setContainer} style={{ position: 'relative' }}>
            {editor && (
                <BubbleMenu editor={editor} shouldShow={({ state }) => !state.selection.empty}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div>
                            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddComment}>
                                {t('attachments.comment_add')}
                            </button>
                        </div>
                        {onCreateMark && <ProofMarkPalette onPlaceMark={handlePlaceMark} />}
                    </div>
                </BubbleMenu>
            )}
            <EssayEditor
                content={content}
                onChange={noop}
                editable={false}
                // The rail lives in the page's 96 px right padding, so marked documents open on the
                // A4 sheet. Comment-only documents keep the compact flow they have always had.
                defaultPageMode={marks.length > 0}
                allowPageMode={marks.length > 0}
                extraExtensions={extraExtensions}
                onEditorReady={setEditor}
            />
            {rows.length > 0 && (
                <ProofRail rows={rows} box={box} dir={dir} activeLine={activeLine} onSelectLine={setActiveLine} />
            )}
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
