import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, MessageSquare, Paperclip, CheckSquare, Square, Info, BookOpen, FileDown, Mic, MicOff, ChevronRight } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import CommentBankModal from '../components/Comments/CommentBankModal';
import AttachmentViewer from '../components/AttachmentViewer';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useVoiceGrading } from '../hooks/useVoiceGrading';
import TiptapEditor from '../components/Editor/TiptapEditor';
import type { ScoreEntry, Modifier } from '../types';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf } from '../utils/pdfExport';

export default function GradeStudent() {
    const { t } = useTranslation();
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const {
        rubrics, students, classes, studentRubrics, attachments,
        gradeScales, settings, saveStudentRubric, updateSettings
    } = useApp();

    const existingSR = studentRubrics.find(sr => sr.rubricId === rubricId && sr.studentId === studentId);
    const liveRubric = rubrics.find(r => r.id === rubricId);
    const rubric = existingSR?.rubricSnapshot || liveRubric;
    const student = students.find(s => s.id === studentId);
    const scale = gradeScales.find(g => g.id === (rubric?.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];

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
    const [isDirty, setIsDirty] = useState(false);

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
        setIsDirty(true);
    }, [sr]);

    const summary = useMemo(() => {
        if (!sr || !rubric) return null;
        return calcGradeSummary(sr, rubric.criteria, scale, rubric);
    }, [sr, rubric, scale]);

    const handleSave = useCallback(() => {
        if (!sr || !rubric) return;
        saveStudentRubric({
            ...sr,
            rubricSnapshot: JSON.parse(JSON.stringify(rubric)),
            gradedAt: new Date().toISOString()
        });
        setSaved(true);
        setIsDirty(false);
        setTimeout(() => setSaved(false), 2000);
    }, [sr, rubric, saveStudentRubric]);

    // Find next student, restricted to rubric-linked classes when applicable
    const nextStudent = useMemo(() => {
        if (!student) return null;
        const linkedClassIds = classes
            .filter(c => c.rubricIds?.includes(rubricId ?? ''))
            .map(c => c.id);
        const eligible = linkedClassIds.length > 0
            ? students.filter(s => linkedClassIds.includes(s.classId))
            : students.filter(s => s.classId === student.classId);
        const sorted = [...eligible].sort((a, b) => a.name.localeCompare(b.name));
        const currentIndex = sorted.findIndex(s => s.id === studentId);
        const after = sorted.slice(currentIndex + 1).concat(sorted.slice(0, currentIndex));
        return after.find(s => !studentRubrics.find(sr => sr.rubricId === rubricId && sr.studentId === s.id))
            ?? after[0]
            ?? null;
    }, [student, students, classes, studentId, studentRubrics, rubricId]);

    const handleSaveAndNext = useCallback(() => {
        if (!sr || !rubric || !nextStudent) return;
        saveStudentRubric({
            ...sr,
            rubricSnapshot: JSON.parse(JSON.stringify(rubric)),
            gradedAt: new Date().toISOString()
        });
        setIsDirty(false);
        navigate(`/rubrics/${rubricId}/grade/${nextStudent.id}`);
    }, [sr, rubric, saveStudentRubric, nextStudent, navigate, rubricId]);

    // Keyboard shortcut to save
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    // Warn on unsaved changes
    React.useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = ''; // Required for Chrome
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    if (!rubric || !student || !sr) return <div className="page-content">{t('gradeStudent.error_not_found')} <button onClick={() => navigate(-1)}>{t('gradeStudent.action_back')}</button></div>;

    const handleExportPdf = async () => {
        if (!sr || !rubric || !student) return;
        await exportSinglePdf(sr, rubric, student, scale, { orientation: rubric.format.orientation });
    };

    const voice = useVoiceGrading(
        (critIdx, lvlIdx) => {
            const crit = rubric.criteria[critIdx];
            if (!crit) return;
            const level = crit.levels[lvlIdx];
            if (!level) return;
            updateEntry(crit.id, { levelId: level.id, overridePoints: undefined });
        },
        (text) => {
            setSr(p => p ? { ...p, overallComment: (p.overallComment ? p.overallComment + ' ' : '') + text } : p);
            setIsDirty(true);
        },
        settings.language === 'nl' ? 'nl-NL' : 'en-US'
    );

    const fmt = rubric.format;
    const orderedLevels = fmt.levelOrder === 'worst-first'
        ? (c: typeof rubric.criteria[0]) => [...c.levels].reverse()
        : (c: typeof rubric.criteria[0]) => c.levels;
    const rubricAttachments = attachments.filter(a => a.rubricId === rubricId);

    // Helper to set a sub-item score
    function setSubItemScore(entry: ScoreEntry, subItemId: string, score: number) {
        const currentScores = entry.subItemScores ?? {};
        updateEntry(entry.criterionId, { subItemScores: { ...currentScores, [subItemId]: score } });
    }

    return (
        <>
            <Topbar
                title={`${t('gradeStudent.title_prefix')} ${student.name}`}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}><ArrowLeft size={15} /> {t('gradeStudent.action_back')}</button>
                        <button 
                            className={`btn btn-sm ${voice.isListening ? 'btn-danger pulse' : 'btn-secondary'}`} 
                            onClick={voice.toggleListening}
                            title={voice.isListening ? t('gradeStudent.action_voice_stop') : t('gradeStudent.action_voice_start')}
                        >
                            {voice.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                            {voice.isListening ? t('gradeStudent.voice_listening') : t('gradeStudent.action_voice_start')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAttachPanel(p => !p)}>
                            <Paperclip size={15} /> {t('gradeStudent.action_attachments')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                        {nextStudent && (
                            <button className="btn btn-primary btn-sm" onClick={handleSaveAndNext} title={`Next: ${nextStudent.name}`}>
                                <Save size={15} />
                                <ChevronRight size={14} />
                                {nextStudent.name.split(' ')[0]}
                            </button>
                        )}
                    </>
                }
            />
            <div className="page-content fade-in" style={summary ? { paddingBottom: 80 } : undefined}>
                {/* Modifier + export panel */}
                <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', flexShrink: 0 }}>
                        {t('gradeStudent.label_modifier')}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 280 }}>
                        <select value={sr.globalModifier?.type ?? 'percentage'}
                            onChange={e => {
                                setSr(p => p ? { ...p, globalModifier: { type: e.target.value as Modifier['type'], value: p.globalModifier?.value ?? 0, reason: p.globalModifier?.reason ?? '' } } : p);
                                setIsDirty(true);
                            }}
                            style={{ width: 110 }}>
                            <option value="percentage">{t('gradeStudent.offset_percentage')}</option>
                            <option value="points">{t('gradeStudent.offset_points')}</option>
                        </select>
                        <input type="number" value={sr.globalModifier?.value ?? 0}
                            onChange={e => {
                                setSr(p => p ? { ...p, globalModifier: { type: p.globalModifier?.type ?? 'percentage', value: Number(e.target.value), reason: p.globalModifier?.reason ?? '' } } : p);
                                setIsDirty(true);
                            }}
                            style={{ width: 60 }} />
                        <input type="text" placeholder={t('gradeStudent.modifier_reason_placeholder') || 'Reason'} value={sr.globalModifier?.reason ?? ''}
                            onChange={e => {
                                setSr(p => p ? { ...p, globalModifier: { type: p.globalModifier?.type ?? 'percentage', value: p.globalModifier?.value ?? 0, reason: e.target.value } } : p);
                                setIsDirty(true);
                            }}
                            style={{ flex: 1, minWidth: 80 }} />
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={handleExportPdf} style={{ flexShrink: 0 }}>
                        <FileDown size={14} /> Export PDF
                    </button>
                </div>

                {/* Rubric — card per criterion */}
                <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: fmt.fontFamily, fontSize: fmt.fontSize }}>
                    {rubric.criteria.map(c => {
                        const entry = sr.entries.find(e => e.criterionId === c.id)!;
                        const levels = orderedLevels(c);

                        return (
                            <div key={c.id} className="card" style={{ padding: 16 }}>
                                {/* Criterion header */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.title}</div>
                                        {c.description && <div style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 2 }}>{c.description}</div>}
                                        {c.linkedStandard && (
                                            <div style={{ marginTop: 4, fontSize: '0.72em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }} title={c.linkedStandard.description}>
                                                <Info size={10} /> {c.linkedStandard.statementNotation ?? t('gradeStudent.label_standard')}
                                            </div>
                                        )}
                                        {(c.linkedStandards || []).map((std, idx) => (
                                            <div key={idx} style={{ marginTop: 4, fontSize: '0.72em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }} title={std.description}>
                                                <Info size={10} /> {std.statementNotation ?? t('gradeStudent.label_standard')}
                                            </div>
                                        ))}
                                        {entry.overridePoints !== undefined && (
                                            <div style={{ fontSize: '0.75em', color: 'var(--yellow)', marginTop: 3 }}>
                                                {t('gradeStudent.label_override')} {entry.overridePoints}{t('gradeStudent.table_points')}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                        {fmt.showWeights && <span className="badge badge-blue">{c.weight}%</span>}
                                        <button className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() => setActiveCommentCrit(activeCommentCrit === c.id ? null : c.id)}
                                            style={{ color: entry.comment ? 'var(--accent)' : 'var(--text-dim)' }}
                                            title={t('gradeStudent.comment_open_bank')}>
                                            <MessageSquare size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* Level cards */}
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {levels.map(level => {
                                        const isSelected = entry.levelId === level.id;
                                        return (
                                            <button key={level.id}
                                                className={`level-btn${isSelected ? ' selected' : ''}`}
                                                style={isSelected ? { borderColor: fmt.accentColor, background: `${fmt.accentColor}1a` } : {}}
                                                onClick={() => updateEntry(c.id, { levelId: isSelected ? null : level.id, overridePoints: undefined })}
                                            >
                                                {/* Label + points badge */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 6 }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.88em', color: isSelected ? fmt.accentColor : 'var(--text)' }}>{level.label}</span>
                                                    {fmt.showPoints && (
                                                        <span style={{ fontSize: '0.72em', color: isSelected ? fmt.accentColor : 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
                                                            {level.minPoints === level.maxPoints ? `${level.minPoints}${t('gradeStudent.table_points')}` : `${level.minPoints}–${level.maxPoints}${t('gradeStudent.table_points')}`}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Description */}
                                                {level.description
                                                    ? <p style={{ margin: 0, fontSize: '0.8em', color: isSelected ? 'var(--text)' : 'var(--text-muted)', lineHeight: 1.45 }}>{level.description}</p>
                                                    : <p style={{ margin: 0, fontSize: '0.8em', color: 'var(--text-dim)', fontStyle: 'italic' }}>{t('gradeStudent.level_select')}</p>
                                                }
                                                {/* Sub-items */}
                                                {level.subItems.length > 0 && (
                                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${isSelected ? fmt.accentColor + '40' : 'var(--border)'}` }} onClick={e => e.stopPropagation()}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                            {level.subItems.map(si => {
                                                                const legacyChecked = (entry.checkedSubItems ?? []).includes(si.id);
                                                                const defaultScore = legacyChecked ? (si.maxPoints ?? si.points ?? 0) : (si.minPoints ?? 0);
                                                                const currentScore = entry.subItemScores?.[si.id] ?? defaultScore;
                                                                const min = si.minPoints ?? 0;
                                                                const max = si.maxPoints ?? si.points ?? 1;
                                                                return (
                                                                    <div key={si.id} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75em', lineHeight: 1.3 }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                                                            <div style={{ paddingRight: 8 }}>{si.label}</div>
                                                                            <div style={{ fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{currentScore} / {max} {t('gradeStudent.table_points')}</div>
                                                                        </div>
                                                                        <input type="range" min={min} max={max} step={0.5} value={currentScore}
                                                                            onChange={e => setSubItemScore(entry, si.id, Number(e.target.value))}
                                                                            style={{ width: '100%', cursor: 'pointer', height: 4, accentColor: fmt.accentColor }} />
                                                                        {si.linkedStandards && si.linkedStandards.length > 0 && (
                                                                            <div style={{ color: 'var(--accent)', opacity: 0.8, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                                                                {si.linkedStandards.map((std, idx) => (
                                                                                    <span key={idx} title={std.description}>[{std.statementNotation ?? std.guid}]</span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Base-points range slider (selected only, when range exists) */}
                                                {isSelected && (level.minPoints !== level.maxPoints || level.subItems.length === 0) && (
                                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${fmt.accentColor}30` }} onClick={e => e.stopPropagation()}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            <label style={{ fontSize: '0.7em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                                {c.levels.some(l => l.subItems.length > 0) ? t('gradeStudent.label_base_points') : t('gradeStudent.label_points')}
                                                            </label>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <input type="range"
                                                                    min={level.minPoints} max={level.maxPoints} step={0.5}
                                                                    value={entry.selectedPoints ?? level.minPoints}
                                                                    onChange={e => updateEntry(c.id, { selectedPoints: Number(e.target.value) })}
                                                                    style={{ flex: 1, accentColor: fmt.accentColor }} />
                                                                <div style={{ fontSize: '0.75em', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
                                                                    {entry.selectedPoints ?? level.minPoints}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Inline comment editor */}
                                {activeCommentCrit === c.id && (
                                    <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <TiptapEditor
                                                    content={entry.comment || ''}
                                                    onChange={html => updateEntry(c.id, { comment: html })}
                                                    placeholder={t('gradeStudent.comment_placeholder')}
                                                />
                                            </div>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setShowCommentBankFor(c.id)} title={t('gradeStudent.comment_open_bank')}>
                                                <BookOpen size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Overall comment */}
                <div className="card">
                    <div className="form-group">
                        <label>{t('gradeStudent.overall_comment_label')}</label>
                        <TiptapEditor 
                            content={sr.overallComment}
                            onChange={html => {
                                setSr(p => p ? { ...p, overallComment: html } : p);
                                setIsDirty(true);
                            }}
                            placeholder={t('gradeStudent.overall_comment_placeholder')}
                        />
                    </div>
                </div>

                {/* Attachments panel */}
                {showAttachPanel && (
                    <div className="card" style={{ marginTop: 16 }}>
                        <h3>{t('gradeStudent.attachments_title')}</h3>
                        <div style={{ marginTop: 16 }}>
                            {rubricAttachments.map(att => (
                                <AttachmentViewer key={att.id} attachment={att} />
                            ))}
                        </div>
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

            {/* Sticky grade footer */}
            {summary && rubric.format.showCalculatedGrade !== false && (
                <div className="grade-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                        <span className="grade-chip" style={{ background: `${summary.gradeColor}22`, border: `2px solid ${summary.gradeColor}`, color: summary.gradeColor }}>
                            {summary.letterGrade}
                        </span>
                        <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>{summary.modifiedPercentage.toFixed(1)}%</span>
                        <span className="text-muted text-sm">{summary.rawScore} / {summary.configuredMaxPoints} {t('gradeStudent.table_points')}</span>
                        <span className="text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {summary.gradedCount}/{summary.totalCriteria} {t('gradeStudent.table_criterion').toLowerCase()}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {nextStudent && (
                            <button className="btn btn-secondary btn-sm" onClick={handleSaveAndNext}>
                                <Save size={14} /> <ChevronRight size={14} /> {nextStudent.name.split(' ')[0]}
                            </button>
                        )}
                        <button className={`btn btn-sm ${saved ? 'btn-success' : 'btn-primary'}`} onClick={handleSave}>
                            <Save size={14} /> {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
