import type { VocabularyItem, DetectedItem } from '../types';

const CONTEXT_RADIUS = 60;

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractContext(text: string, matchIndex: number, matchLength: number): string {
    const start = Math.max(0, matchIndex - CONTEXT_RADIUS);
    const end = Math.min(text.length, matchIndex + matchLength + CONTEXT_RADIUS);
    let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) snippet = '…' + snippet;
    if (end < text.length) snippet = snippet + '…';
    return snippet;
}

export function analyseVocabulary(text: string, items: VocabularyItem[]): DetectedItem[] {
    return items.map(item => {
        const pattern = new RegExp(`\\b${escapeRegex(item.phrase)}\\b`, 'gi');
        const contexts: string[] = [];
        let match: RegExpExecArray | null;
        let occurrences = 0;

        while ((match = pattern.exec(text)) !== null) {
            occurrences++;
            if (contexts.length < 5) {
                contexts.push(extractContext(text, match.index, match[0].length));
            }
        }

        return {
            vocabularyItemId: item.id,
            found: occurrences > 0,
            occurrences,
            contexts,
        };
    });
}
