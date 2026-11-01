import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { RubricCriterion, ScoreEntry } from '../../types';
import { isTicked, subItemMode, subItemRange, subItemScore } from '../../utils/subItems';

/**
 * Read-only sub-item feedback for students: the statements the teacher ticked (checklist), or the
 * reached level's sub-items with their points (points mode).
 */
export default function SubItemFeedback({ criterion, entry }: { criterion: RubricCriterion; entry?: ScoreEntry }) {
    const { t } = useTranslation();
    if (!entry) return null;

    if (subItemMode(criterion) === 'checklist') {
        const ticked = criterion.levels.flatMap((level) =>
            level.subItems.filter((si) => isTicked(entry, si.id)).map((si) => ({ si, level }))
        );
        if (ticked.length === 0) return null;
        return (
            <ul
                aria-label={t('sharedFeedback.ticked_statements', { criterion: criterion.title })}
                style={{
                    listStyle: 'none',
                    margin: '6px 0 0',
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                }}
            >
                {ticked.map(({ si, level }) => (
                    <li key={si.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: '0.8rem' }}>
                        <Check
                            size={13}
                            aria-hidden="true"
                            style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent-text)' }}
                        />
                        <span>
                            {si.label}
                            {level.id !== entry.levelId && (
                                <span style={{ color: 'var(--text-muted)' }}> ({level.label})</span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>
        );
    }

    const level = criterion.levels.find((l) => l.id === entry.levelId);
    if (!level || level.subItems.length === 0) return null;
    return (
        <ul
            aria-label={t('sharedFeedback.sub_item_scores', { criterion: criterion.title })}
            style={{
                listStyle: 'none',
                margin: '6px 0 0',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
            }}
        >
            {level.subItems.map((si) => (
                <li key={si.id} style={{ display: 'flex', gap: 8, fontSize: '0.8rem' }}>
                    <span style={{ flex: 1 }}>{si.label}</span>
                    {/* An override replaces the sub-item scores, so they would not add up to the grade. */}
                    {entry.overridePoints === undefined && (
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {t('sharedFeedback.sub_item_points', {
                                score: subItemScore(entry, si) ?? 0,
                                max: subItemRange(si).max,
                            })}
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );
}
