import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Topbar from '../components/Layout/Topbar';
import { ArrowLeft, Check, Equal, ChevronRight, ChevronLeft, MessageSquare, Shuffle } from 'lucide-react';
import { nanoid } from '../utils/nanoid';
import { useTranslation } from 'react-i18next';
import { calcGradeSummary } from '../utils/gradeCalc';
import AttachmentViewer from '../components/AttachmentViewer';
import { ScoreEntry } from '../types';

const COMBINED_ID = '__combined__';

// ─── Class + Student picker ───────────────────────────────────────────────────
// Step 1: pick a class (or "all linked classes"). Step 2: pick a starting student (or random).
function ClassPicker({ rubricId }: { rubricId: string }) {
    const navigate = useNavigate();
    const { classes, rubrics, students } = useApp();
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

    const rubric = rubrics.find(r => r.id === rubricId);

    const linkedClasses = classes.filter(c => c.rubricIds?.includes(rubricId));
    const offerClasses = linkedClasses.length > 0 ? linkedClasses : classes;

    // Students for the chosen scope: all linked classes or a single class.
    const pickerStudents = useMemo(() => {
        if (!selectedClassId) return [];
        if (selectedClassId === COMBINED_ID) {
            const ids = new Set(offerClasses.map(c => c.id));
            return students.filter(s => ids.has(s.classId));
        }
        return students.filter(s => s.classId === selectedClassId);
    }, [students, selectedClassId, offerClasses]);

    const goToSession = (classId: string, startId?: string) => {
        const url = `/grade-comparative/${classId}/${rubricId}`;
        navigate(startId ? `${url}?start=${startId}` : url, { replace: true });
    };

    if (selectedClassId) {
        const isCombined = selectedClassId === COMBINED_ID;
        const cls = isCombined ? null : classes.find(c => c.id === selectedClassId);
        const scopeLabel = isCombined
            ? `All linked classes (${offerClasses.map(c => c.name).join(', ')})`
            : `${cls?.name}${cls?.year ? ` — ${cls.year}` : ''}`;

        return (
            <>
                <Topbar
                    title={rubric ? `Compare: ${rubric.name}` : 'Comparative Grading'}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedClassId(null)}>
                            <ArrowLeft size={15} /> Back
                        </button>
                    }
                />
                <div
                    className="page-content fade-in"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}
                >
                    <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '32px 28px' }}>
                        <h2 style={{ marginBottom: 4 }}>Choose Starting Student</h2>
                        <p className="text-muted text-sm" style={{ marginBottom: 8 }}>{scopeLabel}</p>
                        <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
                            Pick who to start with, or let the system choose randomly.
                        </p>
                        <button
                            className="btn btn-primary"
                            style={{ marginBottom: 16, width: '100%' }}
                            onClick={() => goToSession(selectedClassId)}
                        >
                            <Shuffle size={15} /> Random Start
                        </button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {pickerStudents.length === 0 && (
                                <p className="text-muted text-sm">No students found.</p>
                            )}
                            {[...pickerStudents].sort((a, b) => a.name.localeCompare(b.name)).map(s => {
                                const studentClass = isCombined ? classes.find(c => c.id === s.classId) : null;
                                return (
                                    <button
                                        key={s.id}
                                        className="btn btn-secondary"
                                        onClick={() => goToSession(selectedClassId, s.id)}
                                    >
                                        {s.name}
                                        {studentClass && (
                                            <span className="text-muted" style={{ fontSize: '0.8em', marginLeft: 6 }}>
                                                ({studentClass.name})
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </>
        );
    }

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
                <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '32px 28px' }}>
                    <h2 style={{ marginBottom: 8 }}>Select a Class</h2>
                    <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
                        Choose which class to grade, or compare across all linked classes at once.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {offerClasses.length === 0 && (
                            <p className="text-muted text-sm">No classes found. Add a class first.</p>
                        )}
                        {offerClasses.length > 1 && (
                            <button
                                className="btn btn-primary"
                                onClick={() => setSelectedClassId(COMBINED_ID)}
                            >
                                All linked classes
                            </button>
                        )}
                        {offerClasses.map(c => (
                            <button
                                key={c.id}
                                className="btn btn-secondary"
                                onClick={() => setSelectedClassId(c.id)}
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
// classId is either a real class ID or COMBINED_ID for all linked classes.
function ComparativeGradingSession({
    classId,
    rubricId,
}: {
    classId: string;
    rubricId: string;
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, students, classes, studentRubrics, attachments, saveStudentRubric, gradeScales, settings } =
        useApp();

    const [searchParams] = useSearchParams();
    const startStudentId = searchParams.get('start');

    const rubric = rubrics.find(r => r.id === rubricId);

    // When COMBINED_ID, pull from every class that has this rubric linked.
    const classStudents = useMemo(() => {
        if (classId === COMBINED_ID) {
            const linkedIds = new Set(
                classes.filter(c => c.rubricIds?.includes(rubricId)).map(c => c.id)
            );
            return students.filter(s => linkedIds.has(s.classId));
        }
        return students.filter(s => s.classId === classId);
    }, [students, classes, classId, rubricId]);

    const [studentA, setStudentA] = useState<typeof students[0] | null>(null);
    const [studentB, setStudentB] = useState<typeof students[0] | null>(null);
    const [srA, setSrA] = useState<typeof studentRubrics[0] | null>(null);
    const [srB, setSrB] = useState<typeof studentRubrics[0] | null>(null);
    const [matchups, setMatchups] = useState<Set<string>>(new Set());
    const [seenStudentIds, setSeenStudentIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [sessionDone, setSessionDone] = useState(false);
    // Local limit = total matchups for this session. 0 = unlimited.
    // Seeded from global settings but adjustable on the fly.
    const [matchupLimit, setMatchupLimit] = useState(settings.comparativeMatchupLimit ?? 0);

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
        return [id1, id2].sort().join('|');
    }

    function pickNextMatchup(anchorId: string | null, keepSrA?: typeof studentRubrics[0] | null) {
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
        // Use the already-saved SR when keeping the same anchor so scores aren't wiped
        // (studentRubrics context may not have updated yet when called right after save).
        setSrA(keepSrA !== undefined ? keepSrA : getEmptySR(a.id));
        setSrB(getEmptySR(b.id));
        setMatchups(prev => new Set([...prev, getMatchKey(a!.id, b.id)]));
        setSeenStudentIds(prev => new Set([...prev, a!.id, b.id]));
        setIsDirty(false);
    }

    function handleSaveAndNext() {
        if (!srA || !srB || !studentA || !rubric) return;
        const snap = JSON.parse(JSON.stringify(rubric));
        const savedSrA = { ...srA, gradedAt: new Date().toISOString(), rubricSnapshot: snap };
        const savedSrB = { ...srB, gradedAt: new Date().toISOString(), rubricSnapshot: snap };
        saveStudentRubric(savedSrA);
        saveStudentRubric(savedSrB);
        setIsDirty(false);

        // matchups.size already includes the current matchup (added in pickNextMatchup).
        // If the session total limit is reached, show the done screen instead of continuing.
        if (matchupLimit > 0 && matchups.size >= matchupLimit) {
            setSessionDone(true);
            return;
        }

        // Pass the saved SR so scores aren't lost while context re-renders.
        pickNextMatchup(studentA.id, savedSrA);
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
            const mid = Math.floor(sortedLevels.length / 2);
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
                if (idxB < sortedLevels.length - 1) idxB = idxA + 1;
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

    function compareSubItem(
        criterionId: string,
        subItemId: string,
        min: number,
        max: number,
        comparison: 'A_BETTER' | 'EQUAL' | 'B_BETTER'
    ) {
        if (!srA || !srB) return;
        const eA = srA.entries.find(e => e.criterionId === criterionId);
        const eB = srB.entries.find(e => e.criterionId === criterionId);
        let scoreA = eA?.subItemScores?.[subItemId] ?? min;
        let scoreB = eB?.subItemScores?.[subItemId] ?? min;

        if (comparison === 'EQUAL') {
            const avg = Math.round(((scoreA + scoreB) / 2) * 2) / 2;
            scoreA = scoreB = avg;
        } else if (comparison === 'A_BETTER') {
            if (scoreA <= scoreB) {
                if (scoreA < max) scoreA = Math.min(max, scoreB + 0.5);
                else if (scoreB > min) scoreB = Math.max(min, scoreA - 0.5);
            }
        } else if (comparison === 'B_BETTER') {
            if (scoreB <= scoreA) {
                if (scoreB < max) scoreB = Math.min(max, scoreA + 0.5);
                else if (scoreA > min) scoreA = Math.max(min, scoreB - 0.5);
            }
        }

        updateEntry(true, criterionId, { subItemScores: { ...(eA?.subItemScores ?? {}), [subItemId]: scoreA } });
        updateEntry(false, criterionId, { subItemScores: { ...(eB?.subItemScores ?? {}), [subItemId]: scoreB } });
    }

    function toggleComment(criterionId: string) {
        setOpenComments(prev => {
            const next = new Set(prev);
            next.has(criterionId) ? next.delete(criterionId) : next.add(criterionId);
            return next;
        });
    }

    const n = classStudents.length;
    const totalPossibleMatchups = (n * (n - 1)) / 2;
    const matchupsDone = matchups.size;
    // When a session limit is active, use it as the denominator so the
    // progress bar and "left" counter reflect what the teacher actually
    // planned to do, not the combinatorial maximum.
    const sessionMax = matchupLimit > 0 ? matchupLimit : totalPossibleMatchups;
    const matchupsLeft = Math.max(0, sessionMax - matchupsDone);
    const matchupProgress = sessionMax > 0 ? Math.min(100, (matchupsDone / sessionMax) * 100) : 0;
    const maxPerStudent = n - 1;

    const perStudentDone = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const key of matchups) {
            const [id1, id2] = key.split('|');
            counts[id1] = (counts[id1] ?? 0) + 1;
            counts[id2] = (counts[id2] ?? 0) + 1;
        }
        return counts;
    }, [matchups]);

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

    if (sessionDone) return (
        <>
            <Topbar title={`Comparative: ${rubric?.name}`} actions={
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
            } />
            <div className="page-content fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center', padding: '32px 28px' }}>
                    <Check size={40} style={{ color: 'var(--accent)', marginBottom: 16 }} />
                    <h2 style={{ marginBottom: 8 }}>Session Complete</h2>
                    <p className="text-muted text-sm" style={{ marginBottom: 24 }}>
                        You've reached your limit of {matchupLimit} comparison{matchupLimit !== 1 ? 's' : ''}. All scores have been saved.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button className="btn btn-primary" onClick={() => { setSessionDone(false); pickNextMatchup(studentA.id, srA); }}>
                            Continue Comparing
                        </button>
                        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
                            <ArrowLeft size={15} /> Back to Rubric
                        </button>
                    </div>
                </div>
            </div>
        </>
    );

    const attA = attachments.filter(a => a.studentId === studentA.id);
    const attB = attachments.filter(a => a.studentId === studentB.id);
    const scale =
        gradeScales.find(g => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ??
        gradeScales[0];
    const sumA = calcGradeSummary(srA, rubric.criteria, scale, rubric);
    const sumB = calcGradeSummary(srB, rubric.criteria, scale, rubric);

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
                <div className="card" style={{ marginBottom: 16, padding: '12px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Student A */}
                        <div style={{ flex: 1 }}>
                            <h2 style={{ fontSize: '1.2rem' }}>{studentA.name}</h2>
                            <div className="text-muted text-sm" style={{ fontWeight: 'bold', color: sumA?.gradeColor }}>
                                {sumA?.rawScore} pts ({sumA?.modifiedPercentage.toFixed(1)}%)
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                {perStudentDone[studentA.id] ?? 0} / {maxPerStudent} matchups done
                            </div>
                        </div>

                        {/* Centre: VS + overall progress + limit control */}
                        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-muted)' }}>VS</span>
                            <div style={{ width: '100%', maxWidth: 200 }}>
                                <div style={{ background: 'var(--bg-body)', borderRadius: 4, height: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    <div style={{ width: `${matchupProgress}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                                </div>
                                <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                                    {matchupsDone} / {matchupLimit > 0 ? matchupLimit : totalPossibleMatchups} done · <strong>{matchupsLeft}</strong> left
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                <label className="text-xs text-muted" style={{ whiteSpace: 'nowrap' }}>Session limit:</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={matchupLimit === 0 ? '' : matchupLimit}
                                    placeholder="∞"
                                    onChange={e => setMatchupLimit(Math.max(0, parseInt(e.target.value) || 0))}
                                    style={{ width: 48, fontSize: '0.8rem', textAlign: 'center', padding: '2px 4px' }}
                                    title="Total comparisons for this session (0 = unlimited)"
                                />
                            </div>
                        </div>

                        {/* Student B */}
                        <div style={{ flex: 1, textAlign: 'right' }}>
                            <h2 style={{ fontSize: '1.2rem' }}>{studentB.name}</h2>
                            <div className="text-muted text-sm" style={{ fontWeight: 'bold', color: sumB?.gradeColor }}>
                                {sumB?.rawScore} pts ({sumB?.modifiedPercentage.toFixed(1)}%)
                            </div>
                            <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                                {perStudentDone[studentB.id] ?? 0} / {maxPerStudent} matchups done
                            </div>
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
                    {/* Left Column (progress + Student A attachments) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                        {/* Per-student progress */}
                        <div className="card" style={{ background: 'var(--bg-elevated)', padding: '14px 16px' }}>
                            <h3 style={{ marginBottom: 10, fontSize: '0.9rem' }}>Student Progress</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[...classStudents]
                                    .sort((a, b) => (perStudentDone[a.id] ?? 0) - (perStudentDone[b.id] ?? 0))
                                    .map(s => {
                                        const done = perStudentDone[s.id] ?? 0;
                                        const pct = maxPerStudent > 0 ? (done / maxPerStudent) * 100 : 0;
                                        const isCurrent = s.id === studentA?.id || s.id === studentB?.id;
                                        return (
                                            <div key={s.id}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 2 }}>
                                                    <span style={{ fontWeight: isCurrent ? 600 : 400, color: isCurrent ? 'var(--accent)' : 'var(--text)' }}>
                                                        {s.name}
                                                    </span>
                                                    <span className="text-muted">{done} / {maxPerStudent}</span>
                                                </div>
                                                <div style={{ background: 'var(--bg-body)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: isCurrent ? 'var(--accent)' : 'var(--text-muted)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Student A attachments */}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', padding: '0 4px' }}>
                        {rubric.criteria.map(c => {
                            const eA = srA.entries.find(e => e.criterionId === c.id);
                            const eB = srB.entries.find(e => e.criterionId === c.id);
                            const lvlA = c.levels.find(l => l.id === eA?.levelId);
                            const lvlB = c.levels.find(l => l.id === eB?.levelId);
                            const commentOpen = openComments.has(c.id);
                            const hasComment = !!(eA?.comment || eB?.comment);

                            return (
                                <div key={c.id} className="card" style={{ padding: '16px 20px' }}>
                                    {/* Criterion header with comment toggle */}
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{c.title}</div>
                                            {c.description && (
                                                <div className="text-muted text-sm" style={{ marginTop: 2 }}>{c.description}</div>
                                            )}
                                        </div>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() => toggleComment(c.id)}
                                            title="Toggle comments"
                                            style={{ color: hasComment ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0, marginLeft: 8 }}
                                        >
                                            <MessageSquare size={15} />
                                        </button>
                                    </div>

                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: 12,
                                            marginBottom: commentOpen ? 0 : 0,
                                            marginTop: 16,
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
                                                        const currentScore = eA?.subItemScores?.[si.id] ?? (si.minPoints ?? 0);
                                                        return (
                                                            <div key={si.id} className="text-xs">
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
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
                                                                    onChange={e => setSubItemScore(true, c.id, si.id, Number(e.target.value))}
                                                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                    {(lvlA.minPoints !== lvlA.maxPoints || lvlA.subItems.length === 0) && (
                                                        <div className="text-xs" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                                <span>Points</span>
                                                                <span style={{ fontWeight: 600 }}>{eA?.selectedPoints ?? lvlA.minPoints}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={lvlA.minPoints}
                                                                max={lvlA.maxPoints}
                                                                step={0.5}
                                                                value={eA?.selectedPoints ?? lvlA.minPoints}
                                                                onChange={e => updateEntry(true, c.id, { selectedPoints: Number(e.target.value) })}
                                                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Comparative buttons */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 140, paddingTop: 20 }}>
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

                                            {/* Sub-item comparison buttons (only when sharing the same level) */}
                                            {eA?.levelId && eA.levelId === eB?.levelId && (() => {
                                                const sharedLevel = c.levels.find(l => l.id === eA.levelId);
                                                if (!sharedLevel || sharedLevel.subItems.length === 0) return null;
                                                return (
                                                    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        <div className="text-xs text-muted" style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sub-criteria</div>
                                                        {sharedLevel.subItems.map(si => {
                                                            const min = si.minPoints ?? 0;
                                                            const max = si.maxPoints ?? si.points ?? 1;
                                                            return (
                                                                <div key={si.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                                    <div className="text-xs text-muted" style={{ textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={si.label}>{si.label}</div>
                                                                    <div style={{ display: 'flex', gap: 3 }}>
                                                                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '2px 4px', fontSize: '0.7rem' }} onClick={() => compareSubItem(c.id, si.id, min, max, 'A_BETTER')} title="A better on this sub-criterion"><ChevronLeft size={12} /></button>
                                                                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '2px 4px', fontSize: '0.7rem' }} onClick={() => compareSubItem(c.id, si.id, min, max, 'EQUAL')} title="Equal on this sub-criterion"><Equal size={12} /></button>
                                                                        <button className="btn btn-secondary btn-sm" style={{ flex: 1, padding: '2px 4px', fontSize: '0.7rem' }} onClick={() => compareSubItem(c.id, si.id, min, max, 'B_BETTER')} title="B better on this sub-criterion"><ChevronRight size={12} /></button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
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
                                                        const currentScore = eB?.subItemScores?.[si.id] ?? (si.minPoints ?? 0);
                                                        return (
                                                            <div key={si.id} className="text-xs">
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
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
                                                                    onChange={e => setSubItemScore(false, c.id, si.id, Number(e.target.value))}
                                                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                    {(lvlB.minPoints !== lvlB.maxPoints || lvlB.subItems.length === 0) && (
                                                        <div className="text-xs" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                                <span>Points</span>
                                                                <span style={{ fontWeight: 600 }}>{eB?.selectedPoints ?? lvlB.minPoints}</span>
                                                            </div>
                                                            <input
                                                                type="range"
                                                                min={lvlB.minPoints}
                                                                max={lvlB.maxPoints}
                                                                step={0.5}
                                                                value={eB?.selectedPoints ?? lvlB.minPoints}
                                                                onChange={e => updateEntry(false, c.id, { selectedPoints: Number(e.target.value) })}
                                                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Per-criterion comments (toggled via MessageSquare button) */}
                                    {commentOpen && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
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

                        {/* Overall comments */}
                        <div className="card" style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 12, textAlign: 'center' }}>
                                Overall Comments
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                                        {studentA.name}
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Overall feedback…"
                                        value={srA.overallComment || ''}
                                        onChange={e => setSrA(prev => prev ? { ...prev, overallComment: e.target.value } : prev)}
                                        style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>
                                        {studentB.name}
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Overall feedback…"
                                        value={srB.overallComment || ''}
                                        onChange={e => setSrB(prev => prev ? { ...prev, overallComment: e.target.value } : prev)}
                                        style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: 20, marginBottom: 40, display: 'flex', justifyContent: 'center' }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingLeft: 4 }}>
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
}

// ─── Router ───────────────────────────────────────────────────────────────────
// Decides whether to show the class picker or jump straight into grading.
export default function ComparativeGrading() {
    const { classId, rubricId } = useParams();

    if (!rubricId) return <div className="page-content">Rubric not found</div>;

    if (!classId || classId === 'all') {
        return <ClassPicker rubricId={rubricId} />;
    }
    // COMBINED_ID and real class IDs both go straight to the session.

    return <ComparativeGradingSession classId={classId} rubricId={rubricId} />;
}
