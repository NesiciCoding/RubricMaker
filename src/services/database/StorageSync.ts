import i18n from 'i18next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAdapter } from './SupabaseAdapter';
import { AttachmentSync } from './AttachmentSync';
import { RecordingSync } from './RecordingSync';
import type { DatabaseConfig, SyncStatus, SyncResult, DbUser } from './types';
export { loadSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from './supabaseConfig';
import { clearSupabaseConfig } from './supabaseConfig';
import type { StoreData } from '../../store/storage';
import {
    addToPendingQueue,
    loadPendingQueue,
    removePendingWrites,
    clearLocalData,
    DEFAULT_SETTINGS,
    migrateLegacyRubricVersions,
    mergeLegacyCommentSnippets,
} from '../../store/storage';
import { logEvent } from '../logging/clientLogger';
import type {
    Rubric,
    RubricVersion,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    DocumentAnalysisResult,
    EssayAssignment,
    EssaySubmission,
    EssayTemplate,
    GradingTask,
    Test,
    StudentTest,
    TestAssignment,
    UserTemplate,
    Message,
    FlashcardDeck,
    FlashcardAssignment,
    FlashcardReview,
    StandardMasteryTarget,
    NewsFlash,
    NewsFlashRead,
} from '../../types';

const LAST_SYNC_KEY = 'rm_last_sync_at';
const OWNER_KEY = 'rm_owner_uid';

class StorageSyncService {
    readonly adapter = new SupabaseAdapter();
    private attachmentSync: AttachmentSync = new AttachmentSync(this.adapter);
    private recordingSync: RecordingSync = new RecordingSync(this.adapter);
    private status: SyncStatus = 'offline';
    private lastSyncAt: string | null = localStorage.getItem(LAST_SYNC_KEY);
    private listeners: Set<() => void> = new Set();
    private authListeners: Set<(user: DbUser | null) => void> = new Set();
    private pushOneFailCount = 0;
    private toastFn: ((msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void) | null = null;
    private reconnectListeners: Set<() => void> = new Set();
    private networkListenerActive = false;
    private flushInProgress = false;
    private realtimeChannel: ReturnType<SupabaseClient['channel']> | null = null;
    private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Every table backing a StoreData collection, with the RLS-scoping column to filter
    // change events by so a client only receives events for rows it can already read.
    // student_rubrics backs both studentRubrics and peerReviews (split by a boolean
    // column) — one subscription covers both, since a refresh re-fetches the whole table.
    private static readonly REALTIME_TABLES: Array<{ table: string; filterColumn: string }> = [
        { table: 'rubrics', filterColumn: 'owner_id' },
        { table: 'classes', filterColumn: 'owner_id' },
        { table: 'students', filterColumn: 'owner_id' },
        { table: 'student_rubrics', filterColumn: 'grader_id' },
        { table: 'attachments', filterColumn: 'owner_id' },
        { table: 'grade_scales', filterColumn: 'owner_id' },
        { table: 'comment_snippets', filterColumn: 'owner_id' },
        { table: 'comment_bank', filterColumn: 'owner_id' },
        { table: 'export_templates', filterColumn: 'owner_id' },
        { table: 'favorite_standards', filterColumn: 'owner_id' },
        { table: 'self_assessments', filterColumn: 'owner_id' },
        { table: 'speaking_sessions', filterColumn: 'owner_id' },
        { table: 'analysis_results', filterColumn: 'owner_id' },
        { table: 'tests', filterColumn: 'owner_id' },
        { table: 'student_tests', filterColumn: 'owner_id' },
        { table: 'essay_templates', filterColumn: 'owner_id' },
        { table: 'grading_tasks', filterColumn: 'owner_id' },
        { table: 'messages', filterColumn: 'owner_id' },
        { table: 'essay_batch_assignments', filterColumn: 'owner_id' },
        { table: 'essay_offline_submissions', filterColumn: 'owner_id' },
        { table: 'user_templates', filterColumn: 'owner_id' },
        { table: 'user_settings', filterColumn: 'user_id' },
        { table: 'flashcard_decks', filterColumn: 'owner_id' },
        { table: 'flashcard_assignments', filterColumn: 'owner_id' },
        { table: 'flashcard_reviews', filterColumn: 'owner_id' },
        { table: 'standard_mastery_targets', filterColumn: 'owner_id' },
        { table: 'news_flashes', filterColumn: 'owner_id' },
        { table: 'news_flash_reads', filterColumn: 'owner_id' },
    ];
    private static readonly REALTIME_DEBOUNCE_MS = 800;

    // ── Status ────────────────────────────────────────────────────────────────

    getStatus(): SyncStatus {
        return this.status;
    }
    getLastSyncAt(): string | null {
        return this.lastSyncAt;
    }
    isConnected(): boolean {
        return this.adapter.isConnected();
    }
    getCurrentUserId(): string | null {
        return this.adapter.getCurrentUserId();
    }

    private setStatus(s: SyncStatus) {
        this.status = s;
        this.notifyListeners();
    }

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    onAuthChange(cb: (user: DbUser | null) => void): () => void {
        this.authListeners.add(cb);
        return () => this.authListeners.delete(cb);
    }

    setToastFn(fn: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void) {
        this.toastFn = fn;
    }

    private notifyListeners() {
        this.listeners.forEach((cb) => cb());
    }

    private notifyAuthChange(user: DbUser | null) {
        this.authListeners.forEach((cb) => cb(user));
    }

    onNetworkReconnect(cb: () => void): () => void {
        this.reconnectListeners.add(cb);
        return () => this.reconnectListeners.delete(cb);
    }

    private notifyReconnect() {
        this.reconnectListeners.forEach((cb) => cb());
    }

    /** Start listening for browser online/offline events. Idempotent. */
    startNetworkListener(): void {
        if (this.networkListenerActive) return;
        this.networkListenerActive = true;
        window.addEventListener('online', () => {
            this.setStatus('idle');
            this.flushPendingQueue()
                .finally(() => this.notifyReconnect())
                .catch(console.warn);
        });
        window.addEventListener('offline', () => {
            this.setStatus('offline');
        });
    }

    /** Retry all queued writes that failed while offline. */
    async flushPendingQueue(): Promise<void> {
        if (this.flushInProgress) return;
        this.flushInProgress = true;
        const queue = loadPendingQueue();
        if (queue.length === 0 || !this.adapter.isConnected()) {
            this.flushInProgress = false;
            return;
        }
        this.setStatus('syncing');
        const succeeded: string[] = [];
        try {
            for (const op of queue) {
                if (!this.adapter.isConnected()) break;
                await this.pushOne(op.entity, op.action, op.payload, op.entityId);
                // pushOne catches errors internally and returns void — only mark as
                // succeeded when still connected, because a disconnect during the call
                // causes pushOne to return early without syncing or re-queuing.
                if (!this.adapter.isConnected()) break;
                succeeded.push(op.id);
            }
            if (succeeded.length > 0) removePendingWrites(succeeded);
        } finally {
            this.flushInProgress = false;
            this.setStatus('idle');
        }
    }

    // ── Connection ────────────────────────────────────────────────────────────

    /**
     * Initialise the Supabase client for auth/OAuth without connecting for data sync.
     * Called on app startup so existing sessions and OAuth callbacks are detected.
     */
    async initAuth(config: DatabaseConfig): Promise<boolean> {
        const ok = await this.adapter.initClient(config);
        if (ok) {
            this.adapter.setAuthChangeListener((user) => {
                this.notifyAuthChange(user);
                this.notifyListeners();
            });
        }
        return ok;
    }

    /** True if the adapter has an active session (real or anonymous). */
    hasSession(): boolean {
        return this.adapter.hasSession();
    }

    async configure(config: DatabaseConfig): Promise<boolean> {
        const ok = await this.adapter.connect(config);
        if (ok) {
            // startRealtimeSync() is a no-op while a channel already exists, so without
            // this, configure() called twice without an intervening disconnect()/signOut()
            // (e.g. an owner switch) would leave the realtime subscription scoped to the
            // previous user's uid.
            this.stopRealtimeSync();
            this.guardOwnerSwitch();
            this.setStatus('idle');
            this.adapter.setAuthChangeListener((user) => {
                this.notifyAuthChange(user);
                this.notifyListeners();
            });
            this.startNetworkListener();
            this.startRealtimeSync();
            // Flush any writes that failed in a previous session. Awaited (not fire-and-forget)
            // so a subsequent hydrate() can't race a GET against an in-flight queued write and
            // pull a snapshot that predates it — flushPendingQueue() itself short-circuits
            // near-instantly when the queue is empty, so this costs nothing in the common case.
            await this.flushPendingQueue().catch(console.warn);
        } else {
            this.setStatus('error');
        }
        return ok;
    }

    /**
     * Subscribes to Postgres change events on every synced table (RLS + a per-row
     * filter scope it to the current user) so edits made on another device show up
     * without waiting for reconnect or next login. Bursts of changes are debounced
     * into a single refresh — this is a "something changed, go refetch" signal, not
     * a delta transport, so it reuses the already-correct hydrate()+mergeStoreData()
     * pipeline (via the reconnect-listener callback) instead of hand-decoding ~20
     * different row shapes into app objects a second time.
     */
    private startRealtimeSync(): void {
        const client = this.adapter.getClient();
        const uid = this.adapter.getCurrentUserId();
        if (!client || !uid || this.realtimeChannel) return;
        const channel = client.channel(`sync:${uid}`);
        for (const { table, filterColumn } of StorageSyncService.REALTIME_TABLES) {
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table, filter: `${filterColumn}=eq.${uid}` },
                () => this.scheduleRealtimeRefresh()
            );
        }
        channel.subscribe();
        this.realtimeChannel = channel;
    }

    private stopRealtimeSync(): void {
        if (this.realtimeDebounceTimer) {
            clearTimeout(this.realtimeDebounceTimer);
            this.realtimeDebounceTimer = null;
        }
        if (this.realtimeChannel) {
            this.adapter.getClient()?.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }

    private scheduleRealtimeRefresh(): void {
        if (this.realtimeDebounceTimer) clearTimeout(this.realtimeDebounceTimer);
        this.realtimeDebounceTimer = setTimeout(() => {
            this.realtimeDebounceTimer = null;
            // AppContext's onNetworkReconnect handler already does exactly what a
            // realtime change needs: hydrate, merge against pending writes, flush
            // to localStorage.
            this.notifyReconnect();
        }, StorageSyncService.REALTIME_DEBOUNCE_MS);
    }

    private wipedLocalDataOnConfigure = false;

    /** True when the last configure() wiped local data because a different user signed in. */
    didWipeLocalData(): boolean {
        return this.wipedLocalDataOnConfigure;
    }

    // Local data (including the pending-sync queue) always belongs to exactly one
    // account. If a different user signs in on this browser, wipe it BEFORE the
    // pending queue is flushed so the previous user's edits are never pushed into
    // the new user's account.
    private guardOwnerSwitch(): void {
        this.wipedLocalDataOnConfigure = false;
        try {
            const uid = this.adapter.getCurrentUserId();
            if (!uid) return;
            // An anonymous session is a fallback identity (connect() calls
            // signInAnonymously() whenever it can't read a real session — including
            // a transient race right after a page reload, before Supabase-js has
            // finished restoring the persisted session from storage), not a
            // genuine different user. Never wipe — or overwrite the stored owner —
            // because of one; a later reconnect with the real session should still
            // compare against the last known real owner.
            if (this.adapter.isAnonymousSession()) return;
            const previousOwner = localStorage.getItem(OWNER_KEY);
            if (previousOwner && previousOwner !== uid) {
                clearLocalData();
                this.lastSyncAt = null;
                this.wipedLocalDataOnConfigure = true;
            }
            localStorage.setItem(OWNER_KEY, uid);
        } catch {
            // storage unavailable — skip the guard
        }
    }

    disconnect() {
        this.stopRealtimeSync();
        this.adapter.disconnect();
        this.setStatus('offline');
        clearSupabaseConfig();
    }

    async signOut(): Promise<void> {
        this.stopRealtimeSync();
        await this.adapter.signOut();
        this.setStatus('offline');
        clearSupabaseConfig();
    }

    async signInWithGoogle(): Promise<{ error?: string }> {
        return this.adapter.signInWithGoogle();
    }

    async signInWithMicrosoftPersonal(): Promise<{ error?: string }> {
        return this.adapter.signInWithMicrosoftPersonal();
    }

    async signInWithAzureAD(): Promise<{ error?: string }> {
        return this.adapter.signInWithAzureAD();
    }

    // ── Profile management (pass-through to adapter) ──────────────────────────

    async fetchMyProfile(): Promise<DbUser | null> {
        return this.adapter.fetchMyProfile();
    }

    async updateMyProfile(updates: { displayName?: string }): Promise<SyncResult> {
        return this.adapter.updateMyProfile(updates);
    }

    async fetchAllProfiles(): Promise<DbUser[]> {
        return this.adapter.fetchAllProfiles();
    }

    async updateUserRole(userId: string, role: 'admin' | 'teacher' | 'student'): Promise<SyncResult> {
        return this.adapter.updateUserRole(userId, role);
    }

    // ── Schools ───────────────────────────────────────────────────────────────

    async fetchSchools() {
        return this.adapter.fetchSchools();
    }
    async createSchool(name: string, retentionYears: number) {
        return this.adapter.createSchool(name, retentionYears);
    }
    async joinSchool(schoolId: string) {
        return this.adapter.joinSchool(schoolId);
    }
    async updateSchool(schoolId: string, updates: { name?: string; retentionYears?: number }) {
        return this.adapter.updateSchool(schoolId, updates);
    }
    async deleteSchool(schoolId: string) {
        return this.adapter.deleteSchool(schoolId);
    }
    async fetchSchoolMembers(schoolId: string) {
        return this.adapter.fetchSchoolMembers(schoolId);
    }
    async removeSchoolMember(schoolId: string, profileId: string) {
        return this.adapter.removeSchoolMember(schoolId, profileId);
    }

    // ── Essay management (pass-through to adapter) ───────────────────────────

    async saveEssayAssignment(a: EssayAssignment): Promise<SyncResult> {
        return this.adapter.saveEssayAssignment(a);
    }

    /** Set/reset a student's portal login password — the OTP-email alternative. */
    async setStudentPassword(studentEmail: string, password: string): Promise<SyncResult> {
        return this.adapter.setStudentPassword(studentEmail, password);
    }

    async notifyStudentMessage(studentId: string, contextLabel: string | null, bodyPreview: string): Promise<void> {
        return this.adapter.notifyStudentMessage(studentId, contextLabel, bodyPreview);
    }

    async deleteEssayAssignment(teacherKey: string): Promise<SyncResult> {
        return this.adapter.deleteEssayAssignment(teacherKey);
    }

    async fetchEssaySubmissions(teacherKey: string) {
        return this.adapter.fetchEssaySubmissions(teacherKey);
    }

    async fetchEssaySubmissionsForStudent(rubricId: string, studentId: string) {
        return this.adapter.fetchEssaySubmissionsForStudent(rubricId, studentId);
    }

    async fetchAllEssaySubmissions() {
        return this.adapter.fetchAllEssaySubmissions();
    }

    async fetchMyEssayAssignments() {
        return this.adapter.fetchMyEssayAssignments();
    }

    async saveTestAssignment(a: TestAssignment): Promise<SyncResult> {
        return this.adapter.saveTestAssignment(a);
    }

    async fetchMyTestAssignments() {
        return this.adapter.fetchMyTestAssignments();
    }

    async fetchAssignedTestContent(testId: string): Promise<Test | null> {
        return this.adapter.fetchAssignedTestContent(testId);
    }

    async fetchMyMessages() {
        return this.adapter.fetchMyMessages();
    }

    async sendMessageAsStudent(m: Message): Promise<SyncResult> {
        return this.adapter.sendMessageAsStudent(m);
    }

    async markMessagesReadByStudent(ids: string[]): Promise<SyncResult> {
        return this.adapter.markMessagesReadByStudent(ids);
    }

    async fetchMyFlashcardAssignments(): Promise<FlashcardAssignment[]> {
        return this.adapter.fetchMyFlashcardAssignments();
    }

    async fetchAssignedFlashcardDeck(deckId: string): Promise<FlashcardDeck | null> {
        return this.adapter.fetchAssignedFlashcardDeck(deckId);
    }

    async fetchMyFlashcardReview(deckId: string, studentId: string): Promise<FlashcardReview | null> {
        return this.adapter.fetchMyFlashcardReview(deckId, studentId);
    }

    // Phase 18.4: fetched only when the version-history UI opens, never as part
    // of hydrate() — see fetchRubrics()'s much larger sibling above.
    async fetchRubricVersions(rubricId: string): Promise<RubricVersion[]> {
        return this.adapter.fetchRubricVersions(rubricId);
    }

    async saveFlashcardReviewAsStudent(r: FlashcardReview): Promise<SyncResult> {
        return this.adapter.saveFlashcardReviewAsStudent(r);
    }

    async fetchMyNewsFlashes(): Promise<NewsFlash[]> {
        return this.adapter.fetchMyNewsFlashes();
    }

    async markNewsFlashReadAsStudent(r: NewsFlashRead): Promise<SyncResult> {
        return this.adapter.markNewsFlashReadAsStudent(r);
    }

    async fetchEssayAssignmentByKey(teacherKey: string) {
        return this.adapter.fetchEssayAssignmentByKey(teacherKey);
    }

    async deleteEssaySubmission(submissionId: string, storagePath: string): Promise<SyncResult> {
        return this.adapter.deleteEssaySubmission(submissionId, storagePath);
    }

    async getEssaySignedUrl(storagePath: string): Promise<string | null> {
        return this.adapter.getEssaySignedUrl(storagePath);
    }

    // ── Hydration (DB → app state) ────────────────────────────────────────────

    private static readonly HYDRATE_TIMEOUT_MS = 8000;
    private hydrationGeneration = 0;

    async hydrate(): Promise<{ data: Partial<StoreData> | null; error?: string }> {
        const gen = ++this.hydrationGeneration;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<{ data: null; error?: string }>((resolve) => {
            timer = setTimeout(() => {
                // Only act if this is still the active generation; a newer hydrate()
                // call could have started between when this timer was set and when it fires.
                if (gen !== this.hydrationGeneration) {
                    resolve({ data: null });
                    return;
                }
                // Supersede the in-flight impl so its late completion is discarded,
                // then settle the status to match the warning toast that AppContext shows.
                this.hydrationGeneration++;
                this.setStatus('error');
                resolve({ data: null, error: 'timeout' });
            }, StorageSyncService.HYDRATE_TIMEOUT_MS);
        });
        try {
            return await Promise.race([this._hydrateImpl(gen), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async _hydrateImpl(gen: number): Promise<{ data: Partial<StoreData> | null; error?: string }> {
        if (!this.adapter.isConnected()) return { data: null };
        this.setStatus('syncing');
        try {
            const [
                rubrics,
                classes,
                students,
                studentRubrics,
                peerReviews,
                gradeScales,
                commentSnippets,
                commentBank,
                exportTemplates,
                favoriteStandards,
                selfAssessments,
                speakingSessions,
                analysisResults,
                tests,
                studentTests,
                essayTemplates,
                gradingTasks,
                essayAssignments,
                essaySubmissions,
                userTemplates,
                messages,
                attachments,
                settings,
                profile,
            ] = await Promise.all([
                this.adapter.fetchRubrics(),
                this.adapter.fetchClasses(),
                this.adapter.fetchStudents(),
                this.adapter.fetchStudentRubrics(),
                this.adapter.fetchPeerReviews(),
                this.adapter.fetchGradeScales(),
                this.adapter.fetchCommentSnippets(),
                this.adapter.fetchCommentBank(),
                this.attachmentSync.hydrateExportTemplates(),
                this.adapter.fetchFavoriteStandards(),
                this.adapter.fetchSelfAssessments(),
                this.adapter.fetchSpeakingSessions(),
                this.adapter.fetchAnalysisResults(),
                this.adapter.fetchTests(),
                this.adapter.fetchStudentTests(),
                this.adapter.fetchEssayTemplates(),
                this.adapter.fetchGradingTasks(),
                this.adapter.fetchEssayBatchAssignments(),
                this.adapter.fetchEssayOfflineSubmissions(),
                this.adapter.fetchUserTemplates(),
                this.adapter.fetchMessages(),
                this.attachmentSync.hydrateAttachments(),
                this.adapter.fetchSettings(),
                this.adapter.fetchMyProfile(),
            ]);

            // Back-compat read path (Phase 18.4): rubrics synced before this phase still
            // carry an embedded `versions` array in their jsonb row. Lift it into the
            // dedicated per-rubric version store on first sight and strip it here so it
            // never re-enters app state.
            const migratedRubrics = rubrics.map(migrateLegacyRubricVersions);

            // Back-compat read path (comment-bank consolidation): any pre-existing
            // `comment_snippets` rows get lifted into `commentBank` on every hydrate —
            // intentionally not one-time, since the remote table itself is left in
            // place (not deleted) rather than forcing a destructive backfill; this is
            // cheap and a no-op once nothing is left to migrate.
            const mergedCommentBank = mergeLegacyCommentSnippets(commentSnippets, commentBank);

            // Fetched as a second, sequential wave rather than joining the burst of ~20
            // requests above — a fresh feature's tables competing for the same local
            // connection pool at that exact startup instant was implicated in a
            // (previously fragile, timing-sensitive) offline-sync-merge E2E failure.
            const [
                flashcardDecks,
                flashcardAssignments,
                flashcardReviews,
                standardMasteryTargets,
                newsFlashes,
                newsFlashReads,
            ] = await Promise.all([
                this.adapter.fetchFlashcardDecks().catch(() => []),
                this.adapter.fetchFlashcardAssignments().catch(() => []),
                this.adapter.fetchFlashcardReviews().catch(() => []),
                this.adapter.fetchStandardMasteryTargets().catch(() => []),
                this.adapter.fetchNewsFlashes().catch(() => []),
                this.adapter.fetchNewsFlashReads().catch(() => []),
            ]);

            // The profile.role is authoritative; always override whatever userRole
            // is stored in user_settings so the DB is the single source of truth.
            // If the profile has no school_id the user needs to complete onboarding.
            const profileFull = await this.adapter.fetchMyProfileWithSchool();
            let mergedSettings = profile?.role
                ? {
                      ...DEFAULT_SETTINGS,
                      ...(settings ?? {}),
                      userRole: profile.role,
                      ...(profile.email ? { userEmail: profile.email } : {}),
                  }
                : (settings ?? undefined);

            if (mergedSettings && profileFull) {
                if (profileFull.role === 'student') {
                    // Students don't create/join a school during onboarding — their
                    // profile.role being set is enough to consider onboarding complete,
                    // and it persists in the DB so re-logging in never re-prompts them.
                    let schoolName: string | undefined;
                    if (profileFull.schoolId) {
                        const schools = await this.adapter.fetchSchools();
                        schoolName = schools.find((s) => s.id === profileFull.schoolId)?.name;
                    }
                    mergedSettings = {
                        ...mergedSettings,
                        needsOnboarding: false,
                        schoolId: profileFull.schoolId,
                        schoolName,
                    };
                } else if (!profileFull.schoolId) {
                    mergedSettings = { ...mergedSettings, needsOnboarding: true };
                } else {
                    // Fetch school name to store alongside the id
                    const schools = await this.adapter.fetchSchools();
                    const school = schools.find((s) => s.id === profileFull.schoolId);
                    mergedSettings = {
                        ...mergedSettings,
                        needsOnboarding: false,
                        schoolId: profileFull.schoolId,
                        schoolName: school?.name,
                    };
                }
            }

            const result: Partial<StoreData> = {
                rubrics: migratedRubrics,
                classes: classes.length > 0 ? classes : undefined,
                students,
                studentRubrics,
                peerReviews,
                gradeScales: gradeScales.length > 0 ? gradeScales : undefined,
                commentBank: mergedCommentBank.length > 0 ? mergedCommentBank : undefined,
                exportTemplates,
                favoriteStandards,
                selfAssessments,
                speakingSessions,
                analysisResults,
                tests,
                studentTests,
                essayTemplates,
                gradingTasks,
                essayAssignments,
                essaySubmissions,
                userTemplates,
                messages,
                flashcardDecks,
                flashcardAssignments,
                flashcardReviews,
                standardMasteryTargets,
                newsFlashes,
                newsFlashReads,
                attachments,
                ...(mergedSettings ? { settings: mergedSettings as StoreData['settings'] } : {}),
            };

            // Remove undefined keys so the caller can merge cleanly with defaults
            Object.keys(result).forEach((k) => {
                if (result[k as keyof StoreData] === undefined) delete result[k as keyof StoreData];
            });

            // Final generation check: all async work (including post-profile fetches)
            // is complete. Only write side effects if this hydration is still active.
            if (gen !== this.hydrationGeneration) return { data: null };
            const now = new Date().toISOString();
            this.lastSyncAt = now;
            localStorage.setItem(LAST_SYNC_KEY, now);
            this.setStatus('idle');

            return { data: result };
        } catch (e) {
            console.error('[sync] hydrate failed', e);
            logEvent('sync', 'hydrate', { error: String(e) }, 'error');
            if (gen === this.hydrationGeneration) this.setStatus('error');
            return { data: null, error: String(e) };
        }
    }

    // ── Push all (local → DB, used for initial migration) ────────────────────

    async pushAll(state: StoreData): Promise<SyncResult> {
        if (!this.adapter.isConnected()) return { success: false, error: 'Not connected' };
        this.setStatus('syncing');
        try {
            const ups = [
                ...state.rubrics.map((r) => this.adapter.upsertRubric(r)),
                ...state.classes.map((c) => this.adapter.upsertClass(c)),
                ...state.students.map((s) => this.adapter.upsertStudent(s)),
                ...state.studentRubrics.map((sr) => this.adapter.upsertStudentRubric(sr)),
                ...state.peerReviews.map((sr) => this.adapter.upsertPeerReview(sr)),
                ...state.gradeScales.map((gs) => this.adapter.upsertGradeScale(gs)),
                ...state.commentBank.map((cb) => this.adapter.upsertCommentBankItem(cb)),
                ...state.favoriteStandards.map((fs) => this.adapter.upsertFavoriteStandard(fs)),
                ...state.selfAssessments.map((sa) => this.adapter.upsertSelfAssessment(sa)),
                ...state.speakingSessions.map((ss) => this.adapter.upsertSpeakingSession(ss)),
                ...state.analysisResults.map((ar) => this.adapter.upsertAnalysisResult(ar)),
                ...state.tests.map((t) => this.adapter.upsertTest(t)),
                ...state.studentTests.map((st) => this.adapter.upsertStudentTest(st)),
                ...state.essayTemplates.map((et) => this.adapter.upsertEssayTemplate(et)),
                ...state.gradingTasks.map((gt) => this.adapter.upsertGradingTask(gt)),
                ...state.essayAssignments.map((a) =>
                    this.adapter.upsertEssayBatchAssignment(`${a.teacherKey}:${a.studentId}`, a)
                ),
                ...state.essaySubmissions.map((s) => this.adapter.upsertEssayOfflineSubmission(s)),
                ...state.userTemplates.map((ut) => this.adapter.upsertUserTemplate(ut)),
                ...state.messages.map((m) => this.adapter.upsertMessage(m)),
                ...state.flashcardDecks.map((d) => this.adapter.upsertFlashcardDeck(d)),
                ...state.flashcardAssignments.map((a) => this.adapter.upsertFlashcardAssignment(a)),
                ...state.flashcardReviews.map((r) => this.adapter.upsertFlashcardReview(r)),
                ...state.standardMasteryTargets.map((t) => this.adapter.upsertStandardMasteryTarget(t)),
                ...state.newsFlashes.map((f) => this.adapter.upsertNewsFlash(f)),
                ...state.newsFlashReads.map((r) => this.adapter.upsertNewsFlashRead(r)),
                this.adapter.saveSettings(state.settings),
            ];
            await Promise.all(ups);

            // Upload file attachments (sequential to avoid memory spikes)
            for (const att of state.attachments) {
                await this.attachmentSync.pushAttachment(att);
            }
            for (const tpl of state.exportTemplates) {
                await this.attachmentSync.pushExportTemplate(tpl);
            }
            for (const ss of state.speakingSessions) {
                if (ss.recordings?.length) {
                    await this.recordingSync.pushSessionRecordings(ss.recordings, ss.id);
                }
            }

            const now = new Date().toISOString();
            this.lastSyncAt = now;
            localStorage.setItem(LAST_SYNC_KEY, now);
            this.setStatus('idle');
            return { success: true };
        } catch (e: unknown) {
            this.setStatus('error');
            return { success: false, error: String(e) };
        }
    }

    // ── Push one (fire-and-forget after a mutation) ───────────────────────────

    async pushOne(entity: string, action: 'upsert' | 'delete', payload: unknown, id?: string): Promise<void> {
        if (!this.adapter.isConnected()) return;
        let result: SyncResult | undefined;
        const startedAt = Date.now();
        try {
            switch (entity) {
                case 'rubric':
                    if (action === 'upsert') result = await this.adapter.upsertRubric(payload as Rubric);
                    else if (id) result = await this.adapter.deleteRubric(id);
                    break;
                case 'rubricVersion':
                    // Delete here mirrors the local per-rubric auto-version cap (a single
                    // evicted row), not a whole-rubric wipe — that's still the FK's
                    // ON DELETE CASCADE when the rubric itself is deleted.
                    if (action === 'upsert') {
                        const v = payload as RubricVersion & { rubricId: string };
                        result = await this.adapter.upsertRubricVersion(v.rubricId, v);
                    } else if (id) {
                        result = await this.adapter.deleteRubricVersion(id);
                    }
                    break;
                case 'class':
                    if (action === 'upsert') result = await this.adapter.upsertClass(payload as Class);
                    else if (id) result = await this.adapter.deleteClass(id);
                    break;
                case 'student':
                    if (action === 'upsert') result = await this.adapter.upsertStudent(payload as Student);
                    else if (id) result = await this.adapter.deleteStudent(id);
                    break;
                case 'studentRubric':
                    if (action === 'upsert') result = await this.adapter.upsertStudentRubric(payload as StudentRubric);
                    else if (id) result = await this.adapter.deleteStudentRubric(id);
                    break;
                case 'peerReview':
                    if (action === 'upsert') result = await this.adapter.upsertPeerReview(payload as StudentRubric);
                    else if (id) result = await this.adapter.deletePeerReview(id);
                    break;
                case 'attachment':
                    if (action === 'upsert') await this.attachmentSync.pushAttachment(payload as Attachment);
                    else if (id) result = await this.adapter.deleteAttachment(id);
                    break;
                case 'gradeScale':
                    if (action === 'upsert') result = await this.adapter.upsertGradeScale(payload as GradeScale);
                    else if (id) result = await this.adapter.deleteGradeScale(id);
                    break;
                case 'commentBankItem':
                    if (action === 'upsert')
                        result = await this.adapter.upsertCommentBankItem(payload as CommentBankItem);
                    else if (id) result = await this.adapter.deleteCommentBankItem(id);
                    break;
                case 'exportTemplate':
                    if (action === 'upsert') await this.attachmentSync.pushExportTemplate(payload as ExportTemplate);
                    else if (id) result = await this.adapter.deleteExportTemplate(id);
                    break;
                case 'favoriteStandard':
                    if (action === 'upsert')
                        result = await this.adapter.upsertFavoriteStandard(payload as LinkedStandard);
                    else if (id) result = await this.adapter.removeFavoriteStandard(id);
                    break;
                case 'selfAssessment':
                    if (action === 'upsert')
                        result = await this.adapter.upsertSelfAssessment(payload as SelfAssessment);
                    else if (id) result = await this.adapter.deleteSelfAssessment(id);
                    break;
                case 'speakingSession':
                    if (action === 'upsert') {
                        const session = payload as SpeakingSession;
                        result = await this.adapter.upsertSpeakingSession(session);
                        if (session.recordings?.length) {
                            await this.recordingSync.pushSessionRecordings(session.recordings, session.id);
                        }
                    } else if (id) {
                        await this.recordingSync.deleteSessionRecordingsById(id);
                        result = await this.adapter.deleteSpeakingSession(id);
                    }
                    break;
                case 'analysisResult':
                    if (action === 'upsert')
                        result = await this.adapter.upsertAnalysisResult(payload as DocumentAnalysisResult);
                    else if (id) result = await this.adapter.deleteAnalysisResult(id);
                    break;
                case 'test':
                    if (action === 'upsert') result = await this.adapter.upsertTest(payload as Test);
                    else if (id) result = await this.adapter.deleteTest(id);
                    break;
                case 'studentTest':
                    if (action === 'upsert') result = await this.adapter.upsertStudentTest(payload as StudentTest);
                    else if (id) result = await this.adapter.deleteStudentTest(id);
                    break;
                case 'essayTemplate':
                    if (action === 'upsert') result = await this.adapter.upsertEssayTemplate(payload as EssayTemplate);
                    else if (id) result = await this.adapter.deleteEssayTemplate(id);
                    break;
                case 'gradingTask':
                    if (action === 'upsert') result = await this.adapter.upsertGradingTask(payload as GradingTask);
                    else if (id) result = await this.adapter.deleteGradingTask(id);
                    break;
                case 'message':
                    if (action === 'upsert') result = await this.adapter.upsertMessage(payload as Message);
                    break;
                case 'essayBatchAssignment':
                    if (action === 'upsert') {
                        const a = payload as EssayAssignment;
                        result = await this.adapter.upsertEssayBatchAssignment(`${a.teacherKey}:${a.studentId}`, a);
                    } else if (id) result = await this.adapter.deleteEssayBatchAssignment(id);
                    break;
                case 'essayOfflineSubmission':
                    if (action === 'upsert')
                        result = await this.adapter.upsertEssayOfflineSubmission(payload as EssaySubmission);
                    else if (id) result = await this.adapter.deleteEssayOfflineSubmission(id);
                    break;
                case 'userTemplate':
                    if (action === 'upsert') result = await this.adapter.upsertUserTemplate(payload as UserTemplate);
                    else if (id) result = await this.adapter.deleteUserTemplate(id);
                    break;
                case 'flashcardDeck':
                    if (action === 'upsert') result = await this.adapter.upsertFlashcardDeck(payload as FlashcardDeck);
                    else if (id) result = await this.adapter.deleteFlashcardDeck(id);
                    break;
                case 'flashcardAssignment':
                    if (action === 'upsert')
                        result = await this.adapter.upsertFlashcardAssignment(payload as FlashcardAssignment);
                    else if (id) result = await this.adapter.deleteFlashcardAssignment(id);
                    break;
                case 'flashcardReview':
                    // Teacher-session pushes only (local-mode study data, deck-delete
                    // cascade); the portal student writes through
                    // saveFlashcardReviewAsStudent instead, never through the diff effect.
                    if (action === 'upsert')
                        result = await this.adapter.upsertFlashcardReview(payload as FlashcardReview);
                    else if (id) result = await this.adapter.deleteFlashcardReview(id);
                    break;
                case 'standardMasteryTarget':
                    if (action === 'upsert')
                        result = await this.adapter.upsertStandardMasteryTarget(payload as StandardMasteryTarget);
                    else if (id) result = await this.adapter.deleteStandardMasteryTarget(id);
                    break;
                case 'newsFlash':
                    if (action === 'upsert') result = await this.adapter.upsertNewsFlash(payload as NewsFlash);
                    else if (id) result = await this.adapter.deleteNewsFlash(id);
                    break;
                case 'newsFlashRead':
                    // Teacher-session pushes only, mirroring flashcardReview; the portal
                    // student writes through markNewsFlashReadAsStudent instead.
                    if (action === 'upsert') result = await this.adapter.upsertNewsFlashRead(payload as NewsFlashRead);
                    break;
                case 'settings':
                    if (action === 'upsert')
                        result = await this.adapter.saveSettings(payload as import('../../types').AppSettings);
                    break;
            }
            if (result && !result.success) {
                throw new Error(result.error || `sync ${entity} ${action} rejected`);
            }
            this.pushOneFailCount = 0;
            logEvent('sync', `pushOne:${entity}:${action}`, { id, ms: Date.now() - startedAt });
        } catch (e) {
            console.warn(`[sync] pushOne(${entity}, ${action}) failed`, e);
            logEvent('sync', `pushOne:${entity}:${action}`, { id, error: String(e) }, 'warn');
            addToPendingQueue({ entity, action, payload, entityId: id });
            this.pushOneFailCount++;
            if (this.pushOneFailCount === 3 && this.toastFn) {
                this.toastFn(i18n.t('toast.sync_push_failed'), 'warning');
            }
        }
    }
}

export const storageSync = new StorageSyncService();
