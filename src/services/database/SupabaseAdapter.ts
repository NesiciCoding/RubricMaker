import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import type {
    Rubric,
    RubricVersion,
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
    SessionRecording,
    DocumentAnalysisResult,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    GradingTask,
    StudentEssayAssignmentSummary,
    Test,
    StudentTest,
    TestAssignment,
    StudentTestAssignmentSummary,
    UserTemplate,
    MarketplaceListing,
    MarketplaceListingKind,
    CefrLevel,
    Message,
    MessageContextType,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
    StandardMasteryTarget,
    NewsFlash,
    NewsFlashRead,
    QuestionBankItem,
    DocumentComment,
} from '../../types';
import type { DatabaseConfig, DbUser, SyncResult } from './types';
import { nanoid } from '../../utils/nanoid';

export class SupabaseAdapter {
    private client: SupabaseClient | null = null;
    private userId: string | null = null;
    private userIsAnonymous = false;
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
                        : { id: s.user.id, email: s.user.email, role: 'teacher' as const };
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
                    this.userIsAnonymous = session.user.is_anonymous ?? false;
                    return true;
                }
                // Session lost; sign in anonymously for backward compat
                const { data, error } = await this.client.auth.signInAnonymously();
                if (error || !data.session) return false;
                this.userId = data.session.user.id;
                this.userIsAnonymous = true;
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
                this.userIsAnonymous = session.user.is_anonymous ?? false;
            } else {
                const { data, error } = await this.client.auth.signInAnonymously();
                if (error || !data.session) return false;
                this.userId = data.session.user.id;
                this.userIsAnonymous = true;
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

    /** Password login — the alternative students use when OTP email delivery is unreliable. */
    async signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
        if (!this.client) return { error: 'Not connected' };
        const { error } = await this.client.auth.signInWithPassword({ email, password });
        return error ? { error: error.message } : {};
    }

    /**
     * Set (or reset) the login password for one of this teacher's own students, via the
     * set-student-password edge function — writing auth.users requires the service-role
     * key, so this can't happen directly from the client.
     */
    async setStudentPassword(studentEmail: string, password: string): Promise<SyncResult> {
        if (!this.client || !this.activeUrl) return { success: false, error: 'Not connected' };
        const {
            data: { session },
        } = await this.client.auth.getSession();
        if (!session) return { success: false, error: 'Not authenticated' };

        let response: Response;
        try {
            response = await fetch(`${this.activeUrl}/functions/v1/set-student-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: this.activeKey ?? '',
                },
                body: JSON.stringify({ studentEmail, password }),
            });
        } catch (err) {
            return { success: false, error: `Network error: ${String(err)}` };
        }

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({ error: `Server error ${response.status}` }));
            return { success: false, error: errBody.error ?? `Server error ${response.status}` };
        }
        return { success: true };
    }

    /**
     * Fire-and-forget email notification when a teacher replies to (or starts) a message
     * thread — best-effort, mirrors setStudentPassword's session-token auth pattern rather
     * than GradeStudent's own notify-student-graded call (which sends the anon key as the
     * bearer token, not a real session, and would fail auth server-side).
     */
    async notifyStudentMessage(studentId: string, contextLabel: string | null, bodyPreview: string): Promise<void> {
        if (!this.client || !this.activeUrl) return;
        const {
            data: { session },
        } = await this.client.auth.getSession();
        if (!session) return;
        try {
            await fetch(`${this.activeUrl}/functions/v1/notify-student-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: this.activeKey ?? '',
                },
                body: JSON.stringify({
                    studentId,
                    contextLabel,
                    bodyPreview: bodyPreview.slice(0, 200),
                    portalUrl: `${window.location.origin}${window.location.pathname}#/portal/${studentId}`,
                }),
            });
        } catch {
            /* best-effort — silently ignore network errors */
        }
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
            role: (data.role as 'admin' | 'teacher' | 'student') ?? 'teacher',
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
            role: (p.role as 'admin' | 'teacher' | 'student') ?? 'teacher',
        }));
    }

    async updateUserRole(userId: string, role: 'admin' | 'teacher' | 'student'): Promise<SyncResult> {
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

        const { error: memberError } = await this.client
            .from('school_members')
            .insert({ school_id: data.id, profile_id: this.userId });
        if (memberError) {
            await this.client.from('schools').delete().eq('id', data.id);
            return null;
        }

        const { error: profileError } = await this.client
            .from('profiles')
            .update({ school_id: data.id })
            .eq('id', this.userId);
        if (profileError) {
            await this.client.from('school_members').delete().eq('school_id', data.id).eq('profile_id', this.userId);
            await this.client.from('schools').delete().eq('id', data.id);
            return null;
        }

        return {
            id: data.id,
            name: data.name,
            createdBy: data.created_by,
            retentionYears: data.retention_years,
            createdAt: data.created_at,
        };
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
        if (profileError) {
            await this.client.from('school_members').delete().eq('school_id', schoolId).eq('profile_id', this.userId);
            return { success: false, error: profileError.message };
        }
        return { success: true };
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
            const p = m.profiles as unknown as {
                id: string;
                email?: string;
                display_name?: string;
                role: string;
            } | null;
            return {
                id: p?.id ?? m.profile_id,
                email: p?.email ?? undefined,
                displayName: p?.display_name ?? undefined,
                role: (p?.role ?? 'teacher') as 'admin' | 'teacher' | 'student',
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
        if (error) return { success: false, error: error.message };
        const { error: profileError } = await this.client
            .from('profiles')
            .update({ school_id: null })
            .eq('id', profileId)
            .eq('school_id', schoolId);
        if (profileError) {
            const { error: rollbackError } = await this.client
                .from('school_members')
                .insert({ school_id: schoolId, profile_id: profileId });
            return {
                success: false,
                error: rollbackError
                    ? `${profileError.message}; rollback failed: ${rollbackError.message}`
                    : profileError.message,
            };
        }
        return { success: true };
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
            role: (data.role as 'admin' | 'teacher' | 'student') ?? 'teacher',
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

    /** True when the current session is Supabase's anonymous-sign-in fallback, not a real logged-in user. */
    isAnonymousSession(): boolean {
        return this.userIsAnonymous;
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
        // Scoped to owned rows: rubrics_shared_select and rubrics_school_select grant
        // additional RLS visibility (individual/department shares) for the dedicated
        // fetchSharedRubrics()/fetchSchoolSharedRubrics() calls — an unscoped select
        // here would let those same rows leak into "my rubrics" with owner-only controls.
        const { data, error } = await this.db()
            .from('rubrics')
            .select('data')
            .eq('owner_id', this.uid())
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

    // ── Rubric version history (Phase 18.4) ──────────────────────────────────
    // Fetched only when the version-history UI opens — never part of hydrate()
    // or the rubrics table itself. Individual rows are deleted only to mirror
    // the local per-rubric auto-version cap (see upsertRubricVersion in
    // storage.ts); a whole rubric's history is otherwise cleaned up via the
    // rubric_versions.rubric_id FK's ON DELETE CASCADE.

    async fetchRubricVersions(rubricId: string): Promise<RubricVersion[]> {
        const { data, error } = await this.db()
            .from('rubric_versions')
            .select('data')
            .eq('rubric_id', rubricId)
            .eq('owner_id', this.uid())
            .order('created_at', { ascending: true });
        if (error) {
            console.error('fetchRubricVersions', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as RubricVersion);
    }

    async upsertRubricVersion(rubricId: string, v: RubricVersion): Promise<SyncResult> {
        const { error } = await this.db().from('rubric_versions').upsert(
            {
                id: v.id,
                owner_id: this.uid(),
                rubric_id: rubricId,
                created_at: v.savedAt,
                data: v,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteRubricVersion(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('rubric_versions').delete().eq('id', id).eq('owner_id', this.uid());
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

    // ── Comment Snippets (legacy) ──────────────────────────────────────────────
    // The `comment_snippets` table predates `comment_bank` and has been retired —
    // the app no longer writes to it. This read stays only so `mergeLegacyCommentSnippets`
    // can lift any pre-existing rows into `comment_bank` on hydrate (see StorageSync).

    async fetchCommentSnippets(): Promise<CommentSnippet[]> {
        const { data, error } = await this.db().from('comment_snippets').select('data');
        if (error) {
            console.error('fetchCommentSnippets', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as CommentSnippet);
    }

    // ── Comment Bank ──────────────────────────────────────────────────────────

    /** Comment bank items a colleague in the same school has opted to share read-only with the whole school. */
    async fetchSchoolSharedCommentBank(): Promise<CommentBankItem[]> {
        const { data, error } = await this.db()
            .from('comment_bank')
            .select('owner_id, data')
            .eq('data->>sharedWithSchool', 'true')
            .neq('owner_id', this.uid());
        if (error) {
            console.error('fetchSchoolSharedCommentBank', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as CommentBankItem).filter(Boolean);
    }

    async fetchCommentBank(): Promise<CommentBankItem[]> {
        // Scoped to owned rows — see fetchRubrics() for why: comment_bank_school_select
        // grants RLS visibility into a colleague's shared items for
        // fetchSchoolSharedCommentBank(), and an unscoped select here would let those
        // same rows leak into "my comment bank" with owner-only edit/delete controls.
        const { data, error } = await this.db().from('comment_bank').select('data').eq('owner_id', this.uid());
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

    // ── Question Bank (roadmap 24.1) ─────────────────────────────────────────────
    // Owner-only for v1 — unlike comment_bank, no school-shared read path yet.
    // ponytail: add a school-select policy + fetchSchoolSharedQuestionBank() later
    // if teachers ask to share question banks across a department, mirroring
    // comment_bank_school_select (041_school_sharing.sql).

    async fetchQuestionBank(): Promise<QuestionBankItem[]> {
        const { data, error } = await this.db().from('question_bank_items').select('data').eq('owner_id', this.uid());
        if (error) {
            console.error('fetchQuestionBank', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as QuestionBankItem);
    }

    async upsertQuestionBankItem(item: QuestionBankItem): Promise<SyncResult> {
        const { error } = await this.db().from('question_bank_items').upsert(
            {
                id: item.id,
                owner_id: this.uid(),
                data: item,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteQuestionBankItem(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('question_bank_items').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Document Comments (roadmap 26.3) ──────────────────────────────────────────
    // Owner-only — grading-side annotations, no student read/write path.

    async fetchDocumentComments(): Promise<DocumentComment[]> {
        const { data, error } = await this.db().from('document_comments').select('data').eq('owner_id', this.uid());
        if (error) {
            console.error('fetchDocumentComments', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as DocumentComment);
    }

    async upsertDocumentComment(comment: DocumentComment): Promise<SyncResult> {
        const { error } = await this.db().from('document_comments').upsert(
            {
                id: comment.id,
                owner_id: this.uid(),
                data: comment,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteDocumentComment(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('document_comments').delete().eq('id', id).eq('owner_id', this.uid());
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

    // ── Session Recordings ────────────────────────────────────────────────────

    async fetchRecordingMetadata(): Promise<Array<SessionRecording & { sessionId: string; storagePath?: string }>> {
        const { data, error } = await this.db().from('recording_metadata').select('session_id, storage_path, data');
        if (error) {
            console.error('fetchRecordingMetadata', error);
            return [];
        }
        return (data ?? []).map((r) => ({
            ...(r.data as SessionRecording),
            sessionId: r.session_id,
            storagePath: r.storage_path ?? undefined,
        }));
    }

    async upsertRecordingMetadata(rec: SessionRecording, sessionId: string, storagePath?: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('recording_metadata')
            .upsert(
                {
                    id: rec.id,
                    owner_id: this.uid(),
                    session_id: sessionId,
                    storage_path: storagePath ?? null,
                    data: rec,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteRecordingMetadata(id: string): Promise<SyncResult> {
        try {
            await this.db()
                .storage.from('recordings')
                .remove([`${this.uid()}/${id}`]);
        } catch {
            /* ignore storage error, still delete metadata */
        }
        const { error } = await this.db().from('recording_metadata').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    async uploadRecordingFile(id: string, blob: Blob, mimeType: string): Promise<string | null> {
        const path = `${this.uid()}/${id}`;
        const { error } = await this.db().storage.from('recordings').upload(path, blob, {
            contentType: mimeType,
            upsert: true,
        });
        return error ? null : path;
    }

    async getRecordingSignedUrl(storagePath: string): Promise<string | null> {
        const { data, error } = await this.db().storage.from('recordings').createSignedUrl(storagePath, 3600);
        return error ? null : (data?.signedUrl ?? null);
    }

    /** Fetch recording ids for a given speaking session, for cascading deletes. */
    async fetchRecordingIdsForSession(sessionId: string): Promise<string[]> {
        const { data, error } = await this.db()
            .from('recording_metadata')
            .select('id')
            .eq('session_id', sessionId)
            .eq('owner_id', this.uid());
        if (error) {
            console.error('fetchRecordingIdsForSession', error);
            return [];
        }
        return (data ?? []).map((r) => r.id as string);
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    async fetchTests(): Promise<Test[]> {
        const { data, error } = await this.db().from('tests').select('data');
        if (error) {
            console.error('fetchTests', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as Test);
    }

    async upsertTest(t: Test): Promise<SyncResult> {
        const { error } = await this.db().from('tests').upsert(
            {
                id: t.id,
                owner_id: this.uid(),
                data: t,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteTest(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('tests').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Student Tests ─────────────────────────────────────────────────────────

    async fetchStudentTests(): Promise<StudentTest[]> {
        const { data, error } = await this.db().from('student_tests').select('data');
        if (error) {
            console.error('fetchStudentTests', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as StudentTest);
    }

    async upsertStudentTest(st: StudentTest): Promise<SyncResult> {
        const { error } = await this.db().from('student_tests').upsert(
            {
                id: st.id,
                owner_id: this.uid(),
                data: st,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteStudentTest(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('student_tests').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Test assignments (teacher side) ─────────────────────────────────────────

    /** Persist the assignment to the DB so the student portal can list it */
    async saveTestAssignment(a: TestAssignment): Promise<SyncResult> {
        const { error } = await this.db()
            .from('test_assignments')
            .upsert(
                {
                    id: a.teacherKey,
                    owner_id: this.uid(),
                    test_id: a.testId,
                    student_id: a.studentId,
                    test_name: a.testName,
                    require_seb: a.requireSEB ?? false,
                    duration_minutes: a.durationMinutes ?? null,
                    created_at: a.createdAt,
                    expires_at: a.expiresAt ?? null,
                    mode: a.testMode ?? null,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    /**
     * Fetch test assignments belonging to the currently logged-in student.
     * Scoped by RLS via get_my_test_assignment_ids() — students only see their own rows.
     * Submission status is looked up separately since student_tests stores studentId/testId
     * inside its `data` jsonb column rather than as real columns to join on.
     */
    async fetchMyTestAssignments(): Promise<StudentTestAssignmentSummary[]> {
        const { data, error } = await this.db()
            .from('test_assignments')
            .select('id, test_id, student_id, test_name, require_seb, duration_minutes, created_at, expires_at, mode')
            .order('created_at', { ascending: false });
        if (error || !data) return [];

        const { data: subRows } = await this.db().from('student_tests').select('data');
        const submissionByKey = new Map<string, { status: StudentTest['status']; submittedAt: string | null }>();
        for (const row of subRows ?? []) {
            const st = row.data as StudentTest;
            submissionByKey.set(`${st.testId}__${st.studentId}`, {
                status: st.status,
                submittedAt: st.submittedAt ?? null,
            });
        }

        return data.map((r) => ({
            teacherKey: r.id,
            testId: r.test_id,
            studentId: r.student_id,
            testName: r.test_name,
            requireSEB: r.require_seb,
            durationMinutes: r.duration_minutes ?? null,
            createdAt: r.created_at,
            expiresAt: r.expires_at ?? null,
            testMode: (r.mode as Test['mode']) ?? undefined,
            submission: submissionByKey.get(`${r.test_id}__${r.student_id}`) ?? null,
        }));
    }

    /**
     * Fetch the full content of a test the current student has an assignment for
     * (RLS: `tests_student_select`, scoped to test_assignments the student owns), so the
     * portal can embed it into a self-contained "Open" link — the same offline-content-URL
     * shape TestAssignmentModal already produces, sidestepping StudentTestPage's separate
     * disconnected client (which cannot read `tests` at all — see migration 044's notes).
     */
    async fetchAssignedTestContent(testId: string): Promise<Test | null> {
        const { data, error } = await this.db().from('tests').select('data').eq('id', testId).maybeSingle();
        if (error || !data) return null;
        return data.data as Test;
    }

    /**
     * Map studentId -> teacherKey for every assignment row of one test, owner-scoped
     * (RLS: `test_assignments_owner_all`). LiveMonitorPage's Realtime channel name for a
     * 'test' session is the per-student teacherKey (matching what StudentTestPage actually
     * broadcasts on via useLiveSessionTelemetry) — testId/studentId alone can't derive it,
     * since TestAssignmentModal mints a fresh nanoid per share link.
     */
    async fetchTestAssignmentTeacherKeys(testId: string): Promise<Record<string, string>> {
        const { data, error } = await this.db().from('test_assignments').select('id, student_id').eq('test_id', testId);
        if (error || !data) return {};
        return Object.fromEntries(data.map((r) => [r.student_id, r.id]));
    }

    // ── Messages (student <-> teacher, portal-authenticated students only) ────

    private static rowToMessage(r: {
        id: string;
        student_id: string;
        context_type: string;
        context_id: string | null;
        context_label: string | null;
        sender: string;
        body: string;
        created_at: string;
        read_by_teacher: boolean;
        read_by_student: boolean;
    }): Message {
        return {
            id: r.id,
            studentId: r.student_id,
            contextType: r.context_type as MessageContextType,
            contextId: r.context_id,
            contextLabel: r.context_label,
            sender: r.sender as 'student' | 'teacher',
            body: r.body,
            createdAt: r.created_at,
            readByTeacher: r.read_by_teacher,
            readByStudent: r.read_by_student,
        };
    }

    /** Teacher's full inbox — every thread across every student, RLS-scoped to owner_id. */
    async fetchMessages(): Promise<Message[]> {
        const { data, error } = await this.db()
            .from('messages')
            .select(
                'id, student_id, context_type, context_id, context_label, sender, body, created_at, read_by_teacher, read_by_student'
            )
            .order('created_at', { ascending: true });
        if (error || !data) return [];
        return data.map(SupabaseAdapter.rowToMessage);
    }

    /** Teacher sends a reply or starts a new thread. */
    async upsertMessage(m: Message): Promise<SyncResult> {
        const { error } = await this.db().from('messages').upsert(
            {
                id: m.id,
                owner_id: this.uid(),
                student_id: m.studentId,
                context_type: m.contextType,
                context_id: m.contextId,
                context_label: m.contextLabel,
                sender: m.sender,
                body: m.body,
                created_at: m.createdAt,
                read_by_teacher: m.readByTeacher,
                read_by_student: m.readByStudent,
            },
            { onConflict: 'id' }
        );
        return error ? { success: false, error: error.message } : { success: true };
    }

    /**
     * Fetch every message thread belonging to the currently logged-in portal student.
     * Scoped by RLS via messages_student_select (get_my_student_ids()).
     */
    async fetchMyMessages(): Promise<Message[]> {
        const { data, error } = await this.db()
            .from('messages')
            .select(
                'id, student_id, context_type, context_id, context_label, sender, body, created_at, read_by_teacher, read_by_student'
            )
            .order('created_at', { ascending: true });
        if (error || !data) return [];
        return data.map(SupabaseAdapter.rowToMessage);
    }

    /**
     * Student asks a question. owner_id is intentionally omitted — the
     * set_message_owner_from_student trigger (migration 050) resolves it server-side
     * from the student's actual roster row, since a portal student's app-level Student
     * type has no owner_id to send even if it wanted to.
     */
    async sendMessageAsStudent(m: Message): Promise<SyncResult> {
        const { error } = await this.db().from('messages').insert({
            id: m.id,
            student_id: m.studentId,
            context_type: m.contextType,
            context_id: m.contextId,
            context_label: m.contextLabel,
            sender: 'student',
            body: m.body,
            created_at: m.createdAt,
            read_by_teacher: false,
            read_by_student: true,
        });
        return error ? { success: false, error: error.message } : { success: true };
    }

    /** Student marks teacher replies as read on portal load. */
    async markMessagesReadByStudent(ids: string[]): Promise<SyncResult> {
        if (ids.length === 0) return { success: true };
        const { error } = await this.db().from('messages').update({ read_by_student: true }).in('id', ids);
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Flashcards (vocabulary spaced repetition) ─────────────────────────────

    async fetchFlashcardDecks(): Promise<FlashcardDeck[]> {
        const { data, error } = await this.db().from('flashcard_decks').select('data');
        if (error) {
            console.error('fetchFlashcardDecks', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as FlashcardDeck);
    }

    async upsertFlashcardDeck(d: FlashcardDeck): Promise<SyncResult> {
        const { error } = await this.db()
            .from('flashcard_decks')
            .upsert({ id: d.id, owner_id: this.uid(), data: d }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteFlashcardDeck(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('flashcard_decks').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Standard mastery targets (CEFR/SLO progress by track/year) ───────────

    async fetchStandardMasteryTargets(): Promise<StandardMasteryTarget[]> {
        const { data, error } = await this.db().from('standard_mastery_targets').select('data');
        if (error) {
            console.error('fetchStandardMasteryTargets', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as StandardMasteryTarget);
    }

    async upsertStandardMasteryTarget(t: StandardMasteryTarget): Promise<SyncResult> {
        const { error } = await this.db()
            .from('standard_mastery_targets')
            .upsert({ id: t.id, owner_id: this.uid(), data: t }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteStandardMasteryTarget(id: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('standard_mastery_targets')
            .delete()
            .eq('id', id)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchFlashcardAssignments(): Promise<FlashcardAssignment[]> {
        const { data, error } = await this.db().from('flashcard_assignments').select('data');
        if (error) {
            console.error('fetchFlashcardAssignments', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as FlashcardAssignment);
    }

    async upsertFlashcardAssignment(a: FlashcardAssignment): Promise<SyncResult> {
        const { error } = await this.db()
            .from('flashcard_assignments')
            .upsert(
                {
                    id: `${a.deckId}:${a.studentId}`,
                    owner_id: this.uid(),
                    deck_id: a.deckId,
                    student_id: a.studentId,
                    data: a,
                },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteFlashcardAssignment(id: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('flashcard_assignments')
            .delete()
            .eq('id', id)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchFlashcardReviews(): Promise<FlashcardReview[]> {
        const { data, error } = await this.db().from('flashcard_reviews').select('data');
        if (error) {
            console.error('fetchFlashcardReviews', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as FlashcardReview);
    }

    /** Teacher-session upsert (initial pushAll migration of local-mode study data). */
    async upsertFlashcardReview(r: FlashcardReview): Promise<SyncResult> {
        const { error } = await this.db()
            .from('flashcard_reviews')
            .upsert(
                { id: r.id, owner_id: this.uid(), deck_id: r.deckId, student_id: r.studentId, data: r },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteFlashcardReview(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('flashcard_reviews').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    /** Assignments for the logged-in portal student (RLS: get_my_flashcard_assignment_ids). */
    async fetchMyFlashcardAssignments(): Promise<FlashcardAssignment[]> {
        const { data, error } = await this.db().from('flashcard_assignments').select('data');
        if (error || !data) return [];
        return data.map((r) => r.data as FlashcardAssignment);
    }

    /** Full deck content for a deck assigned to the logged-in student (RLS: flashcard_decks_student_select). */
    async fetchAssignedFlashcardDeck(deckId: string): Promise<FlashcardDeck | null> {
        const { data, error } = await this.db().from('flashcard_decks').select('data').eq('id', deckId).maybeSingle();
        if (error || !data) return null;
        return data.data as FlashcardDeck;
    }

    async fetchMyFlashcardReview(deckId: string, studentId: string): Promise<FlashcardReview | null> {
        const { data, error } = await this.db()
            .from('flashcard_reviews')
            .select('data')
            .eq('id', `${deckId}:${studentId}`)
            .maybeSingle();
        if (error || !data) return null;
        return data.data as FlashcardReview;
    }

    /**
     * Student saves their own review state. owner_id is intentionally omitted — the
     * set_flashcard_review_owner trigger (migration 051) resolves it server-side from
     * the roster row, same rationale as sendMessageAsStudent. Omitting it from the
     * payload also keeps the UPDATE branch of the upsert from touching the column.
     */
    async saveFlashcardReviewAsStudent(r: FlashcardReview): Promise<SyncResult> {
        const { error } = await this.db()
            .from('flashcard_reviews')
            .upsert({ id: r.id, deck_id: r.deckId, student_id: r.studentId, data: r }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── News flashes (curated links/resources) ────────────────────────────────

    async fetchNewsFlashReads(): Promise<NewsFlashRead[]> {
        const { data, error } = await this.db().from('news_flash_reads').select('data');
        if (error) {
            console.error('fetchNewsFlashReads', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as NewsFlashRead);
    }

    async fetchNewsFlashes(): Promise<NewsFlash[]> {
        const { data, error } = await this.db().from('news_flashes').select('data');
        if (error) {
            console.error('fetchNewsFlashes', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as NewsFlash);
    }

    async upsertNewsFlash(f: NewsFlash): Promise<SyncResult> {
        const { error } = await this.db()
            .from('news_flashes')
            .upsert({ id: f.id, owner_id: this.uid(), data: f }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteNewsFlash(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('news_flashes').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    /** Teacher-session upsert of a read receipt (rare — student writes via markNewsFlashReadAsStudent). */
    async upsertNewsFlashRead(r: NewsFlashRead): Promise<SyncResult> {
        const { error } = await this.db()
            .from('news_flash_reads')
            .upsert(
                { id: r.id, owner_id: this.uid(), flash_id: r.flashId, student_id: r.studentId, data: r },
                { onConflict: 'id' }
            );
        return error ? { success: false, error: error.message } : { success: true };
    }

    /** Flashes visible to the logged-in portal student (RLS: get_my_news_flash_ids) — same query as fetchNewsFlashes(), the teacher/student split is entirely RLS-driven. */
    async fetchMyNewsFlashes(): Promise<NewsFlash[]> {
        return this.fetchNewsFlashes();
    }

    /**
     * Student marks a flash read. owner_id is intentionally omitted — the
     * set_news_flash_read_owner trigger (migration 057) resolves it server-side from
     * the roster row, same rationale as saveFlashcardReviewAsStudent.
     */
    async markNewsFlashReadAsStudent(r: NewsFlashRead): Promise<SyncResult> {
        const { error } = await this.db()
            .from('news_flash_reads')
            .upsert({ id: r.id, flash_id: r.flashId, student_id: r.studentId, data: r }, { onConflict: 'id' });
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

    // ── Essay templates (saved configs, not yet assigned to students) ─────────

    async fetchEssayTemplates(): Promise<EssayTemplate[]> {
        const { data, error } = await this.db().from('essay_templates').select('data');
        if (error) {
            console.error('fetchEssayTemplates', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as EssayTemplate);
    }

    async upsertEssayTemplate(t: EssayTemplate): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_templates')
            .upsert({ id: t.id, owner_id: this.uid(), data: t }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteEssayTemplate(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('essay_templates').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Essay batch assignments (class-assignment tracking, distinct from essay_assignments) ──

    async fetchEssayBatchAssignments(): Promise<EssayAssignment[]> {
        const { data, error } = await this.db().from('essay_batch_assignments').select('data');
        if (error) {
            console.error('fetchEssayBatchAssignments', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as EssayAssignment);
    }

    async upsertEssayBatchAssignment(id: string, a: EssayAssignment): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_batch_assignments')
            .upsert({ id, owner_id: this.uid(), data: a }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteEssayBatchAssignment(id: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_batch_assignments')
            .delete()
            .eq('id', id)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── Essay offline submissions (share-code import, distinct from essay_submissions) ──

    async fetchEssayOfflineSubmissions(): Promise<EssaySubmission[]> {
        const { data, error } = await this.db().from('essay_offline_submissions').select('data');
        if (error) {
            console.error('fetchEssayOfflineSubmissions', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as EssaySubmission);
    }

    async upsertEssayOfflineSubmission(s: EssaySubmission): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_offline_submissions')
            .upsert({ id: s.id, owner_id: this.uid(), data: s }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteEssayOfflineSubmission(id: string): Promise<SyncResult> {
        const { error } = await this.db()
            .from('essay_offline_submissions')
            .delete()
            .eq('id', id)
            .eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    // ── User templates (saved rubric templates) ──────────────────────────────

    async fetchUserTemplates(): Promise<UserTemplate[]> {
        const { data, error } = await this.db().from('user_templates').select('data');
        if (error) {
            console.error('fetchUserTemplates', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as UserTemplate);
    }

    async upsertUserTemplate(t: UserTemplate): Promise<SyncResult> {
        const { error } = await this.db()
            .from('user_templates')
            .upsert({ id: t.id, owner_id: this.uid(), data: t }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteUserTemplate(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('user_templates').delete().eq('id', id).eq('owner_id', this.uid());
        return error ? { success: false, error: error.message } : { success: true };
    }

    async fetchGradingTasks(): Promise<GradingTask[]> {
        const { data, error } = await this.db().from('grading_tasks').select('data');
        if (error) {
            console.error('fetchGradingTasks', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as GradingTask);
    }

    async upsertGradingTask(t: GradingTask): Promise<SyncResult> {
        const { error } = await this.db()
            .from('grading_tasks')
            .upsert({ id: t.id, owner_id: this.uid(), data: t }, { onConflict: 'id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async deleteGradingTask(id: string): Promise<SyncResult> {
        const { error } = await this.db().from('grading_tasks').delete().eq('id', id).eq('owner_id', this.uid());
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
            wordLimitStatus: 'ok' | 'under' | 'over' | null;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select('id, student_email, word_count, word_limit_status, submitted_at, storage_path')
            .eq('assignment_id', teacherKey)
            .order('submitted_at', { ascending: false });
        if (error || !data) return [];
        return data.map((r) => ({
            id: r.id,
            studentEmail: r.student_email ?? null,
            wordCount: r.word_count,
            wordLimitStatus: (r.word_limit_status as 'ok' | 'under' | 'over' | null) ?? null,
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
            wordLimitStatus: 'ok' | 'under' | 'over' | null;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select(
                'id, assignment_id, word_count, word_limit_status, submitted_at, storage_path, student_email, essay_assignments(rubric_id, student_id, title)'
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
                wordLimitStatus: (r.word_limit_status as 'ok' | 'under' | 'over' | null) ?? null,
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
            wordLimitStatus: 'ok' | 'under' | 'over' | null;
            submittedAt: string;
            storagePath: string;
        }>
    > {
        const { data, error } = await this.db()
            .from('essay_submissions')
            .select(
                'id, assignment_id, student_email, word_count, word_limit_status, submitted_at, storage_path, essay_assignments!inner(rubric_id, student_id)'
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
            wordLimitStatus: (r.word_limit_status as 'ok' | 'under' | 'over' | null) ?? null,
            submittedAt: r.submitted_at,
            storagePath: r.storage_path,
        }));
    }

    /**
     * Fetch essay assignments belonging to the currently logged-in student.
     * Scoped by RLS via get_my_essay_assignment_ids() — students only see their own rows.
     * Also returns whether the student has already submitted each assignment so the portal
     * can distinguish pending from completed.
     */
    async fetchMyEssayAssignments(): Promise<StudentEssayAssignmentSummary[]> {
        const { data, error } = await this.db()
            .from('essay_assignments')
            .select(
                'id, rubric_id, student_id, title, prompt, min_words, max_words, time_limit_minutes, require_seb, read_only_after_submit, created_at, expires_at, essay_submissions(submitted_at, word_count)'
            )
            .order('created_at', { ascending: false });
        if (error || !data) return [];
        return data.map((r) => {
            const subs = r.essay_submissions as unknown as Array<{ submitted_at: string; word_count: number }> | null;
            const latest = subs?.[0] ?? null;
            return {
                teacherKey: r.id,
                rubricId: r.rubric_id,
                studentId: r.student_id,
                title: r.title,
                prompt: r.prompt ?? null,
                minWords: r.min_words ?? null,
                maxWords: r.max_words ?? null,
                timeLimitMinutes: r.time_limit_minutes ?? null,
                requireSEB: r.require_seb,
                readOnlyAfterSubmit: r.read_only_after_submit,
                createdAt: r.created_at,
                expiresAt: r.expires_at ?? null,
                submission: latest ? { submittedAt: latest.submitted_at, wordCount: latest.word_count } : null,
            };
        });
    }

    /** Fetch a single essay assignment owned by this teacher, by its teacherKey (= row id). */
    async fetchEssayAssignmentByKey(
        teacherKey: string
    ): Promise<{ rubricId: string; studentId: string; title: string } | null> {
        const { data, error } = await this.db()
            .from('essay_assignments')
            .select('rubric_id, student_id, title')
            .eq('id', teacherKey)
            .eq('owner_id', this.uid())
            .maybeSingle();
        if (error || !data) return null;
        return { rubricId: data.rubric_id, studentId: data.student_id, title: data.title };
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

    async fetchRubricShares(
        rubricId: string
    ): Promise<{ userId: string; email?: string; displayName?: string; mode: 'read' | 'edit' }[]> {
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

    async lookupUserByEmail(email: string): Promise<{ userId: string; displayName?: string } | null> {
        const { data } = await this.db()
            .from('profiles')
            .select('id, display_name')
            .eq('email', email.trim().toLowerCase())
            .maybeSingle();
        if (!data) return null;
        return {
            userId: (data as { id: string; display_name?: string }).id,
            displayName: (data as { id: string; display_name?: string }).display_name ?? undefined,
        };
    }

    async shareRubricWithEmail(
        rubricId: string,
        email: string,
        mode: 'read' | 'edit'
    ): Promise<SyncResult & { notFound?: boolean }> {
        const user = await this.lookupUserByEmail(email);
        if (!user) return { success: false, notFound: true, error: `No account found for ${email}` };
        return this.shareRubric(rubricId, user.userId, mode);
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

    /** Rubrics a colleague in the same school has opted to share read-only with the whole school. */
    async fetchSchoolSharedRubrics(): Promise<Rubric[]> {
        const { data, error } = await this.db()
            .from('rubrics')
            .select('owner_id, data')
            .eq('data->>sharedWithSchool', 'true')
            .neq('owner_id', this.uid());
        if (error) {
            console.error('fetchSchoolSharedRubrics', error);
            return [];
        }
        return (data ?? []).map((r) => r.data as Rubric).filter(Boolean);
    }

    // ── Marketplace (rubrics, tests, flashcard decks — roadmap 24.4) ──────────

    private mapMarketplaceListing(row: {
        id: string;
        school_id: string;
        published_by: string;
        kind: string;
        rubric_snapshot: unknown;
        name: string;
        subject: string | null;
        description: string | null;
        attribution: string | null;
        cefr_levels: string[] | null;
        upvote_count: number;
        created_at: string;
        updated_at: string;
    }): MarketplaceListing {
        return {
            id: row.id,
            schoolId: row.school_id,
            publishedBy: row.published_by,
            kind: (row.kind as MarketplaceListingKind) || 'rubric',
            snapshot: row.rubric_snapshot as Rubric | Test | FlashcardDeck,
            name: row.name,
            subject: row.subject ?? undefined,
            description: row.description ?? undefined,
            attribution: row.attribution ?? undefined,
            cefrLevels: (row.cefr_levels as CefrLevel[] | null) ?? undefined,
            upvoteCount: row.upvote_count,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private static readonly MARKETPLACE_LISTING_COLUMNS =
        'id, school_id, published_by, kind, rubric_snapshot, name, subject, description, attribution, cefr_levels, upvote_count, created_at, updated_at';

    /** RLS scopes results to the caller's school; schoolId here is just a hint for callers, not an extra filter. */
    async listMarketplaceListings(schoolId: string): Promise<MarketplaceListing[]> {
        if (!this.client || !this.userId) return [];
        const { data, error } = await this.client
            .from('marketplace_listings')
            .select(SupabaseAdapter.MARKETPLACE_LISTING_COLUMNS)
            .eq('school_id', schoolId)
            .order('created_at', { ascending: false });
        if (error || !data) {
            if (error) console.error('listMarketplaceListings', error);
            return [];
        }
        return data.map((row) => this.mapMarketplaceListing(row));
    }

    async publishToMarketplace(
        schoolId: string,
        kind: MarketplaceListingKind,
        entity: Rubric | Test | FlashcardDeck,
        attribution?: string,
        options?: { name?: string; subject?: string; description?: string; cefrLevels?: CefrLevel[] }
    ): Promise<MarketplaceListing | null> {
        if (!this.client || !this.userId) return null;
        const subject = kind === 'rubric' ? ((entity as Rubric).subject ?? null) : null;
        const { data, error } = await this.client
            .from('marketplace_listings')
            .insert({
                school_id: schoolId,
                published_by: this.userId,
                kind,
                rubric_snapshot: entity,
                name: options?.name ?? entity.name,
                subject: options?.subject ?? subject,
                description: options?.description ?? entity.description ?? null,
                attribution: attribution ?? null,
                cefr_levels: options?.cefrLevels?.length ? options.cefrLevels : null,
            })
            .select(SupabaseAdapter.MARKETPLACE_LISTING_COLUMNS)
            .single();
        if (error || !data) {
            if (error) console.error('publishToMarketplace', error);
            return null;
        }
        return this.mapMarketplaceListing(data);
    }

    /**
     * Fetches a listing's snapshot and materializes it as a new local entity (Rubric, Test,
     * or FlashcardDeck depending on `kind`). Does not write anywhere — caller must add the
     * returned entity via the normal AppContext/storage.ts path so localStorage stays the
     * single write point.
     */
    async cloneMarketplaceListing(
        listingId: string
    ): Promise<{ kind: MarketplaceListingKind; entity: Rubric | Test | FlashcardDeck } | null> {
        if (!this.client || !this.userId) return null;
        const { data, error } = await this.client
            .from('marketplace_listings')
            .select('kind, rubric_snapshot')
            .eq('id', listingId)
            .single();
        if (error || !data) {
            if (error) console.error('cloneMarketplaceListing', error);
            return null;
        }
        const kind = ((data.kind as MarketplaceListingKind) || 'rubric') as MarketplaceListingKind;
        // Older rubric listings (pre-Phase 18.4) may still have a `versions` array embedded in
        // the stored snapshot; drop it so a cloned rubric never resurrects it.
        const { versions: _versions, ...snapshot } = data.rubric_snapshot as Rubric & { versions?: unknown };
        const now = new Date().toISOString();
        return {
            kind,
            entity: {
                ...snapshot,
                id: nanoid(),
                createdAt: now,
                updatedAt: now,
            } as Rubric | Test | FlashcardDeck,
        };
    }

    async upvoteListing(listingId: string): Promise<SyncResult> {
        if (!this.client || !this.userId) return { success: false, error: 'Not connected' };
        const { error } = await this.client
            .from('marketplace_upvotes')
            .upsert({ listing_id: listingId, profile_id: this.userId }, { onConflict: 'listing_id,profile_id' });
        return error ? { success: false, error: error.message } : { success: true };
    }

    async removeUpvote(listingId: string): Promise<SyncResult> {
        if (!this.client || !this.userId) return { success: false, error: 'Not connected' };
        const { error } = await this.client
            .from('marketplace_upvotes')
            .delete()
            .eq('listing_id', listingId)
            .eq('profile_id', this.userId);
        return error ? { success: false, error: error.message } : { success: true };
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

    async fetchClassMembers(
        classId: string
    ): Promise<{ userId: string; email?: string; displayName?: string; role: 'viewer' | 'editor' }[]> {
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
            'rubric_versions',
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
            'recording_metadata',
            'analysis_results',
            'tests',
            'student_tests',
            'user_settings',
            'essay_templates',
            'essay_assignments',
            'flashcard_decks',
            'flashcard_assignments',
            'flashcard_reviews',
            'news_flashes',
            'news_flash_reads',
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
            const { data: recFiles } = await db.storage.from('recordings').list(uid);
            if (recFiles?.length) await db.storage.from('recordings').remove(recFiles.map((f) => `${uid}/${f.name}`));
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
