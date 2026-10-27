import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import StandardsPickerModal from './StandardsPickerModal';
import GrammarItemSelect from '../CEFR/GrammarItemSelect';
import { useFlashcards, useSettings } from '../../context/AppContext';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS, SCHOOL_YEAR_HAS_TRACK } from '../../data/schoolYears';
import { VO_TRACKS, VO_TRACK_LABELS } from '../../data/voTracks';
import { GRAMMAR_CATEGORIES, getGrammarItemById } from '../../data/grammarStandards';
import { CEFR_SKILL_LABELS, CEFR_SKILLS } from '../../data/cefrDescriptors';
import { CEFR_SUBLEVEL_LABELS, CEFR_SUBLEVEL_ORDER } from '../../utils/cefrOrdinal';
import type {
    CefrSkill,
    CefrSkillTarget,
    CefrSubLevel,
    GrammarMasteryTarget,
    LinkedStandard,
    MasteryTarget,
    MasteryTargetScope,
    NewMasteryTarget,
    SchoolYear,
    StandardMasteryTarget,
    VoTrack,
} from '../../types';

interface Props {
    existing?: MasteryTarget;
    onClose: () => void;
}

function scopeOf(target: MasteryTarget): MasteryTargetScope {
    return target.scope ?? 'standard';
}

function isStandardTarget(target: MasteryTarget): target is StandardMasteryTarget {
    return (target.scope ?? 'standard') === 'standard';
}

function isGrammarTarget(target: MasteryTarget): target is GrammarMasteryTarget {
    return target.scope === 'grammar';
}

function isCefrTarget(target: MasteryTarget): target is CefrSkillTarget {
    return target.scope === 'cefr';
}

/** Canonical (English) labels stored alongside a grammar target; the UI prefers live taxonomy labels. */
function grammarLabels(itemId: string): { itemLabel: string; categoryLabel: string } {
    const item = getGrammarItemById(itemId);
    const category = GRAMMAR_CATEGORIES.find((c) => c.items.some((i) => i.id === itemId));
    return {
        itemLabel: item?.labelEn ?? itemId,
        categoryLabel: category?.labelEn ?? '',
    };
}

/**
 * Add/edit modal for every scoped mastery target. Standard targets keep their legacy shape (no
 * `scope` field) so existing rows and backups stay valid; grammar and CEFR targets carry their scope
 * and their own goal fields. Changing a target's scope is only possible while creating — an existing
 * target's scope is fixed, since switching it would silently discard its goal fields.
 */
export default function StandardMasteryTargetModal({ existing, onClose }: Props) {
    const { t, i18n } = useTranslation();
    const { addStandardMasteryTarget, updateStandardMasteryTarget } = useFlashcards();
    const { settings } = useSettings();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const existingStandard = existing && isStandardTarget(existing) ? existing : undefined;
    const existingGrammar = existing && isGrammarTarget(existing) ? existing : undefined;
    const existingCefr = existing && isCefrTarget(existing) ? existing : undefined;
    const [scope, setScope] = useState<MasteryTargetScope>(existing ? scopeOf(existing) : 'standard');
    const [standard, setStandard] = useState<LinkedStandard | null>(
        existingStandard
            ? {
                  guid: existingStandard.standardGuid,
                  description: existingStandard.standardDescription,
                  standardSetTitle: existingStandard.standardSetTitle,
                  jurisdictionTitle: '',
              }
            : null
    );
    const [showPicker, setShowPicker] = useState(false);
    const [grammarItemId, setGrammarItemId] = useState(existingGrammar?.grammarItemId);
    const [cefrSkill, setCefrSkill] = useState<CefrSkill | ''>(existingCefr?.cefrSkill ?? '');
    const [targetLevel, setTargetLevel] = useState<CefrSubLevel | ''>(existingCefr?.targetLevel ?? '');
    const [year, setYear] = useState<SchoolYear | ''>(existing?.year ?? '');
    const [voTrack, setVoTrack] = useState<VoTrack | ''>(existing?.voTrack ?? '');
    const [targetPercentage, setTargetPercentage] = useState(
        existing && !isCefrTarget(existing) ? String(existing.targetPercentage) : ''
    );

    const yearHasTrack = year ? SCHOOL_YEAR_HAS_TRACK[year] : true;
    const pct = Number(targetPercentage);
    const pctValid = targetPercentage.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 100;
    const goalValid =
        scope === 'standard' ? !!standard : scope === 'grammar' ? !!grammarItemId : !!cefrSkill && !!targetLevel;
    const canSave = goalValid && !!year && (!yearHasTrack || !!voTrack) && (scope === 'cefr' || pctValid);

    function handleSave() {
        /* v8 ignore next -- the Save button is disabled unless canSave, which implies every field below */
        if (!canSave || !year) return;
        const shared = {
            year,
            /* v8 ignore next -- canSave requires voTrack whenever yearHasTrack is true */
            voTrack: yearHasTrack ? voTrack || undefined : undefined,
        };
        let payload: NewMasteryTarget;
        if (scope === 'standard') {
            /* v8 ignore next -- canSave requires a standard for standard-scope targets */
            if (!standard) return;
            payload = {
                standardGuid: standard.guid,
                standardDescription: standard.description,
                standardSetTitle: standard.standardSetTitle,
                ...shared,
                targetPercentage: pct,
            };
        } else if (scope === 'grammar') {
            /* v8 ignore next -- canSave requires an item for grammar-scope targets */
            if (!grammarItemId) return;
            const labels = grammarLabels(grammarItemId);
            payload = {
                scope: 'grammar',
                grammarItemId,
                grammarItemLabel: labels.itemLabel,
                grammarCategoryLabel: labels.categoryLabel,
                ...shared,
                targetPercentage: pct,
            };
        } else {
            /* v8 ignore next -- canSave requires a skill and level for CEFR-scope targets */
            if (!cefrSkill || !targetLevel) return;
            payload = { scope: 'cefr', cefrSkill, targetLevel, ...shared };
        }
        if (existing) {
            updateStandardMasteryTarget({ ...existing, ...payload } as MasteryTarget);
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
                        <label htmlFor="mastery-target-scope">{t('settings.mastery_target_scope_label')}</label>
                        <select
                            id="mastery-target-scope"
                            value={scope}
                            disabled={!!existing}
                            onChange={(e) => setScope(e.target.value as MasteryTargetScope)}
                        >
                            <option value="standard">{t('settings.mastery_target_scope_standard')}</option>
                            <option value="grammar">{t('settings.mastery_target_scope_grammar')}</option>
                            <option value="cefr">{t('settings.mastery_target_scope_cefr')}</option>
                        </select>
                    </div>

                    {scope === 'standard' && (
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
                    )}

                    {scope === 'grammar' && (
                        <div className="form-group">
                            <label htmlFor="mastery-target-grammar-item">
                                {t('settings.mastery_target_grammar_label')}
                            </label>
                            <GrammarItemSelect
                                id="mastery-target-grammar-item"
                                value={grammarItemId}
                                onChange={setGrammarItemId}
                            />
                            <div className="text-muted text-xs" style={{ marginTop: 6 }}>
                                {t('settings.mastery_target_grammar_help')}
                            </div>
                        </div>
                    )}

                    {scope === 'cefr' && (
                        <>
                            <div className="form-group">
                                <label htmlFor="mastery-target-cefr-skill">
                                    {t('settings.mastery_target_cefr_skill_label')}
                                </label>
                                <select
                                    id="mastery-target-cefr-skill"
                                    value={cefrSkill}
                                    onChange={(e) => setCefrSkill(e.target.value as CefrSkill | '')}
                                >
                                    <option value="">{t('settings.mastery_target_cefr_skill_none')}</option>
                                    {CEFR_SKILLS.map((skill) => (
                                        <option key={skill} value={skill}>
                                            {CEFR_SKILL_LABELS[skill][lang]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="mastery-target-cefr-level">
                                    {t('settings.mastery_target_cefr_level_label')}
                                </label>
                                <select
                                    id="mastery-target-cefr-level"
                                    value={targetLevel}
                                    onChange={(e) => setTargetLevel(e.target.value as CefrSubLevel | '')}
                                >
                                    <option value="">{t('settings.mastery_target_cefr_level_none')}</option>
                                    {CEFR_SUBLEVEL_ORDER.map((level) => (
                                        <option key={level} value={level}>
                                            {CEFR_SUBLEVEL_LABELS[level]}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-muted text-xs" style={{ marginTop: 6 }}>
                                    {t('settings.mastery_target_cefr_help')}
                                </div>
                            </div>
                        </>
                    )}

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

                    {scope !== 'cefr' && (
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
                    )}
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
