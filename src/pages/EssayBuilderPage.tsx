import React, { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Save, UserPlus, Upload, Radio, Copy, Check, X, FileText } from 'lucide-react';
import { nanoid } from '../utils/nanoid';
import Topbar from '../components/Layout/Topbar';
import Modal from '../components/ui/Modal';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import EssayAssignmentModal from '../components/Essay/EssayAssignmentModal';
import EssaySlipSheet from '../components/Essay/EssaySlipSheet';
import { encodeEssayAssignment } from '../utils/essayShareCode';
import { decodeEssaySubmission } from '../utils/essaySubmissionCode';
import type { EssayAssignment } from '../types';

export default function EssayBuilderPage() {
    const { teacherKey: teacherKeyParam } = useParams<{ teacherKey?: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { showToast } = useToast();
    const {
        essayAssignments,
        essaySubmissions,
        rubrics,
        classes,
        students,
        addEssayAssignments,
        updateEssayGroup,
        addEssaySubmission,
    } = useApp();

    const rows = useMemo(
        () => (teacherKeyParam ? essayAssignments.filter((a) => a.teacherKey === teacherKeyParam) : []),
        [essayAssignments, teacherKeyParam]
    );
    const notFound = !!teacherKeyParam && rows.length === 0;
    const existing = rows[0];

    const [title, setTitle] = useState(existing?.title ?? '');
    const [prompt, setPrompt] = useState(existing?.prompt ?? '');
    const [rubricId, setRubricId] = useState(existing?.rubricId ?? '');
    const [minWords, setMinWords] = useState(existing?.minWords ? String(existing.minWords) : '');
    const [maxWords, setMaxWords] = useState(existing?.maxWords ? String(existing.maxWords) : '');
    const [timeLimitMinutes, setTimeLimitMinutes] = useState(
        existing?.timeLimitMinutes ? String(existing.timeLimitMinutes) : ''
    );
    const [requireSEB, setRequireSEB] = useState(existing?.requireSEB ?? false);
    const [readOnlyAfterSubmit, setReadOnlyAfterSubmit] = useState(existing?.readOnlyAfterSubmit ?? true);
    const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ? existing.expiresAt.slice(0, 16) : '');

    const teacherKeyRef = useMemo(() => teacherKeyParam ?? nanoid(), [teacherKeyParam]);

    const [pickClassOpen, setPickClassOpen] = useState(false);
    const [assignTargets, setAssignTargets] = useState<{ id: string; name: string }[] | null>(null);
    const [slipSheetData, setSlipSheetData] = useState<{
        assignment: EssayAssignment;
        students: { id: string; name: string }[];
    } | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [importCode, setImportCode] = useState('');
    const [importError, setImportError] = useState('');
    const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);

    function buildPatch(): Partial<EssayAssignment> {
        return {
            title: title.trim(),
            prompt: prompt.trim() || undefined,
            rubricId,
            minWords: minWords ? parseInt(minWords, 10) : undefined,
            maxWords: maxWords ? parseInt(maxWords, 10) : undefined,
            timeLimitMinutes: timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : undefined,
            requireSEB,
            readOnlyAfterSubmit,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        };
    }

    const handleSave = useCallback(() => {
        if (!teacherKeyParam) return;
        updateEssayGroup(teacherKeyParam, buildPatch());
        showToast(t('essays.save'), 'success');
    }, [
        teacherKeyParam,
        title,
        prompt,
        rubricId,
        minWords,
        maxWords,
        timeLimitMinutes,
        requireSEB,
        readOnlyAfterSubmit,
        expiresAt,
    ]); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePickClass = useCallback(
        (classId: string) => {
            const classStudents = students
                .filter((s) => s.classId === classId)
                .map((s) => ({ id: s.id, name: s.name }));
            setAssignTargets(classStudents);
            setPickClassOpen(false);
        },
        [students]
    );

    const handleAssignToStudents = useCallback(
        (assignment: EssayAssignment, classStudents: { id: string; name: string }[]) => {
            if (teacherKeyParam) updateEssayGroup(teacherKeyParam, buildPatch());

            const alreadyAssigned = new Set(rows.map((r) => r.studentId));
            const newRows = classStudents
                .filter((s) => !alreadyAssigned.has(s.id))
                .map((s) => ({ ...assignment, studentId: s.id }));

            if (newRows.length === 0) {
                showToast(t('essays.no_new_students'), 'info');
                setAssignTargets(null);
                return;
            }

            addEssayAssignments(newRows);
            showToast(t('essays.assign_success'), 'success');
            setAssignTargets(null);

            if (!teacherKeyParam) {
                navigate(`/essays/${teacherKeyRef}`, { replace: true });
            }
        },
        [teacherKeyParam, rows, addEssayAssignments, navigate, teacherKeyRef] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const handleCopyLink = useCallback(
        (studentId: string) => {
            if (!existing) return;
            const code = encodeEssayAssignment({ ...existing, studentId });
            const url = `${window.location.origin}${window.location.pathname}#/essay/${code}`;
            navigator.clipboard.writeText(url).then(() => {
                setCopiedStudentId(studentId);
                setTimeout(() => setCopiedStudentId(null), 2500);
            });
        },
        [existing]
    );

    const handleImportSubmission = useCallback(() => {
        const result = decodeEssaySubmission(importCode.trim());
        if (!result) {
            setImportError(t('essays.import_error'));
            return;
        }
        if (result.teacherKey !== teacherKeyParam) {
            setImportError(t('essays.import_wrong_essay'));
            return;
        }
        addEssaySubmission(result);
        showToast(t('essays.import_success'), 'success');
        setImportOpen(false);
        setImportCode('');
        setImportError('');
    }, [importCode, teacherKeyParam, addEssaySubmission, t, showToast]);

    if (notFound) {
        return (
            <>
                <Topbar title={t('essays.builder_title_edit')} />
                <div className="page-content fade-in">
                    <div className="empty-state">
                        <FileText size={40} />
                        <h3>{t('essays.no_essays')}</h3>
                        <button className="btn btn-secondary" onClick={() => navigate('/essays')}>
                            <ArrowLeft size={16} /> {t('common.back')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const selectedRubric = rubrics.find((r) => r.id === rubricId);

    return (
        <>
            <Topbar
                title={existing ? t('essays.builder_title_edit') : t('essays.builder_title_new')}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/essays')}>
                            <ArrowLeft size={15} /> {t('common.back')}
                        </button>
                        {existing && (
                            <button className="btn btn-primary btn-sm" onClick={handleSave}>
                                <Save size={15} /> {t('essays.save')}
                            </button>
                        )}
                    </div>
                }
            />
            <div
                className="page-content fade-in"
                style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}
            >
                {/* 1. Prompt editor */}
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>{t('essays.prompt_editor_label')}</h3>
                    <div className="form-group">
                        <label className="form-label">{t('essays.title_label')}</label>
                        <input
                            type="text"
                            className="form-input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={t('essays.title_label')}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('essay_assignment.prompt_label')}</label>
                        <textarea
                            className="form-input"
                            rows={6}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            style={{ resize: 'vertical', fontFamily: 'inherit' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ flex: '1 1 140px' }}>
                            <label className="form-label">{t('essay_assignment.min_words_label')}</label>
                            <input
                                type="number"
                                min={0}
                                className="form-input"
                                value={minWords}
                                onChange={(e) => setMinWords(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ flex: '1 1 140px' }}>
                            <label className="form-label">{t('essay_assignment.max_words_label')}</label>
                            <input
                                type="number"
                                min={0}
                                className="form-input"
                                value={maxWords}
                                onChange={(e) => setMaxWords(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ flex: '1 1 140px' }}>
                            <label className="form-label">{t('essay_assignment.time_limit_label')}</label>
                            <input
                                type="number"
                                min={0}
                                className="form-input"
                                value={timeLimitMinutes}
                                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ flex: '1 1 200px' }}>
                            <label className="form-label">{t('essay_assignment.deadline_label')}</label>
                            <input
                                type="datetime-local"
                                className="form-input"
                                value={expiresAt}
                                onChange={(e) => setExpiresAt(e.target.value)}
                            />
                        </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <input type="checkbox" checked={requireSEB} onChange={(e) => setRequireSEB(e.target.checked)} />
                        {t('essay_assignment.require_seb_label')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <input
                            type="checkbox"
                            checked={readOnlyAfterSubmit}
                            onChange={(e) => setReadOnlyAfterSubmit(e.target.checked)}
                        />
                        {t('essay_assignment.lock_after_submit_label')}
                    </label>
                </div>

                {/* 2. Rubric connector */}
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>{t('essays.rubric_connector_label')}</h3>
                    <select className="form-input" value={rubricId} onChange={(e) => setRubricId(e.target.value)}>
                        <option value="">{t('essays.rubric_connector_placeholder')}</option>
                        {rubrics.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 3. Assign to students */}
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>{t('essays.assigned_students_title')}</h3>
                    {rows.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                            {rows.map((row) => {
                                const student = students.find((s) => s.id === row.studentId);
                                const submitted = essaySubmissions.some(
                                    (s) => s.teacherKey === row.teacherKey && s.assignmentStudentId === row.studentId
                                );
                                return (
                                    <div
                                        key={row.studentId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: 8,
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            background: 'var(--bg-elevated)',
                                        }}
                                    >
                                        <span>{student?.name ?? row.studentId}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className={`badge ${submitted ? 'badge-green' : 'badge-yellow'}`}>
                                                {submitted
                                                    ? t('essays.submission_status_submitted')
                                                    : t('essays.submission_status_pending')}
                                            </span>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('essays.copy_link')}
                                                aria-label={t('essays.copy_link')}
                                                onClick={() => handleCopyLink(row.studentId)}
                                            >
                                                {copiedStudentId === row.studentId ? (
                                                    <Check size={14} />
                                                ) : (
                                                    <Copy size={14} />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setPickClassOpen(true)}
                        disabled={!rubricId || !title.trim()}
                    >
                        <UserPlus size={15} /> {t('essays.assign_to_students')}
                    </button>
                </div>

                {/* 4 & 5. Import submission code + Monitor */}
                <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setImportOpen(true)}
                        disabled={!teacherKeyParam}
                    >
                        <Upload size={15} /> {t('essays.import_submission_code')}
                    </button>
                    {teacherKeyParam && (
                        <Link to={`/essays/${teacherKeyParam}/monitor`} className="btn btn-secondary btn-sm">
                            <Radio size={15} /> {t('essays.action_monitor')}
                        </Link>
                    )}
                </div>
            </div>

            {pickClassOpen && (
                <Modal titleId="essay-pick-class-title" onClose={() => setPickClassOpen(false)} maxWidth={420}>
                    <div style={{ padding: 20 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 12,
                            }}
                        >
                            <h2 id="essay-pick-class-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                {t('essays.pick_class_title')}
                            </h2>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => setPickClassOpen(false)}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {classes.map((c) => (
                                <button key={c.id} className="btn btn-secondary" onClick={() => handlePickClass(c.id)}>
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </Modal>
            )}

            {assignTargets && assignTargets.length > 0 && (
                <EssayAssignmentModal
                    rubricId={rubricId}
                    rubricName={selectedRubric?.name ?? ''}
                    studentId={assignTargets[0].id}
                    studentName={assignTargets[0].name}
                    classStudents={assignTargets}
                    teacherKey={teacherKeyRef}
                    initialValues={buildPatch()}
                    onClose={() => setAssignTargets(null)}
                    onOpenSlipSheet={(assignment, classStudents) =>
                        setSlipSheetData({ assignment, students: classStudents })
                    }
                    onAssignToStudents={handleAssignToStudents}
                />
            )}

            {slipSheetData && (
                <EssaySlipSheet
                    baseAssignment={slipSheetData.assignment}
                    students={slipSheetData.students}
                    onClose={() => setSlipSheetData(null)}
                />
            )}

            {importOpen && (
                <Modal titleId="essay-import-title" onClose={() => setImportOpen(false)} maxWidth={480}>
                    <div style={{ padding: 20 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 12,
                            }}
                        >
                            <h2 id="essay-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                {t('essays.import_submission_code')}
                            </h2>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => setImportOpen(false)}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('essays.import_code_label')}</label>
                            <textarea
                                className="form-input"
                                rows={4}
                                value={importCode}
                                onChange={(e) => {
                                    setImportCode(e.target.value);
                                    setImportError('');
                                }}
                                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                            />
                        </div>
                        {importError && <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{importError}</p>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setImportOpen(false)}>
                                {t('common.cancel')}
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleImportSubmission}
                                disabled={!importCode.trim()}
                            >
                                {t('essays.import_submission_code')}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
