import { useTranslation } from 'react-i18next';
import { VO_TRACKS } from '../data/voTracks';
import type { Class } from '../types';
import type { CohortFilter as CohortFilterValue } from '../utils/cohortAggregator';

/** Year/track cohort filter, reused across RubricList, TestListPage, EssayListPage, and the Activity Dashboard (Phase 8.5). */
export default function CohortFilter({
    classes,
    value,
    onChange,
}: {
    classes: Class[];
    value: CohortFilterValue;
    onChange: (next: CohortFilterValue) => void;
}) {
    const { t } = useTranslation();
    const yearOptions = Array.from(new Set(classes.map((c) => c.year).filter((y): y is string => !!y))).sort();
    const hasTracks = classes.some((c) => c.voTrack);
    if (yearOptions.length === 0 && !hasTracks) return null;

    return (
        <>
            {yearOptions.length > 0 && (
                <select
                    value={value.year}
                    onChange={(e) => onChange({ ...value, year: e.target.value })}
                    aria-label={t('statistics.filters.year')}
                    style={{ minWidth: 110 }}
                >
                    <option value="all">{t('statistics.filters.year')}</option>
                    {yearOptions.map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>
            )}
            {hasTracks && (
                <select
                    value={value.voTrack}
                    onChange={(e) => onChange({ ...value, voTrack: e.target.value as CohortFilterValue['voTrack'] })}
                    aria-label={t('statistics.filters.track')}
                    style={{ minWidth: 130 }}
                >
                    <option value="all">{t('statistics.filters.track')}</option>
                    {VO_TRACKS.map((track) => (
                        <option key={track} value={track}>
                            {t('voTrack.' + track)}
                        </option>
                    ))}
                </select>
            )}
        </>
    );
}
