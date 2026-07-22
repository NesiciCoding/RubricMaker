import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    Users,
    FileText,
    Plus,
    ArrowRight,
    ArrowUpRight,
    ChevronRight,
    TrendingUp,
    CheckCircle,
    AlertTriangle,
    ClipboardList,
    Clock,
    Layers,
    Mail,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Message, Rubric } from '../types';
import { useApp } from '../context/AppContext';
import { QUICK_START_TEMPLATES } from '../data/templates';
import { calcGradeSummary } from '../utils/gradeCalc';
import { aggregateClassCriterionAverages } from '../utils/classCriterionAggregator';
import { getGrammarRecommendations } from '../utils/learningPathAggregator';
import { nanoid } from '../utils/nanoid';
import { useToast } from '../hooks/useToast';
import { formatShortDate } from '../utils/dateInput';

function dayKey(iso: string): string {
    return new Date(iso).toDateString();
}

export function dateGroupLabel(iso: string, t: TFunction): string {
    const key = dayKey(iso);
    if (key === new Date().toDateString()) return t('dashboard.date_today', 'Today');
    if (key === new Date(Date.now() - 86_400_000).toDateString()) return t('dashboard.date_yesterday', 'Yesterday');
    return formatShortDate(iso);
}

function timeAgo(iso: string, t: TFunction): string {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return t('dashboard.time_just_now');
    if (diff < 3600) return t('dashboard.time_minutes_ago', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('dashboard.time_hours_ago', { count: Math.floor(diff / 3600) });
    return t('dashboard.time_days_ago', { count: Math.floor(diff / 86400) });
}

function greetingKey(hour: number): string {
    if (hour < 12) return 'dashboard.greeting_morning';
    if (hour < 18) return 'dashboard.greeting_afternoon';
    return 'dashboard.greeting_evening';
}

function isWithinLastWeek(iso: string | undefined): boolean {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 7 * 86_400_000;
}

function TrendBadge({ count, t }: { count: number; t: TFunction }) {
    if (count <= 0) {
        return (
            <span className="text-muted text-xs" style={{ fontWeight: 600 }}>
                {t('dashboard.trend_none')}
            </span>
        );
    }
    return (
        <span
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                color: 'var(--green)',
                fontSize: '0.75rem',
                fontWeight: 700,
            }}
        >
            <ArrowUpRight size={13} />
            {t('dashboard.trend_this_week', { count })}
        </span>
    );
}

export default function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const {
        rubrics,
        students,
        studentRubrics,
        studentTests,
        tests,
        classes,
        essaySubmissions,
        flashcardDecks,
        gradeScales,
        settings,
        userTemplates,
        deleteUserTemplate,
        addFlashcardAssignments,
        sendMessage,
        notifyStudentMessage,
    } = useApp();
    const [messagingStudentId, setMessagingStudentId] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');

    const scale = useMemo(
        () => gradeScales.find((g) => g.id === settings.defaultGradeScaleId) ?? gradeScales[0],
        [gradeScales, settings.defaultGradeScaleId]
    );

    const recentActivity = useMemo(() => {
        type GradeItem = {
            type: 'grading';
            timestamp: string;
            studentName: string;
            rubricName: string;
            rubricId: string;
            studentId: string;
        };
        type EditItem = { type: 'rubric_edit'; timestamp: string; rubricName: string; rubricId: string };
        type Item = GradeItem | EditItem;

        const gradings: GradeItem[] = studentRubrics
            .filter((sr) => sr.gradedAt)
            .map((sr) => ({
                type: 'grading' as const,
                timestamp: sr.gradedAt!,
                studentName: students.find((s) => s.id === sr.studentId)?.name ?? '?',
                rubricName: rubrics.find((r) => r.id === sr.rubricId)?.name ?? sr.rubricId,
                rubricId: sr.rubricId,
                studentId: sr.studentId,
            }));

        const edits: EditItem[] = rubrics.map((r) => ({
            type: 'rubric_edit' as const,
            timestamp: r.updatedAt,
            rubricName: r.name,
            rubricId: r.id,
        }));

        const all: Item[] = [...gradings, ...edits].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Deduplicate: for each rubric_edit, if there's a grading for the same rubric within the same second skip the edit
        const seen = new Set<string>();
        return all
            .filter((item) => {
                const key =
                    item.type === 'grading' ? `grading_${item.rubricId}_${item.studentId}` : `edit_${item.rubricId}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8);
    }, [studentRubrics, rubrics, students]);

    const completedCount = useMemo(() => {
        return studentRubrics.filter((sr) => {
            const rubric = rubrics.find((r) => r.id === sr.rubricId);
            if (!rubric) return false;
            return sr.entries.every((e) => e.levelId !== null || e.overridePoints !== undefined);
        }).length;
    }, [studentRubrics, rubrics]);

    // Submitted essays awaiting a grade: an EssaySubmission with no corresponding graded StudentRubric yet
    const needsGrading = useMemo(() => {
        const byKey = new Map<
            string,
            {
                studentId: string;
                studentName: string;
                rubricId: string;
                rubricName: string;
                className?: string;
                submittedAt: string;
            }
        >();
        for (const sub of essaySubmissions) {
            const key = `${sub.assignmentRubricId}_${sub.assignmentStudentId}`;
            const alreadyGraded = studentRubrics.some(
                (sr) =>
                    sr.rubricId === sub.assignmentRubricId && sr.studentId === sub.assignmentStudentId && sr.gradedAt
            );
            if (alreadyGraded) continue;
            const rubric = rubrics.find((r) => r.id === sub.assignmentRubricId);
            const student = students.find((s) => s.id === sub.assignmentStudentId);
            if (!rubric || !student) continue;
            const cls = classes.find((c) => c.id === student.classId);
            const existing = byKey.get(key);
            if (existing && existing.submittedAt >= sub.submittedAt) continue;
            byKey.set(key, {
                studentId: student.id,
                studentName: student.name,
                rubricId: rubric.id,
                rubricName: rubric.name,
                className: cls?.name,
                submittedAt: sub.submittedAt,
            });
        }
        return Array.from(byKey.values()).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    }, [essaySubmissions, studentRubrics, rubrics, students, classes]);

    // "This week" trend counts feeding the stat-card badges — real counts, not fabricated percentages
    const weeklyTrends = useMemo(
        () => ({
            rubrics: rubrics.filter((r) => isWithinLastWeek(r.createdAt)).length,
            students: students.filter((s) => isWithinLastWeek(s.updatedAt)).length,
            grades: studentRubrics.filter((sr) => isWithinLastWeek(sr.gradedAt)).length,
            needsGrading: needsGrading.filter((n) => isWithinLastWeek(n.submittedAt)).length,
        }),
        [rubrics, students, studentRubrics, needsGrading]
    );

    // "Class CEFR — Writing": per-criterion class averages for the most recently graded writing
    // rubric, scoped to the global active-class selector (settings.activeClassId) when one is set
    const classCriterionAverages = useMemo(
        () => aggregateClassCriterionAverages(studentRubrics, rubrics, students, settings.activeClassId),
        [studentRubrics, rubrics, students, settings.activeClassId]
    );

    const activeClassName = useMemo(
        () => (settings.activeClassId ? classes.find((c) => c.id === settings.activeClassId)?.name : undefined),
        [classes, settings.activeClassId]
    );

    // At-risk: students with 2+ recent grades below 55%, plus feedback age per student
    const { atRiskStudents, feedbackAge } = useMemo(() => {
        const AT_RISK_THRESHOLD = 55;
        const AT_RISK_MIN_GRADES = 2;

        // Map studentId → sorted list of recent grades (newest first)
        const gradesByStudent = new Map<string, { pct: number; gradedAt: string; rubricId: string }[]>();
        for (const sr of studentRubrics) {
            if (sr.notHandedIn || !sr.gradedAt) continue;
            const rubric = rubrics.find((r) => r.id === sr.rubricId) ?? sr.rubricSnapshot;
            if (!rubric) continue;
            const resolvedScaleId = rubric.gradeScaleId ?? scale?.id;
            const sc =
                resolvedScaleId && resolvedScaleId !== 'none'
                    ? (gradeScales.find((g) => g.id === resolvedScaleId) ?? null)
                    : null;
            const summary = calcGradeSummary(sr, rubric.criteria, sc);
            const list = gradesByStudent.get(sr.studentId) ?? [];
            list.push({ pct: summary.modifiedPercentage, gradedAt: sr.gradedAt, rubricId: sr.rubricId });
            gradesByStudent.set(sr.studentId, list);
        }

        const atRisk: { student: (typeof students)[0]; recentPct: number; gradedAt: string; rubricId: string }[] = [];
        const feedbackAgeMap = new Map<string, number>(); // studentId → days

        for (const [sid, grades] of gradesByStudent) {
            grades.sort((a, b) => b.gradedAt.localeCompare(a.gradedAt));
            const latest = grades[0];
            const daysSince = Math.floor((Date.now() - new Date(latest.gradedAt).getTime()) / 86_400_000);
            feedbackAgeMap.set(sid, daysSince);

            const recent = grades.slice(0, 3);
            const belowThreshold = recent.filter((g) => g.pct < AT_RISK_THRESHOLD);
            if (belowThreshold.length >= AT_RISK_MIN_GRADES) {
                const student = students.find((s) => s.id === sid);
                if (student)
                    atRisk.push({
                        student,
                        recentPct: latest.pct,
                        gradedAt: latest.gradedAt,
                        rubricId: latest.rubricId,
                    });
            }
        }

        return { atRiskStudents: atRisk.slice(0, 6), feedbackAge: feedbackAgeMap };
    }, [studentRubrics, rubrics, students, gradeScales, scale]);

    // studentId → first recommended grammar deck id, when the at-risk student's low-score
    // streak has an existing deck to assign (reuses the Phase 16.1 recommendation engine)
    const recommendedDeckByStudent = useMemo(() => {
        const map = new Map<string, string>();
        for (const { student } of atRiskStudents) {
            const recs = getGrammarRecommendations(
                student.id,
                studentRubrics,
                rubrics,
                studentTests,
                tests,
                flashcardDecks
            );
            const deckId = recs.find((r) => r.suggestedGrammarDeckIds.length > 0)?.suggestedGrammarDeckIds[0];
            if (deckId) map.set(student.id, deckId);
        }
        return map;
    }, [atRiskStudents, studentRubrics, rubrics, studentTests, tests, flashcardDecks]);

    function assignRecommendedDeck(studentId: string) {
        const deckId = recommendedDeckByStudent.get(studentId);
        const deck = deckId ? flashcardDecks.find((d) => d.id === deckId) : undefined;
        if (!deck) return;
        addFlashcardAssignments([
            {
                deckId: deck.id,
                studentId,
                deckName: deck.name,
                cardCount: deck.cards.length,
                createdAt: new Date().toISOString(),
            },
        ]);
        showToast(t('dashboard.at_risk_deck_assigned', { deck: deck.name }), 'success');
    }

    function sendAtRiskMessage(studentId: string) {
        const body = messageText.trim();
        if (!body) return;
        const message: Message = {
            id: nanoid(),
            studentId,
            contextType: 'general',
            contextId: null,
            contextLabel: null,
            sender: 'teacher',
            body,
            createdAt: new Date().toISOString(),
            readByTeacher: true,
            readByStudent: false,
        };
        sendMessage(message);
        if (settings.notifyStudentsOnMessage) {
            notifyStudentMessage(studentId, null, body);
        }
        setMessagingStudentId(null);
        setMessageText('');
        showToast(t('dashboard.at_risk_message_sent'), 'success');
    }

    return (
        <>
            <Topbar
                title={t('dashboard.title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                        <Plus size={15} /> {t('dashboard.new_rubric')}
                    </button>
                }
            />
            <div className="page-content fade-in dashboard-container">
                {/* Greeting header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        marginBottom: 20,
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: '1.55rem',
                                fontWeight: 700,
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {t(greetingKey(new Date().getHours()))}
                        </div>
                        <div className="text-muted text-sm" style={{ marginTop: 3 }}>
                            {t('dashboard.header_meta', {
                                rubrics: rubrics.length,
                                classes: classes.length,
                                students: students.length,
                            })}
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 32,
                            padding: '0 12px',
                            borderRadius: 8,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                        }}
                    >
                        {t('dashboard.this_week')}
                    </div>
                </div>

                {/* Stat cards */}
                <div className="grid-4 mb-4">
                    <div
                        className="card hoverable"
                        onClick={() => navigate('/rubrics')}
                        style={{ borderTop: '3px solid var(--accent)', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'var(--accent-soft)', padding: 10, borderRadius: 10 }}>
                                <BookOpen size={20} style={{ color: 'var(--accent)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{rubrics.length}</div>
                                <div className="text-muted text-sm">{t('dashboard.rubrics')}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <TrendBadge count={weeklyTrends.rubrics} t={t} />
                        </div>
                    </div>
                    <div
                        className="card hoverable"
                        onClick={() => navigate('/students')}
                        style={{ borderTop: '3px solid var(--green)', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(34,197,94,0.12)', padding: 10, borderRadius: 10 }}>
                                <Users size={20} style={{ color: 'var(--green)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{students.length}</div>
                                <div className="text-muted text-sm">{t('dashboard.students')}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <TrendBadge count={weeklyTrends.students} t={t} />
                        </div>
                    </div>
                    <div
                        className="card hoverable"
                        data-tour="dashboard-grades"
                        onClick={() => navigate('/export')}
                        style={{ borderTop: '3px solid var(--purple)', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(139,92,246,0.12)', padding: 10, borderRadius: 10 }}>
                                <TrendingUp size={20} style={{ color: 'var(--purple)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{completedCount}</div>
                                <div className="text-muted text-sm">{t('dashboard.grades_submitted')}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <TrendBadge count={weeklyTrends.grades} t={t} />
                        </div>
                    </div>
                    <div
                        className="card hoverable"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate('/rubrics')}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') navigate('/rubrics');
                        }}
                        style={{ borderTop: '3px solid var(--yellow)', cursor: 'pointer' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ background: 'rgba(201,133,31,0.12)', padding: 10, borderRadius: 10 }}>
                                <ClipboardList size={20} style={{ color: 'var(--yellow)' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{needsGrading.length}</div>
                                <div className="text-muted text-sm">{t('dashboard.needs_grading')}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                            <TrendBadge count={weeklyTrends.needsGrading} t={t} />
                        </div>
                    </div>
                </div>

                {/* At-risk students panel */}
                {atRiskStudents.length > 0 && (
                    <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--red)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
                            <h3 style={{ margin: 0, color: 'var(--red)' }}>At-Risk Students</h3>
                            <span className="text-muted text-xs" style={{ marginLeft: 4 }}>
                                (scored below 55% on 2+ recent assessments)
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {atRiskStudents.map(({ student, recentPct, rubricId }) => (
                                <div
                                    key={student.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                                >
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        title={t('dashboard.at_risk_go_to_grading', 'Go to grading')}
                                        onClick={() => navigate(`/rubrics/${rubricId}/grade/${student.id}`)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                                    >
                                        <span style={{ fontWeight: 600 }}>{student.name}</span>
                                        <span style={{ color: 'var(--red)', fontSize: '0.78rem' }}>
                                            {recentPct.toFixed(0)}%
                                        </span>
                                        {feedbackAge.has(student.id) && feedbackAge.get(student.id)! >= 7 && (
                                            <span title={`Last feedback ${feedbackAge.get(student.id)} days ago`}>
                                                <Clock
                                                    size={11}
                                                    style={{
                                                        color:
                                                            feedbackAge.get(student.id)! >= 10
                                                                ? 'var(--red)'
                                                                : 'var(--yellow, #f59e0b)',
                                                    }}
                                                />
                                            </span>
                                        )}
                                        <ChevronRight size={13} style={{ opacity: 0.6 }} />
                                    </button>
                                    {recommendedDeckByStudent.has(student.id) && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon btn-sm"
                                            title={t('dashboard.at_risk_assign_deck')}
                                            aria-label={t('dashboard.at_risk_assign_deck')}
                                            onClick={() => assignRecommendedDeck(student.id)}
                                        >
                                            <Layers size={14} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-icon btn-sm"
                                        title={t('dashboard.at_risk_message')}
                                        aria-label={t('dashboard.at_risk_message')}
                                        onClick={() =>
                                            setMessagingStudentId((cur) => (cur === student.id ? null : student.id))
                                        }
                                    >
                                        <Mail size={14} />
                                    </button>
                                    {messagingStudentId === student.id && (
                                        <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                                            <input
                                                type="text"
                                                aria-label={t('dashboard.at_risk_message_placeholder')}
                                                value={messageText}
                                                onChange={(e) => setMessageText(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') sendAtRiskMessage(student.id);
                                                }}
                                                placeholder={t('dashboard.at_risk_message_placeholder')}
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                disabled={!messageText.trim()}
                                                onClick={() => sendAtRiskMessage(student.id)}
                                            >
                                                {t('dashboard.at_risk_message_send')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Needs grading */}
                        <div className="card">
                            <div
                                className="card-header"
                                style={{
                                    marginBottom: 14,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <h3>{t('dashboard.needs_grading')}</h3>
                                <span
                                    className="text-muted text-xs"
                                    role="button"
                                    tabIndex={0}
                                    style={{ fontWeight: 600, cursor: 'pointer' }}
                                    onClick={() => navigate('/rubrics')}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') navigate('/rubrics');
                                    }}
                                >
                                    {t('dashboard.view_queue')}
                                </span>
                            </div>
                            {needsGrading.length === 0 ? (
                                <div className="text-muted text-sm">{t('dashboard.needs_grading_empty')}</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {needsGrading.slice(0, 6).map((item) => (
                                        <div
                                            key={`${item.rubricId}_${item.studentId}`}
                                            className="hoverable"
                                            role="button"
                                            tabIndex={0}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 12,
                                                padding: '8px 6px',
                                                borderRadius: 10,
                                                cursor: 'pointer',
                                            }}
                                            onClick={() =>
                                                navigate(`/rubrics/${item.rubricId}/grade/${item.studentId}`)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ')
                                                    navigate(`/rubrics/${item.rubricId}/grade/${item.studentId}`);
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 34,
                                                    height: 34,
                                                    borderRadius: 99,
                                                    background: 'var(--bg-elevated)',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 700,
                                                    fontSize: '0.8rem',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {item.studentName
                                                    .split(' ')
                                                    .map((p) => p[0])
                                                    .join('')
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                                    {item.studentName}
                                                </div>
                                                <div
                                                    className="text-muted text-xs"
                                                    style={{
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {item.rubricName}
                                                </div>
                                            </div>
                                            {item.className && (
                                                <span
                                                    className="text-muted text-xs"
                                                    style={{
                                                        background: 'var(--bg-elevated)',
                                                        padding: '3px 9px',
                                                        borderRadius: 99,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {item.className}
                                                </span>
                                            )}
                                            <span className="text-muted text-xs" style={{ flexShrink: 0 }}>
                                                {timeAgo(item.submittedAt, t)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Activity feed */}
                        <div className="card">
                            <div className="card-header" style={{ marginBottom: 14 }}>
                                <h3>{t('dashboard.recent_activity')}</h3>
                            </div>
                            {recentActivity.length === 0 ? (
                                <div className="empty-state">
                                    <BookOpen size={32} />
                                    <p>{t('dashboard.no_rubrics')}</p>
                                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                                        <Plus size={14} /> {t('dashboard.create_first')}
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {recentActivity.map((item, idx) => {
                                        const groupLabel = dateGroupLabel(item.timestamp, t);
                                        const showGroupHeader =
                                            idx === 0 ||
                                            groupLabel !== dateGroupLabel(recentActivity[idx - 1].timestamp, t);
                                        return (
                                            <React.Fragment
                                                key={
                                                    item.type === 'grading'
                                                        ? `grading_${item.rubricId}_${item.studentId}`
                                                        : `edit_${item.rubricId}`
                                                }
                                            >
                                                {showGroupHeader && (
                                                    <div
                                                        style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: 600,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.04em',
                                                            color: 'var(--text-muted)',
                                                            marginTop: idx === 0 ? 0 : 8,
                                                            padding: '0 2px',
                                                        }}
                                                    >
                                                        {groupLabel}
                                                    </div>
                                                )}
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        padding: '9px 12px',
                                                        background: 'var(--bg-elevated)',
                                                        borderRadius: 8,
                                                        border: '1px solid var(--border)',
                                                    }}
                                                >
                                                    <div style={{ flexShrink: 0 }}>
                                                        {item.type === 'grading' ? (
                                                            <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                                                        ) : (
                                                            <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        {item.type === 'grading' ? (
                                                            <div style={{ fontSize: '0.85rem' }}>
                                                                {t('dashboard.activity_graded_prefix', 'Graded')}{' '}
                                                                <strong>{item.studentName}</strong>
                                                                {' — '}
                                                                {item.rubricName}
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '0.85rem' }}>
                                                                {t('dashboard.activity_updated_prefix', 'Updated')}{' '}
                                                                <strong>{item.rubricName}</strong>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span
                                                        className="text-muted text-xs"
                                                        style={{
                                                            flexShrink: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                        }}
                                                    >
                                                        {item.type === 'grading' &&
                                                            (() => {
                                                                const days = feedbackAge.get(item.studentId);
                                                                if (days === undefined) return null;
                                                                if (days >= 10)
                                                                    return (
                                                                        <span
                                                                            title={`${days}d ago — feedback may be stale`}
                                                                        >
                                                                            <Clock
                                                                                size={11}
                                                                                style={{ color: 'var(--red)' }}
                                                                            />
                                                                        </span>
                                                                    );
                                                                if (days >= 7)
                                                                    return (
                                                                        <span title={`${days}d ago`}>
                                                                            <Clock
                                                                                size={11}
                                                                                style={{
                                                                                    color: 'var(--yellow, #f59e0b)',
                                                                                }}
                                                                            />
                                                                        </span>
                                                                    );
                                                                return null;
                                                            })()}
                                                        {timeAgo(item.timestamp, t)}
                                                    </span>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        style={{
                                                            flexShrink: 0,
                                                            fontSize: '0.75rem',
                                                            padding: '3px 8px',
                                                        }}
                                                        onClick={() =>
                                                            item.type === 'grading'
                                                                ? navigate(
                                                                      `/rubrics/${item.rubricId}/grade/${item.studentId}`
                                                                  )
                                                                : navigate(`/rubrics/${item.rubricId}`)
                                                        }
                                                    >
                                                        {item.type === 'grading'
                                                            ? t('dashboard.action_resume')
                                                            : t('dashboard.action_open')}{' '}
                                                        <ArrowRight size={12} />
                                                    </button>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {/* Class CEFR — Writing */}
                        <div className="card">
                            <h3 style={{ marginBottom: 4 }}>{t('dashboard.class_cefr_title')}</h3>
                            <div className="text-muted text-sm" style={{ marginBottom: 14 }}>
                                {classCriterionAverages.rubric
                                    ? t(
                                          activeClassName
                                              ? 'dashboard.class_cefr_sub_class'
                                              : 'dashboard.class_cefr_sub_all',
                                          { class: activeClassName, rubric: classCriterionAverages.rubric.name }
                                      )
                                    : t('dashboard.class_cefr_empty')}
                            </div>
                            {classCriterionAverages.bars.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {classCriterionAverages.bars.map((bar) => (
                                        <div key={bar.name}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: '0.8rem',
                                                    marginBottom: 5,
                                                }}
                                            >
                                                <span className="text-muted">{bar.name}</span>
                                                <span style={{ fontWeight: 700 }}>{bar.pct}%</span>
                                            </div>
                                            <div
                                                style={{
                                                    height: 8,
                                                    borderRadius: 99,
                                                    background: 'var(--bg-elevated)',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${bar.pct}%`,
                                                        borderRadius: 99,
                                                        background: 'var(--accent)',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Quick actions */}
                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>{t('dashboard.quick_actions')}</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    {
                                        label: t('dashboard.action_create_rubric'),
                                        icon: BookOpen,
                                        color: 'var(--accent)',
                                        path: '/rubrics/new',
                                    },
                                    {
                                        label: t('dashboard.action_add_student'),
                                        icon: Users,
                                        color: 'var(--green)',
                                        path: '/students',
                                    },
                                    {
                                        label: t('dashboard.action_upload_attachment'),
                                        icon: FileText,
                                        color: 'var(--purple)',
                                        path: '/attachments',
                                    },
                                ].map(({ label, icon: Icon, color, path }) => (
                                    <button
                                        key={path}
                                        className="btn btn-secondary"
                                        onClick={() => navigate(path)}
                                        style={{ justifyContent: 'flex-start', gap: 12 }}
                                    >
                                        <Icon size={16} style={{ color }} />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="card">
                            <h3 style={{ marginBottom: 16 }}>{t('dashboard.quick_start_templates')}</h3>
                            {userTemplates.length > 0 && (
                                <>
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: 'var(--text-muted)',
                                            marginBottom: 8,
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {t('dashboard.my_templates', 'My Templates')}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                        {userTemplates.map((tpl) => (
                                            <div
                                                key={tpl.id}
                                                style={{
                                                    padding: '10px 12px',
                                                    background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                                                    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                                    borderRadius: 8,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                }}
                                                onClick={() => navigate('/rubrics/new', { state: { template: tpl } })}
                                                className="hoverable"
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                                                        {tpl.name}
                                                    </div>
                                                    {tpl.subject && (
                                                        <div
                                                            style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                                                        >
                                                            {tpl.subject || t('dashboard.no_subject')}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    style={{ color: 'var(--red)', flexShrink: 0 }}
                                                    title={t('dashboard.remove_template')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteUserTemplate(tpl.id);
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            color: 'var(--text-muted)',
                                            marginBottom: 8,
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        {t('dashboard.builtin_templates')}
                                    </div>
                                </>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {QUICK_START_TEMPLATES.map((tpl, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            padding: '12px 14px',
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 10,
                                            border: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                        onClick={() => {
                                            const newRubric: Partial<Rubric> = {
                                                ...tpl,
                                                id: undefined,
                                                createdAt: undefined,
                                                updatedAt: undefined,
                                            };
                                            navigate('/rubrics/new', { state: { template: newRubric } });
                                        }}
                                        className="hoverable"
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                                            {tpl.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {tpl.subject}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
