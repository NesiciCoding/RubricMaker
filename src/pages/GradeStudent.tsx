import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, MessageSquare, Paperclip, CheckSquare, Square, Info, BookOpen } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import CommentBankModal from '../components/Comments/CommentBankModal';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import type { ScoreEntry, Modifier } from '../types';
import { calcGradeSummary } from '../utils/gradeCalc';

export default function GradeStudent() {
    const { t } = useTranslation();
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const {
        rubrics, students, studentRubrics, attachments,
        gradeScales, settings, saveStudentRubric, updateSettings
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

    // Ensure that if we loaded this student, the global active class defaults to their class
    // This perfectly handles the user going back and expecting to see this student's class
    React.useEffect(() => {
        if (student && student.classId && student.classId !== settings.activeClassId) {
            updateSettings({ activeClassId: student.classId });
        }
    }, [student?.classId, settings.activeClassId, updateSettings]);

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

    if (!rubric || !student || !sr) return <div className="page-content">{t('gradeStudent.error_not_found')} <button onClick={() => navigate(-1)}>{t('gradeStudent.action_back')}</button></div>;

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
                title={`${t('gradeStudent.title_prefix')} ${student.name}`}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={15} /> {t('gradeStudent.action_back')}</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAttachPanel(p => !p)}>
                            <Paperclip size={15} /> {t('gradeStudent.action_attachments')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                {/* Score summary bar */}
                {summary && (
                    <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
                        {rubric.format.showCalculatedGrade !== false && (
                            <>
                                <div style={{
                                    background: summary.gradeColor + '22',
                                    border: `2px solid ${summary.gradeColor}`,
                                    borderRadius: 10, padding: '6px 18px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: summary.gradeColor }}>{summary.letterGrade}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{t('gradeStudent.label_grade')}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                        {summary.modifiedPercentage.toFixed(1)}%
                                    </div>
                                    <div className="text-muted text-xs">
                                        {rubric.scoringMode === 'total-points' ? t('gradeStudent.label_percentage') : t('gradeStudent.label_weighted_score')}
                                    </div>
                                </div>
                            </>
                        )}
                        <div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                                {summary.rawScore} / {summary.configuredMaxPoints}
                            </div>
                            <div className="text-muted text-xs">{t('gradeStudent.label_total_points')}</div>
                        </div>
                        {/* Modifier controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, marginLeft: 'auto' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                                {t('gradeStudent.label_modifier')}
                            </span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select value={sr.globalModifier?.type ?? 'percentage'}
                                    onChange={e => setSr(p => p ? { ...p, globalModifier: { type: e.target.value as Modifier['type'], value: p.globalModifier?.value ?? 0, reason: p.globalModifier?.reason ?? '' } } : p)}
                                    style={{ flex: 1 }}>
                                    <option value="percentage">{t('gradeStudent.offset_percentage')}</option>
                                    <option value="points">{t('gradeStudent.offset_points')}</option>
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
                                <th style={{ width: fmt.criterionColWidth, textAlign: 'left', padding: '14px 16px' }}>{t('gradeStudent.table_criterion')}</th>
                                {rubric.criteria[0]?.levels.map((_, li) => {
                                    const lvl = orderedLevels(rubric.criteria[0])[li];
                                    return (
                                        <th key={li} style={{ width: fmt.levelColWidth }}>
                                            {lvl?.label}
                                            {fmt.showPoints && lvl ? ` (${lvl.minPoints}${lvl.minPoints !== lvl.maxPoints ? `–${lvl.maxPoints}` : ''}${t('gradeStudent.table_points')})` : ''}
                                        </th>
                                    );
                                })}
                                <th style={{ width: 60 }}></th>
                                {fmt.showWeights && <th style={{ width: 72 }}>{t('gradeStudent.table_weight')}</th>}
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
                                                        <Info size={10} /> {c.linkedStandard.statementNotation ?? t('gradeStudent.label_standard')}
                                                    </div>
                                                )}
                                                {(c.linkedStandards || []).map((std, idx) => (
                                                    <div key={idx} style={{ marginTop: 6, fontSize: '0.7em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }} title={std.description}>
                                                        <Info size={10} /> {std.statementNotation ?? t('gradeStudent.label_standard')}
                                                    </div>
                                                ))}
                                                {entry.overridePoints !== undefined && (
                                                    <div style={{ fontSize: '0.75em', color: 'var(--yellow)', marginTop: 4 }}>
                                                        {t('gradeStudent.label_override')} {entry.overridePoints}{t('gradeStudent.table_points')}
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
                                                        {level.description || <span style={{ color: 'var(--text-dim)', fontSize: '0.8em' }}>{t('gradeStudent.level_select')}</span>}
                                                        {/* Points indicator */}
                                                        {fmt.showPoints && (
                                                            <div style={{ fontSize: '0.75em', color: isSelected ? fmt.accentColor : 'var(--text-muted)', marginTop: 6, fontWeight: 600 }}>
                                                                {level.minPoints === level.maxPoints ? `${level.minPoints}${t('gradeStudent.table_points')}` : `${level.minPoints}–${level.maxPoints}${t('gradeStudent.table_points')}`}
                                                            </div>
                                                        )}

                                                        {/* Sub-items (always show under the level description so they can be clicked independently) */}
                                                        {level.subItems.length > 0 && (
                                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: isSelected ? `1px solid ${fmt.accentColor}40` : '1px solid var(--border)', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                    {level.subItems.map(si => {
                                                                        const checked = (entry.checkedSubItems ?? []).includes(si.id);
                                                                        return (
                                                                            <div key={si.id} onClick={() => toggleSubItem(entry, si.id)} style={{ display: 'flex', gap: 6, alignItems: 'start', fontSize: '0.75em', cursor: 'pointer', lineHeight: 1.3 }}>
                                                                                <div style={{ flexShrink: 0, marginTop: 1 }}>
                                                                                    {checked ? <CheckSquare size={14} color={fmt.accentColor} /> : <Square size={14} color="var(--text-muted)" />}
                                                                                </div>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                                    <span>{si.label} <span style={{ opacity: 0.6 }}>(+{si.points})</span></span>
                                                                                    {si.linkedStandards && si.linkedStandards.length > 0 && (
                                                                                        <div style={{ color: 'var(--accent)', opacity: 0.8, fontSize: '0.9em', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                                            {si.linkedStandards.map((std, idx) => (
                                                                                                <span key={idx} title={std.description}>[{std.statementNotation ?? std.guid}]</span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Range Slider (only show for selected level) */}
                                                        {isSelected && (level.minPoints !== level.maxPoints || level.subItems.length === 0) && (
                                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: (level.subItems.length > 0) ? `1px solid ${fmt.accentColor}20` : `1px solid ${fmt.accentColor}40`, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <label style={{ fontSize: '0.7em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                                        {c.levels.some(l => l.subItems.length > 0) ? t('gradeStudent.label_base_points') : t('gradeStudent.label_points')}
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
                                                        <textarea placeholder={t('gradeStudent.comment_placeholder')} value={entry.comment}
                                                            onChange={e => updateEntry(c.id, { comment: e.target.value })}
                                                            rows={2} style={{ flex: 1 }} />
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowCommentBankFor(c.id)} title={t('gradeStudent.comment_open_bank')}>
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
                        <label>{t('gradeStudent.overall_comment_label')}</label>
                        <textarea placeholder={t('gradeStudent.overall_comment_placeholder')} value={sr.overallComment}
                            onChange={e => setSr(p => p ? { ...p, overallComment: e.target.value } : p)} rows={3} />
                    </div>
                </div>

                {/* Attachments panel */}
                {showAttachPanel && (
                    <div className="card" style={{ marginTop: 16 }}>
                        <h3>{t('gradeStudent.attachments_title')}</h3>
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
