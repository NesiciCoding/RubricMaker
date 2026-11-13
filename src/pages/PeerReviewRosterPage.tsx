import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BarChart3, FileText, Search, UserRoundCheck } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import { useAssessment, useAuthoring, useClasses, useStudents } from '../context/AppContext';
import { useRubricPool } from '../hooks/useMaterialPool';
import { studentsForRubric } from '../utils/rubricRoster';

/**
 * Class-level entry into peer review: the rubric roster with who has reviewed whom and in which
 * round, so a whole class no longer means one student-profile visit per student.
 */
export default function PeerReviewRosterPage() {
    const { rubricId } = useParams<{ rubricId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { students } = useStudents();
    const { classes } = useClasses();
    const { rubrics: ownRubrics } = useAuthoring();
    const { peerReviews } = useAssessment();
    const { rubrics } = useRubricPool(ownRubrics);

    const [search, setSearch] = useState('');

    const rubric = rubrics.find((r) => r.id === rubricId);

    const roster = useMemo(
        () => (rubricId ? studentsForRubric(rubricId, students, classes) : []),
        [rubricId, students, classes]
    );
    const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
    const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

    const reviewsByReviewee = useMemo(() => {
        const map = new Map<string, typeof peerReviews>();
        for (const pr of peerReviews) {
            if (pr.rubricId !== rubricId) continue;
            const list = map.get(pr.studentId) ?? [];
            list.push(pr);
            map.set(pr.studentId, list);
        }
        return map;
    }, [peerReviews, rubricId]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return roster;
        return roster.filter((s) => s.name.toLowerCase().includes(q));
    }, [roster, search]);

    if (!rubric) {
        return (
            <>
                <Topbar title={t('peerReviewRoster.not_found_title')} />
                <div className="page-content">
                    <EmptyState
                        icon={FileText}
                        title={t('peerReviewRoster.not_found_title')}
                        description={t('peerReviewRoster.not_found_hint')}
                        action={{
                            label: t('rubricQueue.back_to_rubrics'),
                            icon: ArrowLeft,
                            onClick: () => navigate('/rubrics'),
                        }}
                    />
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('peerReviewRoster.title', { name: rubric.name })}
                actions={
                    <>
                        <Link to={`/rubrics/${rubric.id}`} className="btn btn-ghost btn-sm">
                            <ArrowLeft size={15} /> {t('rubricQueue.back_to_rubric')}
                        </Link>
                        <Link to={`/rubrics/${rubric.id}/grade`} className="btn btn-ghost btn-sm">
                            <UserRoundCheck size={15} /> {t('rubricQueue.title_short')}
                        </Link>
                        <Link to={`/peer-analytics/${rubric.id}`} className="btn btn-secondary btn-sm">
                            <BarChart3 size={15} /> {t('peerReview.view_analytics')}
                        </Link>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div style={{ position: 'relative', maxWidth: 360, marginBottom: 16 }}>
                    <Search
                        size={15}
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-dim)',
                        }}
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('rubricQueue.search')}
                        aria-label={t('rubricQueue.search')}
                        style={{ paddingLeft: 36, width: '100%' }}
                    />
                </div>

                {roster.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title={t('rubricQueue.no_students')}
                        description={t('rubricQueue.no_students_hint')}
                    />
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('rubricQueue.col_student')}</th>
                                    <th scope="col">{t('rubricQueue.col_class')}</th>
                                    <th scope="col">{t('peerReviewRoster.col_rounds')}</th>
                                    <th scope="col">{t('peerReviewRoster.col_reviewers')}</th>
                                    <th scope="col">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((s) => {
                                    const reviews = reviewsByReviewee.get(s.id) ?? [];
                                    const rounds = [...new Set(reviews.map((pr) => pr.round ?? 1))].sort(
                                        (a, b) => a - b
                                    );
                                    const reviewers = [...new Set(reviews.map((pr) => pr.gradedBy ?? pr.studentId))];
                                    return (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 500 }}>{s.name}</td>
                                            <td className="text-muted text-sm">
                                                {classById.get(s.classId ?? '')?.name ?? '—'}
                                            </td>
                                            <td>
                                                {rounds.length === 0 ? (
                                                    <span className="text-muted text-sm">—</span>
                                                ) : (
                                                    <span className="text-sm">
                                                        {rounds.map((n) => t('peerReview.round_n', { n })).join(', ')}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                {reviewers.length === 0 ? (
                                                    <span className="text-muted text-sm">
                                                        {t('peerReviewRoster.no_reviews')}
                                                    </span>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {reviewers.map((rid) => (
                                                            <Link
                                                                key={rid}
                                                                to={`/rubrics/${rubric.id}/peer-review/${s.id}?reviewerId=${rid}`}
                                                                className="badge badge-blue"
                                                                style={{ textDecoration: 'none' }}
                                                            >
                                                                {studentById.get(rid)?.name ??
                                                                    t('peerAnalytics.anonymous_reviewer')}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <Link
                                                    to={`/rubrics/${rubric.id}/peer-review/${s.id}`}
                                                    className="btn btn-secondary btn-sm"
                                                >
                                                    {t('peerReviewRoster.action_open')}
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}
