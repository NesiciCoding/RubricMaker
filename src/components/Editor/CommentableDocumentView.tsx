import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import EssayEditor from './EssayEditor';
import CommentSidebar from './CommentSidebar';
import { CommentHighlight } from './commentDecorations';
import { MarkCues } from './markCues';
import ProofRail from './ProofRail';
import ProofMarkList from './ProofMarkList';
import { useProofRail } from './useProofRail';
import { resolveMarkRange, shouldUseCompactRail } from '../../utils/proofRail';
import type { DocumentMark } from '../../types';
import { useAssessment, usePlatform } from '../../context/AppContext';

interface CommentableDocumentViewProps {
    content: string;
    attachmentId: string;
    /** Override for the marks to draw; stored marks for this attachment are used when omitted. */
    marks?: readonly DocumentMark[];
}

const noop = () => {};
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
    marks: propMarks,
}: CommentableDocumentViewProps) {
    const { t } = useTranslation();
    const { documentComments, documentMarks, addDocumentComment, resolveDocumentComment, deleteDocumentComment } =
        useAssessment();
    const { getCurrentDatabaseUserId } = usePlatform();

    const [editor, setEditor] = useState<Editor | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [shell, setShell] = useState<HTMLDivElement | null>(null);
    const [activeLine, setActiveLine] = useState<number | null>(null);
    // `null` until the editor reports, so the first render never guesses against a page-mode essay.
    const [pageMode, setPageMode] = useState<boolean | null>(null);

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

    // Stored marks are the normal source (PM-03); the prop stays for previews and tests. A caller
    // that passes marks may pass any attachment's, so the filter applies to both paths.
    const marks = useMemo(
        () => (propMarks ?? documentMarks).filter((mark) => mark.attachmentId === attachmentId),
        [propMarks, documentMarks, attachmentId]
    );

    const onCommentClick = useCallback((id: string) => setActiveCommentId(id), []);
    const extraExtensions = useMemo(() => [CommentHighlight.configure({ onCommentClick }), MarkCues], [onCommentClick]);

    const { rows, box, dir } = useProofRail({ editor, pageElement: shell, marks });

    // The panel shows the words a mark is on. Read them from the document rather than storing
    // them on the mark: the essay stays the single source of truth and no snippet is duplicated.
    const snippetFor = useCallback(
        (mark: DocumentMark) => {
            if (!editor) return null;
            const range = resolveMarkRange(editor.state.doc, mark);
            return range ? editor.state.doc.textBetween(range.from, range.to, ' ', ' ') : null;
        },
        [editor]
    );
    const activeMarkIds = useMemo(() => rows.find((row) => row.line === activeLine)?.ids ?? NO_IDS, [rows, activeLine]);

    // The rail needs the page's margin. When the page is too narrow, or the teacher switched to the
    // compact view, the same rows are listed below the text instead of pushed off to the side.
    const compact = shouldUseCompactRail({ width: box.width, pageMode, hasMarks: rows.length > 0 });

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

    return (
        <div ref={setContainer} style={{ position: 'relative' }}>
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
                // The rail lives in the page's 96 px right padding, so marked documents open on the
                // A4 sheet. Comment-only documents keep the compact flow they have always had.
                defaultPageMode={marks.length > 0}
                allowPageMode={marks.length > 0}
                extraExtensions={extraExtensions}
                onPageModeChange={setPageMode}
                onEditorReady={setEditor}
            />
            {compact && (
                <ProofMarkList
                    rows={rows}
                    dir={dir}
                    activeLine={activeLine}
                    onSelectLine={setActiveLine}
                    snippetFor={snippetFor}
                />
            )}
            {/* Paper gets every mark, whether or not the screen is showing the rail or the list. */}
            {rows.length > 0 && (
                <ProofMarkList
                    rows={rows}
                    variant="print"
                    dir={dir}
                    activeLine={activeLine}
                    onSelectLine={setActiveLine}
                    snippetFor={snippetFor}
                />
            )}
            {!compact && rows.length > 0 && (
                <ProofRail
                    rows={rows}
                    box={box}
                    dir={dir}
                    activeLine={activeLine}
                    onSelectLine={setActiveLine}
                    snippetFor={snippetFor}
                />
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
