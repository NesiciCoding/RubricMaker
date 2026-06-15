import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Copy,
    BookOpen,
    Users,
    Upload,
    GitCompare,
    Share2,
    ClipboardPaste,
    Check,
    Layers,
    Eye,
    Users2,
    X,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import { storageSync } from '../services/database';
import { DEFAULT_FORMAT } from '../types';
import type { Rubric } from '../types';
import type { VoTrack, CefrLevel } from '../types';
import { VO_TRACKS, VO_TRACK_LABELS, VO_TRACK_COLORS, VO_TRACK_DEFAULT_CEFR } from '../data/voTracks';
import { CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import CefrBadge from '../components/CEFR/CefrBadge';
import { nanoid } from '../utils/nanoid';
import ImportRubricModal from '../components/Rubric/ImportRubricModal';
import type { ParsedRubric } from '../utils/rubricImport';
import { encodeRubricShareCode, decodeRubricShareCode } from '../utils/rubricImport';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';

export default function RubricList() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { rubrics, students, classes, studentRubrics, addRubric, deleteRubric, settings } = useApp();
    const [search, setSearch] = useState('');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const [showImport, setShowImport] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showCodeImport, setShowCodeImport] = useState(false);
    const [pastedCode, setPastedCode] = useState('');
    const [codeImportError, setCodeImportError] = useState<string | null>(null);
    const [differentiateId, setDifferentiateId] = useState<string | null>(null);
    const [diffTrack, setDiffTrack] = useState<VoTrack>('havo');
    const [diffCefr, setDiffCefr] = useState<CefrLevel>('B1');
    const [sharedWithMe, setSharedWithMe] = useState<Rubric[]>([]);
    const dbStatus = useDbStatus();

    // Rubric sharing flow (Supabase mode only)
    const [shareModal, setShareModal] = useState<{ rubricId: string; rubricName: string } | null>(null);
    const [shareEmail, setShareEmail] = useState('');
    const [shareMode, setShareMode] = useState<'read' | 'edit'>('read');
    const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'notfound'>('idle');
    const [shareErrorMsg, setShareErrorMsg] = useState('');
    const [shareList, setShareList] = useState<
        { userId: string; email?: string; displayName?: string; mode: 'read' | 'edit' }[]
    >([]);
    const [shareListLoading, setShareListLoading] = useState(false);

    async function openShareModal(rubricId: string, rubricName: string) {
        setShareModal({ rubricId, rubricName });
        setShareEmail('');
        setShareStatus('idle');
        setShareList([]);
        if (!dbStatus.isConnected) return;
        setShareListLoading(true);
        try {
            const list = await storageSync.adapter.fetchRubricShares(rubricId);
            setShareList(list);
        } catch {
            /* ignore */
        }
        setShareListLoading(false);
    }

    async function handleShare() {
        if (!shareModal || !shareEmail.trim()) return;
        setShareStatus('loading');
        try {
            const result = await storageSync.adapter.shareRubricWithEmail(
                shareModal.rubricId,
                shareEmail.trim(),
                shareMode
            );
            if (result.success) {
                setShareStatus('success');
                setShareEmail('');
                // Refresh list
                const list = await storageSync.adapter.fetchRubricShares(shareModal.rubricId);
                setShareList(list);
            } else if ((result as { notFound?: boolean }).notFound) {
                setShareStatus('notfound');
                setShareErrorMsg(shareEmail.trim());
            } else {
                setShareStatus('error');
                setShareErrorMsg(result.error ?? 'Unknown error');
            }
        } catch (e) {
            setShareStatus('error');
            setShareErrorMsg(String(e));
        }
    }

    async function handleUnshare(userId: string) {
        if (!shareModal) return;
        await storageSync.adapter.unshareRubric(shareModal.rubricId, userId);
        setShareList((prev) => prev.filter((s) => s.userId !== userId));
    }

    useEffect(() => {
        if (!dbStatus.isConnected) {
            setSharedWithMe([]);
            return;
        }
        storageSync.adapter.fetchSharedRubrics().then(setSharedWithMe);
    }, [dbStatus.isConnected]);

    function handleCopyShareCode(rubricId: string) {
        const rubric = rubrics.find((r) => r.id === rubricId);
        if (!rubric) return;
        navigator.clipboard.writeText(encodeRubricShareCode(rubric));
        setCopiedId(rubricId);
        setTimeout(() => setCopiedId(null), 2000);
    }

    function handleSharePreview(rubricId: string) {
        const rubric = rubrics.find((r) => r.id === rubricId);
        if (!rubric) return;
        const url = `${window.location.origin}${window.location.pathname}#/preview/${encodeRubricShareCode(rubric)}`;
        navigator.clipboard.writeText(url);
        setCopiedId('preview-' + rubricId);
        setTimeout(() => setCopiedId(null), 2000);
    }

    function handleImportFromCode() {
        try {
            const parsed = decodeRubricShareCode(pastedCode);
            const newR = addRubric({
                name: parsed.name || 'Imported Rubric',
                subject: parsed.subject || '',
                description: parsed.description || '',
                criteria: parsed.criteria,
                gradeScaleId: (parsed as any).gradeScaleId || settings.defaultGradeScaleId,
                format: (parsed as any).format || DEFAULT_FORMAT,
                scoringMode: (parsed as any).scoringMode || 'weighted-percentage',
                totalMaxPoints: (parsed as any).totalMaxPoints ?? 100,
                attachmentIds: [],
            });
            setShowCodeImport(false);
            setPastedCode('');
            setCodeImportError(null);
            navigate(`/rubrics/${newR.id}`);
        } catch {
            setCodeImportError('Invalid share code. Make sure you pasted the full code.');
        }
    }

    const uniqueSubjects = Array.from(new Set(rubrics.map((r) => r.subject).filter(Boolean))).sort();

    const filtered = rubrics.filter((r) => {
        const matchesSearch =
            r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.subject.toLowerCase().includes(search.toLowerCase());
        const matchesSubject = subjectFilter === 'all' || r.subject === subjectFilter;
        return matchesSearch && matchesSubject;
    });

    function openDifferentiate(rubricId: string) {
        const defaultTrack: VoTrack = 'havo';
        setDifferentiateId(rubricId);
        setDiffTrack(defaultTrack);
        setDiffCefr(VO_TRACK_DEFAULT_CEFR[defaultTrack]);
    }

    function handleDifferentiate() {
        const r = rubrics.find((x) => x.id === differentiateId);
        if (!r) return;
        const newR = addRubric({
            ...r,
            name: `${r.name} (${VO_TRACK_LABELS[diffTrack]})`,
            criteria: r.criteria.map((c) => ({
                ...c,
                id: nanoid(),
                levels: c.levels.map((l) => ({ ...l, id: nanoid() })),
            })),
            attachmentIds: [],
            cefrTargetLevel: diffCefr,
        });
        setDifferentiateId(null);
        navigate(`/rubrics/${newR.id}`);
    }

    function handleDuplicate(rubricId: string) {
        const r = rubrics.find((x) => x.id === rubricId);
        if (!r) return;
        addRubric({
            ...r,
            name: `${r.name} (Copy)`,
            criteria: r.criteria.map((c) => ({
                ...c,
                id: nanoid(),
                levels: c.levels.map((l) => ({ ...l, id: nanoid() })),
            })),
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
            <Topbar
                title={t('rubricList.title')}
                actions={
                    <>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                setShowCodeImport(true);
                                setPastedCode('');
                                setCodeImportError(null);
                            }}
                        >
                            <ClipboardPaste size={15} /> Import from code
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
                            <Upload size={15} /> {t('rubricList.import_rubric')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('/rubrics/new')}>
                            <Plus size={15} /> {t('rubricList.new_rubric')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 400 }}>
                        <Search
                            size={15}
                            style={{
                                position: 'absolute',
                                left: 12,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-dim)',
                            }}
                        />
                        <input
                            type="text"
                            placeholder={t('rubricList.search_rubrics')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: 36, width: '100%' }}
                        />
                    </div>
                    {uniqueSubjects.length > 0 && (
                        <select
                            value={subjectFilter}
                            onChange={(e) => setSubjectFilter(e.target.value)}
                            style={{ minWidth: 150 }}
                        >
                            <option value="all">{t('rubricList.all_subjects') || 'All Subjects'}</option>
                            {uniqueSubjects.map((subj) => (
                                <option key={subj} value={subj}>
                                    {subj}
                                </option>
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
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {filtered.map((r) => {
                            const gradedStudents = [
                                ...new Set(
                                    studentRubrics.filter((sr) => sr.rubricId === r.id).map((sr) => sr.studentId)
                                ),
                            ];
                            return (
                                <div
                                    key={r.id}
                                    className="card"
                                    style={{ cursor: 'pointer', transition: 'border-color var(--transition)' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 12,
                                        }}
                                    >
                                        <div>
                                            <h3>{r.name}</h3>
                                            {r.subject && (
                                                <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                                    {r.subject}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {dbStatus.isConnected && (
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    title={t('rubricList.action_share_colleague')}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openShareModal(r.id, r.name);
                                                    }}
                                                >
                                                    <Users2 size={14} />
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title="Copy share code (for other teachers)"
                                                style={{
                                                    color: copiedId === r.id ? 'var(--green, #22c55e)' : undefined,
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCopyShareCode(r.id);
                                                }}
                                            >
                                                {copiedId === r.id ? <Check size={14} /> : <Share2 size={14} />}
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title="Share preview with students (copy link)"
                                                style={{
                                                    color:
                                                        copiedId === 'preview-' + r.id
                                                            ? 'var(--green, #22c55e)'
                                                            : undefined,
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSharePreview(r.id);
                                                }}
                                            >
                                                {copiedId === 'preview-' + r.id ? (
                                                    <Check size={14} />
                                                ) : (
                                                    <Eye size={14} />
                                                )}
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('voTrack.differentiate_title')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openDifferentiate(r.id);
                                                }}
                                            >
                                                <Layers size={14} />
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('rubricList.action_duplicate')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDuplicate(r.id);
                                                }}
                                            >
                                                <Copy size={14} />
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('rubricList.action_edit')}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/rubrics/${r.id}`);
                                                }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('rubricList.action_delete')}
                                                style={{ color: 'var(--red)' }}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    const ok = await confirm({
                                                        title: t('rubricList.delete_rubric_title'),
                                                        message: t('rubricList.delete_rubric_warning'),
                                                        confirmLabel: t('common.delete'),
                                                    });
                                                    if (ok) deleteRubric(r.id);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span className="badge badge-blue">
                                            {r.criteria.length} {t('rubricList.criteria_count')}
                                        </span>
                                        <span className="badge badge-purple">
                                            {r.criteria[0]?.levels.length ?? 0} {t('rubricList.levels_count')}
                                        </span>
                                        <span className="badge badge-green">
                                            {gradedStudents.length} {t('rubricList.students_graded_count')}
                                        </span>
                                        {r.cefrTargetLevel && <CefrBadge level={r.cefrTargetLevel} size="sm" />}
                                    </div>

                                    {r.description && (
                                        <p className="text-muted text-sm truncate" style={{ marginBottom: 14 }}>
                                            {r.description}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => navigate(`/rubrics/${r.id}`)}
                                        >
                                            <Edit2 size={14} /> {t('rubricList.edit_rubric')}
                                        </button>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ flex: '1 1 auto' }}
                                                onClick={() => navigate('/students')}
                                            >
                                                <Users size={14} /> {t('rubricList.grade_students')}
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm compare-btn-tutorial"
                                                style={{ flex: '1 1 auto' }}
                                                title={
                                                    settings.activeClassId
                                                        ? 'Start Comparative Grading'
                                                        : "You'll choose a class on the next screen"
                                                }
                                                onClick={() => {
                                                    const activeClass = classes.find(
                                                        (c) => c.id === settings.activeClassId
                                                    );
                                                    navigate(
                                                        `/grade-comparative/${activeClass ? activeClass.id : 'all'}/${r.id}`
                                                    );
                                                }}
                                            >
                                                <GitCompare size={14} /> {t('rubricList.action_compare')}
                                            </button>
                                            {/* Speaking session launcher */}
                                            {(() => {
                                                const classStudents = settings.activeClassId
                                                    ? students.filter((s) => s.classId === settings.activeClassId)
                                                    : students;
                                                if (classStudents.length === 0) return null;
                                                return (
                                                    <div style={{ position: 'relative', flex: '1 1 auto' }}>
                                                        <select
                                                            value=""
                                                            onChange={(e) => {
                                                                if (e.target.value)
                                                                    navigate(`/speaking/${r.id}/${e.target.value}`);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                padding: '5px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid var(--border)',
                                                                background: 'var(--bg-elevated)',
                                                                color: 'var(--text)',
                                                                fontSize: '0.8rem',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            <option value="" disabled>
                                                                {t('rubricList.speaking_select_student')}
                                                            </option>
                                                            {classStudents.map((s) => (
                                                                <option key={s.id} value={s.id}>
                                                                    {s.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {sharedWithMe.length > 0 && (
                    <div style={{ marginTop: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Share2 size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                                {t('rubricList.shared_with_me')}
                            </h3>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sharedWithMe.map((r) => (
                                <div
                                    key={r.id}
                                    style={{
                                        padding: '12px 14px',
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 10,
                                        border: '1px solid var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => navigate(`/rubrics/${r.id}`)}
                                >
                                    <BookOpen
                                        size={16}
                                        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                                        aria-hidden="true"
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontWeight: 600,
                                                fontSize: '0.9rem',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {r.name}
                                        </div>
                                        {r.subject && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {r.subject}
                                            </div>
                                        )}
                                    </div>
                                    <span
                                        style={{
                                            fontSize: '0.7rem',
                                            padding: '2px 7px',
                                            borderRadius: 4,
                                            background: 'var(--accent-soft)',
                                            color: 'var(--accent)',
                                            fontWeight: 500,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {t('rubricList.shared_badge')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <ConfirmDialog {...confirmDialogProps} />

                {showImport && <ImportRubricModal onClose={() => setShowImport(false)} onImport={handleImport} />}

                {differentiateId && (
                    <div className="modal-overlay" onClick={() => setDifferentiateId(null)}>
                        <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Layers size={18} style={{ color: 'var(--accent)' }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 15 }}>
                                            {t('voTrack.differentiate_title')}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                            {t('voTrack.differentiate_subtitle')}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    aria-label={t('common.close')}
                                    onClick={() => setDifferentiateId(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <div
                                    style={{
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 8,
                                        padding: '10px 14px',
                                        marginBottom: 18,
                                        fontSize: 13,
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    <strong style={{ color: 'var(--text)' }}>
                                        {rubrics.find((r) => r.id === differentiateId)?.name}
                                    </strong>
                                </div>

                                <div className="form-group" style={{ marginBottom: 18 }}>
                                    <label>{t('voTrack.target_track')}</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                        {VO_TRACKS.map((track) => (
                                            <button
                                                key={track}
                                                className={`btn btn-sm ${diffTrack === track ? 'btn-primary' : 'btn-ghost'}`}
                                                style={
                                                    diffTrack !== track
                                                        ? {
                                                              borderColor: VO_TRACK_COLORS[track],
                                                              color: VO_TRACK_COLORS[track],
                                                          }
                                                        : {}
                                                }
                                                onClick={() => {
                                                    setDiffTrack(track);
                                                    setDiffCefr(VO_TRACK_DEFAULT_CEFR[track]);
                                                }}
                                            >
                                                {VO_TRACK_LABELS[track]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>{t('voTrack.suggested_cefr')}</label>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                        {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CefrLevel[]).map((level) => (
                                            <button
                                                key={level}
                                                className={`btn btn-sm ${diffCefr === level ? 'btn-primary' : 'btn-ghost'}`}
                                                style={
                                                    diffCefr !== level
                                                        ? {
                                                              borderColor: CEFR_LEVEL_COLORS[level],
                                                              color: CEFR_LEVEL_COLORS[level],
                                                          }
                                                        : {}
                                                }
                                                onClick={() => setDiffCefr(level)}
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                                        Variant will be named:{' '}
                                        <strong style={{ color: 'var(--text)' }}>
                                            {rubrics.find((r) => r.id === differentiateId)?.name} (
                                            {VO_TRACK_LABELS[diffTrack]})
                                        </strong>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDifferentiateId(null)}>
                                    {t('common.cancel')}
                                </button>
                                <button className="btn btn-primary" onClick={handleDifferentiate}>
                                    <Layers size={14} /> {t('voTrack.action_create')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showCodeImport && (
                    <div className="modal-overlay" onClick={() => setShowCodeImport(false)}>
                        <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ClipboardPaste size={18} /> Import from share code
                                </h3>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    aria-label={t('common.close')}
                                    onClick={() => setShowCodeImport(false)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 14, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Paste a share code that was copied from another RubricMaker instance.
                                </p>
                                <textarea
                                    autoFocus
                                    value={pastedCode}
                                    onChange={(e) => {
                                        setPastedCode(e.target.value);
                                        setCodeImportError(null);
                                    }}
                                    placeholder="Paste share code here…"
                                    style={{
                                        width: '100%',
                                        minHeight: 120,
                                        fontFamily: 'monospace',
                                        fontSize: '0.8rem',
                                        resize: 'vertical',
                                    }}
                                />
                                {codeImportError && (
                                    <div
                                        style={{
                                            marginTop: 10,
                                            color: 'var(--red)',
                                            fontSize: '0.875rem',
                                            background: 'var(--red-soft)',
                                            padding: '8px 12px',
                                            borderRadius: 6,
                                        }}
                                    >
                                        {codeImportError}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowCodeImport(false)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!pastedCode.trim()}
                                    onClick={handleImportFromCode}
                                >
                                    <Check size={15} /> Import rubric
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Share with colleague modal ── */}
            {shareModal && (
                <div
                    className="modal-overlay"
                    onClick={() => {
                        setShareModal(null);
                        setShareStatus('idle');
                    }}
                >
                    <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Users2 size={16} /> {t('rubricList.share_modal_title')}
                            </h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                aria-label={t('common.close')}
                                onClick={() => {
                                    setShareModal(null);
                                    setShareStatus('idle');
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                                {t('rubricList.share_modal_desc', { rubric: shareModal.rubricName })}
                            </p>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input
                                    type="email"
                                    placeholder={t('rubricList.share_email_placeholder')}
                                    value={shareEmail}
                                    onChange={(e) => {
                                        setShareEmail(e.target.value);
                                        setShareStatus('idle');
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                                    style={{ flex: 1 }}
                                    autoFocus
                                />
                                <select
                                    value={shareMode}
                                    onChange={(e) => setShareMode(e.target.value as 'read' | 'edit')}
                                    style={{ width: 100 }}
                                >
                                    <option value="read">{t('rubricList.share_mode_read')}</option>
                                    <option value="edit">{t('rubricList.share_mode_edit')}</option>
                                </select>
                            </div>
                            {shareStatus === 'success' && (
                                <p style={{ color: 'var(--green)', fontSize: '0.85rem', marginBottom: 8 }}>
                                    {t('rubricList.share_success')}
                                </p>
                            )}
                            {shareStatus === 'notfound' && (
                                <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 8 }}>
                                    {t('rubricList.share_notfound', { email: shareErrorMsg })}
                                </p>
                            )}
                            {shareStatus === 'error' && (
                                <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: 8 }}>
                                    {shareErrorMsg}
                                </p>
                            )}

                            {/* Current shares */}
                            {shareListLoading && <p className="text-muted text-sm">{t('admin.users_loading')}</p>}
                            {shareList.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <p
                                        className="text-xs text-muted"
                                        style={{ marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}
                                    >
                                        {t('rubricList.share_shared_with')}
                                    </p>
                                    {shareList.map((s) => (
                                        <div
                                            key={s.userId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '6px 0',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                        >
                                            <div style={{ flex: 1, fontSize: '0.875rem' }}>
                                                {s.email ?? s.displayName ?? s.userId}
                                            </div>
                                            <span className="badge">{s.mode}</span>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                aria-label={t('rubricList.action_unshare')}
                                                style={{ color: 'var(--red)' }}
                                                onClick={() => handleUnshare(s.userId)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShareModal(null);
                                    setShareStatus('idle');
                                }}
                            >
                                {t('common.close')}
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={!shareEmail.trim() || shareStatus === 'loading'}
                                onClick={handleShare}
                            >
                                <Users2 size={14} /> {shareStatus === 'loading' ? '…' : t('rubricList.share_btn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
