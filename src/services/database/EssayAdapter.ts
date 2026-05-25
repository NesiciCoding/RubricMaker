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
     * Upload the essay HTML to Storage and insert a submission row.
     * Path: {assignmentId}/{submissionId}.html
     */
    async submitEssay(
        assignment: EssayAssignment,
        submissionId: string,
        html: string,
        studentEmail: string,
        studentUserId: string,
        wordCount: number,
    ): Promise<SyncResult> {
        const assignmentId = assignment.teacherKey;
        const storagePath = `${assignmentId}/${submissionId}.html`;

        // 1. Upload HTML to Storage
        const blob = new Blob([html], { type: 'text/html' });
        const { error: uploadError } = await this.client.storage
            .from('essays')
            .upload(storagePath, blob, { contentType: 'text/html', upsert: false });

        if (uploadError) {
            return { success: false, error: `Storage upload failed: ${uploadError.message}` };
        }

        // 2. Insert submission metadata
        const { error: insertError } = await this.client
            .from('essay_submissions')
            .insert({
                id: submissionId,
                assignment_id: assignmentId,
                student_email: studentEmail,
                student_user_id: studentUserId,
                word_count: wordCount,
                submitted_at: new Date().toISOString(),
                storage_path: storagePath,
            });

        if (insertError) {
            // Best-effort cleanup of the uploaded file
            await this.client.storage.from('essays').remove([storagePath]).catch(() => {});
            return { success: false, error: `Database insert failed: ${insertError.message}` };
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
