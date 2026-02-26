import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Copy, BookOpen, Users, Upload, GitCompare } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { DEFAULT_FORMAT } from '../types';
import { nanoid } from '../utils/nanoid';
import ImportRubricModal from '../components/ImportRubricModal';
import type { ParsedRubric } from '../utils/rubricImport';

export default function RubricList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, students, studentRubrics, addRubric, deleteRubric, settings, gradeScales } = useApp();
    const [search, setSearch] = useState('');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [showImport, setShowImport] = useState(false);

    const uniqueSubjects = Array.from(new Set(rubrics.map(r => r.subject).filter(Boolean))).sort();

    const filtered = rubrics.filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.subject.toLowerCase().includes(search.toLowerCase());
        const matchesSubject = subjectFilter === 'all' || r.subject === subjectFilter;
        return matchesSearch && matchesSubject;
    });

    function handleDuplicate(rubricId: string) {
        const r = rubrics.find(x => x.id === rubricId);
        if (!r) return;
        addRubric({
            ...r,
            name: `${r.name} (Copy)`,
            criteria: r.criteria.map(c => ({ ...c, id: nanoid(), levels: c.levels.map(l => ({ ...l, id: nanoid() })) })),
            attachmentIds: [],
        });
    }

    function handleImport(parsed: ParsedRubric & { name: string; subject: string }) {
        const newR = addRubric({
            name: parsed.name || 'Imported Rubric',
            subject: parsed.subject || '',
            description: parsed.description || '',
            criteria: parsed.criteria,
            gradeScaleId: settings.defaultGradeScaleId,
            format: DEFAULT_FORMAT,
            scoringMode: 'weighted-percentage',
            totalMaxPoints: 100,
            attachmentIds: [],
        });
        setShowImport(false);
        navigate(`/rubrics/${newR.id}`);
    }

    return (
        <>
            <Topbar title={t('rubricList.title')} actions={
                <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
                        <Upload size={15} /> {t('rubricList.import_rubric')}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                        <Plus size={15} /> {t('rubricList.new_rubric')}
                    </button>
                </>
            } />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 400 }}>
                        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                        <input
                            type="text"
                            placeholder={t('rubricList.search_rubrics')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 36, width: '100%' }}
                        />
                    </div>
                    {uniqueSubjects.length > 0 && (
                        <select
                            value={subjectFilter}
                            onChange={e => setSubjectFilter(e.target.value)}
                            style={{ minWidth: 150 }}
                        >
                            <option value="all">{t('rubricList.all_subjects') || 'All Subjects'}</option>
                            {uniqueSubjects.map(subj => (
                                <option key={subj} value={subj}>{subj}</option>
                            ))}
                        </select>
                    )}
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <BookOpen size={40} />
                        <h3>{t('rubricList.no_rubrics')}</h3>
                        <p className="text-muted text-sm">{t('rubricList.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/rubrics/new')}>
                            <Plus size={16} /> {t('rubricList.create_rubric')}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                        {filtered.map(r => {
                            const gradedStudents = [...new Set(studentRubrics.filter(sr => sr.rubricId === r.id).map(sr => sr.studentId))];
                            return (
                                <div key={r.id} className="card" style={{ cursor: 'pointer', transition: 'border-color var(--transition)' }}
                                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <div>
                                            <h3>{r.name}</h3>
                                            {r.subject && <div className="text-muted text-xs" style={{ marginTop: 2 }}>{r.subject}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn btn-ghost btn-icon btn-sm" title={t('rubricList.action_duplicate')}
                                                onClick={e => { e.stopPropagation(); handleDuplicate(r.id); }}>
                                                <Copy size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon btn-sm" title={t('rubricList.action_edit')}
                                                onClick={e => { e.stopPropagation(); navigate(`/rubrics/${r.id}`); }}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-icon btn-sm" title={t('rubricList.action_delete')}
                                                style={{ color: 'var(--red)' }}
                                                onClick={e => { e.stopPropagation(); setConfirmDelete(r.id); }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span className="badge badge-blue">{r.criteria.length} {t('rubricList.criteria_count')}</span>
                                        <span className="badge badge-purple">{r.criteria[0]?.levels.length ?? 0} {t('rubricList.levels_count')}</span>
                                        <span className="badge badge-green">{gradedStudents.length} {t('rubricList.students_graded_count')}</span>
                                    </div>

                                    {r.description && (
                                        <p className="text-muted text-sm truncate" style={{ marginBottom: 14 }}>{r.description}</p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <button className="btn btn-primary btn-sm"
                                            onClick={() => navigate(`/rubrics/${r.id}`)}>
                                            <Edit2 size={14} /> {t('rubricList.edit_rubric')}
                                        </button>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button className="btn btn-secondary btn-sm" style={{ flex: '1 1 auto' }}
                                                onClick={() => navigate('/students')}>
                                                <Users size={14} /> {t('rubricList.grade_students')}
                                            </button>
                                            <button className="btn btn-secondary btn-sm compare-btn-tutorial" style={{ flex: '1 1 auto' }} title="Start Comparative Grading"
                                                onClick={() => navigate(`/grade-comparative/${settings.activeClassId || 'all'}/${r.id}`)}>
                                                <GitCompare size={14} /> Compare
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {confirmDelete && (
                    <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                        <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header"><h3>{t('rubricList.delete_rubric_title')}</h3></div>
                            <div className="modal-body">
                                <p>{t('rubricList.delete_rubric_warning')}</p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-danger" onClick={() => { deleteRubric(confirmDelete); setConfirmDelete(null); }}>
                                    <Trash2 size={14} /> {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showImport && (
                    <ImportRubricModal
                        onClose={() => setShowImport(false)}
                        onImport={handleImport}
                    />
                )}
            </div>
        </>
    );
}
