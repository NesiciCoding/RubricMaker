import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { Eye, EyeOff, AlertTriangle, Database, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import HelpPopover from '../components/ui/HelpPopover';
import { useApp } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import { loadSupabaseConfig } from '../services/database';
import PresenceBadge from '../components/Monitor/PresenceBadge';
import ResponsesGrid from '../components/Monitor/ResponsesGrid';
import LiveDraftPanel from '../components/Monitor/LiveDraftPanel';
import { derivePresence, summarizeProctorFlags, mergeProctorEvents } from '../utils/proctorAggregator';
import type { ProctorEvent, TestAnswer } from '../types';

const TAB_SWITCH_WARNING_THRESHOLD = 3;

type SortMode = 'active' | 'name' | 'progress' | 'ungraded';

interface StudentLiveState {
    studentId: string;
    events: ProctorEvent[];
    snapshot: { text?: string; answers?: unknown; wordCount?: number } | null;
    lastUpdateAt: string | null;
}

function emptyLiveState(studentId: string): StudentLiveState {
    return { studentId, events: [], snapshot: null, lastUpdateAt: null };
}

interface MonitorStudent {
    studentId: string;
    name: string;
    persistedEvents: ProctorEvent[];
    persistedAnswers: TestAnswer[];
    status?: 'submitted' | 'opened' | 'late';
}

export interface LiveMonitorPageProps {
    kind: 'test' | 'essay';
}

export default function LiveMonitorPage({ kind }: LiveMonitorPageProps) {
    const { t } = useTranslation();
    const params = useParams<{ testId?: string; assignmentId?: string }>();
    const { tests, studentTests, students } = useApp();
    const dbStatus = useDbStatus();
    const config = loadSupabaseConfig();

    const [hideNames, setHideNames] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>('active');
    const [liveStates, setLiveStates] = useState<Record<string, StudentLiveState>>({});
    const [essayAssignment, setEssayAssignment] = useState<{
        rubricId: string;
        studentId: string;
        title: string;
    } | null>(null);
    const [essayAssignmentLoading, setEssayAssignmentLoading] = useState(kind === 'essay');

    const { fetchEssayAssignmentByKey } = useApp();

    const hasDb = dbStatus.isConnected && !!config?.supabaseUrl && !!config?.supabaseAnonKey;

    const test = kind === 'test' ? tests.find((tst) => tst.id === params.testId) : undefined;

    // ── Essay assignment lookup (teacher-owned row, by teacherKey) ───────────────
    useEffect(() => {
        if (kind !== 'essay' || !params.assignmentId || !hasDb) {
            setEssayAssignmentLoading(false);
            return;
        }
        let cancelled = false;
        setEssayAssignmentLoading(true);
        fetchEssayAssignmentByKey(params.assignmentId)
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

    // ── Resolve the list of monitored students ───────────────────────────────────
    const monitorStudents = useMemo<MonitorStudent[]>(() => {
        if (kind === 'test') {
            if (!test) return [];
            const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
            const studentIds = new Set(relevantStudentTests.map((st) => st.studentId));
            return Array.from(studentIds)
                .map((studentId) => {
                    const student = students.find((s) => s.id === studentId);
                    const st = relevantStudentTests.find((row) => row.studentId === studentId);
                    return {
                        studentId,
                        name: student?.name ?? studentId,
                        persistedEvents: st?.events ?? [],
                        persistedAnswers: st?.answers ?? [],
                        status:
                            st?.status === 'submitted' || st?.status === 'graded'
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
    }, [kind, test, students, studentTests, essayAssignment]);

    // ── Per-student assignmentKey derivation ──────────────────────────────────────
    // Essays: the route param IS the persisted teacherKey (essay_assignments.id), so
    // `${teacherKey}:${studentId}` matches exactly what StudentEssayPage broadcasts on.
    // Tests: there is no persisted teacherKey reachable from `testId` alone (the
    // TestAssignmentModal mints a fresh nanoid per share-link batch and it is never
    // saved). We derive `${testId}:${studentId}` as the channel key; live presence
    // therefore activates once test assignment links are generated using this same
    // derivation. Until then this page still works fully from persisted StudentTest data.
    const assignmentKeyFor = (studentId: string): string => {
        if (kind === 'essay') return `${params.assignmentId}:${studentId}`;
        return `${params.testId}:${studentId}`;
    };

    // ── Subscribe to one Realtime channel per monitored student ───────────────────
    const clientRef = useRef<SupabaseClient | null>(null);
    const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
    useEffect(() => {
        if (!hasDb || monitorStudents.length === 0) return;
        const client = createClient(config!.supabaseUrl, config!.supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        clientRef.current = client;
        const channelMap = new Map<string, RealtimeChannel>();
        const channels: RealtimeChannel[] = monitorStudents.map((row) => {
            const channel = client.channel(`monitor:${kind}:${assignmentKeyFor(row.studentId)}`);
            channelMap.set(row.studentId, channel);
            channel
                .on('broadcast', { event: 'event' }, ({ payload }) => {
                    setLiveStates((prev) => {
                        const current = prev[row.studentId] ?? emptyLiveState(row.studentId);
                        return {
                            ...prev,
                            [row.studentId]: {
                                ...current,
                                events: [...current.events, payload as ProctorEvent],
                                lastUpdateAt: new Date().toISOString(),
                            },
                        };
                    });
                })
                .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
                    setLiveStates((prev) => {
                        const current = prev[row.studentId] ?? emptyLiveState(row.studentId);
                        return {
                            ...prev,
                            [row.studentId]: {
                                ...current,
                                snapshot: payload as StudentLiveState['snapshot'],
                                lastUpdateAt: new Date().toISOString(),
                            },
                        };
                    });
                })
                .subscribe();
            return channel;
        });
        channelsRef.current = channelMap;

        return () => {
            channels.forEach((c) => void client.removeChannel(c));
            channelsRef.current = new Map();
            clientRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasDb, kind, params.testId, params.assignmentId, monitorStudents.map((r) => r.studentId).join(',')]);

    function sendNudge(studentId: string) {
        channelsRef.current.get(studentId)?.send({
            type: 'broadcast',
            event: 'nudge',
            payload: { message: t('tests.monitor.nudge_message') },
        });
    }

    // ── Re-render periodically so presence ages (active → idle → disconnected) ────
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick((tk) => tk + 1), 5000);
        return () => clearInterval(interval);
    }, []);

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
            return { ...row, presence, flags, live, mergedAnswers };
        });
        // `tick` forces presence to be re-derived against the current time as heartbeats age.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monitorStudents, liveStates, kind, tick]);

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
                            <h3 style={{ margin: 0 }}>{t('tests.monitor.no_database_title')}</h3>
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
                    <p className="text-muted">{t('tests.monitor.loading')}</p>
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
            <Topbar
                title={
                    kind === 'test'
                        ? t('tests.monitor.title_test', { name: test!.name })
                        : t('tests.monitor.title_essay', { title: essayAssignment!.title })
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        {t('tests.monitor.sort_label')}
                        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
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
                    <HelpPopover title={t('help.proctoring_title')}>{t('help.proctoring_body')}</HelpPopover>
                </div>

                {sortedRows.length === 0 ? (
                    <p className="text-muted">{t('tests.monitor.no_students')}</p>
                ) : (
                    <>
                        {/* Presence + proctoring summary */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sortedRows.map((row, index) => (
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text)', minWidth: 120 }}>
                                            {displayName(row, index)}
                                        </span>
                                        <PresenceBadge presence={row.presence} status={row.status} />
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => sendNudge(row.studentId)}
                                            title={t('tests.monitor.nudge_button')}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            <Send size={13} /> {t('tests.monitor.nudge_button')}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                                                        row.flags.copyCount + row.flags.cutCount + row.flags.pasteCount,
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
                                            <span className="badge badge-green">{t('tests.monitor.flags.seb')}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Kind-specific live view */}
                        {kind === 'test' && test && (
                            <ResponsesGrid
                                test={test}
                                rows={sortedRows.map((row, index) => ({
                                    studentId: row.studentId,
                                    displayName: displayName(row, index),
                                    answers: row.mergedAnswers,
                                }))}
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
                                    draftText={
                                        row.live.snapshot?.text !== undefined
                                            ? stripHtml(row.live.snapshot.text)
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

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
