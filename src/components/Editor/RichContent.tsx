import DOMPurify from 'dompurify';
import { TIPTAP_CONTENT_STYLES } from './tiptapExtensions';

interface Props {
    html: string;
    className?: string;
}

/** Read-only render of TipTap-authored HTML (question prompts, section passages). */
export default function RichContent({ html, className }: Props) {
    return (
        <>
            <div
                className={className ? `essay-editor-content ${className}` : 'essay-editor-content'}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
            />
            {/* ponytail: re-emits identical <style> per instance rather than a single global
                stylesheet import; harmless (browsers dedupe identical rule sets), revisit if a
                page renders dozens of instances and profiling shows it matters. */}
            <style>{TIPTAP_CONTENT_STYLES}</style>
        </>
    );
}
