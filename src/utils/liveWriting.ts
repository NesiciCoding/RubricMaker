import type { LiveWritingSessionStatus } from '../types';

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
