import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Users, BookOpen, Download, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BLOOM_LEVELS } from '../data/bloomsTaxonomy';
import { IB_ATTRIBUTES } from '../data/ibLearnerProfile';
import { aggregateFrameworkScores } from '../utils/frameworkAggregator';
import BloomsPyramidChart from '../components/Statistics/BloomsPyramidChart';
import FrameworkRoseChart from '../components/Statistics/FrameworkRoseChart';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary, calcClassStats, calcEntryPoints, type GradeSummary } from '../utils/gradeCalc';
import type { StudentRubric, Student, Rubric, RubricCriterion } from '../types';
import { getClassGoalScores } from '../utils/learningGoalsAggregator';
import LearningGoalChart from '../components/Statistics/LearningGoalChart';
import CriterionRadarChart, { type CriterionRadarDataPoint } from '../components/Statistics/CriterionRadarChart';
import ScoreHistogram from '../components/Statistics/ScoreHistogram';
import CriterionHeatmap from '../components/Statistics/CriterionHeatmap';
import ClassTrendChart from '../components/Statistics/ClassTrendChart';

const STUDENT_COLORS = ['var(--purple)', 'var(--green)', 'var(--yellow)', 'var(--red)'];

function exportChartAsPng(containerRef: React.RefObject<HTMLDivElement | null>, filename: string) {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svg.clientWidth || 600;
        canvas.height = svg.clientHeight || 420;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
            if (blob) saveAs(blob, filename);
        }, 'image/png');
    };
    img.src = url;
}

export default function StatisticsPage() {
    const { rubrics, students, classes, studentRubrics, gradeScales, settings, updateSettings } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    // ── View mode ────────────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<'rubric' | 'student'>('rubric');

    // ── Rubric view state ─────────────────────────────────────────────────────
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [sortKey, setSortKey] = useState<'name' | 'score' | 'raw' | 'grade' | 'progress'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    // ── Student view state ────────────────────────────────────────────────────
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [studentViewClassId, setStudentViewClassId] = useState<string>('all');
    const [selectedStudentRubricId, setSelectedStudentRubricId] = useState('');
    const [comparedStudentIds, setComparedStudentIds] = useState<string[]>([]);

    // ── Fullscreen state ──────────────────────────────────────────────────────
    const [criterionFullscreen, setCriterionFullscreen] = useState(false);
    const criterionChartRef = useRef<HTMLDivElement>(null);

    // Close fullscreen on Escape
    useEffect(() => {
        if (!criterionFullscreen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setCriterionFullscreen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [criterionFullscreen]);

    // Reset per-rubric/comparison state when student changes
    useEffect(() => {
        setSelectedStudentRubricId('');
        setComparedStudentIds([]);
    }, [selectedStudentId]);

    // ── Persisted chart preferences (on-screen toggles) ──────────────────────
    const criterionChartType = settings.statisticsCriterionChartType ?? 'bar';
    const excludeNHI = settings.statisticsExcludeNotHandedIn ?? false;

    // ── Rubric view data ──────────────────────────────────────────────────────
    const rubric = rubrics.find((r) => r.id === selectedRubricId);
    const scaleId = rubric?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale = scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0]);

    const nhiCount = useMemo(() => {
        if (!rubric) return 0;
        return studentRubrics.filter((sr) => sr.rubricId === rubric.id && sr.notHandedIn).length;
    }, [rubric, studentRubrics]);

    const summaries = useMemo(() => {
        if (!rubric) return [];
        return studentRubrics
            .filter((sr) => {
                if (sr.rubricId !== rubric.id) return false;
                if (excludeNHI && sr.notHandedIn) return false;
                if (selectedClassId === 'all') return true;
                const student = students.find((s) => s.id === sr.studentId);
                return student?.classId === selectedClassId;
            })
            .map((sr) => calcGradeSummary(sr, rubric.criteria, scale, rubric));
    }, [rubric, studentRubrics, scale, selectedClassId, students, excludeNHI]);

    const stats = useMemo(() => calcClassStats(summaries, scale), [summaries, scale]);

    const criterionStats = useMemo(() => {
        if (!rubric) return [];
        return rubric.criteria.map((c) => {
            const scores = studentRubrics
                .filter((sr) => {
                    if (sr.rubricId !== rubric.id) return false;
                    if (excludeNHI && sr.notHandedIn) return false;
                    if (selectedClassId === 'all') return true;
                    const student = students.find((s) => s.id === sr.studentId);
                    return student?.classId === selectedClassId;
                })
                .map((sr) => {
                    const entry = sr.entries.find((e) => e.criterionId === c.id);
                    if (!entry) return 0;
                    return calcEntryPoints(entry, c);
                });
            const max = Math.max(...c.levels.map((l) => l.maxPoints), 1);
            const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
            return { name: c.title, avg: parseFloat(((avg / max) * 100).toFixed(1)), max };
        });
    }, [rubric, studentRubrics, selectedClassId, students, excludeNHI]);

    const filteredRubricStudentRubrics = useMemo(() => {
        if (!rubric) return [];
        return studentRubrics.filter((sr) => {
            if (sr.rubricId !== rubric.id) return false;
            if (excludeNHI && sr.notHandedIn) return false;
            if (selectedClassId === 'all') return true;
            const student = students.find((s) => s.id === sr.studentId);
            return student?.classId === selectedClassId;
        });
    }, [rubric, studentRubrics, selectedClassId, students, excludeNHI]);

    const bloomsData = useMemo(() => {
        const inCriteria = rubric?.criteria.some((c) =>
            c.frameworkDescriptors?.some((fd) => fd.framework === 'blooms')
        );
        const inSnapshots = filteredRubricStudentRubrics.some((sr) =>
            sr.rubricSnapshot?.criteria.some((c) => c.frameworkDescriptors?.some((fd) => fd.framework === 'blooms'))
        );
        if (!inCriteria && !inSnapshots) return null;
        return aggregateFrameworkScores('blooms', filteredRubricStudentRubrics, rubric?.criteria ?? []);
    }, [rubric, filteredRubricStudentRubrics]);

    const ibData = useMemo(() => {
        const inCriteria = rubric?.criteria.some((c) => c.frameworkDescriptors?.some((fd) => fd.framework === 'ib'));
        const inSnapshots = filteredRubricStudentRubrics.some((sr) =>
            sr.rubricSnapshot?.criteria.some((c) => c.frameworkDescriptors?.some((fd) => fd.framework === 'ib'))
        );
        if (!inCriteria && !inSnapshots) return null;
        return aggregateFrameworkScores('ib', filteredRubricStudentRubrics, rubric?.criteria ?? []);
    }, [rubric, filteredRubricStudentRubrics]);

    const classGoals = useMemo(() => {
        if (selectedClassId === 'all') return [];
        return getClassGoalScores(selectedClassId, students, studentRubrics, rubrics);
    }, [selectedClassId, students, studentRubrics, rubrics]);

    const classTrendData = useMemo(() => {
        if (selectedClassId === 'all') return [];
        return rubrics
            .filter((r) =>
                studentRubrics.some((sr) => {
                    if (sr.rubricId !== r.id) return false;
                    return students.find((s) => s.id === sr.studentId)?.classId === selectedClassId;
                })
            )
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((r) => {
                const scaleForR =
                    r.gradeScaleId === 'none'
                        ? null
                        : (gradeScales.find((g) => g.id === r.gradeScaleId) ?? gradeScales[0]);
                const sums = studentRubrics
                    .filter(
                        (sr) =>
                            sr.rubricId === r.id &&
                            students.find((s) => s.id === sr.studentId)?.classId === selectedClassId
                    )
                    .map((sr) => calcGradeSummary(sr, r.criteria, scaleForR, r).modifiedPercentage);
                if (sums.length === 0) return null;
                const avg = sums.reduce((a, b) => a + b, 0) / sums.length;
                const sorted = [...sums].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
                return {
                    rubricName: r.name,
                    date: r.createdAt,
                    avg: parseFloat(avg.toFixed(1)),
                    median: parseFloat(median.toFixed(1)),
                };
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);
    }, [selectedClassId, rubrics, studentRubrics, students, gradeScales]);

    const tableData = useMemo(() => {
        if (!rubric) return [];
        const data = studentRubrics
            .filter((sr) => sr.rubricId === rubric.id)
            .map((sr) => {
                const student = students.find((s) => s.id === sr.studentId);
                const r = sr.rubricSnapshot || rubric;
                const summary = calcGradeSummary(sr, r.criteria, scale, r);
                return { sr, student, summary };
            })
            .filter(
                (d): d is { sr: StudentRubric; student: Student; summary: GradeSummary } => !!d.student && !!d.summary
            );

        return data.sort((a, b) => {
            let valA: string | number, valB: string | number;
            if (sortKey === 'name') {
                valA = a.student.name.toLowerCase();
                valB = b.student.name.toLowerCase();
            } else if (sortKey === 'score') {
                valA = a.summary.modifiedPercentage;
                valB = b.summary.modifiedPercentage;
            } else if (sortKey === 'raw') {
                valA = a.summary.rawScore;
                valB = b.summary.rawScore;
            } else if (sortKey === 'grade') {
                valA = a.summary.letterGrade;
                valB = b.summary.letterGrade;
            } else {
                valA = a.summary.gradedCount / (a.summary.totalCriteria || 1);
                valB = b.summary.gradedCount / (b.summary.totalCriteria || 1);
            }
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rubric, studentRubrics, students, scale, sortKey, sortDir]);

    const heatmapScores = useMemo(() => {
        if (!rubric) return {};
        const result: Record<string, Record<string, number>> = {};
        tableData.forEach(({ sr, student }) => {
            result[student.id] = {};
            rubric.criteria.forEach((c) => {
                const entry = sr.entries.find((e) => e.criterionId === c.id);
                const pts = entry ? calcEntryPoints(entry, c) : 0;
                const max = Math.max(...c.levels.map((l) => l.maxPoints), 1);
                result[student.id][c.id] = parseFloat(((pts / max) * 100).toFixed(1));
            });
        });
        return result;
    }, [tableData, rubric]);

    function handleSort(key: typeof sortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'name' ? 'asc' : 'desc');
        }
    }

    // ── Student view data ─────────────────────────────────────────────────────
    const studentViewTableData = useMemo(() => {
        if (viewMode !== 'student' || !selectedStudentId) return [];
        return studentRubrics
            .filter((sr) => sr.studentId === selectedStudentId)
            .map((sr) => {
                const liveR = rubrics.find((r) => r.id === sr.rubricId);
                const r = sr.rubricSnapshot || liveR;
                if (!r) return null;
                const gScaleId = r.gradeScaleId ?? settings.defaultGradeScaleId;
                const gScale =
                    gScaleId === 'none' ? null : (gradeScales.find((g) => g.id === gScaleId) ?? gradeScales[0]);
                const summary = calcGradeSummary(sr, r.criteria, gScale, r);
                return { sr, rubric: r, summary };
            })
            .filter((d): d is { sr: StudentRubric; rubric: Rubric; summary: GradeSummary } => !!d);
    }, [viewMode, selectedStudentId, studentRubrics, rubrics, gradeScales, settings.defaultGradeScaleId]);

    // Students graded on the selected rubric (for multi-student comparison chips)
    const rubricPeers = useMemo(() => {
        if (!selectedStudentRubricId || !selectedStudentId) return [];
        const sr = studentRubrics.find((s) => s.id === selectedStudentRubricId);
        if (!sr) return [];
        return studentRubrics
            .filter((s) => s.rubricId === sr.rubricId && s.studentId !== selectedStudentId)
            .map((s) => students.find((st) => st.id === s.studentId))
            .filter((s): s is Student => !!s);
    }, [selectedStudentRubricId, selectedStudentId, studentRubrics, students]);

    const studentRadarData = useMemo((): CriterionRadarDataPoint[] | null => {
        if (!selectedStudentRubricId || !selectedStudentId) return null;
        const sr = studentRubrics.find((s) => s.id === selectedStudentRubricId);
        if (!sr) return null;
        const liveR = rubrics.find((r) => r.id === sr.rubricId);
        const r = sr.rubricSnapshot || liveR;
        if (!r) return null;

        const excludeIds = new Set([selectedStudentId, ...comparedStudentIds]);
        const classAvgMap: Record<string, number> = {};
        r.criteria.forEach((c) => {
            const scores = studentRubrics
                .filter((s) => s.rubricId === r.id && !excludeIds.has(s.studentId))
                .map((s) => {
                    const e = s.entries.find((e) => e.criterionId === c.id);
                    return e ? calcEntryPoints(e, c) : 0;
                });
            const max = Math.max(...c.levels.map((l) => l.maxPoints), 1);
            classAvgMap[c.id] =
                scores.length > 0
                    ? parseFloat(((scores.reduce((a, b) => a + b, 0) / scores.length / max) * 100).toFixed(1))
                    : 0;
        });

        const allSRs = [
            sr,
            ...comparedStudentIds
                .map((id) => studentRubrics.find((s) => s.rubricId === r.id && s.studentId === id))
                .filter((s): s is (typeof studentRubrics)[0] => !!s),
        ];

        return r.criteria.map((c) => {
            const max = Math.max(...c.levels.map((l) => l.maxPoints), 1);
            const point: CriterionRadarDataPoint = { name: c.title, avg: classAvgMap[c.id] ?? 0 };
            allSRs.forEach((s) => {
                const e = s.entries.find((e) => e.criterionId === c.id);
                const pts = e ? calcEntryPoints(e, c) : 0;
                point[s.studentId] = parseFloat(((pts / max) * 100).toFixed(1));
            });
            return point;
        });
    }, [selectedStudentRubricId, selectedStudentId, comparedStudentIds, studentRubrics, rubrics]);

    const selectedStudentName = students.find((s) => s.id === selectedStudentId)?.name ?? '';

    const radarSelectedStudents = useMemo(() => {
        if (!selectedStudentId) return [];
        return [
            { id: selectedStudentId, name: selectedStudentName, color: STUDENT_COLORS[0] },
            ...comparedStudentIds.map((id, i) => ({
                id,
                name: students.find((s) => s.id === id)?.name ?? id,
                color: STUDENT_COLORS[i + 1] ?? STUDENT_COLORS[STUDENT_COLORS.length - 1],
            })),
        ];
    }, [selectedStudentId, selectedStudentName, comparedStudentIds, students]);

    // ── CSV export ────────────────────────────────────────────────────────────
    function handleDownloadCsv() {
        if (!rubric || tableData.length === 0) return;
        const rows = tableData.map(({ student, summary, sr }) => {
            const base: Record<string, string | number> = {
                Name: student.name,
                'Score (%)': Math.round(summary.modifiedPercentage),
                Grade: summary.letterGrade,
                'Raw Points': summary.rawScore,
                'Max Points': summary.maxRawScore,
            };
            const snap = sr.rubricSnapshot || rubric;
            snap.criteria.forEach((c: RubricCriterion) => {
                const entry = sr.entries.find((e) => e.criterionId === c.id);
                const pts = entry ? calcEntryPoints(entry, c) : 0;
                base[`Criterion: ${c.title}`] = pts;
                base[`Criterion: ${c.title} (Comment)`] = entry?.comment ?? '';
            });
            return base;
        });
        const csv = Papa.unparse(rows);
        const filename = `${t('statistics.csv_filename')}_${rubric.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
    }

    // ── Criterion chart (bar or radar) shared renderer ────────────────────────
    const classAvgLabel = t('statistics.class_average_label');

    function renderCriterionChart(height: number) {
        return criterionChartType === 'radar' ? (
            <CriterionRadarChart
                data={criterionStats}
                accentColor={settings.accentColor || 'var(--accent)'}
                classAverageLabel={classAvgLabel}
                height={height}
            />
        ) : (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={criterionStats} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    />
                    <Tooltip
                        formatter={(v: unknown) => (v != null ? `${v}%` : '')}
                        contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                        }}
                    />
                    <Bar dataKey="avg" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <Topbar title={t('statistics.title')} />
            <div className="page-content fade-in">
                {/* ── Top controls ── */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {/* View mode toggle */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('statistics.view_mode')}</label>
                        <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 4 }}>
                            <button
                                className={`btn btn-sm ${viewMode === 'rubric' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('rubric')}
                            >
                                {t('statistics.view_by_rubric')}
                            </button>
                            <button
                                className={`btn btn-sm ${viewMode === 'student' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('student')}
                            >
                                {t('statistics.view_by_student')}
                            </button>
                        </div>
                    </div>

                    {viewMode === 'rubric' ? (
                        <>
                            <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                <label>{t('statistics.label_rubric')}</label>
                                <select value={selectedRubricId} onChange={(e) => setSelectedRubricId(e.target.value)}>
                                    {rubrics.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, maxWidth: 240, marginBottom: 0 }}>
                                <label>{t('statistics.label_class_filter')}</label>
                                <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                                    <option value="all">{t('statistics.all_classes')}</option>
                                    {classes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {/* Criterion chart type toggle */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>{t('statistics.label_criterion_chart')}</label>
                                <div
                                    style={{
                                        display: 'flex',
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 8,
                                        padding: 4,
                                    }}
                                >
                                    <button
                                        className={`btn btn-sm ${criterionChartType === 'bar' ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => updateSettings({ statisticsCriterionChartType: 'bar' })}
                                    >
                                        {t('statistics.chart_bar')}
                                    </button>
                                    <button
                                        className={`btn btn-sm ${criterionChartType === 'radar' ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => updateSettings({ statisticsCriterionChartType: 'radar' })}
                                    >
                                        {t('statistics.chart_radar')}
                                    </button>
                                </div>
                            </div>
                            {/* Exclude NHI toggle */}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ opacity: 0 }}>.</label>
                                <button
                                    className={`btn btn-sm ${excludeNHI ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => updateSettings({ statisticsExcludeNotHandedIn: !excludeNHI })}
                                    title={t('statistics.excl_nhi')}
                                >
                                    {excludeNHI ? t('statistics.excl_nhi_active') : t('statistics.excl_nhi')}
                                </button>
                            </div>
                            {tableData.length > 0 && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ alignSelf: 'flex-end', marginBottom: 0 }}
                                    onClick={handleDownloadCsv}
                                >
                                    <Download size={14} /> {t('statistics.download_csv')}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="form-group" style={{ flex: 1, maxWidth: 240, marginBottom: 0 }}>
                                <label>{t('statistics.label_class_filter')}</label>
                                <select
                                    value={studentViewClassId}
                                    onChange={(e) => setStudentViewClassId(e.target.value)}
                                >
                                    <option value="all">{t('statistics.all_classes')}</option>
                                    {classes.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                <label>{t('statistics.label_student')}</label>
                                <select
                                    value={selectedStudentId}
                                    onChange={(e) => setSelectedStudentId(e.target.value)}
                                >
                                    <option value="" disabled>
                                        {t('statistics.select_student_placeholder')}
                                    </option>
                                    {students
                                        .filter((s) => studentViewClassId === 'all' || s.classId === studentViewClassId)
                                        .map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            {selectedStudentId && (
                                <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                    <label>{t('statistics.label_rubric_comparison')}</label>
                                    <select
                                        value={selectedStudentRubricId}
                                        onChange={(e) => setSelectedStudentRubricId(e.target.value)}
                                    >
                                        <option value="" disabled>
                                            {t('statistics.select_rubric_placeholder')}
                                        </option>
                                        {studentRubrics
                                            .filter((sr) => sr.studentId === selectedStudentId)
                                            .map((sr) => {
                                                const r =
                                                    sr.rubricSnapshot || rubrics.find((r) => r.id === sr.rubricId);
                                                return r ? (
                                                    <option key={sr.id} value={sr.id}>
                                                        {r.name}
                                                    </option>
                                                ) : null;
                                            })}
                                    </select>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Rubric view ── */}
                {viewMode === 'rubric' ? (
                    <>
                        {selectedClassId !== 'all' && classGoals.length > 0 && <LearningGoalChart goals={classGoals} />}

                        {/* Class trend chart */}
                        {classTrendData.length >= 2 && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 style={{ marginBottom: 16 }}>{t('statistics.class_trend')}</h3>
                                <ClassTrendChart data={classTrendData} />
                            </div>
                        )}

                        {summaries.length === 0 ? (
                            <div className="empty-state">
                                <TrendingUp size={36} />
                                <p>{t('statistics.no_students')}</p>
                            </div>
                        ) : (
                            <>
                                {/* Stat cards */}
                                <div className="grid-5" style={{ marginBottom: 24 }}>
                                    {[
                                        {
                                            label: t('statistics.stat_students_graded'),
                                            value: summaries.length,
                                            color: 'var(--accent)',
                                        },
                                        {
                                            label: t('statistics.stat_average'),
                                            value: `${stats.average.toFixed(1)}%`,
                                            color: 'var(--green)',
                                        },
                                        {
                                            label: t('statistics.stat_median'),
                                            value: `${stats.median.toFixed(1)}%`,
                                            color: 'var(--purple)',
                                        },
                                        {
                                            label: t('statistics.stat_highest'),
                                            value: `${stats.highest.toFixed(1)}%`,
                                            color: 'var(--teal, #14b8a6)',
                                        },
                                        {
                                            label: t('statistics.stat_lowest'),
                                            value: `${stats.lowest.toFixed(1)}%`,
                                            color: 'var(--yellow)',
                                        },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} className="card" style={{ borderTop: `3px solid ${color}` }}>
                                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
                                            <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                                                {label}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {nhiCount > 0 && (
                                    <div
                                        className="card"
                                        style={{
                                            marginBottom: 20,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 16,
                                            padding: '12px 20px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: '1.4rem',
                                                fontWeight: 700,
                                                color: 'var(--red, #ef4444)',
                                            }}
                                        >
                                            {nhiCount}
                                        </span>
                                        <span className="text-muted text-sm">
                                            {excludeNHI
                                                ? t('statistics.not_handed_in_excl')
                                                : t('statistics.not_handed_in')}
                                        </span>
                                    </div>
                                )}

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 20,
                                        marginBottom: 20,
                                    }}
                                >
                                    {/* Grade distribution */}
                                    <div className="card">
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.grade_distribution')}</h3>
                                        {stats.distribution.length === 0 ? (
                                            <div className="empty-state" style={{ height: 280 }}>
                                                <p className="text-muted text-sm">{t('statistics.no_grade_scale')}</p>
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <BarChart
                                                    data={stats.distribution}
                                                    margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
                                                >
                                                    <XAxis
                                                        dataKey="label"
                                                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                                    />
                                                    <YAxis
                                                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                                        allowDecimals={false}
                                                        domain={[0, (max: number) => Math.max(max + 1, 3)]}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{
                                                            background: 'var(--bg-card)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: 8,
                                                        }}
                                                        labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                                                        itemStyle={{ color: 'var(--text-muted)' }}
                                                        formatter={(v: unknown) => [
                                                            typeof v === 'number' ? v : 0,
                                                            t('statistics.students'),
                                                        ]}
                                                    />
                                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                                                        {stats.distribution.map((entry, i) => (
                                                            <Cell key={i} fill={entry.color} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>

                                    {/* Per-criterion chart — Bar or Radar */}
                                    <div className="card">
                                        <div
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: 16,
                                            }}
                                        >
                                            <h3 style={{ margin: 0 }}>{t('statistics.criterion_avg')}</h3>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    title={t('statistics.action_export_chart')}
                                                    onClick={() =>
                                                        exportChartAsPng(criterionChartRef, 'criterion-chart.png')
                                                    }
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    title={t('statistics.action_fullscreen')}
                                                    onClick={() => setCriterionFullscreen(true)}
                                                >
                                                    <Maximize2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div ref={criterionChartRef}>{renderCriterionChart(340)}</div>
                                    </div>
                                </div>

                                {/* Score histogram */}
                                {summaries.length >= 2 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.score_distribution')}</h3>
                                        <ScoreHistogram scores={summaries.map((s) => s.modifiedPercentage)} />
                                    </div>
                                )}

                                {/* Bloom's taxonomy pyramid */}
                                {bloomsData && summaries.length > 0 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.blooms_title')}</h3>
                                        <BloomsPyramidChart
                                            lang={lang}
                                            levels={BLOOM_LEVELS.map((bl) => ({
                                                id: bl.id,
                                                order: bl.order,
                                                labelEn: bl.labelEn,
                                                labelNl: bl.labelNl,
                                                color: bl.color,
                                                value: bloomsData.find((b) => b.categoryId === bl.id)?.count
                                                    ? bloomsData.find((b) => b.categoryId === bl.id)!.avgPercentage
                                                    : null,
                                            }))}
                                        />
                                    </div>
                                )}

                                {/* IB Learner Profile rose chart */}
                                {ibData && summaries.length > 0 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.ib_title')}</h3>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <FrameworkRoseChart
                                                sectors={IB_ATTRIBUTES.map((attr) => {
                                                    const bucket = ibData.find((b) => b.categoryId === attr.id);
                                                    return {
                                                        id: attr.id,
                                                        label: lang === 'nl' ? attr.labelNl : attr.labelEn,
                                                        value: bucket?.count ? bucket.avgPercentage : 0,
                                                        color: attr.color,
                                                        count: bucket?.count ?? 0,
                                                    };
                                                })}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Criterion heat map */}
                                {tableData.length > 0 && rubric && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.heatmap')}</h3>
                                        <CriterionHeatmap
                                            students={tableData.map((d) => ({
                                                id: d.student.id,
                                                name: d.student.name,
                                            }))}
                                            criteria={rubric.criteria.map((c) => ({ id: c.id, title: c.title }))}
                                            scores={heatmapScores}
                                        />
                                    </div>
                                )}

                                {/* Student scores table */}
                                <div className="card">
                                    <h3 style={{ marginBottom: 14 }}>{t('statistics.student_scores')}</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => handleSort('name')}
                                                >
                                                    {t('statistics.table_student')}{' '}
                                                    {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => handleSort('score')}
                                                >
                                                    {t('statistics.table_score')}{' '}
                                                    {sortKey === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => handleSort('raw')}
                                                >
                                                    {t('statistics.table_raw')}{' '}
                                                    {sortKey === 'raw' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => handleSort('grade')}
                                                >
                                                    {t('statistics.table_grade')}{' '}
                                                    {sortKey === 'grade' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                                <th
                                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                                    onClick={() => handleSort('progress')}
                                                >
                                                    {t('statistics.table_criteria_done')}{' '}
                                                    {sortKey === 'progress' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.map(({ sr, student, summary }) => (
                                                <tr
                                                    key={sr.id}
                                                    style={{
                                                        borderLeft: `4px solid ${summary.gradeColor}`,
                                                        background: `${summary.gradeColor}08`,
                                                    }}
                                                >
                                                    <td style={{ fontWeight: 500, paddingLeft: 16 }}>
                                                        {student.name}
                                                        {sr.notHandedIn && (
                                                            <span
                                                                className="text-muted text-sm"
                                                                style={{ marginLeft: 6 }}
                                                            >
                                                                (NHI)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>{summary.modifiedPercentage.toFixed(1)}%</td>
                                                    <td>
                                                        {summary.rawScore}/{summary.maxRawScore}
                                                    </td>
                                                    <td>
                                                        <span style={{ color: summary.gradeColor, fontWeight: 700 }}>
                                                            {summary.letterGrade}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {summary.gradedCount}/{summary.totalCriteria}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    /* ── Student view ── */
                    <>
                        {!selectedStudentId ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>{t('statistics.select_student_prompt')}</p>
                            </div>
                        ) : studentViewTableData.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={36} />
                                <p>{t('statistics.student_not_graded')}</p>
                            </div>
                        ) : (
                            <>
                                {/* Graded rubrics table */}
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <h3 style={{ marginBottom: 14 }}>{t('statistics.graded_rubrics')}</h3>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>{t('statistics.label_rubric')}</th>
                                                <th>{t('statistics.table_subject')}</th>
                                                <th>{t('statistics.table_score')}</th>
                                                <th>{t('statistics.table_raw')}</th>
                                                <th>{t('statistics.table_grade')}</th>
                                                <th>{t('statistics.table_date_graded')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {studentViewTableData.map(({ sr, rubric: r, summary }) => (
                                                <tr
                                                    key={sr.id}
                                                    style={{
                                                        borderLeft: `4px solid ${summary.gradeColor}`,
                                                        background: `${summary.gradeColor}08`,
                                                    }}
                                                >
                                                    <td style={{ fontWeight: 500, paddingLeft: 16 }}>{r.name}</td>
                                                    <td className="text-muted text-sm">{r.subject || '—'}</td>
                                                    <td>{summary.modifiedPercentage.toFixed(1)}%</td>
                                                    <td>
                                                        {summary.rawScore}/{summary.maxRawScore}
                                                    </td>
                                                    <td>
                                                        <span style={{ color: summary.gradeColor, fontWeight: 700 }}>
                                                            {summary.letterGrade}
                                                        </span>
                                                    </td>
                                                    <td className="text-muted text-sm">
                                                        {new Date(sr.gradedAt || new Date()).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Criterion radar comparison */}
                                {selectedStudentRubricId && (
                                    <>
                                        {/* Multi-student comparison chips */}
                                        {rubricPeers.length > 0 && (
                                            <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
                                                <div
                                                    style={{
                                                        fontSize: '0.75rem',
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 600,
                                                        textTransform: 'uppercase',
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    {t('statistics.compare_with')}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {rubricPeers.map((peer, i) => {
                                                        const isSelected = comparedStudentIds.includes(peer.id);
                                                        const colorIdx = comparedStudentIds.indexOf(peer.id) + 1;
                                                        const color = isSelected ? STUDENT_COLORS[colorIdx] : undefined;
                                                        const maxReached =
                                                            !isSelected && comparedStudentIds.length >= 3;
                                                        return (
                                                            <button
                                                                key={peer.id}
                                                                className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                                                style={color ? { borderColor: color, color } : {}}
                                                                disabled={maxReached}
                                                                onClick={() =>
                                                                    setComparedStudentIds((prev) =>
                                                                        isSelected
                                                                            ? prev.filter((id) => id !== peer.id)
                                                                            : [...prev, peer.id]
                                                                    )
                                                                }
                                                            >
                                                                {peer.name.split(' ')[0]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {studentRadarData && studentRadarData.length >= 3 ? (
                                            <div className="card">
                                                <h3 style={{ marginBottom: 16 }}>
                                                    {t('statistics.criterion_comparison')}
                                                </h3>
                                                <CriterionRadarChart
                                                    data={studentRadarData}
                                                    accentColor={settings.accentColor || 'var(--accent)'}
                                                    selectedStudents={radarSelectedStudents}
                                                    classAverageLabel={classAvgLabel}
                                                />
                                            </div>
                                        ) : (
                                            studentRadarData && (
                                                <p className="text-muted text-sm" style={{ textAlign: 'center' }}>
                                                    {t('statistics.radar_min_criteria')}
                                                </p>
                                            )
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* ── Fullscreen overlay ── */}
            {criterionFullscreen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1000,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 32,
                    }}
                    onClick={() => setCriterionFullscreen(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-card)',
                            borderRadius: 12,
                            padding: 24,
                            width: '100%',
                            maxWidth: '95vw',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 16,
                            }}
                        >
                            <h3 style={{ margin: 0 }}>{t('statistics.criterion_avg')}</h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setCriterionFullscreen(false)}>
                                {t('statistics.action_close_fullscreen')}
                            </button>
                        </div>
                        {renderCriterionChart(Math.min(window.innerHeight * 0.7, 600))}
                    </div>
                </div>
            )}
        </>
    );
}
