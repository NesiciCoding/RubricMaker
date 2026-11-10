import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useParams } from 'react-router-dom';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getMonitorClient, releaseStaleChannels } from '../utils/monitorClient';
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
import PresenceBadge from '../components/Monitor/PresenceBadge';
import ResponsesGrid from '../components/Monitor/ResponsesGrid';
import LevelResponsesGrid from '../components/Monitor/LevelResponsesGrid';
import ColumnSortModal from '../components/Monitor/ColumnSortModal';
import LiveDraftPanel from '../components/Monitor/LiveDraftPanel';
import PlacementLevelPanel from '../components/Monitor/PlacementLevelPanel';
import { derivePresence, summarizeProctorFlags, mergeProctorEvents } from '../utils/proctorAggregator';
import { estimatePlacement } from '../utils/placementResult';
import { MAX_QUESTIONS as STAIRCASE_MAX_QUESTIONS } from '../utils/placementStaircase';
import { stripCommentHtml } from '../utils/exportDataPrep';
import { studentCompletion, type StudentCompletion } from '../utils/responseCells';
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
}

function snapshotProgressKey(snapshot: StudentLiveState['snapshot']): string {
    if (!snapshot) return '';
    return JSON.stringify([snapshot.answers ?? null, snapshot.text ?? null, snapshot.questionsAsked ?? null]);
}

const PACE_BADGE: Record<PaceTrend, { className: string; Icon: typeof TrendingUp }> = {
    ahead: { className: 'badge badge-green', Icon: TrendingUp },
    on_pace: { className: 'badge', Icon: MoveRight },
    behind: { className: 'badge badge-red', Icon: TrendingDown },
};

function emptyLiveState(studentId: string): StudentLiveState {
    return { studentId, events: [], snapshot: null, lastUpdateAt: null };
}

interface MonitorStudent {
    studentId: string;
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
    const showWritingPace = settings.monitorShowWritingPace ?? false;

    const { showToast } = useToast();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [hideNames, setHideNames] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('active');
    const [columnSortRules, setColumnSortRules] = useState<ColumnSortRule[]>([{ key: 'original', dir: 'asc' }]);
    const [sortModalOpen, setSortModalOpen] = useState(false);
    const [liveStates, setLiveStates] = useState<Record<string, StudentLiveState>>({});
    const [essayAssignment, setEssayAssignment] = useState<{
        rubricId: string;
        studentId: string;
        title: string;
    } | null>(null);
    const [essayAssignmentLoading, setEssayAssignmentLoading] = useState(kind === 'essay');
    const [testTeacherKeys, setTestTeacherKeys] = useState<Record<string, string>>({});
    // Which test.id the teacher-key lookup has finished for. The lookup is what reveals
    // in-progress students (they have no `student_tests` row until hand-in), so until it
    // settles the grid must show skeleton tiles rather than a premature "no students" empty
    // state. Recording the resolved id — instead of flipping a boolean in the effect — is
    // what makes the pending state apply on the very first frame after switching from one
    // test's monitor to another's, where the page is not remounted.
    const [testTeacherKeysSettledFor, setTestTeacherKeysSettledFor] = useState<string | null>(null);

    const { fetchEssayAssignmentByKey, fetchEssaySubmissions } = useEssays();

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
                if (!result) return;
                // A submission may already be persisted (the student handed in before
                // the monitor opened) — reflect it immediately instead of waiting for
                // a live 'submitted' broadcast from a still-open student tab.
                void fetchEssaySubmissions(assignmentId)
                    .then((rows) => {
                        if (cancelled || rows.length === 0) return;
                        setLiveStates((prev) => {
                            const current = prev[result.studentId] ?? emptyLiveState(result.studentId);
                            // Rows are newest-first; use the persisted hand-in time so a
                            // submission made before the monitor opened shows its real age
                            // (not "just now"), while never rewinding a fresher live update.
                            const persistedAt = rows[0]?.submittedAt ?? null;
                            const lastUpdateAt =
                                persistedAt && (!current.lastUpdateAt || persistedAt > current.lastUpdateAt)
                                    ? persistedAt
                                    : (current.lastUpdateAt ?? new Date().toISOString());
                            return {
                                ...prev,
                                [result.studentId]: {
                                    ...current,
                                    submitted: true,
                                    lastUpdateAt,
                                },
                            };
                        });
                    })
                    .catch(() => {
                        // Non-fatal: the live broadcast path still covers an in-session submit.
                    });
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
    }, [kind, params.assignmentId, hasDb, fetchEssayAssignmentByKey, fetchEssaySubmissions]);

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

        // Essay: a single assignment maps to exactly one student.
        if (!essayAssignment) return [];
        const student = students.find((s) => s.id === essayAssignment.studentId);
        if (!student) return [];
        return [
            {
                studentId: student.id,
                name: student.name,
                persistedEvents: [],
                persistedAnswers: [],
            },
        ];
    }, [kind, test, students, classes, studentTests, essayAssignment, testTeacherKeys]);

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

    const clientRef = useRef<SupabaseClient | null>(null);
    const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
    useEffect(() => {
        if (!hasDb || monitorStudents.length === 0) return;
        // Shared singleton: re-creating a GoTrueClient per roster change logs
        // "Multiple GoTrueClient instances detected ... rm_monitor_ephemeral"
        // and churns sockets. Reuse one client; only channels come and go.
        const client = getMonitorClient(config!.supabaseUrl, config!.supabaseAnonKey);
        clientRef.current = client;
        const topicFor = (studentId: string) => `monitor:${kind}:${assignmentKeyFor(studentId)}`;
        const channelMap = new Map<string, RealtimeChannel>();
        const channels: RealtimeChannel[] = [];
        let cancelled = false;
        const open = () => {
            if (cancelled) return;
            for (const row of monitorStudents) channels.push(openStudentChannel(row));
            channelsRef.current = channelMap;
        };
        const openStudentChannel = (row: MonitorStudent): RealtimeChannel => {
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
                        const snapshot = payload as StudentLiveState['snapshot'];
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
        const pendingRelease = releaseStaleChannels(
            client,
            monitorStudents.map((row) => topicFor(row.studentId))
        );
        if (pendingRelease) void pendingRelease.then(open);
        else open();

        return () => {
            cancelled = true;
            channels.forEach((c) => void client.removeChannel(c));
            channelsRef.current = new Map();
            clientRef.current = null;
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

    function sendNudge(studentId: string) {
        channelsRef.current.get(studentId)?.send({
            type: 'broadcast',
            event: 'nudge',
            payload: { message: t('tests.monitor.nudge_message') },
        });
    }

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
            const sectionPath = kind === 'test' ? row.studentTest?.sectionPath : undefined;
            const finished = row.status === 'submitted' || row.status === 'late' || !!live.submitted;
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
                sectionPath,
                finished,
                completion,
                // Essays have no persisted student_tests row to derive a status from —
                // the monitor learns about a hand-in via the student's 'submitted'
                // broadcast or the essay_submissions check on mount.
                status: row.status ?? (live.submitted ? 'submitted' : undefined),
            };
        });
        // `now` forces presence to be re-derived against the current time as heartbeats age.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                return copy.sort((a, b) => presenceRank[a.presence] - presenceRank[b.presence]);
        }
    }, [rows, sortMode]);

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

                {kind === 'test' && testTeacherKeysLoading ? (
                    // Teacher keys still resolving: in-progress students have no persisted
                    // row yet, so hold the skeleton instead of asserting "no students" — and
                    // instead of rendering the persisted rows on their own, which would show
                    // an incomplete roster until the in-progress students arrive.
                    <InlineMonitorSkeleton />
                ) : sortedRows.length === 0 ? (
                    <p className="text-muted">{t('tests.monitor.no_students')}</p>
                ) : (
                    <>
                        {/* Presence + proctoring summary */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sortedRows.map((row, index) => {
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
                                            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                                        >
                                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
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
                                                onClick={() => sendNudge(row.studentId)}
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
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
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

                        {/* Kind-specific live view */}
                        {kind === 'test' && test && !isLevelGrid && test.questions.length === 0 && (
                            <p className="text-muted" data-testid="monitor-no-questions">
                                {t('tests.monitor.grid.no_questions')}
                            </p>
                        )}
                        {kind === 'test' && test && !isLevelGrid && test.questions.length > 0 && (
                            <ResponsesGrid
                                test={test}
                                sortRules={columnSortRules}
                                showProgress={showProgress}
                                showClassProgress={showClassProgress}
                                showMilestones={showMilestones}
                                rows={sortedRows.map((row, index) => ({
                                    pace: paceByStudent.get(row.studentId),
                                    studentId: row.studentId,
                                    displayName: displayName(row, index),
                                    classId: row.classId,
                                    className: row.className,
                                    sectionPath: row.sectionPath,
                                    answers: row.mergedAnswers,
                                }))}
                            />
                        )}

                        {/* Adaptive placement (staircase/generator): every student sees different
                            questions, so align on CEFR level rather than question identity. */}
                        {kind === 'test' && isLevelGrid && (
                            <LevelResponsesGrid
                                showProgress={showProgress}
                                showClassProgress={showClassProgress}
                                maxQuestions={levelMaxQuestions}
                                rows={sortedRows.map((row, index) => {
                                    const finished = row.status === 'submitted' || row.status === 'late';
                                    return {
                                        studentId: row.studentId,
                                        displayName: displayName(row, index),
                                        classId: row.classId,
                                        className: row.className,
                                        levelPath: row.levelPath,
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
                            sortedRows.map((row, index) => (
                                <LiveDraftPanel
                                    key={row.studentId}
                                    displayName={displayName(row, index)}
                                    presence={row.presence}
                                    status={row.status}
                                    wordCount={row.live.snapshot?.wordCount}
                                    lastActivityAt={row.live.lastUpdateAt ?? undefined}
                                    showWritingPace={showWritingPace}
                                    wordSamples={row.live.wordSamples}
                                    lastChangeAt={row.live.lastChangeAt}
                                    now={now}
                                    draftText={
                                        row.live.snapshot?.text !== undefined
                                            ? stripCommentHtml(row.live.snapshot.text)
                                            : undefined
                                    }
                                />
                            ))}
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
