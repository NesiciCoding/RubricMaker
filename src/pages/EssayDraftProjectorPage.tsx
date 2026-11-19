import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useStudents } from '../context/AppContext';
import { loadSupabaseConfig } from '../services/database';
import { LiveDraftAdapter } from '../services/database/LiveDraftAdapter';
import { getMonitorClient, releaseStaleChannels } from '../utils/monitorClient';
import { stripCommentHtml } from '../utils/exportDataPrep';
import { lastAddedSentence } from '../utils/draftHighlights';

// The student sends prose at the five-second cadence only while a teacher is watching the draft.
const SPOTLIGHT_PING_MS = 10_000;
const CLOCK_TICK_MS = 5_000;

interface ProjectedDraft {
    text?: string;
    /** The draft before `text`, so the newest sentence can be marked. */
    previousText?: string;
    wordCount?: number;
    at?: number;
}

/**
 * One draft on the classroom projector (#monitor follow-up).
 *
 * Read-only on purpose: no grading controls and no class list, so a teacher can put a single
 * paragraph on the screen and talk about a sentence without exposing anyone else's writing.
 */
export default function EssayDraftProjectorPage() {
    const { t } = useTranslation();
    const { assignmentId, studentId } = useParams<{ assignmentId: string; studentId: string }>();
    const [searchParams] = useSearchParams();
    // A batch student's drafts are stored under their own assignment key, which the monitor link carries.
    const studentKey = searchParams.get('key') ?? '';
    const { students } = useStudents();
    const config = loadSupabaseConfig();
    const supabaseUrl = config?.supabaseUrl;
    const supabaseAnonKey = config?.supabaseAnonKey;
    const hasDb = !!supabaseUrl && !!supabaseAnonKey;

    const [draft, setDraft] = useState<ProjectedDraft>({});
    const [now, setNow] = useState(() => Date.now());

    const name = students.find((student) => student.id === studentId)?.name ?? '';

    // The channel is only live while this tab is open, so a projector opened after the student
    // started writing seeds itself from the stored snapshots instead of waiting a whole minute.
    useEffect(() => {
        if (!hasDb || !assignmentId || !studentId) return;
        const drafts = LiveDraftAdapter.forTeacher();
        if (!drafts) return;
        let cancelled = false;
        drafts
            .listSnapshots(studentKey && studentKey !== assignmentId ? [assignmentId, studentKey] : [assignmentId], [
                studentId,
            ])
            .then((byStudent) => {
                if (cancelled) return;
                const texts = (byStudent.get(studentId) ?? []).filter(
                    (snapshot): snapshot is typeof snapshot & { text: string } => snapshot.text !== undefined
                );
                const latest = texts[texts.length - 1];
                if (!latest) return;
                // A broadcast that already arrived is fresher than the stored history.
                setDraft((current) =>
                    current.text !== undefined
                        ? current
                        : {
                              text: stripCommentHtml(latest.text),
                              previousText: texts[texts.length - 2]
                                  ? stripCommentHtml(texts[texts.length - 2].text)
                                  : undefined,
                              wordCount: latest.wordCount,
                              at: latest.at,
                          }
                );
            })
            .catch(() => {
                // History is a convenience; the live channel stays the primary path.
            });
        return () => {
            cancelled = true;
        };
    }, [hasDb, assignmentId, studentId, studentKey]);

    useEffect(() => {
        if (!hasDb || !assignmentId || !studentId) return;
        const client = getMonitorClient(supabaseUrl!, supabaseAnonKey!);
        const topic = `monitor:essay:${assignmentId}:${studentId}`;
        let cancelled = false;
        let channel: RealtimeChannel | null = null;
        let ping: ReturnType<typeof setInterval> | undefined;
        const spotlight = (on: boolean) => {
            void channel?.send({ type: 'broadcast', event: 'spotlight', payload: { on } });
        };
        const open = () => {
            if (cancelled) return;
            const opened = client.channel(topic);
            channel = opened;
            opened.on('broadcast', { event: 'snapshot' }, ({ payload }) => {
                const snapshot = payload as { text?: string; wordCount?: number } | null;
                if (!snapshot || typeof snapshot.text !== 'string') return;
                const text = stripCommentHtml(snapshot.text);
                setDraft((current) => ({
                    text,
                    // A re-sent identical draft must not become its own predecessor, or the mark vanishes.
                    previousText:
                        current.text !== undefined && current.text !== text ? current.text : current.previousText,
                    wordCount: typeof snapshot.wordCount === 'number' ? snapshot.wordCount : current.wordCount,
                    at: Date.now(),
                }));
            });
            opened.subscribe((status) => {
                if (status !== 'SUBSCRIBED') return;
                // Re-sent on an interval: the student's channel may not have joined yet, and a
                // broadcast sent before then is silently dropped.
                spotlight(true);
                ping ??= setInterval(() => spotlight(true), SPOTLIGHT_PING_MS);
            });
        };
        const pending = releaseStaleChannels(client, [topic]);
        if (pending) void pending.then(open);
        else open();
        return () => {
            cancelled = true;
            if (ping) clearInterval(ping);
            spotlight(false);
            if (channel) void client.removeChannel(channel);
        };
    }, [hasDb, assignmentId, studentId, supabaseUrl, supabaseAnonKey]);

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(interval);
    }, []);

    const backLink = (
        <Link to={`/essays/${assignmentId ?? ''}/monitor`} className="btn btn-secondary btn-sm">
            <ArrowLeft size={14} aria-hidden="true" /> {t('tests.monitor.projector.back')}
        </Link>
    );

    if (!hasDb) {
        return (
            <div style={screenStyle} data-testid="essay-draft-projector">
                <h1 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 28px)', lineHeight: 1.2 }}>
                    {t('tests.monitor.projector.title')}
                </h1>
                <p className="text-muted">{t('tests.monitor.projector.db_required')}</p>
                {backLink}
            </div>
        );
    }

    const text = draft.text ?? '';
    const added = draft.previousText !== undefined ? lastAddedSentence(draft.previousText, text) : null;
    const ageSeconds = draft.at !== undefined ? Math.floor((now - draft.at) / 1000) : undefined;

    return (
        <div style={screenStyle} data-testid="essay-draft-projector">
            <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span
                    className="badge badge-red"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    data-testid="essay-projector-live"
                >
                    <MonitorPlay size={12} aria-hidden="true" />
                    {t('tests.monitor.projector.live')}
                </span>
                <h1 style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 28px)', lineHeight: 1.2 }}>
                    {name || t('tests.monitor.projector.unknown_student')}
                </h1>
                {draft.wordCount !== undefined && (
                    <span className="text-muted" style={{ fontSize: '1.05rem' }}>
                        {t('tests.monitor.projector.words', { count: draft.wordCount })}
                    </span>
                )}
                {ageSeconds !== undefined && (
                    <span className="text-muted" style={{ fontSize: '0.95rem' }}>
                        {ageSeconds < 60
                            ? t('tests.monitor.projector.updated_now')
                            : t('tests.monitor.projector.updated_minutes', { count: Math.floor(ageSeconds / 60) })}
                    </span>
                )}
                <span style={{ marginLeft: 'auto' }}>{backLink}</span>
            </header>

            <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                {t('tests.monitor.projector.note')}
            </p>

            <div
                data-testid="essay-projector-text"
                style={{
                    flex: 1,
                    fontSize: 'clamp(20px, 2.4vw, 34px)',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    color: text ? 'var(--text)' : 'var(--text-dim)',
                }}
            >
                {text === '' ? (
                    t('tests.monitor.projector.waiting')
                ) : added ? (
                    <>
                        {text.slice(0, added.start)}
                        <mark
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                                color: 'var(--text)',
                                borderRadius: 4,
                                padding: '0 3px',
                            }}
                        >
                            {text.slice(added.start, added.end)}
                        </mark>
                        {text.slice(added.end)}
                    </>
                ) : (
                    text
                )}
            </div>
        </div>
    );
}

const screenStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    minHeight: '100vh',
    padding: 'clamp(20px, 3vw, 40px)',
    background: 'var(--bg)',
    color: 'var(--text)',
};
