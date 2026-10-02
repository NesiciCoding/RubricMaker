import { useTranslation } from 'react-i18next';
import { criterionMaxPoints } from '../../utils/gradeCalc';
import { rubricAnswerPoints, rubricTaskPercentage } from '../../utils/rubricTaskScoring';
import type { Rubric, ScoreEntry } from '../../types';

interface Props {
    rubric: Rubric;
    entries: ScoreEntry[];
    questionPoints: number;
    onChange: (entries: ScoreEntry[]) => void;
    readOnly?: boolean;
}

/** Compact per-criterion scoring for a rubric-graded test answer; the rubric % maps onto the question's points. */
export default function RubricTaskScorer({ rubric, entries, questionPoints, onChange, readOnly = false }: Props) {
    const { t } = useTranslation();
    const entryFor = (criterionId: string): ScoreEntry =>
        entries.find((e) => e.criterionId === criterionId) ?? {
            criterionId,
            levelId: null,
            checkedSubItems: [],
            comment: '',
        };
    const patch = (criterionId: string, change: Partial<ScoreEntry>) => {
        const next = rubric.criteria.map((c) => {
            const current = entryFor(c.id);
            return c.id === criterionId ? { ...current, ...change } : current;
        });
        onChange(next);
    };
    const complete =
        rubric.criteria.length > 0 &&
        rubric.criteria.every((c) => {
            const entry = entryFor(c.id);
            return entry.levelId !== null || entry.overridePoints !== undefined;
        });

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 10,
                border: '1px solid var(--border)',
                borderRadius: 8,
                flex: '1 1 100%',
            }}
        >
            <strong style={{ fontSize: '0.85rem' }}>
                {t('tests.results.rubric_scoring_title', { name: rubric.name })}
            </strong>
            {rubric.criteria.map((criterion) => {
                const entry = entryFor(criterion.id);
                return (
                    <div key={criterion.id} role="group" aria-label={criterion.title}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>{criterion.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {criterion.levels.map((level) => (
                                <button
                                    key={level.id}
                                    type="button"
                                    className={`btn btn-sm ${entry.levelId === level.id ? 'btn-primary' : 'btn-secondary'}`}
                                    aria-pressed={entry.levelId === level.id}
                                    disabled={readOnly}
                                    title={level.description}
                                    onClick={() =>
                                        patch(criterion.id, { levelId: level.id, overridePoints: undefined })
                                    }
                                >
                                    {level.label}
                                    {level.cefrLevel ? ` (${level.cefrLevel})` : ''}
                                </button>
                            ))}
                            <input
                                type="number"
                                min={0}
                                max={criterionMaxPoints(criterion)}
                                step="any"
                                disabled={readOnly}
                                value={entry.overridePoints ?? ''}
                                aria-label={t('tests.results.rubric_override_points', { criterion: criterion.title })}
                                placeholder={t('tests.results.rubric_override_placeholder')}
                                onChange={(e) =>
                                    patch(criterion.id, {
                                        overridePoints: e.target.value === '' ? undefined : Number(e.target.value),
                                    })
                                }
                                style={{ width: 90 }}
                            />
                        </div>
                        <input
                            type="text"
                            disabled={readOnly}
                            value={entry.comment}
                            aria-label={t('tests.results.rubric_comment_label', { criterion: criterion.title })}
                            placeholder={t('tests.results.rubric_comment_placeholder')}
                            onChange={(e) => patch(criterion.id, { comment: e.target.value })}
                            style={{ width: '100%', marginTop: 4 }}
                        />
                    </div>
                );
            })}
            <div role="status" className="text-sm">
                {t('tests.results.rubric_total', {
                    percent: Math.round(rubricTaskPercentage(rubric, entries)),
                    points: rubricAnswerPoints(rubric, entries, questionPoints),
                    max: questionPoints,
                })}
                {!complete && <span className="text-muted"> — {t('tests.results.rubric_incomplete')}</span>}
            </div>
        </div>
    );
}
