/**
 * EssayAdapter — lightweight student-facing Supabase client.
 *
 * Created from the credentials embedded in the EssayAssignment URL, so it runs
 * entirely outside AppProvider and the teacher's StorageSync session.
 * One instance per essay page load; not a singleton.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EssayAssignment } from '../../types';
import type { SyncResult } from './types';

export interface EssaySubmissionPayload {
    id: string;
    assignmentId: string;        // = assignment.teacherKey (the essay_assignments PK)
    studentEmail: string;
    studentUserId: string;
    wordCount: number;
    submittedAt: string;
    storagePath: string;
}

export class EssayAdapter {
    private client: SupabaseClient;

    constructor(supabaseUrl: string, supabaseAnonKey: string) {
        this.client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: true },
        });
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

    /** Get the current session (in case the student refreshes the page) */
    async getSession(): Promise<{ userId: string | null; email: string | null }> {
        const { data: { session } } = await this.client.auth.getSession();
        return {
            userId: session?.user.id ?? null,
            email: session?.user.email ?? null,
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
        wordCount: number,
    ): Promise<SyncResult> {
        const { data: { session } } = await this.client.auth.getSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        let response: Response;
        try {
            response = await fetch(`${assignment.supabaseUrl}/functions/v1/submit-essay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': assignment.supabaseAnonKey ?? '',
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
