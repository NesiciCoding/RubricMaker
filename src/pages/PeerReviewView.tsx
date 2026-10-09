import React, { useState, useEffect, useRef } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Save, AlertCircle, FileText, BarChart3 } from 'lucide-react';
import { useAssessment, useAuthoring, useStudents } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import type { StudentRubric, ScoreEntry } from '../types';
import Topbar from '../components/Layout/Topbar';
import TiptapEditor from '../components/Editor/TiptapEditor';
import { useConfirm } from '../hooks/useConfirm';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export default function PeerReviewView() {
    const { rubricId, studentId } = useParams();
    const [searchParams] = useSearchParams();
    // The reviewer arrives via ?reviewerId= when a peer reviews someone else;
    // without it the review is a self-review by the route student.
    const reviewerId = searchParams.get('reviewerId') ?? studentId;
    const navigate = useNavigate();
    const { t } = useTranslation();
    const tour = usePageTourState('peerreview');
    const { students } = useStudents();

    const { rubrics } = useAuthoring();
    const { peerReviews, savePeerReview } = useAssessment();

    const { confirm, dialogProps: confirmDialogProps } = useConfirm();

    const [rubric] = useState(rubrics.find((r) => r.id === rubricId));
    const [student] = useState(students.find((s) => s.id === studentId));
    const [entry, setEntry] = useState<StudentRubric | null>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const { dialogProps: unsavedDialogProps } = useUnsavedChangesGuard(isDirty);
    const [activeRound, setActiveRound] = useState(1);
    const loadedKeyRef = useRef<string | null>(null);

    const existingRounds = peerReviews.filter((pr) => pr.rubricId === rubricId && pr.studentId === studentId);
    const maxRound = existingRounds.reduce((max, pr) => Math.max(max, pr.round ?? 1), 0);

    useEffect(() => {
        if (!rubric || !student) return;

        const existing = peerReviews.find(
            (pr) =>
                pr.rubricId === rubricId &&
                pr.studentId === studentId &&
                (pr.round ?? 1) === activeRound &&
                (pr.gradedBy ?? pr.studentId) === reviewerId
        );
        // Re-seed only when the review being shown changes. A peerReviews update for the same
        // review (another round saved, a sync) must not wipe edits or regenerate a blank draft.
        const key = `${rubricId}|${studentId}|${activeRound}|${reviewerId}`;
        if (loadedKeyRef.current === key && (isDirty || !existing)) return;
        if (loadedKeyRef.current !== key) setIsDirty(false);
        loadedKeyRef.current = key;
        if (existing) {
            setEntry({ ...existing });
        } else {
            /* v8 ignore next -- provably dead: rendering below requires rubric.criteria to exist */
            const initialEntries: ScoreEntry[] = (rubric.criteria ?? []).map((c) => ({
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
                round: activeRound,
                gradedBy: reviewerId,
            });
        }
    }, [rubricId, studentId, rubric, student, peerReviews, activeRound, reviewerId, isDirty]);

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
        savePeerReview({ ...entry, round: activeRound, gradedBy: reviewerId });
        setIsSaved(true);
        setIsDirty(false);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const confirmDiscardUnsaved = () =>
        confirm({
            title: t('peerReview.unsaved_round_switch_title'),
            message: t('peerReview.unsaved_round_switch_message'),
        });

    const addRound = async () => {
        if (isDirty && !(await confirmDiscardUnsaved())) return;
        setActiveRound(Math.max(maxRound, activeRound) + 1);
    };

    const updateScore = (criterionId: string, levelId: string) => {
        setIsDirty(true);
        setEntry((prev) => {
            /* v8 ignore next -- provably dead: entry is never null once the form renders */
            if (!prev) return null;
            return {
                ...prev,
                entries: prev.entries.map((e) => (e.criterionId === criterionId ? { ...e, levelId } : e)),
            };
        });
    };

    const updateComment = (criterionId: string, comment: string) => {
        setIsDirty(true);
        setEntry((prev) => {
            /* v8 ignore next -- provably dead: entry is never null once the form renders */
            if (!prev) return null;
            return {
                ...prev,
                entries: prev.entries.map((e) => (e.criterionId === criterionId ? { ...e, comment } : e)),
            };
        });
    };

    const handleOverallCommentChange = (html: string) => {
        setIsDirty(true);
        /* v8 ignore next -- provably dead: entry is never null once the form renders */
        setEntry((prev) => (prev ? { ...prev, overallComment: html } : null));
    };

    const reviewer = students.find((s) => s.id === reviewerId);
    const title =
        reviewerId === studentId
            ? t('peerReview.title_self', { name: student.name })
            : t('peerReview.title_peer', { reviewer: reviewer?.name ?? reviewerId, reviewed: student.name });

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={title}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                            {t('tutorial.page_tour_button')}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => navigate(`/peer-analytics/${rubricId}`)}
                            title={t('peerReview.view_analytics')}
                        >
                            <BarChart3 size={18} /> {t('peerReview.view_analytics')}
                        </button>
                        <button className={`btn ${isSaved ? 'btn-success' : 'btn-primary'}`} onClick={handleSave}>
                            <Save size={18} />{' '}
                            {isSaved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </div>
                }
            />

            <div className="page-content fade-in">
                <div data-tour="pr-header" className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <FileText size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ margin: 0 }}>{rubric.name}</h2>
                    </div>
                    <p className="text-muted text-sm">{rubric.description}</p>
                    {/* Round selector */}
                    <div
                        data-tour="pr-rounds"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 14,
                            paddingTop: 14,
                            borderTop: '1px solid var(--border)',
                        }}
                    >
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                            {t('peerReview.round_label')}:
                        </span>
                        {Array.from({ length: Math.max(maxRound, activeRound) }, (_, i) => i + 1).map((round) => (
                            <button
                                key={round}
                                className={`btn ${activeRound === round ? 'btn-primary' : 'btn-secondary'}`}
                                aria-pressed={activeRound === round}
                                onClick={async () => {
                                    if (round === activeRound || (isDirty && !(await confirmDiscardUnsaved()))) return;
                                    setActiveRound(round);
                                }}
                            >
                                {t('peerReview.round_n', { n: round })}
                            </button>
                        ))}
                        <button className="btn btn-ghost btn-sm" onClick={addRound}>
                            + {t('peerReview.add_round')}
                        </button>
                    </div>
                </div>

                {rubric.criteria.map((criterion) => {
                    const score = entry.entries.find((e) => e.criterionId === criterion.id);
                    return (
                        <div key={criterion.id} className="card" style={{ marginBottom: 20 }}>
                            <div style={{ marginBottom: 16 }}>
                                <h3 style={{ margin: '0 0 4px 0' }}>{criterion.title}</h3>
                                {criterion.description && <p className="text-muted text-xs">{criterion.description}</p>}
                            </div>

                            <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                                {criterion.levels.map((level) => (
                                    <div
                                        key={level.id}
                                        className={`card selectable ${score?.levelId === level.id ? 'active' : ''}`}
                                        onClick={() => updateScore(criterion.id, level.id)}
                                        style={{
                                            padding: 12,
                                            cursor: 'pointer',
                                            border:
                                                score?.levelId === level.id
                                                    ? '2px solid var(--accent)'
                                                    : '1px solid var(--border)',
                                            background:
                                                score?.levelId === level.id
                                                    ? 'var(--accent-soft)'
                                                    : 'var(--bg-elevated)',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>
                                            {level.label}
                                        </div>
                                        <div className="text-muted text-xs">{level.description}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="form-group">
                                <label className="text-xs">{t('gradeStudent.comment_placeholder')}</label>
                                <TiptapEditor
                                    key={entry.id}
                                    content={score?.comment || ''}
                                    onChange={(html) => updateComment(criterion.id, html)}
                                    placeholder={t('gradeStudent.comment_placeholder')}
                                />
                            </div>
                        </div>
                    );
                })}

                <div className="card">
                    <h3 style={{ marginBottom: 16 }}>{t('gradeStudent.overall_comment_label')}</h3>
                    <TiptapEditor
                        key={entry.id}
                        content={entry.overallComment}
                        onChange={handleOverallCommentChange}
                        placeholder={t('gradeStudent.overall_comment_placeholder')}
                    />
                </div>
            </div>
            <ConfirmDialog {...confirmDialogProps} />
            <ConfirmDialog {...unsavedDialogProps} />
        </>
    );
}
