import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useParams } from 'react-router-dom';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getMonitorClient, MONITOR_CHANNELS_PER_CLIENT, releaseStaleChannels } from '../utils/monitorClient';
import {
    Eye,
    EyeOff,
    AlertTriangle,
    Database,
    Send,
    SlidersHorizontal,
    BarChart3,
    ListChecks,
    Hourglass,
    Gauge,
    AlignLeft,
    Flag,
    PenLine,
    TrendingUp,
    TrendingDown,
    MoveRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import HelpPopover from '../components/ui/HelpPopover';
import { InlineMonitorSkeleton } from '../components/ui/Skeleton';
import { useAssessment, useEssays, useStudents, useClasses, useSettings } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { useDbStatus } from '../hooks/useDbStatus';
import { useOwnOrSharedItem } from '../hooks/useSharedMaterials';
import { loadSupabaseConfig } from '../services/database';
import { LiveDraftAdapter, type PersistedDraftSnapshot } from '../services/database/LiveDraftAdapter';
import PresenceBadge from '../components/Monitor/PresenceBadge';
import ResponsesGrid from '../components/Monitor/ResponsesGrid';
import LevelResponsesGrid from '../components/Monitor/LevelResponsesGrid';
import ColumnSortModal from '../components/Monitor/ColumnSortModal';
import PlacementLevelPanel from '../components/Monitor/PlacementLevelPanel';
import EssayMonitorRoster from '../components/Monitor/EssayMonitorRoster';
import EssaySpotlight from '../components/Monitor/EssaySpotlight';
import {
    derivePresence,
    deriveConnectionState,
    type ConnectionState,
    summarizeProctorFlags,
    mergeProctorEvents,
} from '../utils/proctorAggregator';
import { estimatePlacement, levelPathRunConfig } from '../utils/placementResult';
import { MAX_QUESTIONS as STAIRCASE_MAX_QUESTIONS } from '../utils/placementStaircase';
import { stripCommentHtml } from '../utils/exportDataPrep';
import { studentCompletion, type StudentCompletion } from '../utils/responseCells';
import { answeredQuestionIds, stuckQuestions } from '../utils/questionStuck';
import { TRIAGE_KEYS, triageCounts, triageMatches, type TriageKey } from '../utils/monitorTriage';
import {
    appendWordSample,
    clampStallMinutes,
    paceVsClass,
    stalledMinutes,
    MIN_STALL_MINUTES,
    MAX_STALL_MINUTES,
    type PaceTrend,
    type WordSample,
} from '../utils/monitorSignals';
import type { ColumnSortRule } from '../utils/responseGridOrder';
import type { ProctorEvent, TestAnswer, CefrLevel, StudentTest, StaircaseStep } from '../types';

const TAB_SWITCH_WARNING_THRESHOLD = 3;

type SortMode = 'active' | 'name' | 'progress' | 'ungraded';

interface StudentLiveState {
    studentId: string;
    events: ProctorEvent[];
    snapshot: {
        text?: string;
        answers?: unknown;
        wordCount?: number;
        generatorLevel?: CefrLevel;
        generatorEloAnchor?: number;
        questionsAsked?: number;
        /** Counts only — characters typed vs pasted, never the text. */
        typedChars?: number;
        pastedChars?: number;
        askedPrompts?: Record<string, string>;
    } | null;
    lastUpdateAt: string | null;
    /** Set when the student broadcasts 'submitted' (or a persisted submission exists). */
    submitted?: boolean;
    /** Epoch ms of the first broadcast this monitor saw — the stall baseline for a student who has not changed anything since. */
    firstSeenAt?: number;
    /** Epoch ms of the last snapshot whose answers/draft actually differed from the previous one. */
    lastChangeAt?: number;
    /** Essay word-count history for the writing-pace readout. */
    wordSamples?: WordSample[];
    /** Essay snapshot history, oldest first: word count plus the draft text when one was sent. */
    snapshots?: { at: number; words?: number; text?: string }[];
}

function snapshotProgressKey(snapshot: StudentLiveState['snapshot']): string {
    if (!snapshot) return '';
    return JSON.stringify([
        snapshot.answers ?? null,
        snapshot.text ?? null,
        snapshot.wordCount ?? null,
        snapshot.questionsAsked ?? null,
    ]);
}

const PACE_BADGE: Record<PaceTrend, { className: string; Icon: typeof TrendingUp }> = {
    ahead: { className: 'badge badge-green', Icon: TrendingUp },
    on_pace: { className: 'badge', Icon: MoveRight },
    behind: { className: 'badge badge-red', Icon: TrendingDown },
};

function emptyLiveState(studentId: string): StudentLiveState {
    return { studentId, events: [], snapshot: null, lastUpdateAt: null };
}

/**
 * Folds stored snapshots into a student's live state without overwriting anything the channels
 * have already delivered: after a reload the roster shows the same draft, pace and age it would
 * have shown had the tab never dropped.
 */
function applyPersistedSnapshots(current: StudentLiveState, history: PersistedDraftSnapshot[]): StudentLiveState {
    const wordSamples = [
        ...(current.wordSamples ?? []),
        ...history.map((snapshot) => ({ at: snapshot.at, words: snapshot.wordCount })),
    ]
        .sort((a, b) => a.at - b.at)
        .reduce<WordSample[]>(appendWordSample, []);
    const byAt = new Map<number, NonNullable<StudentLiveState['snapshots']>[number]>();
    for (const entry of current.snapshots ?? []) byAt.set(entry.at, entry);
    for (const snapshot of history) {
        if (snapshot.text !== undefined && !byAt.has(snapshot.at)) {
            byAt.set(snapshot.at, { at: snapshot.at, words: snapshot.wordCount, text: snapshot.text });
        }
    }
    const snapshots = [...byAt.values()].sort((a, b) => a.at - b.at).slice(-8);
    const latest = history[history.length - 1];
    const latestWithText = [...history]
        .reverse()
        .find((snapshot): snapshot is PersistedDraftSnapshot & { text: string } => snapshot.text !== undefined);
    const stored = latestWithText ? { text: latestWithText.text, wordCount: latestWithText.wordCount } : null;
    return {
        ...current,
        wordSamples,
        snapshots,
        snapshot: current.snapshot
            ? current.snapshot.text === undefined && stored
                ? { ...current.snapshot, text: stored.text, wordCount: current.snapshot.wordCount ?? stored.wordCount }
                : current.snapshot
            : stored,
        lastChangeAt: current.lastChangeAt ?? latest?.at,
        lastUpdateAt: current.lastUpdateAt ?? (latest ? new Date(latest.at).toISOString() : null),
        firstSeenAt: current.firstSeenAt ?? history[0]?.at,
    };
}

interface MonitorStudent {
    studentId: string;
    /** The student's own essay_assignments.id; a batch assignment stores each student's drafts under it, not under the route key. */
    teacherKey?: string;
    name: string;
    classId?: string;
    className?: string;
    persistedEvents: ProctorEvent[];
    persistedAnswers: TestAnswer[];
    /** The submitted attempt, if any — used to replay a persisted placement estimate/answers after the live channel is gone. */
    studentTest?: StudentTest;
    status?: 'submitted' | 'opened' | 'late';
}

export interface LiveMonitorPageProps {
    kind: 'test' | 'essay';
}

export default function LiveMonitorPage({ kind }: LiveMonitorPageProps) {
    const { t } = useTranslation();
    const tour = usePageTourState('monitor');
    const params = useParams<{ testId?: string; assignmentId?: string }>();
    const { students } = useStudents();
    const { classes } = useClasses();

    const { tests, studentTests, fetchTestAssignmentTeacherKeys, setPlacementOverride } = useAssessment();

    const { settings, updateSettings } = useSettings();
    const showProgress = settings.monitorShowStudentProgress ?? false;
    const showClassProgress = settings.monitorShowClassProgress ?? false;
    const flagStalled = settings.monitorFlagStalled ?? false;
    const stallMinutes = clampStallMinutes(settings.monitorStallMinutes);
    const showPace = settings.monitorShowPace ?? false;
    const showStatusSummary = settings.monitorShowStatusSummary ?? false;
    const showMilestones = settings.monitorShowMilestones ?? false;
    const showEstimateConfidence = settings.monitorShowEstimateConfidence ?? false;
    const showWritingPace = settings.monitorShowWritingPace ?? false;

    const { showToast } = useToast();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [hideNames, setHideNames] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('active');
    const [classFilter, setClassFilter] = useState<string>('all');
    // A class selected for one test may not exist in the next: reset so the new
    // test never opens with every student filtered out and no way to recover.
    const monitoredKey = kind === 'test' ? (params.testId ?? '') : (params.assignmentId ?? '');
    useEffect(() => {
        setClassFilter('all');
    }, [monitoredKey]);
    const [startedOnly, setStartedOnly] = useState(false);
    // A triage chip narrows the grid to the students the strip counted.
    const [triageFilter, setTriageFilter] = useState<TriageKey | null>(null);
    const [columnSortRules, setColumnSortRules] = useState<ColumnSortRule[]>([{ key: 'original', dir: 'asc' }]);
    const [sortModalOpen, setSortModalOpen] = useState(false);
    const [liveStates, setLiveStates] = useState<Record<string, StudentLiveState>>({});
    const [essayAssignment, setEssayAssignment] = useState<{
        rubricId: string;
        studentId: string;
        title: string;
    } | null>(null);
    const [essayAssignmentLoading, setEssayAssignmentLoading] = useState(kind === 'essay');
    // The one student whose 5s spotlight view is open. A single-student assignment opens straight
    // into it; a class roster starts on the per-minute roster.
    const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
    const [testTeacherKeys, setTestTeacherKeys] = useState<Record<string, string>>({});
    // Which test.id the teacher-key lookup has finished for. The lookup is what reveals
    // in-progress students (they have no `student_tests` row until hand-in), so until it
    // settles the grid must show skeleton tiles rather than a premature "no students" empty
    // state. Recording the resolved id — instead of flipping a boolean in the effect — is
    // what makes the pending state apply on the very first frame after switching from one
    // test's monitor to another's, where the page is not remounted.
    const [testTeacherKeysSettledFor, setTestTeacherKeysSettledFor] = useState<string | null>(null);

    const { essayAssignments, fetchEssayAssignmentByKey, fetchEssaySubmissions, fetchAllEssaySubmissions } =
        useEssays();

    const hasDb = dbStatus.isConnected && !!config?.supabaseUrl && !!config?.supabaseAnonKey;

    const ownTest = kind === 'test' ? tests.find((tst) => tst.id === params.testId) : undefined;
    // A co-teacher can open the monitor for a test a colleague assigned (shared, or used in a
    // co-taught class) — the assignment row is owned by the test's owner either way.
    const { item: test } = useOwnOrSharedItem('test', kind === 'test' ? params.testId : undefined, ownTest);

    // Derived during render so it is already true for a test whose lookup has not started.
    const testTeacherKeysLoading =
        kind === 'test' && test !== undefined && hasDb && testTeacherKeysSettledFor !== test.id;

    // ── Essay assignment lookup (teacher-owned row, by teacherKey) ───────────────
    useEffect(() => {
        if (kind !== 'essay' || !params.assignmentId || !hasDb) {
            setEssayAssignmentLoading(false);
            return;
        }
        let cancelled = false;
        const assignmentId = params.assignmentId; // narrowed: the guard above already checked it
        setEssayAssignmentLoading(true);
        fetchEssayAssignmentByKey(assignmentId)
            .then((result) => {
                if (cancelled) return;
                setEssayAssignment(result ?? null);
            })
            .catch(() => {
                if (!cancelled) setEssayAssignment(null);
            })
            .finally(() => {
                if (!cancelled) setEssayAssignmentLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [kind, params.assignmentId, hasDb, fetchEssayAssignmentByKey]);

    // ── Test teacherKey lookup (Realtime channel name = the per-student teacherKey,
    // not a testId/studentId guess — see assignmentKeyFor below) ─────────────────
    useEffect(() => {
        if (kind !== 'test' || !test || !hasDb) return;
        let cancelled = false;
        const testId = test.id;
        // Reset before fetching: this effect re-fires when `test.id` changes (the route
        // doesn't remount LiveMonitorPage between two tests' monitor pages), and without
        // this a student who overlaps between the two tests would transiently render
        // keyed to the PREVIOUS test's teacherKey/channel until the new fetch resolves.
        setTestTeacherKeys({});
        fetchTestAssignmentTeacherKeys(testId)
            .then((keys) => {
                if (!cancelled) setTestTeacherKeys(keys);
            })
            .catch(() => {
                if (!cancelled) setTestTeacherKeys({});
            })
            .finally(() => {
                if (!cancelled) setTestTeacherKeysSettledFor(testId);
            });
        return () => {
            cancelled = true;
        };
        // `test` itself is read above (not just test.id) — depending on test?.id rather than the
        // object keeps this effect (and the realtime channels it indirectly rebuilds via
        // testTeacherKeys) from tearing down on every live useSharedMaterials refresh, which
        // replaces the whole cache array and so gives `test` a new reference even when nothing
        // about THIS test changed (e.g. a colleague's unrelated rubric or folder changed).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, test?.id, hasDb, fetchTestAssignmentTeacherKeys]);

    // ── Resolve the list of monitored students ───────────────────────────────────
    const monitorStudents = useMemo<MonitorStudent[]>(() => {
        if (kind === 'test') {
            if (!test) return [];
            const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
            // `student_tests` rows are only written on final submit (see submit-test edge
            // function), so a student who has opened the test but not yet submitted has no
            // row there. Union in every student with a resolved assignment teacherKey too,
            // otherwise an in-progress student never appears here for a DB-mode test — the
            // "live" in live monitor would only ever show already-finished attempts.
            const studentIds = new Set([
                ...relevantStudentTests.map((st) => st.studentId),
                ...Object.keys(testTeacherKeys),
            ]);
            return Array.from(studentIds)
                .map((studentId) => {
                    const student = students.find((s) => s.id === studentId);
                    const st = relevantStudentTests.find((row) => row.studentId === studentId);
                    const submitted = st?.status === 'submitted' || st?.status === 'graded';
                    const isLate = submitted && !!test.dueDate && !!st?.submittedAt && st.submittedAt > test.dueDate;
                    return {
                        studentId,
                        name: student?.name ?? studentId,
                        classId: student?.classId,
                        className: classes.find((c) => c.id === student?.classId)?.name,
                        persistedEvents: st?.events ?? [],
                        persistedAnswers: st?.answers ?? [],
                        studentTest: st,
                        status: isLate
                            ? 'late'
                            : submitted
                              ? 'submitted'
                              : st?.status === 'in_progress'
                                ? 'opened'
                                : undefined,
                    } satisfies MonitorStudent;
                })
                .filter((row) => students.some((s) => s.id === row.studentId));
        }

        // Essay: one teacherKey can cover a whole class (a batch assignment writes a row per
        // student under the same key), so every student holding a row for it is monitored. The
        // single row fetched from Supabase is the fallback for a monitor opened before the
        // hydrated roster arrived, which keeps a one-student assignment working on its own.
        const essayStudentIds = new Set<string>();
        const essayTeacherKeys = new Map<string, string>();
        for (const assignment of essayAssignments ?? []) {
            if (assignment.teacherKey !== params.assignmentId && assignment.sourceTeacherKey !== params.assignmentId)
                continue;
            essayStudentIds.add(assignment.studentId);
            essayTeacherKeys.set(assignment.studentId, assignment.teacherKey);
        }
        if (essayAssignment) {
            essayStudentIds.add(essayAssignment.studentId);
            essayTeacherKeys.set(essayAssignment.studentId, params.assignmentId ?? '');
        }
        return Array.from(essayStudentIds)
            .map((studentId): MonitorStudent | null => {
                const student = students.find((s) => s.id === studentId);
                if (!student) return null;
                return {
                    studentId: student.id,
                    teacherKey: essayTeacherKeys.get(student.id),
                    name: student.name,
                    classId: student.classId,
                    className: classes.find((c) => c.id === student.classId)?.name,
                    persistedEvents: [],
                    persistedAnswers: [],
                };
            })
            .filter((row): row is MonitorStudent => row !== null);
    }, [
        kind,
        test,
        students,
        classes,
        studentTests,
        essayAssignment,
        essayAssignments,
        params.assignmentId,
        testTeacherKeys,
    ]);

    // ── Persisted essay hand-ins ───────────────────────────────────────────────────
    // A submission may already exist before the monitor opens (the student handed in from a tab
    // that is now closed), so seed each roster row's submitted flag instead of waiting for a live
    // 'submitted' broadcast. One student uses the per-assignment fetch; a class roster needs the
    // per-student attribution that only the full submission list carries.
    const essayRosterKey = kind === 'essay' ? monitorStudents.map((row) => row.studentId).join(',') : '';
    useEffect(() => {
        if (kind !== 'essay' || !params.assignmentId || !hasDb || !essayRosterKey) return;
        const assignmentId = params.assignmentId;
        let cancelled = false;
        const markSubmitted = (submitted: Map<string, string>) => {
            if (cancelled || submitted.size === 0) return;
            setLiveStates((prev) => {
                const next = { ...prev };
                for (const [studentId, persistedAt] of submitted) {
                    const current = next[studentId] ?? emptyLiveState(studentId);
                    const lastUpdateAt =
                        persistedAt && (!current.lastUpdateAt || persistedAt > current.lastUpdateAt)
                            ? persistedAt
                            : (current.lastUpdateAt ?? new Date().toISOString());
                    next[studentId] = { ...current, submitted: true, lastUpdateAt };
                }
                return next;
            });
        };
        const finish = (promise: Promise<void>) => {
            promise.catch(() => {
                // Non-fatal: the live broadcast path still covers an in-session submit.
            });
        };
        if (monitorStudents.length === 1) {
            finish(
                fetchEssaySubmissions(assignmentId).then((rows) => {
                    const latest = rows[0];
                    if (latest) markSubmitted(new Map([[monitorStudents[0].studentId, latest.submittedAt]]));
                })
            );
        } else {
            finish(
                fetchAllEssaySubmissions().then((rows) => {
                    const submitted = new Map<string, string>();
                    for (const row of rows) {
                        if (row.assignmentId !== assignmentId || !row.studentId) continue;
                        if (!submitted.has(row.studentId)) submitted.set(row.studentId, row.submittedAt);
                    }
                    markSubmitted(submitted);
                })
            );
        }
        return () => {
            cancelled = true;
        };
        // `monitorStudents` itself is rebuilt on every roster read; keying the effect to the ids
        // keeps it from refetching on unrelated state updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind, params.assignmentId, hasDb, essayRosterKey, fetchEssaySubmissions, fetchAllEssaySubmissions]);

    // A one-student assignment is already the spotlight view — open it directly. A class
    // roster starts on the per-minute roster and the teacher picks who to follow.
    useEffect(() => {
        if (kind !== 'essay') return;
        setFocusedStudentId((current) => {
            const stillThere = current !== null && monitorStudents.some((row) => row.studentId === current);
            if (stillThere) return current;
            return monitorStudents.length === 1 ? monitorStudents[0].studentId : null;
        });
    }, [kind, monitorStudents]);

    // ── Per-student assignmentKey derivation ──────────────────────────────────────
    // Essays: the route param IS the persisted teacherKey (essay_assignments.id), so
    // `${teacherKey}:${studentId}` matches exactly what StudentEssayPage broadcasts on.
    // Tests: `testId`/`studentId` alone can't derive the channel key — TestAssignmentModal
    // mints a fresh, unrelated nanoid per share link — so the bare per-student teacherKey
    // (fetched into `testTeacherKeys` above) is used instead, matching StudentTestPage's
    // `assignmentKey: assignment.teacherKey` exactly (no `:studentId` suffix on that side).
    // A student with no resolved teacherKey yet (links not generated, or still loading)
    // gets a key nothing will ever broadcast on — this page still works fully from
    // persisted StudentTest data in that case.
    const assignmentKeyFor = (studentId: string): string => {
        if (kind === 'essay') return `${params.assignmentId}:${studentId}`;
        return testTeacherKeys[studentId] ?? `no-teacher-key:${studentId}`;
    };

    // ── Subscribe to one Realtime channel per monitored student ───────────────────
    // Broadcasts from a full class arrive in bursts (every student's ~5s snapshot
    // interval, join announces, heartbeats), and each one used to trigger its own
    // setLiveStates → full grid recompute across every student × question. Batching
    // same-tick updates into a single flush turns a full-class burst into one
    // re-render instead of dozens.
    //
    // Pending updates are queued as PATCH FUNCTIONS, not precomputed state, and
    // applied against the latest `prev` when the timer fires — not the `current`
    // seen when the broadcast arrived. Precomputing would let a concurrent direct
    // setLiveStates (e.g. the essay-submission persisted-fetch effect above) get
    // clobbered by a stale pending object at flush time.
    const pendingPatchesRef = useRef<Record<string, Array<(current: StudentLiveState) => StudentLiveState>>>({});
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function flushLiveStates() {
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        const pending = pendingPatchesRef.current;
        pendingPatchesRef.current = {};
        if (Object.keys(pending).length === 0) return;
        setLiveStates((prev) => {
            const next = { ...prev };
            for (const [studentId, patches] of Object.entries(pending)) {
                let current = next[studentId] ?? emptyLiveState(studentId);
                for (const patch of patches) current = patch(current);
                next[studentId] = current;
            }
            return next;
        });
    }

    function updateLiveState(studentId: string, patch: (current: StudentLiveState) => StudentLiveState) {
        (pendingPatchesRef.current[studentId] ??= []).push(patch);
        if (flushTimerRef.current) return;
        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            flushLiveStates();
        }, 300);
    }

    // Live state is per student *and* per assignment; a teacher moving from one assignment to the
    // next on a mounted page must not carry the first one's heartbeat history or queued patches over.
    const scopeKey = `${kind}:${params.testId ?? params.assignmentId ?? ''}`;
    const scopeKeyRef = useRef(scopeKey);
    useEffect(() => {
        if (scopeKeyRef.current === scopeKey) return;
        scopeKeyRef.current = scopeKey;
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        pendingPatchesRef.current = {};
        setLiveStates({});
    }, [scopeKey]);

    const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
    useEffect(() => {
        if (!hasDb || monitorStudents.length === 0) return;
        // Shared singleton: re-creating a GoTrueClient per roster change logs
        // "Multiple GoTrueClient instances detected ... rm_monitor_ephemeral"
        // and churns sockets. Reuse cached clients; only channels come and go. A socket can only
        // join so many channels, so large rosters are spread over several clients.
        const topicFor = (studentId: string) => `monitor:${kind}:${assignmentKeyFor(studentId)}`;
        const channelMap = new Map<string, RealtimeChannel>();
        const opened: { client: SupabaseClient; channel: RealtimeChannel }[] = [];
        let cancelled = false;
        const openStudentChannel = (client: SupabaseClient, row: MonitorStudent): RealtimeChannel => {
            const channel = client.channel(topicFor(row.studentId));
            channelMap.set(row.studentId, channel);
            channel
                .on('broadcast', { event: 'event' }, ({ payload }) => {
                    const at = Date.now();
                    updateLiveState(row.studentId, (current) => ({
                        ...current,
                        events: [...current.events, payload as ProctorEvent],
                        lastUpdateAt: new Date(at).toISOString(),
                        firstSeenAt: current.firstSeenAt ?? at,
                    }));
                })
                .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
                    const at = Date.now();
                    updateLiveState(row.studentId, (current) => {
                        const incoming = payload as StudentLiveState['snapshot'];
                        // The roster cadence sends word counts and answers every few seconds but fresh
                        // prose at most once a minute, so a snapshot without text keeps the last draft
                        // the monitor received rather than blanking the preview.
                        const snapshot =
                            incoming?.text === undefined && current.snapshot?.text !== undefined
                                ? { ...incoming, text: current.snapshot.text }
                                : incoming;
                        const changed =
                            current.snapshot === null ||
                            snapshotProgressKey(current.snapshot) !== snapshotProgressKey(snapshot);
                        const words = snapshot?.wordCount;
                        return {
                            ...current,
                            snapshot,
                            lastUpdateAt: new Date(at).toISOString(),
                            firstSeenAt: current.firstSeenAt ?? at,
                            lastChangeAt: changed ? at : current.lastChangeAt,
                            wordSamples:
                                typeof words === 'number'
                                    ? appendWordSample(current.wordSamples ?? [], { at, words })
                                    : current.wordSamples,
                            // Only a text-bearing snapshot is a draft snapshot — stats-only ticks would
                            // otherwise log rows that all show the same prose.
                            snapshots:
                                incoming?.text !== undefined
                                    ? [
                                          ...(current.snapshots ?? []),
                                          {
                                              at,
                                              words: typeof words === 'number' ? words : undefined,
                                              text: incoming.text,
                                          },
                                      ].slice(-8)
                                    : current.snapshots,
                        };
                    });
                })
                .on('broadcast', { event: 'submitted' }, () => {
                    const at = Date.now();
                    updateLiveState(row.studentId, (current) => ({
                        ...current,
                        submitted: true,
                        lastUpdateAt: new Date(at).toISOString(),
                        firstSeenAt: current.firstSeenAt ?? at,
                    }));
                })
                .subscribe();
            return channel;
        };
        for (let start = 0; start < monitorStudents.length; start += MONITOR_CHANNELS_PER_CLIENT) {
            const rows = monitorStudents.slice(start, start + MONITOR_CHANNELS_PER_CLIENT);
            const client = getMonitorClient(
                config!.supabaseUrl,
                config!.supabaseAnonKey,
                start / MONITOR_CHANNELS_PER_CLIENT
            );
            const open = () => {
                if (cancelled) return;
                for (const row of rows) opened.push({ client, channel: openStudentChannel(client, row) });
            };
            const pendingRelease = releaseStaleChannels(
                client,
                rows.map((row) => topicFor(row.studentId))
            );
            if (pendingRelease) void pendingRelease.then(open);
            else open();
        }
        channelsRef.current = channelMap;

        return () => {
            cancelled = true;
            opened.forEach(({ client, channel }) => void client.removeChannel(channel));
            channelsRef.current = new Map();
            // Flush rather than discard: this cleanup also runs when the student list or
            // teacher keys change (still the same assessment) — a queued broadcast (a
            // one-off proctoring event, a 'submitted') must land before channels rebuild,
            // not vanish because nothing else arrives to re-trigger it.
            flushLiveStates();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        hasDb,
        kind,
        params.testId,
        params.assignmentId,
        monitorStudents.map((r) => r.studentId).join(','),
        testTeacherKeys,
    ]);

    // ── Essay spotlight: ask one student for the 5s cadence while their live view is open ──
    // Re-sent every 10s rather than once: the student's channel may not have joined when the
    // view opened, and a broadcast sent before then is silently dropped.
    useEffect(() => {
        if (kind !== 'essay' || !focusedStudentId) return;
        const studentId = focusedStudentId;
        const send = (on: boolean) => {
            channelsRef.current.get(studentId)?.send({ type: 'broadcast', event: 'spotlight', payload: { on } });
        };
        send(true);
        const interval = setInterval(() => send(true), 10_000);
        return () => {
            clearInterval(interval);
            send(false);
        };
    }, [kind, focusedStudentId, monitorStudents.length, hasDb]);

    // ── Persisted draft history ───────────────────────────────────────────────────
    // A reload, a sleeping laptop or a dropped connection empties the channels, and the roster
    // would know nothing until a student writes again. The once-a-minute essay snapshots are
    // stored server-side, so seed from them instead of claiming to know less than the class
    // already did. Tests store no draft history, so their monitors have nothing to seed from.
    const essayAssignmentKey = kind === 'essay' ? (params.assignmentId ?? '') : '';
    const rosterKey = monitorStudents.map((row) => row.studentId).join(',');
    const hydratedRef = useRef('');
    useEffect(() => {
        const hydrationKey = `${essayAssignmentKey}|${rosterKey}`;
        if (!hasDb || !essayAssignmentKey || rosterKey === '' || hydratedRef.current === hydrationKey) return;
        const drafts = LiveDraftAdapter.forTeacher();
        if (!drafts) return;
        let cancelled = false;
        const assignmentKeys = [
            essayAssignmentKey,
            ...monitorStudents.map((row) => row.teacherKey).filter((key): key is string => !!key),
        ];
        drafts
            .listSnapshots(
                assignmentKeys,
                monitorStudents.map((row) => row.studentId)
            )
            .then((byStudent) => {
                if (cancelled) return;
                hydratedRef.current = hydrationKey;
                if (byStudent.size === 0) return;
                setLiveStates((prev) => {
                    const next = { ...prev };
                    for (const row of monitorStudents) {
                        const history = byStudent.get(row.studentId);
                        if (!history || history.length === 0) continue;
                        next[row.studentId] = applyPersistedSnapshots(
                            next[row.studentId] ?? emptyLiveState(row.studentId),
                            history
                        );
                    }
                    return next;
                });
            })
            .catch(() => {
                // History is a convenience; the live channels remain the primary path.
            });
        return () => {
            cancelled = true;
        };
    }, [hasDb, essayAssignmentKey, rosterKey, monitorStudents]);

    const sendNudge = useCallback(
        (studentId: string, message: string) => {
            channelsRef.current.get(studentId)?.send({
                type: 'broadcast',
                event: 'nudge',
                payload: { message },
            });
            // The teacher's own log keeps what was sent, so both sides tell the same story and the
            // in-row history shows when a nudge went out.
            setLiveStates((prev) => {
                const current = prev[studentId] ?? emptyLiveState(studentId);
                return {
                    ...prev,
                    [studentId]: {
                        ...current,
                        events: [...current.events, { type: 'nudge', at: new Date().toISOString(), value: message }],
                    },
                };
            });
            if (hideNames) {
                // Sharing the anonymized monitor must never leak a real name in the toast.
                const index = monitorStudents.findIndex((r) => r.studentId === studentId);
                const label =
                    index >= 0
                        ? t('tests.monitor.anonymous_student', { index: index + 1 })
                        : t('tests.monitor.nudge_sent_anonymous');
                showToast(t('tests.monitor.nudge_sent_anonymous', { name: label }), 'success');
            } else {
                const name = monitorStudents.find((r) => r.studentId === studentId)?.name ?? '';
                showToast(t('tests.monitor.nudge_sent', { name }), 'success');
            }
        },
        [t, hideNames, monitorStudents, showToast]
    );
    const nudgeFocusedStudent = useCallback(
        (message: string) => {
            if (focusedStudentId) sendNudge(focusedStudentId, message);
        },
        [focusedStudentId, sendNudge]
    );

    // ── Live level override (roadmap 27.2) — persists via the owner-scoped
    // set_placement_override RPC, consumed by the student's NEXT next-placement-question call;
    // the broadcast below is purely an optimistic "you were adjusted" toast, not the actual effect.
    const [overridingStudentIds, setOverridingStudentIds] = useState<Set<string>>(new Set());
    async function sendLevelOverride(studentId: string, direction: 'up' | 'down') {
        setOverridingStudentIds((prev) => new Set(prev).add(studentId));
        try {
            await setPlacementOverride(assignmentKeyFor(studentId), direction);
            channelsRef.current.get(studentId)?.send({
                type: 'broadcast',
                event: 'nudge',
                payload: {
                    message: t('tests.monitor.nudge_override_toast', {
                        direction: t(`tests.monitor.nudge_${direction}_button`),
                    }),
                },
            });
        } catch (err) {
            console.error('setPlacementOverride failed:', err);
            showToast(t('tests.monitor.nudge_override_error'), 'error');
        } finally {
            setOverridingStudentIds((prev) => {
                const next = new Set(prev);
                next.delete(studentId);
                return next;
            });
        }
    }

    // Close the column-sort modal when the monitored test changes — the route reuses this
    // page between tests, and a lingering modal could otherwise sit over the next test's grid.
    useEffect(() => {
        setSortModalOpen(false);
    }, [params.testId]);

    // ── Re-render periodically so presence ages (active → idle → disconnected) ────
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(interval);
    }, []);

    const isLevelGrid =
        kind === 'test' &&
        test?.mode === 'placement' &&
        (test.placementEngine === 'staircase' || test.placementEngine === 'generator');
    // The adaptive level grids (and a generator run without the placement mode flag) have no
    // question matrix to fold proctoring into, so they keep the per-student cards.
    const showsProctorCards = isLevelGrid || (kind === 'test' && test?.placementEngine === 'generator');

    const levelMaxQuestions = isLevelGrid
        ? test?.placementEngine === 'generator'
            ? test.generatorConfig?.maxQuestions
            : STAIRCASE_MAX_QUESTIONS
        : undefined;

    // ── Build per-student rows ─────────────────────────────────────────────────────
    const rows = useMemo(() => {
        return monitorStudents.map((row) => {
            const live = liveStates[row.studentId] ?? emptyLiveState(row.studentId);
            const allEvents = mergeProctorEvents(row.persistedEvents, live.events);
            const presence = derivePresence(allEvents);
            const flags = summarizeProctorFlags(allEvents);
            const snapshotAnswers =
                kind === 'test' && live.snapshot?.answers && typeof live.snapshot.answers === 'object'
                    ? Object.entries(live.snapshot.answers as Record<string, string>).map(([questionId, response]) => ({
                          questionId,
                          response,
                      }))
                    : [];
            const mergedAnswers: TestAnswer[] =
                snapshotAnswers.length > 0
                    ? [
                          ...row.persistedAnswers.filter(
                              (a) => !snapshotAnswers.some((sa) => sa.questionId === a.questionId)
                          ),
                          ...snapshotAnswers,
                      ]
                    : row.persistedAnswers;
            // Placement (staircase/generator) estimate that survives the live channel: once the
            // student has submitted, the ephemeral snapshot is gone, so replay the level from the
            // persisted attempt. Live snapshot wins while the run is in progress.
            const placementLevel: CefrLevel | undefined =
                kind === 'test' && test?.mode === 'placement'
                    ? (live.snapshot?.generatorLevel ??
                      (row.studentTest ? (estimatePlacement(test, row.studentTest)?.level ?? undefined) : undefined))
                    : undefined;

            // Adaptive trace for the level grid (staircase/generator): the submitted attempt's
            // per-question ladder. Live-in-progress runs have no full client-side trace, so their
            // bars stay empty until hand-in while the estimated-level column still tracks them.
            const levelPath: StaircaseStep[] = kind === 'test' ? (row.studentTest?.levelPath ?? []) : [];
            // A generator run's trace must be replayed inside the range it actually ran under, or a
            // narrow range would be read against the classic A1–C2 bounds and report the wrong confidence.
            const levelPathConfig =
                kind === 'test' && test && row.studentTest ? levelPathRunConfig(test, row.studentTest) : undefined;
            const sectionPath = kind === 'test' ? row.studentTest?.sectionPath : undefined;
            const finished = row.status === 'submitted' || row.status === 'late' || !!live.submitted;
            // Presence alone shows a student who never opened the assignment and one whose laptop
            // dropped as the same grey dot; the teacher needs to tell them apart.
            const seen = live.firstSeenAt !== undefined || row.persistedEvents.length > 0;
            const connection = deriveConnectionState({ presence, seen, finished });
            const lastPersistedSignalAt = row.persistedEvents.reduce(
                (latest, event) => Math.max(latest, new Date(event.at).getTime()),
                0
            );
            const lastSignalAt = live.lastUpdateAt
                ? new Date(live.lastUpdateAt).getTime()
                : lastPersistedSignalAt > 0
                  ? lastPersistedSignalAt
                  : undefined;
            const silentMinutes =
                connection === 'lost' && lastSignalAt !== undefined
                    ? Math.floor((now - lastSignalAt) / 60_000)
                    : undefined;
            let completion: StudentCompletion | undefined;
            if (kind === 'test' && test && isLevelGrid) {
                // A live 'submitted' broadcast can land before the persisted trace does.
                const answered = finished
                    ? Math.max(levelPath.length, live.snapshot?.questionsAsked ?? 0, mergedAnswers.length)
                    : (live.snapshot?.questionsAsked ?? Math.max(levelPath.length, mergedAnswers.length));
                const total = levelMaxQuestions ?? 0;
                completion = { answered: finished ? Math.max(answered, total) : answered, total };
            } else if (kind === 'test' && test) {
                completion = studentCompletion(test, mergedAnswers, sectionPath);
            }

            return {
                ...row,
                presence,
                flags,
                live,
                mergedAnswers,
                placementLevel,
                levelPath,
                levelPathConfig,
                sectionPath,
                finished,
                completion,
                // Essays have no persisted student_tests row to derive a status from —
                // the monitor learns about a hand-in via the student's 'submitted'
                // broadcast or the essay_submissions check on mount.
                status: row.status ?? (live.submitted ? 'submitted' : undefined),
                connection,
                silentMinutes,
            };
        });
        // `now` forces presence to be re-derived against the current time as heartbeats age.
    }, [monitorStudents, liveStates, kind, now, test, isLevelGrid, levelMaxQuestions]);

    const paceByStudent = useMemo(
        () =>
            showPace
                ? paceVsClass(
                      rows.flatMap((row) =>
                          row.completion ? [{ id: row.studentId, ...row.completion, finished: row.finished }] : []
                      )
                  )
                : new Map<string, PaceTrend>(),
        [rows, showPace]
    );

    const stalledFor = (row: (typeof rows)[number]): number | null => {
        if (!flagStalled || kind !== 'test' || row.finished || row.presence === 'disconnected') return null;
        if (row.completion && row.completion.total > 0 && row.completion.answered >= row.completion.total) return null;
        return stalledMinutes(row.live.lastChangeAt ?? row.live.firstSeenAt, now, stallMinutes);
    };

    const sortedRows = useMemo(() => {
        const presenceRank: Record<string, number> = { active: 0, idle: 1, disconnected: 2 };
        // A proctoring flag (tab-switch threshold or a stall) lifts the row to the top of the
        // default order — the red edge on the row only helps if the teacher can see it.
        const flagRank = (row: (typeof rows)[number]) =>
            row.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD || stalledFor(row) !== null ? 0 : 1;
        const copy = [...rows];
        switch (sortMode) {
            case 'name':
                return copy.sort((a, b) => a.name.localeCompare(b.name));
            case 'progress':
                return copy.sort((a, b) => b.mergedAnswers.length - a.mergedAnswers.length);
            case 'ungraded':
                return copy.sort((a, b) => (a.status === 'submitted' ? 1 : 0) - (b.status === 'submitted' ? 1 : 0));
            case 'active':
            default:
                return copy.sort(
                    (a, b) => flagRank(a) - flagRank(b) || presenceRank[a.presence] - presenceRank[b.presence]
                );
        }
        // stalledFor is derived from `now`/`stallMinutes`, both of which are in the deps below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sortMode]);

    const filterClasses = useMemo(
        () => classes.filter((c) => monitorStudents.some((s) => s.classId === c.id)),
        [classes, monitorStudents]
    );

    const visibleRows = useMemo(() => {
        const hasStarted = (row: (typeof rows)[number]) =>
            row.finished || row.status !== undefined || row.mergedAnswers.length > 0 || row.live.snapshot !== null;
        return sortedRows.filter((row) => {
            if (classFilter !== 'all' && row.classId !== classFilter) return false;
            if (startedOnly && !hasStarted(row)) return false;
            return true;
        });
    }, [sortedRows, classFilter, startedOnly]);

    // The class triage strip: a worklist over the same rows the class/started filters left, so the
    // counts and the grid's rows always describe the same students.
    const triageRows = visibleRows.map((row) => ({
        finished: row.finished,
        tabSwitchCount: row.flags.tabSwitchCount,
        stalledMinutes: stalledFor(row),
        started:
            row.live.snapshot !== null ||
            row.live.firstSeenAt !== undefined ||
            row.persistedEvents.length > 0 ||
            row.mergedAnswers.length > 0,
        progress: kind === 'essay' ? row.live.snapshot?.wordCount : row.mergedAnswers.length,
        pace: paceByStudent.get(row.studentId),
    }));
    const triage = triageCounts(triageRows);
    const shownRows = triageFilter
        ? visibleRows.filter((_, index) => triageMatches(triageRows[index], triageFilter))
        : visibleRows;

    // Where the class — not one student — is stuck: questions someone answered past but left blank.
    const stuck = useMemo(() => {
        if (kind !== 'test' || !test || isLevelGrid) return [];
        const answersByStudent = new Map(
            visibleRows
                .filter((row) => !row.finished)
                .map((row) => [row.studentId, answeredQuestionIds(test.questions, row.mergedAnswers)] as const)
        );
        return stuckQuestions(
            test.questions.map((question) => question.id),
            answersByStudent
        );
    }, [kind, test, isLevelGrid, visibleRows]);

    const statusSummary = (row: (typeof rows)[number], stalled: number | null, pace: PaceTrend | undefined) => {
        const parts: string[] = [];
        if (row.finished) parts.push(t('tests.monitor.summary.handed_in'));
        if (stalled !== null) parts.push(t('tests.monitor.summary.stalled', { count: stalled }));
        const c = row.completion;
        if (c && c.total > 0 && !row.finished) {
            parts.push(t('tests.monitor.summary.done', { percent: Math.round((c.answered / c.total) * 100) }));
        }
        if (c?.correctPct !== undefined) {
            parts.push(t('tests.monitor.summary.correct', { percent: Math.round(c.correctPct) }));
        }
        if (pace) parts.push(t(`tests.monitor.pace.${pace}`));
        return parts.length > 0 ? parts.join(' · ') : t('tests.monitor.summary.no_data');
    };

    const displayName = (row: { studentId: string; name: string }, index: number) =>
        hideNames ? t('tests.monitor.anonymous_student', { index: index + 1 }) : row.name;

    // Badges flip silently for a screen-reader user, so say it once when a student drops out. Only
    // transitions are spoken: the first read of the roster and the per-minute "silent for N min"
    // counter would otherwise repeat for the whole class.
    const announcedConnectionRef = useRef<Map<string, ConnectionState | undefined>>(new Map());
    const [connectionAnnouncement, setConnectionAnnouncement] = useState('');
    useEffect(() => {
        const known = announcedConnectionRef.current;
        const messages: string[] = [];
        rows.forEach((row, index) => {
            const hadPrevious = known.has(row.studentId);
            const previous = known.get(row.studentId);
            known.set(row.studentId, row.connection);
            if (!hadPrevious || previous === row.connection) return;
            if (row.connection === 'lost') {
                messages.push(t('tests.monitor.signal.announce_lost', { name: displayName(row, index) }));
            } else if (row.connection === 'never_opened') {
                messages.push(t('tests.monitor.signal.announce_never_opened', { name: displayName(row, index) }));
            }
        });
        if (messages.length > 0) setConnectionAnnouncement(messages.join('. '));
        // displayName only varies with the anonymize toggle and the language, neither of which is a transition.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows]);

    // ── Guard: no database configured ──────────────────────────────────────────────
    if (!hasDb) {
        return (
            <>
                <Topbar title={t('tests.monitor.title')} />
                <div className="page-content fade-in">
                    <div
                        style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 10,
                            maxWidth: 560,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Database size={20} style={{ color: 'var(--text-muted)' }} />
                            <h2 className="item-heading" style={{ margin: 0 }}>
                                {t('tests.monitor.no_database_title')}
                            </h2>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                            {t('tests.monitor.noDatabase')}
                        </p>
                    </div>
                </div>
            </>
        );
    }

    if (kind === 'test' && !test) {
        return (
            <>
                <Topbar title={t('tests.monitor.title')} />
                <div className="page-content fade-in">
                    <p className="text-muted">{t('tests.monitor.not_found')}</p>
                </div>
            </>
        );
    }

    if (kind === 'essay' && essayAssignmentLoading) {
        return (
            <>
                <Topbar title={t('tests.monitor.title')} />
                <div className="page-content fade-in">
                    <InlineMonitorSkeleton />
                </div>
            </>
        );
    }

    if (kind === 'essay' && !essayAssignment) {
        return (
            <>
                <Topbar title={t('tests.monitor.title')} />
                <div className="page-content fade-in">
                    <p className="text-muted">{t('tests.monitor.not_found')}</p>
                </div>
            </>
        );
    }

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={
                    kind === 'test'
                        ? t('tests.monitor.title_test', { name: test!.name })
                        : t('tests.monitor.title_essay', { title: essayAssignment!.title })
                }
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                        {t('tutorial.page_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div role="status" aria-live="polite" className="sr-only" data-testid="monitor-connection-announcer">
                    {connectionAnnouncement}
                </div>
                {/* Controls */}
                <div
                    data-tour="lm-controls"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        {t('tests.monitor.sort_label')}
                        <select
                            data-tour="lm-sort"
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value as SortMode)}
                        >
                            <option value="active">{t('tests.monitor.sort.active')}</option>
                            <option value="name">{t('tests.monitor.sort.name')}</option>
                            <option value="progress">{t('tests.monitor.sort.progress')}</option>
                            <option value="ungraded">{t('tests.monitor.sort.ungraded')}</option>
                        </select>
                    </label>
                    {kind === 'test' && (filterClasses.length > 1 || classFilter !== 'all') && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                            {t('tests.monitor.class_filter_label')}
                            <select
                                value={classFilter}
                                onChange={(e) => setClassFilter(e.target.value)}
                                aria-label={t('tests.monitor.class_filter_label')}
                            >
                                <option value="all">{t('tests.monitor.all_classes')}</option>
                                {filterClasses.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {kind === 'test' && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-pressed={startedOnly}
                            onClick={() => setStartedOnly((v) => !v)}
                        >
                            {t('tests.monitor.started_only')}
                        </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => setHideNames((h) => !h)}>
                        {hideNames ? <Eye size={14} /> : <EyeOff size={14} />}
                        {hideNames ? t('tests.monitor.show_names') : t('tests.monitor.hideNames')}
                    </button>
                    {kind === 'test' && !isLevelGrid && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setSortModalOpen(true)}>
                            <SlidersHorizontal size={14} />
                            {t('tests.monitor.grid.sort_button')}
                            {columnSortRules.some((r) => r.key !== 'original') && (
                                <span className="badge badge-blue" style={{ marginLeft: 4 }}>
                                    {columnSortRules.filter((r) => r.key !== 'original').length}
                                </span>
                            )}
                        </button>
                    )}
                    {kind === 'test' && (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-pressed={showProgress}
                                onClick={() => updateSettings({ monitorShowStudentProgress: !showProgress })}
                            >
                                <ListChecks size={14} />
                                {t('tests.monitor.progress_toggle')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-pressed={showClassProgress}
                                onClick={() => updateSettings({ monitorShowClassProgress: !showClassProgress })}
                            >
                                <BarChart3 size={14} />
                                {t('tests.monitor.class_progress_toggle')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-pressed={showPace}
                                onClick={() => updateSettings({ monitorShowPace: !showPace })}
                            >
                                <Gauge size={14} />
                                {t('tests.monitor.pace_toggle')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                aria-pressed={showStatusSummary}
                                onClick={() => updateSettings({ monitorShowStatusSummary: !showStatusSummary })}
                            >
                                <AlignLeft size={14} />
                                {t('tests.monitor.status_summary_toggle')}
                            </button>
                            {!isLevelGrid && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    aria-pressed={showMilestones}
                                    onClick={() => updateSettings({ monitorShowMilestones: !showMilestones })}
                                >
                                    <Flag size={14} />
                                    {t('tests.monitor.milestones_toggle')}
                                </button>
                            )}
                            {(isLevelGrid || test?.placementEngine === 'generator') && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    aria-pressed={showEstimateConfidence}
                                    title={t('tests.monitor.confidence_toggle_help')}
                                    onClick={() =>
                                        updateSettings({
                                            monitorShowEstimateConfidence: !showEstimateConfidence,
                                        })
                                    }
                                >
                                    {t('tests.monitor.confidence_toggle')}
                                </button>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    aria-pressed={flagStalled}
                                    onClick={() => updateSettings({ monitorFlagStalled: !flagStalled })}
                                >
                                    <Hourglass size={14} />
                                    {t('tests.monitor.stall_toggle')}
                                </button>
                                {flagStalled && (
                                    <label
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: '0.85rem',
                                        }}
                                    >
                                        {t('tests.monitor.stall_threshold_label')}
                                        <input
                                            type="number"
                                            min={MIN_STALL_MINUTES}
                                            max={MAX_STALL_MINUTES}
                                            step={1}
                                            value={stallMinutes}
                                            onChange={(e) => {
                                                if (e.target.value === '') return;
                                                updateSettings({
                                                    monitorStallMinutes: clampStallMinutes(Number(e.target.value)),
                                                });
                                            }}
                                            style={{ width: 56 }}
                                        />
                                        {t('tests.monitor.stall_threshold_unit')}
                                    </label>
                                )}
                            </span>
                        </>
                    )}
                    {kind === 'essay' && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-pressed={showWritingPace}
                            onClick={() => updateSettings({ monitorShowWritingPace: !showWritingPace })}
                        >
                            <PenLine size={14} />
                            {t('tests.monitor.writing_pace_toggle')}
                        </button>
                    )}
                    <HelpPopover title={t('help.proctoring_title')}>{t('help.proctoring_body')}</HelpPopover>
                </div>

                {sortModalOpen && !isLevelGrid && (
                    <ColumnSortModal
                        rules={columnSortRules}
                        onApply={setColumnSortRules}
                        onClose={() => setSortModalOpen(false)}
                    />
                )}

                {kind === 'test' && !isLevelGrid && visibleRows.length > 0 && (
                    <div
                        data-testid="monitor-triage"
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 0',
                            background: 'var(--bg)',
                            borderBottom: '1px solid var(--border)',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '0.72rem',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: 'var(--text-dim)',
                            }}
                        >
                            {t('tests.monitor.triage.label')}
                        </span>
                        {TRIAGE_KEYS.map((key) => {
                            const count = triage[key];
                            const active = triageFilter === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className={count > 0 ? 'badge badge-yellow' : 'badge'}
                                    aria-pressed={active}
                                    disabled={count === 0}
                                    data-testid={`monitor-triage-${key}`}
                                    onClick={() => setTriageFilter(active ? null : key)}
                                    style={{
                                        cursor: count > 0 ? 'pointer' : 'default',
                                        color: count > 0 ? undefined : 'var(--text-dim)',
                                        outline: active ? '2px solid var(--accent-text)' : undefined,
                                    }}
                                >
                                    {t(`tests.monitor.triage.${key}`, { count, minutes: stallMinutes })}
                                </button>
                            );
                        })}
                        {triageFilter && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setTriageFilter(null)}
                            >
                                {t('tests.monitor.triage.clear')}
                            </button>
                        )}
                    </div>
                )}

                {stuck.length > 0 && (
                    <p
                        data-testid="monitor-stuck-questions"
                        style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
                    >
                        <strong style={{ color: 'var(--text)' }}>{t('tests.monitor.stuck.title')}:</strong>{' '}
                        {stuck
                            .map((question) =>
                                t('tests.monitor.stuck.item', {
                                    index: question.index,
                                    count: question.reached,
                                })
                            )
                            .join(' · ')}
                    </p>
                )}

                {kind === 'test' && testTeacherKeysLoading ? (
                    // Teacher keys still resolving: in-progress students have no persisted
                    // row yet, so hold the skeleton instead of asserting "no students" — and
                    // instead of rendering the persisted rows on their own, which would show
                    // an incomplete roster until the in-progress students arrive.
                    <InlineMonitorSkeleton />
                ) : visibleRows.length === 0 ? (
                    <p className="text-muted">{t('tests.monitor.no_students')}</p>
                ) : shownRows.length === 0 ? (
                    <p className="text-muted" data-testid="monitor-triage-empty">
                        {t('tests.monitor.triage.empty')}
                    </p>
                ) : (
                    <>
                        {/* Presence + proctoring summary — the adaptive level grids have no question
                            matrix to fold it into, so they keep the card list. */}
                        {showsProctorCards && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {visibleRows.map((row, index) => {
                                    const stalled = stalledFor(row);
                                    const pace = paceByStudent.get(row.studentId);
                                    return (
                                        <div
                                            key={row.studentId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                                flexWrap: 'wrap',
                                                background: 'var(--bg-elevated)',
                                                border: '1px solid var(--border)',
                                                borderRadius: 10,
                                                padding: '10px 14px',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <span
                                                    style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}
                                                >
                                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                        {displayName(row, index)}
                                                    </span>
                                                    {showStatusSummary && kind === 'test' && (
                                                        <span
                                                            data-testid="monitor-status-summary"
                                                            style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                                                        >
                                                            {statusSummary(row, stalled, pace)}
                                                        </span>
                                                    )}
                                                </span>
                                                <PresenceBadge presence={row.presence} status={row.status} />
                                                {stalled !== null && (
                                                    <span
                                                        className="badge badge-yellow"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                    >
                                                        <Hourglass size={11} aria-hidden="true" />
                                                        {t('tests.monitor.stalled_badge', { count: stalled })}
                                                    </span>
                                                )}
                                                {pace &&
                                                    (() => {
                                                        const { className, Icon } = PACE_BADGE[pace];
                                                        return (
                                                            <span
                                                                className={className}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                }}
                                                            >
                                                                <Icon size={11} aria-hidden="true" />
                                                                {t(`tests.monitor.pace.${pace}`)}
                                                            </span>
                                                        );
                                                    })()}
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() =>
                                                        sendNudge(row.studentId, t('tests.monitor.nudge_message'))
                                                    }
                                                    title={t('tests.monitor.nudge_button')}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    <Send size={13} /> {t('tests.monitor.nudge_button')}
                                                </button>
                                                {kind === 'test' && test?.placementEngine === 'generator' && (
                                                    <PlacementLevelPanel
                                                        level={row.placementLevel}
                                                        eloAnchor={row.live.snapshot?.generatorEloAnchor}
                                                        questionsAsked={row.live.snapshot?.questionsAsked}
                                                        levelPath={row.levelPath}
                                                        levelPathConfig={row.levelPathConfig}
                                                        showConfidence={showEstimateConfidence}
                                                        disabled={
                                                            overridingStudentIds.has(row.studentId) ||
                                                            row.status === 'submitted' ||
                                                            row.status === 'late'
                                                        }
                                                        onNudge={(direction) =>
                                                            void sendLevelOverride(row.studentId, direction)
                                                        }
                                                    />
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                {row.flags.tabSwitchCount > 0 && (
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background:
                                                                row.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD
                                                                    ? 'color-mix(in srgb, var(--red) 15%, transparent)'
                                                                    : 'color-mix(in srgb, var(--yellow) 15%, transparent)',
                                                            color:
                                                                row.flags.tabSwitchCount >= TAB_SWITCH_WARNING_THRESHOLD
                                                                    ? 'var(--red)'
                                                                    : 'var(--yellow)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                        }}
                                                    >
                                                        <AlertTriangle size={11} />
                                                        {t('tests.monitor.flags.tabSwitch', {
                                                            count: row.flags.tabSwitchCount,
                                                        })}
                                                    </span>
                                                )}
                                                {(row.flags.copyCount > 0 ||
                                                    row.flags.cutCount > 0 ||
                                                    row.flags.pasteCount > 0) && (
                                                    <span className="badge badge-blue">
                                                        {t('tests.monitor.flags.clipboard', {
                                                            count:
                                                                row.flags.copyCount +
                                                                row.flags.cutCount +
                                                                row.flags.pasteCount,
                                                        })}
                                                    </span>
                                                )}
                                                {row.flags.battery && (
                                                    <span className="badge">
                                                        {t('tests.monitor.flags.battery', {
                                                            level: row.flags.battery.level,
                                                            charging: row.flags.battery.charging ? '+' : '',
                                                        })}
                                                    </span>
                                                )}
                                                {row.flags.sebActive && (
                                                    <span className="badge badge-green">
                                                        {t('tests.monitor.flags.seb')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Kind-specific live view */}
                        {kind === 'test' && test && !isLevelGrid && test.questions.length === 0 && (
                            <p className="text-muted" data-testid="monitor-no-questions">
                                {t('tests.monitor.grid.no_questions')}
                            </p>
                        )}
                        {kind === 'test' && test && !isLevelGrid && (
                            <ResponsesGrid
                                test={test}
                                sortRules={columnSortRules}
                                showProgress={showProgress}
                                showClassProgress={showClassProgress}
                                showMilestones={showMilestones}
                                rows={shownRows.map((row, index) => {
                                    const pace = paceByStudent.get(row.studentId);
                                    const stalled = stalledFor(row);
                                    return {
                                        pace,
                                        studentId: row.studentId,
                                        displayName: displayName(row, index),
                                        classId: row.classId,
                                        className: row.className,
                                        sectionPath: row.sectionPath,
                                        answers: row.mergedAnswers,
                                        // The proctoring list used to be a separate stack of
                                        // cards; it now rides in the matrix row it belongs to.
                                        proctor: {
                                            presence: row.presence,
                                            status: row.status,
                                            connection: row.connection,
                                            silentMinutes: row.silentMinutes,
                                            flags: row.flags,
                                            events: mergeProctorEvents(row.persistedEvents, row.live.events),
                                            stalledMinutes: stalled,
                                            statusSummary: showStatusSummary
                                                ? statusSummary(row, stalled, pace)
                                                : undefined,
                                            onNudge: (message: string) => sendNudge(row.studentId, message),
                                        },
                                    };
                                })}
                            />
                        )}

                        {/* Adaptive placement (staircase/generator): every student sees different
                            questions, so align on CEFR level rather than question identity. */}
                        {kind === 'test' && isLevelGrid && (
                            <LevelResponsesGrid
                                showProgress={showProgress}
                                showClassProgress={showClassProgress}
                                showConfidence={showEstimateConfidence}
                                maxQuestions={levelMaxQuestions}
                                rows={visibleRows.map((row, index) => {
                                    const finished = row.status === 'submitted' || row.status === 'late';
                                    return {
                                        studentId: row.studentId,
                                        displayName: displayName(row, index),
                                        classId: row.classId,
                                        className: row.className,
                                        levelPath: row.levelPath,
                                        levelPathConfig: row.levelPathConfig,
                                        estimatedLevel: row.placementLevel,
                                        finished,
                                        // A live 'submitted' broadcast can land before the persisted trace does.
                                        questionsAnswered: finished
                                            ? Math.max(
                                                  row.levelPath.length,
                                                  row.live.snapshot?.questionsAsked ?? 0,
                                                  row.mergedAnswers.length
                                              )
                                            : (row.live.snapshot?.questionsAsked ??
                                              Math.max(row.levelPath.length, row.mergedAnswers.length)),
                                    };
                                })}
                            />
                        )}

                        {kind === 'essay' &&
                            (() => {
                                const focusedRow = focusedStudentId
                                    ? visibleRows.find((row) => row.studentId === focusedStudentId)
                                    : undefined;
                                if (focusedRow) {
                                    const index = visibleRows.indexOf(focusedRow);
                                    const proseSnapshots = (focusedRow.live.snapshots ?? [])
                                        .map((snap) => snap.text)
                                        .filter((text): text is string => text !== undefined);
                                    return (
                                        <EssaySpotlight
                                            displayName={displayName(focusedRow, index)}
                                            presence={focusedRow.presence}
                                            status={focusedRow.status}
                                            wordCount={focusedRow.live.snapshot?.wordCount}
                                            wordSamples={focusedRow.live.wordSamples}
                                            lastChangeAt={focusedRow.live.lastChangeAt}
                                            lastActivityAt={focusedRow.live.lastUpdateAt ?? undefined}
                                            draftText={
                                                focusedRow.live.snapshot?.text !== undefined
                                                    ? stripCommentHtml(focusedRow.live.snapshot.text)
                                                    : undefined
                                            }
                                            previousDraftText={
                                                proseSnapshots.length > 1
                                                    ? stripCommentHtml(proseSnapshots[proseSnapshots.length - 2])
                                                    : undefined
                                            }
                                            snapshots={[...(focusedRow.live.snapshots ?? [])].reverse()}
                                            events={mergeProctorEvents(
                                                focusedRow.persistedEvents,
                                                focusedRow.live.events
                                            )}
                                            flags={focusedRow.flags}
                                            showWritingPace={showWritingPace}
                                            onNudge={nudgeFocusedStudent}
                                            projectorHref={`/essays/${params.assignmentId ?? ''}/monitor/project/${focusedRow.studentId}`}
                                            onLeave={() => setFocusedStudentId(null)}
                                            now={now}
                                        />
                                    );
                                }
                                return (
                                    <EssayMonitorRoster
                                        rows={visibleRows.map((row, index) => {
                                            const texts = (row.live.snapshots ?? []).filter(
                                                (snap) => snap.text !== undefined
                                            );
                                            const latest = texts[texts.length - 1];
                                            const previous = texts[texts.length - 2];
                                            return {
                                                studentId: row.studentId,
                                                displayName: displayName(row, index),
                                                presence: row.presence,
                                                status: row.status,
                                                connection: row.connection,
                                                silentMinutes: row.silentMinutes,
                                                typedChars: row.live.snapshot?.typedChars,
                                                pastedChars: row.live.snapshot?.pastedChars,
                                                wordCount: row.live.snapshot?.wordCount,
                                                wordSamples: row.live.wordSamples,
                                                lastChangeAt: row.live.lastChangeAt,
                                                flags: row.flags,
                                                draftText:
                                                    latest?.text !== undefined
                                                        ? stripCommentHtml(latest.text)
                                                        : undefined,
                                                previousText:
                                                    previous?.text !== undefined
                                                        ? stripCommentHtml(previous.text)
                                                        : undefined,
                                                // Word counts land every few seconds, so the sparkline runs on
                                                // those samples; only the prose is minute-grained.
                                                snapshotWords: (row.live.wordSamples ?? []).map(
                                                    (sample) => sample.words
                                                ),
                                                snapshotAgeAt: latest?.at,
                                            };
                                        })}
                                        onWatch={setFocusedStudentId}
                                        showWritingPace={showWritingPace}
                                        now={now}
                                    />
                                );
                            })()}
                    </>
                )}

                {/* Advisory note */}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 8 }}>
                    {t('tests.monitor.advisory_note')}
                </p>
            </div>
        </>
    );
}
