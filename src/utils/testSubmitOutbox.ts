import type { TestAnswer, ProctorEvent, StaircaseStep } from '../types';

// A durable per-device queue of test hand-ins that failed to reach the server (offline,
// a server-side/container blip, a dropped connection). The submit is retried in-page and
// on the next load of the same test link — the anonymous student session is persisted in
// localStorage (rm_student_test_auth), so a retry keeps the same auth identity the
// generator-run guard (submit-test: session.student_user_id === user.id) requires. The
// stored `id` (submissionId) is reused on every retry, so the unique-per-assignment index
// turns a duplicate into a harmless 409 "already submitted" rather than a second row.

const KEY = 'rm_test_submit_outbox';

export interface OutboxSubmission {
    id: string;
    assignmentId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    answers: TestAnswer[];
    startedAt: string;
    submittedAt: string;
    events?: ProctorEvent[];
    sectionPath?: string[];
    levelPath?: StaircaseStep[];
    queuedAt: string;
}

function readAll(): OutboxSubmission[] {
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as OutboxSubmission[]) : [];
    } catch {
        return [];
    }
}

function writeAll(items: OutboxSubmission[]): void {
    try {
        if (items.length === 0) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
        /* storage full/unavailable — the in-page retry still covers the current attempt */
    }
}

export function enqueueSubmission(sub: OutboxSubmission): void {
    writeAll([...readAll().filter((s) => s.id !== sub.id), sub]);
}

export function removeSubmission(id: string): void {
    writeAll(readAll().filter((s) => s.id !== id));
}

/** Queued submissions for a given Supabase project (a device usually has just one). */
export function pendingSubmissions(supabaseUrl: string): OutboxSubmission[] {
    return readAll().filter((s) => s.supabaseUrl === supabaseUrl);
}

// The server returns this exact message (HTTP 409) when the assignment already has a
// submission — which, for a retry reusing the same submissionId, means a PRIOR attempt
// actually landed. Treat it as success so the item leaves the queue.
const ALREADY_SUBMITTED = 'already submitted';

export function isAlreadySubmitted(error: string | undefined): boolean {
    return !!error && error.toLowerCase().includes(ALREADY_SUBMITTED);
}
