import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Topbar from '../components/Layout/Topbar';
import { ArrowLeft, Check, Equal, Download, FileText, ImageIcon, ChevronRight, ChevronLeft } from 'lucide-react';
import { nanoid } from '../utils/nanoid';
import { useTranslation } from 'react-i18next';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function ComparativeGrading() {
    const { t } = useTranslation();
    const { classId, rubricId } = useParams();
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, attachments, saveStudentRubric, gradeScales, settings } = useApp();

    const rubric = rubrics.find(r => r.id === rubricId);

    // Filter students by class
    const classStudents = useMemo(() => {
        if (!classId || classId === 'all') return students;
        return students.filter(s => s.classId === classId);
    }, [students, classId]);

    const [studentA, setStudentA] = useState<typeof students[0] | null>(null);
    const [studentB, setStudentB] = useState<typeof students[0] | null>(null);
    const [srA, setSrA] = useState<typeof studentRubrics[0] | null>(null);
    const [srB, setSrB] = useState<typeof studentRubrics[0] | null>(null);
    const [matchups, setMatchups] = useState<Set<string>>(new Set());
    const [error, setError] = useState('');

    // Setup initial matchup
    useEffect(() => {
        if (!rubric) return;
        if (classStudents.length < 2) {
            setError('Not enough students in this class for a comparison.');
            return;
        }
        if (!studentA && !studentB) {
            pickNextMatchup(null);
        }
    }, [classStudents, rubric]);

    function getEmptySR(studentId: string) {
        if (!rubric) throw new Error('No rubric');
        const existing = studentRubrics.find(sr => sr.rubricId === rubric.id && sr.studentId === studentId);
        if (existing) return existing;
        return {
            id: nanoid(),
            rubricId: rubric.id,
            studentId,
            entries: rubric.criteria.map(c => ({ criterionId: c.id, levelId: null, comment: '', checkedSubItems: [] })),
            overallComment: '',
            isPeerReview: false,
            gradedAt: new Date().toISOString()
        };
    }

    function getMatchKey(id1: string, id2: string) {
        return [id1, id2].sort().join('-');
    }

    function pickNextMatchup(anchorId: string | null) {
        if (classStudents.length < 2) return;

        let a = anchorId ? classStudents.find(s => s.id === anchorId)! : null;
        if (!a) {
            // Pick a completely random student A
            a = classStudents[Math.floor(Math.random() * classStudents.length)];
        }

        // Pick student B differing from A, and ideally not compared yet
        let candidatesForB = classStudents.filter(s => s.id !== a!.id && !matchups.has(getMatchKey(a!.id, s.id)));

        // If everyone has been compared with A, just pick any random student not A
        if (candidatesForB.length === 0) {
            candidatesForB = classStudents.filter(s => s.id !== a!.id);
        }

        const b = candidatesForB[Math.floor(Math.random() * candidatesForB.length)];

        setStudentA(a);
        setStudentB(b);
        setSrA(getEmptySR(a.id));
        setSrB(getEmptySR(b.id));
        setMatchups(prev => new Set([...prev, getMatchKey(a!.id, b.id)]));
    }

    function handleSaveAndNext() {
        if (!srA || !srB || !studentA || !rubric) return;

        // Save both records
        const snap = JSON.parse(JSON.stringify(rubric));
        saveStudentRubric({ ...srA, gradedAt: new Date().toISOString(), rubricSnapshot: snap });
        saveStudentRubric({ ...srB, gradedAt: new Date().toISOString(), rubricSnapshot: snap });

        // Keep A as anchor, pick new B
        pickNextMatchup(studentA.id);
    }

    // Adaptive Scoring mechanism
    function compareCriterion(criterionId: string, comparison: 'A_BETTER' | 'EQUAL' | 'B_BETTER') {
        if (!srA || !srB || !rubric) return;

        const criteria = rubric.criteria.find(c => c.id === criterionId);
        if (!criteria || criteria.levels.length === 0) return;

        // Ensure levels are sorted lowest to highest (we assume index 0 is lowest points usually, or we calculate points)
        // Let's sort levels by points specifically for this logic:
        const sortedLevels = [...criteria.levels].sort((l1, l2) => (l1.minPoints || 0) - (l2.minPoints || 0));

        let entryA = srA.entries.find(e => e.criterionId === criterionId)!;
        let entryB = srB.entries.find(e => e.criterionId === criterionId)!;

        // Find current level indices
        let idxA = sortedLevels.findIndex(l => l.id === entryA.levelId);
        let idxB = sortedLevels.findIndex(l => l.id === entryB.levelId);

        // If neither have a score, start them somewhere in the middle
        if (idxA === -1 && idxB === -1) {
            const mid = Math.floor(sortedLevels.length / 2);
            idxA = mid;
            idxB = mid;
        } else if (idxA === -1) {
            idxA = idxB;
        } else if (idxB === -1) {
            idxB = idxA;
        }

        // Apply adaptive adjustment
        if (comparison === 'A_BETTER') {
            if (idxA <= idxB) {
                // bump A up or B down
                if (idxA < sortedLevels.length - 1) idxA = idxB + 1;
                else if (idxB > 0) idxB = idxA - 1;
            }
        } else if (comparison === 'B_BETTER') {
            if (idxB <= idxA) {
                if (idxB < sortedLevels.length - 1) idxB = idxA + 1;
                else if (idxA > 0) idxA = idxB - 1;
            }
        } else if (comparison === 'EQUAL') {
            idxB = idxA; // Make them equal
        }

        // Force boundaries
        idxA = Math.max(0, Math.min(idxA, sortedLevels.length - 1));
        idxB = Math.max(0, Math.min(idxB, sortedLevels.length - 1));

        const updatedSrA = {
            ...srA,
            entries: srA.entries.map(e => e.criterionId === criterionId ? { ...e, levelId: sortedLevels[idxA].id, overridePoints: undefined } : e)
        };
        const updatedSrB = {
            ...srB,
            entries: srB.entries.map(e => e.criterionId === criterionId ? { ...e, levelId: sortedLevels[idxB].id, overridePoints: undefined } : e)
        };

        setSrA(updatedSrA);
        setSrB(updatedSrB);
    }

    function manuallyUpdateLevel(isA: boolean, criterionId: string, levelId: string) {
        if (isA && srA) {
            setSrA({
                ...srA,
                entries: srA.entries.map(e => e.criterionId === criterionId ? { ...e, levelId, overridePoints: undefined } : e)
            });
        } else if (!isA && srB) {
            setSrB({
                ...srB,
                entries: srB.entries.map(e => e.criterionId === criterionId ? { ...e, levelId, overridePoints: undefined } : e)
            });
        }
    }

    if (!rubric) return <div className="page-content">Rubric not found</div>;
    if (error) return <div className="page-content">{error}</div>;
    if (!studentA || !studentB || !srA || !srB) return <div className="page-content">Loading...</div>;

    const attA = attachments.filter(a => a.studentId === studentA.id);
    const attB = attachments.filter(a => a.studentId === studentB.id);

    const scale = gradeScales.find(g => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];
    const sumA = calcGradeSummary(srA, rubric.criteria, scale);
    const sumB = calcGradeSummary(srB, rubric.criteria, scale);

    return (
        <>
            <Topbar title={`Comparative: ${rubric.name}`} actions={
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={15} /> Back
                </button>
            } />
            <div className="page-content fade-in" style={{ padding: '20px', maxWidth: '100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>

                {/* Header Strip */}
                <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '1.2rem' }}>{studentA.name}</h2>
                        <div className="text-muted text-sm" style={{ fontWeight: 'bold', color: sumA?.gradeColor }}>{sumA?.rawScore} pts ({sumA?.modifiedPercentage.toFixed(1)}%)</div>
                    </div>

                    <div style={{ flex: 1, textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-muted)' }}>
                        VS
                    </div>

                    <div style={{ flex: 1, textAlign: 'right' }}>
                        <h2 style={{ fontSize: '1.2rem' }}>{studentB.name}</h2>
                        <div className="text-muted text-sm" style={{ fontWeight: 'bold', color: sumB?.gradeColor }}>{sumB?.rawScore} pts ({sumB?.modifiedPercentage.toFixed(1)}%)</div>
                    </div>
                </div>

                {/* 3 Column Layout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(400px, 1.5fr) minmax(250px, 1fr)', gap: 20, flex: 1, overflow: 'hidden' }}>

                    {/* Left Column (Student A) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                        <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                            <h3 style={{ marginBottom: 12 }}>Attachments</h3>
                            {attA.length === 0 ? <p className="text-muted text-sm">No attachments uploaded.</p> :
                                attA.map(a => (
                                    <div key={a.id} style={{ marginBottom: 8, padding: 8, background: 'var(--bg-body)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {a.mimeType.startsWith('image/') ? <ImageIcon size={14} className="text-blue" /> : <FileText size={14} className="text-purple" />}
                                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{a.name}</div>
                                        {a.mimeType.startsWith('image/') && a.dataUrl && (
                                            <div style={{ marginTop: 8, width: '100%' }}>
                                                <img src={a.dataUrl} style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} alt={a.name} />
                                            </div>
                                        )}
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    {/* Middle Column (Rubric & Controls) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', padding: '0 4px' }}>
                        {rubric.criteria.map(c => {
                            const eA = srA.entries.find(e => e.criterionId === c.id);
                            const eB = srB.entries.find(e => e.criterionId === c.id);

                            return (
                                <div key={c.id} className="card" style={{ padding: '16px 20px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 4, textAlign: 'center' }}>{c.title}</div>
                                    <div className="text-muted text-sm" style={{ textAlign: 'center', marginBottom: 16 }}>{c.description}</div>

                                    {/* Score controls & comparative buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                        {/* Student A */}
                                        <div style={{ flex: 1, padding: 10, background: 'var(--bg-body)', borderRadius: 8, border: `2px solid ${eA?.levelId ? 'var(--accent)' : 'var(--border)'}` }}>
                                            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{studentA.name}'s Score:</div>
                                            <select
                                                value={eA?.levelId || ''}
                                                onChange={e => manuallyUpdateLevel(true, c.id, e.target.value)}
                                                style={{ width: '100%', fontSize: '0.85rem' }}
                                            >
                                                <option value="" disabled>Select level...</option>
                                                {c.levels.map(l => <option key={l.id} value={l.id}>{l.label} ({l.minPoints} pts)</option>)}
                                            </select>
                                        </div>

                                        {/* Comparative Buttons */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 140 }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => compareCriterion(c.id, 'A_BETTER')} title={`${studentA.name} performed better`}>
                                                <ChevronLeft size={16} /> A Better
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => compareCriterion(c.id, 'EQUAL')}>
                                                <Equal size={16} /> Equal
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => compareCriterion(c.id, 'B_BETTER')} title={`${studentB.name} performed better`}>
                                                B Better <ChevronRight size={16} />
                                            </button>
                                        </div>

                                        {/* Student B */}
                                        <div style={{ flex: 1, padding: 10, background: 'var(--bg-body)', borderRadius: 8, border: `2px solid ${eB?.levelId ? 'var(--accent)' : 'var(--border)'}` }}>
                                            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{studentB.name}'s Score:</div>
                                            <select
                                                value={eB?.levelId || ''}
                                                onChange={e => manuallyUpdateLevel(false, c.id, e.target.value)}
                                                style={{ width: '100%', fontSize: '0.85rem' }}
                                            >
                                                <option value="" disabled>Select level...</option>
                                                {c.levels.map(l => <option key={l.id} value={l.id}>{l.label} ({l.minPoints} pts)</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div style={{ marginTop: 20, marginBottom: 40, display: 'flex', justifyContent: 'center' }}>
                            <button className="btn btn-primary" onClick={handleSaveAndNext} style={{ padding: '12px 30px', fontSize: '1.1rem' }}>
                                <Check size={18} /> Save & Next Matchup
                            </button>
                        </div>
                    </div>

                    {/* Right Column (Student B) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingLeft: 4 }}>
                        <div className="card" style={{ background: 'var(--bg-elevated)' }}>
                            <h3 style={{ marginBottom: 12 }}>Attachments</h3>
                            {attB.length === 0 ? <p className="text-muted text-sm">No attachments uploaded.</p> :
                                attB.map(a => (
                                    <div key={a.id} style={{ marginBottom: 8, padding: 8, background: 'var(--bg-body)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {a.mimeType.startsWith('image/') ? <ImageIcon size={14} className="text-blue" /> : <FileText size={14} className="text-purple" />}
                                        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{a.name}</div>
                                        {a.mimeType.startsWith('image/') && a.dataUrl && (
                                            <div style={{ marginTop: 8, width: '100%' }}>
                                                <img src={a.dataUrl} style={{ width: '100%', borderRadius: 4, border: '1px solid var(--border)' }} alt={a.name} />
                                            </div>
                                        )}
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
