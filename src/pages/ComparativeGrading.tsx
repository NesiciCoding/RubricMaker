import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Topbar from '../components/Layout/Topbar';
import { ArrowLeft, Check, Equal, ChevronRight, ChevronLeft } from 'lucide-react';
import { nanoid } from '../utils/nanoid';
import { useTranslation } from 'react-i18next';
import { calcGradeSummary } from '../utils/gradeCalc';
import AttachmentViewer from '../components/AttachmentViewer';
import { ScoreEntry } from '../types';

// ─── Class picker ────────────────────────────────────────────────────────────
// Shown whenever classId is missing or 'all'. Forces the teacher to pick a
// class before any students are loaded, so cross-class contamination is
// structurally impossible.
function ClassPicker({ rubricId }: { rubricId: string }) {
    const navigate = useNavigate();
    const { classes, rubrics } = useApp();

    const rubric = rubrics.find(r => r.id === rubricId);

    // Prefer classes that have this rubric explicitly linked; fall back to all.
    const linkedClasses = classes.filter(c => c.rubricIds?.includes(rubricId));
    const offerClasses = linkedClasses.length > 0 ? linkedClasses : classes;

    return (
        <>
            <Topbar
                title={rubric ? `Compare: ${rubric.name}` : 'Comparative Grading'}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                        <ArrowLeft size={15} /> Back
                    </button>
                }
            />
            <div
                className="page-content fade-in"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}
            >
                <div
                    className="card"
                    style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '32px 28px' }}
                >
                    <h2 style={{ marginBottom: 8 }}>Select a Class</h2>
                    <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
                        Choose which class to grade. Only students from the selected class will appear in the comparison.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {offerClasses.length === 0 && (
                            <p className="text-muted text-sm">No classes found. Add a class first.</p>
                        )}
                        {offerClasses.map(c => (
                            <button
                                key={c.id}
                                className="btn btn-secondary"
                                onClick={() =>
                                    navigate(`/grade-comparative/${c.id}/${rubricId}`, { replace: true })
                                }
                            >
                                {c.name}
                                {c.year ? ` — ${c.year}` : ''}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Grading session ─────────────────────────────────────────────────────────
// Always receives a concrete classId — never 'all'. All hooks are unconditional.
function ComparativeGradingSession({
    classId,
    rubricId,
}: {
    classId: string;
    rubricId: string;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, attachments, saveStudentRubric, gradeScales, settings } =
        useApp();

    const rubric = rubrics.find(r => r.id === rubricId);
    const linkedClasses = classes.filter(c => c.rubricIds?.includes(rubricId));
    const offerClasses = linkedClasses.length > 0 ? linkedClasses : classes;

    function goToSession(classId: string, startStudentId?: string) {
        const url = startStudentId
            ? `/grade-comparative/${classId}/${rubricId}?start=${startStudentId}`
            : `/grade-comparative/${classId}/${rubricId}`;
        navigate(url, { replace: true });
    }

    // Students are strictly scoped to the chosen class — no leakage possible.
    const classStudents = useMemo(
        () => students.filter(s => s.classId === classId),
        [students, classId]
    );

    const [studentA, setStudentA] = useState<typeof students[0] | null>(null);
    const [studentB, setStudentB] = useState<typeof students[0] | null>(null);
    const [srA, setSrA] = useState<typeof studentRubrics[0] | null>(null);
    const [srB, setSrB] = useState<typeof studentRubrics[0] | null>(null);
    const [matchups, setMatchups] = useState<Set<string>>(new Set());
    const [seenStudentIds, setSeenStudentIds] = useState<Set<string>>(new Set());
    const [anchorMatchupCount, setAnchorMatchupCount] = useState<number>(0);
    const [error, setError] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [anchorNotice, setAnchorNotice] = useState(false);

    // Which criterion comment panels are open
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!rubric) return;
        if (classStudents.length < 2) {
            setError(t('comparativeGrading.not_enough_students'));
            return;
        }
        if (!studentA && !studentB) {
            pickNextMatchup(startStudentId);
        }
    }, [classStudents, rubric]);

    // Warn on unsaved changes when navigating away
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Mark dirty whenever scores change
    useEffect(() => { if (srA || srB) setIsDirty(true); }, [srA, srB]);

    function getEmptySR(studentId: string) {
        if (!rubric) throw new Error('No rubric');
        const existing = studentRubrics.find(
            sr => sr.rubricId === rubric.id && sr.studentId === studentId
        );
        if (existing) return existing;
        return {
            id: nanoid(),
            rubricId: rubric.id,
            studentId,
            entries: rubric.criteria.map(c => ({
                criterionId: c.id,
                levelId: null,
                comment: '',
                checkedSubItems: [],
            })),
            overallComment: '',
            isPeerReview: false,
            gradedAt: new Date().toISOString(),
        };
    }

    function getMatchKey(id1: string, id2: string) {
        // Use a delimiter that can't appear in nanoid output
        return [id1, id2].sort().join('|');
    }

    function pickNextMatchup(anchorId: string | null) {
        if (classStudents.length < 2) return;

        let a = anchorId ? classStudents.find(s => s.id === anchorId) ?? null : null;
        if (!a) {
            a = classStudents[Math.floor(Math.random() * classStudents.length)];
        }

        let candidatesForB = classStudents.filter(
            s => s.id !== a!.id && !matchups.has(getMatchKey(a!.id, s.id))
        );
        if (candidatesForB.length === 0) {
            candidatesForB = classStudents.filter(s => s.id !== a!.id);
        }

        const b = candidatesForB[Math.floor(Math.random() * candidatesForB.length)];

        setStudentA(a);
        setStudentB(b);
        setSrA(getEmptySR(a.id));
        setSrB(getEmptySR(b.id));
        setMatchups(prev => new Set([...prev, getMatchKey(a!.id, b.id)]));
        setSeenStudentIds(prev => new Set([...prev, a!.id, b.id]));
        setIsDirty(false);

        if (a.id === anchorId) {
            setAnchorMatchupCount(prev => prev + 1);
        } else {
            setAnchorMatchupCount(1);
        }
    }

    function handleSaveAndNext() {
        if (!srA || !srB || !studentA || !rubric) return;
        const snap = JSON.parse(JSON.stringify(rubric));
        saveStudentRubric({ ...srA, gradedAt: new Date().toISOString(), rubricSnapshot: snap });
        saveStudentRubric({ ...srB, gradedAt: new Date().toISOString(), rubricSnapshot: snap });
        setIsDirty(false);

        const limitReached =
            settings.comparativeMatchupLimit &&
            settings.comparativeMatchupLimit > 0 &&
            anchorMatchupCount >= settings.comparativeMatchupLimit;

        if (
            settings.comparativeMatchupLimit &&
            settings.comparativeMatchupLimit > 0 &&
            anchorMatchupCount >= settings.comparativeMatchupLimit
        ) {
            pickNextMatchup(null);
        } else {
            pickNextMatchup(studentA.id);
        }
    }

    function compareCriterion(
        criterionId: string,
        comparison: 'A_BETTER' | 'EQUAL' | 'B_BETTER'
    ) {
        if (!srA || !srB || !rubric) return;
        const criteria = rubric.criteria.find(c => c.id === criterionId);
        if (!criteria || criteria.levels.length === 0) return;

        const sortedLevels = [...criteria.levels].sort(
            (l1, l2) => (l1.minPoints || 0) - (l2.minPoints || 0)
        );
        let entryA = srA.entries.find(e => e.criterionId === criterionId)!;
        let entryB = srB.entries.find(e => e.criterionId === criterionId)!;

        let idxA = sortedLevels.findIndex(l => l.id === entryA.levelId);
        let idxB = sortedLevels.findIndex(l => l.id === entryB.levelId);

        if (idxA === -1 && idxB === -1) {
            const mid = Math.floor(sorted.length / 2);
            idxA = mid; idxB = mid;
        } else if (idxA === -1) { idxA = idxB; }
        else if (idxB === -1) { idxB = idxA; }

        if (comparison === 'A_BETTER') {
            if (idxA <= idxB) {
                if (idxA < sortedLevels.length - 1) idxA = idxB + 1;
                else if (idxB > 0) idxB = idxA - 1;
            }
        } else if (comparison === 'B_BETTER') {
            if (idxB <= idxA) {
                if (idxB < sorted.length - 1) idxB = idxA + 1;
                else if (idxA > 0) idxA = idxB - 1;
            }
        } else if (comparison === 'EQUAL') {
            idxB = idxA;
        }

        idxA = Math.max(0, Math.min(idxA, sortedLevels.length - 1));
        idxB = Math.max(0, Math.min(idxB, sortedLevels.length - 1));

        setSrA({
            ...srA,
            entries: srA.entries.map(e =>
                e.criterionId === criterionId
                    ? { ...e, levelId: sortedLevels[idxA].id, overridePoints: undefined }
                    : e
            ),
        });
        setSrB({
            ...srB,
            entries: srB.entries.map(e =>
                e.criterionId === criterionId
                    ? { ...e, levelId: sortedLevels[idxB].id, overridePoints: undefined }
                    : e
            ),
        });
    }

    function manuallyUpdateLevel(isA: boolean, criterionId: string, levelId: string) {
        if (isA && srA) {
            setSrA({
                ...srA,
                entries: srA.entries.map(e =>
                    e.criterionId === criterionId ? { ...e, levelId, overridePoints: undefined } : e
                ),
            });
        } else if (!isA && srB) {
            setSrB({
                ...srB,
                entries: srB.entries.map(e =>
                    e.criterionId === criterionId ? { ...e, levelId, overridePoints: undefined } : e
                ),
            });
        }
    }

    const updateEntry = useCallback((isA: boolean, criterionId: string, patch: Partial<ScoreEntry>) => {
        const setter = isA ? setSrA : setSrB;
        setter(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                entries: prev.entries.map(e =>
                    e.criterionId === criterionId ? { ...e, ...patch } : e
                ),
            };
        });
    }, [setSrA, setSrB]);

    function setSubItemScore(isA: boolean, criterionId: string, subItemId: string, score: number) {
        const sr = isA ? srA : srB;
        if (!sr) return;
        const entry = sr.entries.find(e => e.criterionId === criterionId);
        if (!entry) return;
        updateEntry(isA, criterionId, { subItemScores: { ...(entry.subItemScores ?? {}), [subItemId]: score } });
    }

    function toggleComment(criterionId: string) {
        setOpenComments(prev => {
            const next = new Set(prev);
            next.has(criterionId) ? next.delete(criterionId) : next.add(criterionId);
            return next;
        });
    }

    if (!rubric) return <div className="page-content">Rubric not found</div>;
    if (error) return (
        <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 200 }}>
            <p className="text-muted">{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate(-1)}>
                <ArrowLeft size={15} /> {t('comparativeGrading.action_back')}
            </button>
        </div>
    );
    if (!studentA || !studentB || !srA || !srB) return <div className="page-content">{t('comparativeGrading.loading')}</div>;

    const attA = attachments.filter(a => a.studentId === studentA.id);
    const attB = attachments.filter(a => a.studentId === studentB.id);
    const scale =
        gradeScales.find(g => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ??
        gradeScales[0];
    const sumA = calcGradeSummary(srA, rubric.criteria, scale, rubric);
    const sumB = calcGradeSummary(srB, rubric.criteria, scale, rubric);

    const coveredCount = seenStudentIds.size;
    const totalCount = classStudents.length;

    return (
        <>
            <Topbar
                title={`Comparative: ${rubric.name}`}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                        <ArrowLeft size={15} /> Back
                    </button>
                }
            />
            <div
                className="page-content fade-in"
                style={{
                    padding: '20px',
                    maxWidth: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    height: 'calc(100vh - 60px)',
                }}
            >
                {/* Header Strip */}
                <div
                    className="card"
                    style={{
                        marginBottom: 16,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 20px',
                    }}
                >
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.2rem' }}>{studentA.name}</h2>
                        <div
                            className="text-muted text-sm"
                            style={{ fontWeight: 'bold', color: sumA?.gradeColor }}
                        >
                            {sumA?.rawScore} pts ({sumA?.modifiedPercentage.toFixed(1)}%)
                        </div>
                    </div>
                    <div
                        style={{
                            flex: 1,
                            textAlign: 'center',
                            fontWeight: 'bold',
                            fontSize: '1.2rem',
                            color: 'var(--text-muted)',
                        }}
                    >
                        VS
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                        <h2 style={{ fontSize: '1.2rem' }}>{studentB.name}</h2>
                        <div
                            className="text-muted text-sm"
                            style={{ fontWeight: 'bold', color: sumB?.gradeColor }}
                        >
                            {sumB?.rawScore} pts ({sumB?.modifiedPercentage.toFixed(1)}%)
                        </div>
                    </div>
                </div>

                {/* 3 Column Layout */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(250px, 1fr) minmax(400px, 1.5fr) minmax(250px, 1fr)',
                        gap: 20,
                        flex: 1,
                        overflow: 'hidden',
                    }}
                >
                    {/* Left Column (Student A attachments) */}
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}
                    >
                        <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                            <h3 style={{ marginBottom: 12 }}>Attachments</h3>
                            {attA.length === 0 ? (
                                <p className="text-muted text-sm">No attachments uploaded.</p>
                            ) : (
                                attA.map(a => <AttachmentViewer key={a.id} attachment={a} />)
                            )}
                        </div>
                    </div>

                    {/* Middle Column (Rubric & Controls) */}
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', padding: '0 4px' }}
                    >
                        {rubric.criteria.map(c => {
                            const eA = srA.entries.find(e => e.criterionId === c.id);
                            const eB = srB.entries.find(e => e.criterionId === c.id);
                            const lvlA = c.levels.find(l => l.id === eA?.levelId);
                            const lvlB = c.levels.find(l => l.id === eB?.levelId);
                            const displayLevels = displayOrderedLevels(c);
                            const commentOpen = openComments.has(c.id);

                            return (
                                <div key={c.id} className="card" style={{ padding: '16px 20px' }}>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            fontSize: '1.1rem',
                                            marginBottom: 4,
                                            textAlign: 'center',
                                        }}
                                    >
                                        {c.title}
                                    </div>
                                    <div
                                        className="text-muted text-sm"
                                        style={{ textAlign: 'center', marginBottom: 16 }}
                                    >
                                        {c.description}
                                    </div>

                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: 12,
                                            marginBottom: 16,
                                        }}
                                    >
                                        {/* Student A score */}
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: 10,
                                                background: 'var(--bg-body)',
                                                borderRadius: 8,
                                                border: `2px solid ${eA?.levelId ? 'var(--accent)' : 'var(--border)'}`,
                                            }}
                                        >
                                            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                                                {studentA.name}'s Score:
                                            </div>
                                            <select
                                                value={eA?.levelId || ''}
                                                onChange={e => manuallyUpdateLevel(true, c.id, e.target.value)}
                                                style={{ width: '100%', fontSize: '0.85rem', marginBottom: 8 }}
                                            >
                                                <option value="" disabled>Select level...</option>
                                                {c.levels.map(l => (
                                                    <option key={l.id} value={l.id}>
                                                        {l.label} ({l.minPoints} pts)
                                                    </option>
                                                ))}
                                            </select>
                                            {lvlA && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {lvlA.subItems.map(si => {
                                                        const currentScore =
                                                            eA?.subItemScores?.[si.id] ?? (si.minPoints ?? 0);
                                                        return (
                                                            <div key={si.id} className="text-xs">
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        marginBottom: 2,
                                                                    }}
                                                                >
                                                                    <span>{si.label}</span>
                                                                    <span style={{ fontWeight: 600 }}>
                                                                        {currentScore}/{si.maxPoints ?? si.points ?? 1}
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min={si.minPoints ?? 0}
                                                                    max={si.maxPoints ?? si.points ?? 1}
                                                                    step={0.5}
                                                                    value={currentScore}
                                                                    onChange={e =>
                                                                        setSubItemScore(true, c.id, si.id, Number(e.target.value))
                                                                    }
                                                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                    {(lvlA.minPoints !== lvlA.maxPoints ||
                                                        lvlA.subItems.length === 0) && (
                                                        <div
                                                            className="text-xs"
                                                            style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    marginBottom: 2,
                                                                }}
                                                            >
                                                                <span>Points</span>
                                                                <span style={{ fontWeight: 600 }}>
                                                                    {eA?.selectedPoints ?? lvlA.minPoints}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={lvlA.minPoints}
                                                                max={lvlA.maxPoints}
                                                                step={0.5}
                                                                value={eA?.selectedPoints ?? lvlA.minPoints}
                                                                onChange={e =>
                                                                    updateEntry(true, c.id, {
                                                                        selectedPoints: Number(e.target.value),
                                                                    })
                                                                }
                                                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Comparative buttons */}
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 6,
                                                width: 140,
                                                paddingTop: 20,
                                            }}
                                        >
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => compareCriterion(c.id, 'A_BETTER')}
                                                title={`${studentA.name} performed better`}
                                            >
                                                <ChevronLeft size={16} /> A Better
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => compareCriterion(c.id, 'EQUAL')}
                                            >
                                                <Equal size={16} /> Equal
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => compareCriterion(c.id, 'B_BETTER')}
                                                title={`${studentB.name} performed better`}
                                            >
                                                B Better <ChevronRight size={16} />
                                            </button>
                                        </div>

                                        {/* Student B score */}
                                        <div
                                            style={{
                                                flex: 1,
                                                padding: 10,
                                                background: 'var(--bg-body)',
                                                borderRadius: 8,
                                                border: `2px solid ${eB?.levelId ? 'var(--accent)' : 'var(--border)'}`,
                                            }}
                                        >
                                            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                                                {studentB.name}'s Score:
                                            </div>
                                            <select
                                                value={eB?.levelId || ''}
                                                onChange={e => manuallyUpdateLevel(false, c.id, e.target.value)}
                                                style={{ width: '100%', fontSize: '0.85rem', marginBottom: 8 }}
                                            >
                                                <option value="" disabled>Select level...</option>
                                                {c.levels.map(l => (
                                                    <option key={l.id} value={l.id}>
                                                        {l.label} ({l.minPoints} pts)
                                                    </option>
                                                ))}
                                            </select>
                                            {lvlB && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {lvlB.subItems.map(si => {
                                                        const currentScore =
                                                            eB?.subItemScores?.[si.id] ?? (si.minPoints ?? 0);
                                                        return (
                                                            <div key={si.id} className="text-xs">
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        marginBottom: 2,
                                                                    }}
                                                                >
                                                                    <span>{si.label}</span>
                                                                    <span style={{ fontWeight: 600 }}>
                                                                        {currentScore}/{si.maxPoints ?? si.points ?? 1}
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min={si.minPoints ?? 0}
                                                                    max={si.maxPoints ?? si.points ?? 1}
                                                                    step={0.5}
                                                                    value={currentScore}
                                                                    onChange={e =>
                                                                        setSubItemScore(false, c.id, si.id, Number(e.target.value))
                                                                    }
                                                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                    {(lvlB.minPoints !== lvlB.maxPoints ||
                                                        lvlB.subItems.length === 0) && (
                                                        <div
                                                            className="text-xs"
                                                            style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    marginBottom: 2,
                                                                }}
                                                            >
                                                                <span>Points</span>
                                                                <span style={{ fontWeight: 600 }}>
                                                                    {eB?.selectedPoints ?? lvlB.minPoints}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={lvlB.minPoints}
                                                                max={lvlB.maxPoints}
                                                                step={0.5}
                                                                value={eB?.selectedPoints ?? lvlB.minPoints}
                                                                onChange={e =>
                                                                    updateEntry(false, c.id, {
                                                                        selectedPoints: Number(e.target.value),
                                                                    })
                                                                }
                                                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Per-criterion comments (toggled) */}
                                    {commentOpen && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                            <div>
                                                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                                                    {studentA.name}
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    placeholder={t('comparativeGrading.comment_placeholder')}
                                                    value={eA?.comment || ''}
                                                    onChange={e => updateEntry(true, c.id, { comment: e.target.value })}
                                                    style={{ width: '100%', fontSize: '0.8rem', resize: 'vertical' }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                                                    {studentB.name}
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    placeholder={t('comparativeGrading.comment_placeholder')}
                                                    value={eB?.comment || ''}
                                                    onChange={e => updateEntry(false, c.id, { comment: e.target.value })}
                                                    style={{ width: '100%', fontSize: '0.8rem', resize: 'vertical' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div
                            style={{ marginTop: 20, marginBottom: 40, display: 'flex', justifyContent: 'center' }}
                        >
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveAndNext}
                                style={{ padding: '12px 30px', fontSize: '1.1rem' }}
                            >
                                <Check size={18} /> Save & Next Matchup
                            </button>
                        </div>
                    </div>

                    {/* Right Column (Student B attachments) */}
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingLeft: 4 }}
                    >
                        <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                            <h3 style={{ marginBottom: 12 }}>Attachments</h3>
                            {attB.length === 0 ? (
                                <p className="text-muted text-sm">No attachments uploaded.</p>
                            ) : (
                                attB.map(a => <AttachmentViewer key={a.id} attachment={a} />)
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    // ── Score panel helper (avoids repetition for A and B) ──────────────────
    function renderScorePanel(
        isA: boolean,
        c: typeof rubric.criteria[0],
        entry: ScoreEntry | undefined,
        activeLevel: typeof c.levels[0] | undefined,
        displayLevels: typeof c.levels
    ) {
        const student = isA ? studentA! : studentB!;
        return (
            <div style={{ flex: 1, padding: 10, background: 'var(--bg-body)', borderRadius: 8, border: `2px solid ${entry?.levelId ? 'var(--accent)' : 'var(--border)'}` }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    {t('comparativeGrading.label_score', { name: student.name })}
                </div>
                <select
                    value={entry?.levelId || ''}
                    onChange={e => manuallyUpdateLevel(isA, c.id, e.target.value)}
                    style={{ width: '100%', fontSize: '0.85rem', marginBottom: 8 }}
                >
                    <option value="" disabled>{t('comparativeGrading.select_level')}</option>
                    {displayLevels.map(l => (
                        <option key={l.id} value={l.id}>{l.label} ({l.minPoints} {t('gradeStudent.table_points')})</option>
                    ))}
                </select>

                {activeLevel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeLevel.subItems.map(si => {
                            // Guard against malformed sub-items where min > max
                            const siMin = Math.min(si.minPoints ?? 0, si.maxPoints ?? si.points ?? 1);
                            const siMax = Math.max(si.minPoints ?? 0, si.maxPoints ?? si.points ?? 1);
                            const currentScore = entry?.subItemScores?.[si.id] ?? siMin;
                            return (
                                <div key={si.id} className="text-xs">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <span>{si.label}</span>
                                        <span style={{ fontWeight: 600 }}>{currentScore}/{siMax}</span>
                                    </div>
                                    <input type="range" min={siMin} max={siMax} step={0.5}
                                        value={currentScore}
                                        onChange={e => setSubItemScore(isA, c.id, si.id, Number(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                                    />
                                </div>
                            );
                        })}
                        {(activeLevel.minPoints !== activeLevel.maxPoints || activeLevel.subItems.length === 0) && (
                            <div className="text-xs" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span>{t('comparativeGrading.label_points')}</span>
                                    <span style={{ fontWeight: 600 }}>{entry?.selectedPoints ?? activeLevel.minPoints}</span>
                                </div>
                                <input type="range" min={activeLevel.minPoints} max={activeLevel.maxPoints} step={0.5}
                                    value={entry?.selectedPoints ?? activeLevel.minPoints}
                                    onChange={e => updateEntry(isA, c.id, { selectedPoints: Number(e.target.value) })}
                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function ComparativeGrading() {
    const { classId, rubricId } = useParams();
    if (!rubricId) return <div className="page-content">Rubric not found</div>;
    if (!classId || classId === 'all') return <ClassPicker rubricId={rubricId} />;
    return <ComparativeGradingSession classId={classId} rubricId={rubricId} />;
}

// ─── Router ───────────────────────────────────────────────────────────────────
// Decides whether to show the class picker or jump straight into grading.
export default function ComparativeGrading() {
    const { classId, rubricId } = useParams();

    if (!rubricId) return <div className="page-content">Rubric not found</div>;

    // Gate: a real class must be selected before grading starts.
    if (!classId || classId === 'all') {
        return <ClassPicker rubricId={rubricId} />;
    }

    return <ComparativeGradingSession classId={classId} rubricId={rubricId} />;
}
