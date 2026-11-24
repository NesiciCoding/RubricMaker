import RichContent from '../Editor/RichContent';
import { promptToHtml } from '../../utils/exportDataPrep';

/**
 * A hint or explanation. Notes written before they were rich text are plain strings with line breaks, so
 * those are turned into paragraphs here; anything already containing markup is rendered (sanitised) as is.
 */
export default function RichNote({ text, lang }: { text: string; lang?: string }) {
    return <RichContent html={promptToHtml(text)} lang={lang} />;
}
