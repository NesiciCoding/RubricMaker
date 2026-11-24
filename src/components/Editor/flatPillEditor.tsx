import type { ReactNode } from 'react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Doc / paragraph / text / history only. The cloze, hot-text and error-correction editors store a flat
 * string with inline markers ({{gap}}, [[fragment]]) that the parsers in testScoring.ts read unchanged,
 * so no bold, lists, headings or other structure may be produced here.
 */
export const FLAT_PILL_STARTER_KIT = StarterKit.configure({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    heading: false,
    horizontalRule: false,
    hardBreak: false,
    link: false,
    underline: false,
    dropcursor: false,
    gapcursor: false,
    trailingNode: false,
});

interface FrameProps {
    toolbar: ReactNode;
    children: ReactNode;
    /** Rendered under the editor, e.g. a validation message. */
    footer?: ReactNode;
    /** Editor-specific pill and popover styles. */
    css: string;
}

/** The bordered box shared by the pill editors: a toolbar row, the editor, an optional footer, and its CSS. */
export function FlatPillEditorFrame({ toolbar, children, footer, css }: FrameProps) {
    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                }}
            >
                {toolbar}
            </div>
            <div style={{ padding: '8px 10px' }}>{children}</div>
            {footer}
            <style>{css}</style>
        </div>
    );
}
