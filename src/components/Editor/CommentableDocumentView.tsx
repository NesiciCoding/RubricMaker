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
import ProofMarkEditor from './ProofMarkEditor';
import UnanchoredMarks from './UnanchoredMarks';
import { useEditorSelection } from './useEditorSelection';
import { useMarkMutations } from './useMarkMutations';
import { useMarkSuggestions } from './useMarkSuggestions';
import type { DocumentMark } from '../../types';
import type { ProofMarkId } from '../../data/proofMarks';
import { draftProofMark } from '../../utils/proofMarkDraft';
import { isFormattingMark } from '../../utils/markOperations';
import { markAnchorState } from '../../utils/proofRail';
import { remapCommentAnchors, remapMarkAnchors, type AnchorMapping } from '../../utils/documentAnchorMapping';
import { useAssessment, usePlatform } from '../../context/AppContext';

interface CommentableDocumentViewProps {
    content: string;
    attachmentId: string;
    /** Override for the marks to draw; stored marks for this attachment are used when omitted. */
    marks?: readonly DocumentMark[];
    /**
     * Stores a mark the palette created — the grading attachment view passes the store's
     * `addDocumentMark`. Without it the surface has nowhere to write a mark, so the palette is not
     * offered rather than offering a control that silently does nothing.
     */
    onCreateMark?: (mark: Omit<DocumentMark, 'id' | 'createdAt'>) => void;
    /**
     * Writes the corrected document HTML back through whatever owns the document. This view is
     * read-only and owns nothing, so the accept controls appear only when a caller can persist the
     * result. The writer runs on every document change, including undo and redo, and mark/comment
     * anchors are moved through the same mapping afterwards.
     */
    onApplyContent?: (html: string) => void;
}

const noop = () => {};
const NO_IDS: string[] = [];
const NO_MARKS: DocumentMark[] = [];

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
    onCreateMark,
    onApplyContent,
}: CommentableDocumentViewProps) {
    const { t } = useTranslation();
    const {
        documentComments,
        documentMarks,
        addDocumentComment,
        resolveDocumentComment,
        deleteDocumentComment,
        remapDocumentAnchors,
    } = useAssessment();
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

    // Stored marks are the normal source (PM-03); the prop stays for previews and tests. A caller
    // that passes marks may pass any attachment's, so the filter applies to both paths.
    const marks = useMemo(
        () => (propMarks ?? documentMarks).filter((mark) => mark.attachmentId === attachmentId),
        [propMarks, documentMarks, attachmentId]
    );

    // Only the marks whose stored anchor still matches this document are drawn; the rest are
    // listed instead, because a chip on the wrong words is worse than a mark that says so.
    const { anchoredMarks, unanchoredMarks } = useMemo(() => {
        const doc = editor?.state.doc;
        if (!doc) return { anchoredMarks: marks, unanchoredMarks: NO_MARKS };
        const anchored: DocumentMark[] = [];
        const unanchored: DocumentMark[] = [];
        for (const mark of marks) {
            if (markAnchorState(doc, mark) === 'anchored') anchored.push(mark);
            else unanchored.push(mark);
        }
        return { anchoredMarks: anchored, unanchoredMarks: unanchored };
    }, [editor, marks]);

    const onCommentClick = useCallback((id: string) => setActiveCommentId(id), []);
    const extraExtensions = useMemo(() => [CommentHighlight.configure({ onCommentClick }), MarkCues], [onCommentClick]);

    const { rows, box, dir } = useProofRail({ editor, pageElement: shell, marks: anchoredMarks });
    const activeMarkIds = useMemo(() => rows.find((row) => row.line === activeLine)?.ids ?? NO_IDS, [rows, activeLine]);
    const activeMarks = useMemo(
        () => rows.find((row) => row.line === activeLine)?.marks ?? NO_MARKS,
        [rows, activeLine]
    );
    const markMutations = useMarkMutations();
    const suggestions = useMarkSuggestions(editor, activeMarks);
    const moveTarget = useEditorSelection(editor);
    const formattingMarks = useMemo(() => anchoredMarks.filter(isFormattingMark), [anchoredMarks]);

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
        if (editor) editor.commands.setDocumentMarks([...anchoredMarks]);
    }, [editor, anchoredMarks]);

    useEffect(() => {
        if (editor) editor.commands.setActiveDocumentMarks(activeMarkIds);
    }, [editor, activeMarkIds]);

    const latestMarks = useRef(marks);
    const latestComments = useRef(comments);
    const pendingMappings = useRef<AnchorMapping[]>([]);
    const pendingHtml = useRef<string | null>(null);
    const flushScheduled = useRef(false);
    const mounted = useRef(true);

    useEffect(() => {
        latestMarks.current = marks;
    }, [marks]);

    useEffect(() => {
        latestComments.current = comments;
    }, [comments]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Correction changes and the editor's own undo/redo all arrive as document transactions. Batch
    // the synchronous burst (a batch accept dispatches several) into one save, then move the
    // sidecar anchors through the same mappings. HTML is written before the anchors: a failed
    // anchor write leaves a mark unanchored, never pointing at other words.
    const scheduleSave = useCallback(
        (html: string) => {
            pendingHtml.current = html;
            if (flushScheduled.current) return;
            flushScheduled.current = true;
            queueMicrotask(() => {
                flushScheduled.current = false;
                const htmlToSave = pendingHtml.current;
                const mappings = pendingMappings.current;
                pendingHtml.current = null;
                pendingMappings.current = [];
                if (!mounted.current) return;
                if (htmlToSave !== null) onApplyContent?.(htmlToSave);
                if (mappings.length === 0) return;
                remapDocumentAnchors(
                    attachmentId,
                    remapMarkAnchors(latestMarks.current, mappings),
                    remapCommentAnchors(latestComments.current, mappings)
                );
            });
        },
        [attachmentId, onApplyContent, remapDocumentAnchors]
    );

    useEffect(() => {
        if (!editor || !onApplyContent) return;
        const recordMapping = ({ transaction }: { transaction: { docChanged: boolean; mapping: AnchorMapping } }) => {
            if (transaction.docChanged) pendingMappings.current.push(transaction.mapping);
        };
        editor.on('transaction', recordMapping);
        return () => {
            editor.off('transaction', recordMapping);
        };
    }, [editor, onApplyContent]);

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

    const handleMoveMark = useCallback(
        (mark: DocumentMark) => {
            /* v8 ignore next -- the editor exists whenever the rail has marks */
            if (!editor || !moveTarget) return;
            markMutations.move(
                mark,
                moveTarget,
                editor.state.doc.textBetween(moveTarget.from, moveTarget.to, ' ', ' ')
            );
        },
        [editor, markMutations, moveTarget]
    );

    const handleAcceptMark = useCallback(
        (mark: DocumentMark) => {
            if (!editor) return;
            markMutations.accept(editor, mark);
        },
        [editor, markMutations]
    );

    const handleAcceptAllFormatting = useCallback(() => {
        if (!editor) return;
        markMutations.acceptAllFormatting(editor, formattingMarks);
    }, [editor, formattingMarks, markMutations]);

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
                onChange={onApplyContent ? scheduleSave : noop}
                editable={false}
                // The rail lives in the page's 96 px right padding, so marked documents open on the
                // A4 sheet. Comment-only documents keep the compact flow they have always had.
                defaultPageMode={anchoredMarks.length > 0}
                allowPageMode={anchoredMarks.length > 0}
                extraExtensions={extraExtensions}
                onEditorReady={setEditor}
            />
            {rows.length > 0 && (
                <ProofRail rows={rows} box={box} dir={dir} activeLine={activeLine} onSelectLine={setActiveLine} />
            )}
            {unanchoredMarks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <UnanchoredMarks
                        marks={unanchoredMarks}
                        selection={moveTarget}
                        onReanchor={handleMoveMark}
                        onDelete={markMutations.remove}
                        dir={dir}
                    />
                </div>
            )}
            {activeMarks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                    <ProofMarkEditor
                        marks={activeMarks}
                        selection={moveTarget}
                        canUndo={markMutations.canUndo}
                        onEdit={markMutations.update}
                        onMove={handleMoveMark}
                        onDelete={markMutations.remove}
                        onAccept={onApplyContent ? handleAcceptMark : undefined}
                        onPropose={markMutations.propose}
                        onReject={markMutations.reject}
                        onAcceptAllFormatting={onApplyContent ? handleAcceptAllFormatting : undefined}
                        suggestions={suggestions}
                        formattingMarkCount={formattingMarks.length}
                        onUndo={markMutations.undo}
                        onDismiss={() => setActiveLine(null)}
                        dir={dir}
                    />
                </div>
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
