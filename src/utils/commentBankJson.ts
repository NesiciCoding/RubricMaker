import type { CommentBankItem } from '../types';

export interface ParsedCommentBankItem {
    text: string;
    tags: string[];
}

/** Caps one import so a mis-exported file can't flood the bank in a single dispatch loop. */
const MAX_ITEMS = 500;

export function exportCommentBankJson(items: CommentBankItem[]): string {
    return JSON.stringify({ items: items.map(({ text, tags }) => ({ text, tags })) }, null, 2);
}

function stringTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean);
}

/**
 * Accepts either the `{ items: [...] }` shape this module writes or a bare array, so a
 * hand-edited file still imports. Entries without a usable `text` are skipped rather than
 * failing the whole file.
 */
export function parseCommentBankJson(raw: string): ParsedCommentBankItem[] {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown } | null)?.items;
    if (!Array.isArray(list)) throw new Error('Invalid comment bank file: expected an items array');

    const items: ParsedCommentBankItem[] = [];
    for (const entry of list) {
        if (!entry || typeof entry !== 'object') continue;
        const { text, tags } = entry as { text?: unknown; tags?: unknown };
        if (typeof text !== 'string' || !text.trim()) continue;
        items.push({ text: text.trim(), tags: stringTags(tags) });
        if (items.length >= MAX_ITEMS) break;
    }
    return items;
}
