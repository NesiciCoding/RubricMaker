import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import StandardsPickerModal from './StandardsPickerModal';
import { useApp } from '../../context/AppContext';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS, SCHOOL_YEAR_HAS_TRACK } from '../../data/schoolYears';
import { VO_TRACKS, VO_TRACK_LABELS } from '../../data/voTracks';
import type { LinkedStandard, SchoolYear, VoTrack, StandardMasteryTarget } from '../../types';

interface Props {
    existing?: StandardMasteryTarget;
    onClose: () => void;
}

export default function StandardMasteryTargetModal({ existing, onClose }: Props) {
    const { t } = useTranslation();
    const { settings, addStandardMasteryTarget, updateStandardMasteryTarget } = useApp();

    const [standard, setStandard] = useState<LinkedStandard | null>(
        existing
            ? {
                  guid: existing.standardGuid,
                  description: existing.standardDescription,
                  standardSetTitle: existing.standardSetTitle,
                  jurisdictionTitle: '',
              }
            : null
    );
    const [showPicker, setShowPicker] = useState(false);
    const [year, setYear] = useState<SchoolYear | ''>(existing?.year ?? '');
    const [voTrack, setVoTrack] = useState<VoTrack | ''>(existing?.voTrack ?? '');
    const [targetPercentage, setTargetPercentage] = useState(existing ? String(existing.targetPercentage) : '');

    const yearHasTrack = year ? SCHOOL_YEAR_HAS_TRACK[year] : true;
    const pct = Number(targetPercentage);
    const canSave =
        !!standard && !!year && (!yearHasTrack || !!voTrack) && Number.isFinite(pct) && pct >= 0 && pct <= 100;

    function handleSave() {
        if (!canSave || !standard || !year) return;
        const payload = {
            standardGuid: standard.guid,
            standardDescription: standard.description,
            standardSetTitle: standard.standardSetTitle,
            year,
            voTrack: yearHasTrack ? voTrack || undefined : undefined,
            targetPercentage: pct,
        };
        if (existing) {
            updateStandardMasteryTarget({ ...existing, ...payload });
        } else {
            addStandardMasteryTarget(payload);
        }
        onClose();
    }

    return (
        <>
            <Modal titleId="mastery-target-title" onClose={onClose} maxWidth={480}>
                <div className="modal-header">
                    <h3 id="mastery-target-title">
                        {existing ? t('settings.mastery_target_edit_title') : t('settings.mastery_target_add_title')}
                    </h3>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label={t('common.close')}
                    >
                        ✕
                    </button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label>{t('settings.mastery_target_standard_label')}</label>
                        {standard ? (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 8,
                                    padding: '8px 10px',
                                    border: '1px solid var(--border)',
                                    borderRadius: 6,
                                }}
                            >
                                <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                    {standard.statementNotation && (
                                        <div style={{ fontWeight: 700 }}>{standard.statementNotation}</div>
                                    )}
                                    <div style={{ color: 'var(--text-muted)' }}>{standard.description}</div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setShowPicker(true)}
                                >
                                    {t('common.change')}
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowPicker(true)}
                                disabled={!settings.standardsApiKey}
                            >
                                {t('settings.mastery_target_choose_standard')}
                            </button>
                        )}
                        {!settings.standardsApiKey && (
                            <div className="text-muted text-xs" style={{ marginTop: 6 }}>
                                {t('settings.mastery_target_needs_api_key')}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="mastery-target-year">{t('studentsPage.form_school_year')}</label>
                        <select
                            id="mastery-target-year"
                            value={year}
                            onChange={(e) => {
                                setYear(e.target.value as SchoolYear | '');
                                setVoTrack('');
                            }}
                        >
                            <option value="">{t('studentsPage.form_school_year_none')}</option>
                            {SCHOOL_YEARS.map((y) => (
                                <option key={y} value={y}>
                                    {SCHOOL_YEAR_LABELS[y]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {yearHasTrack && (
                        <div className="form-group">
                            <label htmlFor="mastery-target-track">{t('voTrack.section_label')}</label>
                            <select
                                id="mastery-target-track"
                                value={voTrack}
                                onChange={(e) => setVoTrack(e.target.value as VoTrack | '')}
                            >
                                <option value="">{t('voTrack.no_track')}</option>
                                {VO_TRACKS.map((track) => (
                                    <option key={track} value={track}>
                                        {VO_TRACK_LABELS[track]}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="mastery-target-percentage">
                            {t('settings.mastery_target_percentage_label')}
                        </label>
                        <input
                            id="mastery-target-percentage"
                            type="number"
                            min={0}
                            max={100}
                            value={targetPercentage}
                            onChange={(e) => setTargetPercentage(e.target.value)}
                        />
                    </div>
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={!canSave} onClick={handleSave}>
                        {t('common.save')}
                    </button>
                </div>
            </Modal>

            {showPicker && settings.standardsApiKey && (
                <StandardsPickerModal
                    apiKey={settings.standardsApiKey}
                    onSelect={(std) => {
                        setStandard(std);
                        setShowPicker(false);
                    }}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </>
    );
}
