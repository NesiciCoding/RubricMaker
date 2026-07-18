/**
 * TestAdapter — lightweight student-facing Supabase client for the test share-link flow.
 *
 * Created from the credentials embedded in the TestAssignmentPayload URL, so it runs
 * entirely outside AppProvider and the teacher's StorageSync session. One instance
 * per test page load; not a singleton.
 *
 * Simpler than EssayAdapter: a test assignment link is already minted 1:1 per
 * student (test_assignments has one row per student), so there's no shared-link
 * identity to disambiguate and no email gate — just a silent anonymous sign-in.
 * Uses an isolated storageKey so it can never collide with the essay flow's
 * rm_student_auth session.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProctorEvent, TestAnswer, TestAssignmentContent, StaircaseStep } from '../../types';
import type { SyncResult } from './types';

export type FetchTestContentResult =
    | { ok: true; data: TestAssignmentContent }
    | { ok: false; reason: 'unauthenticated' | 'not_found' | 'expired' | 'network' | 'invalid_response' };

const REQUEST_TIMEOUT_MS = 15_000;

/** Narrows an edge-function response body before it's trusted as TestAssignmentContent. */
function isTestAssignmentContent(data: unknown): data is TestAssignmentContent {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
        typeof d.testId === 'string' &&
        typeof d.studentId === 'string' &&
        !!d.test &&
        typeof d.test === 'object' &&
        Array.isArray((d.test as Record<string, unknown>).questions)
    );
}

export class TestAdapter {
    private client: SupabaseClient;
    private supabaseUrl: string;
    private supabaseAnonKey: string;

    constructor(supabaseUrl: string, supabaseAnonKey: string) {
        this.supabaseUrl = supabaseUrl;
        this.supabaseAnonKey = supabaseAnonKey;
        this.client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rm_student_test_auth' },
        });
    }

    /** fetch() with a hard timeout — a stalled edge-function connection must not leave the student stuck indefinitely, especially mid-timed-exam. */
    private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    /** The client used for auth/queries — for diagnostics (e.g. clientLogger). */
    getClient(): SupabaseClient {
        return this.client;
    }

    /** Reuses an existing session if present; otherwise signs in anonymously. */
    async ensureSession(): Promise<{ ok: boolean; error?: string }> {
        const {
            data: { session },
        } = await this.client.auth.getSession();
        if (session) return { ok: true };
        const { error } = await this.client.auth.signInAnonymously();
        return error ? { ok: false, error: error.message } : { ok: true };
    }

    /** Fetch full test content from the get-test-assignment edge function. */
    async fetchAssignmentContent(assignmentId: string): Promise<FetchTestContentResult> {
        const {
            data: { session },
        } = await this.client.auth.getSession();
        if (!session) return { ok: false, reason: 'unauthenticated' };

        let response: Response;
        try {
            response = await this.fetchWithTimeout(`${this.supabaseUrl}/functions/v1/get-test-assignment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: this.supabaseAnonKey,
                },
                body: JSON.stringify({ assignmentId }),
            });
        } catch {
            return { ok: false, reason: 'network' };
        }

        if (response.status === 404) return { ok: false, reason: 'not_found' };
        if (response.status === 410) return { ok: false, reason: 'expired' };
        if (!response.ok) return { ok: false, reason: 'invalid_response' };

        const data = await response.json().catch(() => null);
        return isTestAssignmentContent(data) ? { ok: true, data } : { ok: false, reason: 'invalid_response' };
    }

    /**
     * Submit the test via the server-side edge function. The function validates
     * expiry and duplicate submissions before writing to student_tests, so these
     * checks cannot be bypassed by a client-side patch.
     */
    async submitTest(
        assignmentId: string,
        submissionId: string,
        answers: TestAnswer[],
        startedAt: string,
        submittedAt: string,
        events?: ProctorEvent[],
        sectionPath?: string[],
        levelPath?: StaircaseStep[]
    ): Promise<SyncResult> {
        const {
            data: { session },
        } = await this.client.auth.getSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        let response: Response;
        try {
            response = await this.fetchWithTimeout(`${this.supabaseUrl}/functions/v1/submit-test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: this.supabaseAnonKey,
                },
                body: JSON.stringify({
                    assignmentId,
                    submissionId,
                    answers,
                    startedAt,
                    submittedAt,
                    events,
                    sectionPath,
                    levelPath,
                }),
            });
        } catch (err) {
            return { success: false, error: `Network error: ${String(err)}` };
        }

        if (!response.ok) {
            const body = await response.json().catch(() => ({ error: `Server error ${response.status}` }));
            return { success: false, error: body.error ?? `Server error ${response.status}` };
        }

        return { success: true };
    }
}
