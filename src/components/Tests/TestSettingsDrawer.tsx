import { useTranslation } from 'react-i18next';
import { AlertCircle, X } from 'lucide-react';
import Modal from '../ui/Modal';
import NormConfig from './ScoreSheet/NormConfig';
import TiptapEditor from '../Editor/TiptapEditor';
import type { Test, CefrLevel, CefrSkill, GradeScale } from '../../types';
import { CEFR_LEVELS, CEFR_SKILLS, CEFR_SKILL_LABELS } from '../../data/cefrDescriptors';

export type TestSettingsTab = 'basics' | 'delivery' | 'scoring' | 'placement' | 'print';

export const TEST_SETTINGS_TABS: { id: TestSettingsTab; labelKey: string }[] = [
    { id: 'basics', labelKey: 'tests.settings_tab_basics' },
    { id: 'delivery', labelKey: 'tests.settings_tab_delivery' },
    { id: 'scoring', labelKey: 'tests.settings_tab_scoring' },
    { id: 'placement', labelKey: 'tests.settings_tab_placement' },
    { id: 'print', labelKey: 'tests.settings_tab_print' },
];

/** Everything the drawer edits. The page owns it; the drawer only renders it and reports patches. */
export interface TestSettingsValues {
    mode: NonNullable<Test['mode']>;
    placementEngine: NonNullable<Test['placementEngine']>;
    contentArea: '' | 'listening' | 'reading' | 'grammar';
    contentLanguage: string;
    durationMinutes: string;
    dueDate: string;
    shuffleQuestions: boolean;
    requireSEB: boolean;
    allowMultipleAttempts: boolean;
    gradeScaleId?: string;
    norm: Pick<Test, 'gradingNorm' | 'gradeDecimals' | 'passGrade'>;
    cefrTargetLevel: CefrLevel | '';
    cefrSkill: CefrSkill | '';
    printHeader?: string;
    printIntro?: string;
    printFooter?: string;
}

interface Props {
    open: boolean;
    tab: TestSettingsTab;
    onTabChange: (tab: TestSettingsTab) => void;
    onClose: () => void;
    value: TestSettingsValues;
    onChange: (patch: Partial<TestSettingsValues>) => void;
    onNormChange: (patch: Partial<TestSettingsValues['norm']>) => void;
    gradeScales: GradeScale[];
    maxPoints: number;
    durationError?: string;
    readOnly?: boolean;
}

const labelClass = 'text-muted text-xs';

export default function TestSettingsDrawer({
    open,
    tab,
    onTabChange,
    onClose,
    value,
    onChange,
    onNormChange,
    gradeScales,
    maxPoints,
    durationError,
    readOnly = false,
}: Props) {
    const { t, i18n } = useTranslation();
    const panelId = (id: TestSettingsTab) => `test-settings-panel-${id}`;

    const pane = (id: TestSettingsTab, children: React.ReactNode) => (
        <div role="tabpanel" id={panelId(id)} aria-labelledby={`test-settings-tab-${id}`} hidden={tab !== id}>
            {children}
        </div>
    );

    const printField = (
        field: 'printHeader' | 'printIntro' | 'printFooter',
        labelKey: string,
        placeholderKey: string
    ) => (
        <div className="form-group" style={{ marginBottom: 0 }} data-testid={`settings-${field}`}>
            <label>{t(labelKey)}</label>
            <TiptapEditor
                content={value[field] ?? ''}
                onChange={(html) => onChange({ [field]: html === '<p></p>' ? undefined : html })}
                placeholder={t(placeholderKey)}
            />
        </div>
    );

    if (!open) return null;

    return (
        <Modal
            titleId="test-settings-title"
            onClose={onClose}
            className="modal-sheet"
            maxWidth={420}
            style={{ padding: 0 }}
        >
            <div
                data-testid="settings-drawer"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <h2 id="test-settings-title" style={{ margin: 0, fontSize: '0.95rem' }}>
                        {t('tests.settings_title')}
                    </h2>
                    <span className={`${labelClass}`} style={{ marginLeft: 'auto' }}>
                        {t('tests.settings_saved_with_test')}
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={onClose}
                        aria-label={t('tests.settings_close')}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div
                    role="tablist"
                    aria-label={t('tests.settings_title')}
                    style={{
                        display: 'flex',
                        gap: 4,
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--border)',
                        overflowX: 'auto',
                    }}
                >
                    {TEST_SETTINGS_TABS.map(({ id, labelKey }) => {
                        const active = tab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                id={`test-settings-tab-${id}`}
                                aria-selected={active}
                                aria-controls={panelId(id)}
                                tabIndex={active ? 0 : -1}
                                onClick={() => onTabChange(id)}
                                style={{
                                    padding: '5px 9px',
                                    borderRadius: 999,
                                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                                    background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
                                    color: 'var(--text)',
                                    font: 'inherit',
                                    fontSize: '0.8rem',
                                    fontWeight: active ? 600 : 400,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {t(labelKey)}
                            </button>
                        );
                    })}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 0' }}>
                    {readOnly && (
                        <p className="text-muted text-xs" style={{ marginTop: 0 }}>
                            {t('tests.settings_read_only')}
                        </p>
                    )}
                    <fieldset
                        disabled={readOnly}
                        style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'grid', gap: 14 }}
                    >
                        {pane(
                            'basics',
                            <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-mode">{t('tests.mode_label')}</label>
                                    <select
                                        id="test-mode"
                                        value={value.mode}
                                        onChange={(e) =>
                                            onChange({ mode: e.target.value as NonNullable<Test['mode']> })
                                        }
                                    >
                                        <option value="assessment">{t('tests.mode_assessment')}</option>
                                        <option value="practice">{t('tests.mode_practice')}</option>
                                        <option value="placement">{t('tests.mode_placement')}</option>
                                    </select>
                                    <p className={labelClass} style={{ marginTop: 4, marginBottom: 0 }}>
                                        {value.mode === 'practice'
                                            ? t('tests.mode_practice_help')
                                            : value.mode === 'placement'
                                              ? t('tests.mode_placement_help')
                                              : t('tests.mode_assessment_help')}
                                    </p>
                                </div>
                                {value.mode === 'practice' && (
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label htmlFor="test-content-area">{t('tests.content_area_label')}</label>
                                        <select
                                            id="test-content-area"
                                            value={value.contentArea}
                                            onChange={(e) =>
                                                onChange({
                                                    contentArea: e.target.value as TestSettingsValues['contentArea'],
                                                })
                                            }
                                        >
                                            <option value="">{t('tests.content_area_none')}</option>
                                            <option value="listening">{t('tests.content_area_listening')}</option>
                                            <option value="reading">{t('tests.content_area_reading')}</option>
                                            <option value="grammar">{t('tests.content_area_grammar')}</option>
                                        </select>
                                    </div>
                                )}
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-content-language">{t('tests.content_language_label')}</label>
                                    <select
                                        id="test-content-language"
                                        value={value.contentLanguage}
                                        onChange={(e) => onChange({ contentLanguage: e.target.value })}
                                    >
                                        <option value="">{t('tests.content_language_default')}</option>
                                        <option value="en">{t('settings.language_en')}</option>
                                        <option value="nl">{t('settings.language_nl')}</option>
                                        <option value="fr">{t('settings.language_fr')}</option>
                                        <option value="de">{t('settings.language_de')}</option>
                                        <option value="es">{t('settings.language_es')}</option>
                                    </select>
                                    <p className={labelClass} style={{ marginTop: 4, marginBottom: 0 }}>
                                        {t('tests.content_language_help')}
                                    </p>
                                </div>
                                <div className="grid-2" style={{ gap: 12 }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label htmlFor="test-cefr-level">{t('cefr.target_level_label')}</label>
                                        <select
                                            id="test-cefr-level"
                                            value={value.cefrTargetLevel}
                                            onChange={(e) =>
                                                onChange({ cefrTargetLevel: e.target.value as CefrLevel | '' })
                                            }
                                        >
                                            <option value="">{t('cefr.no_level')}</option>
                                            {CEFR_LEVELS.map((lvl) => (
                                                <option key={lvl} value={lvl}>
                                                    {lvl} – {t(`cefr.level_${lvl}`)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label htmlFor="test-cefr-skill">{t('cefr.skill_label')}</label>
                                        <select
                                            id="test-cefr-skill"
                                            value={value.cefrSkill}
                                            onChange={(e) => onChange({ cefrSkill: e.target.value as CefrSkill | '' })}
                                        >
                                            <option value="">{t('cefr.no_skill')}</option>
                                            {CEFR_SKILLS.map((skill) => (
                                                <option key={skill} value={skill}>
                                                    {
                                                        CEFR_SKILL_LABELS[skill][
                                                            i18n.language.startsWith('nl') ? 'nl' : 'en'
                                                        ]
                                                    }
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </>
                        )}

                        {pane(
                            'delivery',
                            <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-duration">{t('tests.duration_label')}</label>
                                    <input
                                        id="test-duration"
                                        type="number"
                                        min={1}
                                        value={value.durationMinutes}
                                        onChange={(e) => onChange({ durationMinutes: e.target.value })}
                                        aria-invalid={durationError ? true : undefined}
                                        aria-describedby={durationError ? 'test-duration-error' : undefined}
                                        placeholder={t('tests.duration_placeholder')}
                                    />
                                    {durationError && (
                                        <p
                                            id="test-duration-error"
                                            style={{ color: 'var(--red-text)', fontSize: '0.8rem', marginTop: 4 }}
                                        >
                                            <AlertCircle
                                                size={12}
                                                style={{ verticalAlign: 'middle', marginRight: 4 }}
                                            />
                                            {durationError}
                                        </p>
                                    )}
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-due-date">{t('tests.due_date_label')}</label>
                                    <input
                                        id="test-due-date"
                                        type="datetime-local"
                                        value={value.dueDate}
                                        onChange={(e) => onChange({ dueDate: e.target.value })}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            cursor: 'pointer',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={value.shuffleQuestions}
                                            onChange={(e) => onChange({ shuffleQuestions: e.target.checked })}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        {t('tests.shuffle_questions_label')}
                                    </label>
                                    <div>
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={value.requireSEB}
                                                onChange={(e) => onChange({ requireSEB: e.target.checked })}
                                                style={{ accentColor: 'var(--accent)' }}
                                            />
                                            {t('tests.require_seb_label')}
                                        </label>
                                        <p className={labelClass} style={{ marginTop: 4, marginBottom: 0 }}>
                                            {t('tests.require_seb_help')}
                                        </p>
                                    </div>
                                    {value.mode === 'practice' && (
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={value.allowMultipleAttempts}
                                                onChange={(e) => onChange({ allowMultipleAttempts: e.target.checked })}
                                                style={{ accentColor: 'var(--accent)' }}
                                            />
                                            {t('tests.allow_multiple_attempts_label')}
                                        </label>
                                    )}
                                </div>
                            </>
                        )}

                        {pane(
                            'scoring',
                            <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-grade-scale">{t('tests.grade_scale_label')}</label>
                                    <select
                                        id="test-grade-scale"
                                        value={value.gradeScaleId ?? ''}
                                        onChange={(e) => onChange({ gradeScaleId: e.target.value || undefined })}
                                    >
                                        <option value="">{t('tests.grade_scale_none')}</option>
                                        {gradeScales.map((gs) => (
                                            <option key={gs.id} value={gs.id}>
                                                {gs.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {value.mode !== 'placement' && (
                                    <fieldset
                                        style={{
                                            border: '1px solid var(--border)',
                                            borderRadius: 8,
                                            padding: '10px 12px',
                                            margin: 0,
                                        }}
                                    >
                                        <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 4px' }}>
                                            {t('tests.norm.section_title')}
                                        </legend>
                                        <NormConfig
                                            idPrefix="builder-norm"
                                            hideScaleSelect
                                            value={{ ...value.norm, gradeScaleId: value.gradeScaleId }}
                                            maxPoints={maxPoints}
                                            gradeScales={gradeScales}
                                            onChange={onNormChange}
                                        />
                                    </fieldset>
                                )}
                            </>
                        )}

                        {pane(
                            'placement',
                            <>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label htmlFor="test-placement-engine">{t('tests.placement_engine_label')}</label>
                                    <select
                                        id="test-placement-engine"
                                        value={value.placementEngine}
                                        onChange={(e) =>
                                            onChange({
                                                placementEngine: e.target.value as NonNullable<Test['placementEngine']>,
                                            })
                                        }
                                    >
                                        <option value="mst">{t('tests.placement_engine_mst')}</option>
                                        <option value="staircase">{t('tests.placement_engine_staircase')}</option>
                                        <option value="generator">{t('tests.placement_engine_generator')}</option>
                                    </select>
                                    <p className={labelClass} style={{ marginTop: 4, marginBottom: 0 }}>
                                        {value.placementEngine === 'staircase'
                                            ? t('tests.placement_engine_staircase_help')
                                            : value.placementEngine === 'generator'
                                              ? t('tests.placement_engine_generator_help')
                                              : t('tests.placement_engine_mst_help')}
                                    </p>
                                </div>
                                {value.mode !== 'placement' && (
                                    <p className="text-muted text-sm" style={{ margin: 0 }}>
                                        {t('tests.settings_placement_off')}{' '}
                                        <button
                                            type="button"
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => onChange({ mode: 'placement' })}
                                        >
                                            {t('tests.settings_placement_switch')}
                                        </button>
                                    </p>
                                )}
                            </>
                        )}

                        {pane(
                            'print',
                            <>
                                <p className={labelClass} style={{ margin: 0 }}>
                                    {t('tests.settings_print_note')}
                                </p>
                                {printField('printHeader', 'tests.a4_header_label', 'tests.a4_header_placeholder')}
                                {printField('printIntro', 'tests.a4_intro_label', 'tests.a4_intro_placeholder')}
                                {printField('printFooter', 'tests.a4_footer_label', 'tests.a4_footer_placeholder')}
                            </>
                        )}
                    </fieldset>
                </div>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 14px',
                        borderTop: '1px solid var(--border)',
                    }}
                >
                    <span className={labelClass}>{t('tests.settings_apply_on_save')}</span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        data-testid="settings-done"
                        onClick={onClose}
                        style={{ marginLeft: 'auto' }}
                    >
                        {t('tests.settings_done')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
