/**
 * EssayAdapter — lightweight student-facing Supabase client.
 *
 * Created from the credentials embedded in the EssayAssignment URL, so it runs
 * entirely outside AppProvider and the teacher's StorageSync session.
 * One instance per essay page load; not a singleton.
 *
 * Session strategy (checked in order):
 *  1. rm_student_auth  — set by the anonymous/email-gate flow on this page
 *  2. Default key      — set by the student portal login (Option A flow)
 * The first client that has a session with a real email wins.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EssayAssignment } from '../../types';
import type { SyncResult } from './types';

export interface EssaySubmissionPayload {
    id: string;
    assignmentId: string; // = assignment.teacherKey (the essay_assignments PK)
    studentEmail: string;
    studentUserId: string;
    wordCount: number;
    submittedAt: string;
    storagePath: string;
}

export class EssayAdapter {
    /** Isolated client used for anonymous/email-gate auth (storageKey: rm_student_auth) */
    private client: SupabaseClient;
    /**
     * Second client using the default Supabase storage key.
     * Reads the portal session if the student logged in via the student portal before
     * entering SEB. No custom storageKey so it shares the token with the portal app.
     */
    private portalClient: SupabaseClient;
    private supabaseUrl: string;
    private supabaseAnonKey: string;

    constructor(supabaseUrl: string, supabaseAnonKey: string) {
        this.supabaseUrl = supabaseUrl;
        this.supabaseAnonKey = supabaseAnonKey;
        this.client = createClient(supabaseUrl, supabaseAnonKey, {
            // Persist session so OAuth callbacks survive the page redirect.
            // Uses an isolated storageKey to avoid conflicting with the teacher's session.
            auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rm_student_auth' },
        });
        // No custom storageKey → reads the default Supabase token written by the portal login.
        this.portalClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: true, autoRefreshToken: true },
        });
    }

    /**
     * Returns the active session from whichever client has one.
     * rm_student_auth is preferred; the portal session (default key) is the fallback.
     * Anonymous sessions (no email) are skipped so they don't suppress the email gate.
     */
    private async getActiveSession() {
        const [
            {
                data: { session: isolated },
            },
            {
                data: { session: portal },
            },
        ] = await Promise.all([this.client.auth.getSession(), this.portalClient.auth.getSession()]);

        // Prefer a verified (email-carrying) session from either client over an anonymous one.
        // This ensures a stale anonymous rm_student_auth token never masks a valid portal login.
        if (isolated?.user.email) return { session: isolated, source: 'isolated' as const };
        if (portal?.user.email) return { session: portal, source: 'portal' as const };
        // Anonymous isolated session (set after the email gate) — valid for submission, no email.
        if (isolated) return { session: isolated, source: 'isolated' as const };

        return null;
    }

    // ── Auth ─────────────────────────────────────────────────────────────────

    /** Send a one-time password to the student's email */
    async sendOtp(email: string): Promise<SyncResult> {
        const { error } = await this.client.auth.signInWithOtp({ email });
        return error ? { success: false, error: error.message } : { success: true };
    }

    /** Verify the OTP and sign the student in. Returns their Supabase user ID. */
    async verifyOtp(email: string, token: string): Promise<{ userId: string | null; error?: string }> {
        const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
        if (error || !data.session) return { userId: null, error: error?.message ?? 'Verification failed' };
        return { userId: data.session.user.id };
    }

    /** OAuth — redirects to Google, then back to the current page URL. */
    async signInWithGoogle(): Promise<{ error?: string }> {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href },
        });
        return error ? { error: error.message } : {};
    }

    /** OAuth — Microsoft personal accounts. */
    async signInWithMicrosoftPersonal(): Promise<{ error?: string }> {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                redirectTo: window.location.href,
                scopes: 'openid profile email',
                queryParams: { domain_hint: 'consumers' },
            },
        });
        return error ? { error: error.message } : {};
    }

    /** OAuth — Microsoft school / work (Azure AD). */
    async signInWithAzureAD(): Promise<{ error?: string }> {
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                redirectTo: window.location.href,
                scopes: 'openid profile email',
                queryParams: { domain_hint: 'organizations' },
            },
        });
        return error ? { error: error.message } : {};
    }

    /**
     * Sign in anonymously so the student gets a valid JWT without any OTP or OAuth flow.
     * The student-provided email is not verified — it is stored in the submission row only.
     * Requires "Allow anonymous sign-ins" to be enabled in the Supabase project settings.
     */
    async signInAnonymously(): Promise<{ userId: string | null; error?: string }> {
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error || !data.session) return { userId: null, error: error?.message ?? 'Anonymous sign-in failed' };
        return { userId: data.session.user.id };
    }

    /**
     * Get the current session. Checks rm_student_auth first, then the portal session.
     * Returns email only for real (non-anonymous) accounts so the EmailGate can
     * auto-bypass when the student has already logged in via the portal.
     */
    async getSession(): Promise<{ userId: string | null; email: string | null }> {
        const active = await this.getActiveSession();
        return {
            userId: active?.session.user.id ?? null,
            email: active?.session.user.email ?? null,
        };
    }

    // ── Submission ───────────────────────────────────────────────────────────

    /**
     * Submit the essay via the server-side Edge Function.
     * The function validates expiry, word-count limits, and duplicate submissions
     * before writing to Storage + essay_submissions, so these checks cannot be
     * bypassed by a client-side patch.
     */
    async submitEssay(
        assignment: EssayAssignment,
        submissionId: string,
        html: string,
        studentEmail: string,
        _studentUserId: string,
        wordCount: number
    ): Promise<SyncResult> {
        const active = await this.getActiveSession();
        if (!active) return { success: false, error: 'Not authenticated' };
        const session = active.session;

        let response: Response;
        try {
            response = await fetch(`${assignment.supabaseUrl}/functions/v1/submit-essay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: assignment.supabaseAnonKey ?? '',
                },
                body: JSON.stringify({
                    assignmentId: assignment.teacherKey,
                    submissionId,
                    htmlContent: html,
                    studentEmail,
                    wordCount,
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

    /** Fetch the assignment row (for validation on the student page) */
    async fetchAssignment(assignmentId: string): Promise<{ exists: boolean; error?: string }> {
        const { data, error } = await this.client
            .from('essay_assignments')
            .select('id')
            .eq('id', assignmentId)
            .single();
        if (error) return { exists: false, error: error.message };
        return { exists: !!data };
    }
}
