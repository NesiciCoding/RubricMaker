import { useTranslation } from 'react-i18next';
import { usePortalFeedbackAudioSrc } from '../../hooks/usePortalFeedbackAudioSrc';
import type { Rubric, ScoreEntry } from '../../types';

function CriterionAudio({
    studentRubricId,
    entry,
    criterionTitle,
}: {
    studentRubricId: string;
    entry: ScoreEntry;
    criterionTitle: string;
}) {
    const { t } = useTranslation();
    const src = usePortalFeedbackAudioSrc(studentRubricId, entry);
    if (!src) return null;
    return (
        <audio
            controls
            src={src}
            aria-label={t('sharedFeedback.audio_feedback_for', { criterion: criterionTitle })}
            style={{ width: '100%', height: 32, marginTop: 6 }}
        />
    );
}

/**
 * Per-criterion feedback on a portal grade card: the level reached (with its description), the
 * teacher's comment and voice feedback — the same information as the /feedback share page (#622).
 */
export function PortalCriterionFeedback({
    rubric,
    entries,
    studentRubricId,
}: {
    rubric: Pick<Rubric, 'criteria'>;
    entries: ScoreEntry[];
    studentRubricId: string;
}) {
    const { t } = useTranslation();
    const rows = rubric.criteria
        .map((criterion) => {
            const entry = entries.find((e) => e.criterionId === criterion.id);
            const level = criterion.levels.find((l) => l.id === entry?.levelId);
            return { criterion, entry, level };
        })
        .filter(({ entry, level }) => level || entry?.comment || entry?.audioDataUrl || entry?.audioStoragePath);
    if (rows.length === 0) return null;

    return (
        <ul
            style={{
                listStyle: 'none',
                margin: '10px 0 0',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
            }}
        >
            {rows.map(({ criterion, entry, level }) => (
                <li
                    key={criterion.id}
                    style={{
                        fontSize: '0.82rem',
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        borderRadius: 6,
                        borderInlineStart: '3px solid var(--accent)',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{criterion.title}</span>
                        {level && (
                            <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
                                {t('sharedFeedback.your_level')}: {level.label}
                            </span>
                        )}
                    </div>
                    {level?.description && (
                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{level.description}</div>
                    )}
                    {entry?.comment && <div style={{ marginTop: 4 }}>{entry.comment}</div>}
                    {entry && (
                        <CriterionAudio
                            studentRubricId={studentRubricId}
                            entry={entry}
                            criterionTitle={criterion.title}
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}
