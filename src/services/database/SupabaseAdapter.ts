import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type {
    Rubric,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    CommentSnippet,
    AppSettings,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    DocumentAnalysisResult,
    EssayAssignment,
} from '../../types';
import type { DatabaseConfig, DbUser, SyncResult } from './types';

export class SupabaseAdapter {
    private client: SupabaseClient | null = null;
    private userId: string | null = null;
    private onAuthChange: ((user: DbUser | null) => void) | null = null;
    private activeUrl: string | null = null;
    private activeKey: string | null = null;
    private authListenerRegistered = false;

    // ── Auth listener (registered once per client instance) ───────────────────

    private registerAuthListener() {
        if (!this.client || this.authListenerRegistered) return;
        this.authListenerRegistered = true;
        this.client.auth.onAuthStateChange(async (_event: AuthChangeEvent, s: Session | null) => {
            this.userId = s?.user.id ?? null;
            if (this.onAuthChange) {
                if (s) {
                    const profile = await this.fetchMyProfile();
                    const resolved = profile
                        ? { ...profile, email: profile.email ?? s.user.email ?? undefined }
                        : { id: s.user.id, email: s.user.email, role: 'user' as const };
                    this.onAuthChange(resolved);
                } else {
                    this.onAuthChange(null);
                }
            }
        });
    }

    // ── Connection ────────────────────────────────────────────────────────────

    /**
     * Initialise the Supabase client for auth/OAuth without signing in anonymously.
     * Call this on app startup so OAuth callbacks and existing sessions are detected.
     */
    async initClient(config: DatabaseConfig): Promise<boolean> {
        try {
            if (!config.supabaseUrl || !config.supabaseAnonKey) return false;
            try {
                new URL(config.supabaseUrl);
            } catch {
                return false;
            }

            // Reuse existing client if config unchanged
            if (this.client && this.activeUrl === config.supabaseUrl && this.activeKey === config.supabaseAnonKey) {
                return true;
            }

            this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
                auth: { persistSession: true, autoRefreshToken: true },
            });
            this.activeUrl = config.supabaseUrl;
            this.activeKey = config.supabaseAnonKey;
            this.authListenerRegistered = false;

            // Detect existing session (covers returning OAuth users and email-OTP users)
            const {
                data: { session },
            } = await this.client.auth.getSession();
            if (session) this.userId = session.user.id;

            this.registerAuthListener();
            return true;
        } catch {
            return false;
        }
    }

    /** True if a session is active (real or anonymous). */
    hasSession(): boolean {
        return this.userId !== null && this.client !== null;
    }

    async connect(config: DatabaseConfig): Promise<boolean> {
        try {
            if (!config.supabaseUrl || !config.supabaseAnonKey) return false;
            try {
                new URL(config.supabaseUrl);
            } catch {
                return false;
            }
            if (config.supabaseAnonKey.length < 20) return false;

            // Reuse existing client if config hasn't changed — avoids duplicate GoTrueClient warning
            if (this.client && this.activeUrl === config.supabaseUrl && this.activeKey === config.supabaseAnonKey) {
                const {
                    data: { session },
                } = await this.client.auth.getSession();
                if (session) {
                    this.userId = session.user.id;
                    return true;
                }
                // Session lost; sign in anonymously for backward compat
                const { data, error } = await this.client.auth.signInAnonymously();
                if (error || !data.session) return false;
                this.userId = data.session.user.id;
                return true;
            }

            this.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
                auth: { persistSession: true, autoRefreshToken: true },
            });
            this.activeUrl = config.supabaseUrl;
            this.activeKey = config.supabaseAnonKey;
            this.authListenerRegistered = false;

            // Restore existing session or create anonymous one
            const {
                data: { session },
            } = await this.client.auth.getSession();
            if (session) {
                this.userId = session.user.id;
            } else {
                const { data, error } = await this.client.auth.signInAnonymously();
                if (error || !data.session) return false;
                this.userId = data.session.user.id;
            }

            this.registerAuthListener();
            return true;
        } catch {
            return false;
        }
    }

    async signInWithEmail(email: string): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Not connected' };
        const { error } = await this.client.auth.signInWithOtp({ email });
        return error ? { error: error.message } : {};
    }

    async verifyOtp(email: string, token: string): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Not connected' };
        const { error } = await this.client.auth.verifyOtp({ email, token, type: 'email' });
        return error ? { error: error.message } : {};
    }

    async signInWithGoogle(): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Supabase not initialised' };
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
        return error ? { error: error.message } : {};
    }

    async signInWithMicrosoftPersonal(): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Supabase not initialised' };
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                redirectTo: window.location.origin,
                scopes: 'openid profile email',
                queryParams: { domain_hint: 'consumers' },
            },
        });
        return error ? { error: error.message } : {};
    }

    async signInWithAzureAD(): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Supabase not initialised' };
        const { error } = await this.client.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                redirectTo: window.location.origin,
                scopes: 'openid profile email',
                queryParams: { domain_hint: 'organizations' },
            },
        });
        return error ? { error: error.message } : {};
    }

    async signOut(): Promise<void> {
        await this.client?.auth.signOut();
        this.userId = null;
    }

    setAuthChangeListener(cb: (user: DbUser | null) => void) {
        this.onAuthChange = cb;
    }

    // ── Profile management ────────────────────────────────────────────────────

    async fetchMyProfile(): Promise<DbUser | null> {
        if (!this.client || !this.userId) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('id, email, display_name, role')
            .eq('id', this.userId)
            .single();
        if (error || !data) return null;
        return {
            id: data.id,
            email: data.email ?? undefined,
            displayName: data.display_name ?? undefined,
            role: (data.role as 'admin' | 'user' | 'student') ?? 'user',
        };
    }

    async updateMyProfile(updates: { displayName?: string }): Promise<SyncResult> {
        if (!this.client || !this.userId) return { success: false, error: 'Not connected' };
        const { error } = await this.client
            .from('profiles')
            .update({ display_name: updates.displayName ?? null })
            .eq('id', this.userId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchAllProfiles(): Promise<DbUser[]> {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('profiles')
            .select('id, email, display_name, role')
            .order('created_at', { ascending: true });
        if (error || !data) return [];
        return data.map((p) => ({
            id: p.id,
            email: p.email ?? undefined,
            displayName: p.display_name ?? undefined,
            role: (p.role as 'admin' | 'user' | 'student') ?? 'user',
        }));
    }

    async updateUserRole(userId: string, role: 'admin' | 'user' | 'student'): Promise<SyncResult> {
        if (!this.client) return { success: false, error: 'Not connected' };
        const { error } = await this.client.from('profiles').update({ role }).eq('id', userId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Schools ───────────────────────────────────────────────────────────────

    async fetchSchools(): Promise<import('../../types').School[]> {
        if (!this.client || !this.userId) return [];
        const { data, error } = await this.client
            .from('schools')
            .select('id, name, created_by, retention_years, created_at')
            .order('name');
        if (error || !data) return [];
        return data.map((s) => ({
            id: s.id,
            name: s.name,
            createdBy: s.created_by ?? undefined,
            retentionYears: s.retention_years ?? 3,
            createdAt: s.created_at,
        }));
    }

    async createSchool(name: string, retentionYears: number): Promise<import('../../types').School | null> {
        if (!this.client || !this.userId) return null;
        const { data, error } = await this.client
            .from('schools')
            .insert({ name, created_by: this.userId, retention_years: retentionYears })
            .select()
            .single();
        if (error || !data) return null;
        // Add creator as a member and set their school_id
        await this.client.from('school_members').insert({ school_id: data.id, profile_id: this.userId });
        await this.client.from('profiles').update({ school_id: data.id }).eq('id', this.userId);
        return { id: data.id, name: data.name, createdBy: data.created_by, retentionYears: data.retention_years, createdAt: data.created_at };
    }

    async joinSchool(schoolId: string): Promise<SyncResult> {
        if (!this.client || !this.userId) return { success: false, error: 'Not connected' };
        const { error: memberError } = await this.client
            .from('school_members')
            .insert({ school_id: schoolId, profile_id: this.userId });
        if (memberError) return { success: false, error: memberError.message };
        const { error: profileError } = await this.client
            .from('profiles')
            .update({ school_id: schoolId })
            .eq('id', this.userId);
        return profileError ? { success: false, error: profileError.message } : { success: true };
    }

    async updateSchool(schoolId: string, updates: { name?: string; retentionYears?: number }): Promise<SyncResult> {
        if (!this.client) return { success: false, error: 'Not connected' };
        const patch: Record<string, unknown> = {};
        if (updates.name !== undefined) patch.name = updates.name;
        if (updates.retentionYears !== undefined) patch.retention_years = updates.retentionYears;
        const { error } = await this.client.from('schools').update(patch).eq('id', schoolId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteSchool(schoolId: string): Promise<SyncResult> {
        if (!this.client) return { success: false, error: 'Not connected' };
        const { error } = await this.client.from('schools').delete().eq('id', schoolId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchSchoolMembers(schoolId: string): Promise<(import('./types').DbUser & { joinedAt: string })[]> {
        if (!this.client) return [];
        const { data, error } = await this.client
            .from('school_members')
            .select('profile_id, created_at, profiles(id, email, display_name, role)')
            .eq('school_id', schoolId);
        if (error || !data) return [];
        return data.map((m) => {
            const p = m.profiles as unknown as { id: string; email?: string; display_name?: string; role: string } | null;
            return {
                id: p?.id ?? m.profile_id,
                email: p?.email ?? undefined,
                displayName: p?.display_name ?? undefined,
                role: (p?.role ?? 'user') as 'admin' | 'user' | 'student',
                joinedAt: m.created_at,
            };
        });
    }

    async removeSchoolMember(schoolId: string, profileId: string): Promise<SyncResult> {
        if (!this.client) return { success: false, error: 'Not connected' };
        const { error } = await this.client
            .from('school_members')
            .delete()
            .eq('school_id', schoolId)
            .eq('profile_id', profileId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchMyProfileWithSchool(): Promise<(import('./types').DbUser & { schoolId?: string }) | null> {
        if (!this.client || !this.userId) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('id, email, display_name, role, school_id')
            .eq('id', this.userId)
            .single();
        if (error || !data) return null;
        return {
            id: data.id,
            email: data.email ?? undefined,
            displayName: data.display_name ?? undefined,
            role: (data.role as 'admin' | 'user' | 'student') ?? 'user',
            schoolId: data.school_id ?? undefined,
        };
    }

    disconnect() {
        this.client = null;
        this.userId = null;
        this.activeUrl = null;
        this.activeKey = null;
        this.authListenerRegistered = false;
    }

    isConnected(): boolean {
        return this.client !== null && this.userId !== null;
    }

    getCurrentUserId(): string | null {
        return this.userId;
    }

    getClient(): SupabaseClient | null {
        return this.client;
    }

    // ── Site config (anon-readable) ───────────────────────────────────────────

    /**
     * Fetch the list of enabled auth providers from the `site_config` table.
     * Uses `this.client` directly — no session required — so it works on the
     * landing page before the user has signed in.
     * Returns `null` on any error; callers should treat null as "show all" (fail open).
     */
    async fetchAuthProviders(): Promise<string[] | null> {
        if (!this.client) return null;
        try {
            const { data, error } = await this.client
                .from('site_config')
                .select('value')
                .eq('key', 'auth_providers')
                .single();
            if (error || !data) return null;
            return Array.isArray(data.value) ? (data.value as string[]) : null;
        } catch {
            return null;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private db() {
        if (!this.client || !this.userId) throw new Error('Not connected');
        return this.client;
    }

    private uid(): string {
        if (!this.userId) throw new Error('Not connected');
        return this.userId;
    }

    // ── Rubrics ───────────────────────────────────────────────────────────────

    async fetchRubrics(): Promise<Rubric[]> {
        const { data, error } = await this.db()
            .from('rubrics')
            .select('data')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('fetchRubrics', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as Rubric);
    }

    async upsertRubric(r: Rubric): Promise<SyncResult> {
        const { error } = await this.db().from('rubrics').upsert(
            {
                id: r.id,
                owner_id: this.uid(),
                created_at: r.createdAt,
                updated_at: r.updatedAt,
                data: r,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteRubric(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('rubrics').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Classes ───────────────────────────────────────────────────────────────

    async fetchClasses(): Promise<Class[]> {
        const { data, error } = await this.db().from('classes').select('data');
        if (error) {
            console.error('fetchClasses', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as Class);
    }

    async upsertClass(c: Class): Promise<SyncResult> {
        const { error } = await this.db().from('classes').upsert(
            {
                id: c.id,
                owner_id: this.uid(),
                data: c,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteClass(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('classes').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Students ──────────────────────────────────────────────────────────────

    async fetchStudents(): Promise<Student[]> {
        const { data, error } = await this.db().from('students').select('data');
        if (error) {
            console.error('fetchStudents', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as Student);
    }

    async upsertStudent(s: Student): Promise<SyncResult> {
        const { error } = await this.db().from('students').upsert(
            {
                id: s.id,
                owner_id: this.uid(),
                class_id: s.classId,
                data: s,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteStudent(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('students').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Student Rubrics (grades) ───────────────────────────────────────────────

    async fetchStudentRubrics(): Promise<StudentRubric[]> {
        const { data, error } = await this.db().from('student_rubrics').select('data').eq('is_peer_review', false);
        if (error) {
            console.error('fetchStudentRubrics', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as StudentRubric);
    }

    async upsertStudentRubric(sr: StudentRubric): Promise<SyncResult> {
        const { error } = await this.db().from('student_rubrics').upsert(
            {
                id: sr.id,
                grader_id: this.uid(),
                rubric_id: sr.rubricId,
                student_id: sr.studentId,
                is_peer_review: false,
                data: sr,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteStudentRubric(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('student_rubrics').delete().eq('id', id).eq('grader_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Peer Reviews ──────────────────────────────────────────────────────────

    async fetchPeerReviews(): Promise<StudentRubric[]> {
        const { data, error } = await this.db().from('student_rubrics').select('data').eq('is_peer_review', true);
        if (error) {
            console.error('fetchPeerReviews', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as StudentRubric);
    }

    async upsertPeerReview(sr: StudentRubric): Promise<SyncResult> {
        const { error } = await this.db().from('student_rubrics').upsert(
            {
                id: sr.id,
                grader_id: this.uid(),
                rubric_id: sr.rubricId,
                student_id: sr.studentId,
                is_peer_review: true,
                data: sr,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deletePeerReview(id: string): Promise<SyncResult> {
        return this.deleteStudentRubric(id);
    }

    // ── Attachments ───────────────────────────────────────────────────────────

    async fetchAttachments(): Promise<Array<Omit<Attachment, 'dataUrl'> & { storagePath?: string }>> {
        const { data, error } = await this.db().from('attachments').select('data, storage_path');
        if (error) {
            console.error('fetchAttachments', error);
            return [];
        }
        return (data ?? []).map((r) => ({ ...(r.data as Omit<Attachment, 'dataUrl'>), storagePath: r.storage_path }));
    }

    async upsertAttachment(a: Omit<Attachment, 'dataUrl'>, storagePath?: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('attachments')
            .upsert(
                {
                    id: a.id,
                    owner_id: this.uid(),
                    storage_path: storagePath ?? null,
                    data: a,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteAttachment(id: string): Promise<SyncResult> {
        // Remove from storage bucket first
        try {
            await this.db()
                .storage.from('attachments')
                .remove([`${this.uid()}/${id}`]);
        } catch {
            /* ignore storage error, still delete metadata */
        }
        const { error } = await this.db().from('attachments').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    async uploadAttachmentFile(id: string, blob: Blob, mimeType: string): Promise<string | null> {
        const path = `${this.uid()}/${id}`;
        const { error } = await this.db().storage.from('attachments').upload(path, blob, {
            contentType: mimeType,
            upsert: true,
        });
        return error ? null : path;
    }

    async getAttachmentSignedUrl(storagePath: string): Promise<string | null> {
        const { data, error } = await this.db().storage.from('attachments').createSignedUrl(storagePath, 3600);
        return error ? null : (data?.signedUrl ?? null);
    }

    // ── Grade Scales ──────────────────────────────────────────────────────────

    async fetchGradeScales(): Promise<GradeScale[]> {
        const { data, error } = await this.db().from('grade_scales').select('data');
        if (error) {
            console.error('fetchGradeScales', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as GradeScale);
    }

    async upsertGradeScale(gs: GradeScale): Promise<SyncResult> {
        const { error } = await this.db().from('grade_scales').upsert(
            {
                id: gs.id,
                owner_id: this.uid(),
                data: gs,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteGradeScale(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('grade_scales').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Comment Snippets ──────────────────────────────────────────────────────

    async fetchCommentSnippets(): Promise<CommentSnippet[]> {
        const { data, error } = await this.db().from('comment_snippets').select('data');
        if (error) {
            console.error('fetchCommentSnippets', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as CommentSnippet);
    }

    async upsertCommentSnippet(cs: CommentSnippet): Promise<SyncResult> {
        const { error } = await this.db().from('comment_snippets').upsert(
            {
                id: cs.id,
                owner_id: this.uid(),
                data: cs,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteCommentSnippet(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('comment_snippets').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Comment Bank ──────────────────────────────────────────────────────────

    async fetchCommentBank(): Promise<CommentBankItem[]> {
        const { data, error } = await this.db().from('comment_bank').select('data');
        if (error) {
            console.error('fetchCommentBank', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as CommentBankItem);
    }

    async upsertCommentBankItem(item: CommentBankItem): Promise<SyncResult> {
        const { error } = await this.db().from('comment_bank').upsert(
            {
                id: item.id,
                owner_id: this.uid(),
                data: item,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteCommentBankItem(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('comment_bank').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Export Templates ──────────────────────────────────────────────────────

    async fetchExportTemplates(): Promise<Array<Omit<ExportTemplate, 'dataUrl'> & { storagePath?: string }>> {
        const { data, error } = await this.db().from('export_templates').select('data, storage_path');
        if (error) {
            console.error('fetchExportTemplates', error);
            return [];
        }
        return (data ?? []).map((r) => ({
            ...(r.data as Omit<ExportTemplate, 'dataUrl'>),
            storagePath: r.storage_path,
        }));
    }

    async upsertExportTemplate(t: Omit<ExportTemplate, 'dataUrl'>, storagePath?: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('export_templates')
            .upsert(
                {
                    id: t.id,
                    owner_id: this.uid(),
                    storage_path: storagePath ?? null,
                    data: t,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async uploadExportTemplateFile(id: string, blob: Blob): Promise<string | null> {
        const path = `${this.uid()}/${id}`;
        const { error } = await this.db().storage.from('export-templates').upload(path, blob, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true,
        });
        return error ? null : path;
    }

    async getExportTemplateSignedUrl(storagePath: string): Promise<string | null> {
        const { data, error } = await this.db().storage.from('export-templates').createSignedUrl(storagePath, 3600);
        return error ? null : (data?.signedUrl ?? null);
    }

    async deleteExportTemplate(id: string): Promise<SyncResult> {
        try {
            await this.db()
                .storage.from('export-templates')
                .remove([`${this.uid()}/${id}`]);
        } catch {
            /* ignore */
        }
        const { error } = await this.db().from('export_templates').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Favorite Standards ────────────────────────────────────────────────────

    async fetchFavoriteStandards(): Promise<LinkedStandard[]> {
        const { data, error } = await this.db().from('favorite_standards').select('data');
        if (error) {
            console.error('fetchFavoriteStandards', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as LinkedStandard);
    }

    async upsertFavoriteStandard(s: LinkedStandard): Promise<SyncResult> {
        const { error } = await this.db().from('favorite_standards').upsert(
            {
                guid: s.guid,
                owner_id: this.uid(),
                data: s,
            },
            { onConflict: 'owner_id,guid' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async removeFavoriteStandard(guid: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('favorite_standards')
            .delete()
            .eq('guid', guid)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Self Assessments ──────────────────────────────────────────────────────

    async fetchSelfAssessments(): Promise<SelfAssessment[]> {
        const { data, error } = await this.db().from('self_assessments').select('data');
        if (error) {
            console.error('fetchSelfAssessments', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as SelfAssessment);
    }

    async upsertSelfAssessment(sa: SelfAssessment): Promise<SyncResult> {
        const { error } = await this.db().from('self_assessments').upsert(
            {
                id: sa.id,
                owner_id: this.uid(),
                rubric_id: sa.rubricId,
                student_id: sa.studentId,
                data: sa,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteSelfAssessment(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('self_assessments').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Speaking Sessions ─────────────────────────────────────────────────────

    async fetchSpeakingSessions(): Promise<SpeakingSession[]> {
        const { data, error } = await this.db().from('speaking_sessions').select('data');
        if (error) {
            console.error('fetchSpeakingSessions', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as SpeakingSession);
    }

    async upsertSpeakingSession(s: SpeakingSession): Promise<SyncResult> {
        const { error } = await this.db().from('speaking_sessions').upsert(
            {
                id: s.id,
                owner_id: this.uid(),
                rubric_id: s.rubricId,
                student_id: s.studentId,
                data: s,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteSpeakingSession(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('speaking_sessions').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Analysis Results ──────────────────────────────────────────────────────

    async fetchAnalysisResults(): Promise<DocumentAnalysisResult[]> {
        const { data, error } = await this.db().from('analysis_results').select('data');
        if (error) {
            console.error('fetchAnalysisResults', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as DocumentAnalysisResult);
    }

    async upsertAnalysisResult(r: DocumentAnalysisResult): Promise<SyncResult> {
        const { error } = await this.db().from('analysis_results').upsert(
            {
                id: r.id,
                owner_id: this.uid(),
                student_id: r.studentId,
                rubric_id: r.rubricId,
                data: r,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteAnalysisResult(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('analysis_results').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Essay assignments & submissions (teacher side) ────────────────────────

    /** Persist the assignment to the DB so the student page can validate it */
    async saveEssayAssignment(a: EssayAssignment): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_assignments')
            .upsert(
                {
                    id: a.teacherKey,
                    owner_id: this.uid(),
                    rubric_id: a.rubricId,
                    student_id: a.studentId,
                    title: a.title,
                    prompt: a.prompt ?? null,
                    min_words: a.minWords ?? null,
                    max_words: a.maxWords ?? null,
                    time_limit_minutes: a.timeLimitMinutes ?? null,
                    require_seb: a.requireSEB ?? false,
                    read_only_after_submit: a.readOnlyAfterSubmit,
                    created_at: a.createdAt,
                    expires_at: a.expiresAt ?? null,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteEssayAssignment(teacherKey: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_assignments')
            .delete()
            .eq('id', teacherKey)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    /**
     * Fetch all submissions for a given assignment (by teacherKey / assignment id).
     * Returns raw DB rows; caller fetches signed URLs as needed.
     */
    async fetchEssaySubmissions(teacherKey: string): Promise<
        Array<{
            id: string;
            studentEmail: string | null;
            wordCount: number;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select('id, student_email, word_count, submitted_at, storage_path')
            .eq('assignment_id', teacherKey)
            .order('submitted_at', { ascending: false });
        if (error || !data) return [];
        return data.map((r) => ({
            id: r.id,
            studentEmail: r.student_email ?? null,
            wordCount: r.word_count,
            submittedAt: r.submitted_at,
            storagePath: r.storage_path,
        }));
    }

    /** Fetch all submissions across ALL of this teacher's assignments */
    async fetchAllEssaySubmissions(): Promise<
        Array<{
            id: string;
            assignmentId: string;
            rubricId: string;
            studentId: string;
            assignmentTitle: string;
            studentEmail: string | null;
            wordCount: number;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select(
                'id, assignment_id, word_count, submitted_at, storage_path, student_email, essay_assignments(rubric_id, student_id, title)'
            )
            .order('submitted_at', { ascending: false })
            .limit(500);
        if (error || !data) return [];
        return data.map((r) => {
            const ea = r.essay_assignments as unknown as {
                rubric_id: string;
                student_id: string;
                title: string;
            } | null;
            return {
                id: r.id,
                assignmentId: r.assignment_id,
                rubricId: ea?.rubric_id ?? '',
                studentId: ea?.student_id ?? '',
                assignmentTitle: ea?.title ?? '',
                studentEmail: r.student_email ?? null,
                wordCount: r.word_count,
                submittedAt: r.submitted_at,
                storagePath: r.storage_path,
            };
        });
    }

    /** Fetch submissions for a specific student + rubric (no teacherKey needed) */
    async fetchEssaySubmissionsForStudent(
        rubricId: string,
        studentId: string
    ): Promise<
        Array<{
            id: string;
            assignmentId: string;
            studentEmail: string | null;
            wordCount: number;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select(
                'id, assignment_id, student_email, word_count, submitted_at, storage_path, essay_assignments!inner(rubric_id, student_id)'
            )
            .eq('essay_assignments.rubric_id', rubricId)
            .eq('essay_assignments.student_id', studentId)
            .order('submitted_at', { ascending: false });
        if (error || !data) return [];
        return data.map((r) => ({
            id: r.id,
            assignmentId: r.assignment_id,
            studentEmail: r.student_email ?? null,
            wordCount: r.word_count,
            submittedAt: r.submitted_at,
            storagePath: r.storage_path,
        }));
    }

    async deleteEssaySubmission(submissionId: string, storagePath: string): Promise<SyncResult> {
        // Remove the file first (best-effort)
        await this.db()
            .storage.from('essays')
            .remove([storagePath])
            .catch(() => {});
        const { error } = await this.db().from('essay_submissions').delete().eq('id', submissionId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async getEssaySignedUrl(storagePath: string): Promise<string | null> {
        const { data, error } = await this.db().storage.from('essays').createSignedUrl(storagePath, 3600);
        return error ? null : (data?.signedUrl ?? null);
    }

    // ── Settings ──────────────────────────────────────────────────────────────

    async fetchSettings(): Promise<AppSettings | null> {
        const { data, error } = await this.db()
            .from('user_settings')
            .select('settings')
            .eq('user_id', this.uid())
            .single();
        if (error) return null;
        return (data?.settings as AppSettings) ?? null;
    }

    async saveSettings(s: AppSettings): Promise<SyncResult> {
        const { error } = await this.db().from('user_settings').upsert(
            {
                user_id: this.uid(),
                settings: s,
            },
            { onConflict: 'user_id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Rubric Sharing ────────────────────────────────────────────────────────

    async shareRubric(rubricId: string, targetUserId: string, mode: 'read' | 'edit'): Promise<SyncResult> {
        const { error } = await this.db().from('rubric_shares').upsert(
            {
                rubric_id: rubricId,
                user_id: targetUserId,
                mode,
            },
            { onConflict: 'rubric_id,user_id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async unshareRubric(rubricId: string, targetUserId: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('rubric_shares')
            .delete()
            .eq('rubric_id', rubricId)
            .eq('user_id', targetUserId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchRubricShares(rubricId: string): Promise<{ userId: string; email?: string; displayName?: string; mode: 'read' | 'edit' }[]> {
        const { data, error } = await this.db()
            .from('rubric_shares')
            .select('user_id, mode, profiles(email, display_name)')
            .eq('rubric_id', rubricId);
        if (error) {
            console.error('fetchRubricShares', error);
            return [];
        }
        return (data ?? []).map((row) => {
            const p = (row as unknown as { profiles: { email?: string; display_name?: string } | null }).profiles;
            return {
                userId: row.user_id as string,
                email: p?.email ?? undefined,
                displayName: p?.display_name ?? undefined,
                mode: row.mode as 'read' | 'edit',
            };
        });
    }

    async fetchSharedRubrics(): Promise<Rubric[]> {
        const { data, error } = await this.db().from('rubric_shares').select('rubrics(data)').eq('user_id', this.uid());
        if (error) {
            console.error('fetchSharedRubrics', error);
            return [];
        }
        return (data ?? [])
            .map((r) => (r as unknown as { rubrics: { data: unknown } }).rubrics?.data as Rubric)
            .filter(Boolean);
    }

    // ── Class Sharing ─────────────────────────────────────────────────────────

    async addClassMember(
        classId: string,
        targetUserId: string,
        role: 'viewer' | 'editor' = 'viewer'
    ): Promise<SyncResult> {
        const { error } = await this.db().from('class_members').upsert(
            {
                class_id: classId,
                user_id: targetUserId,
                role,
            },
            { onConflict: 'class_id,user_id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async removeClassMember(classId: string, targetUserId: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('class_members')
            .delete()
            .eq('class_id', classId)
            .eq('user_id', targetUserId);
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchClassMembers(classId: string): Promise<{ userId: string; email?: string; displayName?: string; role: 'viewer' | 'editor' }[]> {
        const { data, error } = await this.db()
            .from('class_members')
            .select('user_id, role, profiles(email, display_name)')
            .eq('class_id', classId);
        if (error) {
            console.error('fetchClassMembers', error);
            return [];
        }
        return (data ?? []).map((row) => {
            const p = (row as unknown as { profiles: { email?: string; display_name?: string } | null }).profiles;
            return {
                userId: row.user_id as string,
                email: p?.email ?? undefined,
                displayName: p?.display_name ?? undefined,
                role: row.role as 'viewer' | 'editor',
            };
        });
    }

    // ── Account deletion ──────────────────────────────────────────────────────

    async deleteAllMyData(): Promise<SyncResult> {
        const uid = this.uid();
        const db = this.db();
        const tables = [
            'rubrics',
            'classes',
            'students',
            'student_rubrics',
            'attachments',
            'grade_scales',
            'comment_snippets',
            'comment_bank',
            'export_templates',
            'favorite_standards',
            'self_assessments',
            'speaking_sessions',
            'analysis_results',
            'user_settings',
            'essay_assignments',
        ];
        for (const table of tables) {
            const col = table === 'student_rubrics' ? 'grader_id' : table === 'user_settings' ? 'user_id' : 'owner_id';
            await db.from(table).delete().eq(col, uid);
        }
        // Remove storage objects
        try {
            const { data: attFiles } = await db.storage.from('attachments').list(uid);
            if (attFiles?.length) await db.storage.from('attachments').remove(attFiles.map((f) => `${uid}/${f.name}`));
            const { data: tplFiles } = await db.storage.from('export-templates').list(uid);
            if (tplFiles?.length)
                await db.storage.from('export-templates').remove(tplFiles.map((f) => `${uid}/${f.name}`));
            // essay_assignments cascade-deletes essay_submissions rows via FK;
            // remove the essay files from storage folder-per-assignment
            const { data: assignments } = await db.from('essay_assignments').select('id').eq('owner_id', uid);
            if (assignments?.length) {
                for (const a of assignments) {
                    const { data: essayFiles } = await db.storage.from('essays').list(a.id);
                    if (essayFiles?.length) {
                        await db.storage.from('essays').remove(essayFiles.map((f) => `${a.id}/${f.name}`));
                    }
                }
            }
        } catch {
            /* ignore */
        }
        return { success: true };
    }
}
