import i18n from 'i18next';
import { SupabaseAdapter } from './SupabaseAdapter';
import { AttachmentSync } from './AttachmentSync';
import { RecordingSync } from './RecordingSync';
import type { DatabaseConfig, SyncStatus, SyncResult, DbUser } from './types';
import type { StoreData } from '../../store/storage';
import { addToPendingQueue, loadPendingQueue, removePendingWrites } from '../../store/storage';
import type {
    Rubric,
    Student,
    Class,
    StudentRubric,
    Attachment,
    GradeScale,
    CommentSnippet,
    LinkedStandard,
    CommentBankItem,
    ExportTemplate,
    SelfAssessment,
    SpeakingSession,
    DocumentAnalysisResult,
    EssayAssignment,
    Test,
    StudentTest,
} from '../../types';

const CONFIG_KEY = 'rm_supabase_config';
const LAST_SYNC_KEY = 'rm_last_sync_at';

function normalizeSupabaseUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized) {
        throw new Error(i18n.t('toast.empty_supabase_url'));
    }
    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(normalized) && !/^https?:\/\//i.test(normalized)) {
        throw new Error(i18n.t('toast.invalid_supabase_url_protocol'));
    }
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = 'https://' + normalized;
    }
    // Preserve http:// for localhost/127.0.0.1 (local dev); upgrade everything else to https://
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/i.test(normalized)) {
        normalized = normalized.replace(/^http:\/\//i, 'https://');
    }
    return normalized.replace(/\/+$/, '');
}

export function loadSupabaseConfig(): DatabaseConfig | null {
    try {
        const envUrl = import.meta.env.VITE_SUPABASE_URL;
        const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as DatabaseConfig;
            return { ...parsed, supabaseUrl: normalizeSupabaseUrl(parsed.supabaseUrl) };
        }
        if (envUrl && envKey) return { supabaseUrl: normalizeSupabaseUrl(envUrl), supabaseAnonKey: envKey };
        return null;
    } catch {
        return null;
    }
}

export function saveSupabaseConfig(config: DatabaseConfig) {
    localStorage.setItem(
        CONFIG_KEY,
        JSON.stringify({
            ...config,
            supabaseUrl: normalizeSupabaseUrl(config.supabaseUrl),
        })
    );
}

export function clearSupabaseConfig() {
    localStorage.removeItem(CONFIG_KEY);
}

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
            this.setStatus('idle');
            this.adapter.setAuthChangeListener((user) => {
                this.notifyAuthChange(user);
                this.notifyListeners();
            });
            this.startNetworkListener();
            // Flush any writes that failed in a previous session
            this.flushPendingQueue().catch(console.warn);
        } else {
            this.setStatus('error');
        }
        return ok;
    }

    disconnect() {
        this.adapter.disconnect();
        this.setStatus('offline');
        clearSupabaseConfig();
    }

    async signOut(): Promise<void> {
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

    async updateUserRole(userId: string, role: 'admin' | 'user' | 'student'): Promise<SyncResult> {
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
                this.attachmentSync.hydrateAttachments(),
                this.adapter.fetchSettings(),
                this.adapter.fetchMyProfile(),
            ]);

            // The profile.role is authoritative; always override whatever userRole
            // is stored in user_settings so the DB is the single source of truth.
            // If the profile has no school_id the user needs to complete onboarding.
            const profileFull = await this.adapter.fetchMyProfileWithSchool();
            let mergedSettings = profile?.role
                ? {
                      ...(settings ?? {}),
                      userRole: profile.role,
                      ...(profile.email ? { userEmail: profile.email } : {}),
                  }
                : (settings ?? undefined);

            if (mergedSettings && profileFull) {
                if (!profileFull.schoolId) {
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
                rubrics,
                classes: classes.length > 0 ? classes : undefined,
                students,
                studentRubrics,
                peerReviews,
                gradeScales: gradeScales.length > 0 ? gradeScales : undefined,
                commentSnippets,
                commentBank: commentBank.length > 0 ? commentBank : undefined,
                exportTemplates,
                favoriteStandards,
                selfAssessments,
                speakingSessions,
                analysisResults,
                tests,
                studentTests,
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
                ...state.commentSnippets.map((cs) => this.adapter.upsertCommentSnippet(cs)),
                ...state.commentBank.map((cb) => this.adapter.upsertCommentBankItem(cb)),
                ...state.favoriteStandards.map((fs) => this.adapter.upsertFavoriteStandard(fs)),
                ...state.selfAssessments.map((sa) => this.adapter.upsertSelfAssessment(sa)),
                ...state.speakingSessions.map((ss) => this.adapter.upsertSpeakingSession(ss)),
                ...state.analysisResults.map((ar) => this.adapter.upsertAnalysisResult(ar)),
                ...state.tests.map((t) => this.adapter.upsertTest(t)),
                ...state.studentTests.map((st) => this.adapter.upsertStudentTest(st)),
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
        try {
            switch (entity) {
                case 'rubric':
                    if (action === 'upsert') result = await this.adapter.upsertRubric(payload as Rubric);
                    else if (id) result = await this.adapter.deleteRubric(id);
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
                case 'commentSnippet':
                    if (action === 'upsert')
                        result = await this.adapter.upsertCommentSnippet(payload as CommentSnippet);
                    else if (id) result = await this.adapter.deleteCommentSnippet(id);
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
                case 'settings':
                    if (action === 'upsert')
                        result = await this.adapter.saveSettings(payload as import('../../types').AppSettings);
                    break;
            }
            if (result && !result.success) {
                throw new Error(result.error || `sync ${entity} ${action} rejected`);
            }
            this.pushOneFailCount = 0;
        } catch (e) {
            console.warn(`[sync] pushOne(${entity}, ${action}) failed`, e);
            addToPendingQueue({ entity, action, payload, entityId: id });
            this.pushOneFailCount++;
            if (this.pushOneFailCount === 3 && this.toastFn) {
                this.toastFn(i18n.t('toast.sync_push_failed'), 'warning');
            }
        }
    }
}

export const storageSync = new StorageSyncService();
