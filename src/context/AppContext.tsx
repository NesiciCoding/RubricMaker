import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    ReactNode,
} from 'react';
import {
    AppContextValue,
    LOCAL_MODE_KEY,
    MIGRATION_DONE_KEY,
    flushToLocalStorage,
    isOffline,
    loggingReducer,
    StoreData,
} from './storeCore';
import { createSelectorStore, StoreProvider } from './useStore';

import { useRoster, RosterProvider } from './domains/roster';
import { useAuthoring, AuthoringProvider } from './domains/authoring';
import { useAssessment, AssessmentProvider } from './domains/assessment';
import { useEssays, EssaysProvider } from './domains/essays';
import { useFlashcards, FlashcardsProvider } from './domains/flashcards';
import { useSettings, SettingsProvider } from './domains/settings';
import { usePlatform, PlatformProvider } from './domains/platform';
import { useTranslation } from 'react-i18next';
import { useToast } from '../hooks/useToast';
import { loadDb, getDb } from '../services/database/lazyDb';
import { loadStore, loadPendingQueue, onStorageQuotaExceeded, sanitizeClassYears } from '../store/storage';
import { loadSupabaseConfig, saveSupabaseConfig } from '../services/database/supabaseConfig';
import { mergeStoreData } from '../utils/syncMerge';
import { diffCollection } from '../utils/syncDiff';
import { buildAccentScale, ACCENT_SCALE_STEPS } from '../utils/accentScale';
import { isRtlLanguage } from '../utils/rtlLanguages';
import { initClientLogger, setLoggerContext, STRESS_TEST_LOGGING_ENABLED } from '../services/logging/clientLogger';
import { initAuditLogger, clearAuditLogger } from '../services/database/AuditLogger';
import type { DatabaseConfig } from '../services/database';

// The merged view for tests and object-form call sites — app code must use the
// domain hooks (enforced by the no-restricted-syntax ESLint rule).
export function useApp(): AppContextValue {
    const roster = useRoster();
    const authoring = useAuthoring();
    const assessment = useAssessment();
    const essays = useEssays();
    const flashcards = useFlashcards();
    const settings = useSettings();
    const platform = usePlatform();
    return useMemo(
        () => ({ ...settings, ...roster, ...authoring, ...assessment, ...essays, ...flashcards, ...platform }),
        [roster, authoring, assessment, essays, flashcards, settings, platform]
    );
}

export { useRoster } from './domains/roster';
export { useAuthoring } from './domains/authoring';
export { useAssessment } from './domains/assessment';
export { useEssays } from './domains/essays';
export { useFlashcards } from './domains/flashcards';
export { useSettings } from './domains/settings';
export { usePlatform } from './domains/platform';

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(loggingReducer, null, loadStore);
    const initialStateRef = useRef(state);
    const currentStateRef = useRef(state);
    // Synced during render (not in an effect) so ref-based action reads — including render-time
    // predicates like `isFavoriteStandard` — see the state being rendered. Deliberate deviation
    // from the react-hooks/refs rule: a discarded render is corrected by the next committed one,
    // whereas effect-only sync would leave render-time predicates one dispatch stale.
    // eslint-disable-next-line react-hooks/refs
    currentStateRef.current = state;
    // Backs the delta-sync diff effect further below (compares each render's
    // state to the last one to decide what to push to Supabase).
    const prevStateRef = useRef(state);
    // Applies a merged hydrate/reconnect snapshot and, for the paths that read
    // shared/foreign rows a session may not own (e.g. a student's classmates),
    // seeds the diff baseline in the same step. Centralized so the seed/no-seed
    // choice can't drift out of sync between call sites the way it caused this
    // bug in the first place.
    const applyHydrated = useCallback((mergedIn: StoreData, seedDiffBaseline: boolean) => {
        const merged = { ...mergedIn, classes: sanitizeClassYears(mergedIn.classes) };
        dispatch({ type: 'SET_ALL', payload: merged });
        if (seedDiffBaseline) {
            prevStateRef.current = merged;
        }
    }, []);
    const { showToast } = useToast();
    const { t } = useTranslation();

    // storage.ts swallows quota errors internally (saveStudentRubrics retries
    // once without audio first) so a reducer case never throws mid-update; this
    // surfaces that failure to the user only while genuinely offline/disconnected, where
    // localStorage is the only copy of the edit. While connected, this same
    // write is just the disposable next-boot offline-readiness cache (see the
    // "Storage rule" in CLAUDE.md) — Supabase already has the real data, so a
    // quota hit there isn't data loss and shouldn't alarm the user.
    useEffect(() => {
        onStorageQuotaExceeded(() => {
            if (isOffline()) showToast(t('toast.storage_full'), 'error');
        });
    }, [showToast, t]);

    // 'checking' while we detect session; 'show' = show landing; 'hide' = in app
    const [landingState, setLandingState] = useState<'checking' | 'show' | 'hide'>('checking');
    // Ref so the OTP handler ([] deps effect) can read current state without
    // re-subscribing on every landingState change.
    const landingStateRef = useRef<'checking' | 'show' | 'hide'>('checking');
    useEffect(() => {
        landingStateRef.current = landingState;
    }, [landingState]);
    const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', state.settings.theme);
    }, [state.settings.theme]);

    useEffect(() => {
        const root = document.documentElement;
        const accent = state.settings.accentColor;
        if (!accent) {
            // No custom accent chosen — let the theme's own --accent (Warm Scholar tokens, per light/dark) stand.
            root.style.removeProperty('--accent');
            root.style.removeProperty('--accent-hover');
            root.style.removeProperty('--accent-soft');
            root.style.removeProperty('--accent-glow');
            for (const step of ACCENT_SCALE_STEPS) {
                root.style.removeProperty(`--accent-${step}`);
            }
            return;
        }
        root.style.setProperty('--accent', accent);
        root.style.setProperty('--accent-hover', accent);
        root.style.setProperty('--accent-soft', `${accent}26`);
        root.style.setProperty('--accent-glow', `${accent}66`);
        const scale = buildAccentScale(accent);
        for (const step of ACCENT_SCALE_STEPS) {
            root.style.setProperty(`--accent-${step}`, scale[step]);
        }
    }, [state.settings.accentColor]);

    useEffect(() => {
        const fontKey = state.settings.uiFontFamily;
        if (!fontKey) {
            // No custom UI font chosen — let the theme's own --font (Hanken Grotesk) stand.
            document.documentElement.style.removeProperty('--font');
            return;
        }
        const GOOGLE_FONTS: Record<string, string> = {
            Inter: 'Inter:wght@300;400;500;600;700',
            Nunito: 'Nunito:wght@400;500;600;700',
            'Source Sans 3': 'Source+Sans+3:wght@400;500;600;700',
            Lato: 'Lato:wght@400;700',
            Roboto: 'Roboto:wght@400;500;700',
        };
        document.documentElement.style.setProperty('--font', `'${fontKey}', system-ui, sans-serif`);
        if (GOOGLE_FONTS[fontKey]) {
            let link = document.getElementById('app-gfont') as HTMLLinkElement | null;
            if (!link) {
                link = document.createElement('link');
                link.id = 'app-gfont';
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
            link.href = `https://fonts.googleapis.com/css2?family=${GOOGLE_FONTS[fontKey]}&display=swap`;
        }
    }, [state.settings.uiFontFamily]);

    useEffect(() => {
        document.documentElement.dir = isRtlLanguage(state.settings.language) ? 'rtl' : 'ltr';
    }, [state.settings.language]);

    useEffect(() => {
        const root = document.documentElement;
        if (state.settings.dyslexiaFriendlyMode) {
            root.style.setProperty('--line-height', '1.8');
            root.style.setProperty('--letter-spacing', '0.04em');
        } else {
            root.style.removeProperty('--line-height');
            root.style.removeProperty('--letter-spacing');
        }
    }, [state.settings.dyslexiaFriendlyMode]);

    // ── Startup: detect local mode / existing session / OAuth callback ────────
    useEffect(() => {
        if (localStorage.getItem(LOCAL_MODE_KEY) === 'true') {
            setLandingState('hide');
            return;
        }

        const config = loadSupabaseConfig();
        if (!config) {
            setLandingState('show');
            return;
        }

        // Guard: ensures configure+hydrate runs at most once (startup OR auth-change, not both)
        let sessionHandled = false;
        let cancelled = false;
        let unsubAuth: (() => void) | undefined;

        // storageSync only loads once a config is actually present (above) — see
        // services/database/lazyDb.ts for why this is deferred behind a dynamic import.
        loadDb()
            .then(({ storageSync }) => {
                if (cancelled) return;

                async function configureAndEnter(cfg: DatabaseConfig) {
                    if (sessionHandled) return;
                    sessionHandled = true;
                    saveSupabaseConfig(cfg);
                    const ok = await storageSync.configure(cfg);
                    if (!ok) {
                        setLandingState('show');
                        return;
                    }
                    storageSync.setToastFn(showToast);
                    if (!navigator.onLine) {
                        showToast(t('toast.sync_offline_cache'), 'info');
                        setLandingState('hide');
                        return;
                    }
                    const { data: fresh, error: hydrateError } = await storageSync.hydrate();
                    if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
                    if (fresh) {
                        // After an owner switch the in-memory state still holds the previous
                        // user's data — merge against the freshly wiped store instead.
                        const base = storageSync.didWipeLocalData() ? loadStore() : initialStateRef.current;
                        const merged = mergeStoreData(base, fresh, loadPendingQueue());
                        applyHydrated(merged, true);
                        try {
                            await flushToLocalStorage(merged);
                        } catch {
                            showToast(t('toast.storage_full'), 'error');
                        }
                    }
                    setLandingState('hide');
                }

                storageSync
                    .initAuth(config)
                    .then(async () => {
                        if (cancelled) return;
                        if (!storageSync.hasSession()) {
                            setLandingState('show');
                            return;
                        }

                        // Session already existed on startup — connect and hydrate immediately
                        await configureAndEnter(config);

                        // Show migration prompt once if local data exists and hasn't been migrated
                        if (localStorage.getItem(MIGRATION_DONE_KEY) !== 'true' && !storageSync.didWipeLocalData()) {
                            const s = initialStateRef.current;
                            if (s.rubrics.length > 0 || s.students.length > 0 || s.classes.length > 0) {
                                setShowMigrationPrompt(true);
                            }
                        }
                    })
                    .catch((e) => {
                        if (cancelled) return;
                        console.error('[auth] initAuth failed', e);
                        setLandingState('show');
                    });

                // Listen for sign-in that happens while the landing page is showing (e.g., OTP)
                unsubAuth = storageSync.onAuthChange(async (user) => {
                    if (cancelled || !user) return;
                    const cfg = loadSupabaseConfig();
                    if (!cfg) return;
                    try {
                        await configureAndEnter(cfg);
                    } catch (e) {
                        console.error('[auth] onAuthChange configure failed', e);
                        setLandingState('show');
                    }
                });
            })
            .catch((e) => {
                if (cancelled) return;
                console.error('[startup] failed to load database module', e);
                setLandingState('show');
            });

        return () => {
            cancelled = true;
            unsubAuth?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Stress-test logging + audit logger: keep in sync with auth + role ────────
    useEffect(() => {
        const db = getDb();
        const userId = db?.storageSync.getCurrentUserId() ?? null;
        const client = db?.storageSync.adapter.getClient() ?? null;
        if (client && userId) initAuditLogger(client, userId);
        else clearAuditLogger();

        if (!STRESS_TEST_LOGGING_ENABLED) return;
        const ctx = {
            role: state.settings.userRole,
            schoolId: state.settings.schoolId,
            userId: userId ?? undefined,
        };
        if (client) initClientLogger(client, ctx);
        else setLoggerContext(ctx);
        // landingState is a dep purely to re-run this once loadDb() has resolved (it only
        // ever transitions 'checking' -> 'show'/'hide' after the startup effect's loadDb()
        // call above settles), so getDb() is populated by the time this re-fires.
    }, [state.settings.userRole, state.settings.schoolId, landingState]);

    // ── Re-hydrate from Supabase when the network comes back online ──────────────
    useEffect(() => {
        let cancelled = false;
        const unsubs: Array<() => void> = [];
        loadDb()
            .then(({ storageSync }) => {
                if (cancelled) return;
                const applyFresh = async (fresh: Partial<StoreData>, changedKeys?: Set<keyof StoreData>) => {
                    const merged = mergeStoreData(currentStateRef.current, fresh, loadPendingQueue());
                    applyHydrated(merged, true);
                    try {
                        await flushToLocalStorage(merged, changedKeys);
                    } catch {
                        // quota error — non-fatal on reconnect
                    }
                };
                unsubs.push(
                    storageSync.onNetworkReconnect(async () => {
                        if (!storageSync.isConnected()) return;
                        const { data: fresh } = await storageSync.hydrate();
                        if (fresh) await applyFresh(fresh);
                    })
                );
                // Realtime: a remote row change refreshes only the affected collections
                // (targeted partial hydrate) instead of re-pulling all ~30 tables, and rewrites
                // only those localStorage keys. Unknown tables / settings degrade to a full
                // hydrate (and full flush) so nothing is ever dropped.
                unsubs.push(
                    storageSync.onRealtimeChange(async (tables) => {
                        if (!storageSync.isConnected()) return;
                        const { data, fullFallback } = await storageSync.hydratePartial(new Set(tables));
                        if (fullFallback) {
                            const { data: full } = await storageSync.hydrate();
                            if (full) await applyFresh(full);
                        } else if (data) {
                            await applyFresh(data, new Set(Object.keys(data) as (keyof StoreData)[]));
                        }
                    })
                );
            })
            .catch((e) => {
                if (!cancelled) console.error('[sync] failed to load database module for reconnect handling', e);
            });
        return () => {
            cancelled = true;
            unsubs.forEach((u) => u());
        };
    }, []);

    // ── Handle in-page OTP login (no page reload, so startup effect won't re-run) ──
    useEffect(() => {
        let cancelled = false;
        let unsub: (() => void) | undefined;
        loadDb()
            .then(({ storageSync }) => {
                if (cancelled) return;
                unsub = storageSync.onAuthChange(async (user) => {
                    // Only run when the landing page is genuinely visible.
                    // During startup landingStateRef.current === 'checking', which prevents
                    // this handler from racing with the startup configureAndEnter flow and
                    // calling setLandingState('checking') mid-interaction (which unmounts
                    // all routes, destroying any mounted component's local state).
                    if (!user || storageSync.isConnected() || landingStateRef.current !== 'show') return;
                    const config = loadSupabaseConfig();
                    if (!config) return;
                    setLandingState('checking');
                    try {
                        const ok = await storageSync.configure(config);
                        if (!ok) {
                            setLandingState('show');
                            return;
                        }
                        storageSync.setToastFn(showToast);
                        const { data: fresh, error: hydrateError } = await storageSync.hydrate();
                        if (hydrateError) showToast(t('toast.sync_load_failed'), 'warning');
                        if (fresh) {
                            const base = storageSync.didWipeLocalData() ? loadStore() : initialStateRef.current;
                            const merged = mergeStoreData(base, fresh, loadPendingQueue());
                            applyHydrated(merged, true);
                            try {
                                await flushToLocalStorage(merged);
                            } catch {
                                showToast(t('toast.storage_full'), 'error');
                            }
                        }
                        setLandingState('hide');
                    } catch (e) {
                        console.error('[auth] OTP login flow failed', e);
                        setLandingState('show');
                    }
                });
            })
            .catch((e) => {
                if (!cancelled) console.error('[auth] failed to load database module for in-page OTP handling', e);
            });
        return () => {
            cancelled = true;
            unsub?.();
        };
    }, []);

    // ── Supabase: delta-sync after each mutation ───────────────────────────────
    useEffect(() => {
        const prev = prevStateRef.current;

        prevStateRef.current = state;
        const db = getDb();
        if (!db?.storageSync.isConnected()) return;
        const { storageSync } = db;

        // Always pass id (not just on delete) — entities like essayBatchAssignment have no
        // `id`/`guid` field on the payload itself (they're keyed by a composite of other
        // fields), so the pending-queue dedup/protection logic needs it explicitly rather
        // than deriving it from the payload.
        function diff<T>(prevArr: T[], currArr: T[], entity: string, getId: (x: T) => string) {
            const { upserted, deletedIds } = diffCollection(prevArr, currArr, getId);
            // Bulk actions (e.g. assign a rubric to a whole class) go through pushMany, which
            // collapses them into a single array upsert / delete where the entity supports it and
            // falls back to per-row otherwise. A single change stays a plain pushOne.
            if (deletedIds.length > 1) storageSync.pushMany(entity, 'delete', [], deletedIds);
            else for (const id of deletedIds) storageSync.pushOne(entity, 'delete', null, id);
            if (upserted.length > 1) storageSync.pushMany(entity, 'upsert', upserted, upserted.map(getId));
            else for (const item of upserted) storageSync.pushOne(entity, 'upsert', item, getId(item));
        }

        diff(prev.rubrics, state.rubrics, 'rubric', (r) => r.id);
        diff(prev.classes, state.classes, 'class', (c) => c.id);
        diff(prev.students, state.students, 'student', (s) => s.id);
        diff(prev.studentRubrics, state.studentRubrics, 'studentRubric', (sr) => sr.id);
        diff(prev.peerReviews, state.peerReviews, 'peerReview', (sr) => sr.id);
        diff(prev.attachments, state.attachments, 'attachment', (a) => a.id);
        diff(prev.gradeScales, state.gradeScales, 'gradeScale', (gs) => gs.id);
        diff(prev.commentBank, state.commentBank, 'commentBankItem', (cb) => cb.id);
        diff(prev.exportTemplates, state.exportTemplates, 'exportTemplate', (t) => t.id);
        diff(prev.favoriteStandards, state.favoriteStandards, 'favoriteStandard', (fs) => fs.guid);
        diff(prev.selfAssessments, state.selfAssessments, 'selfAssessment', (sa) => sa.id);
        diff(prev.speakingSessions, state.speakingSessions, 'speakingSession', (ss) => ss.id);
        diff(prev.analysisResults, state.analysisResults, 'analysisResult', (ar) => ar.id);
        diff(prev.tests, state.tests, 'test', (t) => t.id);
        diff(prev.studentTests, state.studentTests, 'studentTest', (st) => st.id);
        diff(
            prev.essayAssignments,
            state.essayAssignments,
            'essayBatchAssignment',
            (a) => `${a.teacherKey}:${a.studentId}`
        );
        diff(prev.essaySubmissions, state.essaySubmissions, 'essayOfflineSubmission', (s) => s.id);
        diff(prev.userTemplates, state.userTemplates, 'userTemplate', (ut) => ut.id);
        diff(prev.flashcardDecks, state.flashcardDecks, 'flashcardDeck', (d) => d.id);
        diff(
            prev.flashcardAssignments,
            state.flashcardAssignments,
            'flashcardAssignment',
            (a) => `${a.deckId}:${a.studentId}`
        );
        diff(prev.flashcardReviews, state.flashcardReviews, 'flashcardReview', (r) => r.id);
        diff(prev.standardMasteryTargets, state.standardMasteryTargets, 'standardMasteryTarget', (t) => t.id);
        diff(prev.newsFlashes, state.newsFlashes, 'newsFlash', (f) => f.id);
        diff(prev.newsFlashReads, state.newsFlashReads, 'newsFlashRead', (r) => r.id);
        diff(prev.questionBank, state.questionBank, 'questionBankItem', (q) => q.id);
        diff(prev.documentComments, state.documentComments, 'documentComment', (c) => c.id);
        diff(prev.notificationDismissals, state.notificationDismissals, 'notificationDismissal', (d) => d.id);

        if (prev.settings !== state.settings && JSON.stringify(prev.settings) !== JSON.stringify(state.settings)) {
            storageSync.pushOne('settings', 'upsert', state.settings);
        }
    }, [state]);

    // The store's getState closure reads the ref lazily (on subscribe/snapshot reads), and
    // the ref is synced during render above — same deliberate pattern as the ref-based
    // action reads, so the eslint-disable is warranted.
    // eslint-disable-next-line react-hooks/refs
    const selectorStore = useMemo(() => createSelectorStore(() => currentStateRef.current, dispatch), [dispatch]);
    // Notify in the layout phase so selector consumers re-check their snapshots before paint.
    useLayoutEffect(() => {
        selectorStore.notify();
    }, [state, selectorStore]);

    const actionsCtx = useMemo(() => ({ getState: () => currentStateRef.current, dispatch }), [dispatch]);
    const platformCtx = useMemo(
        () => ({
            getState: () => currentStateRef.current,
            dispatch,
            showToast,
            t,
            setLandingState,
            setShowMigrationPrompt,
            applyHydrated,
        }),
        [dispatch, showToast, t, setLandingState, setShowMigrationPrompt, applyHydrated]
    );

    return (
        <StoreProvider store={selectorStore}>
            <RosterProvider ctx={actionsCtx} state={state}>
                <AuthoringProvider ctx={actionsCtx} state={state}>
                    <AssessmentProvider ctx={actionsCtx} state={state}>
                        <EssaysProvider ctx={actionsCtx} state={state}>
                            <FlashcardsProvider ctx={actionsCtx} state={state}>
                                <SettingsProvider ctx={actionsCtx} state={state}>
                                    <PlatformProvider
                                        ctx={platformCtx}
                                        landingState={landingState}
                                        showMigrationPrompt={showMigrationPrompt}
                                    >
                                        {children}
                                    </PlatformProvider>
                                </SettingsProvider>
                            </FlashcardsProvider>
                        </EssaysProvider>
                    </AssessmentProvider>
                </AuthoringProvider>
            </RosterProvider>
        </StoreProvider>
    );
}
