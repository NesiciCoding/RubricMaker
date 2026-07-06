import { useTranslation } from 'react-i18next';
import { VO_TRACKS } from '../data/voTracks';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS } from '../data/schoolYears';
import type { Class, CohortFilter as CohortFilterValue } from '../types';

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
    const yearOptions = SCHOOL_YEARS.filter((y) => classes.some((c) => c.year === y));
    const hasTracks = classes.some((c) => c.voTrack);
    if (yearOptions.length === 0 && !hasTracks) return null;

    return (
        <>
            {yearOptions.length > 0 && (
                <select
                    value={value.year}
                    onChange={(e) => onChange({ ...value, year: e.target.value as CohortFilterValue['year'] })}
                    aria-label={t('statistics.filters.year')}
                    style={{ minWidth: 110 }}
                >
                    <option value="all">{t('statistics.filters.year')}</option>
                    {yearOptions.map((y) => (
                        <option key={y} value={y}>
                            {SCHOOL_YEAR_LABELS[y]}
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
