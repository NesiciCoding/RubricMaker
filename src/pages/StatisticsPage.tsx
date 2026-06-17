import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Users, BookOpen, Download, Maximize2, Printer, ChevronDown, ChevronUp } from 'lucide-react';
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
import type { StudentRubric, Student, Rubric, RubricCriterion, VoTrack, StudentTest, Test } from '../types';
import { calcTestMaxPoints, calcStudentTestRawPoints, calcTestPercentage } from '../utils/testCalc';
import { getClassGoalScores } from '../utils/learningGoalsAggregator';
import LearningGoalChart from '../components/Statistics/LearningGoalChart';
import CriterionRadarChart, { type CriterionRadarDataPoint } from '../components/Statistics/CriterionRadarChart';
import ScoreHistogram from '../components/Statistics/ScoreHistogram';
import CriterionHeatmap from '../components/Statistics/CriterionHeatmap';
import ClassTrendChart from '../components/Statistics/ClassTrendChart';
import MultiClassTrendChart from '../components/Statistics/MultiClassTrendChart';
import { compareClasses, buildMultiClassTrend, getInsights } from '../utils/classComparisonAggregator';

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
    const { rubrics, students, classes, studentRubrics, gradeScales, settings, updateSettings, tests, studentTests } =
        useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    // ── View mode ────────────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<'rubric' | 'student' | 'compare'>('rubric');

    // ── Track / year filters (shared across rubric + compare modes) ───────────
    const [filterTrack, setFilterTrack] = useState<VoTrack | 'all'>('all');
    const [filterYear, setFilterYear] = useState<string>('all');

    const yearOptions = useMemo(() => {
        const years = new Set(classes.map((c) => c.year).filter((y): y is string => !!y));
        return Array.from(years).sort();
    }, [classes]);

    const filteredClasses = useMemo(
        () =>
            classes.filter((c) => {
                if (filterTrack !== 'all' && c.voTrack !== filterTrack) return false;
                if (filterYear !== 'all' && c.year !== filterYear) return false;
                return true;
            }),
        [classes, filterTrack, filterYear]
    );

    // ── Compare mode state ────────────────────────────────────────────────────
    const [compareClassIds, setCompareClassIds] = useState<string[]>([]);
    const [compareRubricId, setCompareRubricId] = useState(rubrics[0]?.id ?? '');
    const [insightsOpen, setInsightsOpen] = useState(false);

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

    // ── Compare mode data ─────────────────────────────────────────────────────
    const compareRubric = rubrics.find((r) => r.id === compareRubricId);
    const compareScale = compareRubric
        ? compareRubric.gradeScaleId === 'none'
            ? null
            : (gradeScales.find((g) => g.id === compareRubric.gradeScaleId) ?? gradeScales[0])
        : null;

    const comparisonResults = useMemo(() => {
        if (!compareRubric || compareClassIds.length === 0) return [];
        return compareClasses(
            compareClassIds,
            compareRubricId,
            studentRubrics,
            students,
            classes,
            compareRubric,
            compareScale
        );
    }, [compareClassIds, compareRubricId, studentRubrics, students, classes, compareRubric, compareScale]);

    const comparisonCriterionGap = useMemo(() => {
        if (comparisonResults.length < 2 || !compareRubric) return [];
        return compareRubric.criteria.map((c) => {
            const point: Record<string, number | string> = { name: c.title };
            for (const r of comparisonResults) {
                point[r.classId] = r.criterionAvgs[c.id] ?? 0;
            }
            return point;
        });
    }, [comparisonResults, compareRubric]);

    const multiTrendData = useMemo(() => {
        if (compareClassIds.length === 0) return [];
        return buildMultiClassTrend(compareClassIds, classes, studentRubrics, students, rubrics, gradeScales);
    }, [compareClassIds, classes, studentRubrics, students, rubrics, gradeScales]);

    const classNamesMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const c of classes) map[c.id] = c.name;
        return map;
    }, [classes]);

    const insights = useMemo(
        () => (compareRubric ? getInsights(comparisonResults, compareRubric.criteria) : []),
        [comparisonResults, compareRubric]
    );

    const CLASS_COMPARE_COLORS = [
        'var(--accent)',
        'var(--purple, #a855f7)',
        'var(--green, #22c55e)',
        'var(--yellow, #eab308)',
    ];

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

    // Test results for the selected student
    const studentTestData = useMemo(() => {
        if (viewMode !== 'student' || !selectedStudentId) return [];
        return studentTests
            .filter((st) => st.studentId === selectedStudentId && (st.status === 'submitted' || st.status === 'graded'))
            .map((st) => {
                const test = tests.find((t) => t.id === st.testId);
                if (!test) return null;
                const maxPts = calcTestMaxPoints(test);
                const rawPts = st.rawTotalPoints ?? calcStudentTestRawPoints(test, st.answers);
                const effective = rawPts + (st.adjustmentPoints ?? 0);
                const pct = calcTestPercentage(effective, maxPts);
                return { st, test, rawPts, effective, maxPts, pct };
            })
            .filter(
                (
                    d
                ): d is {
                    st: StudentTest;
                    test: Test;
                    rawPts: number;
                    effective: number;
                    maxPts: number;
                    pct: number;
                } => d !== null
            );
    }, [viewMode, selectedStudentId, studentTests, tests]);

    // Class-level test averages (for the rubric view)
    const classTestAverages = useMemo(() => {
        if (viewMode !== 'rubric' || !selectedClassId) return [];
        const classStudentIds = new Set(students.filter((s) => s.classId === selectedClassId).map((s) => s.id));
        return tests
            .map((test) => {
                const submissions = studentTests.filter(
                    (st) =>
                        st.testId === test.id &&
                        classStudentIds.has(st.studentId) &&
                        (st.status === 'submitted' || st.status === 'graded')
                );
                if (submissions.length === 0) return null;
                const maxPts = calcTestMaxPoints(test);
                const avgPct =
                    submissions.reduce((sum, st) => {
                        const raw = st.rawTotalPoints ?? calcStudentTestRawPoints(test, st.answers);
                        const effective = raw + (st.adjustmentPoints ?? 0);
                        return sum + calcTestPercentage(effective, maxPts);
                    }, 0) / submissions.length;
                return { test, avgPct: parseFloat(avgPct.toFixed(1)), submittedCount: submissions.length };
            })
            .filter((d): d is { test: Test; avgPct: number; submittedCount: number } => d !== null);
    }, [viewMode, selectedClassId, tests, studentTests, students]);

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
            <Topbar
                title={t('statistics.title')}
                actions={
                    <button className="btn btn-ghost btn-sm no-print" onClick={() => window.print()}>
                        <Printer size={14} /> {t('common.print')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                {/* ── Top controls ── */}
                <div
                    className="statistics-controls"
                    style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}
                >
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
                            <button
                                className={`btn btn-sm ${viewMode === 'compare' ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode('compare')}
                            >
                                {t('statistics.view_compare')}
                            </button>
                        </div>
                    </div>

                    {/* Track + year filters (shown in rubric and compare modes) */}
                    {viewMode !== 'student' && (yearOptions.length > 0 || classes.some((c) => c.voTrack)) && (
                        <>
                            {yearOptions.length > 0 && (
                                <div className="form-group" style={{ maxWidth: 140, marginBottom: 0 }}>
                                    <label>{t('statistics.filters.year')}</label>
                                    <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                                        <option value="all">{t('statistics.all_classes')}</option>
                                        {yearOptions.map((y) => (
                                            <option key={y} value={y}>
                                                {y}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {classes.some((c) => c.voTrack) && (
                                <div className="form-group" style={{ maxWidth: 160, marginBottom: 0 }}>
                                    <label>{t('statistics.filters.track')}</label>
                                    <select
                                        value={filterTrack}
                                        onChange={(e) => setFilterTrack(e.target.value as VoTrack | 'all')}
                                    >
                                        <option value="all">{t('statistics.all_classes')}</option>
                                        <option value="vmbo-bb">VMBO-BB</option>
                                        <option value="vmbo-kb">VMBO-KB</option>
                                        <option value="vmbo-tl">VMBO-TL</option>
                                        <option value="havo">HAVO</option>
                                        <option value="vwo">VWO</option>
                                    </select>
                                </div>
                            )}
                        </>
                    )}

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
                                    {filteredClasses.map((c) => (
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
                    ) : viewMode === 'compare' ? (
                        <>
                            <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                                <label>{t('statistics.label_rubric')}</label>
                                <select value={compareRubricId} onChange={(e) => setCompareRubricId(e.target.value)}>
                                    {rubrics.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ flex: 1, maxWidth: 280, marginBottom: 0 }}>
                                <label>{t('statistics.compare.select_classes')} (max 4)</label>
                                <div
                                    style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        maxHeight: 120,
                                        overflowY: 'auto',
                                        background: 'var(--bg-elevated)',
                                    }}
                                >
                                    {filteredClasses.map((c) => {
                                        const checked = compareClassIds.includes(c.id);
                                        const disabled = !checked && compareClassIds.length >= 4;
                                        return (
                                            <label
                                                key={c.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    padding: '3px 0',
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                    opacity: disabled ? 0.4 : 1,
                                                    fontSize: '0.85rem',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={disabled}
                                                    onChange={() =>
                                                        setCompareClassIds((prev) =>
                                                            checked ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                                                        )
                                                    }
                                                />
                                                {c.name}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
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

                {/* ── Compare view ── */}
                {viewMode === 'compare' && (
                    <>
                        {compareClassIds.length < 2 ? (
                            <div className="empty-state">
                                <TrendingUp size={36} />
                                <p>{t('statistics.compare.prompt')}</p>
                            </div>
                        ) : comparisonResults.length === 0 ? (
                            <div className="empty-state">
                                <TrendingUp size={36} />
                                <p>{t('statistics.compare.no_data')}</p>
                            </div>
                        ) : (
                            <>
                                {/* Class average bar chart */}
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <h3 style={{ marginBottom: 16 }}>{t('statistics.compare.avg_title')}</h3>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart
                                            data={comparisonResults}
                                            margin={{ top: 4, right: 16, bottom: 0, left: -16 }}
                                        >
                                            <XAxis
                                                dataKey="className"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                                tickFormatter={(v: number) => `${v}%`}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    background: 'var(--bg-card)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 8,
                                                }}
                                                formatter={(v: unknown) => [`${v}%`, t('statistics.stat_average')]}
                                            />
                                            <Bar dataKey="average" radius={[4, 4, 0, 0]} maxBarSize={80}>
                                                {comparisonResults.map((r, i) => (
                                                    <Cell
                                                        key={r.classId}
                                                        fill={CLASS_COMPARE_COLORS[i % CLASS_COMPARE_COLORS.length]}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Per-criterion gap */}
                                {comparisonCriterionGap.length > 0 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.compare.criterion_gap')}</h3>
                                        <ResponsiveContainer
                                            width="100%"
                                            height={Math.max(160, comparisonCriterionGap.length * 36)}
                                        >
                                            <BarChart
                                                data={comparisonCriterionGap}
                                                layout="vertical"
                                                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                                            >
                                                <XAxis
                                                    type="number"
                                                    domain={[0, 100]}
                                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                                    tickFormatter={(v: number) => `${v}%`}
                                                />
                                                <YAxis
                                                    type="category"
                                                    dataKey="name"
                                                    width={120}
                                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        background: 'var(--bg-card)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 8,
                                                    }}
                                                    formatter={(v: unknown, name: unknown) => [
                                                        `${v}%`,
                                                        classNamesMap[String(name)] ?? String(name),
                                                    ]}
                                                />
                                                {comparisonResults.map((r, i) => (
                                                    <Bar
                                                        key={r.classId}
                                                        dataKey={r.classId}
                                                        name={r.classId}
                                                        fill={CLASS_COMPARE_COLORS[i % CLASS_COMPARE_COLORS.length]}
                                                        radius={[0, 4, 4, 0]}
                                                    />
                                                ))}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {/* Multi-class trend */}
                                {multiTrendData.length >= 2 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 16 }}>{t('statistics.compare.trend_title')}</h3>
                                        <MultiClassTrendChart
                                            data={multiTrendData}
                                            classIds={compareClassIds}
                                            classNames={classNamesMap}
                                        />
                                    </div>
                                )}

                                {/* Insights panel */}
                                {insights.length > 0 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <button
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                width: '100%',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: 0,
                                                color: 'var(--text)',
                                                fontWeight: 600,
                                                fontSize: '1rem',
                                            }}
                                            onClick={() => setInsightsOpen((o) => !o)}
                                        >
                                            <span>
                                                {t('statistics.insights.title')} ({insights.length})
                                            </span>
                                            {insightsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        {insightsOpen && (
                                            <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.8 }}>
                                                {insights.map((ins, i) => (
                                                    <li
                                                        key={i}
                                                        style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}
                                                    >
                                                        {ins.message}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ── Rubric view ── */}
                {viewMode === 'rubric' && (
                    <>
                        {selectedClassId !== 'all' && classGoals.length > 0 && <LearningGoalChart goals={classGoals} />}

                        {/* Class trend chart */}
                        {classTrendData.length >= 2 && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 style={{ marginBottom: 16 }}>{t('statistics.class_trend')}</h3>
                                <ClassTrendChart data={classTrendData} />
                            </div>
                        )}

                        {/* Test averages for this class */}
                        {classTestAverages.length > 0 && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <h3 style={{ marginBottom: 16 }}>{t('statistics.class_test_averages')}</h3>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart
                                        data={classTestAverages.map((d) => ({
                                            name: d.test.name,
                                            avg: d.avgPct,
                                            n: d.submittedCount,
                                        }))}
                                        margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                                    >
                                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={36} />
                                        <Tooltip formatter={(v) => [`${v}%`, t('statistics.stat_average')]} />
                                        <Bar dataKey="avg" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
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
                                {(() => {
                                    const totalEnrolled =
                                        selectedClassId === 'all'
                                            ? students.length
                                            : students.filter((s) => s.classId === selectedClassId).length;
                                    const completionPct =
                                        totalEnrolled > 0 ? Math.round((summaries.length / totalEnrolled) * 100) : 0;
                                    return (
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 12,
                                                marginBottom: 24,
                                            }}
                                        >
                                            {/* Completion banner */}
                                            <div
                                                className="card"
                                                style={{
                                                    padding: '10px 16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 16,
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            fontSize: '0.8rem',
                                                            color: 'var(--text-muted)',
                                                            marginBottom: 4,
                                                        }}
                                                    >
                                                        <span>{t('statistics.stat_students_graded')}</span>
                                                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                            {summaries.length} / {totalEnrolled}
                                                        </span>
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: 6,
                                                            background: 'var(--bg-elevated)',
                                                            borderRadius: 3,
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: `${completionPct}%`,
                                                                height: '100%',
                                                                background: 'var(--accent)',
                                                                borderRadius: 3,
                                                                transition: 'width 0.4s ease',
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <span
                                                    style={{
                                                        fontSize: '1.1rem',
                                                        fontWeight: 700,
                                                        color: 'var(--accent)',
                                                        minWidth: 42,
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    {completionPct}%
                                                </span>
                                            </div>
                                            {/* Compact metric row */}
                                            <div className="grid-4">
                                                {[
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
                                                    <div
                                                        key={label}
                                                        className="card"
                                                        style={{
                                                            borderTop: `3px solid ${color}`,
                                                            padding: '10px 14px',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: '1.35rem', fontWeight: 700, color }}>
                                                            {value}
                                                        </div>
                                                        <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                                                            {label}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
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
                )}

                {/* ── Student view ── */}
                {viewMode === 'student' && (
                    <>
                        {!selectedStudentId ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>{t('statistics.select_student_prompt')}</p>
                            </div>
                        ) : studentViewTableData.length === 0 && studentTestData.length === 0 ? (
                            <div className="empty-state">
                                <BookOpen size={36} />
                                <p>{t('statistics.student_not_graded')}</p>
                            </div>
                        ) : (
                            <>
                                {/* Graded rubrics table */}
                                {studentViewTableData.length > 0 && (
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
                                                            <span
                                                                style={{ color: summary.gradeColor, fontWeight: 700 }}
                                                            >
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
                                )}

                                {/* Test results table */}
                                {studentTestData.length > 0 && (
                                    <div className="card" style={{ marginBottom: 20 }}>
                                        <h3 style={{ marginBottom: 14 }}>{t('statistics.test_results')}</h3>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('statistics.label_test')}</th>
                                                    <th>{t('statistics.table_score')}</th>
                                                    <th>{t('statistics.table_raw')}</th>
                                                    <th>{t('statistics.table_date_graded')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {studentTestData.map(({ st, test, effective, maxPts, pct }) => (
                                                    <tr key={st.id}>
                                                        <td style={{ fontWeight: 500 }}>{test.name}</td>
                                                        <td>{pct.toFixed(1)}%</td>
                                                        <td>
                                                            {effective}/{maxPts}
                                                        </td>
                                                        <td className="text-muted text-sm">
                                                            {new Date(
                                                                st.gradedAt || st.submittedAt || st.startedAt
                                                            ).toLocaleDateString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

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
                                                    {rubricPeers.map((peer) => {
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
