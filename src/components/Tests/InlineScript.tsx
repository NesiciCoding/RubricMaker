import { parseInlineScript } from '../../utils/inlineScript';

/** Option / item text with `_{sub}` and `^{sup}` shown as real subscript and superscript. */
export default function InlineScript({ text }: { text: string }) {
    const parts = parseInlineScript(text);
    if (parts.length === 1 && parts[0].kind === 'text') return <>{text}</>;
    return (
        <>
            {parts.map((part, i) =>
                part.kind === 'sub' ? (
                    <sub key={i}>{part.text}</sub>
                ) : part.kind === 'sup' ? (
                    <sup key={i}>{part.text}</sup>
                ) : (
                    <span key={i}>{part.text}</span>
                )
            )}
        </>
    );
}
