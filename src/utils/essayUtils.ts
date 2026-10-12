/** Strip tags, decode common HTML entities and collapse whitespace. */
export function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&(?!amp;)[a-z]+;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Count words in an HTML string. */
export function countWords(html: string): number {
    const text = htmlToPlainText(html);
    if (!text) return 0;
    return text.split(' ').filter((w) => w.length > 0).length;
}

export interface EssayConfigInput {
    title?: string;
    minWords: string;
    maxWords: string;
    timeLimitMinutes: string;
}

/** i18n key of the first problem per field; a field with no entry is valid. */
export type EssayConfigErrors = Partial<Record<'title' | 'minWords' | 'maxWords' | 'timeLimitMinutes', string>>;

const isPositiveWholeNumber = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0;

/** Word limits and the time limit are optional, but when given they must be positive whole numbers with min <= max. */
export function validateEssayConfig({
    title,
    minWords,
    maxWords,
    timeLimitMinutes,
}: EssayConfigInput): EssayConfigErrors {
    const errors: EssayConfigErrors = {};
    if (title !== undefined && !title.trim()) errors.title = 'essays.error_title_required';
    if (minWords.trim() && !isPositiveWholeNumber(minWords)) errors.minWords = 'essays.error_positive_whole_number';
    if (maxWords.trim() && !isPositiveWholeNumber(maxWords)) errors.maxWords = 'essays.error_positive_whole_number';
    if (timeLimitMinutes.trim() && !isPositiveWholeNumber(timeLimitMinutes)) {
        errors.timeLimitMinutes = 'essays.error_positive_whole_number';
    }
    if (
        !errors.minWords &&
        !errors.maxWords &&
        minWords.trim() &&
        maxWords.trim() &&
        Number(minWords) > Number(maxWords)
    ) {
        errors.maxWords = 'essays.error_min_exceeds_max';
    }
    return errors;
}
