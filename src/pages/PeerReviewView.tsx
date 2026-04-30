import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Save, AlertCircle, FileText, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import type { StudentRubric, ScoreEntry } from '../types';
import Topbar from '../components/Layout/Topbar';
import TiptapEditor from '../components/Editor/TiptapEditor';

export default function PeerReviewView() {
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { rubrics, students, peerReviews, savePeerReview } = useApp();

    const [rubric, setRubric] = useState(rubrics.find(r => r.id === rubricId));
    const [student, setStudent] = useState(students.find(s => s.id === studentId));
    const [entry, setEntry] = useState<StudentRubric | null>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        if (!rubric || !student) return;

        // Find existing or create new
        const existing = peerReviews.find(pr => pr.rubricId === rubricId && pr.studentId === studentId);
        if (existing) {
            setEntry({ ...existing });
        } else {
            const initialEntries: ScoreEntry[] = (rubric.criteria ?? []).map(c => ({
                criterionId: c.id,
                levelId: null,
                comment: '',
                checkedSubItems: [],
            }));
            setEntry({
                id: nanoid(),
                rubricId: rubricId!,
                studentId: studentId!,
                entries: initialEntries,
                overallComment: '',
                isPeerReview: true,
            });
        }
    }, [rubricId, studentId, rubric, student, peerReviews]);

    if (!rubric || !student || !entry) {
        return (
            <div className="page-content center">
                <div className="text-center">
                    <AlertCircle size={48} className="text-muted" style={{ marginBottom: 16 }} />
                    <h3>{t('gradeStudent.error_not_found')}</h3>
                    <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
                        {t('gradeStudent.action_back')}
                    </button>
                </div>
            </div>
        );
    }

    const handleSave = () => {
        savePeerReview(entry);
        setIsSaved(true);
        setIsDirty(false);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const updateScore = (criterionId: string, levelId: string) => {
        setIsDirty(true);
        setEntry(prev => {
            if (!prev) return null;
            return {
                ...prev,
                entries: prev.entries.map(e => e.criterionId === criterionId ? { ...e, levelId } : e)
            };
        });
    };

    const updateComment = (criterionId: string, comment: string) => {
        setIsDirty(true);
        setEntry(prev => {
            if (!prev) return null;
            return {
                ...prev,
                entries: prev.entries.map(e => e.criterionId === criterionId ? { ...e, comment } : e)
            };
        });
    };

    return (
        <>
            <Topbar 
                title={`${t('rubricList.grade_students')} - ${student.name}`} 
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={`btn ${isSaved ? 'btn-success' : 'btn-primary'}`} onClick={handleSave}>
                            <Save size={18} /> {isSaved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </div>
                }
            />

            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <FileText size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ margin: 0 }}>{rubric.name}</h2>
                    </div>
                    <p className="text-muted text-sm">{rubric.description}</p>
                </div>

                {rubric.criteria.map(criterion => {
                    const score = entry.entries.find(e => e.criterionId === criterion.id);
                    return (
                        <div key={criterion.id} className="card" style={{ marginBottom: 20 }}>
                            <div style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 4px 0' }}>{criterion.title}</h3>
                                {criterion.description && <p className="text-muted text-xs">{criterion.description}</p>}
                            </div>

                            <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                                {criterion.levels.map(level => (
                                    <div 
                                        key={level.id}
                                        className={`card selectable ${score?.levelId === level.id ? 'active' : ''}`}
                                        onClick={() => updateScore(criterion.id, level.id)}
                                        style={{ 
                                            padding: 12, 
                                            cursor: 'pointer',
                                            border: score?.levelId === level.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                                            background: score?.levelId === level.id ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>{level.label}</div>
                                        <div className="text-muted text-xs">{level.description}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="form-group">
                                <label className="text-xs">{t('gradeStudent.comment_placeholder')}</label>
                                <TiptapEditor 
                                    content={score?.comment || ''}
                                    onChange={html => updateComment(criterion.id, html)}
                                    placeholder={t('gradeStudent.comment_placeholder')}
                                />
                            </div>
                        </div>
                    );
                })}

                <div className="card">
                    <h3 style={{ marginBottom: 16 }}>{t('gradeStudent.overall_comment_label')}</h3>
                    <TiptapEditor 
                        content={entry.overallComment}
                        onChange={html => setEntry(prev => prev ? { ...prev, overallComment: html } : null)}
                        placeholder={t('gradeStudent.overall_comment_placeholder')}
                    />
                </div>
            </div>
        </>
    );
}
