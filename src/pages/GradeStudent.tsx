import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, MessageSquare, Paperclip, CheckSquare, Square, Info, BookOpen } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import CommentBankModal from '../components/Comments/CommentBankModal';
import { useApp } from '../context/AppContext';
import type { ScoreEntry, Modifier } from '../types';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function GradeStudent() {
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const {
        rubrics, students, studentRubrics, attachments,
        gradeScales, settings, saveStudentRubric
    } = useApp();

    const rubric = rubrics.find(r => r.id === rubricId);
    const student = students.find(s => s.id === studentId);
    const scale = gradeScales.find(g => g.id === (rubric?.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];

    const existingSR = studentRubrics.find(sr => sr.rubricId === rubricId && sr.studentId === studentId);

    const [sr, setSr] = useState(() => {
        if (existingSR) return existingSR;
        if (!rubricId || !studentId) return null;
        const entries: ScoreEntry[] = (rubric?.criteria ?? []).map(c => ({
            criterionId: c.id, levelId: null, comment: '', checkedSubItems: [], selectedPoints: undefined
        }));
        return {
            id: `${rubricId}_${studentId}_${Date.now()}`,
            rubricId: rubricId!, studentId: studentId!,
            entries, overallComment: '', isPeerReview: false,
        };
    });

    const [activeCommentCrit, setActiveCommentCrit] = useState<string | null>(null);
    const [showCommentBankFor, setShowCommentBankFor] = useState<string | null>(null);
    const [showAttachPanel, setShowAttachPanel] = useState(false);
    const [saved, setSaved] = useState(false);

    const updateEntry = useCallback((criterionId: string, patch: Partial<ScoreEntry>) => {
        if (!sr) return;
        setSr(prev => {
            if (!prev) return prev;
            const entries = prev.entries.map(e => e.criterionId === criterionId ? { ...e, ...patch } : e);
            return { ...prev, entries };
        });
    }, [sr]);

    const summary = useMemo(() => {
        if (!sr || !rubric) return null;
        return calcGradeSummary(sr, rubric.criteria, scale, rubric);
    }, [sr, rubric, scale]);

    const handleSave = useCallback(() => {
        if (!sr) return;
        saveStudentRubric({ ...sr, gradedAt: new Date().toISOString() });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }, [sr, saveStudentRubric]);

    if (!rubric || !student || !sr) return <div className="page-content">Rubric/Student not found. <button onClick={() => navigate(-1)}>Back</button></div>;

    const fmt = rubric.format;
    const orderedLevels = fmt.levelOrder === 'worst-first'
        ? (c: typeof rubric.criteria[0]) => [...c.levels].reverse()
        : (c: typeof rubric.criteria[0]) => c.levels;
    const rubricAttachments = attachments.filter(a => a.rubricId === rubricId);

    // Helper to toggle a sub-item check
    function toggleSubItem(entry: ScoreEntry, subItemId: string) {
        const current = entry.checkedSubItems ?? [];
        const next = current.includes(subItemId)
            ? current.filter(id => id !== subItemId)
            : [...current, subItemId];
        updateEntry(entry.criterionId, { checkedSubItems: next });
    }

    return (
        <>
            <Topbar
                title={`Grading: ${student.name}`}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAttachPanel(p => !p)}>
                            <Paperclip size={15} /> Attachments
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {saved ? 'Saved!' : 'Save'}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                {/* Score summary bar */}
                {summary && (
                    <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                        <div style={{
                            background: summary.gradeColor + '22',
                            border: `2px solid ${summary.gradeColor}`,
                            borderRadius: 10, padding: '6px 18px', textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.gradeColor }}>{summary.letterGrade}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>GRADE</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                {summary.modifiedPercentage.toFixed(1)}%
                            </div>
                            <div className="text-muted text-xs">
                                {rubric.scoringMode === 'total-points' ? 'Percentage' : 'Weighted Score'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                {summary.rawScore} / {summary.configuredMaxPoints}
                            </div>
                            <div className="text-muted text-xs">Total Points</div>
                        </div>
                        {/* Modifier controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, marginLeft: 'auto' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                Better/Worse Modifier
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select value={sr.globalModifier?.type ?? 'percentage'}
                                    onChange={e => setSr(p => p ? { ...p, globalModifier: { type: e.target.value as Modifier['type'], value: p.globalModifier?.value ?? 0, reason: p.globalModifier?.reason ?? '' } } : p)}
                                    style={{ flex: 1 }}>
                                    <option value="percentage">% offset</option>
                                    <option value="points">Points offset</option>
                                </select>
                                <input type="number" value={sr.globalModifier?.value ?? 0}
                                    onChange={e => setSr(p => p ? { ...p, globalModifier: { type: p.globalModifier?.type ?? 'percentage', value: Number(e.target.value), reason: p.globalModifier?.reason ?? '' } } : p)}
                                    style={{ width: 60 }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Rubric grid */}
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table className="rubric-grid" style={{ fontFamily: fmt.fontFamily, fontSize: fmt.fontSize }}>
                        <thead>
                            <tr style={{ background: fmt.headerColor, color: fmt.headerTextColor }}>
                                <th style={{ width: fmt.criterionColWidth, textAlign: 'left', padding: '14px 16px' }}>Criterion</th>
                                {rubric.criteria[0]?.levels.map((_, li) => {
                                    const lvl = orderedLevels(rubric.criteria[0])[li];
                                    return (
                                        <th key={li} style={{ width: fmt.levelColWidth }}>
                                            {lvl?.label}
                                            {fmt.showPoints && lvl ? ` (${lvl.minPoints}${lvl.minPoints !== lvl.maxPoints ? `–${lvl.maxPoints}` : ''}pts)` : ''}
                                        </th>
                                    );
                                })}
                                <th style={{ width: 60 }}></th>
                                {fmt.showWeights && <th style={{ width: 72 }}>Wt%</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rubric.criteria.map(c => {
                                const entry = sr.entries.find(e => e.criterionId === c.id)!;
                                const levels = orderedLevels(c);
                                const activeLevel = c.levels.find(l => l.id === entry.levelId);

                                return (
                                    <React.Fragment key={c.id}>
                                        <tr>
                                            <td className="criterion-cell">
                                                <div style={{ fontWeight: 600 }}>{c.title}</div>
                                                {c.description && <div style={{ fontSize: '0.78em', color: 'var(--text-muted)', marginTop: 3 }}>{c.description}</div>}
                                                {c.linkedStandard && (
                                                    <div style={{ marginTop: 6, fontSize: '0.7em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }} title={c.linkedStandard.description}>
                                                        <Info size={10} /> {c.linkedStandard.statementNotation ?? 'Standard'}
                                                    </div>
                                                )}
                                                {entry.overridePoints !== undefined && (
                                                    <div style={{ fontSize: '0.75em', color: 'var(--yellow)', marginTop: 4 }}>
                                                        Override: {entry.overridePoints}pts
                                                    </div>
                                                )}
                                            </td>
                                            {levels.map(level => {
                                                const isSelected = entry.levelId === level.id;
                                                return (
                                                    <td key={level.id}
                                                        className={`level-cell ${isSelected ? 'selected' : ''}`}
                                                        style={isSelected ? { borderColor: fmt.accentColor, boxShadow: `inset 0 0 0 2px ${fmt.accentColor}` } : {}}
                                                        onClick={() => updateEntry(c.id, { levelId: isSelected ? null : level.id, overridePoints: undefined })}
                                                    >
                                                        {level.description || <span style={{ color: 'var(--text-dim)', fontSize: '0.8em' }}>Select</span>}
                                                        {/* Points indicator */}
                                                        {fmt.showPoints && (
                                                            <div style={{ fontSize: '0.75em', color: isSelected ? fmt.accentColor : 'var(--text-muted)', marginTop: 6, fontWeight: 600 }}>
                                                                {level.minPoints === level.maxPoints ? `${level.minPoints}pts` : `${level.minPoints}–${level.maxPoints}pts`}
                                                            </div>
                                                        )}

                                                        {/* Expanded options for selected level */}
                                                        {isSelected && (
                                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                                                                {/* Sub-items */}
                                                                {level.subItems.length > 0 && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                                                        {level.subItems.map(si => {
                                                                            const checked = (entry.checkedSubItems ?? []).includes(si.id);
                                                                            return (
                                                                                <div key={si.id} onClick={() => toggleSubItem(entry, si.id)} style={{ display: 'flex', gap: 6, alignItems: 'start', fontSize: '0.75em', cursor: 'pointer', lineHeight: 1.3 }}>
                                                                                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                                                                                        {checked ? <CheckSquare size={14} color={fmt.accentColor} /> : <Square size={14} color="var(--text-muted)" />}
                                                                                    </div>
                                                                                    <span>{si.label} <span style={{ opacity: 0.6 }}>(+{si.points})</span></span>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}

                                                                {/* Range Slider (always show if range exists OR if no sub-items, to allow point adjustment) */}
                                                                {(level.minPoints !== level.maxPoints || level.subItems.length === 0) && (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                        <label style={{ fontSize: '0.7em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                                            {level.subItems.length > 0 ? 'Base Points' : 'Points'}
                                                                        </label>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                            <input type="range"
                                                                                min={level.minPoints} max={level.maxPoints} step={0.5}
                                                                                value={entry.selectedPoints ?? level.minPoints}
                                                                                onChange={e => updateEntry(c.id, { selectedPoints: Number(e.target.value) })}
                                                                                style={{ flex: 1, accentColor: fmt.accentColor }}
                                                                            />
                                                                            <div style={{ fontSize: '0.75em', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
                                                                                {entry.selectedPoints ?? level.minPoints}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td>
                                                <button className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={() => setActiveCommentCrit(activeCommentCrit === c.id ? null : c.id)}
                                                    style={{ color: entry.comment ? 'var(--accent)' : 'var(--text-dim)' }}>
                                                    <MessageSquare size={15} />
                                                </button>
                                            </td>
                                            {fmt.showWeights && (
                                                <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8em' }}>{c.weight}%</td>
                                            )}
                                        </tr>
                                        {activeCommentCrit === c.id && (
                                            <tr>
                                                <td colSpan={levels.length + 2 + (fmt.showWeights ? 1 : 0)} style={{ background: 'var(--bg-elevated)', padding: 12 }}>
                                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                        <textarea placeholder="Add a comment…" value={entry.comment}
                                                            onChange={e => updateEntry(c.id, { comment: e.target.value })}
                                                            rows={2} style={{ flex: 1 }} />
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCommentBankFor(c.id)} title="Open Comment Bank">
                                                            <BookOpen size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Overall comment */}
                <div className="card">
                    <div className="form-group">
                        <label>Overall Comment</label>
                        <textarea placeholder="General feedback…" value={sr.overallComment}
                            onChange={e => setSr(p => p ? { ...p, overallComment: e.target.value } : p)} rows={3} />
                    </div>
                </div>

                {/* Attachments panel */}
                {showAttachPanel && (
                    <div className="card" style={{ marginTop: 16 }}>
                        <h3>Attachments</h3>
                        {rubricAttachments.map(att => (
                            <div key={att.id} style={{ marginTop: 6 }} className="text-sm">
                                <Paperclip size={12} /> {att.name}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {showCommentBankFor && (
                <CommentBankModal
                    onClose={() => setShowCommentBankFor(null)}
                    onSelect={(text) => {
                        if (!showCommentBankFor) return;
                        const entry = sr.entries.find(e => e.criterionId === showCommentBankFor);
                        if (entry) {
                            const current = entry.comment || '';
                            const spacer = current && !current.endsWith(' ') ? ' ' : '';
                            updateEntry(showCommentBankFor, { comment: current + spacer + text });
                        }
                        setShowCommentBankFor(null);
                    }}
                />
            )}
        </>
    );
}
