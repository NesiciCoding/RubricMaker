import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { STATS_SECTIONS, isSectionVisible, toggleSection, type StatsView } from '../../utils/statsSections';

interface Props {
    hiddenSections: string[] | undefined;
    includeTestsInTrends: boolean;
    onChange: (patch: { statisticsHiddenSections?: string[]; statisticsTrendIncludeTests?: boolean }) => void;
    onClose: () => void;
}

const CHECK_LABEL_STYLE: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    textTransform: 'none',
    letterSpacing: 'normal',
    color: 'var(--text)',
    fontWeight: 400,
};

const VIEW_LABEL_KEYS: Record<StatsView, string> = {
    rubric: 'statistics.view_by_rubric',
    student: 'statistics.view_by_student',
    compare: 'statistics.view_compare',
};

/** Lets the teacher choose which Statistics cards are shown, per view; choices persist in settings. */
export default function StatsCustomizeModal({ hiddenSections, includeTestsInTrends, onChange, onClose }: Props) {
    const { t } = useTranslation();
    const views: StatsView[] = ['rubric', 'student', 'compare'];

    return (
        <Modal
            titleId="stats-customize-title"
            onClose={onClose}
            maxWidth={560}
            style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}
        >
            <div className="modal-header">
                <h3 id="stats-customize-title">{t('statistics.customize.title')}</h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={onClose}
                    aria-label={t('common.close')}
                >
                    <X size={18} />
                </button>
            </div>
            <div
                className="modal-body"
                style={{ display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}
            >
                <p className="text-muted text-sm" style={{ margin: 0 }}>
                    {t('statistics.customize.intro')}
                </p>

                <label style={{ ...CHECK_LABEL_STYLE, fontSize: '0.9rem' }}>
                    <input
                        type="checkbox"
                        checked={includeTestsInTrends}
                        onChange={(e) => onChange({ statisticsTrendIncludeTests: e.target.checked })}
                    />
                    {t('statistics.customize.include_tests')}
                </label>

                {views.map((view) => (
                    <fieldset key={view} style={{ border: 'none', padding: 0, margin: 0 }}>
                        <legend style={{ fontWeight: 600, marginBottom: 8 }}>{t(VIEW_LABEL_KEYS[view])}</legend>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 6,
                            }}
                        >
                            {STATS_SECTIONS.filter((s) => s.view === view).map((section) => (
                                <label key={section.id} style={{ ...CHECK_LABEL_STYLE, fontSize: '0.88rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSectionVisible(hiddenSections, section.id)}
                                        onChange={() =>
                                            onChange({
                                                statisticsHiddenSections: toggleSection(hiddenSections, section.id),
                                            })
                                        }
                                    />
                                    {t(section.titleKey)}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onChange({ statisticsHiddenSections: [], statisticsTrendIncludeTests: true })}
                >
                    {t('statistics.customize.reset')}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                    {t('statistics.customize.done')}
                </button>
            </div>
        </Modal>
    );
}
