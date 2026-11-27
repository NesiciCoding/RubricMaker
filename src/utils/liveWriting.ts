import type { CefrLevel, LiveWritingFocus, LiveWritingSelfRating, LiveWritingSessionStatus } from '../types';
import { profileText } from './cefrVocabularyProfiler';
import { countWords, htmlToPlainText } from './essayUtils';

/** Below this word count the vocabulary estimate is hidden rather than labelling a fragment. */
export const LIVE_WRITING_CEFR_MIN_WORDS = 25;

/** Deterministic, early vocabulary estimate; null until the text is long enough to say anything. */
export function liveWritingCefrEstimate(html: string, wordCount = countWords(html)): CefrLevel | null {
    if (wordCount < LIVE_WRITING_CEFR_MIN_WORDS) return null;
    return profileText(htmlToPlainText(html)).estimatedLevel;
}

export const LIVE_WRITING_SELF_RATINGS: LiveWritingSelfRating[] = ['happy', 'neutral', 'unhappy'];

/** The first-class writing-focus tags a shared prompt carries (Phase 43.7). */
export const LIVE_WRITING_FOCUS: LiveWritingFocus[] = [
    'narrative',
    'argumentative',
    'descriptive',
    'expository',
    'reflective',
    'language_practice',
];

/** Translation key for a writing-focus tag. */
export function liveWritingFocusKey(focus: LiveWritingFocus): string {
    return `liveWriting.focus_${focus}`;
}

/** Language tags offered when sharing a live prompt; stored as a first-class column value. */
export const LIVE_PROMPT_LANGUAGES = ['English', 'Dutch', 'French', 'German', 'Spanish'];

/** Translation key for the student's three-option self-check. */
export function liveWritingSelfRatingKey(rating: LiveWritingSelfRating): string {
    return `liveWriting.student_selfcheck_${rating}`;
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

/** A participant token kept per tab, so a reload resumes the same live-writing row. */
export interface StoredLiveWritingJoin {
    participantId: string;
    joinToken: string;
}

const LIVE_WRITING_JOIN_STORAGE_PREFIX = 'rm_live_write_join:';

/** Per-code, per-tab storage key for a joined participant. */
export function liveWritingJoinStorageKey(code: string): string {
    return `${LIVE_WRITING_JOIN_STORAGE_PREFIX}${normalizeJoinCode(code)}`;
}

export function readStoredLiveWritingJoin(code: string): StoredLiveWritingJoin | null {
    if (!isCompleteJoinCode(code)) return null;
    try {
        const raw = sessionStorage.getItem(liveWritingJoinStorageKey(code));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StoredLiveWritingJoin>;
        if (typeof parsed.participantId === 'string' && typeof parsed.joinToken === 'string') {
            return { participantId: parsed.participantId, joinToken: parsed.joinToken };
        }
    } catch {
        // Private browsing or a corrupt value: fall back to the name picker.
    }
    return null;
}

export function writeStoredLiveWritingJoin(code: string, join: StoredLiveWritingJoin): void {
    try {
        sessionStorage.setItem(liveWritingJoinStorageKey(code), JSON.stringify(join));
    } catch {
        // The session still works; only reload-resume is unavailable.
    }
}

export function clearStoredLiveWritingJoin(code: string): void {
    try {
        sessionStorage.removeItem(liveWritingJoinStorageKey(code));
    } catch {
        // Nothing to clear when storage is unavailable.
    }
}

/** Supabase rejects with PostgrestError objects as well as Errors; read the marker from either. */
function joinErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object') {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string') return message;
    }
    return '';
}

/** Translation key for a rejected join; shared by the public picker and the portal entry. */
export function liveWritingJoinErrorKey(error: unknown): string {
    const message = joinErrorMessage(error);
    if (message.includes('too_many_attempts')) return 'liveWriting.too_many_attempts';
    if (message.includes('student_not_in_class')) return 'liveWriting.student_not_in_class';
    if (message.includes('portal_join_disabled')) return 'liveWriting.portal_join_disabled';
    if (message.includes('not_authenticated')) return 'liveWriting.portal_join_signed_out';
    if (message.includes('invalid_code')) return 'liveWriting.invalid_code';
    return 'liveWriting.join_failed';
}

/**
 * Translation key for a failed roster lookup. Only a live code resolves a roster, so anything we
 * do not recognise means the code did not resolve — not that joining itself failed.
 */
export function liveWritingLookupErrorKey(error: unknown): string {
    const key = liveWritingJoinErrorKey(error);
    return key === 'liveWriting.join_failed' ? 'liveWriting.invalid_code' : key;
}
