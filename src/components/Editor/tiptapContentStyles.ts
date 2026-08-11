/**
 * CSS for the `.essay-editor-content` class, shared by the live editor (`EssayEditor`) and the
 * read-only renderer (`RichContent`) so authored HTML looks identical in both places.
 *
 * Kept in its own module (not `tiptapExtensions.ts`) so the read-only `RichContent` can pull just
 * this string without dragging in the whole ~600KB TipTap extension stack.
 */
export const TIPTAP_CONTENT_STYLES = `
    .essay-editor-content { outline: none; }
    .essay-editor-content p { margin: 0 0 0.6em; line-height: 1.75; }
    .essay-editor-content h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; line-height: 1.25; }
    .essay-editor-content h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.35em; line-height: 1.3; }
    .essay-editor-content h3 { font-size: 1.1em; font-weight: 700; margin: 0.7em 0 0.3em; line-height: 1.35; }
    .essay-editor-content ul, .essay-editor-content ol { padding-left: 1.4em; margin: 0 0 0.6em; }
    .essay-editor-content li { margin-bottom: 0.2em; line-height: 1.7; }
    .essay-editor-content blockquote { border-left: 3px solid #6366f1; margin: 0.8em 0; padding: 0.4em 1em; color: #64748b; font-style: italic; }
    .essay-editor-content hr { border: none; border-top: 1.5px solid #e2e8f0; margin: 1.2em 0; }
    .essay-editor-content a { color: #6366f1; text-decoration: underline; }
    .essay-editor-content table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    /* A cell with a large font size (or a long unbroken word) can force the table
       wider than its column. Without this, that overflow spills out and is silently
       clipped by a rounded-corner container (overflow: hidden on the outer wrapper) —
       the content becomes invisible with no way to scroll to it. */
    .essay-editor-content .tableWrapper { overflow-x: auto; }
    .essay-editor-content th, .essay-editor-content td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; min-width: 60px; }
    .essay-editor-content th { background: #f8fafc; font-weight: 700; }
    .essay-editor-content .selectedCell { background: #e0e7ff; }
    .essay-editor-content ul[data-type="taskList"] { padding-left: 0.2em; list-style: none; }
    .essay-editor-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
    .essay-editor-content ul[data-type="taskList"] li > label { margin-top: 0.2em; flex-shrink: 0; cursor: pointer; }
    .essay-editor-content ul[data-type="taskList"] li > div { flex: 1; }
    .essay-editor-content .is-empty::before { content: attr(data-placeholder); color: var(--text-dim, #94a3b8); pointer-events: none; position: absolute; }
    .essay-editor-content img { max-width: 100%; height: auto; border-radius: 4px; }
    .essay-editor-content sup { font-size: 0.72em; vertical-align: super; }
    .essay-editor-content sub { font-size: 0.72em; vertical-align: sub; }
    .essay-editor-content .comment-highlight { background: rgba(99, 102, 241, 0.15); border-bottom: 2px solid rgba(99, 102, 241, 0.45); cursor: pointer; }
    .essay-editor-content .comment-highlight-active { background: rgba(99, 102, 241, 0.32); border-bottom-color: #6366f1; }
`;
