import type { CefrLevel, LiveWritingSessionStatus } from '../types';
import { profileText } from './cefrVocabularyProfiler';
import { countWords, htmlToPlainText } from './essayUtils';

/** Below this word count the vocabulary estimate is hidden rather than labelling a fragment. */
export const LIVE_WRITING_CEFR_MIN_WORDS = 25;

/** Deterministic, early vocabulary estimate; null until the text is long enough to say anything. */
export function liveWritingCefrEstimate(html: string, wordCount = countWords(html)): CefrLevel | null {
    if (wordCount < LIVE_WRITING_CEFR_MIN_WORDS) return null;
    return profileText(htmlToPlainText(html)).estimatedLevel;
}

export const LIVE_WRITING_STATUSES: LiveWritingSessionStatus[] = [
    'draft',
    'lobby',
    'writing',
    'voting',
    'finals',
    'closed',
];

/** Translation key for a session status pill. */
export function liveWritingStatusKey(status: LiveWritingSessionStatus): string {
    return `liveWriting.status_${status}`;
}

/** Normalise a typed code to `RM-XXXXXX`; the RPC accepts the shorthand too. */
export function normalizeJoinCode(input: string): string {
    const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.startsWith('RM') ? `RM-${cleaned.slice(2)}` : `RM-${cleaned}`;
}

export function isCompleteJoinCode(input: string): boolean {
    return /^RM-[0-9A-Z]{6}$/.test(normalizeJoinCode(input));
}

/** Absolute link to the public join page, keeping the current base path (self-hosted subpaths). */
export function liveWritingJoinLink(code: string): string {
    return `${window.location.href.split('#')[0]}#/join/${encodeURIComponent(code)}`;
}
